import { useEffect, useRef, useState } from 'react'

export default function BottomPanel({
  workspaceName,
  running,
  output,
  onRunCommand,
}) {
  const [command, setCommand] = useState('')
  const outputRef = useRef(null)

  useEffect(() => {
    const element = outputRef.current
    if (element) {
      element.scrollTop = element.scrollHeight
    }
  }, [output])

  function submit(event) {
    event.preventDefault()
    const trimmed = command.trim()
    if (!trimmed || running || !workspaceName) {
      return
    }
    setCommand('')
    onRunCommand(trimmed)
  }

  return (
    <section className="bottom-panel" aria-label="Terminal">
      <h2>Terminal</h2>
      <pre ref={outputRef} className="terminal-output">
        {output ||
          (workspaceName
            ? 'Run a command in this folder.'
            : 'Open a folder before running a command.')}
      </pre>
      <form className="terminal-form" onSubmit={submit}>
        <input
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder={workspaceName ? 'npm test' : 'Open a folder first'}
          disabled={!workspaceName || running}
          aria-label="Command"
          spellCheck={false}
        />
        <button
          type="submit"
          disabled={!workspaceName || running || !command.trim()}
        >
          {running ? 'Running' : 'Run'}
        </button>
      </form>
    </section>
  )
}
