import { useCallback, useEffect, useRef, useState } from 'react'
import ActivityBar from './components/ActivityBar.jsx'
import BottomPanel from './components/BottomPanel.jsx'
import EditorArea from './components/EditorArea.jsx'
import Sidebar from './components/Sidebar.jsx'
import StatusBar from './components/StatusBar.jsx'
import { findFile, sampleProject } from './mockWorkspace.js'
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
      diskFiles.find((file) => file.id === id) ??
      findFile(sampleProject.files, id)
    )
  }

  const tabs = openFileIds.map((id) => findDocument(id)).filter(Boolean)
  const activeFile = findDocument(activeFileId)

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

  async function openWorkspaceFile(relativePath) {
    if (!desktop?.readWorkspaceFile) {
      setStatusMessage('Open a folder from the RiaCode desktop window.')
      return
    }

    try {
      const opened = await desktop.readWorkspaceFile(relativePath)
      rememberDiskFile(opened)
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
    if (activeFileId === id) {
      const neighbor = nextIds[index] ?? nextIds[index - 1] ?? null
      setActiveFileId(neighbor)
    }
  }

  function toggleTheme() {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
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
        activeRelativePath={activeFile?.relativePath}
        workspaceName={workspaceName}
        workspaceEntries={workspaceEntries}
        expandedFolders={expandedFolders}
        onOpenFile={openFile}
        onOpenDiskFile={openDiskFile}
        onOpenFolder={openFolder}
        onCreateFile={createFile}
        onToggleWorkspaceFolder={toggleWorkspaceFolder}
        onOpenWorkspaceFile={openWorkspaceFile}
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
        />
        {panelOpen && <BottomPanel />}
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
        onSave={saveActiveFile}
        onToggleTheme={toggleTheme}
        onTogglePanel={() => setPanelOpen((open) => !open)}
      />
    </div>
  )
}
