export default function StatusBar({
  fileName,
  theme,
  runtimeLabel,
  panelOpen,
  onToggleTheme,
  onTogglePanel,
}) {
  return (
    <footer className="status-bar">
      <span>{fileName ?? 'No file open'}</span>
      <span className="status-actions">
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
