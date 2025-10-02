/* Ebmarah Galaxian — Gorilla vs. Dubstep Logos
   - Background video expected at: assets/runnerbg.mp4
   - Paste artist logo URLs below, or point to local files in assets/logos/
   - SoundCloud playback uses hidden widget + tiny custom controls.
*/

(() => {
  // ====== LOGO SOURCES ======
  // Add any direct image URLs or local paths. Cross-origin works if the host allows it.
  // Tip: Better reliability if you download logos into /assets/logos and reference them locally.
  const LOGO_URLS = [
    // Examples (replace with your picks). Local examples:
    "assets/logos/excision.png",
    "assets/logos/skrill.png",
    "assets/logos/zedsdead.png",
    "assets/logos/virtual_riot.png",
    "assets/logos/subtronics.png",
    "assets/logos/rusko.png",
    "assets/logos/ebmarah.png", // your logo as a 'mini-boss'
  ];

  // Optional player image (gorilla). If unavailable, a glowing triangle is drawn.
  const GORILLA_IMG = "assets/runner/gorilla_ship.png"; // put your small sprite here, else fallback

  // ====== CANVAS & CONTEXT ======
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // ====== GAME STATE ======
  const state = {
    score: 0,
    lives: 3,
    wave: 1,
    playing: true,
    // Difficulty knobs (tuned to be a little easier per your feedback)
    playerSpeed: 6,
    bulletSpeed: 10,
    enemyH: 48,
    enemyW: 64,
    enemyGapX: 18,
    enemyGapY: 20,
    enemyRows: 3,
    enemyCols: 7,
    enemyBaseSpeed: 0.6,  // horizontal march speed
    enemyDrop: 18,        // how much they drop when bouncing edges
    enemyShotChance: 0.00075, // per frame chance to fire
    playerCooldownMs: 240,
  };

  const keys = { left:false, right:false, fire:false };
  const bullets = [];
  const enemyBullets = [];

  const player = {
    x: canvas.width/2, y: canvas.height - 80,
    w: 46, h: 32,
    canShootAt: 0
  };

  // Enemies container
  let enemies = [];
  let enemyDir = 1; // 1 →, -1 ←
  let enemySpeed = state.enemyBaseSpeed;
  let enemyImages = []; // loaded Image objects matched to logos

  // ====== LOAD IMAGES ======
  function loadImage(src){
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  // Load all enemy logos (with fallback)
  async function loadEnemyImages(){
    const results = await Promise.all(LOGO_URLS.map(loadImage));
    // If any failed, mark null; we’ll draw a fallback badge with initials.
    enemyImages = results;
  }

  let gorillaImg = null;
  loadImage(GORILLA_IMG).then(img => gorillaImg = img);

  // ====== INIT ENEMY FORMATION ======
  function spawnWave(wave){
    enemies = [];
    const cols = state.enemyCols;
    const rows = state.enemyRows + Math.floor((wave-1)/2); // slight growth over waves (but stays reasonable)
    const startX = 60;
    const startY = 80;
    const W = state.enemyW, H = state.enemyH, gapX = state.enemyGapX, gapY = state.enemyGapY;

    for(let r=0; r<rows; r++){
      for(let c=0; c<cols; c++){
        const idx = (r*cols + c) % enemyImages.length;
        enemies.push({
          x: startX + c*(W+gapX),
          y: startY + r*(H+gapY),
          w: W, h: H,
          imgIdx: idx,
          alive: true
        });
      }
    }
    enemyDir = 1;
    enemySpeed = state.enemyBaseSpeed + (wave-1)*0.12; // small ramp
    document.getElementById('wave').textContent = "Wave: " + wave;
  }

  // ====== INPUT ======
  window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
    if (e.code === 'Space') { keys.fire = true; e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
    if (e.code === 'Space') keys.fire = false;
  });

  // Touch controls
  const leftBtn = document.getElementById('leftBtn');
  const rightBtn = document.getElementById('rightBtn');
  const fireBtn = document.getElementById('fireBtn');
  const bindHold = (el, on, off) => {
    el.addEventListener('touchstart', (e)=>{ e.preventDefault(); on(); }, {passive:false});
    el.addEventListener('touchend', (e)=>{ e.preventDefault(); off(); }, {passive:false});
  };
  bindHold(leftBtn, ()=>keys.left=true, ()=>keys.left=false);
  bindHold(rightBtn, ()=>keys.right=true, ()=>keys.right=false);
  bindHold(fireBtn, ()=>{
    attemptShoot();
    keys.fire=true;
  }, ()=>keys.fire=false);

  // ====== SHOOTING ======
  function attemptShoot(){
    const now = performance.now();
    if (now >= player.canShootAt){
      bullets.push({ x: player.x + player.w/2 - 2, y: player.y - 8, w: 4, h: 10, vy: -state.bulletSpeed });
      player.canShootAt = now + state.playerCooldownMs;
    }
  }

  // ====== COLLISION ======
  function rectsOverlap(a,b){
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ====== ENEMY BEHAVIOR ======
  function updateEnemies(dt){
    // Find edges
    let minX = Infinity, maxX = -Infinity;
    enemies.forEach(e=>{
      if(!e.alive) return;
      e.x += enemyDir * enemySpeed * dt;
      minX = Math.min(minX, e.x);
      maxX = Math.max(maxX, e.x + e.w);
      // Random shots
      if (Math.random() < state.enemyShotChance){
        enemyBullets.push({ x: e.x+e.w/2-2, y: e.y+e.h, w: 4, h: 10, vy: 4.5 + Math.random()*1.5 });
      }
    });
    // Bounce + drop
    if (minX < 20 || maxX > canvas.width - 20){
      enemyDir *= -1;
      enemies.forEach(e=> e.y += state.enemyDrop);
    }
  }

  // ====== DRAW HELPERS ======
  function drawGlowRect(x,y,w,h,color='rgba(53,255,160,0.7)'){
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x,y,w,h);
    ctx.restore();
  }

  function drawEnemy(e){
    const img = enemyImages[e.imgIdx];
    if (img){
      ctx.drawImage(img, e.x, e.y, e.w, e.h);
    } else {
      // Fallback: glowing badge with initials
      drawGlowRect(e.x, e.y, e.w, e.h, 'rgba(0,255,200,0.8)');
      ctx.fillStyle = '#b7ffe6';
      ctx.font = 'bold 14px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('DJ', e.x+e.w/2, e.y+e.h/2);
    }
  }

  function drawPlayer(){
    if (gorillaImg){
      ctx.drawImage(gorillaImg, player.x, player.y, player.w, player.h);
    } else {
      // Fallback: neon triangle ship
      ctx.save();
      ctx.translate(player.x + player.w/2, player.y + player.h/2);
      ctx.shadowBlur = 18; ctx.shadowColor = 'rgba(53,255,160,0.8)';
      ctx.fillStyle = 'rgba(53,255,160,0.95)';
      ctx.beginPath();
      ctx.moveTo(-20, 16); ctx.lineTo(0, -16); ctx.lineTo(20, 16); ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // ====== GAME LOOP ======
  let last = 0;
  function loop(ts){
    if (!last) last = ts;
    const dt = Math.min(32, ts - last); // clamp dt for stability
    last = ts;
    if (!state.playing) return;

    // Update
    if (keys.left)  player.x -= state.playerSpeed;
    if (keys.right) player.x += state.playerSpeed;
    player.x = Math.max(10, Math.min(canvas.width - player.w - 10, player.x));

    if (keys.fire) attemptShoot();

    bullets.forEach(b => b.y += b.vy);
    for (let i=bullets.length-1; i>=0; i--){
      if (bullets[i].y < -20) bullets.splice(i,1);
    }

    // Enemy bullets
    enemyBullets.forEach(b => b.y += b.vy);
    for (let i=enemyBullets.length-1; i>=0; i--){
      if (enemyBullets[i].y > canvas.height+20) enemyBullets.splice(i,1);
    }

    // Enemies move
    updateEnemies(dt);

    // Collisions: bullets vs enemies
    bulletsLoop:
    for (let i=bullets.length-1; i>=0; i--){
      const b = bullets[i];
      for (let j=0; j<enemies.length; j++){
        const e = enemies[j];
        if (!e.alive) continue;
        if (rectsOverlap(b, e)){
          e.alive = false;
          bullets.splice(i,1);
          state.score += 50;
          document.getElementById('score').textContent = "Score: " + state.score;
          break bulletsLoop;
        }
      }
    }

    // Enemy bullets vs player
    for (let i=enemyBullets.length-1; i>=0; i--){
      if (rectsOverlap(enemyBullets[i], {x:player.x,y:player.y,w:player.w,h:player.h})){
        enemyBullets.splice(i,1);
        state.lives--;
        document.getElementById('lives').textContent = "Lives: " + state.lives;
        // brief invulnerability by moving player slightly
        player.x = canvas.width/2 - player.w/2;
        if (state.lives <= 0){
          gameOver();
        }
      }
    }

    // Check wave clear
    if (enemies.every(e => !e.alive)){
      state.wave++;
      spawnWave(state.wave);
    }

    // Draw
    ctx.clearRect(0,0,canvas.width,canvas.height);
    // Subtle starfield
    drawStarfield(ts);
    enemies.forEach(e => { if (e.alive) drawEnemy(e); });
    ctx.fillStyle = '#7fffd4';
    bullets.forEach(b => ctx.fillRect(b.x,b.y,b.w,b.h));
    ctx.fillStyle = '#ffcf7f';
    enemyBullets.forEach(b => ctx.fillRect(b.x,b.y,b.w,b.h));
    drawPlayer();

    requestAnimationFrame(loop);
  }

  // ====== STARFIELD (pretty but light) ======
  const stars = Array.from({length:80}, () => ({
    x: Math.random()*900,
    y: Math.random()*600,
    s: Math.random()*2 + 0.5,
    v: Math.random()*0.3 + 0.1
  }));
  function drawStarfield(ts){
    ctx.save();
    stars.forEach(st => {
      st.y += st.v;
      if (st.y > canvas.height) st.y = -2, st.x = Math.random()*canvas.width;
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#9ffff0';
      ctx.fillRect(st.x, st.y, st.s, st.s);
    });
    ctx.restore();
  }

  function gameOver(){
    state.playing = false;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 36px system-ui';
    ctx.fillText('Game Over', canvas.width/2, canvas.height/2 - 10);
    ctx.font = '16px system-ui';
    ctx.fillText('Refresh to play again', canvas.width/2, canvas.height/2 + 22);
    ctx.restore();
  }

  // ====== RESIZE (desktop framed, mobile fullscreen) ======
  function fitCanvas(){
    // Canvas intrinsic is 900x600; CSS handles scaling.
    // Nothing required here unless you want dynamic resolution swaps.
  }
  window.addEventListener('resize', fitCanvas);

  // ====== MUSIC (SoundCloud Widget API) ======
  let widget = null;
  function setupSC(){
    const iframe = document.getElementById('scPlayer');
    // eslint-disable-next-line no-undef
    widget = SC.Widget(iframe);

    const btnPlay = document.getElementById('btnPlay');
    const btnPrev = document.getElementById('btnPrev');
    const btnNext = document.getElementById('btnNext');
    const vol = document.getElementById('vol');

    let playing = false;

    btnPlay.addEventListener('click', () => {
      if (!playing) {
        widget.play();
      } else {
        widget.pause();
      }
    });
    btnPrev.addEventListener('click', () => widget.prev());
    btnNext.addEventListener('click', () => widget.next());

    vol.addEventListener('input', () => {
      widget.setVolume(parseFloat(vol.value)*100); // SC volume is 0..100
    });

    // Update play icon based on events
    widget.bind(SC.Widget.Events.PLAY, () => { playing = true; btnPlay.textContent = '⏸'; });
    widget.bind(SC.Widget.Events.PAUSE, () => { playing = false; btnPlay.textContent = '▶'; });

    // Some browsers block autoplay: start music on first user input
    const prime = () => { widget.setVolume(parseFloat(vol.value)*100); widget.play(); window.removeEventListener('click', prime); };
    window.addEventListener('click', prime, { once: true });
  }

  // ====== STARTUP ======
  (async function start(){
    await loadEnemyImages();
    spawnWave(state.wave);
    setupSC();
    requestAnimationFrame(loop);
  })();

})();
