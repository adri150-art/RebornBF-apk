// Apprend les rubriques du jeu (liens du menu) pour le menu rapide de l'appli,
// et compte les visites pour mettre les plus utilisées en premier.
(function () {
  'use strict';
  if (window.__rbfNav) return;
  window.__rbfNav = true;

  const KEY = 'rbf_nav';
  const SKIP = /^\/(start|battle|api|_next|static|auth|login|logout|signin|signout)(\/|$)/i;
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const save = (m) => { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch (e) { /* rien */ } };

  function label(a) {
    let t = (a.getAttribute('aria-label') || a.getAttribute('title') || a.innerText || '').replace(/\s+/g, ' ').trim();
    if (!t) { const img = a.querySelector('img[alt]'); if (img) t = img.alt.trim(); }
    t = t.replace(/\d+\s*\/\s*\d+.*$/, '').trim(); // retire les compteurs « 12/40 »
    return t.length > 20 ? t.slice(0, 19) + '…' : t;
  }

  function scan() {
    const m = load();
    let changed = false;
    document.querySelectorAll('a[href^="/"]').forEach((a) => {
      const href = (a.getAttribute('href') || '').split(/[?#]/)[0].replace(/\/+$/, '') || '/';
      if (href === '/' || SKIP.test(href)) return;
      if (href.split('/').filter(Boolean).length > 1) return; // seulement les rubriques principales
      const l = label(a);
      if (!l || l.length < 2) return;
      if (!m[href]) { m[href] = { l, n: 0 }; changed = true; }
      else if (m[href].l !== l && l.length < m[href].l.length) { m[href].l = l; changed = true; }
    });
    if (changed) save(m);
  }

  let last = '';
  setInterval(() => {
    if (location.pathname !== last) {
      last = location.pathname;
      const m = load();
      const p = '/' + (last.split('/')[1] || '');
      if (m[p]) { m[p].n = (m[p].n || 0) + 1; save(m); }
    }
    scan();
  }, 2000);
})();
