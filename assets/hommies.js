// hommies.js

const qs = new URLSearchParams(location.search);
if (qs.get('debug') === '1') document.body.classList.add('debug');

const v = document.getElementById('bgVideo');
const err = document.getElementById('err');

// Poster fallback
const poster = 'assets/hommiesbg_poster.jpg';
document.body.style.backgroundImage = `url("${poster}")`;

// Pick video
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const src = isMobile ? 'assets/hommiesbgmobile.mp4' : 'assets/hommiesbg.mp4';

// iOS autoplay quirks
v.muted = true;
v.setAttribute('playsinline', '');
v.setAttribute('webkit-playsinline', '');

// Assign src
v.src = src;

// Try to play
const start = () => v.play().catch(() => {});
v.addEventListener('loadeddata', start, { once:true });
v.addEventListener('canplay', start, { once:true });

// Timeout fail safe
let failTimer = setTimeout(() => {
  if (v.readyState < 2) showErr('Timed out loading background video.');
}, 7000);

v.addEventListener('error', () => {
  showErr(`Failed to load: ${src} (code ${v.error && v.error.code || 'unknown'})`);
});

v.addEventListener('loadeddata', () => clearTimeout(failTimer));

function showErr(message){
  err.style.display = 'block';
  err.textContent = `${message} Check path/case, that files exist in /assets/, and that the MP4 is H.264 video + AAC audio with Content-Type: video/mp4.`;
}

// Debug: show controls
if (document.body.classList.contains('debug')) v.setAttribute('controls','controls');
