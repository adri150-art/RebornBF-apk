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
    /* Profondeur : léger voile sombre sur les bords de l'écran */
    [class*="unit-info-module__"][class*="__page"]{position:relative}
    [class*="unit-info-module__"][class*="__page"]::before{content:"";position:absolute;inset:0;pointer-events:none;z-index:0;
      background:radial-gradient(120% 80% at 50% 40%,transparent 55%,rgba(5,6,14,.55) 100%)}
    [class*="unit-info-module__"][class*="__page"] > *{position:relative;z-index:1}

    /* Stats : pastilles en verre, chiffres bien alignés */
    [class*="unit-info-module__"][class*="__statRow"]{filter:drop-shadow(0 3px 6px rgba(0,0,0,.35))}
    [class*="unit-info-module__"][class*="__value"]{font-variant-numeric:tabular-nums;text-shadow:0 1px 0 rgba(0,0,0,.6),0 0 8px rgba(255,214,120,.18)}
    [class*="unit-info-module__"][class*="__expFill"]{background:linear-gradient(90deg,#3fa8ff,#7be0ff)!important;box-shadow:0 0 10px rgba(90,190,255,.55)}

    /* Boutons du jeu : ombre douce et réaction au toucher */
    [class*="kit-module__"][class*="__button"],[class*="kit-module__"][class*="__labelButton"]{filter:drop-shadow(0 4px 8px rgba(0,0,0,.45));transition:transform .1s ease,filter .1s ease}
    [class*="kit-module__"][class*="__button"]:active,[class*="kit-module__"][class*="__labelButton"]:active{transform:scale(.95);filter:drop-shadow(0 2px 4px rgba(0,0,0,.5)) brightness(1.15)}

    /* Compétences : panneaux en verre, texte complet au lieu du bandeau qui défile */
    [class*="unit-info-module__"][class*="__skills"]{display:flex;flex-direction:column;gap:6px;padding:6px 8px;overflow-y:auto}
    [class*="unit-info-module__"][class*="__skillRow"]{height:auto!important;min-height:0!important;text-align:left;border-radius:14px;overflow:hidden;
      background:linear-gradient(180deg,rgba(18,22,40,.92),rgba(10,12,24,.92))!important;border:1px solid rgba(255,206,110,.28)!important;
      box-shadow:0 6px 16px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.06)}
    [class*="skill-row-module__"][class*="__viewport"]{overflow:visible!important;-webkit-mask-image:none!important;mask-image:none!important;height:auto!important}
    [class*="skill-row-module__"][class*="__track"]{animation:none!important;transform:none!important;white-space:normal!important;width:auto!important;display:block!important}
    [class*="skill-row-module__"][class*="__repeat"]{display:none!important}
    [class*="unit-info-module__"][class*="__skillEffects"]{white-space:normal!important;height:auto!important;line-height:1.35;font-size:.92em;
      padding:2px 12px 8px!important;color:#dfe4f2;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}

    /* Barre d'actions ajoutée par l'appli */
    #rbf-unit-actions{position:absolute;left:31%;right:21%;bottom:8px;display:flex;gap:8px;z-index:5;
      padding:6px;border-radius:18px;background:rgba(8,10,20,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
      border:1px solid rgba(255,214,120,.25);box-shadow:0 8px 20px rgba(0,0,0,.45)}
    #rbf-unit-actions button{flex:1;min-width:0;height:40px;border-radius:13px;font-size:13px!important;white-space:nowrap;border:1px solid rgba(255,214,120,.55);cursor:pointer;
      font:800 13px/1 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.3px;color:#1b1206;
      background:linear-gradient(180deg,#ffe08a 0%,#f2b33d 55%,#d98c1c 100%);
      box-shadow:0 6px 14px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.6);text-shadow:0 1px 0 rgba(255,255,255,.35);
      transition:transform .1s ease,filter .1s ease;-webkit-tap-highlight-color:transparent}
    #rbf-unit-actions button.alt{color:#eaf3ff;text-shadow:0 1px 2px rgba(0,0,0,.6);border-color:rgba(140,200,255,.55);
      background:linear-gradient(180deg,#5aa9ff 0%,#2f6fe0 60%,#2149a8 100%)}
    #rbf-unit-actions button:active{transform:scale(.96);filter:brightness(1.12)}
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
    const path = learned()[kind];
    toast(kind === 'fusion' ? 'Ouverture de l\'amélioration…' : 'Ouverture de l\'évolution…');
    if (path) go(path + '?id=' + encodeURIComponent(id) + '&base=' + encodeURIComponent(id));
    else go('/units'); // on trouvera le bon bouton dans le menu Unit
  }

  function go(p) {
    const a = $$('a[href]').find((x) => (x.getAttribute('href') || '') === p);
    if (a) { a.click(); return; }
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

  // ───────── Barre d'actions sur la fiche d'unité ─────────
  function addActions() {
    if (location.pathname !== '/units/info') return;
    if ($('#rbf-unit-actions')) return;
    const body = $('[class*="unit-info-module__"][class*="__body"]');
    if (!body) return;
    if (getComputedStyle(body).position === 'static') body.style.position = 'relative';
    // Le bouton « Enhancements » du jeu ne fait rien : on le branche sur l'amélioration
    $$('[class*="unit-info-module__"][class*="__action"]').forEach((el) => {
      if (el.dataset.rbfHooked || !/enhanc|am[ée]lior/i.test(el.innerText || el.textContent || '')) return;
      el.dataset.rbfHooked = '1';
      el.style.cursor = 'pointer';
      el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); start('fusion'); }, true);
    });
    const bar = document.createElement('div');
    bar.id = 'rbf-unit-actions';
    bar.innerHTML = '<button type="button" data-k="fusion">⬆ Améliorer</button><button type="button" class="alt" data-k="evolve">✦ Évoluer</button>';
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-k]');
      if (b) { e.preventDefault(); e.stopPropagation(); start(b.dataset.k); }
    });
    body.appendChild(bar);
  }

  setInterval(() => {
    if (!location.pathname.startsWith('/units')) return;
    learnUnitMenu();
    addActions();
    followPick();
  }, 600);
})();
