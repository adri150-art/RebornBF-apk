window.rbfApp={platform:'android',settings:()=>({bots:{farm:true,aventure:false},opt:{remaster:true,infos:true,appfeel:true,hd:false,always_x2:true,always_auto:false,notifications:true},custom:[{name:'Bot arène',on:true,code:''}]}),save:(s,u)=>{window.__saved=[s,u]},action:()=>{},postMessage:()=>{}};
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
        ai: v.ai || [], skills: v.skills || [], acts: v.acts || null, capture: d.capture ? { unit: d.capture.unit, name: nameOf(I, d.capture.unit), rate: d.capture.rate } : null,
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

  // Lance le bot de farm sur une mission, après avoir demandé combien de combats faire
  function startFarm(id, target) {
    if (window.__rbfUI && window.__rbfUI.farm) { window.__rbfUI.farm(id, target); return; }
    if (window.rbfNative && typeof window.rbfNative.save !== 'function' && window.rbfNative.postMessage) {
      window.rbfNative.postMessage('farm:' + id + ':' + target);
      return;
    }
    try {
      const s = JSON.parse(localStorage.getItem('bfrRepeatBot') || '{}');
      Object.assign(s, { quest: id, on: true, target, fights: 0, curRun: 0, loops: 0, slot: null, maxRuns: null, single: false, day: new Date().toDateString() });
      localStorage.setItem('bfrRepeatBot', JSON.stringify(s));
    } catch (e) { /* rien */ }
    location.assign('/start/' + id);
  }
  function farm(missionId) {
    const id = String(missionId);
    let last = 0;
    try { last = parseInt(localStorage.getItem('rbf_farm_last_n'), 10) || 0; } catch (e) { /* rien */ }
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647';
    const r = host.attachShadow({ mode: 'open' });
    const A = 'https://assets.rebornbf.com/assets/original/';
    const opts = [10, 30, 50, 100, 300, 0];
    r.innerHTML = `<style>
      *{box-sizing:border-box;margin:0}
      .bg{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px}
      .card{width:min(360px,100%);border-radius:12px;background:rgba(14,11,7,.97);box-shadow:inset 0 0 0 1.5px rgba(255,210,120,.45),0 8px 24px rgba(0,0,0,.6);
        padding:14px;color:#f1ead8;font:14px/1.4 "Segoe UI Variable","Segoe UI",system-ui,sans-serif}
      h2{font:20px/1.2 "Lilita One",system-ui,sans-serif;font-weight:400;color:#ffd24a}
      p{color:#cfc6b0;font-size:13px;margin:3px 0 10px}
      .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
      .o{height:44px;border-radius:9px;display:flex;align-items:center;justify-content:center;cursor:pointer;background:rgba(255,255,255,.06);
        box-shadow:inset 0 0 0 1px rgba(255,210,120,.25);font:18px/1 "Lilita One",system-ui,sans-serif;color:#fff;transition:transform .08s}
      .o:active{transform:scale(.95)}.o.last{box-shadow:inset 0 0 0 2px #ffd24a}
      .row{display:flex;gap:7px;margin-top:9px}
      input{flex:1;min-width:0;height:42px;border-radius:9px;border:0;padding:0 12px;background:rgba(255,255,255,.08);color:#fff;font:17px "Lilita One",system-ui,sans-serif;outline:none;box-shadow:inset 0 0 0 1px rgba(255,210,120,.3)}
      .b{flex:none;width:100px;height:42px;background:none;border-style:solid;border-width:0;border-image:url('https://assets.rebornbf.com/assets/original/common/button/sub_ss_btn1.png') 26 34 fill / 13px 17px;display:flex;align-items:center;justify-content:center;
        padding-bottom:3px;cursor:pointer;color:#fff;font:15px/1 "Lilita One",system-ui,sans-serif;text-shadow:0 0 2px #1a1006,0 0 2px #1a1006}
      .x{display:block;margin:10px auto 0;text-align:center;color:#a99f88;cursor:pointer;font-size:13px}
    </style><div class="bg"><div class="card"><h2>Farmer combien de fois ?</h2><p>Nombre de combats. Ton équipe n'est jamais changée.</p>
      <div class="grid">${opts.map((n) => `<div class="o${n === last ? ' last' : ''}" data-n="${n}">${n || '∞'}</div>`).join('')}</div>
      <div class="row"><input type="number" min="1" max="9999" placeholder="Autre nombre"><div class="b" data-go>Lancer</div></div>
      <span class="x" data-x>Annuler</span></div></div>`;
    const done = (n) => {
      host.remove();
      if (n === null) return;
      try { localStorage.setItem('rbf_farm_last_n', String(n)); } catch (e) { /* rien */ }
      startFarm(id, n);
    };
    r.addEventListener('click', (e) => {
      const o = e.target.closest('[data-n]');
      if (o) { done(+o.dataset.n); return; }
      if (e.target.closest('[data-go]')) { const v = parseInt(r.querySelector('input').value, 10); if (v > 0) done(v); return; }
      if (e.target.closest('[data-x]') || e.target.classList.contains('bg')) done(null);
    });
    r.querySelector('input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const v = parseInt(e.target.value, 10); if (v > 0) done(v); } e.stopPropagation(); });
    document.documentElement.appendChild(host);
    return true;
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

  // Objet affiché par le jeu (icône) → identifiant de l'API
  async function itemFromIcon(src) {
    const art = await get('art');
    const file = String(src || '').split('/').pop().split('?')[0];
    const it = (art.items || []).find((x) => x.icon && x.icon.path.split('/').pop() === file);
    if (it) return it.id;
    const u = String(src || '').match(/\/units\/(\d+)\//);
    if (u) { const I = await index(); return I.formByArchive[u[1]] ? I.formByArchive[u[1]].id : null; }
    return null;
  }

  window.rbfData = { get, index, missions, enemies, whereToGet, missionInfo, nameOf, farm, nice, effectsText, findSphere, waveEnemies, itemFromIcon };
})();
// Infos tirées des données officielles du jeu (data.rebornbf.com) :
// · avant une quête : butin, captures, vagues, éléments, boss, bouton « Farmer »
// · dans la liste des missions d'un donjon : un bouton ⓘ par mission
// · sur la page d'invocation : les vrais taux des bannières
(function () {
  'use strict';
  if (window.top !== window) return;
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
    .gbtn{flex:1;max-width:220px;margin:0 auto;height:42px;background:none;border-style:solid;border-width:0;border-image:url('https://assets.rebornbf.com/assets/original/common/button/sub_ss_btn1.png') 26 34 fill / 13px 17px;display:flex;align-items:center;justify-content:center;
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
    .team{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
    .team a{display:flex;flex-direction:column;align-items:center;gap:3px;padding:5px;border-radius:9px;background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px rgba(255,210,120,.14);text-decoration:none;color:#f1ead8}
    .team img{width:54px;height:54px;object-fit:contain}.team span{font-size:11.5px;text-align:center;line-height:1.2;max-height:2.4em;overflow:hidden}
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
        ${await teamAdvice(tipEls)}
        <h3>Butin possible</h3><div class="loot">${loot || '<span class="muted">Rien de particulier</span>'}</div>
        <h3>Vagues</h3>${waves || '<p class="muted">Pas de détail</p>'}
      </div>
      <div class="row2"><div class="gbtn ol" data-a="farm" data-m="${m.id}">Farmer</div><div class="gbtn ol" data-a="close">Fermer</div></div></div>`);
  }
  actions.farm = (el) => { close(); window.rbfData.farm(el.dataset.m); };
  actions.mission = (el) => openMission(el.dataset.m);

  // ───────── 6. Conseil d'équipe : tes unités du bon élément ─────────
  // La liste de tes unités est retenue quand tu ouvres l'écran « Unités » du jeu.
  const ROSTER = 'rbf_roster';
  function saveRoster() {
    const links = $$('a[href*="/units/info?id="]');
    if (!links.length) return;
    let old = {};
    try { old = JSON.parse(localStorage.getItem(ROSTER) || '{}'); } catch (e) { old = {}; }
    const list = old.list || {};
    links.forEach((a) => {
      const img = a.querySelector('img[src*="/units/"]');
      const aid = img && ((img.currentSrc || img.src).match(/\/units\/(\d+)\//) || [])[1];
      const uid = (a.getAttribute('href').match(/id=([0-9a-f-]{36})/) || [])[1];
      if (aid && uid) list[uid] = aid;
    });
    try { localStorage.setItem(ROSTER, JSON.stringify({ at: Date.now(), list })); } catch (e) { /* rien */ }
  }
  async function teamAdvice(els) {
    if (!els || !els.length) return '';
    let roster = {};
    try { roster = (JSON.parse(localStorage.getItem(ROSTER) || '{}').list) || {}; } catch (e) { roster = {}; }
    const uids = Object.keys(roster);
    if (!uids.length) return `<p class="muted" style="margin-top:6px">Ouvre une fois l'écran « Unités » du jeu pour que je connaisse tes unités et te conseille une équipe.</p>`;
    const I = await window.rbfData.index();
    const seen = new Set();
    const picks = uids.map((uid) => ({ uid, f: I.formByArchive[roster[uid]] }))
      .filter((x) => x.f && els.includes(x.f.element) && !/totem|idol|pot|mimic|nymph|spirit|crystal|bulb|egg/i.test(x.f.name))
      .sort((a, b) => ((b.f.stats && b.f.stats.max && b.f.stats.max.atk) || 0) - ((a.f.stats && a.f.stats.max && a.f.stats.max.atk) || 0))
      .filter((x) => { if (seen.has(x.f.id)) return false; seen.add(x.f.id); return true; })
      .slice(0, 6);
    if (!picks.length) return `<p class="muted" style="margin-top:6px">Aucune de tes unités connues n'a cet élément.</p>`;
    return `<h3>Tes unités conseillées</h3><div class="team">${picks.map((x) => `<a href="/units/info?id=${x.uid}" title="${esc(x.f.name)}">
      <img src="${A}units/${roster[x.uid]}/unit_ills_thum_${roster[x.uid]}.png" alt=""><span>${esc(x.f.name)}</span></a>`).join('')}</div>`;
  }

  // ───────── 5. Fiche du boss pendant le combat ─────────
  const COND = (c) => {
    switch (c.type) {
      case 'on_turn': return 'au tour ' + c.turn;
      case 'every_n_turns': return 'tous les ' + c.n + ' tours';
      case 'hp_under': return 'sous ' + c.hpPercent + ' % de PV';
      case 'hp_over': return 'au-dessus de ' + c.hpPercent + ' % de PV';
      case 'limit': return c.times === 1 ? 'une seule fois' : c.times + ' fois max';
      case 'side_alive': return 's\'il reste ' + c.count + ' ennemi' + (c.count > 1 ? 's' : '');
      case 'ally_defeated': return 'quand un allié tombe';
      case 'unit_term': return c.term === 'abnormal_state' ? 'si tes unités ont une altération' : '';
      default: return '';
    }
  };
  const ATK = { 'attack.aoe': 'attaque de zone', 'attack.st': 'attaque ciblée', 'attack.random': 'attaques au hasard' };
  async function openBoss() {
    const id = sessionStorage.getItem('rbf_last_mission');
    if (!id) { show(`<div class="card"><div class="head"><h2>Mission inconnue</h2><p>Lance la quête depuis le jeu pour que je sache qui tu affrontes.</p></div><div class="row2"><div class="gbtn ol" data-a="close">Fermer</div></div></div>`); return; }
    show(`<div class="card"><div class="head"><h2>Chargement…</h2></div><div class="row2"><div class="gbtn ol" data-a="close">Fermer</div></div></div>`);
    const m = await window.rbfData.missionInfo(id).catch(() => null);
    if (!m) { show(`<div class="card"><div class="head"><h2>Mission inconnue</h2><p>Cette mission n'est pas dans les données du jeu.</p></div><div class="row2"><div class="gbtn ol" data-a="close">Fermer</div></div></div>`); return; }
    let foes = [].concat(...m.waves).filter((e) => e.boss);
    if (!foes.length) foes = m.waves[m.waves.length - 1] || [];
    const blocks = await Promise.all(foes.map(async (e) => {
      const byId = {};
      (e.skills || []).forEach((s) => { byId[s.id] = s; });
      const lines = [];
      for (const a of e.ai || []) {
        const s = byId[a.skill];
        if (!s) continue;
        const when = (a.conditions || []).map(COND).filter(Boolean);
        const kind = (s.effects || []).map((x) => ATK[x.id]).filter(Boolean)[0] || '';
        const extra = (await window.rbfData.effectsText((s.effects || []).filter((x) => !ATK[x.id]))).slice(0, 3);
        lines.push(`<div class="en" style="align-items:flex-start"><span style="flex:none;min-width:92px;color:#ffd24a;font-size:12.5px">${esc(a.when === 'default' ? (a.chance ? a.chance + ' % de chance' : 'parfois') : when.join(', ') || 'spécial')}</span>
          <span class="n" style="white-space:normal"><b>${esc(s.name)}</b>${kind ? ' · ' + kind : ''}${extra.length ? '<br><small class="muted">' + extra.map(esc).join(' · ') + '</small>' : ''}</span></div>`);
      }
      const strong = BEATS[e.element];
      return `<div class="wave"><div class="en boss">${elIcon(e.element)}<span class="n">👑 ${esc(e.name)}</span><span class="hp">${num(e.hp)} PV</span></div>
        ${e.acts ? `<small>${e.acts.min === e.acts.max ? e.acts.min : e.acts.min + ' à ' + e.acts.max} action(s) par tour${strong ? ' · faible contre ' + EL_FR[strong] : ''}</small>` : ''}
        ${lines.join('') || '<small>Pas d\'attaque spéciale connue</small>'}</div>`;
    }));
    show(`<div class="card"><div class="head"><h2>${esc(m.name)}</h2><p>Ce que le boss va faire</p></div>
      <div class="body">${blocks.join('')}</div><div class="row2"><div class="gbtn ol" data-a="close">Fermer</div></div></div>`);
  }

  // ───────── Synthèse : toucher un ingrédient → où le farmer (meilleur taux d'abord) ─────────
  async function openItemSources(src, label) {
    show(`<div class="card"><div class="head"><h2>Chargement…</h2></div><div class="row2"><div class="gbtn ol" data-a="close">Fermer</div></div></div>`);
    const id = await window.rbfData.itemFromIcon(src).catch(() => null);
    if (!id) { show(`<div class="card"><div class="head"><h2>Ingrédient inconnu</h2><p>Je ne retrouve pas cet objet dans les données du jeu.</p></div><div class="row2"><div class="gbtn ol" data-a="close">Fermer</div></div></div>`); return; }
    const I = await window.rbfData.index();
    const all = await window.rbfData.whereToGet(id);
    const farm = all.filter((x) => x.kind === 'drop' || x.kind === 'capture').sort((a, b) => (b.chance || 0) - (a.chance || 0) || (a.energy || 0) - (b.energy || 0));
    const other = all.filter((x) => !(x.kind === 'drop' || x.kind === 'capture'));
    const K = { summon: 'Invocation', 'merit-exchange': 'Boutique du mérite', 'level-up': 'Niveau joueur', craft: 'Synthèse', 'first-clear': 'Première victoire', evolution: 'Évolution', 'hunter-rank': 'Rang de chasseur' };
    show(`<div class="card"><div class="head" style="display:flex;gap:10px;align-items:center"><img src="${esc(src)}" alt="" style="width:46px;height:46px;object-fit:contain">
        <div><h2>${esc(label || window.rbfData.nameOf(I, id))}</h2><p>${esc(window.rbfData.nameOf(I, id))} · où le farmer, meilleur taux d'abord</p></div></div>
      <div class="body">${farm.slice(0, 8).map((x, k) => { const i = x.info || {}; return `<div class="wave" style="display:flex;align-items:center;gap:10px">
          <div style="flex:1;min-width:0"><div class="en" style="padding:0"><span class="n" style="font-weight:600">${k === 0 ? '⭐ ' : ''}${esc(i.name)}</span><span class="hp" style="color:#ffd24a">${pct(x.chance)}</span></div>
          <p class="muted">${x.kind === 'capture' ? '🎯 Capture' : '📦 Drop'} · ${esc(i.dungeon)}${i.area && i.area !== i.dungeon ? ' · ' + esc(i.area) : ''} · ⚡ ${i.energy || 0}</p></div>
          <div class="gbtn ol" data-a="farm" data-m="${x.mission}" style="flex:none;width:86px;height:34px;font-size:13px;margin:0">Farmer</div></div>`; }).join('')
        || '<p class="muted" style="margin-top:8px">Ne tombe dans aucune mission.</p>'}
        ${other.length ? `<h3>Autres moyens</h3><div class="loot">${other.slice(0, 6).map((x) => `<span>${esc(K[x.kind] || x.kind)}${x.info ? ' · ' + esc(x.info.name) : ''}</span>`).join('')}</div>` : ''}
      </div><div class="row2"><div class="gbtn ol" data-a="close">Fermer</div></div></div>`);
  }
  const SYNTH = /^\/(town|items|craft|synth|forge|workshop)/i;
  document.addEventListener('click', (e) => {
    if (!SYNTH.test(location.pathname) || !window.rbfData) return;
    if (e.composedPath().includes(host)) return;
    let img = e.target.tagName === 'IMG' ? e.target : null;
    if (!img && e.target.closest) {
      const box = e.target.closest('button,a,li,[role="button"]');
      const imgs = box ? box.querySelectorAll('img[src*="/item/"]') : [];
      if (imgs.length === 1) img = imgs[0];
    }
    const src = img && (img.currentSrc || img.src);
    if (!src || !/\/item\//.test(src)) return;
    const box = img.closest('button,a,li') || img.parentElement;
    const label = box ? (box.innerText || '').split('\n').map((t) => t.trim()).find((t) => t && !/^[x×]?\d+$/.test(t) && !/poss/i.test(t)) : '';
    setTimeout(() => openItemSources(src, label), 0);
  }, true);

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
    let mats = readEvoMaterials();
    let rows = [];
    try {
      const [I, art] = await Promise.all([window.rbfData.index(), window.rbfData.get('art')]);
      // Sans lire l'écran : l'unité affichée (son image) suffit, l'API donne la liste des matériaux
      if (!mats.length) {
        const ids = [...new Set($$('img[src*="/units/"]').map((i) => ((i.currentSrc || i.src).match(/\/units\/(\d+)\//) || [])[1]).filter(Boolean))];
        const forms = ids.map((x) => I.formByArchive[x]).filter((f) => f && f.evolution);
        const score = (f) => (f.evolution.units || []).filter((u) => ids.some((x) => I.formByArchive[x] && I.formByArchive[x].unit === u.unit)).length;
        forms.sort((a, b) => score(b) - score(a));
        const f = forms[0];
        if (f) {
          const artOf = (id) => { const a = (art.units || []).find((x) => x.form === id || x.unit === id) || (art.items || []).find((x) => x.id === id); const pth = a && (a.thumbnail || a.icon); return pth ? A + pth.path.replace(/^original\//, '') : ''; };
          mats = (f.evolution.units || []).map((u) => ({ id: (I.unit[u.unit] && I.unit[u.unit].forms[0].id) || u.unit, count: u.count }))
            .concat((f.evolution.items || []).map((x) => ({ id: x.item, count: x.count })))
            .map((x) => ({ src: artOf(x.id), owned: null, id: x.id, count: x.count }));
        }
      }
      rows = await Promise.all(mats.map(async (m) => {
        let id = m.id || null;
        const u = !id && m.src.match(/\/units\/(\d+)\//);
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
          <span class="hp" style="color:${r.m.owned ? '#7ddc8f' : '#ff8a7a'}">${r.m.owned === null ? (r.m.count || 1) + '× requis' : 'Possédé ' + r.m.owned}</span></div>${line(r)}</div>
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
    if (p === '/units/list' || p === '/units') saveRoster();
    const sm = p.match(/^\/start\/(\d+)/);
    if (sm) sessionStorage.setItem('rbf_last_mission', sm[1]);
    if (p === lastPath) return;
    lastPath = p;
    close();
    const m = p.match(/^\/start\/(\d+)/);
    if (m) showTab('📜 Infos quête', () => openMission(m[1]));
    else if (p.startsWith('/summon')) showTab('📊 Taux', openRates);
    else if (p.startsWith('/units/info/evolve')) showTab('📦 Où farmer', openEvoGuide);
    else if (p.startsWith('/battle')) showTab('👑 Boss', openBoss);
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
// Interface de l'appli par-dessus le jeu : bouton ☰, menu rapide, bots & réglages.
// Isolée dans un Shadow DOM pour ne jamais toucher au style du jeu.
(function () {
  'use strict';
   
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
    .tile{aspect-ratio:1/1;max-height:84px;border-radius:11px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;cursor:pointer;
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

  fab.addEventListener('click', quick);
  fab.addEventListener('contextmenu', (e) => { e.preventDefault(); settings(); });

  const mount = () => { if (!document.documentElement.contains(host)) document.documentElement.appendChild(host); };
  mount();
  setInterval(mount, 2000);

  window.__rbfUI = { quick, settings, close: closeAll, farm: (id, n) => farmQuest(String(id), n) };
})();
