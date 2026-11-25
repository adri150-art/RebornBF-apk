// Anti-pause : le jeu croit toujours être affiché, même si l'appli passe en arrière-plan
// ou si l'écran est recouvert (notification, autre appli en fenêtre…).
(function () {
  'use strict';
  if (window.__rbfAntiPause) return;
  window.__rbfAntiPause = true;
  try {
    Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get: () => 'visible' });
    Object.defineProperty(Document.prototype, 'webkitHidden', { configurable: true, get: () => false });
    Object.defineProperty(Document.prototype, 'webkitVisibilityState', { configurable: true, get: () => 'visible' });
    Document.prototype.hasFocus = () => true;
  } catch (e) { /* rien */ }
  // Si l'affichage s'arrête (appli en arrière-plan), les images du jeu continuent quand même d'avancer :
  // chaque demande d'image a un filet de secours par minuterie.
  try {
    const raf = window.requestAnimationFrame.bind(window), caf = window.cancelAnimationFrame.bind(window);
    const jobs = new Map();
    let n = 0;
    window.requestAnimationFrame = function (cb) {
      const id = ++n;
      let done = false, r = 0, t = 0;
      const run = (ts) => {
        if (done) return;
        done = true;
        caf(r); clearTimeout(t); jobs.delete(id);
        cb(typeof ts === 'number' ? ts : performance.now());
      };
      r = raf(run);
      t = setTimeout(() => run(performance.now()), 100);
      jobs.set(id, () => { done = true; caf(r); clearTimeout(t); });
      return id;
    };
    window.cancelAnimationFrame = function (id) { const j = jobs.get(id); if (j) { j(); jobs.delete(id); } };
  } catch (e) { /* rien */ }

  const block = (e) => { e.stopImmediatePropagation(); };
  ['visibilitychange', 'webkitvisibilitychange'].forEach((t) => document.addEventListener(t, block, true));
  ['blur', 'pagehide'].forEach((t) => window.addEventListener(t, (e) => { if (e.target === window || e.target === document) block(e); }, true));
})();
