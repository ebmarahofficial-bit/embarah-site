class GameScene extends Phaser.Scene{
  constructor(){ super('GameScene'); }
  init(){
    this.tileSize = 16;
    this.speed = 60;          // player speed
    this.powerTime = 7;       // seconds
    this.score = 0;
    this.lives = 3;
    this.paused = false;
  }

  create(){
    // --- Map & layers ---
    this.mapData = this.cache.json.get('level1');
    const rows = this.mapData.data.length;
    const cols = this.mapData.data[0].length;

    this.pathLayer = this.add.layer();
    this.wallVisLayer = this.add.layer();

    // Physics walls (invisible bodies)
    this.walls = this.physics.add.staticGroup();

    // Collectible groups
    this.usbs = this.physics.add.staticGroup();
    this.powerups = this.physics.add.staticGroup();

    // Enemy group
    this.wooks = this.physics.add.group();

    // Spawns
    let spawnG = {x:1,y:1};
    let spawnW = [];

    for(let y=0;y<rows;y++){
      for(let x=0;x<cols;x++){
        const t = this.mapData.data[y][x];
        const px = x*this.tileSize + this.tileSize/2;
        const py = y*this.tileSize + this.tileSize/2;

        if(t===1){ // wall
          // draw a tile for looks
          const r = this.add.rectangle(px,py,this.tileSize,this.tileSize,0x0c221b).setStrokeStyle(1,0x1e3a2f,1);
          this.wallVisLayer.add(r);
          // add an invisible static body for collision
          const blocker = this.add.zone(px, py, this.tileSize, this.tileSize);
          this.physics.add.existing(blocker, true);
          this.walls.add(blocker);
        }else{
          const r = this.add.rectangle(px,py,this.tileSize,this.tileSize,0x07120e,1).setStrokeStyle(1,0x0e1f19,0.6);
          this.pathLayer.add(r);

          if(t===2){ // USB (smaller than a tile)
            const usb = this.add.image(px,py,'usb').setOrigin(0.5).setDisplaySize(8,8);
            this.usbs.add(usb);
          }else if(t===3){ // Shower head (power)
            const sh = this.add.image(px,py,'shower').setOrigin(0.5).setDisplaySize(12,12);
            this.powerups.add(sh);
          }else if(t===8){ // Gorilla spawn
            spawnG = {x, y};
          }else if(t===9){ // Wook spawn(s)
            spawnW.push({x,y});
          }
        }
      }
    }

    // --- Player ---
    this.player = this.physics.add.sprite(spawnG.x*this.tileSize + 8, spawnG.y*this.tileSize + 8, 'gorilla').play('g_walk');
    this.player.setSize(12,12).setOffset(2,2).setCollideWorldBounds(true);
    this.cursors = this.input.keyboard.createCursorKeys();
    this.currentDir = 'right';
    this.nextDir = 'right';

    // --- Enemies (slower, axis-only movement) ---
    spawnW.slice(0,2).forEach(s=>{
      const w = this.physics.add.sprite(s.x*this.tileSize+8, s.y*this.tileSize+8, 'wook').play('w_walk');
      w.setData('state','chase');
      w.setData('baseSpeed', 45);
      w.setMaxVelocity(60,60);
      this.wooks.add(w);
    });

    // --- Colliders ---
    this.physics.add.collider(this.player, this.walls);
    this.physics.add.collider(this.wooks, this.walls);

    this.physics.add.overlap(this.player, this.usbs, (pl,usb)=>{
      usb.destroy(); this.score+=10; this.events.emit('score', this.score);
    });

    this.physics.add.overlap(this.player, this.powerups, (pl,p)=>{
      p.destroy(); this.enterPower();
    });

    this.physics.add.overlap(this.player, this.wooks, (pl,w)=>{
      if(w.getData('state')==='fright'){
        w.setTexture('eyes').setData('state','eyes');
        w.setVelocity(0,0);
        const s = spawnW[0] || {x:1,y:1};
        this.tweens.add({
          targets:w,
          x:s.x*this.tileSize+8, y:s.y*this.tileSize+8, duration:500,
          onComplete:()=>{ w.setTexture('wook').play('w_walk').setData('state','chase'); }
        });
        this.score += 200; this.events.emit('score', this.score);
      }else if(w.getData('state')!=='eyes'){
        this.loseLife();
      }
    });

    // --- Input (mobile swipe) ---
    this.input.on('pointerup', (p)=>{
      const dx = p.upX - p.downX, dy = p.upY - p.downY;
      if(Math.abs(dx)>Math.abs(dy)) this.nextDir = dx>0?'right':'left';
      else this.nextDir = dy>0?'down':'up';
    });

    // Launch the UI overlay
    this.scene.launch('UIScene');
    this.scene.bringToTop('UIScene');
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
      this.score = 0; this.events.emit('score', this.score);
      this.lives = 3; this.events.emit('lives', this.lives);
      return;
    }
    this.player.setPosition(8+16,8+16);
  }

  enterPower(){
    this.powerUntil = this.time.now + this.powerTime*1000;
    this.wooks.children.iterate(w=>{
      if(!w) return;
      if(w.getData('state')!=='eyes'){
        w.setData('state','fright');
        w.setTexture('wook_fright').play('w_fright');
      }
    });
  }

  // helpers
  atTileCenter(sprite){
    const eps = 2; // pixels
    return Math.abs((sprite.x % this.tileSize) - 8) <= eps &&
           Math.abs((sprite.y % this.tileSize) - 8) <= eps;
  }
  dirVec(dir){ return dir==='left' ? [-1,0] : dir==='right' ? [1,0] : dir==='up' ? [0,-1] : [0,1]; }

  update(time, delta){
    if(this.paused) return;

    // read input
    if(this.cursors.left.isDown)  this.nextDir='left';
    if(this.cursors.right.isDown) this.nextDir='right';
    if(this.cursors.up.isDown)    this.nextDir='up';
    if(this.cursors.down.isDown)  this.nextDir='down';

    // change direction only near tile centers
    if(this.atTileCenter(this.player)){
      this.currentDir = this.nextDir;
      // snap to center on the perpendicular axis to avoid drift
      this.player.x = Math.round(this.player.x / this.tileSize)*this.tileSize - 8 + 8;
      this.player.y = Math.round(this.player.y / this.tileSize)*this.tileSize - 8 + 8;
    }

    // move player along currentDir
    const [vx, vy] = this.dirVec(this.currentDir);
    this.player.setVelocity(vx*this.speed, vy*this.speed);

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

    // Wook AI: axis-only chase (no diagonal speed boost)
    this.wooks.children.iterate(w=>{
      if(!w) return;
      const frightened = w.getData('state')==='fright';
      const speed = frightened ? 35 : w.getData('baseSpeed');
      const dx = this.player.x - w.x;
      const dy = this.player.y - w.y;
      if(w.getData('state')==='eyes'){
        w.setVelocity(0,0);
        return;
      }
      let ax = 0, ay = 0;
      if(Math.abs(dx) > Math.abs(dy)){
        ax = Math.sign(dx);
      }else{
        ay = Math.sign(dy);
      }
      if(frightened){ ax *= -1; ay *= -1; }
      w.setVelocity(ax*speed, ay*speed);
    });
  }
}
