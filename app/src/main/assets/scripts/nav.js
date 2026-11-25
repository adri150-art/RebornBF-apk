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

// Relevé de la structure des pages (pour que Claude puisse ajouter des boutons au bon endroit).
// Garde les 15 derniers écrans visités : adresse, titres, liens et boutons. Aucune donnée de compte.
(function () {
  'use strict';
  if (window.__rbfStruct) return;
  window.__rbfStruct = true;
  const KEY = 'rbf_struct';
  const clean = (t) => (t || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const pattern = (p) => p.replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '/:uuid').replace(/\/\d+/g, '/:id');

  function snap() {
    if (location.pathname.startsWith('/battle')) return;
    const out = { p: location.pathname, pat: pattern(location.pathname), q: [...new URLSearchParams(location.search).keys()] };
    out.h = [...document.querySelectorAll('h1,h2,h3,[class*="title"],[class*="Title"]')].map((e) => clean(e.innerText)).filter(Boolean).slice(0, 8);
    out.a = [...document.querySelectorAll('a[href]')].map((a) => {
      const h = a.getAttribute('href') || '';
      return h.startsWith('/') ? [h.slice(0, 80), clean(a.innerText || a.getAttribute('aria-label') || a.title || (a.querySelector('img[alt]') || {}).alt)] : null;
    }).filter(Boolean).slice(0, 50);
    out.b = [...document.querySelectorAll('button,[role="button"]')].map((b) => [
      clean(b.innerText || b.getAttribute('aria-label') || b.title || (b.querySelector('img[alt]') || {}).alt),
      String(b.className || '').split(/\s+/)[0].slice(0, 50),
      b.disabled ? 1 : 0,
    ]).slice(0, 50);
    const cls = {};
    document.querySelectorAll('main [class], body > div [class]').forEach((e) => {
      String(e.className || '').split(/\s+/).forEach((c) => { if (c && c.length < 60) cls[c] = (cls[c] || 0) + 1; });
    });
    out.c = Object.keys(cls).slice(0, 90);
    let all = [];
    try { all = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { all = []; }
    all = all.filter((x) => x.p !== out.p);
    all.push(out);
    if (all.length > 15) all = all.slice(-15);
    try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { /* plein */ }
  }

  let last = '', timer = 0;
  setInterval(() => {
    const k = location.pathname + location.search;
    if (k !== last) { last = k; clearTimeout(timer); timer = setTimeout(snap, 1800); }
  }, 500);
})();

// « Back » du jeu : revient vraiment à la page précédente (le jeu renvoie sinon vers une page fixe,
// par exemple la liste des unités). On garde la liste des pages visitées dans l'onglet.
(function () {
  'use strict';
  if (window.__rbfBack) return;
  window.__rbfBack = true;
  const KEY = 'rbf_hist';
  const here = () => location.pathname + location.search;
  const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY)) || []; } catch (e) { return []; } };
  const save = (h) => { try { sessionStorage.setItem(KEY, JSON.stringify(h.slice(-40))); } catch (e) { /* rien */ } };

  function record() {
    const h = load();
    const cur = here();
    if (h[h.length - 1] === cur) return;
    if (h[h.length - 2] === cur) h.pop(); // retour arrière (bouton Retour, Alt+←, geste)
    else h.push(cur);
    save(h);
  }
  ['pushState', 'replaceState'].forEach((k) => {
    const orig = history[k];
    history[k] = function (...args) {
      const r = orig.apply(this, args);
      if (k === 'replaceState') { const h = load(); if (h.length) { h[h.length - 1] = here(); save(h); } } else record();
      return r;
    };
  });
  window.addEventListener('popstate', record);
  record();

  document.addEventListener('click', (e) => {
    const back = e.target.closest && e.target.closest('a[class*="kit-module__"][class*="__back"], button[class*="kit-module__"][class*="__back"]');
    if (!back || e.button !== 0 || e.ctrlKey || e.metaKey) return;
    const h = load();
    if (h.length < 2) return; // pas de page précédente connue : comportement normal du jeu
    e.preventDefault();
    e.stopImmediatePropagation();
    history.back();
  }, true);
})();
