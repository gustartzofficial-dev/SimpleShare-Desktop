'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('picker', {
  command: (name, payload) => ipcRenderer.invoke('picker:command', name, payload),
});
