const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('fleetCompanion', {
  initial: () => ipcRenderer.invoke('companion:initial'),
  preferences: value => ipcRenderer.invoke('companion:preferences', value),
  select: () => ipcRenderer.invoke('companion:select'),
  action: value => ipcRenderer.invoke('companion:action', value),
  cancel: () => ipcRenderer.invoke('companion:cancel'),
  openHost: () => ipcRenderer.invoke('companion:openHost'),
  progress: callback => { const listener = (_event, value) => callback(value); ipcRenderer.on('companion:progress', listener); return () => ipcRenderer.removeListener('companion:progress', listener); }
});
