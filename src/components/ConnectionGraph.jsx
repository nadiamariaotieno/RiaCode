const NODE_WIDTH = 196
const NODE_HEIGHT = 28
const NODE_GAP = 10
const COLUMN_X = 8
const GRAPH_WIDTH = 212

function baseName(filePath) {
  const name = filePath.split('/').pop()
  if (name.length <= 26) {
    return name
  }
  return `${name.slice(0, 24)}…`
}

function placeColumn(items, y) {
  return items.map((item, index) => ({
    ...item,
    x: COLUMN_X,
    y: y + index * (NODE_HEIGHT + NODE_GAP),
  }))
}

export default function ConnectionGraph({
  workspaceName,
  fileName,
  connections,
  error,
  loading,
  onShowConnections,
  onOpenFile,
}) {
  return (
    <>
      <button
        type="button"
        className="sidebar-action"
        onClick={onShowConnections}
        disabled={!workspaceName || loading}
      >
        {loading ? 'Reading connections…' : 'Show me its connections'}
      </button>
      {!workspaceName ? (
        <p className="tree-message">Open a folder, then choose a file.</p>
      ) : error ? (
        <p className="tree-message">{error}</p>
      ) : loading && !connections ? (
        <p className="tree-message">Reading the saved files…</p>
      ) : !connections ? (
        <p className="tree-message">
          {fileName
            ? `Show connections for ${fileName}. This reads saved files.`
            : 'Open a file from this folder, then show its connections.'}
        </p>
      ) : (
        <GraphReport connections={connections} onOpenFile={onOpenFile} />
      )}
    </>
  )
}

function GraphReport({ connections, onOpenFile }) {
  const importedBy = connections.importedBy.slice(0, 12).map((filePath) => ({
    id: `in:${filePath}`,
    path: filePath,
    label: baseName(filePath),
  }))
  const imports = connections.imports
    .filter((edge) => edge.kind === 'file' && edge.path)
    .slice(0, 12)
    .map((edge) => ({
      id: `out:${edge.path}`,
      path: edge.path,
      label: baseName(edge.path),
    }))
  const packages = connections.imports.filter((edge) => edge.kind === 'package')
  const unresolved = connections.imports.filter(
    (edge) => edge.kind === 'missing' || edge.kind === 'outside',
  )

  const importedNodes = placeColumn(importedBy, 8)
  const centerY =
    importedNodes.length > 0
      ? importedNodes[importedNodes.length - 1].y + NODE_HEIGHT + 22
      : 8
  const importNodes = placeColumn(imports, centerY + NODE_HEIGHT + 22)
  const lastY = importNodes.length > 0 ? importNodes[importNodes.length - 1].y : centerY
  const height = lastY + NODE_HEIGHT + 8
  const centerX = COLUMN_X + NODE_WIDTH / 2

  return (
    <>
      <p className="tree-message">
        {connections.scannedFiles} files checked.
        {connections.truncated ? ' The graph stopped early because the folder is large.' : ''}
      </p>
      <svg
        className="xray-graph"
        width={GRAPH_WIDTH}
        height={height}
        viewBox={`0 0 ${GRAPH_WIDTH} ${height}`}
        role="img"
        aria-label={`Connections for ${connections.path}`}
      >
        {importedNodes.map((node) => (
          <line
            key={`${node.id}-edge`}
            x1={centerX}
            y1={node.y + NODE_HEIGHT}
            x2={centerX}
            y2={centerY}
          />
        ))}
        {importNodes.map((node) => (
          <line
            key={`${node.id}-edge`}
            x1={centerX}
            y1={centerY + NODE_HEIGHT}
            x2={centerX}
            y2={node.y}
          />
        ))}
        {importedNodes.map((node) => (
          <GraphNode key={node.id} node={node} onOpen={onOpenFile} />
        ))}
        <GraphNode
          node={{
            id: 'center',
            path: connections.path,
            label: baseName(connections.path),
            x: COLUMN_X,
            y: centerY,
            center: true,
          }}
        />
        {importNodes.map((node) => (
          <GraphNode key={node.id} node={node} onOpen={onOpenFile} />
        ))}
      </svg>
      {importedBy.length === 0 && imports.length === 0 && (
        <p className="tree-message">No other files in this folder import it, and it imports no files.</p>
      )}
      {packages.length > 0 && (
        <p className="tree-message">
          Packages:{' '}
          {packages
            .slice(0, 12)
            .map((edge) => edge.specifier)
            .join(', ')}
          {packages.length > 12 ? '…' : ''}
        </p>
      )}
      {unresolved.length > 0 && (
        <p className="tree-message">
          Unresolved: {unresolved.map((edge) => edge.specifier).join(', ')}
        </p>
      )}
    </>
  )
}

function GraphNode({ node, onOpen }) {
  const interactive = Boolean(onOpen)
  return (
    <g
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? () => onOpen(node.path) : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onOpen(node.path)
              }
            }
          : undefined
      }
    >
      <title>{node.path}</title>
      <rect
        x={node.x}
        y={node.y}
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
        rx="4"
        className={node.center ? 'xray-node xray-center' : 'xray-node'}
      />
      <text x={node.x + 8} y={node.y + 18}>
        {node.label}
      </text>
    </g>
  )
}
