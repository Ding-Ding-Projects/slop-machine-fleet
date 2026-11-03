const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('fleetConnection', Object.freeze({ connect: value => ipcRenderer.invoke('fleet:connect', value) }));
contextBridge.exposeInMainWorld('fleetUpdates', Object.freeze({
  read: () => ipcRenderer.invoke('fleet:updates:read'),
  check: () => ipcRenderer.invoke('fleet:updates:check'),
  reportSafety: value => ipcRenderer.invoke('fleet:updates:safety', value),
  requestRestart: () => ipcRenderer.invoke('fleet:updates:restart'),
  later: () => ipcRenderer.invoke('fleet:updates:later'),
  openReleaseNotes: () => ipcRenderer.invoke('fleet:updates:notes'),
  subscribe: callback => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('fleet:updates:state', listener);
    return () => ipcRenderer.removeListener('fleet:updates:state', listener);
  }
}));
