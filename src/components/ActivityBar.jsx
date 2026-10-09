const views = [
  { id: 'explorer', label: 'Explorer' },
  { id: 'source-control', label: 'Source Control' },
]

export default function ActivityBar({ activeView, onSelectView, onNewWindow }) {
  return (
    <nav className="activity-bar" aria-label="Activity bar">
      {views.map((view) => (
        <button
          key={view.id}
          type="button"
          className={
            view.id === activeView ? 'activity-button active' : 'activity-button'
          }
          aria-label={view.label}
          aria-pressed={view.id === activeView}
          title={view.label}
          onClick={() => onSelectView(view.id)}
        >
          {view.id === 'explorer' ? <FolderIcon /> : <BranchIcon />}
        </button>
      ))}
      <button
        type="button"
        className="activity-button new-window-button"
        aria-label="New window"
        title="New window"
        onClick={onNewWindow}
      >
        <NewWindowIcon />
      </button>
    </nav>
  )
}

function NewWindowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="8"
        y="8"
        width="12"
        height="12"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M5 15.5V5.5A1.5 1.5 0 0 1 6.5 4H15"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  )
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-11Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  )
}

function BranchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="6" cy="6" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="6" cy="18" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="18" cy="8" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M6 8.2v7.6M8.1 7.2c2.8.4 6.2.2 7.7.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  )
}
