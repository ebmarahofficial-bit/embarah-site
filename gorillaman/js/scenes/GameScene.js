class GameScene extends Phaser.Scene{
  constructor(){ super('GameScene'); }
  init(){
    this.T = 16;                  // tile size
    this.speed = 60;              // player speed
    this.powerTime = 7;           // seconds
    this.score = 0;
    this.lives = 3;
    this.paused = false;
  }

  // ---------- grid helpers ----------
  tv(x, y){ return [Math.floor(x/this.T), Math.floor(y/this.T)]; }
  center(tx, ty){ return [tx*this.T + 8, ty*this.T + 8]; }
  dirVec(d){ return d==='left' ? [-1,0] : d==='right' ? [1,0] : d==='up' ? [0,-1] : [0,1]; }
  atCenter(s){
    const ex = Math.abs((s.x % this.T) - 8) <= 2;
    const ey = Math.abs((s.y % this.T) - 8) <= 2;
    return ex && ey;
  }
  passable(tx, ty){
    if(ty<0||ty>=this.rows||tx<0||tx>=this.cols) return false;
    return this.map.data[ty][tx] !== 1; // 1 = wall
  }
  canGo(tx, ty, dir){
    const [dx,dy] = this.dirVec(dir);
    return this.passable(tx+dx, ty+dy);
  }

  create(){
    // Capture arrows so the page doesn't steal them
    this.input.keyboard.addCapture([
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
      Phaser.Input.Keyboard.KeyCodes.UP,
      Phaser.Input.Keyboard.KeyCodes.DOWN
    ]);

    // Map + layers
    this.map = this.cache.json.get('level1');
    this.rows = this.map.data.length;
    this.cols = this.map.data[0].length;

    this.pathL = this.add.layer();
    this.wallL = this.add.layer();

    // Collectibles (physics so overlaps work)
    this.usbs = this.physics.add.staticGroup();
    this.powerups = this.physics.add.staticGroup();

    // Enemies
    this.wooks = this.physics.add.group();

    // Spawns
    let spawnG = {x:1,y:1};
    const spawnW = [];

    // Build board (visual walls only; NO physics blockers)
    for(let y=0;y<this.rows;y++){
      for(let x=0;x<this.cols;x++){
        const t = this.map.data[y][x];
        const px = x*this.T + 8, py = y*this.T + 8;

        if(t===1){
          this.wallL.add(this.add.rectangle(px,py,16,16,0x0c221b).setStrokeStyle(1,0x1e3a2f,1));
        }else{
          this.pathL.add(this.add.rectangle(px,py,16,16,0x07120e,1).setStrokeStyle(1,0x0e1f19,0.6));
          if(t===2){
            this.usbs.add(this.add.image(px,py,'usb').setOrigin(0.5).setDisplaySize(8,8));
          }else if(t===3){
            this.powerups.add(this.add.image(px,py,'shower').setOrigin(0.5).setDisplaySize(12,12));
          }else if(t===8){ spawnG = {x,y}; }
          else if(t===9){ spawnW.push({x,y}); }
        }
      }
    }

    // Player
    const [sx,sy] = this.center(spawnG.x, spawnG.y);
    this.player = this.physics.add.sprite(sx, sy, 'gorilla').play('g_walk');
    this.player.setSize(12,12).setOffset(2,2);
    this.currentDir = 'right';
    this.nextDir = 'right';

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.input.on('pointerup', p=>{
      const dx = p.upX - p.downX, dy = p.upY - p.downY;
      this.nextDir = Math.abs(dx)>Math.abs(dy) ? (dx>0?'right':'left') : (dy>0?'down':'up');
    });

    // Wooks
    spawnW.slice(0,3).forEach(s=>{
      const [wx,wy] = this.center(s.x,s.y);
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
  }

  // ----- HUD & flow -----
  addScore(v){ this.score += v; this.updateHUD(); }
  updateHUD(){ this.scoreEl && (this.scoreEl.textContent = `Score: ${this.score}`); this.livesEl && (this.livesEl.textContent = '♥'.repeat(this.lives)); }
  togglePause(){ this.paused = !this.paused; this.physics.world.isPaused = this.paused; }
  loseLife(){
    this.lives--; this.updateHUD();
    if(this.lives<=0){ this.scene.restart(); this.score=0; this.lives=3; this.updateHUD(); return; }
    const [cx,cy]=this.center(2,2); this.player.setPosition(cx,cy); this.currentDir='left'; this.nextDir='left';
  }
  enterPower(){
    this.powerUntil = this.time.now + this.powerTime*1000;
    this.wooks.children.iterate(w=>{ if(w && w.getData('state')!=='eyes'){ w.setData('state','fright'); w.setTexture('wook_fright').play('w_fright'); } });
  }

  // ----- main update (pure grid navigation; no physics wall collisions) -----
  update(){
    if(this.paused) return;

    // read arrows
    if(this.cursors.left.isDown)  this.nextDir='left';
    if(this.cursors.right.isDown) this.nextDir='right';
    if(this.cursors.up.isDown)    this.nextDir='up';
    if(this.cursors.down.isDown)  this.nextDir='down';

    // player movement
    let [ptx,pty] = this.tv(this.player.x, this.player.y);

    if(this.atCenter(this.player)){
      // snap to perfect center
      const [cx,cy]=this.center(ptx,pty);
      this.player.setPosition(cx,cy);

      // turn if allowed
      if(this.canGo(ptx,pty,this.nextDir)) this.currentDir=this.nextDir;

      // if blocked ahead, stop
      if(!this.canGo(ptx,pty,this.currentDir)){
        this.player.setVelocity(0,0);
      }else{
        const [vx,vy]=this.dirVec(this.currentDir);
        this.player.setVelocity(vx*this.speed, vy*this.speed);
      }
    }else{
      const [vx,vy]=this.dirVec(this.currentDir);
      this.player.setVelocity(vx*this.speed, vy*this.speed);
    }

    // power timer
    if(this.powerUntil && this.time.now>this.powerUntil){
      this.wooks.children.iterate(w=>{ if(w && w.getData('state')==='fright'){ w.setData('state','chase'); w.setTexture('wook').play('w_walk'); } });
      this.powerUntil=null;
    }

    // wook AI (axis-only, grid-locked)
    this.wooks.children.iterate(w=>{
      if(!w) return;
      const frightened = w.getData('state')==='fright';
      if(w.getData('state')==='eyes'){ w.setVelocity(0,0); return; }

      let [tx,ty]=this.tv(w.x,w.y);
      if(this.atCenter(w)){
        const [cx,cy]=this.center(tx,ty);
        w.setPosition(cx,cy);

        // choose dir toward/far from player (passable only)
        const dx=this.player.x-w.x, dy=this.player.y-w.y;
        let wanted = Math.abs(dx)>Math.abs(dy) ? (dx>0?'right':'left') : (dy>0?'down':'up');
        if(frightened){ wanted = wanted==='left'?'right':wanted==='right'?'left':wanted==='up'?'down':'up'; }

        let dir = this.canGo(tx,ty,wanted) ? wanted : null;
        if(!dir){
          for(const d of ['up','right','down','left']){
            if(this.canGo(tx,ty,d)){ dir=d; break; }
          }
        }
        if(dir) w.setData('dir', dir);
      }

      const dir = w.getData('dir') || 'left';
      const [vx,vy]=this.dirVec(dir);
      const speed = frightened ? 34 : w.getData('baseSpeed');
      w.setVelocity(vx*speed, vy*speed);
    });
  }
}
