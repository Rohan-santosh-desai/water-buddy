const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  onShow: (cb) => ipcRenderer.on('show', (_e, data) => cb(data)),
  onLeave: (cb) => ipcRenderer.on('leave', () => cb()),
  respond: (action) => ipcRenderer.invoke('respond', action),
  interactive: (on) => ipcRenderer.send('interactive', !!on),
  done: () => ipcRenderer.send('done'),
  getConfig: () => ipcRenderer.invoke('cfg:get'),
  setConfig: (c) => ipcRenderer.invoke('cfg:set', c),
  pickImage: () => ipcRenderer.invoke('cfg:pickImage'),
  resetImage: () => ipcRenderer.invoke('cfg:resetImage'),
  test: () => ipcRenderer.send('cfg:test'),
});
