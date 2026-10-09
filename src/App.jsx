import './App.css'

function App() {
  const desktop = window.riacode

  return (
    <div className="app-shell">
      <header className="title-bar">
        <h1>RiaCode</h1>
      </header>
      <main className="workspace" aria-label="Workspace">
        <p>
          {desktop
            ? `Desktop shell · Electron ${desktop.versions.electron}`
            : 'Browser preview'}
        </p>
        <p>No file open</p>
      </main>
    </div>
  )
}

export default App
