const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('still', {
  platform: process.platform,
  createPage: (id, partition, isPrivate) => ipcRenderer.invoke('create-page', { id, partition, isPrivate }),
  setPageBounds: (id, bounds) => ipcRenderer.send('page-bounds', { id, bounds }),
  activatePage: (id) => ipcRenderer.send('activate-page', id),
  navigatePage: (id, url) => ipcRenderer.send('navigate-page', { id, url }),
  pageCommand: (id, command) => ipcRenderer.send('page-command', { id, command }),
  closePage: (id) => ipcRenderer.invoke('close-page', id),
  newPrivatePartition: () => `private-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  onPageState: (callback) => ipcRenderer.on('page-state', (_event, state) => callback(state)),
  onMenuCommand: (callback) => ipcRenderer.on('menu-command', (_event, command) => callback(command)),
  listExtensions: () => ipcRenderer.invoke('list-extensions'),
  addExtension: () => ipcRenderer.invoke('add-extension'),
  removeExtension: (id) => ipcRenderer.invoke('remove-extension', id),
  getBlockedDomains: () => ipcRenderer.invoke('blocked-domains:get'),
  updateBlockedDomains: (change) => ipcRenderer.invoke('blocked-domains:update', change),
});
