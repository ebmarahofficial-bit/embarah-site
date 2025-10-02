/* Ebmarah Galaxian — now with Random Power-Ups
   Adds falling power-ups:
   - Rapid Fire (shorter cooldown)
   - Multishot (2 bullets)
   - Spread (5-way)
   - Shield (one free hit, visual ring)
   - Beam (brief piercing laser)
   Existing features (boss every 20 waves, bigger ship, highscores, pause, mobile auto-fire) preserved.
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
  const bullets = [];        // player bullets (also holds beam objects)
  const enemyBullets = [];   // enemy bullets

  // Slightly bigger player ship (kept)
  const player = {
    x: canvas.width/2 - 36, y: canvas.height - 120,
    w: 72, h: 52,
    canShootAt: 0
  };

  // Enemies (formation) & movement
  let enemies = [];
  let enemyDir = 1;
  let enemySpeed = state.enemyBaseSpeed;
  let enemyImages = [];

  // Boss (every 20th wave)
  let boss = null; // {x,y,w,h,imgIdx,hp,baseX,amp,freq,t,vy,alive}
  const BOSS_HP_BASE = 18;

  // Swoopers (side attackers)
  const swoopers = [];
  let swooperCooldown = 3.5; // seconds until first spawn

  // ====== POWER-UPS ======
  // Available types & durations (seconds)
  const POWER_TYPES = {
    RAPID:  { key:'RAPID',  label:'R', color:'#7fffd4', dur: 10, effect:'faster_fire'   },
    MULTI:  { key:'MULTI',  label:'M', color:'#ffd27f', dur: 12, effect:'multishot2'    },
    SPREAD: { key:'SPREAD', label:'S', color:'#d07fff', dur: 10, effect:'spread5'       },
    SHIELD: { key:'SHIELD', label:'⭘', color:'#35ffa0', dur: 999, effect:'shield1'      }, // 1-hit, no timer
    BEAM:   { key:'BEAM',   label:'B', color:'#7fb8ff', dur: 8,  effect:'beam'          },
  };
  const POWER_LIST = [POWER_TYPES.RAPID, POWER_TYPES.MULTI, POWER_TYPES.SPREAD, POWER_TYPES.SHIELD, POWER_TYPES.BEAM];

  // active buffs & timers
  const buffs = {
    rapidUntil: 0,
    multishotUntil: 0,
    spreadUntil: 0,
    beamUntil: 0,
    shieldHits: 0, // 0 or 1+
  };

  // power-up entities
  const powerUps = []; // {x,y,w,h,vy,type:POWER_TYPES, spin}

  // drop control
  let powerupTimer = 7 + Math.random()*8; // fallback periodic drop (sec)
  const KILL_DROP_CHANCE = 0.10;          // 10% on enemy kill
  const BOSS_DROP_COUNT = 2;              // on boss death

  function randPowerType(){
    // Slightly bias non-shield (~2x)
    const pool = [POWER_TYPES.RAPID, POWER_TYPES.MULTI, POWER_TYPES.SPREAD, POWER_TYPES.BEAM,
                  POWER_TYPES.RAPID, POWER_TYPES.MULTI, POWER_TYPES.SPREAD, POWER_TYPES.BEAM,
                  POWER_TYPES.SHIELD];
    return pool[Math.floor(Math.random()*pool.length)];
  }

  function spawnPowerUp(x, y, forcedType){
    const t = forcedType || randPowerType();
    powerUps.push({
      x: x, y: y, w: 26, h: 26,
      vy: 120 + Math.random()*80,
      type: t,
      spin: Math.random()*Math.PI*2
    });
  }

  function updatePowerUps(dt){
    powerupTimer -= dt;
    if (powerupTimer <= 0){
      // periodic spawn from top
      spawnPowerUp(30 + Math.random()*(canvas.width - 60), -30, undefined);
      powerupTimer = 10 + Math.random()*10;
    }

    for (let i=powerUps.length-1; i>=0; i--){
      const p = powerUps[i];
      p.y += p.vy * dt;
      p.spin += dt*3;
      if (p.y > canvas.height + 40){ powerUps.splice(i,1); continue; }

      // pickup
      if (rectsOverlap(p, {x:player.x, y:player.y, w:player.w, h:player.h})){
        applyPowerUp(p.type);
        // tiny score bonus for pickup
        state.score += 25;
        $score.textContent = "Score: " + state.score;
        powerUps.splice(i,1);
      }
    }
  }

  function drawPowerUps(){
    powerUps.forEach(p=>{
      // neon coin w/ letter
      ctx.save();
      ctx.translate(p.x + p.w/2, p.y + p.h/2);
      ctx.rotate(Math.sin(p.spin)*0.3);

      ctx.shadowBlur = 10;
      ctx.shadowColor = p.type.color;
      ctx.lineWidth = 2;
      ctx.strokeStyle = p.type.color;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.arc(0,0,p.w/2,0,Math.PI*2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = p.type.color;
      ctx.font = 'bold 14px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.type.label, 0, 1);
      ctx.restore();
    });
  }

  function applyPowerUp(t){
    const now = performance.now();
    switch(t.key){
      case 'RAPID':
        buffs.rapidUntil = Math.max(buffs.rapidUntil, now) + t.dur*1000;
        break;
      case 'MULTI':
        buffs.multishotUntil = Math.max(buffs.multishotUntil, now) + t.dur*1000;
        break;
      case 'SPREAD':
        buffs.spreadUntil = Math.max(buffs.spreadUntil, now) + t.dur*1000;
        break;
      case 'BEAM':
        buffs.beamUntil = Math.max(buffs.beamUntil, now) + t.dur*1000;
        break;
      case 'SHIELD':
        buffs.shieldHits += 1; // stackable one-hit shields
        break;
    }
  }

  function isBuffActive(until){ return performance.now() < until; }

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

  function waveLogoIndex(wave){
    const block = Math.floor((wave - 1) / 5);
    return block % LOGO_URLS.length;
  }

  // ====== INIT ENEMY FORMATION or BOSS ======
  function spawnWave(wave){
    boss = null;
    enemies = [];
    const isBossWave = (wave % 20 === 0);

    const idx = waveLogoIndex(wave);

    if (isBossWave){
      const w = Math.floor(canvas.width * 0.28);
      const h = Math.floor(canvas.height * 0.22);
      const baseX = canvas.width/2;
      boss = {
        x: baseX - w/2,
        y: 90,
        w, h,
        imgIdx: idx,
        hp: BOSS_HP_BASE + Math.floor(wave / 4),
        baseX,
        amp: 120,
        freq: 1.2,
        t: 0,
        vy: 20,
        alive: true
      };
      enemySpeed = state.enemyBaseSpeed + (wave-1)*12;
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
            imgIdx: idx,
            alive: true
          });
        }
      }
      enemyDir = 1;
      enemySpeed = state.enemyBaseSpeed + (wave-1)*12;
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
    autoFireTimer = setInterval(() => attemptShoot(), Math.max(80, currentCooldownMs()));
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

  // ====== SHOOTING with BUFFS ======
  function currentCooldownMs(){
    return isBuffActive(buffs.rapidUntil) ? Math.max(80, state.playerCooldownMs * 0.6) : state.playerCooldownMs;
  }

  function attemptShoot(){
    const now = performance.now();
    if (now < player.canShootAt) return;

    const usingBeam = isBuffActive(buffs.beamUntil);

    if (usingBeam){
      // short-lived piercing beam
      bullets.push({
        type:'beam',
        x: player.x + player.w/2 - 3,
        y: 0,                // beam draws from top to player.y
        w: 6, h: player.y-8, // visual length
        life: 0.22           // seconds beam lasts
      });
      player.canShootAt = now + Math.max(60, currentCooldownMs() * 0.6); // faster cadence with beam
      return;
    }

    // Standard bullets – apply multishot / spread
    const shots = [];
    const centerX = player.x + player.w/2;
    const baseVy = -state.bulletSpeed;

    const hasMulti  = isBuffActive(buffs.multishotUntil);
    const hasSpread = isBuffActive(buffs.spreadUntil);

    if (hasSpread){
      // 5-way spread (angled by vx)
      const angles = [-0.35, -0.18, 0, 0.18, 0.35];
      angles.forEach(a => {
        shots.push({ x: centerX - 2, y: player.y - 8, w: 4, h: 10, vx: a*420, vy: baseVy });
      });
    } else if (hasMulti){
      // 2 parallel shots
      shots.push({ x: centerX - 10, y: player.y - 8, w: 4, h: 10, vx: 0, vy: baseVy });
      shots.push({ x: centerX + 6,  y: player.y - 8, w: 4, h: 10, vx: 0, vy: baseVy });
    } else {
      // single
      shots.push({ x: centerX - 2, y: player.y - 8, w: 4, h: 10, vx: 0, vy: baseVy });
    }

    shots.forEach(s => bullets.push(s));
    player.canShootAt = now + currentCooldownMs();
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
      boss.y = 90 + Math.sin(boss.t * 0.7) * 10;

      if (Math.random() < 0.9 * dt){
        enemyBullets.push({ x: boss.x + boss.w/2 - 2, y: boss.y + boss.h, w:4, h:10, vy: 260 + Math.random()*120 });
      }
      return;
    }

    let minX = Infinity, maxX = -Infinity;
    enemies.forEach(e=>{
      if(!e.alive) return;
      e.x += enemyDir * (enemySpeed * dt);
      minX = Math.min(minX, e.x);
      maxX = Math.max(maxX, e.x + e.w);

      if (Math.random() < state.enemyShotRate * dt){
        enemyBullets.push({ x: e.x+e.w/2-2, y: e.y+e.h, w: 4, h: 10, vy: 270 + Math.random()*90 });
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

    // Shield ring
    if (buffs.shieldHits > 0){
      ctx.save();
      ctx.strokeStyle = 'rgba(53,255,160,0.85)';
      ctx.lineWidth = 3;
      ctx.shadowBlur = 12;
      ctx.shadowColor = 'rgba(53,255,160,0.95)';
      const cx = player.x + player.w/2, cy = player.y + player.h/2;
      const r = Math.max(player.w, player.h) * 0.7;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke();
      ctx.restore();
    }
  }

  // ====== GAME LOOP ======
  let last = 0;
  function loop(ts){
    if (!last) last = ts;
    let dt = (ts - last) / 1000;
    if (dt > 0.05) dt = 0.05;
    last = ts;

    if (!state.playing) return;

    if (state.paused){
      if ($pauseBadge){ $pauseBadge.hidden = false; }
      requestAnimationFrame(loop);
      return;
    } else if ($pauseBadge){ $pauseBadge.hidden = true; }

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
    for (let i=bullets.length-1; i>=0; i--){
      const b = bullets[i];
      if (b.type === 'beam'){
        b.life -= dt;
        if (b.life <= 0){ bullets.splice(i,1); continue; }
        // beam does not move
      } else {
        // standard bullet (vx may exist for spread)
        b.x += (b.vx || 0) * dt;
        b.y += b.vy * dt;
        if (b.y < -20 || b.x < -20 || b.x > canvas.width+20){ bullets.splice(i,1); continue; }
      }
    }

    // Enemy bullets
    enemyBullets.forEach(b => b.y += b.vy * dt);
    for (let i=enemyBullets.length-1; i>=0; i--) if (enemyBullets[i].y > canvas.height+20) enemyBullets.splice(i,1);

    // Enemies & swoopers
    updateEnemies(dt);
    updateSwoopers(dt);

    // Power-ups
    updatePowerUps(dt);

    // Collisions: player bullets vs enemies/boss/swoopers
    for (let i=bullets.length-1; i>=0; i--){
      const b = bullets[i];

      if (b.type === 'beam'){
        // treat beam as tall rect from top to player.y
        const beamRect = { x: b.x, y: 0, w: b.w, h: player.y - 8 };

        // vs boss
        if (boss && boss.alive && rectsOverlap(beamRect, boss)){
          boss.hp -= 0.9; // beam chips per frame
          if (boss.hp <= 0){ boss.alive = false; state.score += 300; $score.textContent = "Score: " + state.score; }
          state.score += 2; $score.textContent = "Score: " + state.score;
        }

        // vs formation
        for (let j=0; j<enemies.length; j++){
          const e = enemies[j];
          if (!e.alive) continue;
          if (rectsOverlap(beamRect, e)){
            e.alive = false;
            state.score += 50;
            $score.textContent = "Score: " + state.score;
            if (Math.random() < KILL_DROP_CHANCE) spawnPowerUp(e.x+e.w/2, e.y+e.h/2);
          }
        }

        // vs swoopers
        for (let k=0; k<swoopers.length; k++){
          const s = swoopers[k];
          if (!s.alive) continue;
          if (rectsOverlap(beamRect, s)){
            s.alive = false;
            state.score += 100;
            $score.textContent = "Score: " + state.score;
            if (Math.random() < KILL_DROP_CHANCE) spawnPowerUp(s.x+s.w/2, s.y+s.h/2);
          }
        }
        continue; // beam persists until life expires
      }

      // normal bullet
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
          state.score += 300;
          $score.textContent = "Score: " + state.score;
          // drop a couple of power-ups on boss death
          for (let d=0; d<BOSS_DROP_COUNT; d++){
            spawnPowerUp(boss.x + boss.w*Math.random(), boss.y + boss.h/2);
          }
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
          if (Math.random() < KILL_DROP_CHANCE) spawnPowerUp(e.x+e.w/2, e.y+e.h/2);
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
          state.score += 100;
          $score.textContent = "Score: " + state.score;
          if (Math.random() < KILL_DROP_CHANCE) spawnPowerUp(s.x+s.w/2, s.y+s.h/2);
          break;
        }
      }
    }

    // Enemy bullets vs player (with shield)
    for (let i=enemyBullets.length-1; i>=0; i--){
      if (rectsOverlap(enemyBullets[i], {x:player.x,y:player.y,w:player.w,h:player.h})){
        enemyBullets.splice(i,1);

        if (buffs.shieldHits > 0){
          buffs.shieldHits -= 1; // absorb
          // tiny flash score for style
          state.score += 5; $score.textContent = "Score: " + state.score;
        } else {
          state.lives--;
          $lives.textContent = "Lives: " + state.lives;
          player.x = canvas.width/2 - player.w/2;
          player.y = canvas.height - 120;
          if (state.lives <= 0) gameOver();
        }
      }
    }

    // Wave progression
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
      // HP bar
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.fillRect(boss.x, boss.y - 12, boss.w, 6);
      ctx.fillStyle = '#35ffa0';
      const hpw = Math.max(0, (boss.hp / (BOSS_HP_BASE + Math.floor(state.wave/4))) * boss.w);
      ctx.fillRect(boss.x, boss.y - 12, hpw, 6);
    } else {
      enemies.forEach(e => { if (e.alive) drawEnemyRectLikeLogo(e); });
    }
    swoopers.forEach(s => { if (s.alive) drawEnemyRectLikeLogo(s); });

    // power-ups
    drawPowerUps();

    // bullets
    // beam first (under), then normal
    bullets.forEach(b => {
      if (b.type === 'beam'){
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.shadowBlur = 14;
        ctx.shadowColor = '#7fb8ff';
        ctx.fillStyle = 'rgba(127,184,255,0.85)';
        ctx.fillRect(b.x, 0, b.w, player.y - 8);
        ctx.restore();
      }
    });
    ctx.fillStyle = '#7fffd4';
    bullets.forEach(b => { if (b.type !== 'beam') ctx.fillRect(b.x,b.y,b.w,b.h); });
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
    v: 18 + Math.random()*18
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
    powerUps.length = 0;
    boss = null;
    swooperCooldown = 3.5;
    powerupTimer = 7 + Math.random()*8;

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

    // clear buffs
    buffs.rapidUntil = 0;
    buffs.multishotUntil = 0;
    buffs.spreadUntil = 0;
    buffs.beamUntil = 0;
    buffs.shieldHits = 0;

    spawnWave(state.wave);
    $gameOver.hidden = true;

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
    if (list.length < 10 || score > list[list.length-1].score || score >= best){
      const name = (prompt("New High Score! Enter your name (or leave blank):","") || "Anonymous").slice(0,24);
      list.push({ name, score, wave, date: new Date().toISOString() });
      list.sort((a,b) => b.score - a.score);
      list = list.slice(0, 15);
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
