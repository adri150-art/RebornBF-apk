// Filtre HD : un peu plus de netteté, de contraste et de couleurs sur les images du jeu.
(function () {
  'use strict';
  if (window.__rbfHd) return;
  window.__rbfHd = true;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
  svg.innerHTML = '<filter id="rbfSharpen"><feConvolveMatrix order="3" preserveAlpha="true" ' +
    'kernelMatrix="0 -0.3 0 -0.3 2.2 -0.3 0 -0.3 0"/></filter>';
  document.body.appendChild(svg);

  const FILTER = 'url(#rbfSharpen) contrast(1.07) saturate(1.16) brightness(1.03)';

  function apply() {
    if (!document.body.contains(svg)) document.body.appendChild(svg);
    document.querySelectorAll('canvas').forEach((c) => {
      if (c.width < 120 || c.height < 120) return; // on ignore les petits canvas d'interface
      if (c.style.filter !== FILTER) c.style.filter = FILTER;
    });
  }
  setInterval(apply, 1000);
  apply();
})();
