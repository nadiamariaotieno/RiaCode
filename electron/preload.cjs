const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('riacode', {
  runtime: 'electron',
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
})
