import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import * as monaco from 'monaco-editor'

function languageFor(fileName) {
  if (fileName.endsWith('.json')) {
    return 'json'
  }
  if (fileName.endsWith('.md')) {
    return 'markdown'
  }
  if (fileName.endsWith('.css')) {
    return 'css'
  }
  if (fileName.endsWith('.js') || fileName.endsWith('.jsx')) {
    return 'javascript'
  }
  return 'plaintext'
}

const EditorArea = forwardRef(function EditorArea(
  {
    tabs,
    activeFile,
    dirtyIds,
    theme,
    onSelectTab,
    onCloseTab,
    onDirtyChange,
  },
  ref,
) {
  const containerRef = useRef(null)
  const editorRef = useRef(null)
  const modelsRef = useRef(new Map())
  const dirtyChangeRef = useRef(onDirtyChange)
  const themeRef = useRef(theme)

  useEffect(() => {
    dirtyChangeRef.current = onDirtyChange
  }, [onDirtyChange])

  useImperativeHandle(ref, () => ({
    getValue(id) {
      const entry = modelsRef.current.get(id)
      if (!entry || entry.model.isDisposed()) {
        return null
      }
      return entry.model.getValue()
    },
  }))

  useEffect(() => {
    const editor = monaco.editor.create(containerRef.current, {
      theme: themeRef.current === 'dark' ? 'vs-dark' : 'vs',
      automaticLayout: true,
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: 13,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
    })
    editorRef.current = editor

    return () => {
      editor.dispose()
      editorRef.current = null
    }
  }, [])

  useEffect(() => {
    monaco.editor.setTheme(theme === 'dark' ? 'vs-dark' : 'vs')
  }, [theme])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) {
      return
    }

    if (!activeFile) {
      editor.setModel(null)
      return
    }

    const fileId = activeFile.id
    let entry = modelsRef.current.get(fileId)
    if (!entry || entry.model.isDisposed()) {
      const uri = monaco.Uri.parse(
        `inmemory://model/${encodeURIComponent(fileId)}`,
      )
      const existing = monaco.editor.getModel(uri)
      const model =
        existing ??
        monaco.editor.createModel(
          activeFile.content,
          languageFor(activeFile.name),
          uri,
        )
      const subscription = model.onDidChangeContent(() => {
        const current = modelsRef.current.get(fileId)
        dirtyChangeRef.current(
          fileId,
          model.getValue() !== current?.savedContent,
        )
      })
      entry = {
        model,
        subscription,
        savedContent: activeFile.content,
      }
      modelsRef.current.set(fileId, entry)
    } else if (entry.savedContent !== activeFile.content) {
      entry.savedContent = activeFile.content
      dirtyChangeRef.current(
        fileId,
        entry.model.getValue() !== entry.savedContent,
      )
    }

    editor.setModel(entry.model)
    editor.layout()
  }, [activeFile])

  useEffect(() => {
    const openIds = new Set(tabs.map((tab) => tab.id))
    for (const [id, entry] of modelsRef.current) {
      if (!openIds.has(id)) {
        entry.subscription.dispose()
        entry.model.dispose()
        modelsRef.current.delete(id)
        dirtyChangeRef.current(id, false)
      }
    }
  }, [tabs])

  return (
    <section className="editor" aria-label="Editor">
      <div className="tab-bar">
        {tabs.map((tab) => {
          const dirty = dirtyIds.includes(tab.id)
          return (
            <div
              key={tab.id}
              className={tab.id === activeFile?.id ? 'tab active' : 'tab'}
            >
              <button type="button" onClick={() => onSelectTab(tab.id)}>
                {dirty && (
                  <span className="tab-dirty" aria-label="Unsaved changes">
                    ●
                  </span>
                )}
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
          )
        })}
      </div>
      <div className="editor-body">
        <div
          ref={containerRef}
          className="editor-surface"
          hidden={!activeFile}
        />
        {!activeFile && <p className="editor-empty">No file open</p>}
      </div>
    </section>
  )
})

export default EditorArea
