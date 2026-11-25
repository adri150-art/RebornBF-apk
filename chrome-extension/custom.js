// Scripts ajoutés à la main dans « Mes scripts »
(function () {
  'use strict';
  if (window.top !== window || !window.__rbfSettings) return;
  window.unsafeWindow = window;
  window.GM_addStyle = window.GM_addStyle || function (c) { const s = document.createElement('style'); s.textContent = c; (document.head || document.documentElement).appendChild(s); return s; };
  window.GM_getValue = window.GM_getValue || function (k, d) { try { const v = localStorage.getItem('gm_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  window.GM_setValue = window.GM_setValue || function (k, v) { try { localStorage.setItem('gm_' + k, JSON.stringify(v)); } catch (e) { /* rien */ } };
  const run = () => {
    for (const c of window.__rbfSettings.custom) {
      if (!c || c.on === false) continue;
      try { new Function(String(c.code || ''))(); } catch (e) { console.error('[RBF] ' + (c.name || 'script'), e); }
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true }); else run();
})();
