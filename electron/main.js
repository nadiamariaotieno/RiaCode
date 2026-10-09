import { app, BrowserWindow, dialog, session } from 'electron'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Keep this URL aligned with server.port in vite.config.js.
const DEV_SERVER_URL = 'http://localhost:5174'

const useDist = app.isPackaged || process.env.ELECTRON_USE_DIST === '1'
const isDev = !useDist

function contentSecurityPolicy() {
  if (isDev) {
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "connect-src 'self' http://localhost:5174 ws://localhost:5174",
    ].join('; ')
  }

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
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
