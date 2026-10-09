const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('riacode', {
  runtime: 'electron',
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
  openFile() {
    return ipcRenderer.invoke('file:open')
  },
  saveFile(filePath, content) {
    return ipcRenderer.invoke('file:save', { filePath, content })
  },
})
