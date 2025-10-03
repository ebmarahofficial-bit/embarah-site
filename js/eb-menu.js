/* eb-menu.js — turns your existing desktop nav into a single "MENU" dropdown
   Works with typical selectors: nav, header nav, .nav, .navbar, .site-nav
   No HTML changes needed. Just include this file on each page.
*/
(() => {
  // ===== Config =====
  const CONFIG = {
    // Desktop threshold: only replace the nav at/above this width.
    desktopMinWidth: 1024,

    // If your site already has a mobile menu, keep it as-is below this width.
    respectMobile: true,

    // Which elements to search for links (ordered by priority).
    selectors: [
      'header nav',
      'nav.site-nav',
      'nav.navbar',
      'nav.primary',
      'nav#nav',
      'nav',
      '.navbar',
      '.site-nav',
      '.nav'
    ],

    // Optional: pin the MENU to the top-right of the page (set to true to float).
    floatTopRight: false
  };

  const STYLES = `
    .ebm-wrap{ position:relative; display:inline-block; z-index:9999; }
    .ebm-float{ position:fixed; top:12px; right:12px; }
    .ebm-btn{
      font:600 14px/1.1 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      padding:10px 14px; border:1px solid rgba(255,255,255,.35);
      background:rgba(0,0,0,.55); color:#fff; border-radius:999px;
      cursor:pointer; letter-spacing:.4px; text-transform:uppercase;
      backdrop-filter:saturate(140%) blur(4px);
    }
    .ebm-btn:focus{ outline:2px solid rgba(0,180,255,.8); outline-offset:2px; }
    .ebm-menu{
      position:absolute; min-width:220px; margin-top:10px; right:0;
      background:rgba(0,0,0,.85); border:1px solid rgba(255,255,255,.15);
      box-shadow:0 10px 30px rgba(0,0,0,.5); border-radius:14px; padding:8px;
      display:none; max-height:70vh; overflow:auto;
    }
    .ebm-open .ebm-menu{ display:block; }
    .ebm-item{ display:block; padding:10px 12px; border-radius:10px; color:#fff; text-decoration:none; }
    .ebm-item:hover{ background:rgba(255,255,255,.08); }
    .ebm-sep{ height:1px; margin:6px 4px; background:rgba(255,255,255,.08); border:0; }
    /* Hide original nav only on desktop if configured */
    @media (min-width: ${CONFIG.desktopMinWidth}px){
      .ebm-hide-desktop{ display:none !important; }
    }
  `;

  const ready = (fn) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else { fn(); }
  };

  function injectStyles() {
    if (document.getElementById('ebm-styles')) return;
    const s = document.createElement('style');
    s.id = 'ebm-styles';
    s.textContent = STYLES;
    document.head.appendChild(s);
  }

  function findNav() {
    for (const sel of CONFIG.selectors) {
      const el = document.querySelector(sel);
      if (el && el.querySelectorAll('a').length) return el;
    }
    return null;
  }

  function collectLinks(navEl) {
    // Grab only visible, meaningful links
    const links = Array.from(navEl.querySelectorAll('a')).filter(a => {
      const href = (a.getAttribute('href') || '').trim();
      if (!href || href === '#' || href.startsWith('javascript:')) return false;
      // Skip duplicates by text+href combos later
      const style = window.getComputedStyle(a);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });

    // Deduplicate while keeping order
    const seen = new Set();
    const cleaned = [];
    for (const a of links) {
      const key = `${a.textContent.trim()}|${a.href}`;
      if (!seen.has(key)) { seen.add(key); cleaned.push(a); }
    }
    return cleaned.map(a => ({
      text: (a.getAttribute('data-label') || a.textContent || '').trim() || a.href,
      href: a.getAttribute('href'),
      target: a.getAttribute('target') || '',
      rel: a.getAttribute('rel') || ''
    }));
  }

  function buildDropdown(items) {
    const wrap = document.createElement('div');
    wrap.className = 'ebm-wrap' + (CONFIG.floatTopRight ? ' ebm-float' : '');

    const btn = document.createElement('button');
    btn.className = 'ebm-btn';
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    btn.id = 'ebm-button';
    btn.textContent = 'MENU';

    const menu = document.createElement('div');
    menu.className = 'ebm-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-labelledby', 'ebm-button');

    // Build links
    items.forEach((it, i) => {
      const a = document.createElement('a');
      a.className = 'ebm-item';
      a.setAttribute('role', 'menuitem');
      a.textContent = it.text;
      a.href = it.href;
      if (it.target) a.target = it.target;
      if (it.rel) a.rel = it.rel;
      menu.appendChild(a);
      if (i < items.length - 1) {
        const hr = document.createElement('div');
        hr.className = 'ebm-sep';
        menu.appendChild(hr);
      }
    });

    wrap.appendChild(btn);
    wrap.appendChild(menu);

    // Toggle logic
    const closeMenu = () => {
      wrap.classList.remove('ebm-open');
      btn.setAttribute('aria-expanded', 'false');
    };
    const openMenu = () => {
      wrap.classList.add('ebm-open');
      btn.setAttribute('aria-expanded', 'true');
    };
    const toggle = () => (wrap.classList.contains('ebm-open') ? closeMenu() : openMenu());

    btn.addEventListener('click', toggle);
    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) closeMenu();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu();
    });

    return wrap;
  }

  function placeDropdown(dropdown, navEl) {
    if (CONFIG.floatTopRight) {
      document.body.appendChild(dropdown);
    } else {
      // Insert before the original nav if possible, else prepend to header, else body
      if (navEl.parentElement) {
        navEl.parentElement.insertBefore(dropdown, navEl);
      } else {
        const header = document.querySelector('header');
        if (header) header.prepend(dropdown);
        else document.body.prepend(dropdown);
      }
    }
  }

  function init() {
    // Respect mobile (don’t replace mobile nav) if configured
    if (CONFIG.respectMobile && window.innerWidth < CONFIG.desktopMinWidth) return;

    injectStyles();
    const nav = findNav();
    if (!nav) return;

    const items = collectLinks(nav);
    if (!items.length) return;

    // Build and place dropdown
    const dd = buildDropdown(items);
    placeDropdown(dd, nav);

    // Hide original nav on desktop only
    nav.classList.add('ebm-hide-desktop');

    // Re-evaluate on resize (handle switching between mobile/desktop widths)
    let wasDesktop = window.innerWidth >= CONFIG.desktopMinWidth;
    window.addEventListener('resize', () => {
      const isDesktop = window.innerWidth >= CONFIG.desktopMinWidth;
      if (CONFIG.respectMobile) {
        if (isDesktop && !wasDesktop) {
          nav.classList.add('ebm-hide-desktop');
        } else if (!isDesktop && wasDesktop) {
          nav.classList.remove('ebm-hide-desktop');
        }
        wasDesktop = isDesktop;
      }
    });
  }

  ready(init);
})();
