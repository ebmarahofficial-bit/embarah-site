class PreloadScene extends Phaser.Scene{
  constructor(){ super('PreloadScene'); }
  preload(){
    // Small, crisp assets so they sit in the 16x16 grid
    this.load.image('usb',    'gorillaman/assets/sprites/usb_16.png');
    this.load.image('shower', 'gorillaman/assets/sprites/shower_16.png');
    this.load.image('eyes',   'gorillaman/assets/sprites/eyes.png');

    this.load.spritesheet('gorilla','gorillaman/assets/sprites/gorilla.png',{ frameWidth:16, frameHeight:16 });
    this.load.spritesheet('wook','gorillaman/assets/sprites/wook.png',{ frameWidth:16, frameHeight:16 });
    this.load.spritesheet('wook_fright','gorillaman/assets/sprites/wook_fright.png',{ frameWidth:16, frameHeight:16 });

    // Level
    this.load.json('level1','gorillaman/assets/maps/level1.json');
  }
  create(){
    // Simple walk animations
    this.anims.create({ key:'g_walk', frames:this.anims.generateFrameNumbers('gorilla',{ start:0, end:3 }), frameRate:8, repeat:-1 });
    this.anims.create({ key:'w_walk', frames:this.anims.generateFrameNumbers('wook',{ start:0, end:3 }), frameRate:8, repeat:-1 });
    this.anims.create({ key:'w_fright', frames:this.anims.generateFrameNumbers('wook_fright',{ start:0, end:3 }), frameRate:8, repeat:-1 });

    this.scene.start('GameScene');
  }
}
