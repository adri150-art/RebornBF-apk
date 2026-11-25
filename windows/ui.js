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
    if (qm) html += `<button class="btn gold" data-a="farm" data-id="${qm[1]}">🔁  Farmer cette quête (${S.farm_target} combats)</button>`;
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
    else if (a === 'farm') farmQuest(el.dataset.id);
  });

  function copyForClaude() {
    const data = localStorage.getItem('rbf_struct') || '[]';
    let n = 0;
    try { n = JSON.parse(data).length; } catch (e) { /* rien */ }
    navigator.clipboard.writeText('RBF-PAGES ' + data)
      .then(() => toast(n + ' écran(s) copié(s) : colle-les dans la discussion avec Claude'))
      .catch(() => toast('Copie impossible'));
  }

  function farmQuest(id) {
    try {
      localStorage.setItem('rbf_adv_actif', '0');
      const s = ls('bfrRepeatBot', {});
      if (s.quest !== id) { s.maxRuns = null; s.single = false; }
      Object.assign(s, { quest: id, on: true, target: S.farm_target, fights: 0, curRun: 0, loops: 0, day: new Date().toDateString() });
      const slot = new URLSearchParams(location.search).get('slot');
      if (slot !== null) s.slot = slot;
      localStorage.setItem('bfrRepeatBot', JSON.stringify(s));
    } catch (e) { /* rien */ }
    S.bots.farm = true;
    S.bots.aventure = false;
    toast('Farm lancé : objectif ' + S.farm_target + ' combats');
    N.save(S, '/start/' + id);
  }

  // ───────── Bots & réglages ─────────
  const sw = (on) => `<div class="sw${on ? ' on' : ''}"></div>`;
  const row = (key, title, sub, on) => `<div class="row" data-k="${key}"><div class="t"><b>${esc(title)}</b><small>${esc(sub)}</small></div>${sw(on)}</div>`;

  function settings() {
    sheet.classList.remove('on');
    let h = `<div style="display:flex;align-items:start"><div style="flex:1"><h2>Bots & réglages</h2>
      <p class="sub">Les changements s'appliquent quand tu fermes ce panneau (le jeu se recharge).</p></div>
      <button class="x" data-close>✕</button></div>`;
    h += '<div class="sec">BOTS</div>';
    h += row('bot:farm', 'Farm quête', 'Relance la même quête par séries de 30 jusqu\'à l\'objectif. Le plus simple : ouvre une quête puis ☰ → « Farmer cette quête ».', S.bots.farm);
    h += row('bot:aventure', 'Aventure auto', 'Avance seul dans l\'histoire, en AUTO et x2. Attend l\'énergie, ne dépense jamais de gemmes.', S.bots.aventure);
    h += `<div class="row" style="cursor:default"><div class="t"><b>Objectif du farm</b><small>Nombre total de combats avant l'arrêt</small></div>
      <input type="number" min="1" value="${S.farm_target}" data-target></div>`;
    h += '<div class="sec">COMBAT</div>';
    h += row('opt:always_x2', 'Toujours en x2', 'Chaque combat passe en vitesse x2 tout seul.', S.opt.always_x2);
    h += row('opt:always_auto', 'Toujours en AUTO', 'Chaque combat démarre en AUTO.', S.opt.always_auto);
    h += '<div class="sec">MES SCRIPTS</div>';
    if (!S.custom.length) h += '<p class="hint" style="margin-top:0">Aucun. Ajoute ici ton bot d\'arène ou un autre script Tampermonkey.</p>';
    S.custom.forEach((c, i) => {
      h += `<div class="row" data-k="custom:${i}"><div class="t"><b>${esc(c.name || 'Script')}</b><small>Clic droit pour supprimer</small></div>${sw(c.on !== false)}</div>`;
    });
    h += '<button class="btn" data-add>+ Ajouter un script</button>';
    h += '<div class="sec">CONFORT</div>';
    h += row('opt:remaster', 'Remaster des fiches d\'unité', 'Boutons Améliorer / Évoluer sur la fiche, cadres plus modernes.', S.opt.remaster);
    h += row('opt:appfeel', 'Style appli', 'Boutons qui réagissent, transitions douces.', S.opt.appfeel);
    h += row('opt:antipause', 'Anti-pause', 'Le jeu continue même si la fenêtre est derrière une autre.', S.opt.antipause);
    h += row('opt:notifications', 'Notifications', 'Prévient quand un bot s\'arrête (farm terminé, plus de passages…).', S.opt.notifications);
    h += row('opt:hd', 'Filtre HD', 'Images un peu plus nettes et colorées.', S.opt.hd);
    h += `<div class="actions"><button class="btn" data-a="fullscreen">Plein écran (F11)</button><button class="btn gold" data-close>Fermer</button></div>`;
    panel.innerHTML = h;
    panelOpen = true;
    scrim.classList.add('on');
    requestAnimationFrame(() => panel.classList.add('on'));
  }

  panel.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) { closeAll(); return; }
    if (e.target.closest('[data-a="fullscreen"]')) { N.action('fullscreen'); return; }
    if (e.target.closest('[data-add]')) { addScript(); return; }
    const r = e.target.closest('.row[data-k]');
    if (!r) return;
    const [kind, key] = r.dataset.k.split(':');
    const s = r.querySelector('.sw');
    const on = !s.classList.contains('on');
    if (kind === 'bot') {
      S.bots[key] = on;
      if (on) Object.keys(S.bots).forEach((b) => { if (b !== key) S.bots[b] = false; }); // un seul bot à la fois
    } else if (kind === 'opt') {
      S.opt[key] = on;
    } else if (kind === 'custom') {
      S.custom[+key].on = on;
    }
    dirty = true;
    if (kind === 'bot') settings(); else s.classList.toggle('on', on);
  });

  panel.addEventListener('contextmenu', (e) => {
    const r = e.target.closest('.row[data-k^="custom:"]');
    if (!r) return;
    e.preventDefault();
    const i = +r.dataset.k.split(':')[1];
    if (confirmInline('Supprimer « ' + (S.custom[i].name || 'Script') + ' » ?')) {
      S.custom.splice(i, 1);
      dirty = true;
      settings();
    }
  });

  panel.addEventListener('input', (e) => {
    if (e.target.matches('[data-target]')) {
      const v = parseInt(e.target.value, 10);
      if (v > 0) { S.farm_target = v; dirty = true; }
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
      s.target = S.farm_target;
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

  window.__rbfUI = { quick, settings, close: closeAll };
})();
