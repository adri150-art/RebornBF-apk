// Infos tirées des données officielles du jeu (data.rebornbf.com) :
// · avant une quête : butin, captures, vagues, éléments, boss, bouton « Farmer »
// · dans la liste des missions d'un donjon : un bouton ⓘ par mission
// · sur la page d'invocation : les vrais taux des bannières
(function () {
  'use strict';
  if (window.__rbfGameInfo || window.top !== window) return;
  window.__rbfGameInfo = true;

  const A = 'https://assets.rebornbf.com/assets/original/';
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (n) => Number(n || 0).toLocaleString('fr-BE');
  const pct = (n) => (n >= 99.95 ? '100' : (Math.round((n || 0) * 10) / 10).toLocaleString('fr-BE')) + ' %';
  const EL_FR = { fire: 'Feu', water: 'Eau', earth: 'Terre', thunder: 'Foudre', light: 'Lumière', dark: 'Ténèbres' };
  const BEATS = { fire: 'water', water: 'thunder', thunder: 'earth', earth: 'fire', light: 'dark', dark: 'light' }; // élément fort contre…
  const elIcon = (e) => (e ? `<img class="el" src="${A}common/attribute_mark_M/${esc(e)}.png" alt="${esc(EL_FR[e] || e)}" title="${esc(EL_FR[e] || e)}">` : '');

  // ───────── Surcouche (même style que le jeu) ─────────
  const host = document.createElement('div');
  host.id = 'rbf-gameinfo';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    *{box-sizing:border-box;margin:0}
    .ol{text-shadow:1.3px 0 #1a1006,-1.3px 0 #1a1006,0 1.3px #1a1006,0 -1.3px #1a1006,1px 1px #1a1006,-1px 1px #1a1006,1px -1px #1a1006,-1px -1px #1a1006,0 2px 3px rgba(0,0,0,.5)}
    .gold{color:#ffd24a}
    .tab{position:fixed;left:0;top:50%;transform:translateY(-50%);pointer-events:auto;display:none;align-items:center;gap:6px;cursor:pointer;
      padding:9px 12px 9px 9px;border-radius:0 12px 12px 0;background:rgba(14,11,7,.92);box-shadow:inset 0 0 0 1px rgba(255,210,120,.45),0 4px 12px rgba(0,0,0,.5);
      color:#fff;font:15px/1 "Lilita One",system-ui,sans-serif;transition:transform .12s,filter .12s;-webkit-tap-highlight-color:transparent;user-select:none}
    .tab.on{display:flex}.tab:hover{filter:brightness(1.15)}.tab:active{transform:translateY(-50%) scale(.95)}
    .pop{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(0,0,0,.6);opacity:0;pointer-events:none;transition:opacity .16s}
    .pop.on{opacity:1;pointer-events:auto}
    .card{width:min(460px,100%);max-height:92vh;display:flex;flex-direction:column;border-radius:12px;overflow:hidden;background:rgba(14,11,7,.97);color:#f1ead8;
      box-shadow:inset 0 0 0 1.5px rgba(255,210,120,.45),0 8px 24px rgba(0,0,0,.6);transform:scale(.94);transition:transform .18s ease-out;
      font:14px/1.45 "Segoe UI Variable","Segoe UI",system-ui,sans-serif}
    .pop.on .card{transform:none}
    .head{flex:none;padding:12px 14px 9px;border-bottom:1px solid rgba(255,210,120,.25)}
    .head h2{font:20px/1.15 "Lilita One",system-ui,sans-serif;font-weight:400;color:#ffd24a}
    .head p{font-size:13px;color:#cfc6b0;margin-top:3px}
    .facts{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
    .facts span{padding:3px 8px;border-radius:7px;background:rgba(255,255,255,.06);font-size:12.5px;color:#e9e1cc}
    .body{overflow-y:auto;padding:4px 14px 10px;scrollbar-width:thin}
    h3{font:15px/1.2 "Lilita One",system-ui,sans-serif;font-weight:400;color:#fff;margin:12px 0 6px}
    .loot{display:flex;flex-wrap:wrap;gap:6px}
    .loot span{display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:8px;background:rgba(255,210,120,.08);box-shadow:inset 0 0 0 1px rgba(255,210,120,.18);font-size:13px}
    .loot b{color:#ffd24a;font-weight:600}
    .wave{margin:0 0 7px;padding:7px 9px;border-radius:9px;background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px rgba(255,210,120,.12)}
    .wave small{display:block;color:#a99f88;font-size:12px;margin-bottom:3px}
    .en{display:flex;align-items:center;gap:6px;padding:2px 0;font-size:13.5px}
    .en .n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .en .hp{color:#cfc6b0;font-variant-numeric:tabular-nums;font-size:12.5px}
    .en.boss .n{color:#ff9d6b;font-weight:600}
    .el{height:18px;vertical-align:middle}
    .tip{margin-top:6px;padding:8px 10px;border-radius:9px;background:rgba(79,194,122,.12);box-shadow:inset 0 0 0 1px rgba(79,194,122,.35);font-size:13px}
    .row2{flex:none;display:flex;gap:8px;padding:10px 12px 12px;border-top:1px solid rgba(255,210,120,.18)}
    .gbtn{flex:1;max-width:220px;margin:0 auto;height:42px;background:url('${A}common/button/sub_ss_btn1.png') center/100% 100% no-repeat;display:flex;align-items:center;justify-content:center;
      padding-bottom:3px;cursor:pointer;color:#fff;font:15px/1 "Lilita One",system-ui,sans-serif;transition:transform .08s,filter .1s}
    .gbtn:active{transform:scale(.95);filter:brightness(1.15)}
    .tabs{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
    .tabs span{padding:5px 10px;border-radius:8px;cursor:pointer;background:rgba(255,255,255,.06);font:14px/1 "Lilita One",system-ui,sans-serif;color:#cfc6b0}
    .tabs span.on{background:rgba(255,210,120,.2);color:#ffd24a;box-shadow:inset 0 0 0 1px rgba(255,210,120,.5)}
    .tier{margin:0 0 8px;padding:8px 10px;border-radius:9px;background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px rgba(255,210,120,.12)}
    .tier .tt{display:flex;align-items:center;gap:8px;font:15px/1.2 "Lilita One",system-ui,sans-serif}
    .tier .tt b{margin-left:auto;color:#ffd24a;font-weight:400;font-size:17px}
    .tier .tt i{font-style:normal;font-size:11px;padding:2px 6px;border-radius:6px;background:#c0392b;color:#fff}
    .tier p{margin-top:4px;font-size:12.5px;color:#cfc6b0}
    .muted{color:#a99f88;font-size:12.5px}
  </style>
  <div class="tab ol" data-a="open"></div>
  <div class="pop"></div>`;
  const tabEl = root.querySelector('.tab');
  const popEl = root.querySelector('.pop');
  const mount = () => { if (!document.documentElement.contains(host)) document.documentElement.appendChild(host); };

  let onOpen = null;
  function showTab(label, fn) { mount(); tabEl.textContent = label; tabEl.classList.add('on'); onOpen = fn; }
  function hideTab() { tabEl.classList.remove('on'); onOpen = null; }
  function show(html) { mount(); popEl.innerHTML = html; popEl.classList.add('on'); }
  function close() { popEl.classList.remove('on'); }
  const actions = {};
  root.addEventListener('click', (e) => {
    if (e.target === popEl) { close(); return; }
    const el = e.target.closest('[data-a]');
    if (!el) return;
    const a = el.dataset.a;
    if (a === 'open' && onOpen) onOpen();
    else if (a === 'close') close();
    else if (actions[a]) actions[a](el);
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && popEl.classList.contains('on')) close(); });

  // ───────── 2. Fiche de quête ─────────
  async function openMission(id, title) {
    if (!window.rbfData) return;
    show(`<div class="card"><div class="head"><h2>Chargement…</h2></div><div class="row2"><div class="gbtn ol" data-a="close">Fermer</div></div></div>`);
    let m = null;
    try { m = await window.rbfData.missionInfo(id); } catch (e) { m = null; }
    if (!m) {
      show(`<div class="card"><div class="head"><h2>Infos indisponibles</h2><p>Cette mission n'est pas (encore) dans les données du jeu.</p></div><div class="row2"><div class="gbtn ol" data-a="close">Fermer</div></div></div>`);
      return;
    }
    const boss = [].concat(...m.waves).filter((e) => e.boss);
    const bossEl = [...new Set(boss.map((b) => b.element).filter(Boolean))];
    // Conseil : contre le boss, sinon contre l'élément le plus présent
    const count = {};
    [].concat(...m.waves).forEach((e) => { if (e.element) count[e.element] = (count[e.element] || 0) + 1; });
    const main = Object.keys(count).sort((a, b) => count[b] - count[a]).slice(0, 1);
    const tipEls = (bossEl.length ? bossEl : main).map((e) => BEATS[e]).filter(Boolean);
    const loot = m.loot.slice(0, 18).map((l) => `<span>${l.kind === 'capture' ? '🎯' : '📦'} ${esc(l.name)} <b>${pct(l.chance)}</b></span>`).join('');
    const waves = m.waves.map((w, i) => `<div class="wave"><small>Vague ${i + 1}${w.random ? ' · un groupe au hasard parmi' : ''}</small>${w.map((e) => `
      <div class="en${e.boss ? ' boss' : ''}">${elIcon(e.element)}<span class="n">${e.boss ? '👑 ' : ''}${esc(e.name)}</span><span class="hp">${num(e.hp)} PV</span></div>`).join('')}</div>`).join('');
    show(`<div class="card">
      <div class="head"><h2>${esc(title || m.name)}</h2><p>${title && title.toLowerCase() !== String(m.name).toLowerCase() ? esc(m.name) + ' · ' : ''}${esc(m.dungeon)}${m.area && m.area !== m.dungeon ? ' · ' + esc(m.area) : ''}</p>
        <div class="facts"><span>⚡ ${m.energy} énergie</span><span>⚔️ ${m.battles} combats</span>${m.exp ? `<span>EXP ${num(m.exp)}</span>` : ''}${m.zel ? `<span>Zel ${num(m.zel)}</span>` : ''}${m.karma ? `<span>Karma ${num(m.karma)}</span>` : ''}</div></div>
      <div class="body">
        ${tipEls.length ? `<div class="tip">Conseil : prends des unités ${[...new Set(tipEls)].map((e) => `${elIcon(e)} ${EL_FR[e]}`).join(', ')}${boss.length ? ` contre le boss ${esc(boss[0].name)}` : main.length ? ` (ennemis surtout ${EL_FR[main[0]] || main[0]})` : ''}.</div>` : ''}
        <h3>Butin possible</h3><div class="loot">${loot || '<span class="muted">Rien de particulier</span>'}</div>
        <h3>Vagues</h3>${waves || '<p class="muted">Pas de détail</p>'}
      </div>
      <div class="row2"><div class="gbtn ol" data-a="farm" data-m="${m.id}">Farmer</div><div class="gbtn ol" data-a="close">Fermer</div></div></div>`);
  }
  actions.farm = (el) => { close(); window.rbfData.farm(el.dataset.m); };
  actions.mission = (el) => openMission(el.dataset.m);

  // Boutons ⓘ dans la liste des missions d'un donjon
  function decorateDungeon() {
    $$('li[class*="__mission"]').forEach((li) => {
      const a = li.querySelector('a[href^="/start/"]');
      if (!a || li.querySelector('.rbf-mi')) return;
      const id = (a.getAttribute('href').match(/^\/start\/(\d+)/) || [])[1];
      if (!id) return;
      const b = document.createElement('button');
      b.className = 'rbf-mi';
      b.type = 'button';
      b.title = 'Infos de la mission';
      b.textContent = 'ⓘ';
      b.style.cssText = 'position:absolute;right:10px;bottom:9px;z-index:5;width:30px;height:30px;border-radius:50%;border:0;cursor:pointer;'
        + 'background:rgba(14,11,7,.85);color:#ffd24a;font:bold 17px/30px system-ui,sans-serif;box-shadow:inset 0 0 0 1px rgba(255,210,120,.5),0 2px 5px rgba(0,0,0,.5);padding:0';
      const title = (a.querySelector('strong') || {}).innerText || '';
      b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openMission(id, title.trim()); }, true);
      if (getComputedStyle(li).position === 'static') li.style.position = 'relative';
      li.appendChild(b);
    });
  }

  // ───────── 1 bis. Écran « Évoluer une unité » du jeu : où farmer les matériaux manquants ─────────
  function readEvoMaterials() {
    // Chaque matériau du jeu = une vignette (image d'unité ou d'objet) avec « Possédé N » en dessous
    const out = [];
    const seen = new Set();
    $$('body *').forEach((el) => {
      if (el.children.length > 2) return;
      const m = (el.textContent || '').trim().match(/^Poss[ée]d[ée]e?s?\s*:?\s*(\d+)$/i);
      if (!m) return;
      let box = el.parentElement, img = null;
      for (let k = 0; k < 4 && box && !img; k++) { img = box.querySelector('img[src*="/units/"], img[src*="/item/"]'); if (!img) box = box.parentElement; }
      if (!img || seen.has(img)) return;
      seen.add(img);
      out.push({ src: img.currentSrc || img.src, owned: +m[1] });
    });
    return out;
  }
  async function openEvoGuide() {
    show(`<div class="card"><div class="head"><h2>Chargement…</h2></div><div class="row2"><div class="gbtn ol" data-a="close">Fermer</div></div></div>`);
    const mats = readEvoMaterials();
    let rows = [];
    try {
      const [I, art] = await Promise.all([window.rbfData.index(), window.rbfData.get('art')]);
      rows = await Promise.all(mats.map(async (m) => {
        let id = null;
        const u = m.src.match(/\/units\/(\d+)\//);
        if (u && I.formByArchive[u[1]]) id = I.formByArchive[u[1]].id;
        if (!id) {
          const file = m.src.split('/').pop();
          const it = (art.items || []).find((x) => x.icon && x.icon.path.split('/').pop() === file);
          if (it) id = it.id;
        }
        const src = id ? await window.rbfData.whereToGet(id) : [];
        const best = src.find((x) => x.kind === 'drop' || x.kind === 'capture') || src[0];
        return { m, id, name: id ? window.rbfData.nameOf(I, id) : 'Matériau', best };
      }));
    } catch (e) { rows = []; }
    if (!rows.length) {
      show(`<div class="card"><div class="head"><h2>Matériaux introuvables</h2><p>Je n'ai pas réussi à lire les matériaux sur cet écran.</p></div><div class="row2"><div class="gbtn ol" data-a="close">Fermer</div></div></div>`);
      return;
    }
    rows.sort((a, b) => (a.m.owned ? 1 : 0) - (b.m.owned ? 1 : 0));
    const line = (r) => {
      const b = r.best;
      if (!b) return '<p class="muted">Aucune source connue</p>';
      if (b.kind === 'drop' || b.kind === 'capture') {
        const i = b.info || {};
        return `<p class="muted">${b.kind === 'capture' ? '🎯 Capture' : '📦 Drop'} ${pct(b.chance)} · <b style="color:#ffd24a">${esc(i.name)}</b> · ${esc(i.dungeon)} · ⚡ ${i.energy || 0}</p>`;
      }
      const k = { summon: 'Invocation', 'merit-exchange': 'Boutique du mérite', 'level-up': 'Niveau joueur', craft: 'Fabrication', 'first-clear': 'Première victoire', evolution: 'Évolution' }[b.kind] || b.kind;
      return `<p class="muted">${esc(k)}${b.info ? ' · ' + esc(b.info.name) : ''}</p>`;
    };
    show(`<div class="card"><div class="head"><h2>Où farmer les matériaux</h2><p>Ceux qui te manquent sont en premier.</p></div>
      <div class="body">${rows.map((r) => `<div class="wave" style="display:flex;align-items:center;gap:10px">
        <img src="${esc(r.m.src)}" alt="" style="width:44px;height:44px;object-fit:contain;flex:none">
        <div style="flex:1;min-width:0"><div class="en" style="padding:0"><span class="n" style="font-weight:600">${esc(r.name)}</span>
          <span class="hp" style="color:${r.m.owned ? '#7ddc8f' : '#ff8a7a'}">Possédé ${r.m.owned}</span></div>${line(r)}</div>
        ${r.best && (r.best.kind === 'drop' || r.best.kind === 'capture') ? `<div class="gbtn ol" data-a="farm" data-m="${r.best.mission}" style="flex:none;width:86px;height:34px;font-size:13px;margin:0">Farmer</div>` : ''}
      </div>`).join('')}</div>
      <div class="row2"><div class="gbtn ol" data-a="close">Fermer</div></div></div>`);
  }

  // ───────── 5. Taux des invocations ─────────
  let bannerTab = 0;
  async function openRates() {
    show(`<div class="card"><div class="head"><h2>Chargement…</h2></div><div class="row2"><div class="gbtn ol" data-a="close">Fermer</div></div></div>`);
    let B = null, I = null;
    try { [B, I] = await Promise.all([window.rbfData.get('banners'), window.rbfData.index()]); } catch (e) { B = null; }
    const list = (B && B.banners) || [];
    if (!list.length) { show(`<div class="card"><div class="head"><h2>Taux indisponibles</h2></div><div class="row2"><div class="gbtn ol" data-a="close">Fermer</div></div></div>`); return; }
    if (bannerTab >= list.length) bannerTab = 0;
    const b = list[bannerTab];
    const cur = { gems: 'gemmes', honor: 'points d\'honneur' }[b.currency] || b.currency;
    const tiers = (b.tiers || []).map((t) => `<div class="tier"><div class="tt"><span>${esc(t.name)}</span>${t.featured ? '<i>EN VEDETTE</i>' : ''}<b>${pct((t.rateBp || 0) / 100)}</b></div>
      <p>${(t.units || []).map((u) => esc(window.rbfData.nameOf(I, u.form || u.unit))).join(' · ')}</p>
      ${t.units && t.units.length ? `<p class="muted">≈ ${pct((t.rateBp || 0) / 100 / t.units.length)} par unité</p>` : ''}</div>`).join('');
    show(`<div class="card"><div class="head"><h2>Taux d'invocation</h2>
        <div class="tabs">${list.map((x, i) => `<span class="${i === bannerTab ? 'on' : ''}" data-a="banner" data-i="${i}">${esc(x.name)}</span>`).join('')}</div>
        <div class="facts"><span>Monnaie : ${esc(cur)}</span>${b.pityPulls ? `<span>Garanti en ${b.pityPulls} invocations</span>` : ''}</div></div>
      <div class="body">${tiers}</div>
      <div class="row2"><div class="gbtn ol" data-a="close">Fermer</div></div></div>`);
  }
  actions.banner = (el) => { bannerTab = +el.dataset.i; openRates(); };

  // ───────── Selon la page ─────────
  let lastPath = '';
  function route() {
    const p = location.pathname;
    if (p.startsWith('/quests/dungeon/')) decorateDungeon();
    if (p === lastPath) return;
    lastPath = p;
    close();
    const m = p.match(/^\/start\/(\d+)/);
    if (m) showTab('📜 Infos quête', () => openMission(m[1]));
    else if (p.startsWith('/summon')) showTab('📊 Taux', openRates);
    else if (p.startsWith('/units/info/evolve')) showTab('📦 Où farmer', openEvoGuide);
    else hideTab();
  }
  ['pushState', 'replaceState'].forEach((k) => {
    const orig = history[k];
    history[k] = function (...args) { const r = orig.apply(this, args); setTimeout(route, 0); return r; };
  });
  window.addEventListener('popstate', () => setTimeout(route, 0));
  let t = 0;
  new MutationObserver(() => { if (!t) t = setTimeout(() => { t = 0; route(); }, 250); })
    .observe(document.documentElement, { childList: true, subtree: true });
  route();
})();
