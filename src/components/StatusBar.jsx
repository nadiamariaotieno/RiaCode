export default function StatusBar({
  fileName,
  statusMessage,
  theme,
  runtimeLabel,
  panelOpen,
  canSave,
  onSave,
  onToggleTheme,
  onTogglePanel,
}) {
  return (
    <footer className="status-bar">
      <span>
        {fileName ?? 'No file open'}
        {statusMessage ? ` — ${statusMessage}` : ''}
      </span>
      <span className="status-actions">
        <button type="button" onClick={onSave} disabled={!canSave}>
          Save
        </button>
        <button type="button" onClick={onTogglePanel}>
          {panelOpen ? 'Hide terminal' : 'Show terminal'}
        </button>
        <button type="button" onClick={onToggleTheme}>
          {theme === 'dark' ? 'Light theme' : 'Dark theme'}
        </button>
        <span>{runtimeLabel}</span>
      </span>
    </footer>
  )
}
