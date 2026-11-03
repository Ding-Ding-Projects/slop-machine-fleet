const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('fleetConnection', Object.freeze({ connect: value => ipcRenderer.invoke('fleet:connect', value) }));
