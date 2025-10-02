/* Ebmarah Galaxian — Gorilla vs. Dubstep Logos
   Updates in this version:
   - Desktop layout nudged downward via CSS wrapper (no game logic change).
   - Endless waves (already supported), plus per-cell random logo selection.
   - Up/Down movement added (ArrowUp/ArrowDown or W/S).
   - Mobile drag-to-move (ship follows your finger); auto-fire enabled on mobile.
   - If enemies pass the bottom, they wrap back to the top instead of costing a life.
   - Ship image path set to assets/ship.png (place your sprite there).
*/

(() => {
  // ====== LOGO SOURCES ======
  // Recommend storing locally in /assets/logos for reliability.
  const LOGO_URLS = [
    "assets/logos/skism.png",
    "assets/logos/skrillex.png",
    "assets/logos/eptic.png",
    "assets/logos/knife_party.png",
    "assets/logos/calcium.png",
    "assets/logos/barelyalive.png",
    "assets/logos/truth.png",
     "assets/logos/cyclops.png",
  ];

  // Player ship sprite (drop your file here)
  const SHIP_IMG = "assets/ship.png"; // new name/location per your request

  // ====== CANVAS & CONTEXT ======
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // Simple mobile detection (touch capability or small width)
  const isMobile = ("ontouchstart" in window) || navigator.maxTouchPoints > 0 || window.matchMedia("(max-width: 900px)").matches;

  // ====== GAME STATE ======
  const state = {
    score: 0,
    lives: 3,
    wave: 1,
    playing: true,
    // Tuned a bit easier
    playerSpeed: 6,
    bulletSpeed: 10,
    enemyH: 48,
    enemyW: 64,
    enemyGapX: 18,
    enemyGapY: 20,
    enemyRowsBase: 3,
    enemyCols: 7,
    enemyBaseSpeed: 0.6,
    enemyDrop: 18,
    enemyShotChance: 0.00075,
    playerCooldownMs: 220, // slightly snappier
  };

  const keys = { left:false, right:false, up:false, down:false, fire:false };
  const bullets = [];
  const enemyBullets = [];

  const player = {
    x: canvas.width/2 - 23, y: canvas.height - 100,
    w: 46, h: 32,
    canShootAt: 0
  };

  // Enemies
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

  async function loadEnemyImages(){
    const results = await Promise.all(LOGO_URLS.map(loadImage));
    enemyImages = results;
  }

  let shipImg = null;
  loadImage(SHIP_IMG).then(img => shipImg = img);

  // ====== INIT ENEMY FORMATION ======
  function spawnWave(wave){
    enemies = [];
    const cols = state.enemyCols;
    const rows = state.enemyRowsBase + Math.floor((wave-1)/2); // gradually add rows
    const startX = 60;
    const startY = 70;
    const W = state.enemyW, H = state.enemyH, gapX = state.enemyGapX, gapY = state.enemyGapY;

    for(let r=0; r<rows; r++){
      for(let c=0; c<cols; c++){
        // pick a random image per enemy (randomized enemies)
        const idx = Math.floor(Math.random() * Math.max(1, enemyImages.length));
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
    enemySpeed = state.enemyBaseSpeed + (wave-1)*0.12; // endless scaling
    document.getElementById('wave').textContent = "Wave: " + wave;
  }

  // ====== INPUT ======
  window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') keys.up = true;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') keys.down = true;
    if (e.code === 'Space') { keys.fire = true; e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') keys.up = false;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') keys.down = false;
    if (e.code === 'Space') keys.fire = false;
  });

  // Fallback touch buttons (hidden when drag mode is active)
  const leftBtn = document.getElementById('leftBtn');
  const rightBtn = document.getElementById('rightBtn');
  const fireBtn = document.getElementById('fireBtn');
  const touchBtns = document.getElementById('touchBtns');

  // Drag-to-move on mobile
  let dragging = false;
  function canvasToLocal(e){
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    return {
      x: (touch.clientX - rect.left) * (canvas.width / rect.width),
      y: (touch.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  function startDrag(e){
    dragging = true;
    const p = canvasToLocal(e);
    setPlayerTo(p.x, p.y);
    e.preventDefault();
  }
  function moveDrag(e){
    if(!dragging) return;
    const p = canvasToLocal(e);
    setPlayerTo(p.x, p.y);
    e.preventDefault();
  }
  function endDrag(){
    dragging = false;
  }
  function setPlayerTo(x, y){
    player.x = Math.max(10, Math.min(canvas.width - player.w - 10, x - player.w/2));
    player.y = Math.max(60, Math.min(canvas.height - player.h - 10, y - player.h/2));
  }

  if (isMobile){
    // Hide button controls if drag available
    touchBtns.style.display = 'none';

    // Enable drag on canvas
    canvas.addEventListener('touchstart', startDrag, {passive:false});
    canvas.addEventListener('touchmove', moveDrag, {passive:false});
    canvas.addEventListener('touchend', endDrag, {passive:false});
    canvas.addEventListener('mousedown', startDrag);
    window.addEventListener('mousemove', moveDrag);
    window.addEventListener('mouseup', endDrag);
  } else {
    // Keep button controls available on non-drag contexts
    const bindHold = (el, on, off) => {
      el.addEventListener('touchstart', (e)=>{ e.preventDefault(); on(); }, {passive:false});
      el.addEventListener('touchend',   (e)=>{ e.preventDefault(); off(); }, {passive:false});
      el.addEventListener('mousedown',  (e)=>{ e.preventDefault(); on(); });
      el.addEventListener('mouseup',    (e)=>{ e.preventDefault(); off(); });
      el.addEventListener('mouseleave', off);
    };
    bindHold(leftBtn, ()=>keys.left=true, ()=>keys.left=false);
    bindHold(rightBtn, ()=>keys.right=true, ()=>keys.right=false);
    bindHold(fireBtn, ()=>{ attemptShoot(); keys.fire=true; }, ()=>keys.fire=false);
  }

  // ====== AUTO-FIRE ON MOBILE ======
  let autoFireTimer = null;
  function startAutoFire(){
    if (autoFireTimer) return;
    autoFireTimer = setInterval(() => {
      attemptShoot();
    }, Math.max(80, state.playerCooldownMs)); // auto cadence tuned to cooldown
  }
  function stopAutoFire(){
    if (autoFireTimer){
      clearInterval(autoFireTimer);
      autoFireTimer = null;
    }
  }
  if (isMobile){
    startAutoFire();
    // Stop on blur, resume on focus (battery friendly)
    window.addEventListener('blur', stopAutoFire);
    window.addEventListener('focus', startAutoFire);
  }

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
    // Move horizontally and find edges
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
      // If enemy slips past the bottom, wrap to top (no penalty)
      if (e.y > canvas.height - 40){
        e.y = 60; // back to top band
        // randomize its X within safe bounds on wrap
        e.x = 40 + Math.random()*(canvas.width - e.w - 80);
      }
    });
    // Bounce and drop the formation
    if (minX < 20 || maxX > canvas.width - 20){
      enemyDir *= -1;
      enemies.forEach(e=> { if(e.alive) e.y += state.enemyDrop; });
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
      // Fallback: glowing badge
      drawGlowRect(e.x, e.y, e.w, e.h, 'rgba(0,255,200,0.8)');
      ctx.fillStyle = '#b7ffe6';
      ctx.font = 'bold 14px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('DJ', e.x+e.w/2, e.y+e.h/2);
    }
  }

  function drawPlayer(){
    if (shipImg){
      ctx.drawImage(shipImg, player.x, player.y, player.w, player.h);
    } else {
      // Neon triangle fallback
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

    // Update player position (keys)
    if (keys.left)  player.x -= state.playerSpeed;
    if (keys.right) player.x += state.playerSpeed;
    if (keys.up)    player.y -= state.playerSpeed;
    if (keys.down)  player.y += state.playerSpeed;

    // Bound player
    player.x = Math.max(10, Math.min(canvas.width - player.w - 10, player.x));
    player.y = Math.max(60, Math.min(canvas.height - player.h - 10, player.y));

    // Manual shooting (desktop)
    if (!isMobile && keys.fire) attemptShoot();

    // Bullets
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
          break;
        }
      }
    }

    // Enemy bullets vs player
    for (let i=enemyBullets.length-1; i>=0; i--){
      if (rectsOverlap(enemyBullets[i], {x:player.x,y:player.y,w:player.w,h:player.h})){
        enemyBullets.splice(i,1);
        state.lives--;
        document.getElementById('lives').textContent = "Lives: " + state.lives;
        player.x = canvas.width/2 - player.w/2;
        player.y = canvas.height - 100;
        if (state.lives <= 0){
          gameOver();
        }
      }
    }

    // Endless waves: when all current enemies are dead, spawn the next
    if (enemies.every(e => !e.alive)){
      state.wave++;
      spawnWave(state.wave);
    }

    // Draw
    ctx.clearRect(0,0,canvas.width,canvas.height);
    drawStarfield(ts);
    enemies.forEach(e => { if (e.alive) drawEnemy(e); });
    ctx.fillStyle = '#7fffd4';
    bullets.forEach(b => ctx.fillRect(b.x,b.y,b.w,b.h));
    ctx.fillStyle = '#ffcf7f';
    enemyBullets.forEach(b => ctx.fillRect(b.x,b.y,b.w,b.h));
    drawPlayer();

    requestAnimationFrame(loop);
  }

  // ====== STARFIELD ======
  const stars = Array.from({length:80}, () => ({
    x: Math.random()*900,
    y: Math.random()*600,
    s: Math.random()*2 + 0.5,
    v: Math.random()*0.3 + 0.1
  }));
  function drawStarfield(){
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
      if (!playing) widget.play(); else widget.pause();
    });
    btnPrev.addEventListener('click', () => widget.prev());
    btnNext.addEventListener('click', () => widget.next());
    vol.addEventListener('input', () => widget.setVolume(parseFloat(vol.value)*100));

    widget.bind(SC.Widget.Events.PLAY, () => { playing = true; btnPlay.textContent = '⏸'; });
    widget.bind(SC.Widget.Events.PAUSE, () => { playing = false; btnPlay.textContent = '▶'; });

    // Prime on first user interaction
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
