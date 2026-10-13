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
  renameWorkspaceEntry(relativePath, newName) {
    return ipcRenderer.invoke('workspace:rename', { relativePath, newName })
  },
  deleteWorkspaceEntry(relativePath) {
    return ipcRenderer.invoke('workspace:delete', relativePath)
  },
  openWindow() {
    return ipcRenderer.invoke('window:new')
  },
  runCommand(command) {
    return ipcRenderer.invoke('terminal:run', command)
  },
  gitStatus() {
    return ipcRenderer.invoke('git:status')
  },
  gitDiff(relativePath) {
    return ipcRenderer.invoke('git:diff', relativePath)
  },
  gitStage(relativePath, stage) {
    return ipcRenderer.invoke('git:stage', { relativePath, stage })
  },
  gitCommit(message) {
    return ipcRenderer.invoke('git:commit', message)
  },
})
