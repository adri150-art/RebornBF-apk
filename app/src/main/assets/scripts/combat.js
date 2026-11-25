// Combat : remet AUTO et/ou x2 tout seul à chaque combat, et « Turbo » accélère encore le combat (réglable dans l'appli).
(function () {
  'use strict';
  if (window.__rbfCombat) return;
  window.__rbfCombat = true;

  const WANT_AUTO = __AUTO__;
  const WANT_X2 = __X2__;
  const TURBO = __TURBO__; // 1 = vitesse normale du jeu, 1.5 ou 2 = encore plus vite (en plus du x2 du jeu)
  const HIT_AUTO = { x: 506, y: 494 };   // boutons du combat (coordonnées du jeu)
  const HIT_SPEED = { x: 582, y: 497 };

  let game = null;
  let last = 0;

  function hook() {
    const P = window.Phaser;
    if (!P || !P.Scenes || !P.Scenes.SceneManager || P.__rbfCombatHook) return;
    const update = P.Scenes.SceneManager.prototype.update;
    P.Scenes.SceneManager.prototype.update = function (...a) { game = this.game; return update.apply(this, a); };
    P.__rbfCombatHook = true;
  }

  // Turbo : on fait avancer le temps du jeu plus vite, seulement pendant les combats.
  // Tout suit le même rythme (animations, attaques, minuteries), donc le combat reste identique, juste plus rapide.
  function turbo() {
    if (TURBO <= 1 || !game || !game.loop || game.loop.__rbfTurbo || typeof game.loop.callback !== 'function') return;
    const cb = game.loop.callback;
    game.loop.callback = function (time, delta) {
      return cb.call(this, time, location.pathname.startsWith('/battle') ? Math.min(delta * TURBO, 100) : delta);
    };
    game.loop.__rbfTurbo = true;
  }

  setInterval(() => {
    hook();
    turbo();
    if (!location.pathname.startsWith('/battle')) return;
    let s = null;
    try {
      s = game && game.scene.getScene('battle');
      if (!(s && s.sys.isActive() && s.controls)) s = null;
    } catch (e) { s = null; }
    if (!s) return;
    const now = Date.now();
    if (now - last < 2000) return;
    if (WANT_AUTO && !s.controls.auto) { last = now; s.onControl(HIT_AUTO); }
    else if (WANT_X2 && s.controls.speed !== 2) { last = now; s.onControl(HIT_SPEED); }
  }, 1000);
})();
