'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  command: (name, payload) => ipcRenderer.invoke('shell:command', name, payload),
  onState: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('shell:state', listener);
    return () => ipcRenderer.removeListener('shell:state', listener);
  },
  onPreview: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('shell:preview', listener);
    return () => ipcRenderer.removeListener('shell:preview', listener);
  },
});
