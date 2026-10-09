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
  openFolder() {
    return ipcRenderer.invoke('workspace:open')
  },
  listDirectory(relativePath) {
    return ipcRenderer.invoke('workspace:list', relativePath)
  },
  readWorkspaceFile(relativePath) {
    return ipcRenderer.invoke('workspace:readFile', relativePath)
  },
  createWorkspaceFile(relativePath) {
    return ipcRenderer.invoke('workspace:createFile', relativePath)
  },
  openWindow() {
    return ipcRenderer.invoke('window:new')
  },
})
