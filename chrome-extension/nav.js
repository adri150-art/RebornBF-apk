(function(){if(window.top!==window)return;var S=window.__rbfSettings;if(!S||!(true))return;
(function __rbfRun(){if(document.readyState==='loading'||!document.body){document.addEventListener('DOMContentLoaded',__rbfRun,{once:true});return;}
try{
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

// « Back » du jeu : retour logique, sans boucle.
// On garde le fil des pages visitées (comme l'historique du navigateur). Back ramène à la page d'où l'on
// venait la PREMIÈRE fois qu'on est arrivé sur l'écran actuel, en sautant les écrans d'action
// (fusion, évolution, combat, lancement de quête). Exemple : liste → fiche → fusion → fiche → Back = liste.
(function () {
  'use strict';
  if (window.__rbfBack) return;
  window.__rbfBack = true;
  const KEY = 'rbf_trail';
  const TRANSIENT = /^\/(battle|fusion)(\/|$)|^\/units\/info\/(evolve|spheres)|^\/units\/stack|^\/start\/\d+/;

  // Un écran = son chemin + l'unité affichée (les autres paramètres, comme « back », sont ignorés)
  const keyOf = () => {
    const id = new URLSearchParams(location.search).get('id');
    return location.pathname + (id ? '?id=' + id : '');
  };
  const load = () => { try { const t = JSON.parse(sessionStorage.getItem(KEY)); if (t && Array.isArray(t.trail)) return t; } catch (e) { /* rien */ } return { trail: [], ptr: -1 }; };
  const save = (t) => {
    if (t.trail.length > 60) { const cut = t.trail.length - 60; t.trail = t.trail.slice(cut); t.ptr -= cut; }
    try { sessionStorage.setItem(KEY, JSON.stringify(t)); } catch (e) { /* rien */ }
  };
  let pending = null; // position visée par notre propre retour

  function push() {
    const t = load(), k = keyOf();
    if (t.trail[t.ptr] === k) return;
    t.trail = t.trail.slice(0, t.ptr + 1);
    t.trail.push(k);
    t.ptr = t.trail.length - 1;
    save(t);
  }
  function onPop() {
    const t = load(), k = keyOf();
    if (pending !== null && t.trail[pending] === k) { t.ptr = pending; pending = null; save(t); return; }
    pending = null;
    for (let j = t.ptr - 1; j >= 0; j--) if (t.trail[j] === k) { t.ptr = j; save(t); return; }      // retour
    for (let j = t.ptr + 1; j < t.trail.length; j++) if (t.trail[j] === k) { t.ptr = j; save(t); return; } // avance
    push();
  }
  ['pushState', 'replaceState'].forEach((name) => {
    const orig = history[name];
    history[name] = function (...args) {
      const r = orig.apply(this, args);
      if (name === 'pushState') push();
      else { const t = load(); if (t.ptr >= 0) { t.trail[t.ptr] = keyOf(); save(t); } }
      return r;
    };
  });
  window.addEventListener('popstate', onPop);
  push(); // ouverture ou rechargement de page

  // Où mène Back depuis l'écran actuel
  // Un « écran » ignore l'unité affichée : passer d'une fiche à la suivante ne crée pas de niveau en plus
  const screenOf = (k) => (k || '').split('?')[0];

  // En remontant le fil : on saute les écrans d'action et les autres fiches du même écran,
  // et on s'arrête sur le premier vrai écran différent.
  function backTarget() {
    const t = load();
    const cur = screenOf(t.trail[t.ptr]);
    for (let j = t.ptr - 1; j >= 0; j--) {
      const k = t.trail[j];
      if (TRANSIENT.test(k) || screenOf(k) === cur) continue;
      return { pos: j, steps: j - t.ptr };
    }
    return null;
  }

  document.addEventListener('click', (e) => {
    const back = e.target.closest && e.target.closest('a[class*="kit-module__"][class*="__back"], button[class*="kit-module__"][class*="__back"]');
    if (!back || e.button !== 0 || e.ctrlKey || e.metaKey) return;
    const target = backTarget();
    if (!target || target.steps >= 0) return; // rien de connu : comportement normal du jeu
    e.preventDefault();
    e.stopImmediatePropagation();
    pending = target.pos;
    history.go(target.steps);
  }, true);

  window.__rbfBackTarget = backTarget; // pour vérifier
})();

}catch(e){console.error("[RBF] nav",e)}
})();
})();
