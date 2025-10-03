/* eb-dropdown.js
   Converts your desktop nav (nav.site-nav) into a single "MENU" dropdown.
   - Targets ONLY: nav.site-nav (your primary/desktop nav)
   - Hides original nav on desktop (>=1024px)
   - Leaves your existing mobile nav untouched (<1024px)
   - MENU button is pinned top-right
*/
(() => {
  const CONFIG = {
    desktopMinWidth: 1024,
    respectMobile: true,
    floatTopRight: true,           // pin MENU top-right
    btnLabel: 'MENU',
    navSelectors: ['nav.site-nav'], // your detected desktop nav
    excludeSelectors: ['.social a', '.icon a'],
    excludeHrefPatterns: [/^mailto:/i, /^tel:/i, /^javascript:/i],
  };

  const STYLES = `
    .ebdd-wrap{ position:relative; display:inline-block; z-index:9999; }
    .ebdd-float{ position:fixed; top:12px; right:12px; }
    .ebdd-btn{
      font:600 14px/1.1 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
      padding:10px 14px; border:1px solid rgba(255,255,255,.35);
      background:rgba(0,0,0,.6); color:#fff; border-radius:999px;
      cursor:pointer; letter-spacing:.4px; text-transform:uppercase;
      backdrop-filter:saturate(140%) blur(4px);
    }
    .ebdd-btn:focus{ outline:2px solid rgba(0,180,255,.85); outline-offset:2px; }
    .ebdd-menu{
      position:absolute; right:0; margin-top:10px; min-width:220px;
      background:rgba(0,0,0,.92); border:1px solid rgba(255,255,255,.15);
      box-shadow:0 10px 30px rgba(0,0,0,.5); border-radius:14px; padding:8px;
      display:none; max-height:70vh; overflow:auto;
    }
    .ebdd-open .ebdd-menu{ display:block; }
    .ebdd-item{ display:block; padding:10px 12px; border-radius:10px; color:#fff; text-decoration:none; }
    .ebdd-item:hover,.ebdd-item:focus{ background:rgba(255,255,255,.10); outline:none; }
    .ebdd-sep{ height:1px; margin:6px 4px; background:rgba(255,255,255,.10); border:0; }
    .ebdd-current{ font-weight:700; }
    @media (min-width: ${CONFIG.desktopMinWidth}px){
      .ebdd-hide-desktop{ display:none !important; }
    }
  `;

  const onReady = (fn) => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  };

  function injectStyles() {
    if (document.getElementById('ebdd-styles')) return;
    const style = document.createElement('style');
    style.id = 'ebdd-styles';
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  function findNav() {
    for (const sel of CONFIG.navSelectors) {
      const nav = document.querySelector(sel);
      if (nav && nav.querySelectorAll('a[href]').length) return nav;
    }
    return null;
  }

  function collectLinks(nav) {
    const anchors = Array.from(nav.querySelectorAll('a[href]')).filter(a => {
      const href = (a.getAttribute('href') || '').trim();
      if (!href || href === '#') return false;
      if (CONFIG.excludeHrefPatterns.some(rx => rx.test(href))) return false;
      if (CONFIG.excludeSelectors.length && a.closest(CONFIG.excludeSelectors.join(','))) return false;
      const cs = getComputedStyle(a);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      return true;
    });

    const seen = new Set();
    return anchors.map(a => {
      const text = (a.getAttribute('data-label') || a.textContent || '').trim() || a.href;
      const href = a.getAttribute('href');
      const key = `${text}|${href}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return { text, href, target: a.target || '', rel: a.rel || '' };
    }).filter(Boolean);
  }

  function markCurrent(items) {
    const here = (location.pathname.replace(/\/+$/, '') || '/').toLowerCase();
    return items.map(it => {
      try {
        const url = new URL(it.href, location.origin);
        const path = (url.pathname.replace(/\/+$/, '') || '/').toLowerCase();
        return { ...it, current: path === here };
      } catch {
        return { ...it, current: false };
      }
    });
  }

  function buildDropdown(items) {
    const wrap = document.createElement('div');
    wrap.className = 'ebdd-wrap' + (CONFIG.floatTopRight ? ' ebdd-float' : '');

    const btn = document.createElement('button');
    btn.className = 'ebdd-btn';
    btn.type = 'button';
    btn.id = 'ebdd-button';
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    btn.textContent = CONFIG.btnLabel;

    const menu = document.createElement('div');
    menu.className = 'ebdd-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-labelledby', 'ebdd-button');

    const focusables = [];
    items.forEach((it, i) => {
      const a = document.createElement('a');
      a.className = 'ebdd-item' + (it.current ? ' ebdd-current' : '');
      a.setAttribute('role', 'menuitem');
      a.href = it.href;
      if (it.target) a.target = it.target;
      if (it.rel) a.rel = it.rel;
      a.textContent = it.text;
      menu.appendChild(a);
      focusables.push(a);
      if (i < items.length - 1) {
        const sep = document.createElement('div');
        sep.className = 'ebdd-sep';
        menu.appendChild(sep);
      }
    });

    const open = () => {
      wrap.classList.add('ebdd-open');
      btn.setAttribute('aria-expanded', 'true');
      setTimeout(() => focusables[0]?.focus(), 0);
    };
    const close = () => {
      wrap.classList.remove('ebdd-open');
      btn.setAttribute('aria-expanded', 'false');
      btn.focus();
    };
    const toggle = () => wrap.classList.contains('ebdd-open') ? close() : open();

    btn.addEventListener('click', toggle);
    document.addEventListener('click', e => { if (!wrap.contains(e.target)) close(); });
    wrap.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

    wrap.appendChild(btn);
    wrap.appendChild(menu);
    return wrap;
  }

  function init() {
    if (CONFIG.respectMobile && window.innerWidth < CONFIG.desktopMinWidth) return;
    injectStyles();
    const nav = findNav();
    if (!nav) return;

    const items = markCurrent(collectLinks(nav));
    if (!items.length) return;

    const dropdown = buildDropdown(items);
    document.body.appendChild(dropdown);

    // Hide original desktop nav
    nav.classList.add('ebdd-hide-desktop');

    // Toggle hide/show if user resizes across threshold
    let wasDesktop = window.innerWidth >= CONFIG.desktopMinWidth;
    window.addEventListener('resize', () => {
      const isDesktop = window.innerWidth >= CONFIG.desktopMinWidth;
      if (CONFIG.respectMobile) {
        if (isDesktop && !wasDesktop) nav.classList.add('ebdd-hide-desktop');
        if (!isDesktop && wasDesktop) nav.classList.remove('ebdd-hide-desktop');
        wasDesktop = isDesktop;
      }
    });
  }

  onReady(init);
})();
