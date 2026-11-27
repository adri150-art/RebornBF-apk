// Performance : le jeu dessine moins de pixels (le téléphone n'a plus à remplir un écran en ultra haute définition)
// et la carte graphique est mise en mode « performances ». Réglable dans Bots & réglages → Performance.
// 0 = qualité d'origine · 1 = équilibré (par défaut) · 2 = maximum
(function () {
  'use strict';
  if (window.__rbfPerf) return;
  let lvl = '1';
  try { const v = localStorage.getItem('rbf_perf'); if (v === '0' || v === '1' || v === '2') lvl = v; } catch (e) { /* rien */ }
  const real = window.devicePixelRatio || 1;
  const cap = lvl === '2' ? 1 : lvl === '1' ? 1.5 : 0;
  if (cap && real > cap) {
    try { Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: () => cap }); } catch (e) { /* rien */ }
  }
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, opts) {
    if (lvl !== '0' && /webgl/i.test(String(type))) {
      opts = Object.assign({}, opts, { powerPreference: 'high-performance', desynchronized: true });
      if (lvl === '2') opts.antialias = false;
    }
    return getContext.call(this, type, opts);
  };

  // Mesure des images par seconde, pour le diagnostic (☰ → Test perf)
  let frames = 0, fps = 0, t0 = performance.now();
  const tick = () => {
    frames++;
    const now = performance.now();
    if (now - t0 >= 1000) { fps = Math.round(frames * 1000 / (now - t0)); frames = 0; t0 = now; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.__rbfPerf = {
    level: lvl,
    info() {
      const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
      let gl = '';
      if (cv) { try { gl = cv.getContext('webgl2') ? 'WebGL2' : cv.getContext('webgl') ? 'WebGL' : '2D'; } catch (e) { gl = '?'; } }
      return `${fps} images/s · écran x${real.toFixed(2)} → x${Math.min(real, cap || real).toFixed(2)}`
        + (cv ? ` · zone de jeu ${cv.width}×${cv.height} (${gl})` : ' · pas de zone de jeu') + ` · niveau ${['qualité', 'équilibré', 'maximum'][+lvl]}`;
    },
  };
})();
