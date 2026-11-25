(function(){if(window.top!==window)return;var S=window.__rbfSettings;if(!S||!((S.opt.always_x2||S.opt.always_auto)))return;
(function __rbfRun(){if(document.readyState==='loading'||!document.body){document.addEventListener('DOMContentLoaded',__rbfRun,{once:true});return;}
try{
// Combat : remet AUTO et/ou x2 tout seul à chaque combat (réglable dans l'appli).
(function () {
  'use strict';
  if (window.__rbfCombat) return;
  window.__rbfCombat = true;

  const WANT_AUTO = !!window.__rbfSettings.opt.always_auto;
  const WANT_X2 = !!window.__rbfSettings.opt.always_x2;
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

  setInterval(() => {
    hook();
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

}catch(e){console.error("[RBF] combat",e)}
})();
})();
