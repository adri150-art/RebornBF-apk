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
// Fiche d'unité « remaster » : une nouvelle fiche moderne affichée par-dessus celle du jeu.
// Elle reprend les images du jeu (illustration, icônes, étiquettes) et toutes les infos de la fiche
// d'origine, et actionne les boutons du jeu (favori, aide, sphères, unité suivante…) quand on la touche.
// Les fenêtres du jeu (détails de compétence, choix d'aide…) repassent au-dessus quand elles s'ouvrent.
(function () {
  'use strict';
  if (window.__rbfUnitPlusT6) return;
  window.__rbfUnitPlusT6 = true;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const U = (n) => '[class*="unit-info-module__"][class*="__' + n + '"]';
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const imgOf = (el) => { const i = el && (el.tagName === 'IMG' ? el : el.querySelector('img')); return i ? i.currentSrc || i.src : ''; };
  const txt = (el) => (el ? (el.innerText || el.textContent || '') : '').replace(/\s+/g, ' ').trim();
  const currentUnitId = () => new URLSearchParams(location.search).get('id');
  const favoriteBtn = () => $$(U('favoriteButton')).find((b) => !/__helperButton/.test(b.className));
  const switchBtn = () => $$(U('right') + ' button').find((b) => /switch|changer/i.test(txt(b) + ' ' + (b.getAttribute('aria-label') || '')));

  // ───────── Lecture de la fiche du jeu ─────────
  function read() {
    const page = $(U('page'));
    if (!page) return null;
    const names = $$(U('titleName'));
    const rarity = $(U('titleRow') + ' [class*="rarity-mark-module__"]');
    const helper = $(U('helperButton'));
    const d = {
      id: currentUnitId(),
      no: txt(names[0]),
      name: txt(names[1]),
      rarityImg: rarity ? imgOf(rarity) : '',
      rarityText: rarity ? (rarity.getAttribute('aria-label') || txt(rarity)) : '',
      stars: names[0] ? txt($(U('titleRow'))).replace(txt(names[0]), '').trim() : '',
      omni: !!$(U('titleRow') + ' [class*="__omni"]') || /omni/i.test(rarity ? rarity.getAttribute('aria-label') || '' : ''),
      element: imgOf($(U('subRow'))),
      art: imgOf($(U('splashOriginal'))),
      fav: !!$(U('favoriteMark')),
      type: '', typeIcon: '', lv: '', next: '', exp: 0, stats: [], spheres: [], cost: '', sp: '', skills: [],
      helper: helper ? helper.getAttribute('aria-pressed') === 'true' : false,
      hasHelper: !!helper,
      hasFavBtn: !!favoriteBtn(),
      switchBtn: !!switchBtn(),
    };
    $$(U('stats') + ' > *').forEach((row) => {
      const label = imgOf($('dt', row) || row);
      const value = txt($(U('value'), row)) || txt(row);
      if (/type\.png/.test(label)) { d.type = value; d.typeIcon = label; }
      else if (/\/lv\.png/.test(label)) { d.lv = value; d.lvIcon = label; }
      else if (/next\.png/.test(label)) d.next = value;
      else if (/__exp(\s|$)/.test(row.className)) {
        const f = $(U('expFill'), row);
        d.exp = f ? parseFloat(f.style.width) || 0 : 0;
      } else if (/__statRow/.test(row.className)) {
        const bonus = $('[class*="__bonus"] [class*="__value"]', row);
        if (!d.assets) { const any = imgOf(row); const m = any.match(/^(.*\/assets\/original\/)/); if (m) d.assets = m[1]; }
        d.stats.push({ icon: label, value: txt($('dd', row)) || value, bonus: txt(bonus) });
      }
    });
    if (!d.lv) { const m = txt($(U('left'))).match(/(\d+)\s*\/\s*(\d+)/); if (m) d.lv = m[0]; }
    $$(U('sphere')).filter((e) => e.tagName === 'BUTTON').forEach((b, i) => {
      d.spheres.push({ i, icon: imgOf($(U('sphereIcon'), b)), name: txt($(U('sphereName'), b)) || txt(b) });
    });
    $$(U('plate')).forEach((p) => {
      const l = $$('img', p).map((i) => i.currentSrc || i.src).find((src) => /status_char/.test(src)) || '';
      if (/cost\.png/.test(l)) { d.cost = txt(p); d.costIcon = l; }
      else if (/sp\.png/.test(l)) { d.sp = txt(p); d.spIcon = l; }
    });
    $$(U('skillRow')).forEach((s, i) => {
      const eff = $(U('skillEffects'), s);
      let text = '';
      if (eff) { const c = eff.cloneNode(true); c.querySelectorAll('[class*="__repeat"]').forEach((e) => e.remove()); text = txt(c); }
      const lab = $$('img', s).map((im) => im.currentSrc || im.src).find((src) => /leader_burst_label|label/.test(src)) || imgOf(s);
      d.skills.push({ i, kind: skillKind(lab), label: lab, name: txt($(U('skillName'), s)), level: txt($(U('skillLevel'), s)), text });
    });
    d.form = lookupForm(d);
    d.fuseOk = canFuse(d);
    return d;
  }

  // Type de compétence d'après l'étiquette du jeu (leader.png, bb.png, sbb.png, ubb.png, extra…)
  function skillKind(src) {
    const f = (src || '').split('/').pop().toLowerCase();
    if (/leader|ls/.test(f)) return ['Leader', 'ls'];
    if (/ubb/.test(f)) return ['Ultimate BB', 'ubb'];
    if (/sbb/.test(f)) return ['Super BB', 'sbb'];
    if (/bb|burst/.test(f)) return ['Brave Burst', 'bb'];
    if (/extra|es/.test(f)) return ['Extra', 'es'];
    return ['Compétence', 'es'];
  }

  // Améliorer inutile : niveau et compétences au maximum
  // ───────── Données officielles du jeu (data.rebornbf.com, API publique) ─────────
  // On garde une version allégée en cache : évolution possible, niveau max, plafonds d'imps.
  const DATA = 'https://data.rebornbf.com';
  let forms = null;
  try { const c = JSON.parse(localStorage.getItem('rbf_units_lite') || 'null'); if (c && c.map) forms = c; } catch (e) { /* rien */ }
  async function loadData() {
    try {
      const last = +(sessionStorage.getItem('rbf_units_check') || 0);
      if (forms && Date.now() - last < 10 * 60 * 1000) return;
      sessionStorage.setItem('rbf_units_check', String(Date.now()));
      const man = await fetch(DATA + '/v1/manifest.json').then((r) => r.json());
      const f = (man.files || []).find((x) => x.kind === 'units');
      if (!f || (forms && forms.path === f.path)) return;
      const u = await fetch(DATA + f.path).then((r) => r.json());
      const names = {};
      (u.units || []).forEach((un) => (un.forms || []).forEach((fo) => { names[fo.id] = fo.name; names[un.id] = un.name; }));
      const map = {};
      (u.units || []).forEach((un) => (un.forms || []).forEach((fo) => {
        let evo = 0;
        if (fo.evolution) {
          const parts = (fo.evolution.units || []).map((x) => x.count + '× ' + (names[x.unit] || x.unit))
            .concat((fo.evolution.items || []).map((x) => x.count + '× ' + x.item.replace(/-/g, ' ')));
          if (fo.evolution.zel) parts.push(Number(fo.evolution.zel).toLocaleString('fr-BE') + ' Zel');
          evo = parts.join(', ') || 1;
        }
        const e = { e: evo, m: fo.maxLevel, i: fo.impCaps || null, r: fo.rarity };
        if (fo.archiveId) map['a' + fo.archiveId] = e;
        map['n' + String(fo.name || '').toLowerCase()] = map['n' + String(fo.name || '').toLowerCase()] || e;
      }));
      forms = { path: f.path, map };
      try { localStorage.setItem('rbf_units_lite', JSON.stringify(forms)); } catch (e) { /* plein : tant pis */ }
      lastKey = '';
      schedule();
    } catch (e) { /* hors ligne : on garde l'estimation */ }
  }
  function lookupForm(d) {
    if (!forms) return null;
    const m = (d.art || '').match(/\/units\/(\d+)\//) || (d.art || '').match(/_(\d+)\.png/);
    const lvMax = +(((d.lv || '').match(/\/\s*(\d+)/) || [])[1] || 0);
    const byId = m && forms.map['a' + m[1]];
    if (byId) return byId;
    const byName = forms.map['n' + (d.name || '').toLowerCase()];
    return byName && (!lvMax || byName.m === lvMax) ? byName : null;
  }

  function canFuse(d) {
    if (d.form && d.form.i) {
      const order = ['hp', 'atk', 'def', 'rec'];
      const notCapped = d.stats.some((s, k) => { const cap = d.form.i[order[k]]; const v = parseInt((s.bonus || '0').replace(/\D/g, ''), 10) || 0; return cap && v < cap; });
      if (notCapped) return true;
    }
    const m = (d.lv || '').match(/(\d+)\s*\/\s*(\d+)/);
    if (!m || +m[1] < +m[2]) return true;
    const levels = d.skills.map((s) => parseInt((s.level || '').replace(/\D/g, ''), 10)).filter((n) => !isNaN(n));
    return levels.some((n) => n < 10);
  }

  // ───────── Actions (adresses et boutons du jeu) ─────────
  function go(p) {
    try { if (window.next && window.next.router && window.next.router.push) { window.next.router.push(p); return; } } catch (e) { /* rien */ }
    location.assign(p);
  }
  function act(a, arg) {
    const id = currentUnitId();
    if (a === 'back') { const b = $('a[class*="kit-module__"][class*="__back"]'); if (b) b.click(); else history.back(); }
    else if (a === 'prev' || a === 'next') { const p = $(U(a === 'prev' ? 'pagerPrev' : 'pagerNext')); if (p) p.click(); }
    else if (a === 'fav') { const f = favoriteBtn(); if (f) f.click(); }
    else if (a === 'helper') { const h = $(U('helperButton')); if (h) h.click(); }
    else if (a === 'switch') { const s = switchBtn(); if (s) s.click(); }
    else if (a === 'sphere') { const s = $$(U('sphere')).filter((e) => e.tagName === 'BUTTON')[+arg]; if (s) s.click(); }
    else if (a === 'type') { const t = $(U('typeHelp')); if (t) t.click(); }
    else if (a === 'fusion' && id) go('/fusion?target=' + encodeURIComponent(id));
    else if (a === 'evolve' && id) go('/units/info/evolve?id=' + encodeURIComponent(id));
  }

  // ───────── Affichage ─────────
  const host = document.createElement('div');
  host.id = 'rbf-unit-remasterT6';
  host.style.cssText = 'position:fixed;z-index:42;display:none;overflow:hidden';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    :host{all:initial}
    *{box-sizing:border-box;margin:0}
    .wrap{position:absolute;inset:0;overflow:hidden;color:#fff;font:14px/1.3 "Lilita One","Lilita One Fallback",system-ui,sans-serif;
      background:#2a2416 center top/100% auto;-webkit-tap-highlight-color:transparent;user-select:none}
    .shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(20,14,6,.6) 100%)}
    .page{position:absolute;inset:0;display:flex;flex-direction:column;gap:5px;padding:5px 7px 7px;overflow:hidden}
    /* Contour brun du jeu */
    .ol{text-shadow:1.3px 0 #1a1006,-1.3px 0 #1a1006,0 1.3px #1a1006,0 -1.3px #1a1006,1px 1px #1a1006,-1px 1px #1a1006,1px -1px #1a1006,-1px -1px #1a1006,0 2px 3px rgba(0,0,0,.5)}
    .gold{color:#ffd24a}
    .top{flex:none;position:relative;z-index:3;display:flex;align-items:center;height:58px}
    .back{flex:none;position:relative;z-index:1;width:calc((100% - 40px) * .25 - 4px);max-width:78px;height:48px;margin-left:2px;background:center/contain no-repeat;cursor:pointer;transition:transform .1s}
    .back:active{transform:scale(.93)}
    /* Plaque du jeu : sa partie gauche passe sous le bouton Back, le nom va dans la zone sombre */
    .plate{position:absolute;left:0;top:0;right:40px;height:58px;display:flex;flex-direction:column;justify-content:center;gap:3px;
      padding:3px calc((100% - 40px) * .13) 5px calc((100% - 40px) * .25 + 8px);background:left center/100% 100% no-repeat}
    .plate .name{font-size:18px;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .plate .meta{display:flex;align-items:center;gap:5px;font-size:12px;line-height:1}
    .plate .meta img{height:14px}
    .star{flex:none;margin-left:auto;position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:26px;cursor:pointer;
      color:#ffd24a;text-shadow:0 0 2px #1a1006,0 0 2px #1a1006,0 2px 4px rgba(0,0,0,.6);transition:transform .1s}
    .star:active{transform:scale(.85)} .star.off{color:rgba(255,255,255,.55)}
    /* L'illustration prend toute la place restante : jamais de défilement */
    .hero{flex:1 1 auto;min-height:90px;position:relative;display:flex;align-items:center;justify-content:center;pointer-events:none;margin:-4px -7px 0}
    .hero > img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 10px 18px rgba(0,0,0,.55));
      animation:float 6s ease-in-out infinite;transform-origin:50% 90%}
    @keyframes float{0%,100%{transform:translateY(0) scale(1.08)}50%{transform:translateY(-5px) scale(1.08)}}
    .arrow{position:absolute;top:50%;margin-top:-22px;width:30px;height:44px;pointer-events:auto;cursor:pointer;color:#ffd24a;font-size:32px;
      display:flex;align-items:center;justify-content:center;transition:transform .1s}
    .arrow:active{transform:scale(.85)} .arrow.l{left:6px}.arrow.r{right:6px}
    /* Cadres de statut du jeu en 3 morceaux */
    .pill{position:relative;display:flex;align-items:center;height:29px;min-width:0}
    .pill > .fl,.pill > .fc,.pill > .fr{position:absolute;top:0;bottom:0;background-size:100% 100%;background-repeat:no-repeat}
    .pill > .fl{left:0;width:8px}.pill > .fr{right:0;width:8px}.pill > .fc{left:8px;right:8px}
    .pill > .in{position:relative;display:flex;align-items:center;gap:5px;width:100%;padding:0 9px}
    .pill .lab{height:15px;flex:none}
    .pill .val{margin-left:auto;font-size:16px;line-height:1;white-space:nowrap;font-variant-numeric:tabular-nums}
    .pill.small{height:27px}.pill.small .val{font-size:14px}.pill.small .lab{height:13px}
    .chips{position:absolute;left:7px;right:7px;bottom:2px;display:flex;gap:5px;pointer-events:auto}
    .chips .pill{flex:0 1 auto}
    .block{flex:none;padding:6px;border-radius:10px;background:rgba(18,14,8,.6);box-shadow:inset 0 0 0 1px rgba(255,210,120,.22);display:flex;flex-direction:column;gap:5px}
    .lvrow{display:flex;align-items:center;gap:7px}
    .lvrow .pill{flex:0 0 46%}
    .exp{position:relative;flex:1;height:20px;background:center/100% 100% no-repeat}
    .exp i{position:absolute;inset:0;background:left center/100% 100% no-repeat;clip-path:inset(0 calc(100% - var(--p)) 0 0)}
    .exp b{position:absolute;right:6px;top:50%;transform:translateY(-50%);font-size:11px;font-weight:400}
    .stats{display:grid;grid-template-columns:1fr 1fr;gap:5px}
    .stat{display:flex;gap:3px;min-width:0}
    .stat .pill:first-child{flex:1}
    /* Cadre bonus du jeu : son corps commence à 12/45 de la hauteur (petit onglet en haut à gauche) */
    .stat .bonus{flex:0 0 auto;min-width:56px}.stat .bonus > .in{justify-content:center;padding:calc(29px * 12 / 45) 7px 1px 8px}
    .stat .bonus .val{font-size:13px;margin:0}
    .spheres{display:flex;gap:5px}
    .sph{display:flex;align-items:center;gap:5px;flex:1;min-width:0;cursor:pointer}
    .sph .fr0{position:relative;width:31px;height:31px;flex:none;background:center/100% 100% no-repeat}
    .sph .fr0 img{position:absolute;inset:4px;width:23px;height:23px;object-fit:contain}
    .sph .fr0 i{position:absolute;inset:0;background:center/100% 100% no-repeat}
    .sph .pill{flex:1}.sph .pill .val{margin:0;font-size:13px;overflow:hidden;text-overflow:ellipsis}
    /* Boutons du jeu : une seule rangée compacte, texte centré sur la face du bouton */
    .actions{flex:none;display:flex;gap:5px}
    .gbtn{flex:1;min-width:0;position:relative;height:40px;background:center/100% 100% no-repeat;cursor:pointer;
      display:flex;align-items:center;justify-content:center;padding:0 4px 3px;transition:transform .08s,filter .1s}
    .gbtn:active{transform:scale(.94);filter:brightness(1.15)}
    .gbtn span{font-size:15px;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .gbtn.off{filter:grayscale(1) brightness(.62)}
    /* Compétences : des boutons, le détail s'ouvre dans une fenêtre */
    .skills{flex:none;display:grid;grid-template-columns:repeat(6,1fr);gap:5px}
    .sk{position:relative;height:44px;border-radius:9px;cursor:pointer;overflow:hidden;background:rgba(14,11,7,.82);
      box-shadow:inset 0 0 0 1px rgba(255,210,120,.3),0 2px 4px rgba(0,0,0,.4);display:flex;flex-direction:column;justify-content:flex-end;
      padding:0 8px 5px;transition:transform .08s,box-shadow .15s}
    .sk:active{transform:scale(.96)} .sk:hover{box-shadow:inset 0 0 0 1px rgba(255,210,120,.65),0 2px 4px rgba(0,0,0,.4)}
    .sk .lb{position:absolute;left:0;top:0;height:22px;width:100%;background:left top/auto 100% no-repeat}
    .sk .lb.wide{background-size:auto 210%}
    .sk b{font-size:12.5px;font-weight:400;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:30px}
    .sk small{position:absolute;right:7px;bottom:5px;font-size:12px;color:#ffd24a}
    /* Fenêtre de détail */
    .pop{position:absolute;inset:0;z-index:10;display:flex;align-items:center;justify-content:center;padding:14px 10px;background:rgba(0,0,0,.6);
      opacity:0;pointer-events:none;transition:opacity .16s}
    .pop.on{opacity:1;pointer-events:auto}
    .card{width:100%;max-height:92%;display:flex;flex-direction:column;border-radius:12px;overflow:hidden;background:rgba(14,11,7,.96);
      box-shadow:inset 0 0 0 1.5px rgba(255,210,120,.45),0 8px 24px rgba(0,0,0,.6);transform:scale(.94);transition:transform .18s ease-out}
    .pop.on .card{transform:none}
    .card .bar{flex:none;position:relative;aspect-ratio:640/94;background:left center/100% 100% no-repeat;display:flex;align-items:center;padding:10% 14px 0 5%}
    .card .bar.badge{aspect-ratio:auto;height:54px;padding:0 14px;gap:10px;background:none;border-bottom:1px solid rgba(255,210,120,.25)}
    .card .bar.badge img{height:38px}
    .card .bar b{flex:1;min-width:0;font-size:20px;font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .card .bar small{font-size:17px;color:#ffd24a}
    .card .sub{padding:6px 16px 0;font-size:14px;color:#ffd24a}
    .card p{padding:8px 16px 12px;overflow-y:auto;font:16px/1.6 "Segoe UI Variable","Segoe UI",system-ui,sans-serif;color:#f1ead8;user-select:text}
    .card .x{flex:none;margin:2px auto 12px;width:150px;height:44px}
    .card ul{padding:8px 16px 12px 34px;overflow-y:auto;font:16px/1.55 "Segoe UI Variable","Segoe UI",system-ui,sans-serif;color:#f1ead8;user-select:text}
    .card li{margin:0 0 5px}.card li::marker{color:#ffd24a}
    .card ul.mats{list-style:none;padding:6px 10px 8px;display:flex;flex-direction:column;gap:6px}
    .card ul.mats li{display:flex;align-items:center;gap:8px;margin:0;padding:7px 8px;border-radius:9px;background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px rgba(255,210,120,.14)}
    .card ul.mats .t{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
    .card ul.mats b{font:15px/1.2 "Lilita One",system-ui,sans-serif;color:#fff;font-weight:400}
    .card ul.mats small{font-size:12.5px;line-height:1.35;color:#d9d0bb}.card ul.mats small b{font:inherit;color:#ffd24a}
    .card ul.mats small.none{color:#9a927f}
    .gbtn.mini{flex:none;width:86px;height:34px}.gbtn.mini span{font-size:13px}
    .card .row2{display:flex;gap:8px;padding:2px 12px 12px}.card .row2 .gbtn{height:42px}
  </style>
  <div class="wrap"><div class="shade"></div><div class="page"></div><div class="pop"></div></div>`;
  const scrollEl = root.querySelector('.page');
  const popEl = root.querySelector('.pop');
  let openSkill = -1;
  let lastKey = '';
  let lastPop = '';

  const ASSETS_FALLBACK = 'https://assets.rebornbf.com/assets/original/';
  const wrapEl = root.querySelector('.wrap');

  function pill(A, opts) {
    const f = opts.up ? 'common/status_frame/status_frame_up_' : 'common/status_frame/status_frame_m_';
    return `<div class="pill${opts.cls ? ' ' + opts.cls : ''}"${opts.attr || ''}>
      <i class="fl" style="background-image:url('${A}${f}l.png')"></i><i class="fc" style="background-image:url('${A}${f}c.png')"></i><i class="fr" style="background-image:url('${A}${f}r.png')"></i>
      <div class="in">${opts.icon ? `<img class="lab" src="${esc(opts.icon)}" alt="">` : ''}${opts.html || ''}</div></div>`;
  }
  const isBurst = (s) => /\/(bb|sbb|ubb)\.png/.test(s.label || '');
  const isWide = (s) => /\/(leader|bb)\.png/.test(s.label || '');
  const shortName = (s) => {
    const m = (s.label || '').match(/\/(leader|bb|sbb|ubb|extra)\.png/);
    return m ? { leader: 'Leader', bb: 'BB', sbb: 'SBB', ubb: 'UBB', extra: 'Extra' }[m[1]] : '';
  };

  let custom = null; // fenêtre « Évolution » (contenu prêt à afficher)
  function renderPop(d, A) {
    if (custom !== null) {
      if (lastPop !== 'custom:' + custom) { lastPop = 'custom:' + custom; popEl.innerHTML = custom; }
      popEl.classList.add('on');
      return;
    }
    const s = d.skills.find((k) => k.i === openSkill);
    const key = s ? JSON.stringify(s) : '';
    if (key !== lastPop) {
      lastPop = key;
      if (s) {
        const head = isWide(s)
          ? `<div class="bar" style="background-image:url('${esc(s.label)}')"><b class="ol gold">${esc(s.name)}</b>${s.level ? `<small class="ol">${esc(s.level)}</small>` : ''}</div>`
          : `<div class="bar badge">${s.label ? `<img src="${esc(s.label)}" alt="">` : ''}<b class="ol gold">${esc(s.name)}</b>${s.level ? `<small class="ol">${esc(s.level)}</small>` : ''}</div>`;
        const parts = String(s.text || '').split(/\s+·\s+/).filter(Boolean);
        popEl.innerHTML = `<div class="card">${head}${s.sub ? `<div class="sub ol">${esc(s.sub)}</div>` : ''}${parts.length > 1 ? `<ul>${parts.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : `<p>${esc(s.text)}</p>`}
          <div class="gbtn x" data-a="close" style="background-image:url('${A}common/button/sub_ss_btn1.png')"><span class="ol">Fermer</span></div></div>`;
      }
    }
    popEl.classList.toggle('on', !!s);
  }

  function render(d) {
    const A = d.assets || ASSETS_FALLBACK;
    const key = JSON.stringify(d);
    if (key !== lastKey) {
      lastKey = key;
      wrapEl.style.backgroundImage = `url('${A}common/base.jpg')`;
      const fuseOk = d.fuseOk, evoOk = d.form ? !!d.form.e : !d.omni;
      const rarity = d.rarityImg ? `<img src="${esc(d.rarityImg)}" alt="${esc(d.rarityText)}">` : (d.stars ? `<span class="gold">${esc(d.stars)}</span>` : '');
      const [lvNow, lvMax] = (d.lv || '').split('/');
      const val = (t, cls) => `<span class="val ol${cls ? ' ' + cls : ''}">${esc(t)}</span>`;
      const btn = (a, label, off, title) => `<div class="gbtn${off ? ' off' : ''}" data-a="${a}" title="${esc(title || '')}" style="background-image:url('${A}common/button/sub_ss_btn1.png')"><span class="ol">${esc(label)}</span></div>`;
      const n = d.skills.length;
      const nB = d.skills.filter(isBurst).length || 1, nA = (n - d.skills.filter(isBurst).length) || 1;
      scrollEl.innerHTML = `<div class="top">
          <div class="back" data-a="back" title="Retour" style="background-image:url('${A}header/header_title_btn1.png')"></div>
          <div class="plate" style="background-image:url('${A}header/header_title_base.png')">
            <div class="name ol">${esc(d.name)}</div>
            <div class="meta ol">${d.element ? `<img src="${esc(d.element)}" alt="">` : ''}<span>${esc(d.no)}</span>${rarity}</div></div>
          ${d.hasFavBtn ? `<div class="star${d.fav ? '' : ' off'}" data-a="fav" title="Favori">${d.fav ? '★' : '☆'}</div>` : '<div class="star" style="visibility:hidden"></div>'}
        </div>
        <div class="hero">
          ${d.art ? `<img src="${esc(d.art)}" alt="">` : ''}
          <div class="arrow l ol" data-a="prev" title="Unité précédente">◀</div>
          <div class="arrow r ol" data-a="next" title="Unité suivante">▶</div>
          <div class="chips">
            ${d.type ? pill(A, { cls: 'small', icon: d.typeIcon, html: val(d.type, 'gold'), attr: ' data-a="type"' }) : ''}
            ${d.cost ? pill(A, { cls: 'small', icon: d.costIcon, html: val(d.cost) }) : ''}
            ${d.sp ? pill(A, { cls: 'small', icon: d.spIcon, html: val(d.sp) }) : ''}
          </div>
        </div>
        <div class="block">
          <div class="lvrow">
            ${pill(A, { icon: d.lvIcon, html: val((lvNow || '').trim() + ' / ' + (lvMax || '').trim()) })}
            <div class="exp" style="background-image:url('${A}unit_mix/unit_mix_bar_base.png');--p:${Math.max(0, Math.min(100, d.exp))}%">
              <i style="background-image:url('${A}unit_mix/unit_mix_bar_gauge.png')"></i>
              <b class="ol">${d.next && !/^-+$/.test(d.next) ? esc(d.next) : 'MAX'}</b></div>
          </div>
          <div class="stats">${d.stats.map((s) => `<div class="stat">${pill(A, { icon: s.icon, html: val(s.value) })}${s.bonus ? pill(A, { up: true, cls: 'bonus', html: val('+' + s.bonus, 'gold') }) : ''}</div>`).join('')}</div>
          ${d.spheres.length ? `<div class="spheres">${d.spheres.map((s) => `<div class="sph" data-a="sphere" data-i="${s.i}">
              <div class="fr0" style="background-image:url('${A}common/skill_frame_bg.png')">${s.icon ? `<img src="${esc(s.icon)}" alt="">` : ''}<i style="background-image:url('${A}common/skill_frame_0.png')"></i></div>
              ${pill(A, { html: val(s.name || 'Vide') })}</div>`).join('')}</div>` : ''}
        </div>
        <div class="actions">
          ${btn('fusion', 'Améliorer', !fuseOk, fuseOk ? '' : 'Niveau, imps et compétences au maximum')}
          ${btn('evolve', 'Évoluer', !evoOk, evoOk ? (d.form && typeof d.form.e === 'string' ? 'Il faut : ' + d.form.e : '') : 'Forme finale')}
          ${d.hasHelper ? btn('helper', d.helper ? 'Aide ✓' : 'Aide') : ''}
          ${d.switchBtn ? btn('switch', 'Changer') : ''}
        </div>
        ${n ? `<div class="skills">${d.skills.map((s) => `<div class="sk" data-a="skill" data-i="${s.i}" title="${esc(s.text)}" style="grid-column:span ${6 / (isBurst(s) ? nB : nA)}">
            <div class="lb${isWide(s) ? ' wide' : ''}" style="background-image:url('${esc(s.label)}')"></div>
            <b class="ol gold">${esc(s.name || shortName(s))}</b>${s.level ? `<small class="ol">${esc(s.level)}</small>` : ''}</div>`).join('')}</div>` : ''}`;
    }
    renderPop(d, A);
  }

  root.addEventListener('click', (e) => {
    if (e.target === popEl) { closePop(); return; }
    const el = e.target.closest('[data-a]');
    if (!el) return;
    const a = el.dataset.a;
    if (a === 'skill') { openSkill = +el.dataset.i; schedule(); return; }
    if (a === 'close') { closePop(); return; }
    if (a === 'evolve' && !el.classList.contains('off') && window.rbfData) { openEvolution(); return; }
    if (a === 'goevolve') { closePop(); act('evolve'); return; }
    if (a === 'sphere' && window.rbfData) { openSphere(+el.dataset.i); return; }
    if (a === 'gosphere') { closePop(); act('sphere', el.dataset.i); return; }
    if (a === 'farm') { closePop(); window.rbfData.farm(el.dataset.m); return; }
    act(a, el.dataset.i);
  });
  function closePop() { openSkill = -1; custom = null; lastPop = ''; schedule(); }
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && (openSkill >= 0 || custom !== null)) closePop(); });

  // ───────── Évolution guidée : matériaux, meilleur endroit pour les farmer, bouton Farmer ─────────
  const AREA_FR = { story: 'Aventure', vortex: 'Vortex', trial: 'Épreuve' };
  function sourceLine(src) {
    if (!src) return '<small class="none">Aucune source connue</small>';
    if (src.kind === 'drop' || src.kind === 'capture') {
      const i = src.info || {};
      const pct = src.chance >= 99.5 ? '100 %' : (Math.round((src.chance || 0) * 10) / 10).toLocaleString('fr-BE') + ' %';
      return `<small>${src.kind === 'capture' ? 'Capture' : 'Drop'} ${pct} · <b>${esc(i.name)}</b> · ${esc(i.dungeon)}${i.area && i.area !== i.dungeon ? ' (' + esc(i.area) + ')' : ''} · ${AREA_FR[i.areaType] || ''} · ${i.energy || 0} énergie</small>`;
    }
    const k = { summon: 'Invocation', 'merit-exchange': 'Boutique du mérite', 'level-up': 'Récompense de niveau joueur', craft: 'Fabrication', 'first-clear': 'Première victoire', evolution: 'Évolution', 'hunter-rank': 'Rang de chasseur' }[src.kind] || src.kind;
    return `<small>${esc(k)}${src.info ? ' · ' + esc(src.info.name) : ''}${src.level ? ' · niv. ' + src.level : ''}${src.cost ? ' · ' + src.cost + ' mérites' : ''}</small>`;
  }
  async function openSphere(i) {
    const d = read();
    const sp = d && d.spheres[i];
    if (!sp) return;
    const A = d.assets || ASSETS_FALLBACK;
    const shell = (body) => `<div class="card evo"><div class="bar badge">${sp.icon ? `<img src="${esc(sp.icon)}" alt="">` : ''}<b class="ol gold">${esc(sp.name || 'Sphère')}</b></div>${body}
      <div class="row2"><div class="gbtn" data-a="gosphere" data-i="${i}" style="background-image:url('${A}common/button/sub_ss_btn1.png')"><span class="ol">Changer</span></div>
      <div class="gbtn" data-a="close" style="background-image:url('${A}common/button/sub_ss_btn1.png')"><span class="ol">Fermer</span></div></div></div>`;
    if (!sp.name || /^vide$/i.test(sp.name)) { custom = shell('<p>Aucune sphère équipée.</p>'); schedule(); return; }
    custom = shell('<p>Chargement des données…</p>');
    schedule();
    try {
      const I = await window.rbfData.index();
      const s = await window.rbfData.findSphere(sp.name, sp.icon);
      if (!s) { custom = shell('<p>Sphère introuvable dans les données du jeu.</p>'); schedule(); return; }
      const fx = s.description ? [s.description] : await window.rbfData.effectsText(s.effects);
      const src = await window.rbfData.whereToGet(s.id);
      const lines = src.slice(0, 4).map((x) => {
        if (x.kind === 'craft') {
          const mats = (x.materials || []).map((m) => m.count + '× ' + window.rbfData.nameOf(I, m.id)).join(', ');
          return `<li><div class="t"><b class="ol">Forge des sphères</b><small>Niveau ${x.level || 1}${x.karma ? ' · ' + Number(x.karma).toLocaleString('fr-BE') + ' karma' : ''}${mats ? ' · ' + esc(mats) : ''}</small></div></li>`;
        }
        const farmable = x.kind === 'drop' || x.kind === 'capture';
        return `<li><div class="t">${sourceLine(x)}</div>${farmable ? `<div class="gbtn mini" data-a="farm" data-m="${x.mission}" style="background-image:url('${A}common/button/sub_ss_btn1.png')"><span class="ol">Farmer</span></div>` : ''}</li>`;
      });
      const kind = { signature: 'Sphère signature', 'all-stat': 'Sphère de stats', typed: s.type || 'Sphère' }[s.kind] || s.type || '';
      custom = shell(`<div class="sub ol">${esc(s.name)}${s.rarity ? ' · ' + s.rarity + '★' : ''}${kind ? ' · ' + esc(kind) : ''}${s.signatureUnit ? ' · pour ' + esc(window.rbfData.nameOf(I, s.signatureUnit)) : ''}</div>
        <ul>${fx.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
        ${lines.length ? `<div class="sub ol">Où l'obtenir</div><ul class="mats">${lines.join('')}</ul>` : ''}`);
    } catch (err) {
      custom = shell('<p>Données du jeu indisponibles pour le moment.</p>');
    }
    schedule();
  }

  async function openEvolution() {
    const d = read();
    if (!d) return;
    const A = d.assets || ASSETS_FALLBACK;
    const shell = (body) => `<div class="card evo"><div class="bar badge"><b class="ol gold">Évolution</b></div>${body}
      <div class="row2"><div class="gbtn" data-a="goevolve" style="background-image:url('${A}common/button/sub_ss_btn1.png')"><span class="ol">Évoluer</span></div>
      <div class="gbtn" data-a="close" style="background-image:url('${A}common/button/sub_ss_btn1.png')"><span class="ol">Fermer</span></div></div></div>`;
    custom = shell('<p>Chargement des données…</p>');
    schedule();
    try {
      const I = await window.rbfData.index();
      const f = I.formByName[(d.name || '').toLowerCase()];
      const ev = f && f.evolution;
      if (!ev) { custom = shell('<p>Pas de données d\'évolution pour cette unité.</p>'); schedule(); return; }
      const next = I.unit[f.unit] && I.unit[f.unit].forms[f.step + 1];
      const mats = (ev.units || []).map((x) => ({ id: x.unit, count: x.count })).concat((ev.items || []).map((x) => ({ id: x.item, count: x.count })));
      const rows = await Promise.all(mats.map(async (m) => {
        const src = await window.rbfData.whereToGet(m.id);
        const best = src[0];
        const farmable = best && (best.kind === 'drop' || best.kind === 'capture');
        return `<li><div class="t"><b class="ol">${m.count}× ${esc(window.rbfData.nameOf(I, m.id))}</b>${sourceLine(best)}</div>
          ${farmable ? `<div class="gbtn mini" data-a="farm" data-m="${best.mission}" style="background-image:url('${A}common/button/sub_ss_btn1.png')"><span class="ol">Farmer</span></div>` : ''}</li>`;
      }));
      custom = shell(`<div class="sub ol">${next ? '→ ' + esc(next.name) + (next.rarity ? ' · ' + (next.rarity === 'omni' ? 'Omni' : next.rarity + '★') : '') : ''}${ev.zel ? ' · ' + Number(ev.zel).toLocaleString('fr-BE') + ' Zel' : ''}</div>
        <ul class="mats">${rows.join('')}</ul>`);
    } catch (err) {
      custom = shell('<p>Données du jeu indisponibles pour le moment.</p>');
    }
    schedule();
  }


  // ───────── BB, SBB et UBB : le jeu ne les montre que dans sa fenêtre de détail ─────────
  // On l'ouvre une fois en invisible pour chaque compétence, on lit tout, puis on la referme.
  const details = new Map();
  let silent = false;
  const hideStyle = document.createElement('style');
  hideStyle.textContent = 'html.rbf-silent [class*="unit-info-module__"][class*="__panels"]{visibility:hidden!important;pointer-events:none!important}';
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitFor(fn, ms) { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await wait(40); } return null; }
  const panelsOpen = () => { const p = $(U('panels')); return p && p.children.length ? p : null; };
  const LABELS = [[/ultimate/i, 'ubb'], [/super/i, 'sbb'], [/leader/i, 'leader'], [/extra/i, 'extra'], [/brave|burst/i, 'bb']];
  async function prefetch(id) {
    details.set(id, null);
    if (!hideStyle.isConnected) document.head.appendChild(hideStyle);
    silent = true;
    document.documentElement.classList.add('rbf-silent');
    const out = [];
    try {
      const rows = $$(U('skillRow'));
      for (let i = 0; i < rows.length; i++) {
        if (currentUnitId() !== id) break;
        if (panelsOpen()) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await waitFor(() => !panelsOpen(), 800); }
        rows[i].click();
        const p = await waitFor(panelsOpen, 1500);
        const list = [];
        if (p) {
          await wait(60);
          $$('article', p).forEach((a) => {
            const label = txt($('[class*="__panelLabel"]', a));
            const h = $('h2', a); let name = '';
            if (h) { const c = h.cloneNode(true); c.querySelectorAll('[class*="__repeat"]').forEach((e) => e.remove()); name = txt(c); }
            const sub = txt($('header p', a));
            const k = (LABELS.find(([re]) => re.test(label)) || [null, ''])[1];
            list.push({ kindKey: k, labelText: label, name, sub, text: txt($('[class*="__panelText"]', a)) });
          });
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          await waitFor(() => !panelsOpen(), 800);
        }
        out[i] = list;
      }
    } catch (e) { /* on garde ce qu'on a */ }
    if (panelsOpen()) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wait(30);
    document.documentElement.classList.remove('rbf-silent');
    silent = false;
    if (currentUnitId() === id) details.set(id, out); else details.delete(id);
    lastKey = '';
    schedule();
  }
  function expandSkills(d) {
    const det = details.get(d.id);
    if (!det) return d.skills;
    const A = d.assets || ASSETS_FALLBACK;
    const res = [];
    d.skills.forEach((s, i) => {
      const list = det[i];
      if (!list || !list.length) { res.push(Object.assign({}, s, { i: res.length })); return; }
      list.forEach((p, j) => {
        const lvl = (p.sub.match(/Lv\.?\s*\d+/i) || [''])[0];
        const label = p.kindKey ? A + 'common/leader_burst_label/' + p.kindKey + '.png' : s.label;
        res.push({ i: res.length, label, name: p.name || (j === 0 ? s.name : ''), level: lvl || (j === 0 ? s.level : ''), sub: p.sub.replace(lvl, '').replace(/^\s*·\s*/, ''), text: p.text || (j === 0 ? s.text : '') });
      });
    });
    return res;
  }

  // Une fenêtre du jeu est ouverte (détails, choix d'aide, sphères…) : on s'efface pour la laisser au-dessus
  function gameDialogOpen() {
    const panels = $(U('panels'));
    if (panels && panels.children.length) return true;
    return $$('[role="dialog"],[aria-modal="true"]').some((e) => e.getBoundingClientRect().width > 0);
  }

  // ───────── Mise à jour ─────────
  let raf = 0;
  function update() {
    raf = 0;
    const page = location.pathname === '/units/info' && $(U('page'));
    if (!page || (!silent && gameDialogOpen())) { host.style.display = 'none'; return; }
    const r = page.getBoundingClientRect();
    if (!r.width || !r.height) { host.style.display = 'none'; return; }
    if (!document.documentElement.contains(host)) document.documentElement.appendChild(host);
    Object.assign(host.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    const d = read();
    if (d) { d.skills = expandSkills(d); if (!silent && d.id && !details.has(d.id)) prefetch(d.id); }
    if (d) render(d);
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };

  const onNav = () => {
    if (location.pathname !== '/units/info') host.style.display = 'none'; // départ : disparaît tout de suite
    openSkill = -1;
    schedule();
  };
  ['pushState', 'replaceState'].forEach((k) => {
    const orig = history[k];
    history[k] = function (...args) { const r = orig.apply(this, args); onNav(); return r; };
  });
  window.addEventListener('popstate', onNav);
  window.addEventListener('resize', schedule);
  new MutationObserver(() => { if (location.pathname.startsWith('/units') || host.style.display !== 'none') schedule(); })
    .observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-pressed', 'src'] });
  setInterval(schedule, 1000);
  loadData();
  schedule();
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
    .gbtn{flex:1;height:42px;background:url('${A}common/button/sub_ss_btn1.png') center/100% 100% no-repeat;display:flex;align-items:center;justify-content:center;
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
  async function openMission(id) {
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
    const allEl = [...new Set([].concat(...m.waves).map((e) => e.element).filter(Boolean))];
    const tipEls = (bossEl.length ? bossEl : allEl).map((e) => BEATS[e]).filter(Boolean);
    const loot = m.loot.slice(0, 18).map((l) => `<span>${l.kind === 'capture' ? '🎯' : '📦'} ${esc(l.name)} <b>${pct(l.chance)}</b></span>`).join('');
    const waves = m.waves.map((w, i) => `<div class="wave"><small>Vague ${i + 1}${w.random ? ' · un groupe au hasard parmi' : ''}</small>${w.map((e) => `
      <div class="en${e.boss ? ' boss' : ''}">${elIcon(e.element)}<span class="n">${e.boss ? '👑 ' : ''}${esc(e.name)}</span><span class="hp">${num(e.hp)} PV</span></div>`).join('')}</div>`).join('');
    show(`<div class="card">
      <div class="head"><h2>${esc(m.name)}</h2><p>${esc(m.dungeon)}${m.area && m.area !== m.dungeon ? ' · ' + esc(m.area) : ''}</p>
        <div class="facts"><span>⚡ ${m.energy} énergie</span><span>⚔️ ${m.battles} combats</span>${m.exp ? `<span>EXP ${num(m.exp)}</span>` : ''}${m.zel ? `<span>Zel ${num(m.zel)}</span>` : ''}${m.karma ? `<span>Karma ${num(m.karma)}</span>` : ''}</div></div>
      <div class="body">
        ${tipEls.length ? `<div class="tip">Conseil : prends des unités ${[...new Set(tipEls)].map((e) => `${elIcon(e)} ${EL_FR[e]}`).join(', ')}${boss.length ? ` contre le boss ${esc(boss[0].name)}` : ''}.</div>` : ''}
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
      b.style.cssText = 'position:absolute;right:6px;top:50%;transform:translateY(-50%);z-index:5;width:30px;height:30px;border-radius:50%;border:0;cursor:pointer;'
        + 'background:rgba(14,11,7,.85);color:#ffd24a;font:bold 17px/30px system-ui,sans-serif;box-shadow:inset 0 0 0 1px rgba(255,210,120,.5),0 2px 5px rgba(0,0,0,.5);padding:0';
      b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openMission(id); }, true);
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
