// Reborn BF – appli Windows
// Une fenêtre dédiée au jeu rebornbf.com, avec les mêmes scripts que l'appli Android
// (bots, x2, style, fiche d'unité) et un menu rapide + réglages en surcouche (ui.js).

const { app, BrowserWindow, ipcMain, shell, Notification, Menu, nativeTheme, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const SITE = 'https://rebornbf.com';
const HOME = SITE + '/home';
const PARTITION = 'persist:rebornbf';

// ───────────── Réglages ─────────────

const DEFAULTS = {
  bots: { farm: false, aventure: false },
  farm_target: 300,
  opt: {
    antipause: true, appfeel: true, remaster: true, infos: true, hd: false,
    always_x2: true, always_auto: false, turbo15: false, turbo2: false, notifications: true,
  },
  custom: [], // { name, code, on }
  window: { width: 540, height: 960 },
};

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  let s = {};
  try { s = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch (e) { s = {}; }
  return {
    ...DEFAULTS, ...s,
    bots: { ...DEFAULTS.bots, ...(s.bots || {}) },
    opt: { ...DEFAULTS.opt, ...(s.opt || {}) },
    custom: Array.isArray(s.custom) ? s.custom : [],
    window: { ...DEFAULTS.window, ...(s.window || {}) },
  };
}

function saveSettings(s) {
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2));
  } catch (e) { console.error('[RBF] réglages', e); }
}

let settings;

// ───────────── Scripts injectés ─────────────

// Scripts partagés avec l'appli Android : dans le paquet (resources/scripts) ou, en développement,
// directement dans le dossier Android du projet.
function scriptsDir() {
  const packed = path.join(process.resourcesPath || '', 'scripts');
  if (app.isPackaged && fs.existsSync(packed)) return packed;
  const local = path.join(__dirname, 'scripts');
  if (fs.existsSync(local)) return local;
  return path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'scripts');
}

function asset(name) {
  try { return fs.readFileSync(path.join(scriptsDir(), name), 'utf8'); } catch (e) { return ''; }
}

function wrap(code, atStart, label) {
  const safe = JSON.stringify('[RBF] ' + label);
  const body = 'try{\n' + code + '\n}catch(e){console.error(' + safe + ',e)}\n';
  if (atStart) return '(function(){' + body + '})();\n';
  return "(function __rbfRun(){if(document.readyState==='loading'||!document.body){"
    + "document.addEventListener('DOMContentLoaded',__rbfRun,{once:true});return;}"
    + body + '})();\n';
}

const BOTS = [
  { id: 'farm', file: 'farm.js', start: false },
  { id: 'aventure', file: 'aventure.js', start: true },
];

function buildInjection(s) {
  let js = "(function(){if(window.top!==window)return;if(!/(^|\\.)rebornbf\\.com$/.test(location.hostname))return;"
    + 'if(window.__rbfApp)return;window.__rbfApp=1;\n';
  // Petites compatibilités Tampermonkey pour les scripts ajoutés à la main
  js += 'window.unsafeWindow=window;'
    + "window.GM_addStyle=window.GM_addStyle||function(c){var s=document.createElement('style');s.textContent=c;(document.head||document.documentElement).appendChild(s);return s;};"
    + "window.GM_getValue=window.GM_getValue||function(k,d){try{var v=localStorage.getItem('gm_'+k);return v===null?d:JSON.parse(v);}catch(e){return d;}};"
    + "window.GM_setValue=window.GM_setValue||function(k,v){try{localStorage.setItem('gm_'+k,JSON.stringify(v));}catch(e){}};"
    + "window.GM_deleteValue=window.GM_deleteValue||function(k){try{localStorage.removeItem('gm_'+k);}catch(e){}};\n";

  if (s.opt.antipause) js += wrap(asset('antipause.js'), true, 'anti-pause');
  if (s.opt.appfeel) js += wrap(asset('appfeel.js'), false, 'style appli');
  js += wrap(asset('nav.js'), false, 'menu rapide');
  js += wrap(asset('gamedata.js'), false, 'données du jeu');
  if (s.opt.remaster) js += wrap(asset('unitplus.js'), false, "fiche d'unité");
  if (s.opt.infos) js += wrap(asset('gameinfo.js'), false, 'infos du jeu');
  if (s.opt.hd) js += wrap(asset('hd.js'), false, 'filtre HD');
  {
    js += wrap(asset('combat.js').replace('__AUTO__', String(!!s.opt.always_auto)).replace('__X2__', String(!!s.opt.always_x2))
      .replace('__TURBO__', s.opt.turbo2 ? '2' : s.opt.turbo15 ? '1.5' : '1'), false, 'combat');
  }
  for (const b of BOTS) if (s.bots[b.id] || b.id === 'farm') js += wrap(asset(b.file), b.start, b.id);
  for (const c of s.custom) {
    if (!c || c.on === false) continue;
    const code = String(c.code || '');
    const start = code.includes('@run-at') && code.includes('document-start');
    js += wrap(code, start, String(c.name || 'script'));
  }
  // Menu rapide et réglages (surcouche de l'appli Windows)
  js += wrap(asset('ui.js'), false, 'interface');
  js += '})();';
  return js;
}

// ───────────── Liens ─────────────

// Tout reste dans l'appli (le jeu, la connexion Google / Discord…), sauf les liens vers des sites sans rapport.
function openOutside(url) {
  let u;
  try { u = new URL(url); } catch (e) { return false; }
  if (!/^https?:$/.test(u.protocol)) return true;
  const h = u.hostname.toLowerCase();
  if (h === 'discord.gg' || ((h === 'discord.com' || h.endsWith('.discord.com')) && u.pathname.startsWith('/invite'))) return true;
  const out = ['youtube.com', 'youtu.be', 'twitter.com', 'x.com', 'reddit.com', 'facebook.com', 'instagram.com',
    'tiktok.com', 'wikipedia.org', 'fandom.com', 'play.google.com', 'apps.apple.com', 'patreon.com', 'ko-fi.com', 'github.com'];
  return out.some((d) => (h === d || h.endsWith('.' + d)) && h !== 'accounts.youtube.com');
}

// ───────────── Fenêtre ─────────────

let win = null;

function chromeUserAgent() {
  // Se présenter comme Chrome (sans « Electron ») pour que Google accepte la connexion
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;
}

function createWindow() {
  const w = settings.window;
  win = new BrowserWindow({
    width: w.width, height: w.height, x: w.x, y: w.y,
    minWidth: 360, minHeight: 640,
    backgroundColor: '#07060c',
    title: 'Reborn BF',
    icon: path.join(__dirname, 'icon.ico'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      partition: PARTITION,
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false, // le jeu ne se met pas en pause quand la fenêtre est derrière
      spellcheck: false,
    },
  });
  if (w.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());

  const remember = () => {
    if (!win || win.isMinimized()) return;
    const b = win.getNormalBounds();
    settings.window = { ...b, maximized: win.isMaximized() };
    saveSettings(settings);
  };
  win.on('resized', remember);
  win.on('moved', remember);
  win.on('maximize', remember);
  win.on('unmaximize', remember);
  win.on('page-title-updated', (e) => { e.preventDefault(); win.setTitle('Reborn BF'); });

  const wc = win.webContents;

  // Fenêtres de connexion (Google, Discord) : petite fenêtre dans l'appli, même session
  wc.setWindowOpenHandler(({ url }) => {
    if (openOutside(url)) { shell.openExternal(url); return { action: 'deny' }; }
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        parent: win, width: 520, height: 720, autoHideMenuBar: true, backgroundColor: '#14161d',
        title: 'Connexion', icon: path.join(__dirname, 'icon.ico'),
        webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false },
      },
    };
  });
  wc.on('did-create-window', (child) => {
    child.webContents.setUserAgent(chromeUserAgent());
    // Quand la connexion est finie, la fenêtre revient sur le jeu : on la ferme et on recharge
    child.webContents.on('did-navigate', (_e, url) => {
      try {
        const u = new URL(url);
        if (/(^|\.)rebornbf\.com$/.test(u.hostname) && !/auth|callback/i.test(u.pathname)) {
          setTimeout(() => { if (!child.isDestroyed()) child.close(); }, 2500);
        }
      } catch (e) { /* rien */ }
    });
    child.on('closed', () => setTimeout(() => { if (win && !win.isDestroyed()) wc.reload(); }, 1500));
  });

  wc.on('will-navigate', (e, url) => {
    if (openOutside(url)) { e.preventDefault(); shell.openExternal(url); }
  });

  // Pas de connexion : page d'erreur propre avec « Réessayer »
  wc.on('did-fail-load', (_e, code, desc, url, isMain) => {
    if (!isMain || code === -3) return; // -3 = chargement annulé (normal)
    const html = `<!doctype html><meta charset="utf-8"><title>Reborn BF</title>
      <body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;
      background:#0b0a14;color:#e6e8ee;font:15px system-ui,sans-serif;text-align:center">
      <h2 style="margin:0 0 8px">Pas de connexion au jeu</h2>
      <p style="color:#8a8fa0;margin:0 0 22px">Vérifie ta connexion Internet, puis réessaie.</p>
      <a href="${HOME}" style="padding:12px 28px;border-radius:12px;background:#f0b03c;color:#14161d;font-weight:700;text-decoration:none">Réessayer</a></body>`;
    wc.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  });

  // Raccourcis clavier
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const k = input.key;
    if (k === 'F5' || (input.control && k.toLowerCase() === 'r')) { e.preventDefault(); wc.reload(); }
    else if (k === 'F11') { e.preventDefault(); win.setFullScreen(!win.isFullScreen()); }
    else if (k === 'F12') { e.preventDefault(); wc.toggleDevTools(); }
    else if (input.alt && k === 'ArrowLeft') { e.preventDefault(); if (wc.canGoBack()) wc.goBack(); }
    else if (input.control && k.toLowerCase() === 'm') { e.preventDefault(); wc.executeJavaScript('window.__rbfUI&&window.__rbfUI.quick()').catch(() => {}); }
    else if (input.control && k === ',') { e.preventDefault(); wc.executeJavaScript('window.__rbfUI&&window.__rbfUI.settings()').catch(() => {}); }
  });

  win.loadURL(HOME);
}

// ───────────── Échanges avec la page ─────────────

ipcMain.on('rbf:get', (e) => {
  e.returnValue = { settings, injection: buildInjection(settings), platform: 'windows', version: app.getVersion() };
});

ipcMain.on('rbf:save', (e, s, url) => {
  if (s && typeof s === 'object') {
    settings = {
      ...settings,
      bots: { ...settings.bots, ...(s.bots || {}) },
      opt: { ...settings.opt, ...(s.opt || {}) },
      farm_target: Math.max(1, parseInt(s.farm_target, 10) || settings.farm_target),
      custom: Array.isArray(s.custom) ? s.custom : settings.custom,
    };
    saveSettings(settings);
  }
  if (url) e.sender.loadURL(String(url).startsWith('/') ? SITE + url : String(url));
  else e.sender.reload();
});

ipcMain.on('rbf:msg', (e, m) => {
  m = String(m || '');
  if (m.startsWith('notify:') && settings.opt.notifications && Notification.isSupported()) {
    new Notification({ title: 'Reborn BF', body: m.slice(7), icon: path.join(__dirname, 'icon.png') }).show();
  }
});

ipcMain.on('rbf:action', (e, a) => {
  const wc = e.sender;
  if (a === 'back' && wc.canGoBack()) wc.goBack();
  else if (a === 'reload') wc.reload();
  else if (a === 'fullscreen' && win) win.setFullScreen(!win.isFullScreen());
  else if (a === 'devtools') wc.toggleDevTools();
});

// ───────────── Ouverture dans Chrome ─────────────

// Le jeu s'ouvre dans ton Chrome, en fenêtre d'appli (sans barre d'adresse), avec ton profil
// habituel : ta connexion Google y est déjà. Si Chrome est introuvable, l'appli garde sa propre fenêtre.
function findChrome() {
  const bases = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
  for (const b of bases) {
    const p = path.join(b, 'Google', 'Chrome', 'Application', 'chrome.exe');
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function openInChrome() {
  if (process.argv.includes('--fenetre')) return false; // forcer la fenêtre intégrée
  const chrome = findChrome();
  if (!chrome) return false;
  const w = settings.window;
  try {
    const child = spawn(chrome, ['--app=' + HOME, `--window-size=${w.width},${w.height}`], { detached: true, stdio: 'ignore' });
    child.unref();
    return true;
  } catch (e) {
    return false;
  }
}

// ───────────── Démarrage ─────────────

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  app.setAppUserModelId('be.adriano.rebornbf');
  app.whenReady().then(() => {
    nativeTheme.themeSource = 'dark';
    Menu.setApplicationMenu(null);
    settings = loadSettings();
    if (openInChrome()) { app.quit(); return; }
    session.fromPartition(PARTITION).setUserAgent(chromeUserAgent());
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
