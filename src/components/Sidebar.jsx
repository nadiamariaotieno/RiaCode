import { useState } from 'react'
import { sampleChanges, sampleProject } from '../mockWorkspace.js'

export default function Sidebar({
  view,
  activeFileId,
  onOpenFile,
  onOpenDiskFile,
}) {
  const [expanded, setExpanded] = useState({ src: true })

  function toggleFolder(id) {
    setExpanded((current) => ({ ...current, [id]: !current[id] }))
  }

  return (
    <aside
      className="sidebar"
      aria-label={view === 'explorer' ? 'Explorer' : 'Source Control'}
    >
      <h2>{view === 'explorer' ? sampleProject.name : 'Source Control'}</h2>
      {view === 'explorer' && (
        <button type="button" className="sidebar-action" onClick={onOpenDiskFile}>
          Open file
        </button>
      )}
      {view === 'explorer' ? (
        <FileTree
          nodes={sampleProject.files}
          expanded={expanded}
          activeFileId={activeFileId}
          onToggleFolder={toggleFolder}
          onOpenFile={onOpenFile}
        />
      ) : (
        <ul className="change-list">
          {sampleChanges.map((change) => (
            <li key={change.id}>
              <button type="button" onClick={() => onOpenFile(change.id)}>
                <span>{change.label}</span>
                <span>{change.id}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="sidebar-note">Sample data. These files are not on disk.</p>
    </aside>
  )
}

function FileTree({ nodes, expanded, activeFileId, onToggleFolder, onOpenFile }) {
  return (
    <ul className="tree">
      {nodes.map((node) => (
        <li key={node.id}>
          {node.type === 'folder' ? (
            <>
              <button
                type="button"
                className="tree-item"
                aria-expanded={Boolean(expanded[node.id])}
                onClick={() => onToggleFolder(node.id)}
              >
                <span aria-hidden="true">{expanded[node.id] ? '▾' : '▸'}</span>
                {node.name}
              </button>
              {expanded[node.id] && (
                <FileTree
                  nodes={node.children}
                  expanded={expanded}
                  activeFileId={activeFileId}
                  onToggleFolder={onToggleFolder}
                  onOpenFile={onOpenFile}
                />
              )}
            </>
          ) : (
            <button
              type="button"
              className={
                node.id === activeFileId ? 'tree-item active' : 'tree-item'
              }
              onClick={() => onOpenFile(node.id)}
            >
              {node.name}
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
