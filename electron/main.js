import { app, BrowserWindow, dialog, ipcMain, session } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Keep this URL aligned with server.port in vite.config.js.
const DEV_SERVER_URL = 'http://localhost:5174'
const MAX_FILE_BYTES = 1024 * 1024
const approvedFiles = new Set()

const useDist = app.isPackaged || process.env.ELECTRON_USE_DIST === '1'
const isDev = !useDist

function contentSecurityPolicy() {
  if (isDev) {
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "worker-src 'self' blob:",
      "connect-src 'self' http://localhost:5174 ws://localhost:5174",
    ].join('; ')
  }

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "connect-src 'self'",
  ].join('; ')
}

function applyContentSecurityPolicy() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [contentSecurityPolicy()],
      },
    })
  })
}

function isAllowedNavigation(url) {
  if (isDev) {
    return url === DEV_SERVER_URL || url.startsWith(`${DEV_SERVER_URL}/`)
  }

  const distUrl = pathToFileURL(path.join(__dirname, '../dist')).href
  return url.startsWith(distUrl)
}

async function readApprovedTextFile(filePath) {
  const resolvedPath = path.resolve(filePath)
  const realPath = await fs.realpath(resolvedPath)
  const info = await fs.stat(realPath)
  if (!info.isFile()) {
    throw new Error('That path is not a file.')
  }
  if (info.size > MAX_FILE_BYTES) {
    throw new Error('Files larger than 1 MB are not supported yet.')
  }

  const buffer = await fs.readFile(realPath)
  if (buffer.includes(0)) {
    throw new Error('This file does not look like UTF-8 text.')
  }

  approvedFiles.add(realPath)
  return {
    filePath: realPath,
    name: path.basename(realPath),
    content: buffer.toString('utf8'),
  }
}

ipcMain.handle('file:open', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Open file',
    properties: ['openFile'],
  })
  if (result.canceled || result.filePaths.length !== 1) {
    return null
  }

  return readApprovedTextFile(result.filePaths[0])
})

ipcMain.handle('file:save', async (_event, payload) => {
  if (!payload || typeof payload.filePath !== 'string') {
    throw new Error('A file path is required.')
  }
  if (typeof payload.content !== 'string') {
    throw new Error('The file content must be text.')
  }

  const realPath = await fs.realpath(path.resolve(payload.filePath))
  if (!approvedFiles.has(realPath)) {
    throw new Error('That file was not opened from the file dialog.')
  }

  const buffer = Buffer.from(payload.content, 'utf8')
  if (buffer.length > MAX_FILE_BYTES) {
    throw new Error('Files larger than 1 MB are not supported yet.')
  }

  await fs.writeFile(realPath, buffer)
  return { filePath: realPath }
})

async function devServerIsReachable() {
  try {
    const response = await fetch(DEV_SERVER_URL, {
      signal: AbortSignal.timeout(2000),
    })
    return response.ok
  } catch {
    return false
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    show: false,
    title: 'RiaCode',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })

  win.once('ready-to-show', () => {
    win.show()
  })

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault()
    }
  })

  win.webContents.on('console-message', (details) => {
    if (details.level === 'warning' || details.level === 'error') {
      console.error(`[renderer ${details.level}] ${details.message}`)
    }
  })

  win.webContents.on('did-finish-load', () => {
    console.log(`RiaCode window loaded ${win.webContents.getURL()}`)
  })

  win.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL) => {
      if (errorCode === -3) {
        return
      }
      console.error(
        `Failed to load ${validatedURL}: ${errorDescription} (${errorCode})`,
      )
    },
  )

  if (isDev) {
    win.loadURL(DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

async function start() {
  applyContentSecurityPolicy()

  if (isDev) {
    const reachable = await devServerIsReachable()
    if (!reachable) {
      dialog.showErrorBox(
        'RiaCode',
        `The Vite development server is not running at ${DEV_SERVER_URL}.\n\nFrom the project folder, run npm run dev, then run npm run electron again.`,
      )
      app.quit()
      return
    }
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.whenReady().then(start).catch((error) => {
  console.error(error)
  app.quit()
})
