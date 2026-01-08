const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openSoftwareB: () => ipcRenderer.invoke('launch-software-b'),
  openWebKiosk: (url) => ipcRenderer.invoke('launch-web-kiosk', url, userData),
  readDB: (tableName) => ipcRenderer.invoke('read-database', tableName),
  listTables: () => ipcRenderer.invoke('list-tables'),

  closeKiosk: () => ipcRenderer.send('close-kiosk-window')
});