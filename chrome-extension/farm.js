(function(){if(window.top!==window)return;var S=window.__rbfSettings;if(!S||!(S.bots.farm))return;
(function __rbfRun(){if(document.readyState==='loading'||!document.body){document.addEventListener('DOMContentLoaded',__rbfRun,{once:true});return;}
try{
// Reborn BF – Farm quête (séries de 30 enchaînées, objectif réglable dans le panneau de l'appli)
// Basé sur « Auto Repeat x30 infini » v1.2

(function () {
  'use strict';
  if (window.__rbfFarm) return;
  window.__rbfFarm = true;

  const KEY = 'bfrRepeatBot';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} };
  const today = () => new Date().toDateString();
  // maxRuns : nombre de combats max accepté par le donjon aujourd'hui (null = bouton Max)
  // single  : le donjon n'accepte plus de répétition → lancement simple
  // target : nombre total de combats à faire avant d'arrêter (réglé dans le panneau de l'appli)
  let st = Object.assign({ on: false, quest: null, slot: null, loops: 0, maxRuns: null, single: false, day: today(),
    fights: 0, curRun: 0 }, load());
  st.target = Math.max(0, parseInt(st.target, 10) || 0); // 0 = sans fin, sinon nombre de combats choisi au lancement
  st.slot = null; // on ne force jamais une équipe : le jeu garde celle que tu as choisie
  const remaining = () => (st.target ? Math.max(0, st.target - st.fights) : Infinity);
  // Nombre de combats à demander pour la prochaine série (30 max par série dans le jeu)
  const wanted = () => Math.min(st.maxRuns || 30, remaining());

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const shown = (el) => el && el.offsetParent !== null;
  const visible = (el) => shown(el) && !el.disabled;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const resetLimits = () => { st.maxRuns = null; st.single = false; st.day = today(); };
  if (st.day !== today()) { resetLimits(); save(st); }

  // ---------- Badge ----------
  const css = document.createElement('style');
  css.textContent = `
    #rbf-farm{position:fixed;top:8px;right:8px;z-index:2147483600;display:none;align-items:center;gap:7px;
      height:30px;padding:0 12px 0 10px;border-radius:10px;background:rgba(14,11,7,.94);box-shadow:inset 0 0 0 1px rgba(255,210,120,.5),0 3px 8px rgba(0,0,0,.5);
      color:#f1ead8;font:600 12px/1 system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer;user-select:none;
      -webkit-tap-highlight-color:transparent;max-width:calc(100vw - 16px)}
    #rbf-farm.show{display:flex}
    #rbf-farm b{color:#ffd24a}
    #rbf-farm i{flex:none;width:8px;height:8px;border-radius:50%;background:#e05a5a}
    #rbf-farm.on i{background:#4fc27a;box-shadow:0 0 0 3px rgba(79,194,122,.18)}
    #rbf-farm span{color:#a99f88;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`;
  document.head.appendChild(css);
  const hud = document.createElement('div');
  hud.id = 'rbf-farm';
  hud.innerHTML = '<i></i><b></b><span></span>';
  document.body.appendChild(hud);
  let status = '';
  // Le badge n'existe que pendant un farm (plus un court message quand il s'arrête).
  // Sur téléphone, il va dans la bande au-dessus du jeu (barre de l'appli) au lieu de couvrir le jeu.
  let flashUntil = 0;
  const nativeTop = () => !!(window.__rbfTop && window.rbfNative && window.rbfNative.postMessage);
  const draw = () => {
    hud.classList.toggle('on', !!st.on);
    const n = st.fights + st.curRun;
    const title = 'Farm · ' + (st.target ? n + ' / ' + st.target : n + ' combat' + (n > 1 ? 's' : ''));
    const sub = status || (st.on ? 'touche pour arrêter' : '');
    hud.querySelector('b').textContent = title;
    hud.querySelector('span').textContent = sub;
    const visible = st.on || Date.now() < flashUntil;
    if (nativeTop()) {
      hud.classList.remove('show');
      try { window.rbfNative.postMessage('fstat:' + (visible ? (st.on ? '⏹  ' : '') + title + (status ? ' · ' + status : '') : '')); } catch (e) { /* rien */ }
    } else {
      hud.classList.toggle('show', visible);
    }
  };
  window.addEventListener('rbfbar', () => draw());
  // Arrêt depuis la barre de l'appli
  window.__rbfFarm = { stop: () => { if (st.on) { st.on = false; status = 'arrêté'; flashUntil = Date.now() + 3000; save(st); draw(); setTimeout(draw, 3100); } } };
  hud.addEventListener('click', () => {
    // Lancement depuis une quête : on demande combien de combats faire
    const q = location.pathname.match(/^\/start\/(\d+)/);
    if (!st.on && q && window.rbfData && window.rbfData.farm) { window.rbfData.farm(q[1]); return; }
    st.on = !st.on;
    if (st.on) {
      if (remaining() <= 0 || !st.fights) { st.fights = 0; st.curRun = 0; st.loops = 0; } // nouveau farm
      // On mémorise la quête depuis la page actuelle (/start/<id> ou /start/<id>/begin?slot=X)
      const m = location.pathname.match(/^\/start\/(\d+)/);
      if (m) {
        if (st.quest !== m[1]) resetLimits();
        st.quest = m[1];
      }
      if (!st.quest && !location.pathname.startsWith('/battle')) {
        status = 'ouvre une quête d\'abord';
        st.on = false;
      } else {
        status = '';
      }
    } else {
      status = 'arrêté';
      flashUntil = Date.now() + 3000;
      setTimeout(draw, 3100);
    }
    save(st); draw();
  });
  // Garde le badge même si le jeu redessine la page
  setInterval(() => { if (!document.body.contains(hud)) document.body.appendChild(hud); }, 2000);
  draw();

  const setStatus = (s) => {
    status = s;
    if (!st.on) { flashUntil = Date.now() + 5000; setTimeout(draw, 5100); } // message de fin, puis le badge disparaît
    draw();
  };
  const notify = (t) => { try { if (window.rbfNative) window.rbfNative.postMessage('notify:' + t); } catch (e) { /* rien */ } };
  const goQuest = () => { if (st.quest) location.href = '/start/' + st.quest; };
  const alertText = () => ($$('[role="alert"]').map((a) => a.textContent).join(' ') || '').trim();
  const runCount = () => parseInt((($('output[class*="runCount"]') || {}).textContent || '').replace(/\D/g, ''), 10) || 0;
  const picker = () => { const p = $('fieldset[class*="runPicker"]') || $('fieldset[aria-label="Répéter"]'); return shown(p) ? p : null; };
  const repeatToggle = () => $('button[aria-label="Répétition de quête"]') || $('button[class*="__repeat"]');

  // ---------- Écrans ----------
  let busy = false;
  let lastText = '', lastChange = Date.now();
  let beginTries = 0;

  async function prepareBegin() {
    const rep = repeatToggle();

    if (st.single || wanted() < 2) {
      // Lancement simple : on coupe la répétition si elle est ouverte
      if (picker() && visible(rep)) { rep.click(); await sleep(600); }
      return;
    }

    // Ouvre la répétition SEULEMENT si le sélecteur n'est pas déjà affiché.
    if (!picker() && visible(rep)) { rep.click(); await sleep(600); }
    if (!picker()) return;

    const want = wanted();
    if (want >= 30) {
      const max = $('button[aria-label="Maximum de combats"]');
      if (visible(max)) { max.click(); await sleep(400); }
    } else {
      // Ajuste au nombre restant (fin du farm) ou à la limite du jour du donjon
      const minus = $('button[aria-label="Moins de combats"]');
      const plus = $('button[aria-label="Plus de combats"]');
      for (let i = 0; i < 40 && runCount() > want && visible(minus); i++) { minus.click(); await sleep(120); }
      for (let i = 0; i < 40 && runCount() < want && visible(plus); i++) { plus.click(); await sleep(120); }
    }
  }

  async function tick() {
    if (!st.on || busy) return;
    busy = true;
    try {
      const path = location.pathname;
      if (st.day !== today()) { resetLimits(); save(st); }

      // Objectif atteint → on arrête
      if (remaining() <= 0 && !path.startsWith('/battle')) {
        st.on = false; save(st); setStatus('terminé ✔'); notify('Farm terminé : ' + st.fights + ' combats'); return;
      }

      // 1) Liste des renforts : on prend le PREMIER allié de la liste (ex. Semira)
      if (/^\/start\/\d+\/?$/.test(path)) {
        setStatus('renfort');
        const ally = $$('a[href*="/begin"][href*="ally="]').find(visible) || $$('a[href*="/begin"]').find(visible);
        if (ally) {
          location.href = ally.getAttribute('href'); // lien du jeu tel quel : ton équipe n'est jamais changée
        }
      }

      // 2) Écran « Begin Quest » : répétition + Max (30) puis Lancer
      else if (/^\/start\/\d+\/begin/.test(path)) {
        if (/no clears left/i.test(alertText())) {
          st.on = false; save(st);
          setStatus('plus de clears aujourd\'hui'); notify('Farm arrêté : plus de passages aujourd\'hui sur ce donjon');
          return;
        }

        setStatus('lancement');
        await prepareBegin();

        const start = $('button[class*="__start"]') || $('button[type="submit"]');
        if (!visible(start)) return;

        beginTries++;
        if (beginTries > 3) {
          // Toujours bloqué ici = sûrement plus d'énergie → on attend 3 min puis on réessaie
          setStatus('énergie ? attente 3 min');
          beginTries = 0;
          await sleep(180000);
          return;
        }

        start.click();
        await sleep(3000);

        // Toujours sur l'écran ? On lit la raison affichée par le jeu
        if (/^\/start\/\d+\/begin/.test(location.pathname)) {
          const msg = alertText();
          if (/more runs than clears/i.test(msg)) {
            beginTries = 0;
            const n = runCount() || st.maxRuns || 30;
            if (n > 2) { st.maxRuns = n - 1; setStatus('limite du jour → x' + st.maxRuns); }
            else { st.single = true; st.maxRuns = null; setStatus('limite du jour → x1'); }
            save(st);
          } else if (/no clears left/i.test(msg)) {
            st.on = false; save(st);
            setStatus('plus de clears aujourd\'hui'); notify('Farm arrêté : plus de passages aujourd\'hui sur ce donjon');
          }
        }
      }

      // 3) Combat
      else if (path.startsWith('/battle')) {
        beginTries = 0;
        const rm = document.body.innerText.match(/Run\s+(\d+)\s*\/\s*(\d+)/);
        if (rm && +rm[1] > st.curRun) { st.curRun = +rm[1]; save(st); }
        if (!rm && !st.curRun) { st.curRun = 1; save(st); }
        setStatus(rm ? rm[0] : 'combat');

        // Erreur de règlement → « Try again »
        const retry = $$('button').find((b) => visible(b) && /^try again$/i.test(b.textContent.trim()));
        if (retry) { retry.click(); }

        // Fin de série : écran des récompenses
        else if ($('[class*="repeatActions"]') || $('[class*="rewardScreen"]')) {
          if (st.curRun) { st.fights += st.curRun; st.curRun = 0; save(st); draw(); }
          const next = $$('[aria-label="Next"],[class*="tapNext"]').find(visible);
          const actions = $('[class*="repeatActions"]');
          const again = actions && $$('a,button', actions).find((b) => visible(b) &&
            /again|encore|rejouer|recommencer|répéter|repeat|retry/i.test(b.textContent + ' ' + (b.getAttribute('aria-label') || '')));
          if (remaining() <= 0) { st.on = false; save(st); setStatus('terminé ✔'); notify('Farm terminé : ' + st.fights + ' combats'); }
          // « Repeat again » relance 30 : seulement s'il en reste au moins 30 et pas de limite du jour
          else if (again && !st.maxRuns && !st.single && remaining() >= 30) { st.loops++; save(st); again.click(); }
          else if (next) { next.click(); }
          else if (actions) { st.loops++; save(st); goQuest(); }
        }

        // Watchdog : rien ne bouge depuis 2 min → on relance la quête
        const txt = document.body.innerText.slice(0, 400);
        if (txt !== lastText) { lastText = txt; lastChange = Date.now(); }
        else if (Date.now() - lastChange > 120000) {
          lastChange = Date.now(); st.loops++;
          if (st.curRun) { st.fights += st.curRun; st.curRun = 0; }
          save(st); goQuest();
        }
      }

      // 4) Ailleurs (accueil, vortex, résultats inconnus…) → retour à la quête
      else if (st.quest && !/^\/(account|squad|items)/.test(path)) {
        setStatus('retour quête');
        await sleep(1500);
        goQuest();
      }
    } catch (e) {
      console.warn('[RBF farm]', e);
    } finally {
      busy = false;
    }
  }

  setInterval(tick, 1500);
})();

}catch(e){console.error("[RBF] farm",e)}
})();
})();
