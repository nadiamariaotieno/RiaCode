import { useState } from 'react'
import { sampleChanges, sampleProject } from '../mockWorkspace.js'

export default function Sidebar({
  view,
  activeFileId,
  workspaceName,
  workspaceEntries,
  expandedFolders,
  onOpenFile,
  onOpenDiskFile,
  onOpenFolder,
  onCreateFile,
  onRenameEntry,
  onDeleteEntry,
  selectedRelativePath,
  onToggleWorkspaceFolder,
  onOpenWorkspaceFile,
  gitChanges,
  gitError,
  onRefreshGit,
  onOpenGitDiff,
  onToggleGitStage,
  onGitCommit,
  securityReport,
  securityError,
  securityScanning,
  onScanSecurity,
  onOpenSecurityFinding,
}) {
  const [expanded, setExpanded] = useState({ src: true })
  const rootEntries = workspaceEntries?.['']

  function toggleFolder(id) {
    setExpanded((current) => ({ ...current, [id]: !current[id] }))
  }

  return (
    <aside
      className="sidebar"
      aria-label={
        view === 'explorer'
          ? 'Explorer'
          : view === 'security'
            ? 'Security'
            : 'Source Control'
      }
    >
      <h2>
        {view === 'explorer'
          ? (workspaceName ?? sampleProject.name)
          : view === 'security'
            ? 'Security'
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
          <button type="button" className="sidebar-action" onClick={onRenameEntry}>
            Rename
          </button>
          <button type="button" className="sidebar-action" onClick={onDeleteEntry}>
            Delete
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
              selectedRelativePath={selectedRelativePath}
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
        ) : view === 'security' ? (
          <SecurityFindings
            workspaceName={workspaceName}
            report={securityReport}
            error={securityError}
            scanning={securityScanning}
            onScan={onScanSecurity}
            onOpenFinding={onOpenSecurityFinding}
          />
        ) : !workspaceName ? (
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
        ) : (
          <GitChanges
            changes={gitChanges}
            error={gitError}
            onRefresh={onRefreshGit}
            onOpenDiff={onOpenGitDiff}
            onToggleStage={onToggleGitStage}
            onCommit={onGitCommit}
          />
        )}
      </div>
      {view === 'explorer' && !workspaceName && (
        <p className="sidebar-note">Sample data. These files are not on disk.</p>
      )}
      {view === 'source-control' && !workspaceName && (
        <p className="sidebar-note">Sample data. These changes are not from Git.</p>
      )}
    </aside>
  )
}

function SecurityFindings({
  workspaceName,
  report,
  error,
  scanning,
  onScan,
  onOpenFinding,
}) {
  const secretCount = report?.secrets.length ?? 0
  const dependencyCount = report?.dependencies.length ?? 0

  return (
    <>
      <button
        type="button"
        className="sidebar-action"
        onClick={onScan}
        disabled={!workspaceName || scanning}
      >
        {scanning ? 'Scanning…' : 'Scan folder'}
      </button>
      {!workspaceName ? (
        <p className="tree-message">Open a folder to scan it. Findings stay read-only.</p>
      ) : error ? (
        <p className="tree-message">{error}</p>
      ) : !report ? (
        <p className="tree-message">
          {scanning
            ? 'Scanning the open folder…'
            : 'Scan checks for secrets and known dependency problems. It does not change files.'}
        </p>
      ) : (
        <>
          <p className="tree-message">
            {secretCount === 0
              ? 'No secrets found'
              : `${secretCount} secret ${secretCount === 1 ? 'finding' : 'findings'}`}
            {report.dependencySummary
              ? `. Dependencies: ${report.dependencySummary.critical} critical, ${report.dependencySummary.high} high, ${report.dependencySummary.moderate} moderate, ${report.dependencySummary.low} low.`
              : '.'}{' '}
            {report.scannedFiles} files checked.
          </p>
          {report.notes.map((note) => (
            <p key={note} className="tree-message">
              {note}
            </p>
          ))}
          {secretCount > 0 && (
            <ul className="change-list">
              {report.secrets.map((finding) => (
                <li key={`${finding.path}:${finding.line}:${finding.kind}`}>
                  <button type="button" onClick={() => onOpenFinding(finding)}>
                    <span>{finding.kind}</span>
                    <span className="tree-label">
                      {finding.path}:{finding.line}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {dependencyCount > 0 && (
            <ul className="change-list">
              {report.dependencies.map((finding) => (
                <li key={`${finding.severity}:${finding.name}:${finding.title}`}>
                  <div className="security-dependency">
                    <span className={`severity-${finding.severity}`}>{finding.severity}</span>
                    <span className="tree-label">
                      {finding.name}: {finding.title}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  )
}

function GitChanges({
  changes,
  error,
  onRefresh,
  onOpenDiff,
  onToggleStage,
  onCommit,
}) {
  const [message, setMessage] = useState('')

  async function submit(event) {
    event.preventDefault()
    const trimmed = message.trim()
    if (!trimmed) {
      return
    }
    const committed = await onCommit(trimmed)
    if (committed) {
      setMessage('')
    }
  }

  return (
    <>
      <button type="button" className="sidebar-action" onClick={onRefresh}>
        Refresh
      </button>
      {error ? (
        <p className="sidebar-note">{error}</p>
      ) : changes === null ? (
        <p className="tree-message">Loading…</p>
      ) : (
        <>
          <form className="git-commit" onSubmit={submit}>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Commit message"
              aria-label="Commit message"
            />
            <button type="submit" disabled={!message.trim()}>
              Commit
            </button>
          </form>
          {changes.length === 0 ? (
            <p className="tree-message">No changes.</p>
          ) : (
            <ul className="change-list">
              {changes.map((change) => (
                <li key={change.path} className="change-row">
                  <button type="button" onClick={() => onOpenDiff(change.path)}>
                    <span>{change.label}</span>
                    <span className="tree-label">{change.path}</span>
                  </button>
                  <button type="button" onClick={() => onToggleStage(change)}>
                    {change.staged && !change.unstaged ? 'Unstage' : 'Stage'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
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
  selectedRelativePath,
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
                  className={
                    node.relativePath === selectedRelativePath
                      ? 'tree-item active'
                      : 'tree-item'
                  }
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
                    selectedRelativePath={selectedRelativePath}
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
                  node.relativePath === selectedRelativePath
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
