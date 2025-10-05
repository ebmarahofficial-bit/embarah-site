class PreloadScene extends Phaser.Scene{
  constructor(){ super('PreloadScene'); }
  preload(){
    // tiles & sprites
    this.load.image('tiles', '../assets/tiles/maze.png');
    this.load.image('usb', '../assets/sprites/usb.png');
    this.load.image('shower', '../assets/sprites/showerhead.png');
    this.load.image('eyes', '../assets/sprites/eyes.png');
    this.load.spritesheet('gorilla','../assets/sprites/gorilla.png',{ frameWidth:16, frameHeight:16 });
    this.load.spritesheet('wook','../assets/sprites/wook.png',{ frameWidth:16, frameHeight:16 });
    this.load.spritesheet('wook_fright','../assets/sprites/wook_fright.png',{ frameWidth:16, frameHeight:16 });
    // map
    this.load.json('level1','../assets/maps/level1.json');
  }
  create(){
    // animations
    this.anims.create({ key:'g_walk', frames:this.anims.generateFrameNumbers('gorilla',{ start:0, end:3 }), frameRate:8, repeat:-1 });
    this.anims.create({ key:'w_walk', frames:this.anims.generateFrameNumbers('wook',{ start:0, end:3 }), frameRate:8, repeat:-1 });
    this.anims.create({ key:'w_fright', frames:this.anims.generateFrameNumbers('wook_fright',{ start:0, end:3 }), frameRate:8, repeat:-1 });
    this.scene.start('GameScene');
  }
}