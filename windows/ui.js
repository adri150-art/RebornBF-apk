// Interface de l'appli par-dessus le jeu : bouton ☰, menu rapide, bots & réglages.
// Isolée dans un Shadow DOM pour ne jamais toucher au style du jeu.
(function () {
  'use strict';
  if (window.__rbfUI) return;
  const N = window.rbfNative;
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
    *{box-sizing:border-box;font-family:"Segoe UI Variable","Segoe UI",system-ui,sans-serif}
    .fab{position:fixed;right:0;top:50%;margin-top:-30px;width:30px;height:60px;border-radius:14px 0 0 14px;border-right:0!important;pointer-events:auto;cursor:pointer;
      display:flex;align-items:center;justify-content:center;font-size:16px;color:#f0b03c;background:rgba(14,16,22,.9);
      border:1px solid rgba(240,176,60,.45);box-shadow:0 6px 18px rgba(0,0,0,.5);opacity:.7;transition:opacity .15s,transform .1s;user-select:none}
    .fab:hover{opacity:1;width:36px}.fab:active{filter:brightness(1.2)}
    .scrim{position:fixed;inset:0;background:rgba(3,4,10,.55);pointer-events:auto;opacity:0;transition:opacity .18s;display:none}
    .scrim.on{display:block;opacity:1}
    .sheet{position:fixed;left:50%;bottom:0;transform:translate(-50%,105%);width:min(520px,100vw);max-height:86vh;overflow:auto;pointer-events:auto;
      background:#14161d;border:1px solid #262a36;border-bottom:0;border-radius:22px 22px 0 0;padding:10px 14px 18px;
      box-shadow:0 -10px 30px rgba(0,0,0,.5);transition:transform .22s cubic-bezier(.2,.8,.2,1);color:#e6e8ee}
    .sheet.on{transform:translate(-50%,0)}
    .panel{position:fixed;left:50%;top:50%;transform:translate(-50%,-46%) scale(.98);opacity:0;width:min(460px,94vw);max-height:90vh;overflow:auto;
      pointer-events:none;background:#14161d;border:1px solid #262a36;border-radius:18px;padding:18px 18px 14px;color:#e6e8ee;
      box-shadow:0 20px 50px rgba(0,0,0,.6);transition:opacity .18s,transform .18s}
    .panel.on{opacity:1;transform:translate(-50%,-50%) scale(1);pointer-events:auto}
    .grip{width:40px;height:5px;border-radius:3px;background:#3a3f4e;margin:0 auto 12px}
    .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:8px}
    .tile{background:#1c1f28;border-radius:14px;height:78px;display:flex;flex-direction:column;align-items:center;justify-content:center;
      gap:5px;cursor:pointer;border:1px solid transparent;transition:border-color .12s,transform .1s;padding:4px;text-align:center}
    .tile:hover{border-color:rgba(240,176,60,.4)}.tile:active{transform:scale(.96)}
    .tile i{font-style:normal;font-size:22px;line-height:1}.tile span{font-size:11px;line-height:1.2;color:#e6e8ee}
    .btn{display:block;width:100%;height:46px;border-radius:12px;border:1px solid #262a36;background:#1c1f28;color:#e6e8ee;
      font-size:14px;cursor:pointer;margin-top:6px;transition:filter .1s,transform .1s}
    .btn:hover{filter:brightness(1.15)}.btn:active{transform:scale(.98)}
    .btn.gold{background:#f0b03c;border-color:#f0b03c;color:#14161d;font-weight:700}
    h2{margin:0;font-size:20px}.sub{color:#8a8fa0;font-size:12px;margin:4px 0 0}
    .sec{color:#f0b03c;font-size:11px;font-weight:700;letter-spacing:.12em;margin:18px 0 6px}
    .row{display:flex;align-items:center;gap:12px;background:#1c1f28;border-radius:12px;padding:12px 12px 12px 14px;margin:6px 0;cursor:pointer}
    .row .t{flex:1;min-width:0}.row b{display:block;font-size:15px}.row small{display:block;color:#8a8fa0;font-size:12px;margin-top:2px}
    .sw{position:relative;width:42px;height:24px;border-radius:12px;background:#3a3f4e;flex:none;transition:background .15s}
    .sw::after{content:"";position:absolute;left:3px;top:3px;width:18px;height:18px;border-radius:50%;background:#b0b4c0;transition:transform .15s,background .15s}
    .sw.on{background:rgba(240,176,60,.55)}.sw.on::after{transform:translateX(18px);background:#f0b03c}
    input[type=number]{width:84px;height:36px;border-radius:10px;border:1px solid #262a36;background:#0f1117;color:#f0b03c;
      font-size:16px;text-align:center}
    textarea{width:100%;height:180px;border-radius:10px;border:1px solid #262a36;background:#0f1117;color:#e6e8ee;
      font:12px Consolas,monospace;padding:10px;resize:vertical}
    .actions{display:flex;gap:6px;margin-top:14px}.actions .btn{margin:0}
    .x{background:none;border:0;color:#8a8fa0;font-size:18px;cursor:pointer;padding:4px 8px}
    .toast{position:fixed;left:50%;bottom:76px;transform:translateX(-50%);background:rgba(10,12,22,.94);color:#f2f4fa;
      border:1px solid rgba(255,206,110,.35);border-radius:12px;padding:10px 16px;font-size:13px;opacity:0;transition:opacity .25s;pointer-events:none}
    .toast.on{opacity:1}
    .hint{color:#8a8fa0;font-size:12px;margin:10px 4px 0}
    .panel{background:linear-gradient(180deg,#191c26,#10121a);border-color:rgba(240,176,60,.22);padding:16px 16px 14px}
    .head{display:flex;align-items:center;gap:12px}
    .head .ht{flex:1;min-width:0}.head .sub{margin-top:2px}
    .logo{width:42px;height:42px;flex:none;border-radius:13px;display:flex;align-items:center;justify-content:center;font-size:20px;color:#1b1206;
      background:linear-gradient(160deg,#ffe49a,#e2a133);box-shadow:0 6px 16px rgba(240,176,60,.3),inset 0 1px 0 rgba(255,255,255,.6)}
    .sec{display:flex;align-items:baseline;gap:8px;color:#d7dae3;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:18px 2px 8px}
    .sec em{margin-left:auto;font-style:normal;font-weight:500;letter-spacing:0;text-transform:none;color:#7d8292;font-size:11px}
    .bots{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .bot{position:relative;background:#1b1e28;border:1px solid #2a2f3d;border-radius:16px;padding:14px 12px 12px;cursor:pointer;
      transition:border-color .15s,background .15s,transform .1s}
    .bot:hover{border-color:#3a4052}.bot:active{transform:scale(.98)}
    .bot i{font-style:normal;font-size:24px;display:block;margin-bottom:8px}
    .bot b{display:block;font-size:15px}
    .bot small{display:block;color:#8a8fa0;font-size:11.5px;margin-top:4px;line-height:1.35}
    .bot .pill{position:absolute;top:10px;right:10px;font-size:10.5px;padding:3px 8px;border-radius:20px;background:#2a2f3d;color:#8a8fa0}
    .bot.on{border-color:rgba(240,176,60,.75);background:linear-gradient(180deg,rgba(240,176,60,.16),rgba(240,176,60,.04))}
    .bot.on .pill{background:#f0b03c;color:#14161d;font-weight:700}
    .chips{display:flex;gap:8px}
    .chip{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;height:46px;border-radius:13px;background:#1b1e28;
      border:1px solid #2a2f3d;cursor:pointer;font-size:14px;color:#aeb3c2;transition:border-color .15s,background .15s,color .15s}
    .chip i{font-style:normal}
    .chip.on{border-color:rgba(240,176,60,.75);color:#fff;background:rgba(240,176,60,.13)}
    .card{background:#1b1e28;border:1px solid #242835;border-radius:15px;overflow:hidden}
    .item{display:flex;align-items:center;gap:12px;padding:12px 14px;cursor:pointer;transition:background .12s}
    .item:hover{background:#20242f}
    .item + .item{border-top:1px solid #262a36}
    .item i{font-style:normal;font-size:18px;width:24px;text-align:center;flex:none}
    .item .t{flex:1;min-width:0}.item b{display:block;font-size:14px}
    .item small{display:block;color:#8a8fa0;font-size:12px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .empty{color:#8a8fa0;font-size:12.5px;margin:0;padding:14px}
    .add{display:block;width:100%;padding:13px 14px;background:none;border:0;border-top:1px solid #262a36;color:#f0b03c;font-size:14px;
      font-weight:600;cursor:pointer;text-align:left}
    .add:hover{background:#20242f}
    kbd{background:#262a36;border-radius:5px;padding:1px 6px;font-size:11px;color:#c9ccd6}
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
    html += '<p class="hint"><kbd>Ctrl</kbd>+<kbd>M</kbd> menu · <kbd>F11</kbd> plein écran · <kbd>F5</kbd> recharger · <kbd>Alt</kbd>+<kbd>←</kbd> retour</p>';
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
    h += bot('farm', '🔁', 'Farm quête', 'Relance ta quête en boucle, sans limite. Ouvre une quête puis ☰ → Farmer.', S.bots.farm);
    h += bot('aventure', '🗺️', 'Aventure auto', 'Avance seul dans l\'histoire. Ne dépense jamais de gemmes.', S.bots.aventure);
    h += '</div>';
    h += '<div class="sec">Combat</div><div class="chips">';
    h += chip('always_x2', '⏩', 'Toujours x2', S.opt.always_x2) + chip('always_auto', '🤖', 'Toujours AUTO', S.opt.always_auto);
    h += '</div>';
    h += '<div class="sec">Mes scripts<em>clic droit pour supprimer</em></div><div class="card">';
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
    h += '</div>';
    h += `<div class="actions"><button class="btn" data-a="fullscreen">⛶  Plein écran</button><button class="btn gold" data-close>Fermer</button></div>`;
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
    toast(msg + ' Refais un clic droit pour confirmer.');
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

  fab.addEventListener('click', quick);
  fab.addEventListener('contextmenu', (e) => { e.preventDefault(); settings(); });

  const mount = () => { if (!document.documentElement.contains(host)) document.documentElement.appendChild(host); };
  mount();
  setInterval(mount, 2000);

  window.__rbfUI = { quick, settings, close: closeAll, farm: (id, n) => farmQuest(String(id), n) };
})();
