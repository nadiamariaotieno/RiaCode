import { useState } from 'react'
import { sampleChanges, sampleProject } from '../mockWorkspace.js'

export default function Sidebar({
  view,
  activeFileId,
  activeRelativePath,
  workspaceName,
  workspaceEntries,
  expandedFolders,
  onOpenFile,
  onOpenDiskFile,
  onOpenFolder,
  onCreateFile,
  onToggleWorkspaceFolder,
  onOpenWorkspaceFile,
}) {
  const [expanded, setExpanded] = useState({ src: true })
  const rootEntries = workspaceEntries?.['']

  function toggleFolder(id) {
    setExpanded((current) => ({ ...current, [id]: !current[id] }))
  }

  return (
    <aside
      className="sidebar"
      aria-label={view === 'explorer' ? 'Explorer' : 'Source Control'}
    >
      <h2>
        {view === 'explorer'
          ? (workspaceName ?? sampleProject.name)
          : 'Source Control'}
      </h2>
      {view === 'explorer' && (
        <>
          <button type="button" className="sidebar-action" onClick={onOpenFolder}>
            Open folder
          </button>
          <button type="button" className="sidebar-action" onClick={onOpenDiskFile}>
            Open file
          </button>
          <button type="button" className="sidebar-action" onClick={onCreateFile}>
            New file
          </button>
        </>
      )}
      <div className="sidebar-body">
        {view === 'explorer' && workspaceName ? (
          workspaceEntries === null ? (
            <p className="tree-message">This folder could not be listed.</p>
          ) : !Array.isArray(rootEntries) ? (
            <p className="tree-message">Loading…</p>
          ) : rootEntries.length > 0 ? (
            <WorkspaceTree
              nodes={rootEntries}
              entries={workspaceEntries}
              expanded={expandedFolders}
              activeRelativePath={activeRelativePath}
              onToggleFolder={onToggleWorkspaceFolder}
              onOpenFile={onOpenWorkspaceFile}
            />
          ) : (
            <p className="tree-message">This folder is empty.</p>
          )
        ) : view === 'explorer' ? (
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
      </div>
      {view === 'explorer' && !workspaceName && (
        <p className="sidebar-note">Sample data. These files are not on disk.</p>
      )}
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
                <span className="tree-twist" aria-hidden="true">
                  {expanded[node.id] ? '▾' : '▸'}
                </span>
                <span className="tree-label">{node.name}</span>
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
              <span className="tree-twist" aria-hidden="true" />
              <span className="tree-label">{node.name}</span>
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

function WorkspaceTree({
  nodes,
  entries,
  expanded,
  activeRelativePath,
  onToggleFolder,
  onOpenFile,
}) {
  return (
    <ul className="tree">
      {nodes.map((node) => {
        const isOpen = Boolean(expanded[node.relativePath])
        const children = entries[node.relativePath]
        return (
          <li key={node.relativePath}>
            {node.type === 'folder' ? (
              <>
                <button
                  type="button"
                  className="tree-item"
                  aria-expanded={isOpen}
                  onClick={() => onToggleFolder(node.relativePath)}
                >
                  <span className="tree-twist" aria-hidden="true">
                    {isOpen ? '▾' : '▸'}
                  </span>
                  <span className="tree-label">{node.name}</span>
                </button>
                {isOpen && children && children.length > 0 && (
                  <WorkspaceTree
                    nodes={children}
                    entries={entries}
                    expanded={expanded}
                    activeRelativePath={activeRelativePath}
                    onToggleFolder={onToggleFolder}
                    onOpenFile={onOpenFile}
                  />
                )}
                {isOpen && children && children.length === 0 && (
                  <p className="tree-message">Empty folder</p>
                )}
                {isOpen && !children && (
                  <p className="tree-message">Loading…</p>
                )}
              </>
            ) : (
              <button
                type="button"
                className={
                  node.relativePath === activeRelativePath
                    ? 'tree-item active'
                    : 'tree-item'
                }
                onClick={() => onOpenFile(node.relativePath)}
              >
                <span className="tree-twist" aria-hidden="true" />
                <span className="tree-label">{node.name}</span>
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
