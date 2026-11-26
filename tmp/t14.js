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

  // Image d'unité affichée par le jeu → forme de l'API (anciennes images numérotées ou nouvelles cartes .webp)
  let artIdx = null;
  async function formFromImage(src) {
    const I = await index();
    const s = String(src || '');
    const num = s.match(/\/units\/(\d+)\//) || s.match(/unit_ills_\w+?_(\d+)\./);
    if (num && I.formByArchive[num[1]]) return I.formByArchive[num[1]];
    if (!artIdx) {
      const art = await get('art');
      artIdx = {};
      (art.units || []).forEach((u) => {
        const p = u.thumbnail && u.thumbnail.path;
        if (p) artIdx[p.split('/').pop().replace(/\.\w+$/, '').toLowerCase()] = u.form;
      });
    }
    const file = s.split('?')[0].split('/').pop().replace(/\.\w+$/, '').toLowerCase();
    if (artIdx[file]) return I.form[artIdx[file]] || null;
    // Nouvelles cartes : <unité>-<forme>.webp, quel que soit le dossier (thumb, full, art…)
    const m = file.match(/^([a-z0-9-]+?)-(\d+star|omni|\d)$/);
    if (m) { const k = Object.keys(artIdx).find((x) => x === file || x.endsWith(file)); if (k) return I.form[artIdx[k]] || null; }
    return null;
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

  window.rbfData = { get, index, missions, enemies, whereToGet, missionInfo, nameOf, farm, nice, effectsText, findSphere, waveEnemies, itemFromIcon, formFromImage };
})();
