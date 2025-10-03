/* weekly-locker.js
   Alternates locking between "ebmarahgame.html" and "drum-pad.html" one week at a time.
   - Changes every SUNDAY at local 00:00 (midnight)
   - Even weeks: lock EBMARAH game link, unlock Drum Pad
   - Odd weeks:  lock Drum Pad link, unlock EBMARAH game
   - Non-destructive: only affects the matching <a> elements
*/

(() => {
  // ===== Config =====
  const CONFIG = {
    // Baseline Sunday 00:00 local time. This marks "week 0".
    // Change if you want to flip which one is locked this week.
    epochSundayLocal: new Date(2025, 0, 5, 0, 0, 0), // Jan 5, 2025 is a Sunday

    // Filenames to target in your nav <a href="...">
    gameFile: 'ebmarahgame.html',
    padFile:  'drum-pad.html',

    // Optional: tooltip text shown on the locked link
    lockReason: 'Locked this week. Unlocks next Sunday.',

    // CSS class names added by this script
    classes: {
      locked: 'wl-locked',
      processed: 'wl-processed'
    }
  };

  // ===== Styles for locked links (scoped) =====
  const STYLES = `
    .${CONFIG.classes.locked}{
      pointer-events: none;
      opacity: .45;
      filter: grayscale(0.6);
      position: relative;
    }
    .${CONFIG.classes.locked}::after{
      content: "🔒";
      font-size: 0.95em;
      margin-left: .4em;
    }
  `;

  // ===== Helpers =====
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  function injectStyles() {
    if (document.getElementById('weekly-locker-styles')) return;
    const s = document.createElement('style');
    s.id = 'weekly-locker-styles';
    s.textContent = STYLES;
    document.head.appendChild(s);
  }

  // Normalize a link’s href to just the filename (no query/hash)
  function fileNameFromHref(href) {
    try {
      const url = new URL(href, window.location.origin);
      return url.pathname.split('/').pop().toLowerCase();
    } catch {
      // relative or invalid—best-effort parsing
      return (href.split('#')[0].split('?')[0].split('/').pop() || '').toLowerCase();
    }
  }

  function getCurrentWeekIndex() {
    const now = new Date();
    // Find the last Sunday 00:00 before/at now, relative to epoch Sunday
    // We can simply compute difference in ms from the baseline local Sunday.
    const diff = now.getTime() - CONFIG.epochSundayLocal.getTime();
    return Math.floor(diff / WEEK_MS);
  }

  function lockLink(a) {
    if (!a || a.classList.contains(CONFIG.classes.locked)) return;
    a.classList.add(CONFIG.classes.locked);
    a.setAttribute('aria-disabled', 'true');
    a.setAttribute('tabindex', '-1');
    if (CONFIG.lockReason) {
      // Preserve any existing title by appending
      const oldTitle = a.getAttribute('title') || '';
      a.setAttribute('title', oldTitle ? `${oldTitle} — ${CONFIG.lockReason}` : CONFIG.lockReason);
    }
    // Block mouse/keyboard activation
    a.addEventListener('click', prevent, { capture: true });
    a.addEventListener('keydown', keyPrevent, { capture: true });
  }

  function unlockLink(a) {
    if (!a) return;
    a.classList.remove(CONFIG.classes.locked);
    a.removeAttribute('aria-disabled');
    a.removeAttribute('tabindex');
    a.removeEventListener('click', prevent, { capture: true });
    a.removeEventListener('keydown', keyPrevent, { capture: true });
  }

  function prevent(e) { e.preventDefault(); e.stopImmediatePropagation(); }
  function keyPrevent(e) {
    // Block Enter/Space activation when locked
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopImmediatePropagation(); }
  }

  function applyWeeklyLock() {
    // Gather all candidate links in the document (works for multiple navs)
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    let gameLinks = [];
    let padLinks  = [];

    anchors.forEach(a => {
      // Skip already processed anchors (in case of re-run)
      if (a.classList.contains(CONFIG.classes.processed)) return;

      const file = fileNameFromHref(a.getAttribute('href') || '');
      if (file === CONFIG.gameFile.toLowerCase()) gameLinks.push(a);
      if (file === CONFIG.padFile.toLowerCase())  padLinks.push(a);
    });

    // Mark processed so we don't double-bind events
    [...gameLinks, ...padLinks].forEach(a => a.classList.add(CONFIG.classes.processed));

    // Decide which set is locked this week (based on week parity)
    const weekIndex = getCurrentWeekIndex();
    const evenWeek = weekIndex % 2 === 0;

    // Even weeks: lock EBMARAH game, unlock Drum Pad
    // Odd  weeks: lock Drum Pad,      unlock EBMARAH game
    const toLock   = evenWeek ? gameLinks : padLinks;
    const toUnlock = evenWeek ? padLinks  : gameLinks;

    toUnlock.forEach(unlockLink);
    toLock.forEach(lockLink);
  }

  function scheduleMidnightCheck() {
    // Re-run shortly after local midnight, to catch the Sunday flip without reload
    const now = new Date();
    const next = new Date(now);
    next.setHours(24, 0, 2, 0); // 00:00:02 next day
    const delay = next.getTime() - now.getTime();
    setTimeout(() => {
      applyWeeklyLock();
      scheduleMidnightCheck(); // reschedule daily
    }, Math.max(500, delay));
  }

  // ===== Init =====
  function ready(fn){ (document.readyState === 'loading') ? document.addEventListener('DOMContentLoaded', fn) : fn(); }

  ready(() => {
    injectStyles();
    applyWeeklyLock();
    scheduleMidnightCheck();
  });
})();
