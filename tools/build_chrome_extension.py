#!/usr/bin/env python3
"""Construit l'extension Chrome « Reborn BF – Appli » à partir des scripts partagés avec Android.
Usage : python3 tools/build_chrome_extension.py   (sortie : chrome-extension/)"""
import json, os, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS = os.path.join(ROOT, 'app', 'src', 'main', 'assets', 'scripts')
OUT = os.path.join(ROOT, 'chrome-extension')

# (fichier source, nom dans l'extension, condition d'activation, lancé dès le début)
PARTS = [
    ('perf.js', 'perf', 'true', True),
    ('antipause.js', 'antipause', 'S.opt.antipause', True),
    ('appfeel.js', 'appfeel', 'S.opt.appfeel', False),
    ('nav.js', 'nav', 'true', False),
    ('gamedata.js', 'gamedata', 'true', False),
    ('unitplus.js', 'unitplus', 'S.opt.remaster', False),
    ('gameinfo.js', 'gameinfo', 'S.opt.infos', False),
    ('hd.js', 'hd', 'S.opt.hd', False),
    ('combat.js', 'combat', 'true', False),
    ('farm.js', 'farm', 'true', False),
    ('aventure.js', 'aventure', 'S.bots.aventure', True),
]

NATIVE = r"""// Pont entre l'interface de l'appli et Chrome : réglages enregistrés dans le jeu (localStorage).
(function () {
  'use strict';
  if (window.top !== window || window.rbfNative) return;
  const KEY = 'rbf_settings';
  const DEF = { bots: { farm: false, aventure: false }, farm_target: 300,
    opt: { antipause: true, appfeel: true, remaster: true, infos: true, hd: false, always_x2: true, always_auto: false, turbo15: false, turbo2: false, notifications: true },
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
"""

CUSTOM = r"""// Scripts ajoutés à la main dans « Mes scripts »
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
"""

def wrap(code, cond, start, label):
    body = "try{\n" + code + "\n}catch(e){console.error(" + json.dumps('[RBF] ' + label) + ",e)}\n"
    head = "(function(){if(window.top!==window)return;var S=window.__rbfSettings;if(!S||!(" + cond + "))return;\n"
    if start:
        return head + body + "})();\n"
    return head + "(function __rbfRun(){if(document.readyState==='loading'||!document.body){document.addEventListener('DOMContentLoaded',__rbfRun,{once:true});return;}\n" + body + "})();\n})();\n"

def main():
    if os.path.isdir(OUT): shutil.rmtree(OUT)
    os.makedirs(OUT)
    files = ['native.js']
    open(os.path.join(OUT, 'native.js'), 'w').write(NATIVE)
    for src, name, cond, start in PARTS:
        code = open(os.path.join(SCRIPTS, src), encoding='utf-8').read()
        if src == 'combat.js':
            code = code.replace('__AUTO__', '!!window.__rbfSettings.opt.always_auto').replace('__X2__', '!!window.__rbfSettings.opt.always_x2').replace('__TURBO__', '(window.__rbfSettings.opt.turbo2?2:window.__rbfSettings.opt.turbo15?1.5:1)')
        fn = name + '.js'
        open(os.path.join(OUT, fn), 'w', encoding='utf-8').write(wrap(code, cond, start, name))
        files.append(fn)
    ui = open(os.path.join(SCRIPTS, 'ui.js'), encoding='utf-8').read()
    open(os.path.join(OUT, 'ui.js'), 'w', encoding='utf-8').write(wrap(ui, 'true', False, 'interface'))
    files.append('ui.js')
    open(os.path.join(OUT, 'custom.js'), 'w', encoding='utf-8').write(CUSTOM)
    files.append('custom.js')
    shutil.copy(os.path.join(ROOT, 'windows', 'icon.png'), os.path.join(OUT, 'icon.png'))
    manifest = {
        'manifest_version': 3,
        'name': 'Reborn BF – Appli',
        'version': '1.0.0',
        'description': 'Menu rapide, bots, x2 automatique et fiche d’unité remaster pour Reborn BF.',
        'icons': {'128': 'icon.png'},
        'content_scripts': [{
            'matches': ['https://rebornbf.com/*', 'https://*.rebornbf.com/*'],
            'js': files, 'run_at': 'document_start', 'world': 'MAIN', 'all_frames': False,
        }],
    }
    json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    print('extension :', OUT, files)

main()
