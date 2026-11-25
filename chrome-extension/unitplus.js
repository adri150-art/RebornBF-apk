(function(){if(window.top!==window)return;var S=window.__rbfSettings;if(!S||!(S.opt.remaster))return;
(function __rbfRun(){if(document.readyState==='loading'||!document.body){document.addEventListener('DOMContentLoaded',__rbfRun,{once:true});return;}
try{
// Fiche d'unité « remaster » : colonne de boutons Favori / Aide / Améliorer / Évoluer au style du jeu,
// grisés quand l'action est impossible, ombres douces sur les stats et les compétences.
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

    /* Colonne de boutons : copies du bouton bleu du jeu, tous de la même taille */
    #rbf-unit-actions{position:fixed;z-index:30;display:flex;flex-direction:column;gap:6px;width:124px}
    #rbf-unit-actions > button{position:relative!important;inset:auto!important;margin:0!important;flex:none;width:124px!important;height:42px!important}
    /* Les images du cadre gardent sinon la position calculée pour le petit bouton d'origine */
    #rbf-unit-actions > button img{inset:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important}
    #rbf-unit-actions .rbf-cap{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:0 6px;
      color:#fff;font-size:17px;line-height:1;white-space:nowrap;letter-spacing:.3px;pointer-events:none}
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

  // ───────── Colonne de boutons de la fiche d'unité ─────────
  // Quatre boutons de même taille, faits à partir du bouton bleu du jeu (cadre et police d'origine) :
  // Favori et Aide (qui actionnent les boutons du jeu), Améliorer et Évoluer. Présents sur toutes les unités.

  const helperBtn = () => $('[class*="unit-info-module__"][class*="__helperButton"]');
  const favoriteBtn = () => $$('[class*="unit-info-module__"][class*="__favoriteButton"]').find((b) => !/__helperButton/.test(b.className));
  const togglesBox = () => $('[class*="unit-info-module__"][class*="__toggles"]');

  function makeButton(model, label, key) {
    const b = model.cloneNode(true);
    b.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));
    ['id', 'aria-pressed', 'aria-haspopup'].forEach((k) => b.removeAttribute(k));
    b.type = 'button';
    b.dataset.k = key;
    let cap = b.querySelector('[class*="__caption"]');
    if (!cap) { cap = document.createElement('span'); b.appendChild(cap); }
    cap.removeAttribute('data-fit');
    cap.className = 'rbf-cap';
    const src = model.querySelector('[class*="__caption"]');
    const cs = src ? getComputedStyle(src) : null;
    if (cs) { cap.style.fontFamily = cs.fontFamily; cap.style.textShadow = cs.textShadow; }
    cap.textContent = label;
    return b;
  }

  function setLabel(btn, label) {
    const cap = btn.querySelector('.rbf-cap');
    if (cap && cap.textContent !== label) cap.textContent = label;
    btn.setAttribute('aria-label', label);
  }

  // Évolution impossible : forme finale (marque « Omni » sur la fiche)
  function canEvolve() {
    return !$('[class*="unit-info-module__"] [class*="rarity-mark-module__"][class*="__omni"]') &&
      !$('[class*="unit-info-module__"][class*="__titleRow"] [class*="__omni"]');
  }

  // Fusion inutile : niveau au maximum (ex. « Lv. 150/150 ») et compétences au niveau 10
  function canFuse() {
    const left = $('[class*="unit-info-module__"][class*="__left"]') || $('[class*="unit-info-module__"][class*="__body"]');
    const txt = left ? (left.innerText || left.textContent || '') : '';
    // Le mot « Lv. » est une image dans le jeu : la seule fraction de la colonne de gauche est le niveau
    const m = txt.match(/(\d+)\s*\/\s*(\d+)/);
    if (!m || +m[1] < +m[2]) return true;
    const levels = $$('[class*="unit-info-module__"][class*="__skillLevel"]')
      .map((e) => (e.textContent || '').match(/(\d+)/)).filter(Boolean).map((x) => +x[1]);
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
    const helper = helperBtn();
    const toggles = togglesBox();
    if (!helper || !toggles) { if (old) old.style.display = 'none'; return; }
    let box = old;
    if (!box || box.dataset.unit !== currentUnitId()) {
      if (box) box.remove();
      box = document.createElement('div');
      box.id = 'rbf-unit-actions';
      box.dataset.unit = currentUnitId() || '';
      box.append(makeButton(helper, '★ Favori', 'favorite'), makeButton(helper, 'Aide', 'helper'),
        makeButton(helper, 'Améliorer', 'fusion'), makeButton(helper, 'Évoluer', 'evolve'));
      box.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-k]');
        if (!b) return;
        e.preventDefault(); e.stopPropagation();
        if (b.classList.contains('rbf-off')) { toast(b.dataset.why); return; }
        const k = b.dataset.k;
        if (k === 'favorite') { const f = favoriteBtn(); if (f) f.click(); }
        else if (k === 'helper') { const h = helperBtn(); if (h) h.click(); }
        else start(k);
      }, true);
      document.body.appendChild(box);
    }
    toggles.style.visibility = 'hidden'; // les petits boutons d'origine restent là pour être actionnés
    const [fav, help, fuse, evo] = box.children;
    const f = favoriteBtn();
    const isFav = f && /retir|remove|enlever/i.test((f.getAttribute('aria-label') || '') + ' ' + (f.innerText || ''));
    setLabel(fav, isFav ? 'Retirer ★' : '★ Favori');
    setLabel(help, helper.getAttribute('aria-pressed') === 'true' ? 'Aide ✓' : 'Aide');
    fav.style.display = f ? '' : 'none';
    setState(fuse, canFuse(), 'Niveau et compétences déjà au maximum');
    setState(evo, canEvolve(), 'Cette unité est à sa forme finale');
    place(box, toggles);
  }

  function place(box, toggles) {
    const t = toggles.getBoundingClientRect();
    if (!t.width) { box.style.display = 'none'; return; }
    box.style.display = 'flex';
    box.style.left = Math.round(t.right - 124) + 'px';
    box.style.top = Math.round(t.top) + 'px';
  }

  window.addEventListener('resize', () => { const b = $('#rbf-unit-actions'); const t = togglesBox(); if (b && t) place(b, t); });
  setInterval(() => {
    if (!location.pathname.startsWith('/units')) { const b = $('#rbf-unit-actions'); if (b) b.remove(); return; }
    learnUnitMenu();
    addActions();
    followPick();
  }, 600);
})();

}catch(e){console.error("[RBF] unitplus",e)}
})();
})();
