class GameScene extends Phaser.Scene{
  constructor(){ super('GameScene'); }
  init(){
    this.T = 16;               // tile size (px)
    this.speed = 60;           // player speed
    this.powerTime = 7;        // seconds
    this.score = 0;
    this.lives = 3;
    this.paused = false;
  }

  // ---------- grid helpers ----------
  tv(x,y){ return [Math.floor(x/this.T), Math.floor(y/this.T)]; }
  center(tx,ty){ return [tx*this.T + 8, ty*this.T + 8]; }
  dirVec(d){ return d==='left' ? [-1,0] : d==='right' ? [1,0] : d==='up' ? [0,-1] : [0,1]; }
  atCenter(s){ const e=3; return Math.abs((s.x%this.T)-8)<=e && Math.abs((s.y%this.T)-8)<=e; }
  passable(tx,ty){ return !(ty<0||ty>=this.rows||tx<0||tx>=this.cols) && this.map.data[ty][tx]!==1; } // 1 = wall
  canGo(tx,ty,dir){ const [dx,dy]=this.dirVec(dir); return this.passable(tx+dx,ty+dy); }
  firstOpen(tx,ty,list){ for(const d of list){ if(this.canGo(tx,ty,d)) return d; } return null; }

  create(){
    // Capture arrows & WASD for Phaser
    this.input.keyboard.addCapture([
      Phaser.Input.Keyboard.KeyCodes.LEFT, Phaser.Input.Keyboard.KeyCodes.RIGHT,
      Phaser.Input.Keyboard.KeyCodes.UP,   Phaser.Input.Keyboard.KeyCodes.DOWN,
      Phaser.Input.Keyboard.KeyCodes.W,    Phaser.Input.Keyboard.KeyCodes.A,
      Phaser.Input.Keyboard.KeyCodes.S,    Phaser.Input.Keyboard.KeyCodes.D
    ]);

    // Load map
    this.map = this.cache.json.get('level1');
    this.rows = this.map.data.length;
    this.cols = this.map.data[0].length;

    // Layers & groups
    this.pathL = this.add.layer();
    this.wallL = this.add.layer();
    this.usbs = this.physics.add.staticGroup();
    this.powerups = this.physics.add.staticGroup();
    this.wooks = this.physics.add.group();

    // Build board (visual tiles only; NO physics colliders for walls)
    let spawnG = {x:1,y:1}; const spawnW = [];
    for(let y=0;y<this.rows;y++){
      for(let x=0;x<this.cols;x++){
        const t = this.map.data[y][x];
        const px = x*this.T + 8, py = y*this.T + 8;
        if(t===1){
          // Fill-only wall (no stroke to avoid half-pixel gaps)
          this.wallL.add(this.add.rectangle(px,py,16,16,0x0c221b).setOrigin(0.5));
        }else{
          this.pathL.add(this.add.rectangle(px,py,16,16,0x07120e).setOrigin(0.5));
          if(t===2) this.usbs.add(this.add.image(px,py,'usb').setOrigin(0.5).setDisplaySize(8,8));
          if(t===3) this.powerups.add(this.add.image(px,py,'shower').setOrigin(0.5).setDisplaySize(12,12));
          if(t===8) spawnG = {x,y};
          if(t===9) spawnW.push({x,y});
        }
      }
    }

    // Pixel-perfect grid overlay (1px lines aligned on .5)
    const g = this.add.graphics(); g.lineStyle(1, 0x1e3a2f, 1);
    const W = this.cols*this.T, H = this.rows*this.T;
    for (let x=0; x<=this.cols; x++){ const vx = x*this.T + 0.5; g.beginPath(); g.moveTo(vx,0.5); g.lineTo(vx,H+0.5); g.strokePath(); }
    for (let y=0; y<=this.rows; y++){ const vy = y*this.T + 0.5; g.beginPath(); g.moveTo(0.5,vy); g.lineTo(W+0.5,vy); g.strokePath(); }

    // Player
    const [sx,sy] = this.center(spawnG.x, spawnG.y);
    this.player = this.physics.add.sprite(sx, sy, 'gorilla').play('g_walk');
    this.player.setSize(12,12).setOffset(2,2);
    this.currentDir = 'right';
    this.nextDir    = 'right';

    // Input (arrows/WASD + swipe)
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D');
    this.input.on('pointerup', p=>{
      const dx=p.upX-p.downX, dy=p.upY-p.downY;
      this.nextDir = Math.abs(dx)>Math.abs(dy) ? (dx>0?'right':'left') : (dy>0?'down':'up');
    });

    // Wooks (axis-only chase, slower)
    spawnW.slice(0,3).forEach(s=>{
      const [wx,wy]=this.center(s.x,s.y);
      const w = this.physics.add.sprite(wx,wy,'wook').play('w_walk');
      w.setData({state:'chase', dir:'left', baseSpeed:44});
      w.setMaxVelocity(56,56);
      this.wooks.add(w);
    });

    // Overlaps
    this.physics.add.overlap(this.player, this.usbs, (pl,usb)=>{ usb.destroy(); this.addScore(10); });
    this.physics.add.overlap(this.player, this.powerups, (pl,p)=>{ p.destroy(); this.enterPower(); });
    this.physics.add.overlap(this.player, this.wooks, (pl,w)=>{
      if(w.getData('state')==='fright'){
        w.setTexture('eyes').setData('state','eyes'); w.setVelocity(0,0);
        const s = spawnW[0]||{x:1,y:1}; const [rx,ry]=this.center(s.x,s.y);
        this.tweens.add({targets:w,x:rx,y:ry,duration:500,onComplete:()=>{ w.setTexture('wook').play('w_walk').setData({state:'chase',dir:'left'}); }});
        this.addScore(200);
      }else if(w.getData('state')!=='eyes'){ this.loseLife(); }
    });

    // HUD (DOM)
    this.scoreEl = document.getElementById('scoreEl');
    this.livesEl = document.getElementById('livesEl');
    this.updateHUD();

    // Start moving immediately in any open direction (spawn-safe)
    const [tx,ty]=this.tv(this.player.x,this.player.y);
    const start = this.firstOpen(tx,ty,[this.nextDir,this.currentDir,'right','left','up','down']);
    if(start){ this.currentDir = this.nextDir = start; const [vx,vy]=this.dirVec(start); this.player.setVelocity(vx*this.speed, vy*this.speed); }
  }

  // ----- HUD & flow -----
  addScore(v){ this.score+=v; this.updateHUD(); }
  updateHUD(){ if(this.scoreEl) this.scoreEl.textContent=`Score: ${this.score}`; if(this.livesEl) this.livesEl.textContent='♥'.repeat(this.lives); }
  togglePause(){ this.paused=!this.paused; this.physics.world.isPaused=this.paused; }
  loseLife(){
    this.lives--; this.updateHUD();
    if(this.lives<=0){ this.scene.restart(); this.score=0; this.lives=3; this.updateHUD(); return; }
    const [cx,cy]=this.center(2,2); this.player.setPosition(cx,cy); this.currentDir='left'; this.nextDir='left';
  }
  enterPower(){
    this.powerUntil=this.time.now+this.powerTime*1000;
    this.wooks.children.iterate(w=>{ if(w&&w.getData('state')!=='eyes'){ w.setData('state','fright'); w.setTexture('wook_fright').play('w_fright'); }});
  }

  // ----- main update (pure grid navigation) -----
  update(){
    if(this.paused) return;

    // Inputs
    if (this.cursors.left.isDown || this.keys.A.isDown)  this.nextDir='left';
    if (this.cursors.right.isDown || this.keys.D.isDown) this.nextDir='right';
    if (this.cursors.up.isDown || this.keys.W.isDown)    this.nextDir='up';
    if (this.cursors.down.isDown || this.keys.S.isDown)  this.nextDir='down';

    const [tx,ty]=this.tv(this.player.x,this.player.y);

    // If blocked, immediately pick an open dir (no perfect-centering required)
    if(!this.canGo(tx,ty,this.currentDir)){
      const fallback = this.firstOpen(tx,ty,[this.nextDir,'right','left','up','down']);
      if(fallback) this.currentDir=fallback;
    }

    // Turn at centers if possible
    if(this.atCenter(this.player) && this.canGo(tx,ty,this.nextDir)){
      const [cx,cy]=this.center(tx,ty); this.player.setPosition(cx,cy);
      this.currentDir = this.nextDir;
    }

    // Move or stop
    if(this.canGo(tx,ty,this.currentDir)){
      const [vx,vy]=this.dirVec(this.currentDir);
      this.player.setVelocity(vx*this.speed, vy*this.speed);
    }else{
      this.player.setVelocity(0,0);
    }

    // power timer
    if(this.powerUntil && this.time.now>this.powerUntil){
      this.wooks.children.iterate(w=>{ if(w&&w.getData('state')==='fright'){ w.setData('state','chase'); w.setTexture('wook').play('w_walk'); }});
      this.powerUntil=null;
    }

    // enemy AI (axis grid)
    this.wooks.children.iterate(w=>{
      if(!w) return;
      if(w.getData('state')==='eyes'){ w.setVelocity(0,0); return; }
      const frightened = w.getData('state')==='fright';
      const speed = frightened ? 34 : w.getData('baseSpeed');

      const [wx,wy]=this.tv(w.x,w.y);
      if(this.atCenter(w)){
        const [cx,cy]=this.center(wx,wy); w.setPosition(cx,cy);
        const dx=this.player.x-w.x, dy=this.player.y-w.y;
        let want = Math.abs(dx)>Math.abs(dy) ? (dx>0?'right':'left') : (dy>0?'down':'up');
        if(frightened){ want = want==='left'?'right':want==='right'?'left':want==='up'?'down':'up'; }
        let dir = this.canGo(wx,wy,want) ? want : this.firstOpen(wx,wy,['up','right','down','left']);
        if(dir) w.setData('dir', dir);
      }
      const dir=w.getData('dir')||'left'; const [vx,vy]=this.dirVec(dir);
      w.setVelocity(vx*speed, vy*speed);
    });
  }
}
