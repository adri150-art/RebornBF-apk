// Pont entre l'interface de l'appli et Chrome : réglages enregistrés dans le jeu (localStorage).
(function () {
  'use strict';
  if (window.top !== window || window.rbfNative) return;
  const KEY = 'rbf_settings';
  const DEF = { bots: { farm: false, aventure: false }, farm_target: 300,
    opt: { antipause: true, appfeel: true, remaster: true, hd: false, always_x2: true, always_auto: false, notifications: true },
    custom: [] };
  function load() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { s = {}; }
    return { ...DEF, ...s, bots: { ...DEF.bots, ...(s.bots || {}) }, opt: { ...DEF.opt, ...(s.opt || {}) },
      custom: Array.isArray(s.custom) ? s.custom : [] };
  }
  window.__rbfSettings = load();
  window.rbfNative = {
    platform: 'chrome',
    settings: () => JSON.parse(JSON.stringify(load())),
    save: (s, url) => {
      try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* rien */ }
      if (url) location.assign(url); else location.reload();
    },
    action: (a) => {
      if (a === 'back') history.back();
      else if (a === 'reload') location.reload();
      else if (a === 'fullscreen') {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(() => {});
      }
    },
    postMessage: (m) => {
      m = String(m || '');
      if (!m.startsWith('notify:') || !window.__rbfSettings.opt.notifications || !('Notification' in window)) return;
      if (Notification.permission === 'granted') new Notification('Reborn BF', { body: m.slice(7) });
      else if (Notification.permission !== 'denied') Notification.requestPermission();
    },
  };
  // Ctrl+M : menu rapide · Ctrl+, : bots & réglages
  document.addEventListener('keydown', (e) => {
    if (!e.ctrlKey || !window.__rbfUI) return;
    if (e.key.toLowerCase() === 'm') { e.preventDefault(); window.__rbfUI.quick(); }
    else if (e.key === ',') { e.preventDefault(); window.__rbfUI.settings(); }
  }, true);
})();
