import { app, BrowserWindow, dialog, ipcMain, Menu, MenuItem, session } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { runCommandInDirectory, stopProcess } from './workspaceCommand.js'
import { gitCommit, gitDiff, gitStage, gitStatus } from './workspaceGit.js'
import { scanWorkspace } from './workspaceSecurity.js'
import { buildImportGraph, connectionsFromGraph } from './workspaceGraph.js'
import {
  createWorkspaceFile,
  deleteWorkspaceEntry,
  isInsideRoot,
  listDirectory,
  renameWorkspaceEntry,
  resolveWorkspaceFile,
  toPortableRelative,
} from './workspaceFiles.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Keep this URL aligned with server.port in vite.config.js.
const DEV_SERVER_URL = 'http://localhost:5174'
const MAX_FILE_BYTES = 1024 * 1024
const windowSessions = new Map()

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

function sessionFor(event) {
  const current = windowSessions.get(event.sender.id)
  if (!current) {
    throw new Error('This window is no longer available.')
  }
  return current
}

function dialogParent(event) {
  return BrowserWindow.fromWebContents(event.sender)
}

function openDialog(parent, options) {
  if (parent && !parent.isDestroyed()) {
    return dialog.showOpenDialog(parent, options)
  }
  return dialog.showOpenDialog(options)
}

async function readApprovedTextFile(approvedFiles, filePath) {
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

ipcMain.handle('file:open', async (event) => {
  const current = sessionFor(event)
  const result = await openDialog(dialogParent(event), {
    title: 'Open file',
    properties: ['openFile'],
  })
  if (result.canceled || result.filePaths.length !== 1) {
    return null
  }

  return readApprovedTextFile(current.approvedFiles, result.filePaths[0])
})

ipcMain.handle('file:save', async (event, payload) => {
  const current = sessionFor(event)
  if (!payload || typeof payload.filePath !== 'string') {
    throw new Error('A file path is required.')
  }
  if (typeof payload.content !== 'string') {
    throw new Error('The file content must be text.')
  }

  const realPath = await fs.realpath(path.resolve(payload.filePath))
  if (!current.approvedFiles.has(realPath)) {
    throw new Error('That file was not opened in this window.')
  }

  const buffer = Buffer.from(payload.content, 'utf8')
  if (buffer.length > MAX_FILE_BYTES) {
    throw new Error('Files larger than 1 MB are not supported yet.')
  }

  await fs.writeFile(realPath, buffer)
  invalidateGraph(current)
  return { filePath: realPath }
})

ipcMain.handle('workspace:open', async (event) => {
  const current = sessionFor(event)
  const result = await openDialog(dialogParent(event), {
    title: 'Open folder',
    properties: ['openDirectory'],
  })
  if (result.canceled || result.filePaths.length !== 1) {
    return null
  }

  const realPath = await fs.realpath(result.filePaths[0])
  const info = await fs.stat(realPath)
  if (!info.isDirectory()) {
    throw new Error('That path is not a folder.')
  }

  current.workspaceRoot = realPath
  invalidateGraph(current)
  return { name: path.basename(realPath) }
})

ipcMain.handle('workspace:list', async (event, relativePath) => {
  const current = sessionFor(event)
  if (!current.workspaceRoot) {
    throw new Error('Open a folder first.')
  }
  return listDirectory(current.workspaceRoot, relativePath)
})

ipcMain.handle('workspace:readFile', async (event, relativePath) => {
  const current = sessionFor(event)
  if (!current.workspaceRoot) {
    throw new Error('Open a folder first.')
  }

  const realPath = await resolveWorkspaceFile(current.workspaceRoot, relativePath)
  const opened = await readApprovedTextFile(current.approvedFiles, realPath)
  return {
    ...opened,
    relativePath: toPortableRelative(current.workspaceRoot, realPath),
  }
})

ipcMain.handle('workspace:createFile', async (event, relativePath) => {
  const current = sessionFor(event)
  if (!current.workspaceRoot) {
    throw new Error('Open a folder first.')
  }

  const realPath = await createWorkspaceFile(current.workspaceRoot, relativePath)
  invalidateGraph(current)
  const opened = await readApprovedTextFile(current.approvedFiles, realPath)
  return {
    ...opened,
    relativePath: toPortableRelative(current.workspaceRoot, realPath),
  }
})

function retargetApproved(approvedFiles, fromReal, toReal, isFolder) {
  const moved = []
  for (const approved of approvedFiles) {
    if (approved === fromReal || (isFolder && isInsideRoot(fromReal, approved))) {
      moved.push(approved)
    }
  }
  for (const approved of moved) {
    approvedFiles.delete(approved)
    const relative = path.relative(fromReal, approved)
    approvedFiles.add(relative === '' ? toReal : path.join(toReal, relative))
  }
}

function invalidateGraph(current) {
  current.graphGeneration = (current.graphGeneration ?? 0) + 1
  current.importGraph = null
}

async function graphFor(current) {
  const root = current.workspaceRoot
  const generation = current.graphGeneration ?? 0
  if (
    current.importGraph?.root === root &&
    current.importGraph.generation === generation
  ) {
    return current.importGraph.built
  }

  const built = await buildImportGraph(root)
  if (current.workspaceRoot !== root || (current.graphGeneration ?? 0) !== generation) {
    throw new Error('The folder changed.')
  }
  current.importGraph = { root, generation, built }
  return built
}

function dropApproved(approvedFiles, realPath, isFolder) {
  for (const approved of [...approvedFiles]) {
    if (approved === realPath || (isFolder && isInsideRoot(realPath, approved))) {
      approvedFiles.delete(approved)
    }
  }
}

ipcMain.handle('workspace:rename', async (event, payload) => {
  const current = sessionFor(event)
  if (!current.workspaceRoot) {
    throw new Error('Open a folder first.')
  }
  if (!payload || typeof payload.relativePath !== 'string') {
    throw new Error('A path inside the open folder is required.')
  }

  const renamed = await renameWorkspaceEntry(
    current.workspaceRoot,
    payload.relativePath,
    payload.newName,
  )
  if (renamed.fromReal !== renamed.toReal) {
    retargetApproved(
      current.approvedFiles,
      renamed.fromReal,
      renamed.toReal,
      renamed.type === 'folder',
    )
  }
  invalidateGraph(current)
  return renamed
})

ipcMain.handle('workspace:delete', async (event, relativePath) => {
  const current = sessionFor(event)
  if (!current.workspaceRoot) {
    throw new Error('Open a folder first.')
  }

  const removed = await deleteWorkspaceEntry(current.workspaceRoot, relativePath)
  dropApproved(current.approvedFiles, removed.realPath, removed.type === 'folder')
  invalidateGraph(current)
  return removed
})

ipcMain.handle('git:status', async (event) => {
  const current = sessionFor(event)
  if (!current.workspaceRoot) {
    throw new Error('Open a folder first.')
  }
  return gitStatus(current.workspaceRoot)
})

ipcMain.handle('git:diff', async (event, relativePath) => {
  const current = sessionFor(event)
  if (!current.workspaceRoot) {
    throw new Error('Open a folder first.')
  }
  return gitDiff(current.workspaceRoot, relativePath)
})

ipcMain.handle('git:stage', async (event, payload) => {
  const current = sessionFor(event)
  if (!current.workspaceRoot) {
    throw new Error('Open a folder first.')
  }
  if (!payload || typeof payload.relativePath !== 'string' || typeof payload.stage !== 'boolean') {
    throw new Error('A path inside the open folder is required.')
  }
  await gitStage(current.workspaceRoot, payload.relativePath, payload.stage)
  return null
})

ipcMain.handle('git:commit', async (event, message) => {
  const current = sessionFor(event)
  if (!current.workspaceRoot) {
    throw new Error('Open a folder first.')
  }
  return gitCommit(current.workspaceRoot, message)
})

ipcMain.handle('graph:connections', async (event, relativePath) => {
  const current = sessionFor(event)
  if (!current.workspaceRoot) {
    throw new Error('Open a folder first.')
  }
  if (typeof relativePath !== 'string') {
    throw new Error('A path inside the open folder is required.')
  }
  const graph = await graphFor(current)
  if (current.workspaceRoot === null) {
    throw new Error('Open a folder first.')
  }
  return connectionsFromGraph(current.workspaceRoot, relativePath, graph)
})

ipcMain.handle('security:scan', async (event) => {
  const current = sessionFor(event)
  if (!current.workspaceRoot) {
    throw new Error('Open a folder first.')
  }
  if (current.audit) {
    throw new Error('A security scan is already running.')
  }

  const root = current.workspaceRoot
  current.audit = true
  try {
    const report = await scanWorkspace(root, {
      onAuditStart(child) {
        if (current.audit !== true) {
          stopProcess(child)
          return
        }
        current.audit = child
      },
    })
    if (current.workspaceRoot !== root) {
      throw new Error('The folder changed.')
    }
    return report
  } finally {
    current.audit = null
  }
})

ipcMain.handle('terminal:run', async (event, command) => {
  const current = sessionFor(event)
  if (!current.workspaceRoot) {
    throw new Error('Open a folder first.')
  }
  if (current.command) {
    throw new Error('A command is already running.')
  }

  current.command = true
  try {
    return await runCommandInDirectory(current.workspaceRoot, command, {
      onStart(child) {
        if (current.command !== true) {
          stopProcess(child)
          return
        }
        current.command = child
      },
    })
  } finally {
    current.command = null
  }
})

ipcMain.handle('window:new', () => {
  createWindow()
  return null
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

function installNewWindowMenu() {
  const menu = Menu.getApplicationMenu()
  const fileMenu = menu?.items.find((item) => item.label === 'File')
  if (!fileMenu?.submenu) {
    console.error('RiaCode could not add New Window to the File menu.')
    return
  }
  fileMenu.submenu.insert(
    0,
    new MenuItem({
      label: 'New Window',
      accelerator: 'CommandOrControl+Shift+N',
      click: () => {
        createWindow()
      },
    }),
  )
  fileMenu.submenu.insert(1, new MenuItem({ type: 'separator' }))
  Menu.setApplicationMenu(menu)
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

  const sessionId = win.webContents.id
  windowSessions.set(sessionId, {
    workspaceRoot: null,
    approvedFiles: new Set(),
    command: null,
    audit: null,
    graphGeneration: 0,
    importGraph: null,
  })
  win.on('closed', () => {
    const current = windowSessions.get(sessionId)
    if (current?.command && current.command !== true) {
      stopProcess(current.command)
    }
    if (current?.audit && current.audit !== true) {
      stopProcess(current.audit)
    }
    if (current) {
      current.command = null
      current.audit = null
    }
    windowSessions.delete(sessionId)
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

  installNewWindowMenu()
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
