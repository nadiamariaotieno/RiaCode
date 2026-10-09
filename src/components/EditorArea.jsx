export default function EditorArea({ tabs, activeFile, onSelectTab, onCloseTab }) {
  return (
    <section className="editor" aria-label="Editor">
      <div className="tab-bar">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={tab.id === activeFile?.id ? 'tab active' : 'tab'}
          >
            <button type="button" onClick={() => onSelectTab(tab.id)}>
              {tab.name}
            </button>
            <button
              type="button"
              className="tab-close"
              aria-label={`Close ${tab.name}`}
              onClick={() => onCloseTab(tab.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      {activeFile ? (
        <pre className="editor-text">{activeFile.content}</pre>
      ) : (
        <p className="editor-empty">No file open</p>
      )}
    </section>
  )
}
