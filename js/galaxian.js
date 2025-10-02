/* Ebmarah Galaxian — Gorilla vs. Dubstep Logos
   Adds:
   - Boss wave every 20th wave (big logo with HP, does NOT alter 5/10/15… switch rhythm)
   - Slightly bigger player ship
   - High Scores modal (local save; future-proofed to sync daily if you add a backend)
   - Pause system (unchanged), mobile full-height canvas (unchanged)
*/
(() => {
  // ---- Mobile height helper (robust phone fit) ----
  function setAppHeight(){
    document.documentElement.style.setProperty('--app-h', `${window.innerHeight}px`);
  }
  setAppHeight();
  window.addEventListener('resize', setAppHeight);
  window.addEventListener('orientationchange', setAppHeight);

  // ====== LOGO SOURCES (order matters for wave switching) ======
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

  // Player ship sprite
  const SHIP_IMG = "assets/ship.png";

  // ====== DOM ======
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const isMobile = ("ontouchstart" in window) || navigator.maxTouchPoints > 0 || window.matchMedia("(max-width: 900px)").matches;

  const $score = document.getElementById('score');
  const $wave  = document.getElementById('wave');
  const $lives = document.getElementById('lives');

  const $gameOver   = document.getElementById('gameOver');
  const $finalScore = document.getElementById('finalScore');
  const $finalWave  = document.getElementById('finalWave');
  const $tryAgain   = document.getElementById('tryAgain');

  const $pauseBtn   = document.getElementById('pauseBtn');
  const $pauseBadge = document.getElementById('pauseBadge');

  // High scores UI
  const $highBtn = document.getElementById('highBtn');
  const $highModal = document.getElementById('highModal');
  const $hsList = document.getElementById('hsList');
  const $hsClose = document.getElementById('hsClose');

  // ====== GAME STATE (px/second speeds) ======
  const state = {
    score: 0,
    lives: 3,
    wave: 1,
    playing: true,
    paused: false,
    playerSpeed: 320,       // px/sec
    bulletSpeed: 700,       // px/sec
    enemyH: 48,
    enemyW: 64,
    enemyGapX: 18,
    enemyGapY: 20,
    enemyRowsBase: 3,
    enemyCols: 7,
    enemyBaseSpeed: 80,     // px/sec
    enemyDrop: 18,          // px when bouncing
    enemyShotRate: 0.045,   // per enemy per sec
    playerCooldownMs: 220,
  };

  const keys = { left:false, right:false, up:false, down:false, fire:false };
  const bullets = [];
  const enemyBullets = [];

  // Slightly bigger player ship (requested)
  const player = {
    x: canvas.width/2 - 36, y: canvas.height - 120,
    w: 72, h: 52,           // was 56x40
    canShootAt: 0
  };

  // Enemies (formation)
  let enemies = [];
  let enemyDir = 1;
  let enemySpeed = state.enemyBaseSpeed;
  let enemyImages = [];

  // Boss (every 20th wave)
  let boss = null; // {x,y,w,h,imgIdx,hp,baseX,amp,freq,t,vy,alive}
  const BOSS_HP_BASE = 18;

  // Swoopers (single special invaders)
  const swoopers = [];
  let swooperCooldown = 3.5; // seconds until first spawn

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

  // Determine which logo to use for a given wave block (switches on 5,10,15,...)
  function waveLogoIndex(wave){
    const block = Math.floor((wave - 1) / 5); // 1-4 -> 0, 5-9 -> 1, etc.
    return block % LOGO_URLS.length;
  }

  // ====== INIT ENEMY FORMATION or BOSS ======
  function spawnWave(wave){
    boss = null;
    enemies = [];
    const isBossWave = (wave % 20 === 0);

    const idx = waveLogoIndex(wave); // keep your 5/10/15… pattern intact

    if (isBossWave){
      // One large logo as a boss
      const w = Math.floor(canvas.width * 0.28);
      const h = Math.floor(canvas.height * 0.22);
      const baseX = canvas.width/2;
      boss = {
        x: baseX - w/2,
        y: 90,
        w, h,
        imgIdx: idx,
        hp: BOSS_HP_BASE + Math.floor(wave / 4), // scales slowly
        baseX,
        amp: 120,
        freq: 1.2,
        t: 0,
        vy: 20,
        alive: true
      };
      enemySpeed = state.enemyBaseSpeed + (wave-1)*12; // irrelevant this wave, but keep consistent
    } else {
      const cols = state.enemyCols;
      const rows = state.enemyRowsBase + Math.floor((wave-1)/2);
      const startX = 60;
      const startY = 70;
      const W = state.enemyW, H = state.enemyH, gapX = state.enemyGapX, gapY = state.enemyGapY;

      for(let r=0; r<rows; r++){
        for(let c=0; c<cols; c++){
          enemies.push({
            x: startX + c*(W+gapX),
            y: startY + r*(H+gapY),
            w: W, h: H,
            imgIdx: idx,     // uniform logo this wave
            alive: true
          });
        }
      }
      enemyDir = 1;
      enemySpeed = state.enemyBaseSpeed + (wave-1)*12; // gentle ramp (px/sec)
    }

    $wave.textContent = "Wave: " + wave;
  }

  // ====== INPUT ======
  window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') keys.up = true;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') keys.down = true;
    if (e.code === 'Space') { keys.fire = true; e.preventDefault(); }
    if (e.code === 'KeyP' || e.code === 'Escape'){ togglePause(); }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') keys.up = false;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') keys.down = false;
    if (e.code === 'Space') keys.fire = false;
  });

  // Touch/drag and fallback buttons
  const leftBtn  = document.getElementById('leftBtn');
  const rightBtn = document.getElementById('rightBtn');
  const fireBtn  = document.getElementById('fireBtn');
  const touchBtns= document.getElementById('touchBtns');

  let dragging = false;
  function canvasToLocal(e){
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    return {
      x: (touch.clientX - rect.left) * (canvas.width / rect.width),
      y: (touch.clientY - rect.top)  * (canvas.height / rect.height)
    };
  }
  function startDrag(e){ dragging = true; const p=canvasToLocal(e); setPlayerTo(p.x,p.y); e.preventDefault(); }
  function moveDrag(e){ if(!dragging) return; const p=canvasToLocal(e); setPlayerTo(p.x,p.y); e.preventDefault(); }
  function endDrag(){ dragging = false; }
  function setPlayerTo(x,y){
    player.x = Math.max(10, Math.min(canvas.width - player.w - 10, x - player.w/2));
    player.y = Math.max(60, Math.min(canvas.height - player.h - 10, y - player.h/2));
  }

  const isTouch = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;
  if (isTouch){
    touchBtns.style.display = 'none';
    canvas.addEventListener('touchstart', startDrag, {passive:false});
    canvas.addEventListener('touchmove',  moveDrag,  {passive:false});
    canvas.addEventListener('touchend',   endDrag,   {passive:false});
    canvas.addEventListener('mousedown',  startDrag);
    window.addEventListener('mousemove',  moveDrag);
    window.addEventListener('mouseup',    endDrag);
  } else {
    const bindHold = (el, on, off) => {
      el.addEventListener('touchstart', (e)=>{ e.preventDefault(); on(); }, {passive:false});
      el.addEventListener('touchend',   (e)=>{ e.preventDefault(); off(); }, {passive:false});
      el.addEventListener('mousedown',  (e)=>{ e.preventDefault(); on(); });
      el.addEventListener('mouseup',    (e)=>{ e.preventDefault(); off(); });
      el.addEventListener('mouseleave', off);
    };
    bindHold(leftBtn,  ()=>keys.left=true,  ()=>keys.left=false);
    bindHold(rightBtn, ()=>keys.right=true, ()=>keys.right=false);
    bindHold(fireBtn,  ()=>{ attemptShoot(); keys.fire=true; }, ()=>keys.fire=false);
  }

  // Auto-fire on mobile
  let autoFireTimer = null;
  function startAutoFire(){
    if (autoFireTimer) return;
    autoFireTimer = setInterval(() => attemptShoot(), Math.max(80, state.playerCooldownMs));
  }
  function stopAutoFire(){ if (autoFireTimer){ clearInterval(autoFireTimer); autoFireTimer=null; } }
  if (isTouch){ startAutoFire(); window.addEventListener('blur', stopAutoFire); window.addEventListener('focus', startAutoFire); }

  // ====== PAUSE ======
  function setPaused(p){
    state.paused = p;
    if ($pauseBtn){
      $pauseBtn.textContent = p ? 'Resume' : 'Pause';
      $pauseBtn.setAttribute('aria-pressed', p ? 'true' : 'false');
    }
    if ($pauseBadge){ $pauseBadge.hidden = !p; }
    if (p){ stopAutoFire(); }
    else if (isTouch){ startAutoFire(); }
  }
  function togglePause(){ setPaused(!state.paused); }
  if ($pauseBtn){ $pauseBtn.addEventListener('click', togglePause); }

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

  // ====== ENEMY BEHAVIOR (formation) ======
  function updateEnemies(dt){
    if (boss && boss.alive){
      // Boss oscillation + occasional shots
      boss.t += dt;
      boss.x = boss.baseX + Math.sin(boss.t * boss.freq) * boss.amp - boss.w/2;
      // light vertical bob
      boss.y = 90 + Math.sin(boss.t * 0.7) * 10;

      // boss shooting
      if (Math.random() < 0.9 * dt){ // slow stream
        enemyBullets.push({
          x: boss.x + boss.w/2 - 2, y: boss.y + boss.h, w:4, h:10, vy: 260 + Math.random()*120
        });
      }
      return; // no formation movement when boss wave
    }

    let minX = Infinity, maxX = -Infinity;
    enemies.forEach(e=>{
      if(!e.alive) return;
      e.x += enemyDir * (enemySpeed * dt);
      minX = Math.min(minX, e.x);
      maxX = Math.max(maxX, e.x + e.w);

      if (Math.random() < state.enemyShotRate * dt){
        enemyBullets.push({
          x: e.x+e.w/2-2, y: e.y+e.h, w: 4, h: 10,
          vy: 270 + Math.random()*90
        });
      }
      if (e.y > canvas.height - 40){
        e.y = 60;
        e.x = 40 + Math.random()*(canvas.width - e.w - 80);
      }
    });
    if (minX < 20 || maxX > canvas.width - 20){
      enemyDir *= -1;
      enemies.forEach(e=> { if(e.alive) e.y += state.enemyDrop; });
    }
  }

  // Swoopers
  function spawnSwooper(){
    const waveIdx = waveLogoIndex(state.wave);
    const altIdx  = (waveIdx + 1) % LOGO_URLS.length;
    const baseX = 60 + Math.random()*(canvas.width - 120);
    swoopers.push({
      baseX, x: baseX, y: -40, w: state.enemyW, h: state.enemyH,
      imgIdx: altIdx, t: 0, vy: 180 + Math.random()*80,
      amp: 60 + Math.random()*50, freq: 2 + Math.random()*1.5, alive: true
    });
  }
  function updateSwoopers(dt){
    swooperCooldown -= dt;
    if (swooperCooldown <= 0){ spawnSwooper(); swooperCooldown = 4 + Math.random()*4; }
    for (let i=swoopers.length-1; i>=0; i--){
      const s = swoopers[i];
      if (!s.alive) { swoopers.splice(i,1); continue; }
      s.t += dt;
      s.y += s.vy * dt;
      s.x = s.baseX + Math.sin(s.t * s.freq) * s.amp;
      if (s.y > canvas.height + 60) swoopers.splice(i,1);
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

  function drawEnemyRectLikeLogo(e){
    const img = enemyImages[e.imgIdx];
    if (img){ ctx.drawImage(img, e.x, e.y, e.w, e.h); }
    else {
      drawGlowRect(e.x, e.y, e.w, e.h, 'rgba(0,255,200,0.8)');
      ctx.fillStyle = '#b7ffe6';
      ctx.font = 'bold 14px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('DJ', e.x+e.w/2, e.y+e.h/2);
    }
  }

  function drawPlayer(){
    if (shipImg){ ctx.drawImage(shipImg, player.x, player.y, player.w, player.h); }
    else {
      ctx.save();
      ctx.translate(player.x + player.w/2, player.y + player.h/2);
      ctx.shadowBlur = 18; ctx.shadowColor = 'rgba(53,255,160,0.8)';
      ctx.fillStyle = 'rgba(53,255,160,0.95)';
      ctx.beginPath();
      ctx.moveTo(-28, 24); ctx.lineTo(0, -24); ctx.lineTo(28, 24); ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // ====== GAME LOOP (stable timing + pause-safe) ======
  let last = 0;
  function loop(ts){
    if (!last) last = ts;
    let dt = (ts - last) / 1000;     // seconds
    if (dt > 0.05) dt = 0.05;        // clamp to avoid jumps
    last = ts;

    if (!state.playing){
      return; // stop the loop on game over; resetGame() restarts it
    }

    if (state.paused){
      if ($pauseBadge){ $pauseBadge.hidden = false; }
      requestAnimationFrame(loop);
      return;
    } else {
      if ($pauseBadge){ $pauseBadge.hidden = true; }
    }

    // Movement
    if (keys.left)  player.x -= state.playerSpeed * dt;
    if (keys.right) player.x += state.playerSpeed * dt;
    if (keys.up)    player.y -= state.playerSpeed * dt;
    if (keys.down)  player.y += state.playerSpeed * dt;

    // Bounds
    player.x = Math.max(10, Math.min(canvas.width - player.w - 10, player.x));
    player.y = Math.max(60, Math.min(canvas.height - player.h - 10, player.y));

    // Manual fire (desktop)
    if (!isMobile && keys.fire) attemptShoot();

    // Bullets
    bullets.forEach(b => b.y += b.vy * dt);
    for (let i=bullets.length-1; i>=0; i--) if (bullets[i].y < -20) bullets.splice(i,1);

    // Enemy bullets
    enemyBullets.forEach(b => b.y += b.vy * dt);
    for (let i=enemyBullets.length-1; i>=0; i--) if (enemyBullets[i].y > canvas.height+20) enemyBullets.splice(i,1);

    // Enemies & swoopers
    updateEnemies(dt);
    updateSwoopers(dt);

    // Collisions: bullets vs formation/boss/swoopers
    for (let i=bullets.length-1; i>=0; i--){
      const b = bullets[i];
      let consumed = false;

      // vs boss
      if (boss && boss.alive && rectsOverlap(b, boss)){
        bullets.splice(i,1);
        consumed = true;
        boss.hp -= 1;
        state.score += 25;
        $score.textContent = "Score: " + state.score;
        if (boss.hp <= 0){
          boss.alive = false;
          state.score += 300; // boss bonus
          $score.textContent = "Score: " + state.score;
        }
      }
      if (consumed) continue;

      // vs formation
      for (let j=0; j<enemies.length; j++){
        const e = enemies[j];
        if (!e.alive) continue;
        if (rectsOverlap(b, e)){
          e.alive = false;
          bullets.splice(i,1);
          state.score += 50;
          $score.textContent = "Score: " + state.score;
          consumed = true;
          break;
        }
      }
      if (consumed) continue;

      // vs swoopers
      for (let k=0; k<swoopers.length; k++){
        const s = swoopers[k];
        if (!s.alive) continue;
        if (rectsOverlap(b, s)){
          s.alive = false;
          bullets.splice(i,1);
          state.score += 100; // bonus for swooper
          $score.textContent = "Score: " + state.score;
          break;
        }
      }
    }

    // Enemy bullets vs player
    for (let i=enemyBullets.length-1; i>=0; i--){
      if (rectsOverlap(enemyBullets[i], {x:player.x,y:player.y,w:player.w,h:player.h})){
        enemyBullets.splice(i,1);
        state.lives--;
        $lives.textContent = "Lives: " + state.lives;
        player.x = canvas.width/2 - player.w/2;
        player.y = canvas.height - 120;
        if (state.lives <= 0) gameOver();
      }
    }

    // Endless waves:
    if (boss){
      if (!boss.alive){
        state.wave++;
        spawnWave(state.wave);
      }
    } else {
      if (enemies.length && enemies.every(e => !e.alive)){
        state.wave++;
        spawnWave(state.wave);
      }
    }

    // Draw
    ctx.clearRect(0,0,canvas.width,canvas.height);
    drawStarfield(dt);

    // formation / boss / swoopers
    if (boss && boss.alive){
      drawEnemyRectLikeLogo(boss);
      // optional: tiny HP bar
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.fillRect(boss.x, boss.y - 12, boss.w, 6);
      ctx.fillStyle = '#35ffa0';
      const hpw = Math.max(0, (boss.hp / (BOSS_HP_BASE + Math.floor(state.wave/4))) * boss.w);
      ctx.fillRect(boss.x, boss.y - 12, hpw, 6);
    } else {
      enemies.forEach(e => { if (e.alive) drawEnemyRectLikeLogo(e); });
    }
    swoopers.forEach(s => { if (s.alive) drawEnemyRectLikeLogo(s); });

    // bullets
    ctx.fillStyle = '#7fffd4';
    bullets.forEach(b => ctx.fillRect(b.x,b.y,b.w,b.h));
    ctx.fillStyle = '#ffcf7f';
    enemyBullets.forEach(b => ctx.fillRect(b.x,b.y,b.w,b.h));

    // player
    drawPlayer();

    requestAnimationFrame(loop);
  }

  // ====== STARFIELD ======
  const stars = Array.from({length:80}, () => ({
    x: Math.random()*900,
    y: Math.random()*600,
    s: Math.random()*2 + 0.5,
    v: 18 + Math.random()*18 // px/sec
  }));
  function drawStarfield(dt){
    ctx.save();
    stars.forEach(st => {
      st.y += st.v * (dt ?? 0.016);
      if (st.y > canvas.height) { st.y = -2; st.x = Math.random()*canvas.width; }
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#9ffff0';
      ctx.fillRect(st.x, st.y, st.s, st.s);
    });
    ctx.restore();
  }

  // ====== GAME OVER + RESTART ======
  function gameOver(){
    state.playing = false;
    setPaused(false);
    $finalScore.textContent = state.score.toString();
    $finalWave.textContent = state.wave.toString();
    saveHighScore(state.score, state.wave);
    $gameOver.hidden = false;
  }

  function resetGame(){
    bullets.length = 0;
    enemyBullets.length = 0;
    swoopers.length = 0;
    boss = null;
    swooperCooldown = 3.5;

    state.score = 0;
    state.lives = 3;
    state.wave  = 1;
    state.playing = true;
    setPaused(false);

    $score.textContent = "Score: 0";
    $lives.textContent = "Lives: 3";
    $wave.textContent  = "Wave: 1";

    player.x = canvas.width/2 - player.w/2;
    player.y = canvas.height - 120;
    player.canShootAt = 0;

    spawnWave(state.wave);
    $gameOver.hidden = true;

    // reset loop timestamp to prevent jump after overlay
    requestAnimationFrame(ts => { last = ts; loop(ts); });
  }

  if ($tryAgain) $tryAgain.addEventListener('click', resetGame);

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

    btnPlay.addEventListener('click', () => { if (!playing) widget.play(); else widget.pause(); });
    btnPrev.addEventListener('click', () => widget.prev());
    btnNext.addEventListener('click', () => widget.next());
    vol.addEventListener('input', () => widget.setVolume(parseFloat(vol.value)*100));

    widget.bind(SC.Widget.Events.PLAY,  () => { playing = true;  btnPlay.textContent = '⏸'; });
    widget.bind(SC.Widget.Events.PAUSE, () => { playing = false; btnPlay.textContent = '▶'; });

    const prime = () => { widget.setVolume(parseFloat(vol.value)*100); widget.play(); window.removeEventListener('click', prime); };
    window.addEventListener('click', prime, { once: true });
  }

  // ====== HIGH SCORES (local, with daily-sync hook) ======
  const HS_KEY = 'ebmarah_galaxian_highscores';
  const HS_SYNC_KEY = 'ebmarah_galaxian_last_sync';

  function readHighScores(){
    try { return JSON.parse(localStorage.getItem(HS_KEY)) || []; }
    catch { return []; }
  }
  function writeHighScores(list){
    localStorage.setItem(HS_KEY, JSON.stringify(list));
  }

  function saveHighScore(score, wave){
    let list = readHighScores();
    const best = (list[0]?.score || 0);
    // prompt for name on top-10 or if beating best
    if (list.length < 10 || score > list[list.length-1].score || score >= best){
      const name = (prompt("New High Score! Enter your name (or leave blank):","") || "Anonymous").slice(0,24);
      list.push({ name, score, wave, date: new Date().toISOString() });
      list.sort((a,b) => b.score - a.score);
      list = list.slice(0, 15); // keep a little buffer
      writeHighScores(list);
    }
  }

  function renderHighScores(){
    const list = readHighScores();
    $hsList.innerHTML = '';
    if (!list.length){
      $hsList.innerHTML = '<li>No scores yet. Be the first!</li>';
      return;
    }
    list.slice(0,10).forEach((row, i) => {
      const li = document.createElement('li');
      const d = new Date(row.date);
      li.textContent = `${i+1}. ${row.name || 'Anonymous'} — ${row.score} pts (Wave ${row.wave}) • ${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`;
      $hsList.appendChild(li);
    });
  }

  function maybeDailySync(){
    // Placeholder: If you want cross-player/global boards,
    // call your backend here when 24h has passed since last sync.
    const last = localStorage.getItem(HS_SYNC_KEY);
    const now = Date.now();
    if (!last || (now - Number(last)) > 24*60*60*1000){
      // TODO: fetch/post to backend (Supabase/Firestore/etc.)
      localStorage.setItem(HS_SYNC_KEY, String(now));
    }
  }

  if ($highBtn){
    $highBtn.addEventListener('click', () => {
      maybeDailySync();
      renderHighScores();
      $highModal.hidden = false;
    });
  }
  if ($hsClose){
    $hsClose.addEventListener('click', () => { $highModal.hidden = true; });
  }
  if ($highModal){
    $highModal.addEventListener('click', (e) => {
      if (e.target === $highModal) $highModal.hidden = true;
    });
  }

  // ====== STARTUP ======
  (async function start(){
    await loadEnemyImages();
    spawnWave(state.wave);
    setupSC();
    requestAnimationFrame(loop);
  })();

})();
