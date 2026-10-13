import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { stopProcess } from './workspaceCommand.js'
import { isInsideRoot, toPortableRelative } from './workspaceFiles.js'

const MAX_SCAN_FILES = 2000
const MAX_SCAN_BYTES = 256 * 1024
const MAX_FINDINGS = 50
const MAX_AUDIT_BYTES = 1024 * 1024
const AUDIT_TIMEOUT_MS = 60_000
const SEVERITIES = ['critical', 'high', 'moderate', 'low', 'info']

const SKIP_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
])

const SKIP_FILES = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
])

const SECRET_NAMES =
  /(?:secret|password|passwd|token|api[-_]?key|private[-_]?key|access[-_]?key)/i

function emptySummary() {
  return { critical: 0, high: 0, moderate: 0, low: 0, info: 0 }
}

function hasNullByte(buffer) {
  return buffer.includes(0)
}

function isEnvFile(fileName) {
  const base = path.basename(fileName)
  if (
    base === '.env.example' ||
    base === '.env.sample' ||
    base === '.env.template' ||
    base.endsWith('.example')
  ) {
    return false
  }
  return base === '.env' || base.startsWith('.env.')
}

function isPlaceholder(value) {
  const trimmed = value.trim().replace(/^['"]|['"]$/g, '')
  if (trimmed.length < 8 || trimmed.includes('${') || trimmed.startsWith('<')) {
    return true
  }
  const lower = trimmed.toLowerCase()
  if (
    lower.includes('example') ||
    lower.includes('changeme') ||
    lower.includes('placeholder') ||
    lower.includes('your-api') ||
    lower.includes('your_api')
  ) {
    return true
  }
  return (
    lower === 'password' ||
    lower === 'secret' ||
    lower === 'todo' ||
    lower === 'sample' ||
    lower === 'dummy' ||
    lower === 'fake' ||
    lower === 'test' ||
    lower === 'testing' ||
    lower === 'xxxxxxxx' ||
    lower === '12345678'
  )
}

function lineHasPrivateKey(line) {
  const header = `-----${'BEGIN'} `
  const footer = `${'PRIVATE'} KEY-----`
  return line.includes(header) && line.includes(footer)
}

function tokenKind(line) {
  if (lineHasPrivateKey(line)) {
    return 'Private key'
  }

  const aws = line.match(/\bAKIA[0-9A-Z]{16}\b/)
  if (aws && !aws[0].endsWith('EXAMPLE')) {
    return 'AWS access key'
  }

  if (
    /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/.test(line) ||
    /\bgithub_pat_[A-Za-z0-9_]{20,}\b/.test(line)
  ) {
    return 'GitHub token'
  }

  if (/\bxox[baprs]-[A-Za-z0-9-]{10,}/.test(line)) {
    return 'Slack token'
  }

  if (/\bAIza[0-9A-Za-z_-]{35}\b/.test(line)) {
    return 'Google API key'
  }

  if (/\b(?:sk|rk)_live_[0-9A-Za-z]{16,}\b/.test(line)) {
    return 'Stripe secret key'
  }

  if (/\bnpm_[A-Za-z0-9]{36}\b/.test(line)) {
    return 'npm access token'
  }

  return null
}

function assignedSecret(line) {
  const match = line.match(
    /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/,
  )
  if (!match || !SECRET_NAMES.test(match[1]) || isPlaceholder(match[2])) {
    return null
  }
  return `Assigned secret (${match[1]})`
}

function findingsInText(relativePath, text, envFile) {
  const findings = []
  const lines = text.split(/\r?\n/)
  const limit = Math.min(lines.length, 5000)
  for (let index = 0; index < limit; index += 1) {
    const line = lines[index]
    const kind = tokenKind(line) ?? (envFile ? assignedSecret(line) : null)
    if (!kind) {
      continue
    }
    findings.push({
      path: relativePath,
      line: index + 1,
      kind,
    })
    if (findings.length >= MAX_FINDINGS) {
      break
    }
  }
  return findings
}

async function scanFile(realPath, relativePath, findings) {
  const info = await fs.stat(realPath)
  if (!info.isFile() || info.size > MAX_SCAN_BYTES || info.size === 0) {
    return
  }

  const handle = await fs.open(realPath, 'r')
  try {
    const buffer = Buffer.alloc(info.size)
    await handle.read(buffer, 0, info.size, 0)
    if (hasNullByte(buffer)) {
      return
    }
    const text = buffer.toString('utf8')
    const found = findingsInText(relativePath, text, isEnvFile(relativePath))
    for (const finding of found) {
      if (findings.length >= MAX_FINDINGS) {
        return
      }
      findings.push(finding)
    }
  } finally {
    await handle.close()
  }
}

function rememberPath(seen, realPath) {
  const key = process.platform === 'win32' ? realPath.toLowerCase() : realPath
  if (seen.has(key)) {
    return false
  }
  seen.add(key)
  return true
}

export async function scanSecrets(root) {
  const findings = []
  const pending = [root]
  const seen = new Set()
  rememberPath(seen, root)
  let scannedFiles = 0
  let truncated = false

  while (pending.length > 0 && findings.length < MAX_FINDINGS) {
    const directory = pending.pop()
    let entries
    try {
      entries = await fs.readdir(directory, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if (entry.name === '.' || entry.name === '..' || entry.name.includes('\0')) {
        continue
      }
      const childPath = path.join(directory, entry.name)
      let listed
      try {
        listed = await fs.lstat(childPath)
      } catch {
        continue
      }

      let realPath = childPath
      if (listed.isSymbolicLink()) {
        try {
          realPath = await fs.realpath(childPath)
        } catch {
          continue
        }
        if (!isInsideRoot(root, realPath)) {
          continue
        }
        try {
          listed = await fs.stat(realPath)
        } catch {
          continue
        }
      }

      if (listed.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name) && rememberPath(seen, realPath)) {
          pending.push(realPath)
        }
        continue
      }
      if (!listed.isFile() || SKIP_FILES.has(entry.name)) {
        continue
      }
      if (scannedFiles >= MAX_SCAN_FILES) {
        truncated = true
        pending.length = 0
        break
      }
      scannedFiles += 1
      try {
        await scanFile(realPath, toPortableRelative(root, childPath), findings)
      } catch {
        // A file that disappears or cannot be read is skipped.
      }
      if (findings.length >= MAX_FINDINGS) {
        truncated = true
        pending.length = 0
        break
      }
    }
  }

  return { findings, scannedFiles, truncated }
}

function auditTitle(name, severity, via) {
  if (Array.isArray(via)) {
    const advisory = via.find((item) => item && typeof item.title === 'string')
    if (advisory) {
      return advisory.title.replace(/\s+/g, ' ').slice(0, 180)
    }
  }
  return `${name} has a known ${severity} problem`
}

export function parseAuditReport(stdout) {
  const start = stdout.indexOf('{')
  if (start === -1) {
    return null
  }
  let report
  try {
    report = JSON.parse(stdout.slice(start))
  } catch {
    return null
  }
  if (!report || typeof report.vulnerabilities !== 'object' || report.vulnerabilities === null) {
    return null
  }

  const summary = emptySummary()
  const counts = report.metadata?.vulnerabilities
  if (counts && typeof counts === 'object') {
    for (const severity of SEVERITIES) {
      const count = counts[severity]
      summary[severity] = Number.isInteger(count) && count > 0 ? count : 0
    }
  }

  const findings = []
  for (const item of Object.values(report.vulnerabilities)) {
    if (!item || typeof item.name !== 'string') {
      continue
    }
    const severity = SEVERITIES.includes(item.severity) ? item.severity : 'low'
    if (!counts) {
      summary[severity] += 1
    }
    if (findings.length >= MAX_FINDINGS) {
      continue
    }
    findings.push({
      name: item.name.slice(0, 120),
      severity,
      title: auditTitle(item.name, severity, item.via),
    })
  }

  findings.sort((left, right) => {
    return SEVERITIES.indexOf(left.severity) - SEVERITIES.indexOf(right.severity)
  })
  return { findings, summary }
}

function runNpmAudit(cwd, onStart) {
  return new Promise((resolve) => {
    let child
    try {
      // The command string is fixed. The renderer cannot choose it.
      child = spawn('npm audit --json --package-lock-only', {
        cwd,
        shell: true,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          npm_config_fund: 'false',
          NO_UPDATE_NOTIFIER: '1',
        },
      })
    } catch (error) {
      resolve({
        findings: [],
        summary: null,
        note: auditStartNote(error),
      })
      return
    }

    onStart?.(child)

    const chunks = []
    const errorChunks = []
    let size = 0
    let errorSize = 0
    let truncated = false
    let timedOut = false
    let settled = false
    const timer = setTimeout(() => {
      timedOut = true
      stopProcess(child)
    }, AUDIT_TIMEOUT_MS)

    function finish(result) {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      resolve(result)
    }

    child.stdout?.on('data', (chunk) => {
      if (size >= MAX_AUDIT_BYTES) {
        truncated = true
        return
      }
      const remaining = MAX_AUDIT_BYTES - size
      chunks.push(chunk.subarray(0, remaining))
      size += Math.min(chunk.length, remaining)
      if (chunk.length > remaining) {
        truncated = true
        stopProcess(child)
      }
    })
    child.stderr?.on('data', (chunk) => {
      if (errorSize >= 1024) {
        return
      }
      const remaining = 1024 - errorSize
      errorChunks.push(chunk.subarray(0, remaining))
      errorSize += Math.min(chunk.length, remaining)
    })
    child.on('error', (error) => {
      finish({
        findings: [],
        summary: null,
        note: auditStartNote(error),
      })
    })
    child.on('close', () => {
      if (timedOut) {
        finish({
          findings: [],
          summary: null,
          note: 'The dependency check timed out.',
        })
        return
      }
      if (truncated) {
        finish({
          findings: [],
          summary: null,
          note: 'The dependency report was too large to read.',
        })
        return
      }
      const parsed = parseAuditReport(Buffer.concat(chunks).toString('utf8'))
      if (!parsed) {
        const detail = Buffer.concat(errorChunks)
          .toString('utf8')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 180)
        finish({
          findings: [],
          summary: null,
          note: detail || 'npm audit did not return a dependency report.',
        })
        return
      }
      finish({ ...parsed, note: null })
    })
  })
}

function auditStartNote(error) {
  if (error?.code === 'ENOENT') {
    return 'npm is not available on this computer.'
  }
  return 'The dependency check could not be started.'
}

export async function auditDependencies(root, onStart) {
  let packageInfo
  try {
    packageInfo = await fs.stat(path.join(root, 'package.json'))
  } catch {
    return {
      findings: [],
      summary: null,
      note: 'This folder has no package.json, so dependency problems were not checked.',
    }
  }
  if (!packageInfo.isFile()) {
    return {
      findings: [],
      summary: null,
      note: 'This folder has no package.json, so dependency problems were not checked.',
    }
  }

  let lockInfo = null
  try {
    lockInfo = await fs.stat(path.join(root, 'package-lock.json'))
  } catch {
    lockInfo = null
  }
  if (!lockInfo?.isFile()) {
    return {
      findings: [],
      summary: null,
      note: 'This folder has no package-lock.json, so known dependency problems were not checked.',
    }
  }

  return runNpmAudit(root, onStart)
}

export async function scanWorkspace(root, options = {}) {
  const secrets = await scanSecrets(root)
  const dependencies = await auditDependencies(root, options.onAuditStart)
  const notes = []
  if (secrets.truncated) {
    notes.push('The secret scan stopped early because the folder is large.')
  }
  if (dependencies.note) {
    notes.push(dependencies.note)
  }
  return {
    secrets: secrets.findings,
    scannedFiles: secrets.scannedFiles,
    dependencies: dependencies.findings,
    dependencySummary: dependencies.summary,
    notes,
  }
}
