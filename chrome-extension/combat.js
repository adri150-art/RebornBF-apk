(function(){if(window.top!==window)return;var S=window.__rbfSettings;if(!S||!(true))return;
(function __rbfRun(){if(document.readyState==='loading'||!document.body){document.addEventListener('DOMContentLoaded',__rbfRun,{once:true});return;}
try{
// Combat : remet AUTO et/ou x2 tout seul à chaque combat, et « Turbo » accélère encore le combat (réglable dans l'appli).
(function () {
  'use strict';
  if (window.__rbfCombat) return;
  window.__rbfCombat = true;

  const WANT_AUTO = !!window.__rbfSettings.opt.always_auto;
  const WANT_X2 = !!window.__rbfSettings.opt.always_x2;
  const TURBO = (window.__rbfSettings.opt.turbo2?2:window.__rbfSettings.opt.turbo15?1.5:1); // 1 = vitesse normale du jeu, sinon multiplicateur (x1,5 à x8) en plus du x2 du jeu
  const HIT_AUTO = { x: 506, y: 494 };   // boutons du combat (coordonnées du jeu)
  const HIT_SPEED = { x: 582, y: 497 };

  let game = null;
  let last = 0;

  // Mode fluide (activé par défaut) : quand une super technique fait trop ramer le combat,
  // on dessine une image sur deux (le combat continue à la même vitesse) et on limite les particules.
  let fluide = true;
  const readFluide = () => { fluide = localStorage.getItem('rbf_fluide') !== '0'; };
  readFluide();
  const inBattle = () => location.pathname.startsWith('/battle');

  function hook() {
    const P = window.Phaser;
    if (!P || !P.Scenes || !P.Scenes.SceneManager || P.__rbfCombatHook) return;
    const update = P.Scenes.SceneManager.prototype.update;
    P.Scenes.SceneManager.prototype.update = function (...a) { game = this.game; return update.apply(this, a); };
    P.__rbfCombatHook = true;
    // Particules : moitié moins par jet, et pas plus de 40 à la fois par effet pendant les combats
    const PE = P.GameObjects && P.GameObjects.Particles && P.GameObjects.Particles.ParticleEmitter;
    if (PE && PE.prototype.emitParticle && !PE.__rbfFluide) {
      const emit = PE.prototype.emitParticle;
      PE.prototype.emitParticle = function (count, x, y) {
        if (fluide && inBattle()) {
          const alive = this.alive ? this.alive.length : 0;
          if (alive > 40) return null;
          if (count > 1) count = Math.ceil(count / 2);
        }
        return emit.call(this, count, x, y);
      };
      PE.__rbfFluide = true;
    }
  }

  // Turbo : on fait avancer le temps du jeu plus vite, seulement pendant les combats.
  // Tout suit le même rythme (animations, attaques, minuteries), donc le combat reste identique, juste plus rapide.
  // Le jeu remet parfois sa boucle à neuf (nouveau combat, pause, retour sur l'appli) : on vérifie à chaque fois
  // que notre accélérateur est toujours branché, et on le rebranche sinon.
  // Niveau choisi en direct depuis le menu ☰ (sans recharger), sinon celui des réglages
  let level = TURBO;
  const readLevel = () => { const v = parseFloat(localStorage.getItem('rbf_turbo')); level = Math.min(2, v > 0 ? v : TURBO); };
  // Le combat doit démarrer à vitesse normale (le chargement accéléré fait planter le niveau) :
  // le Turbo ne s'enclenche que quand le combat est prêt depuis quelques secondes, puis reste jusqu'à la fin.
  const ARM_DELAY = 3000;
  let readySince = 0, armed = false;
  function battleReady() {
    try {
      const s = game && game.scene.getScene('battle');
      return !!(s && s.sys.isActive() && s.controls);
    } catch (e) { return false; }
  }
  function updateArm() {
    if (!location.pathname.startsWith('/battle')) { readySince = 0; armed = false; return; }
    if (armed) return;
    if (!battleReady()) { readySince = 0; return; }
    if (!readySince) readySince = Date.now();
    if (Date.now() - readySince >= ARM_DELAY) armed = true;
  }

  let wrapped = null;
  let lastT = 0, avg = 16.7, heavyUntil = 0, frame = 0;
  function turbo() {
    readLevel();
    readFluide();
    updateArm();
    if (!game || !game.loop || typeof game.loop.callback !== 'function') return;
    if (game.loop.callback === wrapped) return;
    const cb = game.loop.callback;
    const g = game;
    wrapped = function (time, delta) {
      const battle = inBattle();
      const dd = level > 1 && armed && battle ? Math.min(delta, 50) * level : delta;
      return cb.call(this, time, dd);
    };
    game.loop.callback = wrapped;
  }

  // Allègement des effets : le jeu sait déjà limiter les sparks et les cristaux affichés (réglages du jeu,
  // « sparkDisplayLimit » 50 et « dropDisplayLimit » 500 par défaut). On baisse ces limites pendant le combat seulement,
  // sans toucher aux réglages enregistrés du compte : les super techniques gardent leurs effets.
  // rbf_fx : 0 = comme le jeu · 1 = réduit (par défaut) · 2 = minimum
  const FX = {
    1: { sparkDisplayLimit: 12, dropDisplayLimit: 30 },
    2: { sparkDisplayLimit: 4, dropDisplayLimit: 8, backgroundEffects: false },
  };
  function lighten(s) {
    if (typeof s.setOptions !== 'function' || !s.options) return;
    const lvl = localStorage.getItem('rbf_fx') || '1';
    const want = FX[lvl];
    if (!want) return;
    const patch = {};
    Object.keys(want).forEach((k) => {
      const cur = s.options[k];
      const v = typeof want[k] === 'number' ? Math.min(want[k], typeof cur === 'number' ? cur : want[k]) : want[k];
      if (cur !== v) patch[k] = v;
    });
    if (Object.keys(patch).length) { try { s.setOptions(patch); } catch (e) { /* rien */ } }
  }

  // Vérification rapide (4 fois par seconde) pour que le turbo démarre dès le début du combat
  setInterval(() => {
    hook(); turbo();
    if (armed || !inBattle()) return;
    try { const sc = game && game.scene.getScene('battle'); if (sc && sc.sys.isActive() && sc.controls) lighten(sc); } catch (e) { /* rien */ }
  }, 250);

  setInterval(() => {
    hook();
    if (!location.pathname.startsWith('/battle')) return;
    let s = null;
    try {
      s = game && game.scene.getScene('battle');
      if (!(s && s.sys.isActive() && s.controls)) s = null;
    } catch (e) { s = null; }
    if (!s) return;
    lighten(s);
    const now = Date.now();
    if (now - last < 2000) return;
    if (WANT_AUTO && !s.controls.auto) { last = now; s.onControl(HIT_AUTO); }
    else if (WANT_X2 && s.controls.speed !== 2) { last = now; s.onControl(HIT_SPEED); }
  }, 1000);
})();

}catch(e){console.error("[RBF] combat",e)}
})();
})();
