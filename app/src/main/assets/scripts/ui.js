// Interface de l'appli par-dessus le jeu : bouton ☰, menu rapide, bots & réglages.
// Isolée dans un Shadow DOM pour ne jamais toucher au style du jeu.
(function () {
  'use strict';
  if (window.__rbfUI) return;
  const N = window.rbfApp || window.rbfNative;
  const ANDROID = N && N.platform === 'android';
  if (!N || typeof N.settings !== 'function') return;

  const SITE_PATHS = { home: '/home', quests: '/quests' };
  let S = N.settings();
  let dirty = false;
  let panelOpen = false;

  const host = document.createElement('div');
  host.id = 'rbf-ui-host';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
  <style>
    :host{all:initial}
    *{box-sizing:border-box;font-family:"Segoe UI Variable","Segoe UI",system-ui,sans-serif;-webkit-tap-highlight-color:transparent}
    /* Style du jeu : panneaux brun foncé bordés d'or, titres Lilita One contourés, vrais boutons du jeu */
    .ol,h2,.sec,.tile span,.bot b,.chip,.btn,.fab{text-shadow:1.2px 0 #1a1006,-1.2px 0 #1a1006,0 1.2px #1a1006,0 -1.2px #1a1006,1px 1px #1a1006,-1px -1px #1a1006,0 2px 3px rgba(0,0,0,.5)}
    .fab{position:fixed;right:0;top:50%;margin-top:-28px;width:28px;height:56px;border-radius:12px 0 0 12px;pointer-events:auto;cursor:pointer;
      display:flex;align-items:center;justify-content:center;font:18px/1 "Lilita One",system-ui,sans-serif;color:#ffd24a;background:rgba(14,11,7,.92);
      box-shadow:inset 0 0 0 1px rgba(255,210,120,.5),0 4px 12px rgba(0,0,0,.5);opacity:.8;transition:opacity .15s,width .15s;user-select:none}
    .fab:hover{opacity:1;width:34px}.fab:active{filter:brightness(1.2)}
    .scrim{position:fixed;inset:0;background:rgba(0,0,0,.6);pointer-events:auto;opacity:0;transition:opacity .18s;display:none}
    .scrim.on{display:block;opacity:1}
    .sheet,.panel{background:rgba(14,11,7,.97);color:#f1ead8;box-shadow:inset 0 0 0 1.5px rgba(255,210,120,.45),0 10px 30px rgba(0,0,0,.6);scrollbar-width:thin}
    .sheet{position:fixed;left:50%;bottom:0;transform:translate(-50%,105%);width:min(480px,100vw);max-height:86vh;overflow:auto;pointer-events:auto;
      border-radius:16px 16px 0 0;padding:10px 12px 16px;transition:transform .22s cubic-bezier(.2,.8,.2,1)}
    .sheet.on{transform:translate(-50%,0)}
    .panel{position:fixed;left:50%;top:50%;transform:translate(-50%,-47%) scale(.97);opacity:0;width:min(440px,94vw);max-height:90vh;overflow:auto;
      pointer-events:none;border-radius:14px;padding:14px 14px 12px;transition:opacity .18s,transform .18s}
    .panel.on{opacity:1;transform:translate(-50%,-50%) scale(1);pointer-events:auto}
    .grip{width:40px;height:5px;border-radius:3px;background:rgba(255,210,120,.35);margin:0 auto 10px}
    .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:8px}
    .tile{height:76px;border-radius:11px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;cursor:pointer;
      background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px rgba(255,210,120,.22);transition:box-shadow .12s,transform .1s;padding:4px;text-align:center}
    .tile:hover{box-shadow:inset 0 0 0 1px rgba(255,210,120,.6)}.tile:active{transform:scale(.95)}
    .tile i{font-style:normal;font-size:22px;line-height:1}
    .tile span{font:12px/1.15 "Lilita One",system-ui,sans-serif;color:#fff;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    /* Bouton du jeu : l'image garde ses coins (découpe en 9), seule la partie centrale s'étire */
    .btn{display:flex;align-items:center;justify-content:center;gap:6px;width:auto;min-width:120px;height:44px;margin:6px auto 0;padding:0 18px 3px;cursor:pointer;
      background:none;border-style:solid;border-width:0;border-image:url('https://assets.rebornbf.com/assets/original/common/button/sub_ss_btn1.png') 26 34 fill / 13px 17px;
      color:#fff;font:15px/1 "Lilita One",system-ui,sans-serif;transition:transform .08s,filter .1s}
    .btn:hover{filter:brightness(1.12)}.btn:active{transform:scale(.96)}
    .btn.gold{color:#ffd24a;font-size:16px;height:48px;min-width:220px}
    h2{margin:0;font:21px/1.15 "Lilita One",system-ui,sans-serif;font-weight:400;color:#ffd24a}
    .sub{color:#cfc6b0;font-size:12.5px;margin:3px 0 0}
    .row{display:flex;align-items:center;gap:12px;border-radius:10px;padding:11px 12px;margin:6px 0;cursor:pointer;background:rgba(255,255,255,.04)}
    .row .t{flex:1;min-width:0}.row b{display:block;font-size:14px}.row small{display:block;color:#a99f88;font-size:12px;margin-top:2px}
    .sw{position:relative;width:44px;height:24px;border-radius:12px;background:#3a2f1e;flex:none;transition:background .15s;box-shadow:inset 0 0 0 1px rgba(255,210,120,.3)}
    .sw::after{content:"";position:absolute;left:3px;top:3px;width:18px;height:18px;border-radius:50%;background:#9a8d72;transition:transform .15s,background .15s}
    .sw.on{background:linear-gradient(180deg,#e0a52a,#a86d10)}.sw.on::after{transform:translateX(20px);background:#fff3cc;box-shadow:0 1px 3px rgba(0,0,0,.5)}
    textarea{width:100%;height:180px;border-radius:10px;border:0;background:rgba(0,0,0,.45);color:#f1ead8;box-shadow:inset 0 0 0 1px rgba(255,210,120,.3);
      font:12px Consolas,monospace;padding:10px;resize:vertical;outline:none}
    .actions{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:12px}.actions .btn{margin:0}
    .x{background:none;border:0;color:#cfc6b0;font-size:18px;cursor:pointer;padding:4px 8px}
    .toast{position:fixed;left:50%;bottom:76px;transform:translateX(-50%);max-width:90vw;background:rgba(14,11,7,.96);color:#f1ead8;
      box-shadow:inset 0 0 0 1px rgba(255,210,120,.5),0 6px 16px rgba(0,0,0,.5);border-radius:10px;padding:10px 16px;font-size:13px;opacity:0;transition:opacity .25s;pointer-events:none}
    .toast.on{opacity:1}
    .hint{color:#a99f88;font-size:12px;margin:10px 4px 0;text-align:center}
    .head{display:flex;align-items:center;gap:10px;padding-bottom:10px;border-bottom:1px solid rgba(255,210,120,.22)}
    .head .ht{flex:1;min-width:0}
    .logo{width:40px;height:40px;flex:none;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;color:#3a2508;
      background:linear-gradient(160deg,#ffe49a,#c98a1d);box-shadow:inset 0 0 0 1px #fff3c4,0 3px 8px rgba(0,0,0,.5)}
    .sec{display:flex;align-items:baseline;gap:8px;font:16px/1.2 "Lilita One",system-ui,sans-serif;color:#fff;margin:16px 2px 8px}
    .sec em{margin-left:auto;font:italic 11.5px "Segoe UI",system-ui,sans-serif;text-shadow:none;color:#a99f88}
    .bots{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .bot{position:relative;border-radius:11px;padding:12px 10px 10px;cursor:pointer;background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px rgba(255,210,120,.2);
      transition:box-shadow .15s,background .15s,transform .1s}
    .bot:active{transform:scale(.97)}
    .bot i{font-style:normal;font-size:24px;display:block;margin-bottom:6px}
    .bot b{display:block;font:16px/1.15 "Lilita One",system-ui,sans-serif;font-weight:400;color:#fff}
    .bot small{display:block;color:#a99f88;font-size:11.5px;margin-top:4px;line-height:1.35}
    .bot .pill{position:absolute;top:9px;right:9px;font-size:10.5px;padding:3px 8px;border-radius:20px;background:rgba(255,255,255,.08);color:#a99f88}
    .bot.on{background:linear-gradient(180deg,rgba(255,210,120,.18),rgba(255,210,120,.04));box-shadow:inset 0 0 0 1.5px #e0a52a}
    .bot.on .pill{background:#e0a52a;color:#2a1a04;font-weight:700}
    .chips{display:flex;gap:8px}
    .chip{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;height:44px;border-radius:10px;cursor:pointer;
      font:15px/1 "Lilita One",system-ui,sans-serif;color:#cfc6b0;background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px rgba(255,210,120,.2);transition:all .15s}
    .chip i{font-style:normal}
    .chip.on{color:#ffd24a;background:rgba(255,210,120,.14);box-shadow:inset 0 0 0 1.5px #e0a52a}
    .card{border-radius:11px;overflow:hidden;background:rgba(255,255,255,.03);box-shadow:inset 0 0 0 1px rgba(255,210,120,.18)}
    .item{display:flex;align-items:center;gap:12px;padding:11px 12px;cursor:pointer;transition:background .12s}
    .item:hover{background:rgba(255,210,120,.06)}
    .item + .item{border-top:1px solid rgba(255,210,120,.12)}
    .item i{font-style:normal;font-size:18px;width:24px;text-align:center;flex:none}
    .item .t{flex:1;min-width:0}.item b{display:block;font-size:14px;color:#fff}
    .item small{display:block;color:#a99f88;font-size:12px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .empty{color:#a99f88;font-size:12.5px;margin:0;padding:12px}
    .add{display:block;width:100%;padding:12px;background:none;border:0;border-top:1px solid rgba(255,210,120,.12);color:#ffd24a;
      font:15px "Lilita One",system-ui,sans-serif;cursor:pointer;text-align:left}
    kbd{background:rgba(255,255,255,.1);border-radius:5px;padding:1px 6px;font-size:11px;color:#e9e1cc}
  </style>
  <div class="fab" title="Menu (Ctrl+M)">☰</div>
  <div class="scrim"></div>
  <div class="sheet"></div>
  <div class="panel"></div>
  <div class="toast"></div>`;

  const $ = (s) => root.querySelector(s);
  const fab = $('.fab'), scrim = $('.scrim'), sheet = $('.sheet'), panel = $('.panel'), toastEl = $('.toast');
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function toast(t) {
    toastEl.textContent = t;
    toastEl.classList.add('on');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => toastEl.classList.remove('on'), 2400);
  }

  function closeAll() {
    const wasPanel = panelOpen;
    panelOpen = false;
    sheet.classList.remove('on');
    panel.classList.remove('on');
    scrim.classList.remove('on');
    if (wasPanel && dirty) apply();
  }
  scrim.addEventListener('click', closeAll);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); }, true);

  // ───────── Navigation dans le jeu (rapide, sans recharger) ─────────
  function goTo(p) {
    const a = [...document.querySelectorAll('a[href]')].find((x) => (x.getAttribute('href') || '').split(/[?#]/)[0] === p);
    if (a) { a.click(); return; }
    try { if (window.next && window.next.router && window.next.router.push) { window.next.router.push(p); return; } } catch (e) { /* rien */ }
    location.assign(p);
  }

  function ls(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }

  function iconFor(p, l) {
    const k = (p + ' ' + l).toLowerCase();
    const map = [[/arena|arène|pvp/, '⚔️'], [/summon|invoc/, '✨'], [/unit|unité|squad|équipe/, '👥'], [/item|objet|inventa/, '🎒'],
      [/shop|boutique|store/, '🛒'], [/friend|ami|social/, '🤝'], [/account|compte|profil|summoner/, '👤'], [/gift|cadeau|mail/, '🎁'],
      [/mission|daily|quotid/, '📜'], [/vortex|dungeon|donjon|event/, '🌀'], [/guild|guilde/, '🛡️'], [/town|ville|randall/, '🏰'],
      [/news|info/, '📰'], [/quest|quête/, '🗺️'], [/rank|classement/, '🏆'], [/other|menu|setting|option/, '⚙️']];
    for (const [re, i] of map) if (re.test(k)) return i;
    return '🔹';
  }

  // ───────── Menu rapide ─────────
  function quick() {
    if (sheet.classList.contains('on')) { closeAll(); return; }
    panel.classList.remove('on');
    const path = location.pathname;
    const bot = ls('bfrRepeatBot', {});
    const nav = ls('rbf_nav', {});
    const qm = path.match(/^\/start\/(\d+)/);
    let html = '<div class="grip"></div>';
    if (qm) html += `<button class="btn gold" data-a="farm" data-id="${qm[1]}">🔁  Farmer cette quête</button>`;
    else if (bot.quest) html += `<button class="btn gold" data-a="resume" data-id="${esc(bot.quest)}">▶  Reprendre ma dernière quête</button>`;
    html += '<div class="grid">';
    const tiles = [['⬅️', 'Retour', 'back'], ['🏠', 'Accueil', 'go:/home'], ['🗺️', 'Quêtes', 'go:/quests']];
    Object.keys(nav).filter((p) => p !== '/home' && p !== '/quests')
      .sort((a, b) => (nav[b].n || 0) - (nav[a].n || 0)).slice(0, 9)
      .forEach((p) => tiles.push([iconFor(p, nav[p].l), nav[p].l, 'go:' + p]));
    tiles.push(['🔄', 'Recharger', 'reload'], ['📋', 'Copier pour Claude', 'copy'], ['🤖', 'Bots & réglages', 'settings']);
    html += tiles.map(([i, l, a]) => `<div class="tile" data-a="${esc(a)}"><i>${i}</i><span>${esc(l)}</span></div>`).join('');
    html += '</div>';
    if (Object.keys(nav).length < 3) html += '<p class="hint">Les autres rubriques du jeu apparaîtront ici dès que tu auras ouvert le menu du jeu une fois.</p>';
    if (!ANDROID) html += '<p class="hint"><kbd>Ctrl</kbd>+<kbd>M</kbd> menu · <kbd>F11</kbd> plein écran · <kbd>F5</kbd> recharger · <kbd>Alt</kbd>+<kbd>←</kbd> retour</p>';
    sheet.innerHTML = html;
    scrim.classList.add('on');
    requestAnimationFrame(() => sheet.classList.add('on'));
  }

  sheet.addEventListener('click', (e) => {
    const el = e.target.closest('[data-a]');
    if (!el) return;
    const a = el.dataset.a;
    closeAll();
    if (a === 'back') history.back();
    else if (a === 'reload') location.reload();
    else if (a === 'settings') settings();
    else if (a === 'copy') copyForClaude();
    else if (a.startsWith('go:')) goTo(a.slice(3));
    else if (a === 'resume') location.assign('/start/' + el.dataset.id);
    else if (a === 'farm') { if (window.rbfData) window.rbfData.farm(el.dataset.id); else farmQuest(el.dataset.id); }
  });

  function copyForClaude() {
    const data = localStorage.getItem('rbf_struct') || '[]';
    let n = 0;
    try { n = JSON.parse(data).length; } catch (e) { /* rien */ }
    navigator.clipboard.writeText('RBF-PAGES ' + data)
      .then(() => toast(n + ' écran(s) copié(s) : colle-les dans la discussion avec Claude'))
      .catch(() => toast('Copie impossible'));
  }

  function farmQuest(id, target) {
    try {
      localStorage.setItem('rbf_adv_actif', '0');
      const s = ls('bfrRepeatBot', {});
      if (s.quest !== id) { s.maxRuns = null; s.single = false; }
      Object.assign(s, { quest: id, on: true, target: Math.max(0, parseInt(target, 10) || 0), fights: 0, curRun: 0, loops: 0, slot: null, day: new Date().toDateString() });
      localStorage.setItem('bfrRepeatBot', JSON.stringify(s));
    } catch (e) { /* rien */ }
    S.bots.farm = true;
    S.bots.aventure = false;
    toast(+target ? 'Farm lancé : ' + target + ' combats' : 'Farm lancé : il tourne jusqu\'à ce que tu l\'arrêtes');
    N.save(S, '/start/' + id);
  }

  // ───────── Bots & réglages ─────────
  const sw = (on) => `<div class="sw${on ? ' on' : ''}"></div>`;
  const item = (key, icon, title, sub, on) =>
    `<div class="item" data-k="${key}"><i>${icon}</i><div class="t"><b>${esc(title)}</b><small>${esc(sub)}</small></div>${sw(on)}</div>`;
  const bot = (key, icon, title, sub, on) =>
    `<div class="bot${on ? ' on' : ''}" data-k="bot:${key}"><span class="pill">${on ? 'Actif' : 'Inactif'}</span><i>${icon}</i><b>${esc(title)}</b><small>${esc(sub)}</small></div>`;
  const chip = (key, icon, title, on) => `<div class="chip${on ? ' on' : ''}" data-k="opt:${key}"><i>${icon}</i>${esc(title)}</div>`;

  function settings() {
    sheet.classList.remove('on');
    let h = `<div class="head"><div class="logo">◆</div><div class="ht"><h2>Bots & réglages</h2>
      <p class="sub">S'applique quand tu fermes le panneau</p></div><button class="x" data-close aria-label="Fermer">✕</button></div>`;
    h += '<div class="sec">Bots<em>un seul à la fois</em></div><div class="bots">';
    h += bot('farm', '🔁', 'Farm quête', 'Relance ta quête le nombre de fois choisi. Ouvre une quête puis ☰ → Farmer.', S.bots.farm);
    h += bot('aventure', '🗺️', 'Aventure auto', 'Avance seul dans l\'histoire. Ne dépense jamais de gemmes.', S.bots.aventure);
    h += '</div>';
    h += '<div class="sec">Combat</div><div class="chips">';
    h += chip('always_x2', '⏩', 'Toujours x2', S.opt.always_x2) + chip('always_auto', '🤖', 'Toujours AUTO', S.opt.always_auto);
    h += '</div><div class="sec">Turbo<em>en plus du x2 du jeu</em></div><div class="chips">';
    h += chip('turbo_off', '🐢', 'Normal', !S.opt.turbo15 && !S.opt.turbo2) + chip('turbo15', '🚀', 'x1,5', S.opt.turbo15) + chip('turbo2', '⚡', 'x2', S.opt.turbo2);
    h += '</div>';
    h += `<div class="sec">Mes scripts<em>${ANDROID ? 'appui long' : 'clic droit'} pour supprimer</em></div><div class="card">`;
    if (!S.custom.length) h += '<p class="empty">Aucun script. Ajoute ton bot d\'arène ou un autre script Tampermonkey.</p>';
    S.custom.forEach((c, i) => { h += item('custom:' + i, '📄', c.name || 'Script', c.on !== false ? 'Activé' : 'Désactivé', c.on !== false); });
    h += '<button class="add" data-add>＋ Ajouter un script</button></div>';
    h += '<div class="sec">Confort</div><div class="card">';
    h += item('opt:remaster', '🃏', 'Fiche d\'unité remaster', 'Nouvelle fiche moderne, grande illustration', S.opt.remaster);
    h += item('opt:infos', '📜', 'Infos du jeu', 'Butin et vagues des quêtes, taux d\'invocation', S.opt.infos !== false);
    h += item('opt:appfeel', '✨', 'Style appli', 'Boutons qui réagissent, transitions douces', S.opt.appfeel);
    h += item('opt:antipause', '⏯️', 'Anti-pause', 'Le jeu continue quand la fenêtre est derrière', S.opt.antipause);
    h += item('opt:notifications', '🔔', 'Notifications', 'Prévient quand un bot s\'arrête', S.opt.notifications);
    h += item('opt:hd', '🖼️', 'Filtre HD', 'Images un peu plus nettes et colorées', S.opt.hd);
    if (ANDROID) {
      h += item('opt:haptic', '📳', 'Vibrations', 'Petite vibration quand tu touches un bouton', S.opt.haptic !== false);
      h += item('opt:screen_on', '💡', 'Écran toujours allumé', 'Pas de mise en veille pendant le jeu', S.opt.screen_on !== false);
      h += item('opt:fullscreen', '📱', 'Plein écran', 'Cache les barres du téléphone', S.opt.fullscreen !== false);
      h += item('opt:format169', '🖼', 'Format du jeu', 'Garde les proportions du jeu, rien n\'est étiré', S.opt.format169 !== false);
    }
    h += '</div>';
    h += `<div class="actions">${ANDROID ? '' : '<button class="btn" data-a="fullscreen">⛶  Plein écran</button>'}<button class="btn gold" data-close>Fermer</button></div>`;
    panel.innerHTML = h;
    panelOpen = true;
    scrim.classList.add('on');
    requestAnimationFrame(() => panel.classList.add('on'));
  }

  panel.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) { closeAll(); return; }
    if (e.target.closest('[data-a="fullscreen"]')) { N.action('fullscreen'); return; }
    if (e.target.closest('[data-add]')) { addScript(); return; }
    const el = e.target.closest('[data-k]');
    if (!el) return;
    const [kind, key] = el.dataset.k.split(':');
    dirty = true;
    if (kind === 'bot') {
      const on = !S.bots[key];
      Object.keys(S.bots).forEach((b) => { S.bots[b] = false; }); // un seul bot à la fois
      S.bots[key] = on;
      panel.querySelectorAll('.bot').forEach((c) => {
        const k = c.dataset.k.split(':')[1];
        c.classList.toggle('on', !!S.bots[k]);
        c.querySelector('.pill').textContent = S.bots[k] ? 'Actif' : 'Inactif';
      });
      return;
    }
    if (kind === 'opt' && /^turbo/.test(key)) {
      // Un seul niveau de turbo à la fois
      S.opt.turbo15 = key === 'turbo15';
      S.opt.turbo2 = key === 'turbo2';
      el.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === el));
      return;
    }
    const target = el.classList.contains('chip') ? el : el.querySelector('.sw');
    const on = !target.classList.contains('on');
    target.classList.toggle('on', on);
    if (kind === 'opt') S.opt[key] = on;
    else if (kind === 'custom') {
      S.custom[+key].on = on;
      const sm = el.querySelector('small');
      if (sm) sm.textContent = on ? 'Activé' : 'Désactivé';
    }
  });

  panel.addEventListener('contextmenu', (e) => {
    const r = e.target.closest('[data-k^="custom:"]');
    if (!r) return;
    e.preventDefault();
    const i = +r.dataset.k.split(':')[1];
    if (confirmInline('Supprimer « ' + (S.custom[i].name || 'Script') + ' » ?')) {
      S.custom.splice(i, 1);
      dirty = true;
      settings();
    }
  });

  // Les fenêtres window.confirm bloquent la page : on demande un deuxième clic droit à la place
  let pendingDelete = null;
  function confirmInline(msg) {
    if (pendingDelete === msg) { pendingDelete = null; return true; }
    pendingDelete = msg;
    toast(msg + (ANDROID ? ' Refais un appui long pour confirmer.' : ' Refais un clic droit pour confirmer.'));
    setTimeout(() => { if (pendingDelete === msg) pendingDelete = null; }, 4000);
    return false;
  }

  function addScript() {
    panel.innerHTML = `<div style="display:flex;align-items:start"><div style="flex:1"><h2>Ajouter un script</h2>
      <p class="sub">Colle tout le code du script, de // ==UserScript== jusqu'à la fin.</p></div><button class="x" data-back>✕</button></div>
      <textarea placeholder="// ==UserScript==" spellcheck="false"></textarea>
      <div class="actions"><button class="btn" data-paste>Coller</button><button class="btn" data-back>Annuler</button><button class="btn gold" data-ok>Ajouter</button></div>`;
    const ta = root.querySelector('textarea');
    ta.focus();
    panel.querySelector('[data-paste]').onclick = () => navigator.clipboard.readText().then((t) => { ta.value = t; }).catch(() => toast('Colle avec Ctrl+V'));
    panel.querySelectorAll('[data-back]').forEach((b) => { b.onclick = (ev) => { ev.stopPropagation(); settings(); }; });
    panel.querySelector('[data-ok]').onclick = (ev) => {
      ev.stopPropagation();
      const code = ta.value.trim();
      if (!code) return;
      const m = code.match(/@name\s+(.+)/);
      const name = m ? m[1].trim() : 'Mon script';
      S.custom.push({ name, code, on: true });
      dirty = true;
      toast('« ' + name + ' » ajouté');
      settings();
    };
  }

  // Applique : synchronise l'état des bots dans le jeu puis recharge
  function apply() {
    dirty = false;
    try {
      localStorage.setItem('rbf_adv_actif', S.bots.aventure ? '1' : '0');
      const s = ls('bfrRepeatBot', {});
      if (!S.bots.farm) s.on = false;
      localStorage.setItem('bfrRepeatBot', JSON.stringify(s));
    } catch (e) { /* rien */ }
    toast('Réglages appliqués');
    N.save(S);
  }

  // Sur téléphone, le bouton ☰ est dans la barre sous le jeu quand il y a la place
  const syncBar = () => { fab.style.display = window.__rbfBar ? 'none' : ''; };
  syncBar();
  window.addEventListener('rbfbar', syncBar);
  if (ANDROID && N.postMessage) N.postMessage('bar?');
  fab.addEventListener('click', quick);
  fab.addEventListener('contextmenu', (e) => { e.preventDefault(); settings(); });

  const mount = () => { if (!document.documentElement.contains(host)) document.documentElement.appendChild(host); };
  mount();
  setInterval(mount, 2000);

  window.__rbfUI = { quick, settings, close: closeAll, farm: (id, n) => farmQuest(String(id), n) };
})();
