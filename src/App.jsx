import { useEffect, useState } from 'react'
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

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('riacode-theme', theme)
    } catch {
      // The theme still applies for this session if storage is unavailable.
    }
  }, [theme])

  const tabs = openFileIds
    .map((id) => findFile(sampleProject.files, id))
    .filter(Boolean)
  const activeFile = findFile(sampleProject.files, activeFileId)

  function openFile(id) {
    setOpenFileIds((current) =>
      current.includes(id) ? current : [...current, id],
    )
    setActiveFileId(id)
  }

  function closeTab(id) {
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
      />
      <div className="workbench">
        <EditorArea
          tabs={tabs}
          activeFile={activeFile}
          onSelectTab={setActiveFileId}
          onCloseTab={closeTab}
        />
        {panelOpen && <BottomPanel />}
      </div>
      <StatusBar
        fileName={activeFile?.id}
        theme={theme}
        runtimeLabel={
          desktop ? `Electron ${desktop.versions.electron}` : 'Browser'
        }
        panelOpen={panelOpen}
        onToggleTheme={toggleTheme}
        onTogglePanel={() => setPanelOpen((open) => !open)}
      />
    </div>
  )
}
