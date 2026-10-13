import { spawn } from 'node:child_process'

export const MAX_COMMAND_LENGTH = 1000
export const MAX_OUTPUT_BYTES = 200 * 1024
export const COMMAND_TIMEOUT_MS = 30_000

export function assertCommand(command) {
  if (typeof command !== 'string') {
    throw new Error('Enter a command.')
  }
  const trimmed = command.trim()
  if (!trimmed) {
    throw new Error('Enter a command.')
  }
  if (trimmed.length > MAX_COMMAND_LENGTH || trimmed.includes('\0')) {
    throw new Error('That command is not allowed.')
  }
  return trimmed
}

export function stopProcess(child) {
  if (!child?.pid) {
    return
  }
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      windowsHide: true,
      stdio: 'ignore',
    })
    return
  }
  child.kill()
}

export function runCommandInDirectory(cwd, command, options = {}) {
  const trimmed = assertCommand(command)
  const timeoutMs = options.timeoutMs ?? COMMAND_TIMEOUT_MS
  const maxOutputBytes = options.maxOutputBytes ?? MAX_OUTPUT_BYTES

  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawn(trimmed, {
        cwd,
        shell: true,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      reject(new Error('The command could not be started.', { cause: error }))
      return
    }

    options.onStart?.(child)

    const chunks = []
    let size = 0
    let truncated = false
    let timedOut = false
    let settled = false
    let timer
    let stopTimer

    function finish(result) {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      clearTimeout(stopTimer)
      resolve(result)
    }

    function stop(reason) {
      if (reason === 'timeout') {
        timedOut = true
      }
      if (reason === 'output') {
        truncated = true
      }
      stopProcess(child)
      stopTimer = setTimeout(() => {
        finish({
          output: Buffer.concat(chunks).toString('utf8'),
          exitCode: null,
          timedOut,
          truncated,
        })
      }, 2000)
    }

    function push(chunk) {
      if (truncated || timedOut) {
        return
      }
      if (size + chunk.length > maxOutputBytes) {
        const remaining = maxOutputBytes - size
        if (remaining > 0) {
          chunks.push(chunk.subarray(0, remaining))
        }
        size = maxOutputBytes
        stop('output')
        return
      }
      chunks.push(chunk)
      size += chunk.length
    }

    child.stdout?.on('data', push)
    child.stderr?.on('data', push)
    child.on('error', (error) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      clearTimeout(stopTimer)
      reject(new Error('The command could not be started.', { cause: error }))
    })
    child.on('close', (code) => {
      finish({
        output: Buffer.concat(chunks).toString('utf8'),
        exitCode: timedOut || truncated ? null : code,
        timedOut,
        truncated,
      })
    })
    timer = setTimeout(() => stop('timeout'), timeoutMs)
  })
}
