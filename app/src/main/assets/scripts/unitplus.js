// Fiche d'unité « remaster » : une nouvelle fiche moderne affichée par-dessus celle du jeu.
// Elle reprend les images du jeu (illustration, icônes, étiquettes) et toutes les infos de la fiche
// d'origine, et actionne les boutons du jeu (favori, aide, sphères, unité suivante…) quand on la touche.
// Les fenêtres du jeu (détails de compétence, choix d'aide…) repassent au-dessus quand elles s'ouvrent.
(function () {
  'use strict';
  if (window.__rbfUnitPlus) return;
  window.__rbfUnitPlus = true;

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
      else if (/\/lv\.png/.test(label)) d.lv = value;
      else if (/next\.png/.test(label)) d.next = value;
      else if (/__exp(\s|$)/.test(row.className)) {
        const f = $(U('expFill'), row);
        d.exp = f ? parseFloat(f.style.width) || 0 : 0;
      } else if (/__statRow/.test(row.className)) {
        const bonus = $('[class*="__bonus"] [class*="__value"]', row);
        d.stats.push({ icon: label, value: txt($('dd', row)) || value, bonus: txt(bonus) });
      }
    });
    if (!d.lv) { const m = txt($(U('left'))).match(/(\d+)\s*\/\s*(\d+)/); if (m) d.lv = m[0]; }
    $$(U('sphere')).filter((e) => e.tagName === 'BUTTON').forEach((b, i) => {
      d.spheres.push({ i, icon: imgOf($(U('sphereIcon'), b)), name: txt($(U('sphereName'), b)) || txt(b) });
    });
    $$(U('plate')).forEach((p) => {
      const l = $$('img', p).map((i) => i.currentSrc || i.src).find((src) => /status_char/.test(src)) || '';
      if (/cost\.png/.test(l)) d.cost = txt(p);
      else if (/sp\.png/.test(l)) d.sp = txt(p);
    });
    $$(U('skillRow')).forEach((s, i) => {
      const eff = $(U('skillEffects'), s);
      let text = '';
      if (eff) { const c = eff.cloneNode(true); c.querySelectorAll('[class*="__repeat"]').forEach((e) => e.remove()); text = txt(c); }
      const lab = $$('img', s).map((im) => im.currentSrc || im.src).find((src) => /leader_burst_label|label/.test(src)) || imgOf(s);
      d.skills.push({ i, kind: skillKind(lab), name: txt($(U('skillName'), s)), level: txt($(U('skillLevel'), s)), text });
    });
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
  function canFuse(d) {
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
  host.id = 'rbf-unit-remaster';
  host.style.cssText = 'position:fixed;z-index:40;display:none;overflow:hidden';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    :host{all:initial}
    *{box-sizing:border-box;margin:0}
    .wrap{position:absolute;inset:0;overflow:hidden;color:#eef1f8;font:14px/1.35 "Segoe UI Variable","Segoe UI",system-ui,sans-serif;
      background:#0b0d16;-webkit-tap-highlight-color:transparent;user-select:none}
    .bg{position:absolute;inset:-40px;background-size:cover;background-position:center;filter:blur(26px) saturate(1.3) brightness(.42);transform:scale(1.1)}
    .shade{position:absolute;inset:0;background:radial-gradient(120% 70% at 50% 28%,rgba(11,13,22,0) 0%,rgba(11,13,22,.55) 60%,#0b0d16 100%)}
    .scroll{position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;scrollbar-width:none;padding-bottom:16px}
    .scroll::-webkit-scrollbar{display:none}
    .lilita{font-family:"Lilita One","Lilita One Fallback",system-ui,sans-serif;letter-spacing:.3px;font-weight:400}
    .top{position:sticky;top:0;z-index:3;display:flex;align-items:center;gap:10px;padding:10px 12px;
      background:linear-gradient(180deg,rgba(11,13,22,.92),rgba(11,13,22,.6) 70%,rgba(11,13,22,0))}
    .round{flex:none;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;
      background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(8px);font-size:20px;color:#fff;
      transition:background .15s,transform .1s}
    .round:hover{background:rgba(255,255,255,.16)}.round:active{transform:scale(.92)}
    .title{flex:1;min-width:0}
    .title .name{font-size:21px;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 2px 8px rgba(0,0,0,.6)}
    .title .meta{display:flex;align-items:center;gap:6px;margin-top:3px;color:#aeb4c4;font-size:12px}
    .title .meta img{height:16px}
    .star{color:#ffcf4a}.star.off{color:rgba(255,255,255,.5)}
    .hero{position:relative;height:var(--hero,330px);margin-top:-58px;display:flex;align-items:flex-end;justify-content:center;pointer-events:none}
    .hero > img{max-width:124%;max-height:114%;object-fit:contain;filter:drop-shadow(0 14px 28px rgba(0,0,0,.6));
      animation:float 6s ease-in-out infinite;transform-origin:50% 90%}
    @keyframes float{0%,100%{transform:translateY(0) scale(1.06)}50%{transform:translateY(-6px) scale(1.06)}}
    .pager{position:absolute;top:50%;margin-top:-19px;pointer-events:auto}
    .pager.l{left:10px}.pager.r{right:10px}
    .chipsTop{position:absolute;left:12px;bottom:10px;display:flex;gap:6px;pointer-events:auto}
    .chip{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:14px;font-size:12.5px;font-weight:600;
      background:rgba(11,13,22,.62);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(8px);white-space:nowrap;cursor:default}
    .chip[data-a]{cursor:pointer}
    .chip img{height:13px}
    .chip.gold{border-color:rgba(240,176,60,.55);color:#ffd36b}
    .card{margin:10px 12px 0;padding:12px;border-radius:16px;background:rgba(20,23,34,.78);border:1px solid rgba(255,255,255,.08);
      backdrop-filter:blur(14px);box-shadow:0 10px 28px rgba(0,0,0,.35)}
    .lvl{display:flex;align-items:center;gap:10px}
    .lvl .big{font-size:22px;line-height:1;white-space:nowrap}
    .lvl .big small{font-size:13px;color:#aeb4c4;margin-left:3px}
    .bar{flex:1;height:8px;border-radius:4px;background:rgba(255,255,255,.08);overflow:hidden}
    .bar i{display:block;height:100%;border-radius:4px;background:linear-gradient(90deg,#3fa8ff,#8be6ff);box-shadow:0 0 10px rgba(90,190,255,.6)}
    .lvl .next{font-size:11.5px;color:#8e95a8;white-space:nowrap}
    .stats{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
    .stat{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.06)}
    .stat img{height:18px;flex:none}
    .stat b{font-size:17px;font-variant-numeric:tabular-nums;margin-left:auto}
    .stat em{font-style:normal;font-size:11.5px;color:#ffcf6b;font-weight:700;margin-left:4px}
    .row2{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}
    .sph{display:flex;align-items:center;gap:8px;flex:1;min-width:140px;padding:8px 10px;border-radius:12px;cursor:pointer;
      background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.06);transition:background .15s}
    .sph:hover{background:rgba(255,255,255,.09)}
    .sph img{width:24px;height:24px;object-fit:contain}
    .sph span{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .sph.empty span{color:#7d8496}
    .actions{display:grid;gap:8px;margin:12px 12px 0}
    .btn{height:58px;border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;cursor:pointer;
      background:rgba(20,23,34,.82);border:1px solid rgba(255,255,255,.1);backdrop-filter:blur(12px);transition:transform .1s,background .15s,border-color .15s}
    .btn:hover{background:rgba(32,36,50,.9)}.btn:active{transform:scale(.95)}
    .btn i{font-style:normal;font-size:19px;line-height:1}
    .btn span{font-size:11.5px;font-weight:700;color:#dfe3ee}
    .btn.on{border-color:rgba(240,176,60,.6);background:linear-gradient(180deg,rgba(240,176,60,.2),rgba(240,176,60,.06))}
    .btn.primary{background:linear-gradient(180deg,#ffd36b,#e9a12c);border-color:#ffd36b}
    .btn.primary span,.btn.primary i{color:#2a1a04}
    .btn.primary.blue{background:linear-gradient(180deg,#5aa9ff,#2f6fe0);border-color:#7ab8ff}
    .btn.primary.blue span,.btn.primary.blue i{color:#fff}
    .btn.off{filter:grayscale(1) brightness(.6)}
    .skills{margin:12px 12px 0;display:flex;flex-direction:column;gap:8px}
    .skill{padding:11px 12px;border-radius:14px;background:rgba(20,23,34,.82);border:1px solid rgba(255,255,255,.08);backdrop-filter:blur(12px);cursor:pointer}
    .skill .h{display:flex;align-items:center;gap:8px}
    .tag{flex:none;font-size:10.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;padding:3px 8px;border-radius:8px;color:#fff}
    .tag.ls{background:linear-gradient(180deg,#ff8a3d,#d9531e)}
    .tag.bb{background:linear-gradient(180deg,#4f9bff,#2560d8)}
    .tag.sbb{background:linear-gradient(180deg,#b06bff,#6d35d8)}
    .tag.ubb{background:linear-gradient(180deg,#ff5a7a,#c42150)}
    .tag.es{background:linear-gradient(180deg,#3cc98a,#1f8f5d)}
    .skill .h b{flex:1;min-width:0;font-size:15px;color:#ffd36b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .skill .h small{font-size:12px;color:#aeb4c4;font-weight:700}
    .skill p{margin-top:6px;font-size:12.5px;color:#cfd4e2;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
    .skill.open p{-webkit-line-clamp:unset;display:block}
    .skill .more{display:block;margin-top:4px;font-size:11px;color:#7d8496}
  </style>
  <div class="wrap"><div class="bg"></div><div class="shade"></div><div class="scroll"></div></div>`;
  const bgEl = root.querySelector('.bg');
  const scrollEl = root.querySelector('.scroll');
  const openSkills = new Set();
  let lastKey = '';
  let lastId = null;

  function render(d) {
    const key = JSON.stringify(d) + '|' + [...openSkills].join(',') + '|' + host.clientHeight;
    if (key === lastKey) return;
    lastKey = key;
    const keepScroll = lastId === d.id ? scrollEl.scrollTop : 0;
    lastId = d.id;
    bgEl.style.backgroundImage = d.art ? `url("${d.art}")` : '';
    const fuseOk = canFuse(d), evoOk = !d.omni;
    const rarity = d.rarityImg ? `<img src="${esc(d.rarityImg)}" alt="${esc(d.rarityText)}">` : (d.stars ? `<span style="color:#ffcf4a">${esc(d.stars)}</span>` : '');
    const [lvNow, lvMax] = (d.lv || '').split('/');
    const heroH = Math.round(Math.min(400, Math.max(240, host.clientHeight * 0.5)));
    scrollEl.innerHTML = `<div class="top">
        <div class="round" data-a="back" title="Retour">‹</div>
        <div class="title"><div class="name lilita">${esc(d.name)}</div>
          <div class="meta">${d.element ? `<img src="${esc(d.element)}" alt="">` : ''}<span>${esc(d.no)}</span>${rarity}</div></div>
        ${d.hasFavBtn ? `<div class="round star${d.fav ? '' : ' off'}" data-a="fav" title="Favori">${d.fav ? '★' : '☆'}</div>` : ''}
      </div>
      <div class="hero" style="--hero:${heroH}px">
        ${d.art ? `<img src="${esc(d.art)}" alt="">` : ''}
        <div class="round pager l" data-a="prev" title="Unité précédente">‹</div>
        <div class="round pager r" data-a="next" title="Unité suivante">›</div>
        <div class="chipsTop">
          ${d.type ? `<span class="chip" data-a="type"><img src="${esc(d.typeIcon)}" alt="">${esc(d.type)}</span>` : ''}
          ${d.cost ? `<span class="chip gold">Coût ${esc(d.cost)}</span>` : ''}
          ${d.sp ? `<span class="chip">SP ${esc(d.sp)}</span>` : ''}
        </div>
      </div>
      <div class="card">
        <div class="lvl"><div class="big lilita">Lv ${esc((lvNow || '').trim())}<small>/ ${esc((lvMax || '').trim())}</small></div>
          <div class="bar"><i style="width:${Math.max(0, Math.min(100, d.exp))}%"></i></div>
          <div class="next">${d.next && !/^-+$/.test(d.next) ? 'Suivant ' + esc(d.next) : 'MAX'}</div></div>
        <div class="stats">${d.stats.map((s) => `<div class="stat"><img src="${esc(s.icon)}" alt=""><b>${esc(s.value)}</b>${s.bonus ? `<em>+${esc(s.bonus)}</em>` : ''}</div>`).join('')}</div>
        ${d.spheres.length ? `<div class="row2">${d.spheres.map((s) => `<div class="sph${/^(vide|empty|-*)$/i.test(s.name) ? ' empty' : ''}" data-a="sphere" data-i="${s.i}">${s.icon ? `<img src="${esc(s.icon)}" alt="">` : ''}<span>${esc(s.name || 'Vide')}</span></div>`).join('')}</div>` : ''}
      </div>
      <div class="actions">
        <div class="btn primary${fuseOk ? '' : ' off'}" data-a="fusion" title="${fuseOk ? '' : 'Niveau et compétences au maximum'}"><i>⬆</i><span>Améliorer</span></div>
        <div class="btn primary blue${evoOk ? '' : ' off'}" data-a="evolve" title="${evoOk ? '' : 'Forme finale'}"><i>✦</i><span>Évoluer</span></div>
        ${d.hasHelper ? `<div class="btn${d.helper ? ' on' : ''}" data-a="helper"><i>🤝</i><span>${d.helper ? 'Aide ✓' : 'Aide'}</span></div>` : ''}
        ${d.switchBtn ? `<div class="btn" data-a="switch"><i>⇄</i><span>Changer</span></div>` : ''}
      </div>
      <div class="skills">${d.skills.map((s) => `<div class="skill${openSkills.has(s.i) ? ' open' : ''}" data-a="skill" data-i="${s.i}">
          <div class="h"><span class="tag ${s.kind[1]}">${esc(s.kind[0])}</span><b class="lilita">${esc(s.name)}</b>${s.level ? `<small>${esc(s.level)}</small>` : ''}</div>
          <p>${esc(s.text)}</p>${s.text.length > 120 ? `<span class="more">${openSkills.has(s.i) ? 'Réduire' : 'Tout afficher'}</span>` : ''}</div>`).join('')}</div>`;
    const n = scrollEl.querySelectorAll('.actions .btn').length;
    scrollEl.querySelector('.actions').style.gridTemplateColumns = `repeat(${n},1fr)`;
    if (keepScroll) scrollEl.scrollTop = keepScroll;
  }

  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-a]');
    if (!el) return;
    const a = el.dataset.a;
    if (a === 'skill') {
      const i = +el.dataset.i;
      if (openSkills.has(i)) openSkills.delete(i); else openSkills.add(i);
      schedule();
      return;
    }
    act(a, el.dataset.i);
  });

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
    if (!page || gameDialogOpen()) { host.style.display = 'none'; return; }
    const r = page.getBoundingClientRect();
    if (!r.width || !r.height) { host.style.display = 'none'; return; }
    if (!document.documentElement.contains(host)) document.documentElement.appendChild(host);
    Object.assign(host.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    const d = read();
    if (d) render(d);
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };

  const onNav = () => {
    if (location.pathname !== '/units/info') host.style.display = 'none'; // départ : disparaît tout de suite
    openSkills.clear();
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
  schedule();
})();
