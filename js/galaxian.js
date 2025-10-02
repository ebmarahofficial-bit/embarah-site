/* Ebmarah Galaxian — bosses every 10 waves starting at 10
   - Start menu with ship naming + background (assets/ebmarahgamestart.png)
   - Ship name renders under the ship during gameplay
   - All existing features preserved (power-ups, swoopers, pause, SC widget, highscores, etc.)
*/
(() => {
  // ---- Mobile height helper ----
  function setAppHeight(){
    document.documentElement.style.setProperty('--app-h', `${window.innerHeight}px`);
  }
  setAppHeight();
  window.addEventListener('resize', setAppHeight);
  window.addEventListener('orientationchange', setAppHeight);

  // ====== LOGO SOURCES ======
  const LOGO_URLS = [
    "assets/logos/skism.png",
    "assets/logos/skrillex.png",
    "assets/logos/eptic.png",
    "assets/logos/knife_party.png",
    "assets/logos/calcium.png",
    "assets/logos/barelyalive.png",
    "assets/logos/truth.png",
    "assets/logos/cyclops.png",
    "assets/logos/diretybeats.png",
    "assets/logos/espioth.png",
    "assets/logos/fermilat.png",
    "assets/logos/metallik.png",
    "assets/logos/hvted.png",
  ];

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

  // ===== START MENU OVERLAY (ship naming) =====
  const startOverlay = document.createElement('div');
  startOverlay.id = 'startOverlay';
  startOverlay.style = "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:#000;";
  startOverlay.innerHTML = `
    <div style="position:relative;width:min(100%,1000px);">
      <img src="assets/ebmarahgamestart.png" alt="Start" style="width:100%;height:auto;display:block;"/>
      <div style="position:absolute;left:50%;bottom:10%;transform:translateX(-50%);
                  background:rgba(0,0,0,.65);padding:16px 18px;border-radius:10px;
                  border:1px solid rgba(0,255,200,.35);display:flex;flex-direction:column;gap:10px;align-items:center;
                  box-shadow:0 0 24px rgba(0,255,180,.25);">
        <h1 style="margin:4px 0 2px;color:#e9fef8;letter-spacing:.06em;">SPACEMARAH</h1>
        <label for="shipNameInput" style="color:#b9fff0;font-size:14px;">Name your ship</label>
        <input id="shipNameInput" type="text" maxlength="20" placeholder="My Ship"
          style="width:220px;padding:10px 12px;border-radius:8px;border:1px solid #39fbd1;background:#061a17;color:#eafffb;outline:none;"/>
        <button id="startBtn" style="padding:10px 16px;border-radius:10px;border:1px solid #39fbd1;background:#0b2e28;color:#cafff4;cursor:pointer;font-weight:700;letter-spacing:.04em;">
          Start Game
        </button>
      </div>
    </div>`;
  document.body.appendChild(startOverlay);
  const $shipInput = startOverlay.querySelector('#shipNameInput');
  const $startBtn = startOverlay.querySelector('#startBtn');

  // ====== GAME STATE ======
  const state = {
    score: 0,
    lives: 3,
    wave: 1,
    playing: false,
    paused: false,
    shipName: "",
    playerSpeed: 320,       // base px/sec (Super Speed scales this)
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
  const bullets = [];        // player bullets (also holds beam)
  const enemyBullets = [];   // enemy bullets

  // Player ship
  const player = {
    x: canvas.width/2 - 36, y: canvas.height - 120,
    w: 72, h: 52,
    canShootAt: 0
  };

  // Enemies, movement
  let enemies = [];
  let enemyDir = 1;
  let enemySpeed = state.enemyBaseSpeed;
  let enemyImages = [];

  // Boss (every 10th wave starting at 10)
  let boss = null; // {x,y,w,h,imgIdx,hp,maxHp,baseX,amp,freq,t,vy,alive}
  const BOSS_HP_BASE = 42;
  const BOSS_HP_STEP = 8;

  // Swoopers (side attackers)
  const swoopers = [];
  let swooperCooldown = 3.5;

  // ====== POWER-UPS ======
  const POWER_TYPES = {
    RAPID:  { key:'RAPID',  label:'R',  color:'#7fffd4', dur: 10, effect:'faster_fire'   },
    MULTI:  { key:'MULTI',  label:'M',  color:'#ffd27f', dur: 12, effect:'multishot2'    },
    SPREAD: { key:'SPREAD', label:'S',  color:'#d07fff', dur: 10, effect:'spread5'       },
    SHIELD: { key:'SHIELD', label:'⭘',  color:'#35ffa0', dur: 999,effect:'shield1'      },
    BEAM:   { key:'BEAM',   label:'B',  color:'#7fb8ff', dur: 8,  effect:'beam'          },
    LIFE:   { key:'LIFE',   label:'+1', color:'#fff37f', dur: 0,  effect:'extra_life'    },
    SHIELD2:{ key:'SHIELD2',label:'⭘2', color:'#92ffc6', dur: 999,effect:'shield2'      },
    DRONE:  { key:'DRONE',  label:'D',  color:'#9fe0ff', dur: 12, effect:'drone'         },
    FREEZE: { key:'FREEZE', label:'Fz', color:'#aff8ff', dur: 6,  effect:'freeze'        },
    MAGNET: { key:'MAGNET', label:'Mg', color:'#c0ff9f', dur: 12, effect:'magnet'        },
    DOUBLE: { key:'DOUBLE', label:'2x', color:'#ffe49f', dur: 15, effect:'double'        },
    PIERCE: { key:'PIERCE', label:'P',  color:'#9fb8ff', dur: 10, effect:'pierce'        },
    SUPER:  { key:'SUPER',  label:'Sp', color:'#a2ffcf', dur: 10, effect:'superspeed'    },
  };

  const POWER_WEIGHTS = [
    [POWER_TYPES.RAPID,   5.0],
    [POWER_TYPES.MULTI,   3.5],
    [POWER_TYPES.SPREAD,  2.5],
    [POWER_TYPES.MAGNET,  1.6],
    [POWER_TYPES.SUPER,   1.5],
    [POWER_TYPES.DRONE,   1.4],
    [POWER_TYPES.DOUBLE,  1.1],
    [POWER_TYPES.FREEZE,  0.9],
    [POWER_TYPES.PIERCE,  0.8],
    [POWER_TYPES.SHIELD,  0.7],
    [POWER_TYPES.SHIELD2, 0.6],
    [POWER_TYPES.LIFE,    0.35],
    [POWER_TYPES.BEAM,    0.10],
  ];
  function weightedChoice(weighted){
    const total = weighted.reduce((s,[,w])=>s+w,0);
    let r = Math.random()*total;
    for (const [t,w] of weighted){ if ((r-=w)<=0) return t; }
    return weighted[0][0];
  }

  const buffs = {
    rapidUntil: 0,
    multishotUntil: 0,
    spreadUntil: 0,
    beamUntil: 0,
    shieldHits: 0,
    shield2Hits: 0,
    droneUntil: 0, droneAccum: 0,
    freezeUntil: 0,
    magnetUntil: 0,
    doubleUntil: 0,
    pierceUntil: 0,
    superUntil: 0,
  };

  const powerUps = [];
  let powerupTimer = 18 + Math.random()*16;
  const KILL_DROP_CHANCE = 0.04;    // 4% on normal enemy kills
  const LIFE_SUPER_RARE  = 0.006;   // 0.6% extra life chance
  const SWOOPER_DROP_CHANCE = 0.03;
  const BOSS_DROP_COUNT = 2;
  const BOSS_LIFE_DROP = 1;

  function spawnPowerUp(x,y,forcedType){
    const t = forcedType || weightedChoice(POWER_WEIGHTS);
    powerUps.push({ x,y,w:26,h:26, vy:120+Math.random()*80, type:t, spin:Math.random()*Math.PI*2 });
  }
  function updatePowerUps(dt){
    powerupTimer -= dt;
    if (powerupTimer <= 0){
      spawnPowerUp(30 + Math.random()*(canvas.width - 60), -30, undefined);
      powerupTimer = 20 + Math.random()*18;
    }
    for (let i=powerUps.length-1; i>=0; i--){
      const p = powerUps[i];

      // Magnet pull
      if (performance.now() < buffs.magnetUntil){
        const pcx = p.x + p.w/2, pcy = p.y + p.h/2;
        const cx = player.x + player.w/2, cy = player.y + player.h/2;
        const dx = cx - pcx, dy = cy - pcy;
        const dist = Math.hypot(dx,dy) || 1;
        const R = 240;
        if (dist < R){
          const pull = 220;
          p.x += (dx/dist) * pull * dt;
          p.y += (dy/dist) * pull * dt;
        }
      }

      p.y += p.vy * dt;
      p.spin += dt*3;

      if (p.y > canvas.height + 40){ powerUps.splice(i,1); continue; }
      if (rectsOverlap(p, {x:player.x,y:player.y,w:player.w,h:player.h})){
        applyPowerUp(p.type);
        addScore(25);
        powerUps.splice(i,1);
      }
    }
  }
  function drawPowerUps(){
    powerUps.forEach(p=>{
      ctx.save();
      ctx.translate(p.x+p.w/2,p.y+p.h/2);
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
      ctx.fillText(p.type.label,0,1);
      ctx.restore();
    });
  }
  function applyPowerUp(t){
    const now = performance.now();
    switch(t.key){
      case 'RAPID':  buffs.rapidUntil     = Math.max(buffs.rapidUntil, now) + t.dur*1000; break;
      case 'MULTI':  buffs.multishotUntil = Math.max(buffs.multishotUntil, now) + t.dur*1000; break;
      case 'SPREAD': buffs.spreadUntil    = Math.max(buffs.spreadUntil, now) + t.dur*1000; break;
      case 'BEAM':   buffs.beamUntil      = Math.max(buffs.beamUntil, now) + t.dur*1000; break;
      case 'SHIELD': buffs.shieldHits    += 1; break;
      case 'LIFE':   state.lives += 1; $lives.textContent = "Lives: " + state.lives; break;
      case 'SHIELD2': buffs.shield2Hits += 2; break;
      case 'DRONE':    buffs.droneUntil  = Math.max(buffs.droneUntil, now) + t.dur*1000; break;
      case 'FREEZE':   buffs.freezeUntil = Math.max(buffs.freezeUntil, now) + t.dur*1000; break;
      case 'MAGNET':   buffs.magnetUntil = Math.max(buffs.magnetUntil, now) + t.dur*1000; break;
      case 'DOUBLE':   buffs.doubleUntil = Math.max(buffs.doubleUntil, now) + t.dur*1000; break;
      case 'PIERCE':   buffs.pierceUntil = Math.max(buffs.pierceUntil, now) + t.dur*1000; break;
      case 'SUPER':    buffs.superUntil  = Math.max(buffs.superUntil, now) + t.dur*1000; break;
    }
  }

  // ====== IMAGE LOADING ======
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
  loadImage(SHIP_IMG).then(img=>shipImg=img);

  function waveLogoIndex(wave){ return Math.floor((wave - 1) / 5) % LOGO_URLS.length; }

  // ====== INIT ENEMY FORMATION or BOSS ======
  function spawnWave(wave){
    boss = null;
    enemies.length = 0;

    // Boss waves at 10 and every 10 thereafter
    const isBossWave = (wave % 10 === 0 && wave >= 10);
    const idx = waveLogoIndex(wave);

    if (isBossWave){
      const w = Math.floor(canvas.width * 0.28);
      const h = Math.floor(canvas.height * 0.22);
      const baseX = canvas.width/2;
      const hp = BOSS_HP_BASE + Math.floor(wave / 3) * BOSS_HP_STEP;
      boss = { x: baseX - w/2, y: 90, w, h, imgIdx: idx, hp, maxHp: hp, baseX, amp: 120, freq: 1.2, t: 0, vy: 20, alive: true };
      enemySpeed = state.enemyBaseSpeed + (wave-1)*12;
    } else {
      const cols = state.enemyCols;
      const rows = state.enemyRowsBase + Math.floor((wave-1)/2);
      const startX = 60, startY = 70;
      for(let r=0;r<rows;r++){
        for(let c=0;c<cols;c++){
          enemies.push({ x:startX+c*(state.enemyW+state.enemyGapX), y:startY+r*(state.enemyH+state.enemyGapY), w:state.enemyW,h:state.enemyH,imgIdx:idx, alive:true });
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

  // Touch + buttons
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
      if (!el) return;
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
  if (isTouch){
    window.addEventListener('blur', stopAutoFire);
    window.addEventListener('focus', () => { if (state.playing && !state.paused) startAutoFire(); });
  }

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
  function togglePause(){ if (!state.playing) return; setPaused(!state.paused); }
  if ($pauseBtn){ $pauseBtn.addEventListener('click', togglePause); }

  // ====== UTILS (score, speeds) ======
  function addScore(n){
    const mult = performance.now() < buffs.doubleUntil ? 2 : 1;
    state.score += n * mult;
    $score.textContent = "Score: " + state.score;
  }
  function currentCooldownMs(){
    return (performance.now() < buffs.rapidUntil) ? Math.max(80, state.playerCooldownMs * 0.6) : state.playerCooldownMs;
  }
  function currentPlayerSpeed(){
    return (performance.now() < buffs.superUntil) ? state.playerSpeed * 1.5 : state.playerSpeed;
  }
  function freezeFactor(){ // < 1 = slower enemies
    return (performance.now() < buffs.freezeUntil) ? 0.55 : 1;
  }

  // ====== SHOOTING with BUFFS ======
  function attemptShoot(){
    if (!state.playing || state.paused) return;
    const now = performance.now();
    if (now < player.canShootAt) return;

    const usingBeam = (now < buffs.beamUntil);

    if (usingBeam){
      bullets.push({
        type:'beam',
        x: player.x + player.w/2 - 3,
        y: 0,
        w: 6, h: player.y-8,
        life: 0.22
      });
      player.canShootAt = now + Math.max(60, currentCooldownMs() * 0.6);
      return;
    }

    const shots = [];
    const centerX = player.x + player.w/2;
    const baseVy = -state.bulletSpeed;
    const hasMulti  = (now < buffs.multishotUntil);
    const hasSpread = (now < buffs.spreadUntil);
    const hasPierce = (now < buffs.pierceUntil);

    const makeShot = (x, vx=0) => ({ x, y: player.y - 8, w: 4, h: 10, vx, vy: baseVy, pierce: hasPierce ? 1 : 0 });

    if (hasSpread){
      [-0.35, -0.18, 0, 0.18, 0.35].forEach(a => shots.push(makeShot(centerX - 2, a*420)));
    } else if (hasMulti){
      shots.push(makeShot(centerX - 10, 0));
      shots.push(makeShot(centerX + 6,  0));
    } else {
      shots.push(makeShot(centerX - 2, 0));
    }

    shots.forEach(s => bullets.push(s));
    player.canShootAt = now + currentCooldownMs();
  }

  // ====== ENEMY FIRE PATTERNS ======
  function angleToPlayer(x, y){
    const cx = player.x + player.w/2, cy = player.y + player.h/2;
    const dx = cx - x, dy = cy - y;
    const len = Math.hypot(dx, dy) || 1;
    return { ux: dx/len, uy: dy/len, angle: Math.atan2(dy, dx) };
  }
  function pushEnemyBullet(b){ enemyBullets.push(b); }

  function spawnEnemyShotBasic(e){
    const r = Math.random();
    const x = e.x + e.w/2 - 2, y = e.y + e.h;
    if (r < 0.55){
      pushEnemyBullet({ x, y, w:4, h:10, vy: 240 + Math.random()*90, vx:0, type:'normal' });
    } else if (r < 0.70){
      pushEnemyBullet({ x, y, w:3, h:8, vy: 430 + Math.random()*160, vx:0, type:'needle' });
    } else if (r < 0.84){
      pushEnemyBullet({ x: x-1, y, w:6, h:14, vy: 150 + Math.random()*60, vx:0, type:'heavy' });
    } else if (r < 0.93){
      pushEnemyBullet({ x, y, w:4, h:10, vy: 260, vx:0, type:'zigzag', t:0, amp: 70, freq: 3, baseX: x });
    } else {
      const {ux,uy} = angleToPlayer(x,y);
      const speed = 300 + Math.random()*80;
      pushEnemyBullet({ x, y, w:4, h:10, vy: uy*speed, vx: ux*speed, type:'aimed' });
    }
  }

  function spawnBossShots(){
    if (!boss || !boss.alive) return;
    const r = Math.random();
    const cx = boss.x + boss.w/2, y0 = boss.y + boss.h;
    if (r < 0.55){
      pushEnemyBullet({ x: cx-2, y: y0, w:4, h:10, vy: 280 + Math.random()*120, vx:0, type:'normal' });
    } else if (r < 0.80){
      const {angle} = angleToPlayer(cx,y0);
      const speed = 300;
      [-0.2, 0, 0.2].forEach(off=>{
        pushEnemyBullet({ x: cx-2, y: y0, w:4, h:10, vx: Math.cos(angle+off)*speed, vy: Math.sin(angle+off)*speed, type:'aimed' });
      });
    } else {
      const {angle} = angleToPlayer(cx,y0);
      const speed = 320;
      [-0.35,-0.18,0,0.18,0.35].forEach(off=>{
        pushEnemyBullet({ x: cx-2, y: y0, w:4, h:10, vx: Math.cos(angle+off)*speed, vy: Math.sin(angle+off)*speed, type:'aimed' });
      });
    }
  }

  // ====== COLLISION ======
  function rectsOverlap(a,b){
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ====== ENEMY BEHAVIOR ======
  function updateEnemies(dt){
    const fz = freezeFactor();

    if (boss && boss.alive){
      boss.t += dt * fz;
      boss.x = boss.baseX + Math.sin(boss.t * boss.freq) * boss.amp - boss.w/2;
      boss.y = 90 + Math.sin(boss.t * 0.7) * 10;

      if (Math.random() < 0.9 * dt * fz){ spawnBossShots(); }
      return;
    }

    let minX = Infinity, maxX = -Infinity;
    const mv = enemySpeed * dt * fz;

    enemies.forEach(e=>{
      if(!e.alive) return;
      e.x += enemyDir * mv;
      minX = Math.min(minX, e.x);
      maxX = Math.max(maxX, e.x + e.w);

      if (Math.random() < state.enemyShotRate * dt * fz){
        spawnEnemyShotBasic(e);
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

  // Swoopers — random logo
  function spawnSwooper(){
    const randIdx  = Math.floor(Math.random() * LOGO_URLS.length);
    const baseX = 60 + Math.random()*(canvas.width - 120);
    swoopers.push({
      baseX, x: baseX, y: -40, w: state.enemyW, h: state.enemyH,
      imgIdx: randIdx, t: 0, vy: 180 + Math.random()*80,
      amp: 60 + Math.random()*50, freq: 2 + Math.random()*1.5, alive: true
    });
  }
  function updateSwoopers(dt){
    const fz = freezeFactor();
    swooperCooldown -= dt * fz;
    if (swooperCooldown <= 0){ spawnSwooper(); swooperCooldown = 4 + Math.random()*4; }
    for (let i=swoopers.length-1; i>=0; i--){
      const s = swoopers[i];
      if (!s.alive) { swoopers.splice(i,1); continue; }
      s.t += dt * fz;
      s.y += s.vy * dt * fz;
      s.x = s.baseX + Math.sin(s.t * s.freq) * s.amp;
      if (s.y > canvas.height + 60) swoopers.splice(i,1);
    }
  }

  // ====== DRONE (ally shooter) ======
  function updateDrone(dt){
    if (!(performance.now() < buffs.droneUntil)) return;
    buffs.droneAccum += dt;
    const interval = 0.35; // seconds per shot
    while (buffs.droneAccum >= interval){
      buffs.droneAccum -= interval;

      // Aim at nearest target
      let target = null;
      let bestD = Infinity;
      const centerOf = (o)=>({ x:o.x + o.w/2, y:o.y + o.h/2 });

      enemies.forEach(e=>{
        if (!e.alive) return;
        const c = centerOf(e);
        const dx = c.x - (player.x + player.w/2);
        const dy = c.y - (player.y + player.h/2);
        const d = dx*dx + dy*dy;
        if (d < bestD){ bestD = d; target = c; }
      });
      swoopers.forEach(s=>{
        if (!s.alive) return;
        const c = centerOf(s);
        const dx = c.x - (player.x + player.w/2);
        const dy = c.y - (player.y + player.h/2);
        const d = dx*dx + dy*dy;
        if (d < bestD){ bestD = d; target = c; }
      });
      if (boss && boss.alive){
        const c = centerOf(boss);
        const dx = c.x - (player.x + player.w/2);
        const dy = c.y - (player.y + player.h/2);
        const d = dx*dx + dy*dy;
        if (d < bestD){ bestD = d; target = c; }
      }

      const sx = player.x + player.w/2, sy = player.y - 10;
      if (target){
        const dx = target.x - sx, dy = target.y - sy;
        const len = Math.hypot(dx,dy) || 1;
        const spd = state.bulletSpeed * 0.95;
        bullets.push({ x: sx-2, y: sy, w:4, h:10, vx: (dx/len)*spd, vy: (dy/len)*spd });
      } else {
        bullets.push({ x: sx-2, y: sy, w:4, h:10, vx: 0, vy: -state.bulletSpeed });
      }
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

  // ====== DRAW PLAYER + NAME ======
  function drawPlayer(){
    if (shipImg){ ctx.drawImage(shipImg, player.x, player.y, player.w, player.h); }
    else {
      // fallback triangle
      ctx.save();
      ctx.translate(player.x + player.w/2, player.y + player.h/2);
      ctx.shadowBlur = 18; ctx.shadowColor = 'rgba(53,255,160,0.8)';
      ctx.fillStyle = 'rgba(53,255,160,0.95)';
      ctx.beginPath();
      ctx.moveTo(-28, 24); ctx.lineTo(0, -24); ctx.lineTo(28, 24); ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Ship Name under the ship
    if (state.shipName){
      ctx.save();
      ctx.font = '16px Orbitron, system-ui';
      ctx.fillStyle = '#eafffb';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,255,200,.45)';
      ctx.shadowBlur = 10;
      ctx.fillText(state.shipName, player.x + player.w/2, player.y + player.h + 18);
      ctx.restore();
    }

    // Shield rings (1-hit + 2-hit stack visually)
    const ringHits = (buffs.shieldHits > 0 ? 1 : 0) + (buffs.shield2Hits > 0 ? 1 : 0);
    if (ringHits > 0){
      for (let r=0; r<ringHits; r++){
        ctx.save();
        ctx.strokeStyle = r === 0 ? 'rgba(53,255,160,0.85)' : 'rgba(146,255,198,0.85)';
        ctx.lineWidth = 3;
        ctx.shadowBlur = 12;
        ctx.shadowColor = ctx.strokeStyle;
        const cx = player.x + player.w/2, cy = player.y + player.h/2;
        const rad = Math.max(player.w, player.h) * (0.65 + r*0.08);
        ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI*2); ctx.stroke();
        ctx.restore();
      }
    }
  }

  // ====== GAME LOOP ======
  let last = 0;
  function loop(ts){
    if (!last) last = ts;
    let dt = (ts - last) / 1000;  // seconds
    if (dt > 0.05) dt = 0.05;     // clamp big frames
    last = ts;

    if (!state.playing) return;

    if (state.paused){
      if ($pauseBadge){ $pauseBadge.hidden = false; }
      requestAnimationFrame(loop);
      return;
    } else if ($pauseBadge){ $pauseBadge.hidden = true; }

    // Movement
    const ps = currentPlayerSpeed();
    if (keys.left)  player.x -= ps * dt;
    if (keys.right) player.x += ps * dt;
    if (keys.up)    player.y -= ps * dt;
    if (keys.down)  player.y += ps * dt;

    // Bounds
    player.x = Math.max(10, Math.min(canvas.width - player.w - 10, player.x));
    player.y = Math.max(60, Math.min(canvas.height - player.h - 10, player.y));

    // Manual fire (desktop)
    if (!isMobile && keys.fire) attemptShoot();

    // Drone updates
    updateDrone(dt);

    // Player bullets
    for (let i=bullets.length-1; i>=0; i--){
      const b = bullets[i];
      if (b.type === 'beam'){
        b.life -= dt;
        if (b.life <= 0){ bullets.splice(i,1); }
        continue;
      }
      b.x += (b.vx || 0) * dt;
      b.y += b.vy * dt;
      if (b.y < -20 || b.x < -20 || b.x > canvas.width+20){ bullets.splice(i,1); continue; }
    }

    // Enemy bullets (move + special; slowed by Freeze)
    const fz = freezeFactor();
    for (let i=enemyBullets.length-1; i>=0; i--){
      const b = enemyBullets[i];
      if (b.type === 'zigzag'){
        b.t = (b.t || 0) + dt * fz;
        b.x = (b.baseX || b.x) + Math.sin(b.t * (b.freq || 3)) * (b.amp || 70);
      } else {
        b.x += (b.vx || 0) * dt * fz;
      }
      b.y += b.vy * dt * fz;
      if (b.y > canvas.height+24 || b.x < -40 || b.x > canvas.width+40){ enemyBullets.splice(i,1); }
    }

    // Enemies, swoopers, powerups
    updateEnemies(dt);
    updateSwoopers(dt);
    updatePowerUps(dt);

    // Collisions: player bullets vs enemies/boss/swoopers
    for (let i=bullets.length-1; i>=0; i--){
      const b = bullets[i];

      if (b.type === 'beam'){
        const beamRect = { x: b.x, y: 0, w: b.w, h: player.y - 8 };

        if (boss && boss.alive && rectsOverlap(beamRect, boss)){
          boss.hp -= 0.9;
          if (boss.hp <= 0){ boss.alive = false; addScore(300); }
          addScore(2);
        }

        for (let j=0; j<enemies.length; j++){
          const e = enemies[j];
          if (!e.alive) continue;
          if (rectsOverlap(beamRect, e)){
            e.alive = false;
            addScore(50);
            if (Math.random() < KILL_DROP_CHANCE) spawnPowerUp(e.x+e.w/2, e.y+e.h/2);
            if (Math.random() < LIFE_SUPER_RARE)  spawnPowerUp(e.x+e.w/2, e.y+e.h/2, POWER_TYPES.LIFE);
          }
        }

        for (let k=0; k<swoopers.length; k++){
          const s = swoopers[k];
          if (!s.alive) continue;
          if (rectsOverlap(beamRect, s)){
            s.alive = false;
            addScore(100);
            if (Math.random() < SWOOPER_DROP_CHANCE) spawnPowerUp(s.x+s.w/2, s.y+s.h/2);
            if (Math.random() < LIFE_SUPER_RARE)     spawnPowerUp(s.x+s.w/2, s.y+s.h/2, POWER_TYPES.LIFE);
          }
        }
        continue; // beam persists
      }

      let consumed = false;

      // vs boss
      if (boss && boss.alive && rectsOverlap(b, boss)){
        if (b.pierce && b.pierce > 0){
          b.pierce -= 1; // keep flying
        } else {
          bullets.splice(i,1);
          consumed = true;
        }
        boss.hp -= 1;
        addScore(25);
        if (boss.hp <= 0){
          boss.alive = false;
          addScore(300);
          // Boss drops: random items + guaranteed Life
          for (let d=0; d<BOSS_DROP_COUNT; d++){
            spawnPowerUp(boss.x + boss.w*Math.random(), boss.y + boss.h/2);
          }
          for (let d=0; d<BOSS_LIFE_DROP; d++){
            spawnPowerUp(boss.x + boss.w*Math.random(), boss.y + boss.h/2, POWER_TYPES.LIFE);
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
          addScore(50);

          if (b.pierce && b.pierce > 0){
            b.pierce -= 1; // bullet continues
          } else {
            bullets.splice(i,1);
          }

          if (Math.random() < KILL_DROP_CHANCE) spawnPowerUp(e.x+e.w/2, e.y+e.h/2);
          if (Math.random() < LIFE_SUPER_RARE)  spawnPowerUp(e.x+e.w/2, e.y+e.h/2, POWER_TYPES.LIFE);
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
          addScore(100);

          if (b.pierce && b.pierce > 0){
            b.pierce -= 1;
          } else {
            bullets.splice(i,1);
          }

          if (Math.random() < SWOOPER_DROP_CHANCE) spawnPowerUp(s.x+s.w/2, s.y+s.h/2);
          if (Math.random() < LIFE_SUPER_RARE)     spawnPowerUp(s.x+s.w/2, s.y+s.h/2, POWER_TYPES.LIFE);
          break;
        }
      }
    }

    // Enemy bullets vs player (shields absorb)
    for (let i=enemyBullets.length-1; i>=0; i--){
      const b = enemyBullets[i];
      if (rectsOverlap(b, {x:player.x,y:player.y,w:player.w,h:player.h})){
        enemyBullets.splice(i,1);

        if (buffs.shield2Hits > 0){ buffs.shield2Hits -= 1; addScore(5); continue; }
        if (buffs.shieldHits  > 0){ buffs.shieldHits  -= 1; addScore(5); continue; }

        // no shield -> lose life
        state.lives--;
        $lives.textContent = "Lives: " + state.lives;
        player.x = canvas.width/2 - player.w/2;
        player.y = canvas.height - 120;
        if (state.lives <= 0) gameOver();
      }
    }

    // Wave progression (endless)
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
      const hpw = Math.max(0, (boss.hp / boss.maxHp) * boss.w);
      ctx.fillRect(boss.x, boss.y - 12, hpw, 6);
    } else {
      enemies.forEach(e => { if (e.alive) drawEnemyRectLikeLogo(e); });
    }
    swoopers.forEach(s => { if (s.alive) drawEnemyRectLikeLogo(s); });

    // power-ups
    drawPowerUps();

    // bullets (beam under)
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
    powerupTimer = 18 + Math.random()*16;

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

    // reset buffs
    Object.keys(buffs).forEach(k=>{
      if (typeof buffs[k] === 'number') buffs[k] = 0;
    });

    spawnWave(state.wave);
    $gameOver.hidden = true;

    if (isTouch) startAutoFire();
    requestAnimationFrame(ts => { last = ts; loop(ts); });
  }

  if ($tryAgain) $tryAgain.addEventListener('click', resetGame);

  // ====== MUSIC (SoundCloud Widget API) ======
  let widget = null;
  function setupSC(){
    const iframe = document.getElementById('scPlayer');
    if (!iframe || typeof SC === 'undefined' || !SC.Widget) return;
    // eslint-disable-next-line no-undef
    widget = SC.Widget(iframe);

    const btnPlay = document.getElementById('btnPlay');
    const btnPrev = document.getElementById('btnPrev');
    const btnNext = document.getElementById('btnNext');
    const vol = document.getElementById('vol');

    let playing = false;

    if (btnPlay) btnPlay.addEventListener('click', () => { if (!playing) widget.play(); else widget.pause(); });
    if (btnPrev) btnPrev.addEventListener('click', () => widget.prev());
    if (btnNext) btnNext.addEventListener('click', () => widget.next());
    if (vol) vol.addEventListener('input', () => widget.setVolume(parseFloat(vol.value)*100));

    widget.bind(SC.Widget.Events.PLAY,  () => { playing = true;  if (btnPlay) btnPlay.textContent = '⏸'; });
    widget.bind(SC.Widget.Events.PAUSE, () => { playing = false; if (btnPlay) btnPlay.textContent = '▶'; });

    const prime = () => { if (vol) widget.setVolume(parseFloat(vol.value)*100); widget.play(); window.removeEventListener('click', prime); };
    window.addEventListener('click', prime, { once: true });
  }

  // ====== HIGH SCORES (local) ======
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
      li.textContent = `${i+1}. ${row.name || 'Anonymous'} — ${row.score} pts (Wave ${row.wave}) • ` +
                       `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`;
      $hsList.appendChild(li);
    });
  }

  function maybeDailySync(){
    const last = localStorage.getItem(HS_SYNC_KEY);
    const now = Date.now();
    if (!last || (now - Number(last)) > 24*60*60*1000){
      // hook for backend sync if needed
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
    setupSC();

    // Start Menu actions
    const begin = () => {
      state.shipName = ($shipInput.value || "Anonymous").trim().slice(0,20);
      startOverlay.style.display = "none";

      // Prime HUD
      $score.textContent = "Score: 0";
      $lives.textContent = "Lives: 3";
      $wave.textContent  = "Wave: 1";

      // Begin game
      state.playing = true;
      spawnWave(state.wave);
      if (isTouch) startAutoFire();
      requestAnimationFrame(loop);
    };
    $startBtn.addEventListener('click', begin);
    $shipInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') begin(); });
    $shipInput.focus({ preventScroll:true });
  })();

})();
