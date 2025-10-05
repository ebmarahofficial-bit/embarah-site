class GameScene extends Phaser.Scene{
  constructor(){ super('GameScene'); }
  init(){
    this.tileSize = 16;
    this.speed = 75; // px/s
    this.powerTime = 7; // seconds
    this.score = 0;
    this.lives = 3;
    this.paused = false;
  }
  create(){
    // Load map data (simple custom format)
    this.mapData = this.cache.json.get('level1');
    const rows = this.mapData.data.length;
    const cols = this.mapData.data[0].length;
    // build walls layer from tileset image by drawing rectangles
    this.wallLayer = this.add.layer();
    this.pathLayer = this.add.layer();
    // groups
    this.usbs = this.physics.add.staticGroup();
    this.powerups = this.physics.add.staticGroup();
    this.wooks = this.physics.add.group();
    // spawn positions
    let spawnG = {x:1,y:1};
    let spawnW = [];
    for(let y=0;y<rows;y++){
      for(let x=0;x<cols;x++){
        const t = this.mapData.data[y][x];
        const px = x*this.tileSize + this.tileSize/2;
        const py = y*this.tileSize + this.tileSize/2;
        if(t===1){ // wall
          const r = this.add.rectangle(px,py,this.tileSize,this.tileSize,0x0c221b).setStrokeStyle(1,0x1e3a2f,1);
          this.wallLayer.add(r);
        }else{
          const r = this.add.rectangle(px,py,this.tileSize,this.tileSize,0x07120e,1).setStrokeStyle(1,0x0e1f19,0.6);
          this.pathLayer.add(r);
          if(t===2){ // USB
            this.usbs.add(this.add.image(px,py,'usb'));
          }else if(t===3){ // Shower head power
            this.powerups.add(this.add.image(px,py,'shower'));
          }else if(t===8){ // Gorilla spawn
            spawnG = {x, y};
          }else if(t===9){ // Wook spawn(s)
            spawnW.push({x,y});
          }
        }
      }
    }
    // player
    this.player = this.physics.add.sprite(spawnG.x*this.tileSize + 8, spawnG.y*this.tileSize + 8, 'gorilla').play('g_walk');
    this.player.setSize(12,12).setOffset(2,2);
    this.cursors = this.input.keyboard.createCursorKeys();
    this.nextDir = null;

    // wooks (2 basic for starter)
    spawnW.slice(0,2).forEach(s=>{
      const w = this.physics.add.sprite(s.x*this.tileSize+8, s.y*this.tileSize+8, 'wook').play('w_walk');
      w.setData('state','chase');
      w.setData('speed', 60);
      this.wooks.add(w);
    });

    // Colliders
    this.physics.add.overlap(this.player, this.usbs, (pl,usb)=>{ usb.destroy(); this.score+=10; this.events.emit('score', this.score); }, null, this);
    this.physics.add.overlap(this.player, this.powerups, (pl,p)=>{
      p.destroy(); this.enterPower();
    }, null, this);
    this.physics.add.overlap(this.player, this.wooks, (pl,w)=>{
      if(w.getData('state')==='fright'){
        // clean it!
        w.setTexture('eyes').setData('state','eyes');
        w.setVelocity(0,0);
        // send back to nearest spawn tile (first in list)
        const s = spawnW[0] || {x:1,y:1};
        this.tweens.add({ targets:w, x:s.x*this.tileSize+8, y:s.y*this.tileSize+8, duration:500, onComplete:()=>{
          w.setTexture('wook').play('w_walk').setData('state','chase');
        }});
        this.score += 200;
        this.events.emit('score', this.score);
      }else if(w.getData('state')!=='eyes'){
        this.loseLife();
      }
    }, null, this);

    // Input (mobile swipe)
    this.input.on('pointerup', (p)=>{
      // simple swipe detector
      const dx = p.upX - p.downX, dy = p.upY - p.downY;
      if(Math.abs(dx)>Math.abs(dy)){
        this.nextDir = dx>0?'right':'left';
      }else{
        this.nextDir = dy>0?'down':'up';
      }
    });
  }
  togglePause(){
    this.paused = !this.paused;
    this.physics.world.isPaused = this.paused;
    this.scene.get('UIScene').events.emit('pause', this.paused);
  }
  loseLife(){
    this.lives--;
    this.events.emit('lives', this.lives);
    if(this.lives<=0){
      this.scene.restart();
      this.score = 0; this.events.emit('score', this.score); this.lives = 3; this.events.emit('lives', this.lives);
      return;
    }
    this.player.setPosition(8+16,8+16);
  }
  enterPower(){
    this.powerUntil = this.time.now + this.powerTime*1000;
    this.wooks.children.iterate(w=>{
      if(!w) return;
      if(w.getData('state')!=='eyes'){
        w.setData('state','fright'); w.setTexture('wook_fright').play('w_fright');
      }
    });
  }
  update(time, delta){
    if(this.paused) return;
    const s = this.speed;
    // buffered input
    if(this.cursors.left.isDown) this.nextDir='left';
    else if(this.cursors.right.isDown) this.nextDir='right';
    else if(this.cursors.up.isDown) this.nextDir='up';
    else if(this.cursors.down.isDown) this.nextDir='down';

    // move on grid (simple continuous with checks)
    const tryMove = (vx,vy)=>{
      this.player.setVelocity(vx,vy);
    };
    if(this.nextDir==='left')  tryMove(-s,0);
    if(this.nextDir==='right') tryMove(s,0);
    if(this.nextDir==='up')    tryMove(0,-s);
    if(this.nextDir==='down')  tryMove(0,s);

    // clamp to inside bounds
    const w = this.mapData.data[0].length*this.tileSize;
    const h = self = this.mapData.data.length*this.tileSize;
    this.player.x = Phaser.Math.Clamp(this.player.x, 8, w-8);
    this.player.y = Phaser.Math.Clamp(this.player.y, 8, h-8);

    // end power?
    if(this.powerUntil && time>this.powerUntil){
      this.wooks.children.iterate(w=>{
        if(!w) return;
        if(w.getData('state')==='fright'){
          w.setData('state','chase'); w.setTexture('wook').play('w_walk');
        }
      });
      this.powerUntil = null;
    }

    // rudimentary wook AI: chase player if in normal state; flee if frightened
    this.wooks.children.iterate(w=>{
      if(!w) return;
      const speed = w.getData('state')==='fright' ? 50 : 60;
      const dx = this.player.x - w.x;
      const dy = this.player.y - w.y;
      if(w.getData('state')==='fright'){
        // move away
        w.setVelocity( -Math.sign(dx)*speed, -Math.sign(dy)*speed );
      }else if(w.getData('state')==='chase'){
        w.setVelocity( Math.sign(dx)*speed, Math.sign(dy)*speed );
      }else if(w.getData('state')==='eyes'){
        // tween handles return; keep stopped
        w.setVelocity(0,0);
      }
    });
  }
}