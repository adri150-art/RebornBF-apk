// Préchargement : relie la page du jeu à l'appli (réglages, notifications) et lance les scripts
// dès le début du chargement de chaque page, comme sur Android.
const { contextBridge, ipcRenderer, webFrame } = require('electron');

if (window.top === window && /(^|\.)rebornbf\.com$/.test(location.hostname)) {
  const data = ipcRenderer.sendSync('rbf:get');
  contextBridge.exposeInMainWorld('rbfNative', {
    platform: data.platform,
    version: data.version,
    settings: () => JSON.parse(JSON.stringify(data.settings)),
    save: (s, url) => ipcRenderer.send('rbf:save', s, url || null),
    action: (a) => ipcRenderer.send('rbf:action', String(a)),
    postMessage: (m) => ipcRenderer.send('rbf:msg', String(m)),
  });
  webFrame.executeJavaScript(data.injection).catch((e) => console.error('[RBF] injection', e));
}
