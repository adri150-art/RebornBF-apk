// Données officielles du jeu (API publique data.rebornbf.com) partagées par les autres scripts.
// Chaque paquet est gardé dans le cache du navigateur (nom = empreinte, il ne change jamais) :
// on ne retélécharge que si le manifeste annonce une nouvelle version (vérifié au plus toutes les 10 min).
(function () {
  'use strict';
   

  const BASE = 'https://data.rebornbf.com';
  const CACHE = 'rbf-data-v1';
  const mem = {};
  let manifest = null;

  async function getManifest() {
    if (manifest) return manifest;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('rbf_data_manifest') || 'null'); } catch (e) { /* rien */ }
    if (saved && Date.now() - saved.at < 10 * 60 * 1000) { manifest = saved.m; return manifest; }
    try {
      const m = await fetch(BASE + '/v1/manifest.json').then((r) => r.json());
      manifest = m;
      try { localStorage.setItem('rbf_data_manifest', JSON.stringify({ at: Date.now(), m })); } catch (e) { /* rien */ }
    } catch (e) {
      if (saved) manifest = saved.m; else throw e;
    }
    return manifest;
  }

  async function getText(path) {
    let cache = null;
    try { cache = await caches.open(CACHE); } catch (e) { /* pas de cache disponible */ }
    if (cache) {
      const hit = await cache.match(BASE + path);
      if (hit) return hit.text();
    }
    const res = await fetch(BASE + path);
    if (!res.ok) throw new Error('data ' + res.status);
    if (cache) {
      try {
        await cache.put(BASE + path, res.clone());
        // On ne garde que les versions en cours de chaque paquet
        const keep = new Set((manifest.files || []).map((f) => BASE + f.path));
        (await cache.keys()).forEach((k) => { if (!keep.has(k.url)) cache.delete(k); });
      } catch (e) { /* cache plein : tant pis */ }
    }
    return res.text();
  }

  function get(kind) {
    if (!mem[kind]) {
      mem[kind] = getManifest().then((m) => {
        const f = (m.files || []).find((x) => x.kind === kind);
        if (!f) throw new Error('paquet absent : ' + kind);
        return getText(f.path).then((t) => JSON.parse(t));
      });
      mem[kind].catch(() => { delete mem[kind]; });
    }
    return mem[kind];
  }

  // ───────── Index pratiques ─────────
  let idx = null;
  function index() {
    if (!idx) {
      idx = Promise.all([get('units'), get('items'), get('spheres'), get('sources')]).then(([u, it, sp, src]) => {
        const form = {}, unit = {}, formByName = {}, formByArchive = {}, item = {}, sphere = {}, sphereByName = {}, srcUnit = {}, srcItem = {};
        (u.units || []).forEach((un) => {
          unit[un.id] = un;
          (un.forms || []).forEach((f, i) => {
            const o = Object.assign({}, f, { unit: un.id, element: un.element, step: i, last: i === un.forms.length - 1 });
            form[f.id] = o;
            formByName[String(f.name || '').toLowerCase()] = o;
            if (f.archiveId) formByArchive[f.archiveId] = o;
          });
        });
        (it.items || []).forEach((x) => { item[x.id] = x; });
        (sp.spheres || []).forEach((x) => { sphere[x.id] = x; sphereByName[String(x.name || '').toLowerCase()] = x; });
        (src.units || []).forEach((x) => { srcUnit[x.form] = x.sources; if (!srcUnit[x.unit]) srcUnit[x.unit] = x.sources; });
        (src.items || []).forEach((x) => { srcItem[x.id] = x.sources; });
        return { form, unit, formByName, formByArchive, item, sphere, sphereByName, srcUnit, srcItem };
      });
      idx.catch(() => { idx = null; });
    }
    return idx;
  }

  let midx = null;
  function missions() {
    if (!midx) {
      midx = get('missions').then((m) => {
        const area = {}, dungeon = {}, mission = {};
        (m.areas || []).forEach((a) => { area[a.archiveId] = a; });
        (m.dungeons || []).forEach((d) => { dungeon[d.archiveId] = d; });
        (m.missions || []).forEach((x) => { mission[x.archiveId] = x; });
        return { area, dungeon, mission, lands: m.lands || [] };
      });
      midx.catch(() => { midx = null; });
    }
    return midx;
  }

  let eidx = null;
  function enemies() {
    if (!eidx) {
      eidx = get('enemies').then((e) => { const o = {}; (e.enemies || []).forEach((x) => { o[x.archiveId] = x; }); return o; });
      eidx.catch(() => { eidx = null; });
    }
    return eidx;
  }

  // Une vague = des ennemis fixes, ou un tirage au hasard parmi plusieurs groupes (pool)
  function waveEnemies(w) {
    if (w.enemies) return { random: false, groups: [w.enemies] };
    if (w.pool) return { random: true, groups: w.pool.map((p) => p.enemies || []) };
    if (w.guardians) return { random: false, groups: [[].concat(w.guardians.enemies || w.guardians || [])] };
    return { random: false, groups: [] };
  }

  const nice = (id) => String(id || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  function nameOf(I, id) {
    if (I.form[id]) return I.form[id].name;
    if (I.unit[id]) return (I.unit[id].forms && I.unit[id].forms[0] && I.unit[id].forms[0].name) || I.unit[id].name;
    if (I.item[id]) return I.item[id].name;
    if (I.sphere[id]) return I.sphere[id].name;
    return nice(id);
  }

  // Où obtenir un objet ou une unité : les meilleures missions d'abord (par énergie dépensée)
  async function whereToGet(id) {
    const [I, M] = await Promise.all([index(), missions()]);
    const list = I.srcItem[id] || I.srcUnit[id] || [];
    const out = [];
    list.forEach((s) => {
      const m = s.mission && M.mission[s.mission];
      if (s.kind === 'drop' && m) {
        out.push({ kind: 'drop', mission: s.mission, perRun: s.perRun, chance: s.chance, energy: m.energy, info: missionLabel(M, m) });
      } else if (s.kind === 'capture' && m) {
        let perRun = 0;
        (m.waves || []).forEach((w) => {
          const { groups } = waveEnemies(w);
          groups.forEach((g) => g.forEach((e) => {
            const c = e && e.drops && e.drops.capture;
            if (c && (c.unit === id || (I.form[id] && c.unit === I.form[id].unit))) perRun += (c.rate || 0) / 100 / groups.length;
          }));
        });
        out.push({ kind: 'capture', mission: s.mission, perRun, chance: perRun * 100, energy: m.energy, info: missionLabel(M, m) });
      } else {
        out.push(Object.assign({}, s, m ? { energy: m.energy, info: missionLabel(M, m) } : {}));
      }
    });
    const score = (x) => (x.kind === 'drop' || x.kind === 'capture' ? (x.perRun || 0) / Math.max(1, x.energy || 0) : -1);
    out.sort((a, b) => score(b) - score(a) || (a.energy || 0) - (b.energy || 0));
    return out;
  }

  function missionLabel(M, m) {
    const d = M.dungeon[m.dungeon] || {};
    const a = M.area[d.area] || {};
    return { name: m.name, dungeon: d.name || '', area: a.name || '', areaType: a.type || '', energy: m.energy, battles: m.battles };
  }

  async function missionInfo(id) {
    const [M, E, I] = await Promise.all([missions(), enemies(), index()]);
    const m = M.mission[id];
    if (!m) return null;
    const waves = (m.waves || []).map((w) => {
      const { random, groups } = waveEnemies(w);
      const seen = new Set();
      const list = [];
      groups.forEach((g) => g.forEach((e) => { if (e && !seen.has(e.enemy + ':' + e.variant)) { seen.add(e.enemy + ':' + e.variant); list.push(e); } }));
      const out = list.map((e) => {
      const en = E[e.enemy] || {};
      const v = (en.variants && (en.variants[e.variant] || en.variants[Object.keys(en.variants)[0]])) || {};
      const d = e.drops || {};
      return {
        id: e.enemy, name: en.name || '?', element: v.element || '', hp: (v.stats && v.stats.hp) || 0, boss: !!e.boss,
        ai: v.ai || [], capture: d.capture ? { unit: d.capture.unit, name: nameOf(I, d.capture.unit), rate: d.capture.rate } : null,
        items: (d.items || []).map((x) => ({ id: x.item || x.id, name: nameOf(I, x.item || x.id), chance: x.rate })),
        chest: !!d.chest,
        resists: v.resists || null,
      };
      });
      out.random = random;
      return out;
    });
    // Butin possible : objets (taux par passage d'après les sources) et captures (d'après les vagues)
    const loot = [];
    Object.keys(I.srcItem).forEach((k) => (I.srcItem[k] || []).forEach((s) => {
      if (s.mission === +id && s.kind === 'drop' && !loot.some((l) => l.id === k)) {
        loot.push({ id: k, type: 'item', kind: 'drop', name: nameOf(I, k), chance: s.chance, perRun: s.perRun });
      }
    }));
    const caps = {};
    (m.waves || []).forEach((w) => {
      const { groups } = waveEnemies(w);
      groups.forEach((g) => g.forEach((e) => {
        const c = e && e.drops && e.drops.capture;
        if (c) caps[c.unit] = (caps[c.unit] || 0) + (c.rate || 0) / groups.length;
      }));
    });
    Object.keys(caps).forEach((u) => loot.push({ id: u, type: 'unit', kind: 'capture', name: nameOf(I, u), chance: Math.min(100, caps[u]) }));
    loot.sort((a, b) => (b.chance || 0) - (a.chance || 0));
    return Object.assign(missionLabel(M, m), { id: +id, zel: m.zel, exp: m.exp, karma: m.karma, waves, loot });
  }

  // Lance le bot de farm sur une mission (Windows / Chrome : panneau de l'appli ; Android : appli native)
  function farm(missionId) {
    const id = String(missionId);
    if (window.__rbfUI && window.__rbfUI.farm) { window.__rbfUI.farm(id); return true; }
    if (window.rbfNative && typeof window.rbfNative.save !== 'function' && window.rbfNative.postMessage) {
      window.rbfNative.postMessage('farm:' + id);
      return true;
    }
    location.assign('/start/' + id);
    return false;
  }

  // ───────── Effets en texte (modèles fournis par l'API) ─────────
  const TARGET = { self: 'self', party: 'all allies', ally: 'one ally', enemy: 'one enemy', enemies: 'all enemies', single: 'one ally' };
  const STAT = { hp: 'HP', atk: 'ATK', def: 'DEF', rec: 'REC' };
  let fx = null;
  function effectsText(list) {
    if (!fx) fx = get('effects').then((e) => { const o = {}; (e.effects || []).forEach((x) => { o[x.id] = x.template; }); return o; });
    return fx.then((T) => (list || []).map((e) => {
      let t = T[e.id];
      if (!t) return nice(e.id);
      const pct = (v) => Math.round((v || 0) * 1000) / 10 + '%';
      if (e.stat) t = t.replace(/\b(ATK|DEF|REC|HP)\b/, STAT[e.stat] || e.stat.toUpperCase());
      if (e.ailment) t = t.replace(/\b(poison|weak|sick|injury|curse|paralysis)\b/, e.ailment);
      t = t.replace('{value%}', e.min !== undefined && e.max !== undefined && !e.value ? pct(e.min) + '–' + pct(e.max) : pct(e.value))
        .replace('{value}', e.value !== undefined ? String(e.value) : '')
        .replace('{turns}', String(e.turns || ''))
        .replace('{target}', TARGET[e.target] || e.target || '');
      if (e.chance && !/chance/i.test(t)) t = e.chance + '% chance: ' + t;
      return t.replace(/ for  turns/, '');
    }));
  }

  // Sphère affichée par le jeu (nom en français + icône) → fiche de l'API
  const fold = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ');
  async function findSphere(name, icon) {
    const [I, art] = await Promise.all([index(), get('art')]);
    const direct = I.sphereByName[String(name || '').toLowerCase()];
    if (direct) return direct;
    const file = String(icon || '').split('/').pop();
    let cands = (art.spheres || []).filter((x) => x.icon && x.icon.path.split('/').pop() === file).map((x) => I.sphere[x.id]).filter(Boolean);
    if (!cands.length) cands = Object.values(I.sphere);
    const words = fold(name).split(/\s+/).filter((w) => w.length > 3);
    let best = null, bestScore = 0;
    cands.forEach((c) => {
      const en = fold(c.name);
      const sc = words.reduce((n, w) => n + (en.includes(w) || en.includes(w.slice(0, -1)) ? w.length : 0), 0);
      if (sc > bestScore) { best = c; bestScore = sc; }
    });
    return best || (cands.length === 1 ? cands[0] : null);
  }

  window.rbfData = { get, index, missions, enemies, whereToGet, missionInfo, nameOf, farm, nice, effectsText, findSphere, waveEnemies };
})();
// Infos tirées des données officielles du jeu (data.rebornbf.com) :
// · avant une quête : butin, captures, vagues, éléments, boss, bouton « Farmer »
// · dans la liste des missions d'un donjon : un bouton ⓘ par mission
// · sur la page d'invocation : les vrais taux des bannières
(function () {
  'use strict';
  if (window.top !== window) return; const old=document.getElementById("rbf-gameinfo"); if(old) old.remove();
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
