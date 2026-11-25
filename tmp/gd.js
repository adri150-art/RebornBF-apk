// Données officielles du jeu (API publique data.rebornbf.com) partagées par les autres scripts.
// Chaque paquet est gardé dans le cache du navigateur (nom = empreinte, il ne change jamais) :
// on ne retélécharge que si le manifeste annonce une nouvelle version (vérifié au plus toutes les 10 min).
(function () {
  'use strict';
  if (window.rbfData) return;

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
        const form = {}, unit = {}, formByName = {}, item = {}, sphere = {}, sphereByName = {}, srcUnit = {}, srcItem = {};
        (u.units || []).forEach((un) => {
          unit[un.id] = un;
          (un.forms || []).forEach((f, i) => {
            const o = Object.assign({}, f, { unit: un.id, element: un.element, step: i, last: i === un.forms.length - 1 });
            form[f.id] = o;
            formByName[String(f.name || '').toLowerCase()] = o;
          });
        });
        (it.items || []).forEach((x) => { item[x.id] = x; });
        (sp.spheres || []).forEach((x) => { sphere[x.id] = x; sphereByName[String(x.name || '').toLowerCase()] = x; });
        (src.units || []).forEach((x) => { srcUnit[x.form] = x.sources; if (!srcUnit[x.unit]) srcUnit[x.unit] = x.sources; });
        (src.items || []).forEach((x) => { srcItem[x.id] = x.sources; });
        return { form, unit, formByName, item, sphere, sphereByName, srcUnit, srcItem };
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
        out.push(Object.assign({}, s));
      }
    });
    const score = (x) => (x.mission ? (x.perRun || 0) / Math.max(1, x.energy || 0) : -1);
    out.sort((a, b) => score(b) - score(a));
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
    // Butin possible de la mission (d'après la liste des sources)
    const loot = [];
    const add = (src, type) => Object.keys(src).forEach((k) => (src[k] || []).forEach((s) => {
      if (s.mission === +id && (s.kind === 'drop' || s.kind === 'capture') && !loot.some((l) => l.id === k)) {
        loot.push({ id: k, type, kind: s.kind, name: nameOf(I, k), chance: s.chance, perRun: s.perRun });
      }
    }));
    add(I.srcItem, 'item');
    add(I.srcUnit, 'unit');
    waves.forEach((w) => w.forEach((e) => {
      if (e.capture && !loot.some((l) => l.id === e.capture.unit || I.form[l.id] && I.form[l.id].unit === e.capture.unit)) {
        loot.push({ id: e.capture.unit, type: 'unit', kind: 'capture', name: e.capture.name, chance: e.capture.rate });
      }
    }));
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

  window.rbfData = { get, index, missions, enemies, whereToGet, missionInfo, nameOf, farm, nice };
})();
