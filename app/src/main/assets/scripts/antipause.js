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
  const block = (e) => { e.stopImmediatePropagation(); };
  ['visibilitychange', 'webkitvisibilitychange'].forEach((t) => document.addEventListener(t, block, true));
  ['blur', 'pagehide'].forEach((t) => window.addEventListener(t, (e) => { if (e.target === window || e.target === document) block(e); }, true));
})();
