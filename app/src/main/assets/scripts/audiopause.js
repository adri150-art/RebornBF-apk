// Coupe le son du jeu quand on quitte l'appli, et le remet au retour.
// On garde une trace des « moteurs audio » créés par le jeu pour pouvoir les mettre en pause.
(function () {
  'use strict';
  if (window.__rbfMute) return;
  const ctxs = new Set();
  ['AudioContext', 'webkitAudioContext'].forEach((k) => {
    const C = window[k];
    if (!C) return;
    const W = function (...a) { const c = new C(...a); ctxs.add(c); return c; };
    W.prototype = C.prototype;
    Object.setPrototypeOf(W, C);
    window[k] = W;
  });
  let muted = false;
  window.__rbfMute = function (off) {
    muted = !!off;
    ctxs.forEach((c) => { try { if (off) c.suspend(); else c.resume(); } catch (e) { /* rien */ } });
    document.querySelectorAll('audio,video').forEach((m) => {
      if (off) { if (!m.paused) { m.__rbfWas = true; m.pause(); } }
      else if (m.__rbfWas) { m.__rbfWas = false; m.play().catch(() => {}); }
    });
  };
  // Un son lancé pendant que l'appli est cachée reste coupé
  document.addEventListener('play', (e) => { if (muted && e.target.pause) { e.target.__rbfWas = true; e.target.pause(); } }, true);
})();
