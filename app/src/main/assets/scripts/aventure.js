// Reborn BF – Bot Aventure v1.0
// Avance tout seul dans l'aventure principale : prochaine mission non terminée → renfort → combat en AUTO x2 → retour → suivante.
// Attend l'énergie au lieu de dépenser des gemmes.

(() => {
  'use strict';
  if (window.__rbfAdv) return;
  window.__rbfAdv = true;

  /* ───────────── Réglages ───────────── */
  const CFG = {
    tick: 1200,            // fréquence de vérification (ms)
    clickDelay: 900,       // pause avant chaque clic (ms)
    x2: true,              // vitesse x2 en combat
    energyRecheck: 5 * 60e3, // en attente d'énergie : recharge la page toutes les 5 min
    stuckAfter: 120e3,     // aucune progression pendant 2 min → on recharge, puis on s'arrête
  };
  const HIT_AUTO = { x: 506, y: 494 };   // boutons du combat (coordonnées du jeu)
  const HIT_SPEED = { x: 582, y: 497 };
  // Tout dialogue contenant ces mots est ignoré : on ne touche jamais aux achats.
  const DANGER = /gem|gemme|recharg|acheter|achat|buy|refill|purchase|payer/i;

  /* ───────────── Utilitaires ───────────── */
  const KEY = 'rbf_adv_actif';
  const ss = {
    get(k, d) { try { return JSON.parse(sessionStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* rien */ } },
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const shown = (el) => !!el && el.getBoundingClientRect().width > 0;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const path = () => location.pathname;

  /* ───────────── Moteur du jeu (pour AUTO / x2) ───────────── */
  let game = null;
  function hookPhaser() {
    const P = window.Phaser;
    if (!P?.Scenes?.SceneManager || P.__rbfAdvHook) return;
    const update = P.Scenes.SceneManager.prototype.update;
    P.Scenes.SceneManager.prototype.update = function (...a) { game = this.game; return update.apply(this, a); };
    P.__rbfAdvHook = true;
  }
  function battleScene() {
    try {
      const s = game?.scene.getScene('battle');
      return s && s.sys.isActive() && s.controls ? s : null;
    } catch { return null; }
  }

  /* ───────────── Lecture des pages ───────────── */
  function energy() {
    const el = $('span[title="Énergie"] [aria-label*="/"]');
    const m = el?.getAttribute('aria-label').match(/(\d+)\s*\/\s*(\d+)/);
    return m ? { cur: +m[1], max: +m[2] } : null;
  }
  const costOf = (el) => +((el?.innerText || '').match(/Énergie\s*(\d+)/i)?.[1] || 0);

  // Dialogue bloquant affiché par le jeu (hors combat Phaser)
  function dialog() {
    return $$('[role="dialog"], [data-battle-modal]').find(shown) || null;
  }

  /* ───────────── État / pastille ───────────── */
  const st = {
    on: (() => { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } })(),
    busy: false,
    status: '',
    lastFix: 0,
  };
  let pill = null;

  function mountPill() {
    if (pill && document.body.contains(pill)) return;
    if (!$('#rbf-adv-style')) {
      const s = document.createElement('style');
      s.id = 'rbf-adv-style';
      s.textContent = `
        #rbf-adv{position:fixed;left:8px;bottom:8px;z-index:2147483600;display:flex;align-items:center;gap:7px;
          height:30px;padding:0 12px 0 10px;border-radius:10px;background:rgba(14,11,7,.94);box-shadow:inset 0 0 0 1px rgba(255,210,120,.5),0 3px 8px rgba(0,0,0,.5);
          color:#ffd24a;font:600 12px/1 system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer;user-select:none;
          -webkit-tap-highlight-color:transparent;max-width:min(460px,calc(100vw - 16px))}
        #rbf-adv i{flex:none;width:8px;height:8px;border-radius:50%;background:#5c6070}
        #rbf-adv.on i{background:#4fc27a;box-shadow:0 0 0 3px rgba(79,194,122,.18)}
        #rbf-adv.warn i{background:#e0a83c;box-shadow:0 0 0 3px rgba(224,168,60,.18)}
        #rbf-adv.native{display:none}
        #rbf-adv span{color:#a99f88;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`;
      document.head.appendChild(s);
    }
    pill = document.createElement('div');
    pill.id = 'rbf-adv';
    pill.title = 'Activer / couper le bot aventure';
    pill.innerHTML = '<i></i><b></b><span></span>';
    pill.addEventListener('click', () => setOn(!st.on));
    document.body.appendChild(pill);
    render();
  }

  function render(status, warn = false) {
    if (status !== undefined) st.status = status;
    if (!pill) return;
    const runs = ss.get('rbf_adv_runs', 0);
    pill.classList.toggle('on', st.on && !warn);
    pill.classList.toggle('warn', st.on && warn);
    pill.querySelector('b').textContent = st.on ? 'Aventure' : 'Aventure en pause';
    const sub = [runs ? `${runs} mission${runs > 1 ? 's' : ''}` : '', st.status].filter(Boolean).join(' · ');
    pill.querySelector('span').textContent = sub;
    // Sur téléphone : affiché dans la bande au-dessus du jeu (barre de l'appli), pas sur le jeu
    const nat = !!(window.__rbfTop && window.rbfNative && window.rbfNative.postMessage);
    pill.classList.toggle('native', nat);
    if (nat) {
      try { window.rbfNative.postMessage('astat:' + (st.on ? '⏹  Aventure' : '▶  Aventure en pause') + (sub ? ' · ' + sub : '')); } catch (e) { /* rien */ }
    }
  }
  window.__rbfAdv = { stop: () => setOn(!st.on) };
  window.addEventListener('rbfbar', () => render());

  function setOn(v, why = '') {
    st.on = v;
    try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* rien */ }
    ss.set('rbf_adv_doneAreas', []);
    watch.reset();
    render(why);
  }
  /* ───────────── Données du jeu : boss, éléments, conseils ───────────── */
  const EL_FR = { fire: 'Feu', water: 'Eau', earth: 'Terre', thunder: 'Foudre', light: 'Lumière', dark: 'Ténèbres' };
  const BEATS = { fire: 'water', water: 'thunder', thunder: 'earth', earth: 'fire', light: 'dark', dark: 'light' };
  let intel = ss.get('rbf_adv_intel', null); // { id, name, boss, el, tip, waves }
  async function learnMission(id) {
    if (!window.rbfData || (intel && intel.id === id)) return;
    try {
      const m = await window.rbfData.missionInfo(id);
      if (!m) return;
      const all = [].concat(...m.waves);
      const boss = all.find((e) => e.boss) || all.sort((a, b) => b.hp - a.hp)[0];
      const el = boss && boss.element;
      intel = { id, name: m.name, boss: boss ? boss.name : '', el: el || '', tip: el && BEATS[el] ? EL_FR[BEATS[el]] : '', waves: m.waves.length, energy: m.energy };
      ss.set('rbf_adv_intel', intel);
    } catch (e) { /* données indisponibles */ }
  }
  const intelText = () => (intel && intel.boss ? `boss ${intel.boss}${intel.el ? ' (' + (EL_FR[intel.el] || intel.el) + ')' : ''}` : '');
  const advice = () => (intel && intel.boss
    ? ` – mission « ${intel.name} », boss ${intel.boss}${intel.el ? ' (' + (EL_FR[intel.el] || intel.el) + ')' : ''}${intel.tip ? ' : prends des unités ' + intel.tip : ''}`
    : '');

  const stop = (why) => {
    why += advice();
    setOn(false, why);
    try { if (window.rbfNative) window.rbfNative.postMessage('notify:Aventure arrêtée : ' + why); } catch (e) { /* rien */ }
  };

  // Clique après une courte pause, en vérifiant que l'élément est toujours là.
  async function click(el, status) {
    st.busy = true;
    render(status);
    await sleep(CFG.clickDelay + Math.random() * 400);
    if (st.on && document.body.contains(el)) { el.click(); watch.progress(); }
    await sleep(1500);
    st.busy = false;
  }

  function go(url, status) {
    render(status);
    watch.progress();
    location.assign(url);
  }

  /* ───────────── Surveillance anti-blocage ───────────── */
  const watch = {
    last: Date.now(),
    progress() { this.last = Date.now(); ss.set('rbf_adv_reloads', 0); },
    reset() { this.last = Date.now(); ss.set('rbf_adv_reloads', 0); },
    check() {
      if (Date.now() - this.last < CFG.stuckAfter) return;
      const n = ss.get('rbf_adv_reloads', 0);
      if (n >= 1) { stop('bloqué – à vérifier'); return; }
      ss.set('rbf_adv_reloads', n + 1);
      this.last = Date.now();
      location.reload();
    },
  };

  /* ───────────── Attente d'énergie ───────────── */
  let waitingSince = 0;
  function enoughEnergy(cost) {
    const e = energy();
    if (!e || !cost || e.cur >= cost) { waitingSince = 0; return true; }
    if (!waitingSince) waitingSince = Date.now();
    render(`énergie ${e.cur}/${e.max} – attend ${cost}`, true);
    watch.reset(); // attendre l'énergie n'est pas un blocage
    if (Date.now() - waitingSince > CFG.energyRecheck) { waitingSince = 0; location.reload(); }
    return false;
  }

  /* ───────────── Étapes ───────────── */

  // Combat : AUTO + x2, puis écran de résultats → « Back to quests »
  async function stepBattle() {
    const back = $$('a[class*="battle-result"][href^="/quests"]').find(shown);
    if (back) {
      ss.set('rbf_adv_runs', ss.get('rbf_adv_runs', 0) + 1);
      await click(back, 'mission suivante');
      return;
    }
    const next = $$('button[class*="tapNext"]').find(shown);
    if (next) { await click(next, 'récompenses'); return; }

    // Défaite : on ne continue jamais avec des gemmes, on s'arrête avec un conseil tiré des données du jeu
    if (/\b(game over|defeat|défaite|vous avez perdu|you lost)\b/i.test(document.body.innerText.slice(0, 3000))) {
      stop('défaite');
      return;
    }

    const s = battleScene();
    if (!s) return;
    render(intelText() ? 'combat · ' + intelText() : 'combat');
    watch.progress();
    const now = Date.now();
    if (now - st.lastFix < 2000) return;
    if (!s.controls.auto) { st.lastFix = now; s.onControl(HIT_AUTO); }
    else if (CFG.x2 && s.controls.speed !== 2) { st.lastFix = now; s.onControl(HIT_SPEED); }
  }

  // Préparation : « Begin Quest »
  async function stepBegin() {
    learnMission(path().match(/^\/start\/(\d+)/)[1]);
    const btn = $('button[class*="__start"]');
    if (!shown(btn) || btn.disabled) return;
    const cost = costOf(document.body) || (intel && intel.id === path().match(/^\/start\/(\d+)/)[1] ? intel.energy : 0);
    if (!enoughEnergy(cost)) return;
    await click(btn, intelText() ? 'départ · ' + intelText() : 'départ');
  }

  // Choix du renfort : le premier de la liste, sinon « Aucune aide »
  async function stepHelper() {
    learnMission(path().match(/^\/start\/(\d+)/)[1]);
    const ally = $$('a[class*="__row"][href*="/begin"][href*="ally="]').find(shown);
    const none = $('a[class*="noHelperButton"]');
    const el = ally || (shown(none) ? none : null);
    if (el) await click(el, 'renfort');
  }

  // Donjon : première mission non terminée
  async function stepDungeon() {
    const missions = $$('li[class*="__mission"]').filter((li) => li.querySelector('a[href^="/start/"]'));
    if (!missions.length) return;
    const todo = missions.find((li) => li.dataset.cleared !== 'true');
    if (!todo) {
      const back = $('a[class*="__back"][href^="/quests/area/"]');
      if (back) await click(back, 'donjon terminé');
      else go('/quests', 'donjon terminé');
      return;
    }
    const link = todo.querySelector('a[href^="/start/"]');
    if (!enoughEnergy(costOf(link))) return;
    await click(link, link.querySelector('strong')?.innerText || 'mission');
  }

  // Zone : premier donjon non terminé ; si tout est fini → carte du monde
  async function stepArea() {
    const dungeons = $$('a[href^="/quests/dungeon/"]');
    if (!dungeons.length) return;
    const todo = dungeons.find((a) => !/termin|clear/i.test(a.getAttribute('aria-label') || ''));
    if (todo) { await click(todo, todo.innerText.trim() || 'donjon'); return; }

    const area = path().split('/').pop();
    const done = ss.get('rbf_adv_doneAreas', []);
    if (!done.includes(area)) ss.set('rbf_adv_doneAreas', [...done, area]);
    go('/quests', 'zone terminée');
  }

  // Carte du monde : la zone la plus avancée pas encore terminée
  async function stepWorld() {
    const done = ss.get('rbf_adv_doneAreas', []);
    const areas = $$('a[href^="/quests/area/"]')
      .map((a) => ({ a, id: +a.getAttribute('href').split('/').pop() }))
      .filter((x) => !done.includes(String(x.id)))
      .sort((x, y) => y.id - x.id);
    if (areas.length) { await click(areas[0].a, 'nouvelle zone'); return; }
    if ($$('a[href^="/quests/area/"]').length) stop('plus de zone à faire');
  }

  /* ───────────── Boucle ───────────── */
  async function tick() {
    if (!document.body.contains(pill)) mountPill();
    hookPhaser();
    if (!st.on || st.busy) return;

    // Le jeu est ouvert ailleurs : on ne fait rien.
    if ($$('button').some((b) => /jouer ici/i.test(b.innerText) && shown(b))) {
      render('jeu ouvert ailleurs', true);
      watch.reset();
      return;
    }

    // Une fenêtre du jeu est ouverte : on ne touche qu'aux « passer / OK » sans risque.
    const d = dialog();
    if (d && !battleScene()) {
      if (DANGER.test(d.innerText)) { stop('fenêtre d\'achat détectée'); return; }
      const ok = [...d.querySelectorAll('button, a')].find((b) => shown(b) && /^(ok|fermer|close|passer|skip|continuer|suivant|next)$/i.test(b.innerText.trim()));
      if (ok) await click(ok, 'fenêtre fermée');
      watch.check();
      return;
    }

    // Histoire / cinématique : « Skip » / « Passer »
    const skip = $$('button, a').find((b) => shown(b) && /^(skip|passer)$/i.test(b.innerText.trim()));
    if (skip) { await click(skip, 'histoire passée'); return; }

    const p = path();
    if (p.startsWith('/battle')) await stepBattle();
    else if (/^\/start\/\d+\/begin/.test(p)) await stepBegin();
    else if (/^\/start\/\d+/.test(p)) await stepHelper();
    else if (p.startsWith('/quests/dungeon/')) await stepDungeon();
    else if (p.startsWith('/quests/area/')) await stepArea();
    else if (p === '/quests') await stepWorld();
    else if (p === '/' || p === '/home') go('/quests', 'vers l\'aventure');
    else { render('en pause sur cette page'); watch.reset(); return; } // tu navigues ailleurs : on ne force rien

    watch.check();
  }

  function init() {
    mountPill();
    render(st.on ? 'démarrage' : '');
    setInterval(tick, CFG.tick);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
