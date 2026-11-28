// Performance : la carte graphique est mise en mode « performances » pour le jeu. Image d'origine, aucun filtre.
(function () {
  'use strict';
  if (window.__rbfPerf) return;
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, opts) {
    if (/webgl/i.test(String(type))) opts = Object.assign({}, opts, { powerPreference: 'high-performance' });
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
    info() {
      const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
      let gl = '';
      if (cv) { try { gl = cv.getContext('webgl2') ? 'WebGL2' : cv.getContext('webgl') ? 'WebGL' : '2D'; } catch (e) { gl = '?'; } }
      return `${fps} images/s` + (cv ? ` · zone de jeu ${cv.width}×${cv.height} (${gl})` : ' · pas de zone de jeu');
    },
  };
})();
