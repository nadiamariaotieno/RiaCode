import { useCallback, useEffect, useRef, useState } from 'react'
import ActivityBar from './components/ActivityBar.jsx'
import BottomPanel from './components/BottomPanel.jsx'
import EditorArea from './components/EditorArea.jsx'
import Sidebar from './components/Sidebar.jsx'
import StatusBar from './components/StatusBar.jsx'
import { findFile, sampleProject } from './mockWorkspace.js'
import { collectSymbols } from './languageSymbols.js'
import './App.css'

function readInitialTheme() {
  try {
    const stored = localStorage.getItem('riacode-theme')
    if (stored === 'light' || stored === 'dark') {
      return stored
    }
  } catch {
    // Private browsing can block storage. The system theme is the fallback.
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export default function App() {
  const desktop = window.riacode
  const [theme, setTheme] = useState(readInitialTheme)
  const [activity, setActivity] = useState('explorer')
  const [openFileIds, setOpenFileIds] = useState([])
  const [activeFileId, setActiveFileId] = useState(null)
  const [panelOpen, setPanelOpen] = useState(true)
  const [dirtyIds, setDirtyIds] = useState([])
  const [diskFiles, setDiskFiles] = useState([])
  const [statusMessage, setStatusMessage] = useState('')
  const [workspaceName, setWorkspaceName] = useState(null)
  const [workspaceEntries, setWorkspaceEntries] = useState({})
  const [expandedFolders, setExpandedFolders] = useState({})
  const [selectedRelativePath, setSelectedRelativePath] = useState(null)
  const [terminalOutput, setTerminalOutput] = useState('')
  const [commandRunning, setCommandRunning] = useState(false)
  const [gitChanges, setGitChanges] = useState(null)
  const [gitError, setGitError] = useState('')
  const [gitDiffs, setGitDiffs] = useState([])
  const [securityReport, setSecurityReport] = useState(null)
  const [securityError, setSecurityError] = useState('')
  const [securityScanning, setSecurityScanning] = useState(false)
  const [connections, setConnections] = useState(null)
  const [connectionsError, setConnectionsError] = useState('')
  const [connectionsLoading, setConnectionsLoading] = useState(false)
  const [graphRequest, setGraphRequest] = useState(0)
  const [outlineByFile, setOutlineByFile] = useState({})
  const editorRef = useRef(null)
  const workspaceGeneration = useRef(0)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('riacode-theme', theme)
    } catch {
      // The theme still applies for this session if storage is unavailable.
    }
  }, [theme])

  function findDocument(id) {
    return (
      gitDiffs.find((file) => file.id === id) ??
      diskFiles.find((file) => file.id === id) ??
      findFile(sampleProject.files, id)
    )
  }

  const rememberSymbols = useCallback((fileId, symbols) => {
    setOutlineByFile((current) => ({ ...current, [fileId]: symbols }))
  }, [])

  const refreshGit = useCallback(async () => {
    if (!desktop?.gitStatus || !workspaceName) {
      return
    }
    try {
      const changes = await desktop.gitStatus()
      setGitChanges(changes)
      setGitError('')
    } catch (error) {
      setGitChanges([])
      setGitError(error.message ?? 'Git status could not be read.')
    }
  }, [desktop, workspaceName])

  useEffect(() => {
    if (activity === 'source-control') {
      refreshGit()
    }
  }, [activity, refreshGit])

  const tabs = openFileIds.map((id) => findDocument(id)).filter(Boolean)
  const activeFile = findDocument(activeFileId)

  useEffect(() => {
    if (activity !== 'xray') {
      return undefined
    }
    const relativePath = activeFile?.relativePath
    if (!workspaceName) {
      return undefined
    }
    if (!desktop?.fileConnections) {
      setConnections(null)
      setConnectionsError('Show connections from the RiaCode desktop window.')
      setConnectionsLoading(false)
      return undefined
    }
    if (!relativePath) {
      setConnections(null)
      setConnectionsError('')
      setConnectionsLoading(false)
      return undefined
    }

    const generation = workspaceGeneration.current
    let cancelled = false
    setConnectionsLoading(true)
    setConnectionsError('')
    desktop.fileConnections(relativePath).then(
      (result) => {
        if (cancelled || generation !== workspaceGeneration.current) {
          return
        }
        setConnections(result)
        setConnectionsLoading(false)
      },
      (error) => {
        if (cancelled || generation !== workspaceGeneration.current) {
          return
        }
        setConnections(null)
        setConnectionsError(error.message ?? 'Connections could not be read.')
        setConnectionsLoading(false)
      },
    )
    return () => {
      cancelled = true
    }
  }, [activity, desktop, workspaceName, activeFile?.relativePath, graphRequest])

  function rememberDiskFile(opened) {
    setDiskFiles((current) => {
      const existing = current.find((file) => file.id === opened.filePath)
      if (!existing) {
        return [
          ...current,
          {
            id: opened.filePath,
            name: opened.name,
            content: opened.content,
            filePath: opened.filePath,
            relativePath: opened.relativePath,
          },
        ]
      }
      if (
        opened.relativePath &&
        existing.relativePath !== opened.relativePath
      ) {
        return current.map((file) =>
          file.id === opened.filePath
            ? { ...file, relativePath: opened.relativePath }
            : file,
        )
      }
      return current
    })
    openFile(opened.filePath)
    setStatusMessage('')
  }

  function openFile(id) {
    setOpenFileIds((current) =>
      current.includes(id) ? current : [...current, id],
    )
    setActiveFileId(id)
  }

  const handleDirtyChange = useCallback((id, isDirty) => {
    if (isDirty) {
      setStatusMessage('')
    }
    setDirtyIds((current) => {
      const hasId = current.includes(id)
      if (isDirty && !hasId) {
        return [...current, id]
      }
      if (!isDirty && hasId) {
        return current.filter((openId) => openId !== id)
      }
      return current
    })
  }, [])

  async function openDiskFile() {
    if (!desktop?.openFile) {
      setStatusMessage('Open a file from the RiaCode desktop window.')
      return
    }

    try {
      const opened = await desktop.openFile()
      if (!opened) {
        return
      }

      rememberDiskFile(opened)
    } catch (error) {
      setStatusMessage(error.message ?? 'The file could not be opened.')
    }
  }

  async function openFolder() {
    if (!desktop?.openFolder) {
      setStatusMessage('Open a folder from the RiaCode desktop window.')
      return
    }

    let switched = false
    let generation = workspaceGeneration.current
    try {
      const opened = await desktop.openFolder()
      if (!opened) {
        return
      }

      generation = workspaceGeneration.current + 1
      workspaceGeneration.current = generation
      switched = true
      setWorkspaceName(opened.name)
      setWorkspaceEntries({})
      setExpandedFolders({})
      setSelectedRelativePath(null)
      setTerminalOutput('')
      setGitChanges(null)
      setGitError('')
      setGitDiffs([])
      setSecurityReport(null)
      setSecurityError('')
      setSecurityScanning(false)
      setConnections(null)
      setConnectionsError('')
      setConnectionsLoading(false)
      setActivity('explorer')
      setStatusMessage('')

      const children = await desktop.listDirectory('')
      if (generation !== workspaceGeneration.current) {
        return
      }

      setWorkspaceEntries({ '': children })
    } catch (error) {
      if (generation !== workspaceGeneration.current) {
        return
      }
      if (switched) {
        setWorkspaceEntries(null)
      }
      setStatusMessage(error.message ?? 'The folder could not be opened.')
    }
  }

  async function toggleWorkspaceFolder(relativePath) {
    setSelectedRelativePath(relativePath)
    if (expandedFolders[relativePath]) {
      setExpandedFolders((current) => ({ ...current, [relativePath]: false }))
      return
    }

    if (workspaceEntries[relativePath]) {
      setExpandedFolders((current) => ({ ...current, [relativePath]: true }))
      return
    }

    const generation = workspaceGeneration.current
    setExpandedFolders((current) => ({ ...current, [relativePath]: true }))
    try {
      const children = await desktop.listDirectory(relativePath)
      if (generation !== workspaceGeneration.current) {
        return
      }
      setWorkspaceEntries((current) => ({
        ...current,
        [relativePath]: children,
      }))
    } catch (error) {
      if (generation !== workspaceGeneration.current) {
        return
      }
      setExpandedFolders((current) => ({ ...current, [relativePath]: false }))
      setStatusMessage(error.message ?? 'That folder could not be listed.')
    }
  }

  async function openNewWindow() {
    if (!desktop?.openWindow) {
      setStatusMessage('Open a new window from the RiaCode desktop window.')
      return
    }

    try {
      await desktop.openWindow()
    } catch (error) {
      setStatusMessage(error.message ?? 'A new window could not be opened.')
    }
  }

  async function createFile() {
    if (!desktop?.createWorkspaceFile) {
      setStatusMessage('Create a file from the RiaCode desktop window.')
      return
    }
    if (!workspaceName) {
      setStatusMessage('Open a folder before creating a file.')
      return
    }

    const entered = window.prompt(
      'File name in this folder. Use a path like src/notes.txt when that folder already exists.',
      'untitled.txt',
    )
    if (!entered) {
      return
    }

    const generation = workspaceGeneration.current
    try {
      const opened = await desktop.createWorkspaceFile(entered)
      if (generation !== workspaceGeneration.current) {
        return
      }
      rememberDiskFile(opened)
      setSelectedRelativePath(opened.relativePath)
      try {
        await refreshCreatedFile(opened.relativePath, generation)
      } catch (error) {
        if (generation !== workspaceGeneration.current) {
          return
        }
        setStatusMessage(
          error.message ??
            'The file was created, but the folder list could not be refreshed.',
        )
        return
      }
      setStatusMessage('Created')
    } catch (error) {
      if (generation !== workspaceGeneration.current) {
        return
      }
      setStatusMessage(error.message ?? 'The file could not be created.')
    }
  }

  async function refreshCreatedFile(relativePath, generation) {
    const ancestors = []
    const parts = relativePath.split('/')
    for (let index = 0; index < parts.length - 1; index += 1) {
      ancestors.push(parts.slice(0, index + 1).join('/'))
    }

    const listings = await Promise.all([
      desktop.listDirectory(''),
      ...ancestors.map((folder) => desktop.listDirectory(folder)),
    ])
    if (generation !== workspaceGeneration.current) {
      return
    }

    setWorkspaceEntries((current) => {
      if (!current) {
        return current
      }
      const next = { ...current, '': listings[0] }
      ancestors.forEach((folder, index) => {
        next[folder] = listings[index + 1]
      })
      return next
    })
    if (ancestors.length > 0) {
      setExpandedFolders((current) => {
        const next = { ...current }
        for (const folder of ancestors) {
          next[folder] = true
        }
        return next
      })
    }
  }

  function findWorkspaceEntry(relativePath) {
    for (const children of Object.values(workspaceEntries ?? {})) {
      if (!Array.isArray(children)) {
        continue
      }
      const match = children.find((entry) => entry.relativePath === relativePath)
      if (match) {
        return match
      }
    }
    return null
  }

  function replacePrefix(value, fromPrefix, toPrefix) {
    if (typeof value !== 'string' || !fromPrefix) {
      return null
    }
    if (value === fromPrefix) {
      return toPrefix
    }
    const separator = value.includes('\\') ? '\\' : '/'
    const prefix = fromPrefix.endsWith(separator)
      ? fromPrefix
      : `${fromPrefix}${separator}`
    if (!value.startsWith(prefix)) {
      return null
    }
    return `${toPrefix}${separator}${value.slice(prefix.length)}`
  }

  function baseName(filePath) {
    const parts = filePath.split(/[\\/]/)
    return parts[parts.length - 1] || filePath
  }

  function parentRelative(relativePath) {
    const slash = relativePath.lastIndexOf('/')
    return slash === -1 ? '' : relativePath.slice(0, slash)
  }

  async function refreshParentListing(relativePath, generation, removedPrefix) {
    const parent = parentRelative(relativePath)
    const children = await desktop.listDirectory(parent)
    if (generation !== workspaceGeneration.current) {
      return
    }
    setWorkspaceEntries((current) => {
      if (!current) {
        return current
      }
      const next = {}
      for (const [key, value] of Object.entries(current)) {
        if (
          removedPrefix &&
          (key === removedPrefix || key.startsWith(`${removedPrefix}/`))
        ) {
          continue
        }
        next[key] = value
      }
      next[parent] = children
      return next
    })
  }

  function applyRename(renamed) {
    const idMap = new Map()
    const nextFiles = diskFiles.map((file) => {
      const nextPath = file.filePath
        ? replacePrefix(file.filePath, renamed.fromReal, renamed.toReal)
        : null
      const nextRelative = file.relativePath
        ? replacePrefix(file.relativePath, renamed.fromRelative, renamed.toRelative)
        : null
      if (!nextPath && !nextRelative) {
        return file
      }
      const filePath = nextPath ?? file.filePath
      const id = nextPath ?? file.id
      if (id !== file.id) {
        idMap.set(file.id, id)
      }
      return {
        ...file,
        id,
        filePath,
        relativePath: nextRelative ?? file.relativePath,
        name: nextPath ? baseName(filePath) : file.name,
      }
    })
    for (const [fromId, toId] of idMap) {
      editorRef.current?.renameBuffer(fromId, toId)
    }
    setDiskFiles(nextFiles)
    if (idMap.size > 0) {
      setOpenFileIds((current) => current.map((id) => idMap.get(id) ?? id))
      setDirtyIds((current) => current.map((id) => idMap.get(id) ?? id))
      setActiveFileId((current) => idMap.get(current) ?? current)
    }
  }

  async function renameEntry() {
    if (!desktop?.renameWorkspaceEntry) {
      setStatusMessage('Rename a file from the RiaCode desktop window.')
      return
    }
    const entry = findWorkspaceEntry(selectedRelativePath)
    if (!entry) {
      setStatusMessage('Select a file or folder in the open folder.')
      return
    }

    const entered = window.prompt('New name', entry.name)
    if (!entered || entered.trim() === entry.name) {
      return
    }

    const generation = workspaceGeneration.current
    try {
      const renamed = await desktop.renameWorkspaceEntry(entry.relativePath, entered)
      if (generation !== workspaceGeneration.current) {
        return
      }
      applyRename(renamed)
      setSelectedRelativePath(renamed.toRelative)
      await refreshParentListing(renamed.toRelative, generation, renamed.fromRelative)
      setStatusMessage('Renamed')
    } catch (error) {
      if (generation !== workspaceGeneration.current) {
        return
      }
      setStatusMessage(error.message ?? 'That item could not be renamed.')
    }
  }

  function matchesRemoved(file, removed) {
    if (file.relativePath === removed.relativePath) {
      return true
    }
    if (
      removed.type === 'folder' &&
      file.relativePath?.startsWith(`${removed.relativePath}/`)
    ) {
      return true
    }
    return Boolean(
      file.filePath &&
        replacePrefix(file.filePath, removed.realPath, removed.realPath),
    )
  }

  async function deleteEntry() {
    if (!desktop?.deleteWorkspaceEntry) {
      setStatusMessage('Delete a file from the RiaCode desktop window.')
      return
    }
    const entry = findWorkspaceEntry(selectedRelativePath)
    if (!entry) {
      setStatusMessage('Select a file or folder in the open folder.')
      return
    }

    const removedPreview = {
      type: entry.type,
      relativePath: entry.relativePath,
      realPath: '',
    }
    const dirty = diskFiles.some(
      (file) =>
        matchesRemoved(file, removedPreview) && dirtyIds.includes(file.id),
    )
    const question =
      entry.type === 'folder'
        ? `Delete ${entry.name} and everything inside it?`
        : `Delete ${entry.name}?`
    const warning = dirty
      ? ' Unsaved edits in this window will be discarded.'
      : ''
    if (!window.confirm(`${question}${warning}`)) {
      return
    }

    const generation = workspaceGeneration.current
    try {
      const removed = await desktop.deleteWorkspaceEntry(entry.relativePath)
      if (generation !== workspaceGeneration.current) {
        return
      }
      const closingIds = new Set(
        diskFiles.filter((file) => matchesRemoved(file, removed)).map((file) => file.id),
      )
      const remaining = openFileIds.filter((id) => !closingIds.has(id))
      if (closingIds.has(activeFileId)) {
        const index = openFileIds.indexOf(activeFileId)
        setActiveFileId(remaining[index] ?? remaining[index - 1] ?? null)
      }
      setOpenFileIds(remaining)
      setDirtyIds((current) => current.filter((id) => !closingIds.has(id)))
      setDiskFiles((current) => current.filter((file) => !closingIds.has(file.id)))
      setExpandedFolders((current) => {
        const next = {}
        for (const [key, value] of Object.entries(current)) {
          if (key === removed.relativePath || key.startsWith(`${removed.relativePath}/`)) {
            continue
          }
          next[key] = value
        }
        return next
      })
      setSelectedRelativePath(null)
      await refreshParentListing(removed.relativePath, generation, removed.relativePath)
      setStatusMessage('Deleted')
    } catch (error) {
      if (generation !== workspaceGeneration.current) {
        return
      }
      setStatusMessage(error.message ?? 'That item could not be deleted.')
    }
  }

  async function openWorkspaceFile(relativePath) {
    if (!desktop?.readWorkspaceFile) {
      setStatusMessage('Open a folder from the RiaCode desktop window.')
      return
    }

    try {
      const opened = await desktop.readWorkspaceFile(relativePath)
      setSelectedRelativePath(opened.relativePath ?? relativePath)
      rememberDiskFile(opened)
      return opened.filePath
    } catch (error) {
      setStatusMessage(error.message ?? 'The file could not be opened.')
    }
  }

  async function saveActiveFile() {
    if (!activeFile?.filePath || !desktop?.saveFile) {
      return
    }

    const content = editorRef.current?.getValue(activeFile.id)
    if (typeof content !== 'string') {
      setStatusMessage('The editor is not ready to save.')
      return
    }

    try {
      await desktop.saveFile(activeFile.filePath, content)
      setDiskFiles((current) =>
        current.map((file) =>
          file.id === activeFile.id ? { ...file, content } : file,
        ),
      )
      setStatusMessage('Saved')
    } catch (error) {
      setStatusMessage(error.message ?? 'The file could not be saved.')
    }
  }

  function closeTab(id) {
    const file = findDocument(id)
    const prompt = file?.filePath
      ? `${file.name} has unsaved changes. Close it without saving?`
      : `${file?.name ?? 'This file'} has unsaved sample edits. Close it and discard those edits?`
    if (dirtyIds.includes(id) && !window.confirm(prompt)) {
      return
    }

    const index = openFileIds.indexOf(id)
    const nextIds = openFileIds.filter((openId) => openId !== id)
    setOpenFileIds(nextIds)
    setGitDiffs((current) => current.filter((file) => file.id !== id))
    if (activeFileId === id) {
      const neighbor = nextIds[index] ?? nextIds[index - 1] ?? null
      setActiveFileId(neighbor)
    }
  }

  async function openGitDiff(relativePath) {
    if (!desktop?.gitDiff) {
      setStatusMessage('Open Git status from the RiaCode desktop window.')
      return
    }
    try {
      const text = await desktop.gitDiff(relativePath)
      const id = `git-diff:${relativePath}`
      const name = `${relativePath.split('/').pop()} (diff)`
      editorRef.current?.replaceBuffer(id, text)
      setGitDiffs((current) => [
        ...current.filter((file) => file.id !== id),
        { id, name, content: text },
      ])
      openFile(id)
      setStatusMessage('')
    } catch (error) {
      setStatusMessage(error.message ?? 'The diff could not be opened.')
    }
  }

  async function toggleGitStage(change) {
    if (!desktop?.gitStage) {
      return
    }
    const stage = !(change.staged && !change.unstaged)
    try {
      await desktop.gitStage(change.path, stage)
      await refreshGit()
      setStatusMessage('')
    } catch (error) {
      setStatusMessage(error.message ?? 'That change could not be staged.')
    }
  }

  async function commitGit(message) {
    if (!desktop?.gitCommit) {
      setStatusMessage('Commit from the RiaCode desktop window.')
      return false
    }
    try {
      const summary = await desktop.gitCommit(message)
      setStatusMessage(summary)
      await refreshGit()
      return true
    } catch (error) {
      setStatusMessage(error.message ?? 'The commit could not be created.')
      return false
    }
  }

  function revealSymbol(line) {
    if (!activeFile) {
      return
    }
    editorRef.current?.showLine(activeFile.id, line)
  }

  async function goToDefinition() {
    const cursor = editorRef.current?.cursorWord()
    if (!cursor || !activeFile) {
      setStatusMessage('Place the cursor on a name.')
      return
    }
    const text = editorRef.current?.getValue(activeFile.id) ?? activeFile.content ?? ''
    const local = collectSymbols(text).find(
      (symbol) => symbol.name === cursor.word && symbol.line !== cursor.line,
    )
    if (local) {
      editorRef.current?.showLine(activeFile.id, local.line)
      setStatusMessage('')
      return
    }
    if (!activeFile.relativePath || !desktop?.findDefinition) {
      setStatusMessage('No definition was found for that name in this file.')
      return
    }
    try {
      const result = await desktop.findDefinition(
        activeFile.relativePath,
        text,
        cursor.word,
      )
      if (result.kind === 'file') {
        const filePath = await openWorkspaceFile(result.path)
        if (filePath) {
          editorRef.current?.showLine(filePath, result.line)
        }
        setStatusMessage('')
        return
      }
      if (result.kind === 'package') {
        setStatusMessage(`That name comes from the package ${result.specifier}.`)
        return
      }
      if (result.kind === 'outside') {
        setStatusMessage('That import points outside the open folder.')
        return
      }
      if (result.kind === 'missing') {
        setStatusMessage('That import does not match a file in this folder.')
        return
      }
      setStatusMessage('No definition was found for that name.')
    } catch (error) {
      setStatusMessage(error.message ?? 'The definition could not be opened.')
    }
  }

  function showConnections() {
    setActivity('xray')
    if (activeFile?.relativePath) {
      setGraphRequest((current) => current + 1)
      return
    }
    if (selectedRelativePath) {
      openWorkspaceFile(selectedRelativePath)
      return
    }
    setConnections(null)
    setConnectionsError('Open a file from this folder to see its connections.')
  }

  function openConnection(relativePath) {
    openWorkspaceFile(relativePath)
  }

  async function scanSecurity() {
    if (!desktop?.scanSecurity) {
      setStatusMessage('Scan from the RiaCode desktop window.')
      return
    }
    if (!workspaceName) {
      setStatusMessage('Open a folder before scanning.')
      return
    }

    const generation = workspaceGeneration.current
    setSecurityScanning(true)
    setSecurityError('')
    try {
      const report = await desktop.scanSecurity()
      if (generation !== workspaceGeneration.current) {
        return
      }
      setSecurityReport(report)
      setStatusMessage('')
    } catch (error) {
      if (generation !== workspaceGeneration.current) {
        return
      }
      setSecurityReport(null)
      setSecurityError(error.message ?? 'The scan could not finish.')
    } finally {
      if (generation === workspaceGeneration.current) {
        setSecurityScanning(false)
      }
    }
  }

  function openSecurity() {
    setActivity('security')
    if (!securityReport && !securityScanning) {
      scanSecurity()
    }
  }

  async function openSecurityFinding(finding) {
    const filePath = await openWorkspaceFile(finding.path)
    if (filePath) {
      editorRef.current?.showLine(filePath, finding.line)
    }
  }

  async function runCommand(command) {
    if (!desktop?.runCommand) {
      setStatusMessage('Run a command from the RiaCode desktop window.')
      return
    }
    if (!workspaceName) {
      setStatusMessage('Open a folder before running a command.')
      return
    }

    setCommandRunning(true)
    setTerminalOutput((current) => `${current}${current ? '\n' : ''}> ${command}\n`)
    try {
      const result = await desktop.runCommand(command)
      let note = ''
      if (result.timedOut) {
        note = 'Stopped after 30 seconds.'
      } else if (result.truncated) {
        note = 'Output was cut off.'
      } else if (result.exitCode) {
        note = `Exit code ${result.exitCode}`
      }
      setTerminalOutput(
        (current) => `${current}${result.output ?? ''}${note ? `\n${note}` : ''}\n`,
      )
    } catch (error) {
      setTerminalOutput(
        (current) =>
          `${current}${error.message ?? 'The command could not be started.'}\n`,
      )
    } finally {
      setCommandRunning(false)
    }
  }

  function toggleTheme() {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }

  const securityCount = securityReport
    ? securityReport.secrets.length +
      (securityReport.dependencySummary
        ? securityReport.dependencySummary.critical +
          securityReport.dependencySummary.high +
          securityReport.dependencySummary.moderate +
          securityReport.dependencySummary.low +
          securityReport.dependencySummary.info
        : securityReport.dependencies.length)
    : 0
  let securityLabel = 'Security'
  if (securityScanning) {
    securityLabel = 'Security: scanning'
  } else if (securityReport && securityCount > 0) {
    securityLabel = `Security: ${securityCount}`
  } else if (securityReport && securityReport.notes.length > 0) {
    securityLabel = 'Security: check'
  } else if (securityReport) {
    securityLabel = 'Security: clear'
  }

  return (
    <div className="app-shell">
      <ActivityBar
        activeView={activity}
        onSelectView={setActivity}
        onNewWindow={openNewWindow}
      />
      <Sidebar
        view={activity}
        activeFileId={activeFileId}
        workspaceName={workspaceName}
        workspaceEntries={workspaceEntries}
        expandedFolders={expandedFolders}
        onOpenFile={openFile}
        onOpenDiskFile={openDiskFile}
        onOpenFolder={openFolder}
        onCreateFile={createFile}
        onRenameEntry={renameEntry}
        onDeleteEntry={deleteEntry}
        selectedRelativePath={selectedRelativePath}
        onToggleWorkspaceFolder={toggleWorkspaceFolder}
        onOpenWorkspaceFile={openWorkspaceFile}
        gitChanges={gitChanges}
        gitError={gitError}
        onRefreshGit={refreshGit}
        onOpenGitDiff={openGitDiff}
        onToggleGitStage={toggleGitStage}
        onGitCommit={commitGit}
        securityReport={securityReport}
        securityError={securityError}
        securityScanning={securityScanning}
        onScanSecurity={scanSecurity}
        onOpenSecurityFinding={openSecurityFinding}
        connectionFileName={activeFile?.relativePath ? activeFile.name : null}
        connections={connections}
        connectionsError={connectionsError}
        connectionsLoading={connectionsLoading}
        onShowConnections={showConnections}
        onOpenConnection={openConnection}
        outlineSymbols={activeFile ? (outlineByFile[activeFile.id] ?? []) : []}
        outlineFileName={activeFile?.name ?? null}
        onRevealSymbol={revealSymbol}
        onGoToDefinition={goToDefinition}
      />
      <div className="workbench">
        <EditorArea
          ref={editorRef}
          tabs={tabs}
          activeFile={activeFile}
          dirtyIds={dirtyIds}
          theme={theme}
          onSelectTab={setActiveFileId}
          onCloseTab={closeTab}
          onDirtyChange={handleDirtyChange}
          onSymbolsChange={rememberSymbols}
          onGoToDefinition={goToDefinition}
        />
        {panelOpen && (
          <BottomPanel
            workspaceName={workspaceName}
            running={commandRunning}
            output={terminalOutput}
            onRunCommand={runCommand}
          />
        )}
      </div>
      <StatusBar
        fileName={activeFile?.filePath ?? activeFile?.id}
        statusMessage={statusMessage}
        theme={theme}
        runtimeLabel={
          desktop ? `Electron ${desktop.versions.electron}` : 'Browser'
        }
        panelOpen={panelOpen}
        canSave={Boolean(activeFile?.filePath) && dirtyIds.includes(activeFile?.id)}
        securityLabel={securityLabel}
        securityAlert={Boolean(securityReport) && securityCount > 0}
        onOpenSecurity={openSecurity}
        onSave={saveActiveFile}
        onToggleTheme={toggleTheme}
        onTogglePanel={() => setPanelOpen((open) => !open)}
      />
    </div>
  )
}
