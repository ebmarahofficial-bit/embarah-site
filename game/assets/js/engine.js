
// game/assets/js/engine.js
// Vanilla JS canvas engine for Dubstep Tower. Assumes DT_LEVELS is defined (see levels.js).
(function(){
  const W = 960, H = 540;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  canvas.width = W; canvas.height = H;

  // Menu toggle
  const burger = document.getElementById('burger');
  const nav = document.getElementById('nav');
  const toggle = ()=> nav && nav.classList.toggle('open');
  if (burger) {
    burger.addEventListener('click', toggle);
    burger.addEventListener('keydown', e=>{ if(e.key==='Enter' || e.key===' ') toggle(); });
  }

  // Asset paths
  const ART = {
    player: 'game/assets/sprites/player.png',
    boss: 'game/assets/sprites/boss.png',
    enemy: 'game/assets/sprites/enemy_speaker.png',
    particles: 'game/assets/sprites/particles.png'
  };
  const SFX = {
    jump: new Audio('game/assets/audio/jump.mp3'),
    hit:  new Audio('game/assets/audio/hit.mp3'),
    throw:new Audio('game/assets/audio/throw.mp3'),
    win:  new Audio('game/assets/audio/win.mp3'),
  };
  for (const k in SFX) SFX[k].volume = 0.5;

  const IM = {};
  for (const [k,src] of Object.entries(ART)) { IM[k] = new Image(); IM[k].src = src; }

  // Levels
  const LEVEL_PATHS = (window.DT_LEVELS || []);
  let currentLevelIndex = 0;
  let L = null;

  // Entities
  const P = { x:0,y:0,vx:0,vy:0,w:28,h:34,onGround:false,climbing:false,lives:3 };
  const keys = { left:false,right:false,up:false };
  let enemies = [];
  let boss = null;
  const subs = [];

  // State
  let won=false, lost=false, elapsed=0, screenFlash=0;
  const livesEl = document.getElementById('lives');
  const timeEl  = document.getElementById('time');
  const levelNameEl = document.getElementById('levelName');

  // Input
  addEventListener('keydown', e=>{
    if(e.code==='ArrowLeft') keys.left=true;
    if(e.code==='ArrowRight') keys.right=true;
    if(e.code==='ArrowUp') keys.up=true;
    if(e.code==='KeyR') restart();
    if(e.code==='KeyN') nextLevel();
  });
  addEventListener('keyup', e=>{
    if(e.code==='ArrowLeft') keys.left=false;
    if(e.code==='ArrowRight') keys.right=false;
    if(e.code==='ArrowUp') keys.up=false;
  });
  const hold = (el, key)=>{
    if(!el) return;
    const on=()=>{keys[key]=true};
    const off=()=>{keys[key]=false};
    el.addEventListener('pointerdown',on);
    el.addEventListener('pointerup',off);
    el.addEventListener('pointerleave',off);
    el.addEventListener('pointercancel',off);
  };
  hold(document.getElementById('left'), 'left');
  hold(document.getElementById('right'),'right');
  hold(document.getElementById('jump'), 'up');

  function aabb(a,b){ return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y; }

  async function loadLevel(i){
    if (!LEVEL_PATHS[i]) return;
    const res = await fetch(LEVEL_PATHS[i]);
    L = await res.json();
    if(levelNameEl) levelNameEl.textContent = L.name || `Level ${i+1}`;
    P.x=L.spawn.x; P.y=L.spawn.y; P.vx=0; P.vy=0; P.onGround=false; P.climbing=false; P.lives=3;
    enemies = JSON.parse(JSON.stringify(L.enemies||[]));
    boss = L.boss ? {...L.boss, t:0} : null;
    subs.length = 0;
    won=false; lost=false; elapsed=0; screenFlash=0;
    document.getElementById('overlayWin')?.classList.remove('show');
    document.getElementById('overlayLose')?.classList.remove('show');
  }

  function restart(){ loadLevel(currentLevelIndex); }
  function nextLevel(){
    currentLevelIndex = (currentLevelIndex + 1) % LEVEL_PATHS.length;
    loadLevel(currentLevelIndex);
  }
  window.restart = restart;
  window.nextLevel = nextLevel;

  function spawnSub(){
    if(!boss) return;
    subs.push({ x: boss.x + boss.w*0.2, y: boss.y + boss.h*0.5, w:22,h:22, vx: - (120 + Math.random()*80), vy: 0, spin: 0 });
    try{ SFX.throw.currentTime = 0; SFX.throw.play(); }catch(e){}
  }

  function step(dt){
    if(!L || won || lost) return;
    elapsed += dt;

    const accel = 900;
    if(keys.left) P.vx -= accel*dt;
    if(keys.right) P.vx += accel*dt;

    // Ladder check
    P.climbing = false;
    for(const LZ of (L.ladders||[])){ if(aabb(P,{x:LZ.x,y:LZ.y,w:LZ.w,h:LZ.h})){ P.climbing=true; break; } }

    if(P.climbing){ P.vy *= 0.6; if(keys.up){ P.vy = -220; } }
    else { P.vy += (L.gravity||1600) * dt; }

    if(P.onGround && !P.climbing && keys.up){ P.vy = -480; P.onGround=false; try{SFX.jump.currentTime=0; SFX.jump.play();}catch(e){} }

    // Integrate
    P.x += P.vx*dt; P.y += P.vy*dt; P.vx *= (L.friction||0.86);

    // Collisions (top-only)
    P.onGround=false;
    for(const s of (L.platforms||[])){
      if(P.x<0) P.x=0; if(P.x+P.w>W) P.x=W-P.w;
      if(P.y+P.h > s.y && P.y+P.h < s.y+20 && P.x+P.w> s.x && P.x < s.x+s.w && P.vy>=0){
        P.y = s.y - P.h; P.vy=0; P.onGround=true;
      }
    }

    // Enemies
    for(const e of enemies){
      e.x += e.vx*dt;
      if(e.x < e.range[0]){ e.x = e.range[0]; e.vx *= -1; }
      if(e.x+e.w > e.range[1]){ e.x = e.range[1]-e.w; e.vx *= -1; }
      if(aabb(P,e)) damage();
    }

    // Boss
    if(boss){ boss.t += dt; if(boss.t >= boss.throwEvery){ boss.t = 0; spawnSub(); } }

    // Subs
    for(const s of subs){
      s.vy += (L.gravity||1600)*dt*0.55;
      s.x  += s.vx*dt;
      s.y  += s.vy*dt;
      s.spin += dt*8;
      for(const p of (L.platforms||[])){
        if(s.y+s.h > p.y && s.y+s.h < p.y+18 && s.x+s.w>p.x && s.x<p.x+p.w && s.vy>=0){
          s.y = p.y - s.h; s.vy *= -0.45; s.vx *= 0.98;
        }
      }
      if(aabb(P,s)) damage();
    }
    for(let i=subs.length-1;i>=0;i--){ if(subs[i].y>H+80 || subs[i].x<-80) subs.splice(i,1); }

    // Off-screen fall
    if(P.y > H+80) damage(true);

    // Win
    if(aabb(P, L.goal)) win();

    if(livesEl) livesEl.textContent = P.lives;
    if(timeEl)  timeEl.textContent  = elapsed.toFixed(1);
  }

  function win(){ won=true; document.getElementById('overlayWin')?.classList.add('show'); try{SFX.win.currentTime=0; SFX.win.play();}catch(e){} }
  function lose(){ lost=true; document.getElementById('overlayLose')?.classList.add('show'); }
  function damage(fell=false){
    if(won || lost) return;
    P.lives--; screenFlash=1.0;
    try{SFX.hit.currentTime=0; SFX.hit.play();}catch(e){}
    if(P.lives<=0) { lose(); } else { P.x=L.spawn.x; P.y=L.spawn.y; P.vx=0; P.vy = fell ? -200 : 0; }
  }

  function draw(){
    if(!L) return;
    // Background grid
    const g = ctx.createLinearGradient(0,0,W,H); g.addColorStop(0,'#00120a'); g.addColorStop(1,'#000');
    ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
    ctx.globalAlpha = 0.25; ctx.strokeStyle = '#0f6';
    for(let y=0;y<H;y+=24){ ctx.beginPath(); ctx.moveTo(0,y+.5); ctx.lineTo(W,y+.5); ctx.stroke(); }
    for(let x=0;x<W;x+=24){ ctx.beginPath(); ctx.moveTo(x+.5,0); ctx.lineTo(x+.5,H); ctx.stroke(); }
    ctx.globalAlpha = 1;

    // Goal
    const G = L.goal; ctx.shadowColor = '#0f8'; ctx.shadowBlur = 18; ctx.fillStyle = '#00ff99'; ctx.fillRect(G.x,G.y,G.w,G.h); ctx.shadowBlur = 0;

    // Platforms
    for(const s of (L.platforms||[])){
      const lg = ctx.createLinearGradient(s.x,s.y,s.x,s.y+s.h); lg.addColorStop(0,'#072'); lg.addColorStop(1,'#0a3');
      ctx.fillStyle = lg; ctx.fillRect(s.x,s.y,s.w,s.h);
      ctx.strokeStyle = '#0e6'; ctx.strokeRect(s.x+.5,s.y+.5,s.w-1,s.h-1);
    }

    // Ladders
    for(const LZ of (L.ladders||[])){
      ctx.fillStyle = '#0c6'; ctx.fillRect(LZ.x, LZ.y, LZ.w, LZ.h);
      ctx.strokeStyle = '#9ff'; ctx.globalAlpha=.4; ctx.strokeRect(LZ.x+.5,LZ.y+.5,LZ.w-1,LZ.h-1); ctx.globalAlpha=1;
    }

    // Enemies
    for(const e of enemies){
      if(IM.enemy.complete) ctx.drawImage(IM.enemy, e.x, e.y-4, e.w+8, e.h+8);
      else { ctx.fillStyle = '#061'; ctx.fillRect(e.x, e.y, e.w, e.h); }
    }

    // Boss
    if(boss){
      if(IM.boss.complete) ctx.drawImage(IM.boss, boss.x, boss.y, boss.w, boss.h);
      else { ctx.fillStyle = '#061'; ctx.fillRect(boss.x, boss.y, boss.w, boss.h); }
    }

    // Subs
    for(const s of subs){
      const cx = s.x+s.w/2, cy = s.y+s.h/2, r = s.w/2;
      ctx.save(); ctx.translate(cx,cy); ctx.rotate(s.spin);
      const grad = ctx.createRadialGradient(0,0,2,0,0,r); grad.addColorStop(0,'#222'); grad.addColorStop(1,'#444');
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#00ff99'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(0,0,r*0.65,0,Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0,0,r*0.35,0,Math.PI*2); ctx.stroke();
      ctx.restore();
    }

    // Player
    if(IM.player.complete) ctx.drawImage(IM.player, P.x-6, P.y-8, P.w+12, P.h+16);
    else { ctx.fillStyle = '#061'; ctx.fillRect(P.x, P.y, P.w, P.h); ctx.strokeStyle = '#9ff'; ctx.strokeRect(P.x+.5,P.y+.5,P.w-1,P.h-1); }

    // Hit flash
    if(screenFlash>0){ ctx.fillStyle = 'rgba(255,60,60,'+screenFlash*0.35+')'; ctx.fillRect(0,0,W,H); screenFlash*=0.92; }
  }

  // Loop
  let last = performance.now();
  function loop(now){ const dt = Math.min(1/30,(now-last)/1000); last=now; step(dt); draw(); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);

  // Boot
  loadLevel(currentLevelIndex);
})(); 
