(function(){if(window.top!==window)return;var S=window.__rbfSettings;if(!S||!(S.opt.remaster))return;
(function __rbfRun(){if(document.readyState==='loading'||!document.body){document.addEventListener('DOMContentLoaded',__rbfRun,{once:true});return;}
try{
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

    /* Barre d'actions ajoutée par l'appli */
    #rbf-unit-actions{position:fixed;display:flex;gap:8px;z-index:5;
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
    const old = $('#rbf-unit-actions');
    if (location.pathname !== '/units/info') { if (old) old.remove(); return; }
    if (old) { place(old); return; }
    const body = $('[class*="unit-info-module__"][class*="__body"]');
    if (!body) return;
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
    document.body.appendChild(bar);
    place(bar);
  }

  // Place la barre en bas de l'image de l'unité, sans rien changer à la mise en page du jeu
  function place(bar) {
    const body = $('[class*="unit-info-module__"][class*="__body"]');
    if (!body) { bar.style.display = 'none'; return; }
    const r = body.getBoundingClientRect();
    if (r.width === 0) { bar.style.display = 'none'; return; }
    bar.style.display = 'flex';
    bar.style.left = Math.round(r.left + r.width * 0.31) + 'px';
    bar.style.width = Math.round(r.width * 0.48) + 'px';
    bar.style.top = Math.round(r.bottom - 60) + 'px';
  }

  window.addEventListener('resize', () => { const b = $('#rbf-unit-actions'); if (b) place(b); });
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
