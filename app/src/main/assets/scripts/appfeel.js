// Style « vraie appli » : pas de surlignage bleu au toucher, pas de sélection de texte
// accidentelle, boutons qui réagissent quand on appuie, défilement propre, petite vibration.
(function () {
  'use strict';
  if (window.__rbfFeel) return;
  window.__rbfFeel = true;

  const css = document.createElement('style');
  css.id = 'rbf-feel';
  css.textContent = `
    html{-webkit-tap-highlight-color:transparent;overscroll-behavior:none;scroll-behavior:smooth}
    body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;
      -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
    input,textarea,select,[contenteditable="true"]{-webkit-user-select:text;user-select:text}
    img{-webkit-user-drag:none;-webkit-touch-callout:none}
    ::-webkit-scrollbar{width:0;height:0;background:transparent}
    button,a[href],[role="button"],summary,label[for]{transition:transform .09s ease,filter .09s ease}
    button:active:not(:disabled),a[href]:active,[role="button"]:active{transform:scale(.965);filter:brightness(1.18)}
    @keyframes rbfIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
    .rbf-in{animation:rbfIn .22s ease-out}`;
  (document.head || document.documentElement).appendChild(css);

  // Petite animation d'entrée à chaque changement d'écran (sauf en combat)
  let last = location.pathname;
  setInterval(() => {
    if (location.pathname === last) return;
    last = location.pathname;
    if (last.startsWith('/battle')) return;
    const main = document.querySelector('main') || document.body.firstElementChild;
    if (!main) return;
    main.classList.remove('rbf-in');
    void main.offsetWidth;
    main.classList.add('rbf-in');
  }, 150);

  // Vibration légère quand on touche un bouton
  document.addEventListener('pointerdown', (e) => {
    const t = e.target && e.target.closest && e.target.closest('button,a[href],[role="button"],canvas');
    if (!t || (t.disabled)) return;
    try { if (window.rbfNative) window.rbfNative.postMessage('tap'); } catch (err) { /* rien */ }
  }, true);
})();
