// Fiche d'unité « remaster » : barre d'actions Améliorer / Évoluer directement sur la fiche,
// textes des compétences lisibles en entier, cadres plus modernes.
(function () {
  'use strict';
  if (window.__rbfUnitPlus) return;
  window.__rbfUnitPlus = true;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const shown = (el) => !!el && el.getBoundingClientRect().width > 0;
  const PICK = 'rbf_pick';

  // ───────── Style remaster (sélecteurs souples : résistent aux mises à jour du jeu) ─────────
  const css = document.createElement('style');
  css.id = 'rbf-unitplus';
  css.textContent = `
    /* Stats : pastilles en verre, chiffres bien alignés */
    [class*="unit-info-module__"][class*="__statRow"]{filter:drop-shadow(0 3px 6px rgba(0,0,0,.35))}
    [class*="unit-info-module__"][class*="__value"]{font-variant-numeric:tabular-nums;text-shadow:0 1px 0 rgba(0,0,0,.6),0 0 8px rgba(255,214,120,.18)}

    /* Boutons du jeu : ombre douce et réaction au toucher */
    [class*="kit-module__"][class*="__button"],[class*="kit-module__"][class*="__labelButton"]{filter:drop-shadow(0 4px 8px rgba(0,0,0,.45));transition:transform .1s ease,filter .1s ease}
    [class*="kit-module__"][class*="__button"]:active,[class*="kit-module__"][class*="__labelButton"]:active{transform:scale(.95);filter:drop-shadow(0 2px 4px rgba(0,0,0,.5)) brightness(1.15)}

    /* Compétences : ombre douce */
    [class*="unit-info-module__"][class*="__skillRow"]{border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.06)}

    /* Boutons Améliorer / Évoluer : copies des boutons du jeu */
    #rbf-unit-actions{position:fixed;z-index:30;display:flex;flex-direction:column;gap:8px;align-items:flex-end}
    #rbf-unit-actions > button{position:relative!important;inset:auto!important;margin:0!important;transform:none;flex:none}
    #rbf-unit-actions > button.rbf-off{filter:grayscale(1) brightness(.62)!important;cursor:not-allowed}
    #rbf-toast{position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:2147483600;padding:10px 16px;border-radius:12px;
      background:rgba(10,12,22,.92);border:1px solid rgba(255,206,110,.35);color:#f2f4fa;font:600 13px system-ui,sans-serif;
      box-shadow:0 8px 20px rgba(0,0,0,.5);pointer-events:none;transition:opacity .3s}
  `;
  (document.head || document.documentElement).appendChild(css);

  function toast(t) {
    let el = $('#rbf-toast');
    if (!el) { el = document.createElement('div'); el.id = 'rbf-toast'; document.body.appendChild(el); }
    el.textContent = t;
    el.style.opacity = '1';
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { el.style.opacity = '0'; }, 2600);
  }

  // ───────── Où sont Fusion / Évolution dans le menu Unit ─────────
  const RE = {
    fusion: /fusion|fuse|enhanc|upgrade|am[ée]lior|power.?up|level.?up/i,
    evolve: /evol|[ée]volu|awaken/i,
  };
  const learned = () => { try { return JSON.parse(localStorage.getItem('rbf_unitnav')) || {}; } catch (e) { return {}; } };

  function learnUnitMenu() {
    if (!location.pathname.startsWith('/units')) return;
    const m = learned();
    let changed = false;
    $$('a[href^="/units/"]').forEach((a) => {
      const href = (a.getAttribute('href') || '').split(/[?#]/)[0];
      if (/^\/units\/(info|list)$/.test(href)) return;
      const label = (a.innerText || a.getAttribute('aria-label') || a.title || (a.querySelector('img[alt]') || {}).alt || '') + ' ' + href;
      for (const k of Object.keys(RE)) if (RE[k].test(label) && m[k] !== href) { m[k] = href; changed = true; }
    });
    if (changed) try { localStorage.setItem('rbf_unitnav', JSON.stringify(m)); } catch (e) { /* rien */ }
  }

  function currentUnitId() {
    return new URLSearchParams(location.search).get('id');
  }

  function start(kind) {
    const id = currentUnitId();
    if (!id) return;
    try { sessionStorage.setItem(PICK, JSON.stringify({ id, kind, t: Date.now(), back: location.pathname + location.search })); } catch (e) { /* rien */ }
    // Adresses utilisées par le jeu lui-même : fusion avec l'unité en cible, page d'évolution de l'unité
    const url = kind === 'fusion'
      ? '/fusion?target=' + encodeURIComponent(id)
      : '/units/info/evolve?id=' + encodeURIComponent(id);
    sessionStorage.removeItem(PICK);
    go(url);
  }

  function go(p) {
    try { if (window.next && window.next.router && window.next.router.push) { window.next.router.push(p); return; } } catch (e) { /* rien */ }
    location.assign(p);
  }

  // Suite du parcours : menu Unit → bon écran → bonne unité sélectionnée
  function followPick() {
    let pick = null;
    try { pick = JSON.parse(sessionStorage.getItem(PICK)); } catch (e) { pick = null; }
    if (!pick) return;
    if (Date.now() - pick.t > 25000) { sessionStorage.removeItem(PICK); return; }
    const p = location.pathname;
    if (p === '/units/info') return;

    if (p === '/units' || p === '/units/') {
      const el = $$('a[href^="/units/"],button,[role="button"]').find((x) => shown(x) &&
        RE[pick.kind].test((x.innerText || '') + ' ' + (x.getAttribute('aria-label') || '') + ' ' + (x.getAttribute('href') || '') + ' ' + ((x.querySelector('img[alt]') || {}).alt || '')));
      if (el) { el.click(); }
      return;
    }

    // Écran de fusion / évolution : on sélectionne l'unité de départ si le jeu la montre avec son identifiant
    const sel = `a[href*="${pick.id}"],[data-id="${pick.id}"],[data-unit-id="${pick.id}"],[data-uid="${pick.id}"],[data-unit="${pick.id}"]`;
    const target = $$(sel).find(shown);
    if (target) {
      sessionStorage.removeItem(PICK);
      target.click();
      return;
    }
    if (Date.now() - pick.t > 9000) {
      sessionStorage.removeItem(PICK);
      toast('Choisis ton unité dans la liste');
    }
  }

  // ───────── Boutons Améliorer / Évoluer sur la fiche d'unité ─────────
  // Copies du bouton « Changer / Switch » du jeu (même cadre, même image), rangées dans la colonne
  // de droite sous « Définir comme Aide ». Grisés quand l'action n'apporte plus rien.

  const rightCol = () => $('[class*="unit-info-module__"][class*="__right"]');
  const visibleButtons = (root) => root ? [...root.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().width > 0 && !b.closest('#rbf-unit-actions')) : [];

  function gameButtons() {
    const r = rightCol();
    const btns = visibleButtons(r).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    if (!btns.length) return null;
    const model = btns[btns.length - 1];                         // le plus bas : Changer / Switch
    const helper = $('[class*="unit-info-module__"][class*="__helperButton"]') ||
      $('[class*="unit-info-module__"][class*="__toggles"]') || btns[0]; // sous « Définir comme Aide »
    return { model, helper };
  }

  function cloneButton(model, label) {
    const b = model.cloneNode(true);
    b.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));
    b.removeAttribute('id');
    b.type = 'button';
    b.setAttribute('aria-label', label);
    const tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
    let first = null;
    while (tw.nextNode()) {
      const n = tw.currentNode;
      if (!n.nodeValue.trim()) continue;
      if (!first) { first = n; n.nodeValue = label; } else n.nodeValue = '';
    }
    if (!first) b.textContent = label;
    return b;
  }

  // Évolution impossible : forme finale (marque « Omni » sur la fiche)
  function canEvolve() {
    return !$('[class*="unit-info-module__"] [class*="rarity-mark-module__"][class*="__omni"]') &&
      !$('[class*="unit-info-module__"][class*="__titleRow"] [class*="__omni"]');
  }

  // Fusion inutile : niveau au maximum et compétences au niveau 10
  function canFuse() {
    const rows = $$('[class*="unit-info-module__"][class*="__statRow"]');
    let maxed = false;
    for (const r of rows) {
      const m = (r.innerText || r.textContent || '').match(/(\d+)\s*\/\s*(\d+)/);
      if (m && /lv/i.test(r.innerText || r.textContent || '')) { maxed = +m[1] >= +m[2]; break; }
    }
    if (!maxed) return true;
    const levels = $$('[class*="unit-info-module__"][class*="__skillLevel"]').map((e) => parseInt((e.textContent || '').replace(/\D/g, ''), 10)).filter((n) => !isNaN(n));
    return levels.some((n) => n < 10);
  }

  function setState(btn, ok, why) {
    btn.disabled = false; // on garde le clic pour expliquer pourquoi c'est grisé
    btn.classList.toggle('rbf-off', !ok);
    btn.dataset.why = ok ? '' : why;
    btn.title = ok ? '' : why;
  }

  function addActions() {
    const old = $('#rbf-unit-actions');
    if (location.pathname !== '/units/info') { if (old) old.remove(); return; }
    // Le bouton « Enhancements » du jeu ne fait rien : on le branche sur la fusion
    $$('[class*="unit-info-module__"][class*="__action"]').forEach((el) => {
      if (el.dataset.rbfHooked || !/enhanc|am[ée]lior/i.test(el.innerText || el.textContent || '')) return;
      el.dataset.rbfHooked = '1';
      el.style.cursor = 'pointer';
      el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); start('fusion'); }, true);
    });
    const g = gameButtons();
    if (!g) { if (old) old.style.display = 'none'; return; }
    let box = old;
    if (!box || box.dataset.unit !== currentUnitId()) {
      if (box) box.remove();
      box = document.createElement('div');
      box.id = 'rbf-unit-actions';
      box.dataset.unit = currentUnitId() || '';
      const fuse = cloneButton(g.model, 'Améliorer');
      const evo = cloneButton(g.model, 'Évoluer');
      fuse.dataset.k = 'fusion';
      evo.dataset.k = 'evolve';
      box.append(fuse, evo);
      box.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-k]');
        if (!b) return;
        e.preventDefault(); e.stopPropagation();
        if (b.classList.contains('rbf-off')) { toast(b.dataset.why); return; }
        start(b.dataset.k);
      }, true);
      document.body.appendChild(box);
    }
    const [fuse, evo] = box.children;
    setState(fuse, canFuse(), 'Niveau et compétences déjà au maximum');
    setState(evo, canEvolve(), 'Cette unité est à sa forme finale');
    place(box, g);
  }

  function place(box, g) {
    const m = g.model.getBoundingClientRect();
    const h = g.helper.getBoundingClientRect();
    if (!m.width || !h.width) { box.style.display = 'none'; return; }
    box.style.display = 'flex';
    box.style.width = Math.round(m.width) + 'px';
    box.style.left = Math.round(h.right - m.width) + 'px';
    box.style.top = Math.round(h.bottom + 10) + 'px';
    [...box.children].forEach((b) => { b.style.width = Math.round(m.width) + 'px'; b.style.height = Math.round(m.height) + 'px'; });
  }

  window.addEventListener('resize', () => { const b = $('#rbf-unit-actions'); const g = gameButtons(); if (b && g) place(b, g); });
  setInterval(() => {
    if (!location.pathname.startsWith('/units')) { const b = $('#rbf-unit-actions'); if (b) b.remove(); return; }
    learnUnitMenu();
    addActions();
    followPick();
  }, 600);
})();
