class UIScene extends Phaser.Scene{
  constructor(){ super('UIScene'); }
  create(){
    this.scoreText = this.add.text(8, 6, 'Score: 0',{ fontFamily:'monospace', fontSize: '12px', color:'#aaffaa' }).setScrollFactor(0);
    this.livesText = this.add.text(350, 6, '♥♥♥',{ fontFamily:'monospace', fontSize: '12px', color:'#ffa0a0' }).setScrollFactor(0);
    const gs = this.scene.get('GameScene');
    gs.events.on('score', v=>{ this.scoreText.setText('Score: '+v); });
    gs.events.on('lives', v=>{ this.livesText.setText('♥'.repeat(v)); });
    this.events.on('pause', p=>{
      if(p){
        this.pauseText = this.add.text(110, 200, 'Paused',{ fontFamily:'monospace', fontSize:'18px', color:'#eaffea' });
      }else{
        this.pauseText?.destroy();
      }
    });
  }
}