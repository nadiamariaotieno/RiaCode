import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { stopProcess } from './workspaceCommand.js'
import { resolveInsideRoot } from './workspaceFiles.js'

const MAX_GIT_OUTPUT = 200 * 1024
const MAX_STATUS_ENTRIES = 500
const MAX_COMMIT_MESSAGE = 5000
const GIT_TIMEOUT_MS = 30_000
const MAX_UNTRACKED_PREVIEW = 100 * 1024

function samePath(left, right) {
  if (process.platform === 'win32') {
    return left.toLowerCase() === right.toLowerCase()
  }
  return left === right
}

function runGit(cwd, args) {
  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawn('git', args, {
        cwd,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GCM_INTERACTIVE: 'Never',
        },
      })
    } catch (error) {
      reject(gitStartError(error))
      return
    }

    const stdoutChunks = []
    const stderrChunks = []
    let stdoutSize = 0
    let stderrSize = 0
    let settled = false
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      stopProcess(child)
    }, GIT_TIMEOUT_MS)

    function finish(error, result) {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      if (error) {
        reject(error)
        return
      }
      resolve(result)
    }

    function push(chunks, size, chunk) {
      if (size >= MAX_GIT_OUTPUT) {
        return size
      }
      const remaining = MAX_GIT_OUTPUT - size
      chunks.push(chunk.subarray(0, remaining))
      return size + Math.min(chunk.length, remaining)
    }

    child.stdout?.on('data', (chunk) => {
      stdoutSize = push(stdoutChunks, stdoutSize, chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderrSize = push(stderrChunks, stderrSize, chunk)
    })
    child.on('error', (error) => {
      finish(gitStartError(error))
    })
    child.on('close', (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf8')
      const stderr = Buffer.concat(stderrChunks).toString('utf8').trim()
      if (timedOut) {
        finish(new Error('Git was stopped after 30 seconds.'))
        return
      }
      if (code === 0) {
        finish(null, { stdout, stderr })
        return
      }
      if (stderr.includes('not a git repository')) {
        finish(new Error('This folder is not a Git repository.'))
        return
      }
      finish(
        new Error(stderr || stdout.trim() || 'Git could not finish that request.'),
      )
    })
  })
}

function gitStartError(error) {
  if (error?.code === 'ENOENT') {
    return new Error('Git is not available on this computer.')
  }
  return new Error('Git could not be started.', { cause: error })
}

export function assertGitPath(filePath) {
  if (typeof filePath !== 'string' || filePath.includes('\0')) {
    throw new Error('That path is not allowed.')
  }
  const portable = filePath.split('\\').join('/')
  if (!portable || portable.startsWith('/') || path.win32.isAbsolute(filePath)) {
    throw new Error('That path is not allowed.')
  }
  const parts = portable.split('/')
  if (parts.some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error('That path is not allowed.')
  }
  return portable
}

function assertCommitMessage(message) {
  if (typeof message !== 'string') {
    throw new Error('Enter a commit message.')
  }
  const trimmed = message.trim()
  if (!trimmed) {
    throw new Error('Enter a commit message.')
  }
  if (trimmed.length > MAX_COMMIT_MESSAGE || trimmed.includes('\0')) {
    throw new Error('That commit message is not allowed.')
  }
  return trimmed
}

async function requireRepositoryRoot(cwd) {
  let result
  try {
    result = await runGit(cwd, ['rev-parse', '--show-toplevel'])
  } catch (error) {
    if (error.message === 'This folder is not a Git repository.') {
      throw error
    }
    throw new Error('This folder is not a Git repository.', { cause: error })
  }
  const listedRoot = await fs.realpath(result.stdout.trim())
  const openedRoot = await fs.realpath(cwd)
  if (!samePath(listedRoot, openedRoot)) {
    throw new Error(
      'Open the repository folder itself. This folder is inside a repository.',
    )
  }
  return openedRoot
}

function labelFor(x, y) {
  const code = `${x}${y}`
  if (code === '??') {
    return 'Untracked'
  }
  if (x === 'U' || y === 'U' || code === 'AA' || code === 'DD') {
    return 'Conflict'
  }
  if (x === 'A' || y === 'A') {
    return 'Added'
  }
  if (x === 'D' || y === 'D') {
    return 'Deleted'
  }
  if (x === 'R' || x === 'C') {
    return 'Renamed'
  }
  if (x === 'M' || y === 'M') {
    return 'Modified'
  }
  return 'Changed'
}

function parseStatus(stdout) {
  const changes = []
  let index = 0
  while (index + 4 <= stdout.length) {
    const x = stdout[index]
    const y = stdout[index + 1]
    index += 3
    const end = stdout.indexOf('\0', index)
    if (end === -1) {
      break
    }
    let filePath = stdout.slice(index, end)
    index = end + 1
    if (x === 'R' || x === 'C') {
      const renamedEnd = stdout.indexOf('\0', index)
      if (renamedEnd === -1) {
        break
      }
      filePath = stdout.slice(index, renamedEnd)
      index = renamedEnd + 1
    }
    if (!filePath) {
      continue
    }
    const code = `${x}${y}`
    changes.push({
      path: filePath.split('\\').join('/'),
      label: labelFor(x, y),
      staged: x !== ' ' && x !== '?',
      unstaged: y !== ' ' || code === '??',
    })
    if (changes.length > MAX_STATUS_ENTRIES) {
      throw new Error(
        `More than ${MAX_STATUS_ENTRIES} changes are not listed yet.`,
      )
    }
  }
  return changes
}

export async function gitStatus(cwd) {
  await requireRepositoryRoot(cwd)
  const result = await runGit(cwd, ['status', '--porcelain=v1', '-z', '-uall'])
  return parseStatus(result.stdout)
}

async function untrackedText(cwd, filePath) {
  let realPath
  try {
    realPath = await resolveInsideRoot(cwd, filePath)
  } catch {
    return 'This file is outside the open folder.\n'
  }
  const info = await fs.stat(realPath)
  if (!info.isFile()) {
    return 'This folder is untracked.\n'
  }
  if (info.size > MAX_UNTRACKED_PREVIEW) {
    return 'This new file is too large to show here.\n'
  }
  const buffer = await fs.readFile(realPath)
  if (buffer.includes(0)) {
    return 'This new file does not look like text.\n'
  }
  return `New file\n\n${buffer.toString('utf8')}`
}

export async function gitDiff(cwd, filePath) {
  await requireRepositoryRoot(cwd)
  const safePath = assertGitPath(filePath)
  const staged = await runGit(cwd, ['diff', '--cached', '--no-ext-diff', '--', safePath])
  const unstaged = await runGit(cwd, ['diff', '--no-ext-diff', '--', safePath])
  const parts = []
  if (staged.stdout) {
    parts.push(staged.stdout)
  }
  if (unstaged.stdout) {
    parts.push(unstaged.stdout)
  }
  if (parts.length === 0) {
    parts.push(await untrackedText(cwd, safePath))
  }
  let text = parts.join('\n')
  if (Buffer.byteLength(text) > MAX_GIT_OUTPUT) {
    text = `${text.slice(0, MAX_GIT_OUTPUT)}\nDiff was cut off.\n`
  }
  return text
}

export async function gitStage(cwd, filePath, stage) {
  await requireRepositoryRoot(cwd)
  const safePath = assertGitPath(filePath)
  if (stage) {
    await runGit(cwd, ['add', '--', safePath])
  } else {
    await runGit(cwd, ['restore', '--staged', '--', safePath])
  }
}

export async function gitCommit(cwd, message) {
  await requireRepositoryRoot(cwd)
  const text = assertCommitMessage(message)
  const staged = await runGit(cwd, ['diff', '--cached', '--name-only', '-z'])
  if (!staged.stdout) {
    throw new Error('Stage a change before committing.')
  }
  const result = await runGit(cwd, ['commit', '-m', text])
  return result.stdout.trim() || 'Committed'
}
