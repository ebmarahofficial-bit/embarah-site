(() => {
  /* ---------------- Query flags ---------------- */
  const url = new URL(location.href);
  const DEBUG = url.searchParams.get('debug') === '1';

  /* ---------------- Config (easier & smoother) ---------------- */
  const lanes = 3;
  const laneX = [0.22, 0.5, 0.78];     // lane center ratios
  const gravity = 0.86;                 // slightly softer gravity
  const jumpV  = -15.5;                 // gentler jump

  // Easier pacing
  const BANANAS_PER_LEVEL = 8;          // fewer bananas to level
  const MAX_LEVELS = 10;
  const obstacleSpeedBase = 3.4;        // slower base speed
  const obstacleSpeedGain = 0.003;      // slower ramp
  const spawnEveryBase = 140;           // fewer spawns
  const spawnEveryMin  = 95;
  const bananaSpawnEvery = 120;         // bananas appear a bit more often

  // Fair collision thresholds
  const HIT_AREA_RATIO = 0.20;          // ~20% rect overlap to count as a hit
  const BANANA_RADIUS  = 26;            // generous pickup radius

  /* ---------------- DOM refs ---------------- */
  const stage = document.getElementById('stage');
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const bgVid = document.getElementById('bg-video');
  function tryPlayBG(){ if (bgVid && bgVid.paused) bgVid.play().catch(()=>{}); }
  window.addEventListener('load', tryPlayBG);
  document.addEventListener('click', tryPlayBG);
  document.addEventListener('touchstart', tryPlayBG, {passive:true});
  document.addEventListener('visibilitychange', tryPlayBG);

  const hud = document.getElementById('hud');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const bananasEl = document.getElementById('bananas');
  const nextReqEl = document.getElementById('nextReq');
  const levelEl = document.getElementById('level');
  const pauseBtn = document.getElementById('pauseBtn');
  const muteBtn  = document.getElementById('muteBtn');

  const overlay   = document.getElementById('overlay');
  const panel     = document.getElementById('panel');
  const startBtn  = document.getElementById('startBtn');
  const selectBtn = document.getElementById('selectBtn');
  const levelSelect = document.getElementById('levelSelect');
  const grid = document.getElementById('grid');

  const controls = document.getElementById('controls');
  const leftBtn  = document.getElementById('leftBtn');
  const rightBtn = document.getElementById('rightBtn');
  const jumpBtn  = document.getElementById('jumpBtn');
  const exitBtn  = document.getElementById('exitBtn');
  const startCover = document.getElementById('startCover');

  /* ---------------- SoundCloud ---------------- */
  const widget = window.SC?.Widget?.(document.getElementById('sc-iframe'));
  let musicEnabled = true, widgetReady = false;
  if (widget) widget.bind(window.SC.Widget.Events.READY, () => { widgetReady = true; widget.setVolume(70); });
  const playMusic = () => { if (musicEnabled && widgetReady) widget.play(); };
  const pauseMusic = () => { if (widgetReady) widget.pause(); };
  muteBtn.addEventListener('click', () => {
    musicEnabled = !musicEnabled;
    muteBtn.textContent = musicEnabled ? '🔊' : '🔇';
    if (!musicEnabled) pauseMusic(); else playMusic();
  });

  /* ---------------- Assets (HTML is root; level art is under ./runner/assets/...) ---------------- */
  function levelPath(i){ return `./runner/assets/levels/level${i}`; }
  const images = { player:new Image(), banana:new Image(), bg:new Image(), obstacle:new Image(), accent:new Image() };
  images.player.src = "./runner/assets/runner/gorilla.png";
  images.banana.src = "./runner/assets/runner/banana.png";

  function loadLevelAssets(i){
    return new Promise((res,rej)=>{
      let left = 3;
      const done = ()=>{ if(--left===0) res(); };
      images.bg.onload = done; images.obstacle.onload = done; images.accent.onload = done;
      images.bg.onerror = images.obstacle.onerror = images.accent.onerror = rej;
      const base = levelPath(i);
      images.bg.src = `${base}/background.png`;   // tileable horizontally
      images.obstacle.src = `${base}/obstacle.png`;
      images.accent.src   = `${base}/accent.png`;
    }).catch(()=>{});
  }

  /* ---------------- Mobile fullscreen sizing (phones only) ---------------- */
  const isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
  function sizeStageToViewport() {
    if (!isTouch) return;
    const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
    const vh = (window.visualViewport?.height) || window.innerHeight;
    stage.style.width  = vw + 'px';
    stage.style.height = vh + 'px';
  }
  sizeStageToViewport();
  window.addEventListener('resize', sizeStageToViewport);
  window.addEventListener('orientationchange', sizeStageToViewport);
  window.visualViewport && window.visualViewport.addEventListener('resize', sizeStageToViewport);

  // DPR scaling for crisp rendering
  function resizeCanvas(){
    const ratio = Math.max(1, Math.min(3, Math.floor(window.devicePixelRatio || 1)));
    const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
    canvas.width  = Math.round(cssW * ratio);
    canvas.height = Math.round(cssH * ratio);
    ctx.setTransform(ratio,0,0,ratio,0,0);
    ctx.imageSmoothingEnabled = false;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('orientationchange', resizeCanvas);
  document.addEventListener('visibilitychange', () => { if(!document.hidden){ sizeStageToViewport(); resizeCanvas(); tryPlayBG(); } });

  /* ---------------- Game State ---------------- */
  let playing=false, paused=false, frame=0;
  let speed=obstacleSpeedBase, spawnEvery=spawnEveryBase;
  let score=0, best= +localStorage.getItem('ebmarah_runner_best') || 0;
  let bananas=0, level=1, bananasForNext=BANANAS_PER_LEVEL;
  let unlocked = JSON.parse(localStorage.getItem('ebmarah_unlocked') || '[1]');
  const saveUnlocked = () => localStorage.setItem('ebmarah_unlocked', JSON.stringify(unlocked));
  bestEl.textContent = best; nextReqEl.textContent = bananasForNext; levelEl.textContent = level;

  const player = { lane:1, x(){ return laneX[this.lane]*canvas.clientWidth }, y:0, vy:0, w:64, h:64, jumping:false };
  const obstacles=[], bananasOnField=[], accents=[];
  let bgScrollX = 0, mistPhase = 0;
  const groundY = () => Math.round(canvas.clientHeight*0.81);

  function spawnAccent(){
    accents.push({ x:Math.random()*canvas.clientWidth, y:120+Math.random()*220, vy:(Math.random()*0.6)-0.3, vx:(Math.random()*0.2)+0.2 });
    if (accents.length>10) accents.shift();
  }

  function resetRun(startLevel=1){
    sizeStageToViewport(); resizeCanvas(); tryPlayBG();
    playing=true; paused=false; frame=0;
    speed = obstacleSpeedBase; spawnEvery = spawnEveryBase;
    score=0; bananas=0; bananasForNext=BANANAS_PER_LEVEL;
    level=startLevel; levelEl.textContent = level;
    bestEl.textContent = best; bananasEl.textContent = bananas; nextReqEl.textContent = bananasForNext;
    obstacles.length=0; bananasOnField.length=0; accents.length=0;
    player.lane=1; player.y=groundY(); player.vy=0; player.jumping=false;
    bgScrollX=0; mistPhase=0;
    hud.hidden=false; controls.hidden = isTouch ? false : true; overlay.style.display='none';
    exitBtn.hidden = false;
    startCover.style.display = 'none';
    Promise.resolve(loadLevelAssets(level)).then(()=>{ playMusic(); requestAnimationFrame(loop); }).catch(()=>{ requestAnimationFrame(loop); });
  }

  /* ---------------- Level Select ---------------- */
  function rebuildLevelGrid(){
    grid.innerHTML = '';
    for(let i=1;i<=MAX_LEVELS;i++){
      const b = document.createElement('button');
      b.className = 'btn'; b.textContent = `Level ${i}`;
      const open = unlocked.includes(i);
      if (!open) b.disabled = true;
      b.addEventListener('click', ()=> resetRun(i));
      grid.appendChild(b);
    }
  }
  selectBtn.addEventListener('click', ()=>{
    levelSelect.hidden = !levelSelect.hidden;
    rebuildLevelGrid();
  });
  startBtn.addEventListener('click', ()=> resetRun(1));

  /* ---------------- Pause / Exit ---------------- */
  pauseBtn.addEventListener('click', ()=>{
    if (!playing) return;
    paused = !paused;
    pauseBtn.textContent = paused ? '▶ Resume' : '⏸ Pause';
    if (!paused) requestAnimationFrame(loop);
  });
  exitBtn.addEventListener('click', ()=>{
    playing=false; paused=false;
    pauseMusic();
    hud.hidden=true; controls.hidden=true; exitBtn.hidden=true;
    overlay.style.display='grid';
    startCover.style.display = ''; // show cover again
  });

  /* ---------------- Collision helpers ---------------- */
  function collideRect(ax,ay,aw,ah, bx,by,bw,bh){ return ax < bx+bw && ax+aw > bx && ay < by+bh && ay+ah > by; }
  function rectIntersectionArea(ax,ay,aw,ah, bx,by,bw,bh){
    const x1 = Math.max(ax, bx), y1 = Math.max(ay, by);
    const x2 = Math.min(ax+aw, bx+bw), y2 = Math.min(ay+ah, by+bh);
    const w = x2 - x1, h = y2 - y1;
    return (w>0 && h>0) ? w*h : 0;
  }
  function getPlayerHitbox(){
    const px = player.x()-player.w/2;
    const py = player.y - player.h;
    const w = player.w * 0.80;
    const h = player.h * 0.90;
    const x = px + (player.w - w)/2;
    const y = py + (player.h - h)/2;
    return {x,y,w,h};
  }
  function getObstacleHitbox(o){
    const baseY = groundY() - 64 + 6;
    const near = Math.max(0, 1 - Math.abs(o.x - player.x())/200);
    const s = 54 + Math.floor(near*2);        // slightly smaller than sprite
    const w = s*0.88, h = s*0.88;
    const x = o.x - w/2;
    const y = baseY - (s-64) + (s-h);
    return {x,y,w,h};
  }
  function bananaHit(b){
    const r = BANANA_RADIUS;
    const bx = b.x, by = b.y;
    const hb = getPlayerHitbox();
    const cx = Math.max(hb.x, Math.min(bx, hb.x + hb.w));
    const cy = Math.max(hb.y, Math.min(by, hb.y + hb.h));
    const dx = bx - cx, dy = by - cy;
    return (dx*dx + dy*dy) <= (r*r);
  }

  function levelUp(){
    if (!unlocked.includes(level+1) && level<MAX_LEVELS){ unlocked.push(level+1); saveUnlocked(); }
    level = Math.min(MAX_LEVELS, level+1);
    levelEl.textContent = level;
    bananasForNext += BANANAS_PER_LEVEL; nextReqEl.textContent = bananasForNext;
    loadLevelAssets(level);
    for(let i=0;i<6;i++) spawnAccent();
  }

  /* ---------------- Drawing (endless BG) ---------------- */
  function drawScrollingBG(){
    if (!images.bg.complete) {
      ctx.fillStyle='#05150f'; 
      ctx.fillRect(0,0,canvas.clientWidth,canvas.clientHeight);
      return;
    }
    const iw = images.bg.naturalWidth, ih = images.bg.naturalHeight;
    const scale = canvas.clientHeight/ih;
    const dw = iw*scale, dh = canvas.clientHeight;

    const pxPerFrame = 1.0 + speed*0.14;    // slightly slower scroll (easier)
    bgScrollX = (bgScrollX + pxPerFrame) % dw;
    let startX = -bgScrollX;

    for(let x = startX; x < canvas.clientWidth; x += dw){
      ctx.drawImage(images.bg, Math.round(x), 0, Math.round(dw), Math.round(dh));
    }

    // ground highlights
    ctx.fillStyle = '#0a3'; ctx.fillRect(0, groundY()+32, canvas.clientWidth, 6);
    ctx.fillStyle = '#0c5'; ctx.fillRect(0, groundY()+38, canvas.clientWidth, 2);
  }

  function drawPlayer(){
    const x=player.x()-player.w/2, y=player.y-player.h;
    if (images.player.complete) ctx.drawImage(images.player, x, y, player.w, player.h);
    else { ctx.fillStyle='#1b2a28'; ctx.fillRect(x,y,player.w,player.h); }
    if (DEBUG){ const hb = getPlayerHitbox(); ctx.strokeStyle='#00ffff'; ctx.lineWidth=2; ctx.strokeRect(hb.x, hb.y, hb.w, hb.h); }
  }
  function drawObstacle(o){
    const baseY = groundY() - 64 + 6;
    if (images.obstacle.complete) {
      const near = Math.max(0, 1 - Math.abs(o.x - player.x())/200);
      const s = 54 + Math.floor(near*2);
      ctx.drawImage(images.obstacle, o.x - s/2, baseY-(s-64), s, s);
    } else { ctx.fillStyle='#195'; ctx.fillRect(o.x-27, baseY-64, 54, 64); }
    if (DEBUG){ const ob = getObstacleHitbox(o); ctx.strokeStyle='#ff00ff'; ctx.lineWidth=2; ctx.strokeRect(ob.x, ob.y, ob.w, ob.h); }
  }
  function drawBanana(b){
    const s=40;
    if (images.banana.complete){
      const pulse = 1 + 0.05*Math.sin(frame*0.18);
      ctx.drawImage(images.banana, b.x-(s*pulse)/2, b.y-(s*pulse)/2, s*pulse, s*pulse);
    } else { ctx.fillStyle='#fd0'; ctx.fillRect(b.x-s/2,b.y-s/2,s,s); }
    if (DEBUG){ ctx.beginPath(); ctx.arc(b.x, b.y, BANANA_RADIUS, 0, Math.PI*2); ctx.strokeStyle='#ffff00'; ctx.lineWidth=2; ctx.stroke(); }
  }

  /* ---------------- Controls ---------------- */
  function moveLeft(){ if (player.lane>0) player.lane--; }
  function moveRight(){ if (player.lane<lanes-1) player.lane++; }
  function jump(){ if (!player.jumping){ player.vy = jumpV; player.jumping = true; } }

  window.addEventListener('keydown', e=>{
    if (e.key==='ArrowLeft'){ e.preventDefault(); moveLeft(); }
    if (e.key==='ArrowRight'){ e.preventDefault(); moveRight(); }
    if (e.key===' ' || e.key==='ArrowUp'){ e.preventDefault(); jump(); }
    if (e.key==='Escape'){
      if (!playing) return;
      paused = !paused;
      pauseBtn.textContent = paused ? '▶ Resume' : '⏸ Pause';
      if (!paused) requestAnimationFrame(loop);
    }
  }, {passive:false});

  leftBtn.addEventListener('click', moveLeft);
  rightBtn.addEventListener('click', moveRight);
  jumpBtn.addEventListener('click',  jump);

  if (isTouch) controls.hidden = false;

  /* ---------------- Loop ---------------- */
  function rectArea(r){ return r.w * r.h; }
  function loop(){
    if (!playing || paused) return;

    frame++;
    speed += obstacleSpeedGain;
    spawnEvery = Math.max(spawnEveryMin, spawnEveryBase - Math.floor(frame/260));

    // physics
    player.vy += gravity;
    player.y += player.vy;
    if (player.y > groundY()){ player.y=groundY(); player.vy=0; player.jumping=false; }

    // spawns
    if (frame % spawnEvery === 0){
      const lane = Math.floor(Math.random()*lanes);
      obstacles.push({ lane, x: canvas.clientWidth + 60 });
    }
    if (frame % bananaSpawnEvery === 0){
      const lane = Math.floor(Math.random()*lanes);
      bananasOnField.push({ lane, x: canvas.clientWidth + 60, y: groundY() - 76 });
    }

    // move
    for (let i=obstacles.length-1;i>=0;i--){
      obstacles[i].x -= speed;
      if (obstacles[i].x < -100) obstacles.splice(i,1);
    }
    for (let i=bananasOnField.length-1;i>=0;i--){
      const b = bananasOnField[i];
      b.x -= speed*0.88;
      b.y = groundY() - 82 + Math.sin((frame+i)*0.1)*10;
      if (b.x < -100) bananasOnField.splice(i,1);
    }

    // collisions (fair)
    const hb = getPlayerHitbox();
    const hbArea = rectArea(hb);
    for (const o of obstacles){
      if (o.lane === player.lane){
        const ob = getObstacleHitbox(o);
        if (collideRect(hb.x,hb.y,hb.w,hb.h, ob.x,ob.y,ob.w,ob.h)){
          const interA = rectIntersectionArea(hb.x,hb.y,hb.w,hb.h, ob.x,ob.y,ob.w,ob.h);
          if (interA > HIT_AREA_RATIO * hbArea) return endGame();
        }
      }
    }
    for (let i=bananasOnField.length-1;i>=0;i--){
      const b = bananasOnField[i];
      if (b.lane === player.lane && bananaHit(b)){
        bananas++; bananasEl.textContent = bananas; score += 12;
        bananasOnField.splice(i,1);
        if (bananas >= bananasForNext && level < MAX_LEVELS) levelUp();
      }
    }

    // score
    score += 0.08 + speed*0.012;

    // draw
    ctx.clearRect(0,0,canvas.clientWidth,canvas.clientHeight);
    drawScrollingBG();

    // lane guides (subtle)
    ctx.save(); ctx.globalAlpha=.12; ctx.setLineDash([10,14]); ctx.lineWidth=2; ctx.strokeStyle='#0f7';
    for(let i=0;i<lanes;i++){ const x=laneX[i]*canvas.clientWidth; ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.clientHeight); ctx.stroke(); }
    ctx.restore();

    obstacles.forEach(drawObstacle);
    bananasOnField.forEach(drawBanana);
    drawPlayer();

    scoreEl.textContent = Math.floor(score);
    bestEl.textContent  = best;

    requestAnimationFrame(loop);
  }

  function endGame(){
    playing=false; pauseMusic();
    if (Math.floor(score) > best){ best = Math.floor(score); localStorage.setItem('ebmarah_runner_best', best); }
    hud.hidden=true; controls.hidden=true; exitBtn.hidden=true;
    overlay.style.display='grid';
    startCover.style.display = ''; // show cover again
    panel.innerHTML = `
      <h1 class="title">GAME OVER</h1>
      <p>Level <b>${level}</b> • Bananas <b>${bananas}</b> • Score <b>${Math.floor(score)}</b> • Best <b>${best}</b></p>
      <div class="btnrow">
        <button class="btn" id="restartBtn">Play Again</button>
        <button class="btn" id="selectBtn2">Level Select</button>
        <button class="btn" id="musicToggle">${musicEnabled ? '🔊 Music' : '🔇 Music'}</button>
      </div>
    `;
    document.getElementById('restartBtn').addEventListener('click', ()=> resetRun(level));
    document.getElementById('selectBtn2').addEventListener('click', ()=>{
      panel.innerHTML = '';
      panel.appendChild(levelSelect);
      levelSelect.hidden=false;
      rebuildLevelGrid();
    });
    document.getElementById('musicToggle').addEventListener('click', ()=>{
      musicEnabled = !musicEnabled; if (!musicEnabled) pauseMusic(); else playMusic();
      document.getElementById('musicToggle').textContent = musicEnabled ? '🔊 Music' : '🔇 Music';
    });
  }

  /* ---------------- Build level select + init ---------------- */
  function rebuildLevelGrid(){
    grid.innerHTML = '';
    for(let i=1;i<=MAX_LEVELS;i++){
      const b = document.createElement('button');
      b.className = 'btn'; b.textContent = `Level ${i}`;
      const open = unlocked.includes(i);
      if (!open) b.disabled = true;
      b.addEventListener('click', ()=> resetRun(i));
      grid.appendChild(b);
    }
  }

  function init(){
    rebuildLevelGrid();
    bestEl.textContent = best;
  }
  init();
})();
