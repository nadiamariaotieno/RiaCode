const views = [
  { id: 'explorer', label: 'Explorer' },
  { id: 'source-control', label: 'Source Control' },
  { id: 'security', label: 'Security' },
  { id: 'xray', label: 'X-Ray' },
  { id: 'outline', label: 'Outline' },
]

const viewIcons = {
  explorer: <FolderIcon />,
  'source-control': <BranchIcon />,
  security: <ShieldIcon />,
  xray: <GraphIcon />,
  outline: <OutlineIcon />,
}

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
          {viewIcons[view.id]}
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

function OutlineIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 7h14M5 12h10M5 17h12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  )
}

function GraphIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="6" cy="7" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17" cy="6" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16" cy="17" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M8 7.4h6.6M7.2 8.8l7.2 6.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3.5 19 6.2v5.4c0 4.2-2.8 7.2-7 8.9-4.2-1.7-7-4.7-7-8.9V6.2L12 3.5Z"
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
