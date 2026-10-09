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
  const editorRef = useRef(null)

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

      setDiskFiles((current) =>
        current.some((file) => file.id === opened.filePath)
          ? current
          : [
              ...current,
              {
                id: opened.filePath,
                name: opened.name,
                content: opened.content,
                filePath: opened.filePath,
              },
            ],
      )
      openFile(opened.filePath)
      setStatusMessage('')
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
      <ActivityBar activeView={activity} onSelectView={setActivity} />
      <Sidebar
        view={activity}
        activeFileId={activeFileId}
        onOpenFile={openFile}
        onOpenDiskFile={openDiskFile}
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
