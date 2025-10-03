/* keep-root-url.js
   Keeps the address bar at "/" while navigating internal .html pages.
   - Intercepts same-origin <a> clicks
   - Fetches the target page, extracts #app-content, swaps it in
   - Updates <title> from fetched page
   - Stores a "virtual path" in history state (for back/forward)
   WARNING: This is cosmetic routing. Deep links will always show "/", which affects SEO and sharing.
*/
/* (() => {
  const CONTAINER_SEL = '#app-content';
  const container = () => document.querySelector(CONTAINER_SEL);
  const sameOrigin = (url) => url.origin === location.origin;

  // Normalize all internal links to absolute paths (avoid relative path weirdness after we pin URL)
  function normalizeLinks(scope) {
    scope.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      if (!href) return;
      try {
        const u = new URL(href, location.origin);
        if (sameOrigin(u)) {
          // keep query/hash if present
          a.setAttribute('href', u.pathname + u.search + u.hash);
        }
      } catch {}
    });
  }

  // On load, if not at "/", replace to keep URL clean (don’t reload)
  function pinToRootOnce() {
    try {
      if (location.pathname !== '/') {
        history.replaceState({ vpath: location.pathname + location.search + location.hash }, document.title, '/');
      } else if (!history.state) {
        // If already at "/", set a baseline state
        history.replaceState({ vpath: '/' }, document.title, '/');
      }
    } catch {}
  }

  async function fetchPage(path) {
    const res = await fetch(path, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('Failed to fetch ' + path);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc;
  }

  function swapContent(fromDoc) {
    const newMain = fromDoc.querySelector(CONTAINER_SEL);
    const currentMain = container();
    if (newMain && currentMain) {
      currentMain.innerHTML = newMain.innerHTML;
      // Update title
      if (fromDoc.title) document.title = fromDoc.title;
      // Re-normalize links inside the new content
      normalizeLinks(currentMain);
      // Optionally, re-run page-level scripts if you rely on inline JS hooks
      document.dispatchEvent(new CustomEvent('app:content-swapped'));
    } else {
      // Fallback: if we can’t find container, navigate normally
      location.href = (history.state?.vpath || '/');
    }
  }

  async function navigateVirtually(toPath) {
    try {
      const doc = await fetchPage(toPath);
      // push state with virtual path but keep URL shown as '/'
      history.pushState({ vpath: toPath }, doc.title || document.title, '/');
      swapContent(doc);
    } catch (e) {
      console.warn('Virtual nav failed, falling back:', e);
      location.href = toPath; // fallback to real nav
    }
  }

  function handleClick(e) {
    const a = e.target.closest('a[href]');
    if (!a) return;
    // Only hijack simple left-clicks with no modifiers
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return;

    let targetURL;
    try { targetURL = new URL(href, location.origin); } catch { return; }
    if (!sameOrigin(targetURL)) return;

    // Only virtualize .html pages (and site root)
    const isHtml = targetURL.pathname.endsWith('.html') || targetURL.pathname === '/';
    if (!isHtml) return;

    e.preventDefault();
    const path = targetURL.pathname + targetURL.search + targetURL.hash;
    navigateVirtually(path);
  }

  function handlePopState(e) {
    const vpath = (e.state && e.state.vpath) || '/';
    fetchPage(vpath).then(swapContent).catch(() => { location.href = vpath; });
  }

  function init() {
    const root = container();
    if (!root) return; // Don’t run if page doesn’t have #app-content

    pinToRootOnce();
    normalizeLinks(document);

    document.addEventListener('click', handleClick);
    window.addEventListener('popstate', handlePopState);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
