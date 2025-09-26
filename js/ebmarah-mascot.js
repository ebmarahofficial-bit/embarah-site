/* 
  Ebmarah Mascot – drop-reactive gorilla (responsive)
  ---------------------------------------------------
  Include with: <script src="/js/ebmarah-mascot.js"></script>
  Initialize with: EbmarahMascot.init({ audioSelector: 'audio#player', mode:'reactive' })

  Uses assets/mascot.png as the sprite.
*/

;(() => {
  const NS = 'ebm';
  const defaultLines = [
    'BANANA MODE ACTIVATED',
    'gorilla certified 🔊',
    'protect ya neck (sub)',
    'left a bass print',
    'i contain 140 bpm',
    'shut up justin'
  ];

  const API = { init, attachToAudio, throwBananas, say, setMood, destroy };
  let config = {}, root, sprite, bubble, trail, wrap;
  let audioEl, audioCtx, analyser, dataArrayFreq, rafId, lastDrop = 0;
  let baseline = 0, alpha = 0.04;
  let passiveTimer = null, bubbleTimer = null;
  let resizeRaf = 0;

  function init(userCfg = {}) {
    const BP = { mobile: 640, tablet: 1024 };

    config = {
      mode: 'passive',
      audioSelector: null,
      sizeMobile: 64,
      sizeTablet: 80,
      sizeDesktop: 96,
      position: 'bottom-right',
      bananaCountOnDrop: 6,
      dropCooldownMs: 1800,
      energyFactor: 2.15,
      minVolumeGate: 4,
      // merge user funnyLines with defaults
      funnyLines: defaultLines.concat(userCfg.funnyLines || []),
      idleBubbleEveryMs: [20000, 40000],
      respectReducedMotion: true,
      zIndex: 9999,
      connectToDestination: false,
      lowBandHz: 180,
      breakpoints: BP,
      ...userCfg,
    };

    injectStyles();
    createDOM();
    applyResponsiveSize();
    window.addEventListener('resize', onResize, { passive: true });

    if (config.mode === 'reactive' && config.audioSelector) {
      const el = document.querySelector(config.audioSelector);
      if (el) attachToAudio(el);
      else startPassive();
    } else startPassive();

    window.EbmarahMascot = API;
  }

  function onResize(){
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(applyResponsiveSize);
  }

  function applyResponsiveSize(){
    if (!root) return;
    const w = window.innerWidth || document.documentElement.clientWidth;
    const { breakpoints:BP, sizeMobile, sizeTablet, sizeDesktop } = config;

    let px = sizeDesktop;
    if (w < BP.mobile) px = sizeMobile;
    else if (w < BP.tablet) px = sizeTablet;

    root.style.setProperty('--ebm-size', px + 'px');
  }

  function createDOM() {
    root = document.createElement('div');
    root.id = `${NS}-root`;
    root.style.zIndex = String(config.zIndex);
    document.body.appendChild(root);

    wrap = document.createElement('div');
    wrap.className = `${NS}-wrap ${config.position}`;
    root.appendChild(wrap);

    sprite = document.createElement('div');
    sprite.className = `${NS}-sprite idle`;

    sprite.style.backgroundImage = "url('assets/mascot.png')";
    sprite.setAttribute('role','img');
    sprite.setAttribute('aria-label','Ebmarah mascot');

    wrap.appendChild(sprite);

    trail = document.createElement('div');
    trail.className = `${NS}-trail`;
    wrap.appendChild(trail);

    bubble = document.createElement('div');
    bubble.className = `${NS}-bubble hidden`;
    bubble.innerHTML = '<span></span>';
    wrap.appendChild(bubble);

    sprite.addEventListener('mouseenter',()=>setMood('curious'));
    sprite.addEventListener('mouseleave',()=>setMood('idle'));
    sprite.addEventListener('click',()=>{
      throwBananas(1);
      say(randomLine());
    });
  }

  function injectStyles(){
    if(document.getElementById(`${NS}-styles`)) return;
    const style=document.createElement('style');
    style.id=`${NS}-styles`;
    style.textContent=`
      :root { --${NS}-shadow: 0 10px 30px rgba(0,0,0,.35); }
      #${NS}-root { position: fixed; inset:auto 0 0 0; pointer-events:none; }

      .${NS}-wrap { position:absolute; pointer-events:none; }
      .${NS}-wrap.bottom-right{ right:16px; bottom:12px; }
      .${NS}-wrap.bottom-left{ left:16px; bottom:12px; }

      .${NS}-sprite {
        height:var(--ebm-size); width:var(--ebm-size);
        line-height:var(--ebm-size);
        text-align:center; user-select:none;
        filter:drop-shadow(var(--${NS}-shadow));
        transition:transform .12s ease;
        pointer-events:auto;
        display:grid; place-items:center;
        will-change:transform;
        animation:ebm-walk 8s linear infinite;
        background-size:contain;
        background-position:center;
        background-repeat:no-repeat;
      }
      .${NS}-sprite.drop{ animation:ebm-bob .5s ease 0s 4 alternate; }
      .${NS}-sprite.curious{ transform:scale(1.08) rotate(-4deg);}
      .${NS}-sprite.idle{ transform:none;}

      @keyframes ebm-walk{0%{transform:translateX(0)}50%{transform:translateX(-6px)}100%{transform:translateX(0)}}
      @keyframes ebm-bob{from{transform:translateY(0)}to{transform:translateY(-10%)}}

      .${NS}-bubble{
        position:absolute; bottom:calc(var(--ebm-size) + 10px);
        right:0; max-width:min(42ch,60vw);
        background:#fff; color:#111; border-radius:12px; padding:10px 12px;
        box-shadow:var(--${NS}-shadow);
        font:600 14px/1.3 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Inter,Arial;
        transform-origin:bottom right; animation:ebm-pop .18s ease;
        pointer-events:auto; cursor:default;
      }
      .${NS}-bubble.hidden{ display:none; }
      .${NS}-bubble::after{
        content:''; position:absolute; bottom:-8px; right:14px;
        width:14px; height:14px; background:#fff;
        box-shadow:var(--${NS}-shadow); transform:rotate(45deg);
      }
      @keyframes ebm-pop{from{transform:scale(.8); opacity:0}to{transform:scale(1); opacity:1}}

      .${NS}-trail{ position:absolute; inset:0; overflow:visible; pointer-events:none; }
      .${NS}-banana{
        position:absolute; bottom:40%; right:50%; font-size:20px;
        will-change:transform,opacity;
        animation:ebm-arc 900ms cubic-bezier(.17,.67,.32,1.25) forwards;
        filter:drop-shadow(0 4px 8px rgba(0,0,0,.35));
      }
      @keyframes ebm-arc{
        0%{transform:translate(0,0) rotate(0); opacity:1}
        70%{transform:translate(var(--dx),var(--dy)) rotate(90deg); opacity:1}
        100%{transform:translate(calc(var(--dx)+var(--dx2)),calc(var(--dy)+20px)) rotate(160deg); opacity:0}
      }
      @media(max-width:480px){ .${NS}-bubble{ max-width:75vw; font-size:13px; } }
    `;
    document.head.appendChild(style);
  }

  function startPassive(){ setMood('idle'); scheduleIdleBubble(); }
  function scheduleIdleBubble(){
    clearTimeout(bubbleTimer);
    const[min,max]=config.idleBubbleEveryMs;
    const delay=Math.floor(min+Math.random()*(max-min));
    bubbleTimer=setTimeout(()=>{ say(randomLine()); scheduleIdleBubble(); },delay);
  }

  function say(text,ms=2500){
    if(!bubble)return;
    bubble.querySelector('span').textContent=text;
    bubble.classList.remove('hidden');
    clearTimeout(passiveTimer);
    passiveTimer=setTimeout(()=>bubble.classList.add('hidden'),ms);
  }

  function setMood(mood){
    if(!sprite)return;
    sprite.classList.remove('curious','idle');
    sprite.classList.add(mood);
  }

  function randomLine(){
    const arr=(config.funnyLines&&config.funnyLines.length)?config.funnyLines:defaultLines;
    return arr[Math.floor(Math.random()*arr.length)];
  }

  function throwBananas(n=1){
    if(!trail)return;
    for(let i=0;i<n;i++){
      const b=document.createElement('div');
      b.className=`${NS}-banana`; b.textContent='🍌';
      const dir=(config.position.includes('right')?1:-1);
      const dx=(Math.random()*120+60)*dir;
      const dy=-(Math.random()*80+40);
      const dx2=(Math.random()*40-20);
      b.style.setProperty('--dx',dx+'px');
      b.style.setProperty('--dy',dy+'px');
      b.style.setProperty('--dx2',dx2+'px');
      trail.appendChild(b);
      setTimeout(()=>b.remove(),1100);
    }
  }

  function attachToAudio(el){
    audioEl=el;
    try{
      audioCtx=new (window.AudioContext||window.webkitAudioContext)();
      analyser=audioCtx.createAnalyser();
      analyser.fftSize=256;
      dataArrayFreq=new Uint8Array(analyser.frequencyBinCount);
      const src=audioCtx.createMediaElementSource(audioEl);
      src.connect(analyser);
      if(config.connectToDestination) analyser.connect(audioCtx.destination);
      audioEl.addEventListener('play',()=>{ if(audioCtx.state==='suspended')audioCtx.resume(); });
      loop();
      scheduleIdleBubble();
    }catch(e){ console.warn('[EbmarahMascot] WebAudio unavailable',e); startPassive(); }
  }

  function loop(){
    rafId=requestAnimationFrame(loop);
    if(!analyser)return;
    analyser.getByteFrequencyData(dataArrayFreq);
    const nyquist=audioCtx.sampleRate/2;
    const cutoffIndex=Math.floor(config.lowBandHz/nyquist*dataArrayFreq.length);
    let sum=0; for(let i=0;i<cutoffIndex;i++) sum+=dataArrayFreq[i];
    const avg=sum/cutoffIndex;
    baseline=(1-alpha)*baseline+alpha*avg;
    const now=performance.now();
    if(avg>config.minVolumeGate && avg>baseline*config.energyFactor && (now-lastDrop)>config.dropCooldownMs){
      lastDrop=now;
      onDrop();
    }
  }

  function onDrop(){
    sprite.classList.add('drop');
    setTimeout(()=>sprite.classList.remove('drop'),500);
    throwBananas(config.bananaCountOnDrop);
    say(randomLine(),3000);
  }

  function destroy(){
    cancelAnimationFrame(rafId);
    window.removeEventListener('resize', onResize);
    if(root) root.remove();
    clearTimeout(bubbleTimer); clearTimeout(passiveTimer);
    if(audioCtx) audioCtx.close();
  }

  window.EbmarahMascot=API;
})();

