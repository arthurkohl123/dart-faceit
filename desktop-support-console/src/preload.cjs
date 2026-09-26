const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('supportConsole', {
  notify: (payload) => ipcRenderer.invoke('support-console:notify', payload),
  hide: () => ipcRenderer.invoke('support-console:hide'),
  quit: () => ipcRenderer.invoke('support-console:quit'),
  platform: process.platform,
});
