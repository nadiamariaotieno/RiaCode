import fs from 'node:fs/promises'
import path from 'node:path'
import { isInsideRoot, resolveInsideRoot, toPortableRelative } from './workspaceFiles.js'

const MAX_GRAPH_FILES = 2000
const MAX_FILE_BYTES = 256 * 1024
const MAX_EDGES = 80
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.css'])
const RESOLVE_EXTENSIONS = ['.js', '.jsx', '.mjs', '.cjs', '.css', '.json']
const SKIP_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
])

function samePath(left, right) {
  if (process.platform === 'win32') {
    return left.toLowerCase() === right.toLowerCase()
  }
  return left === right
}

function isIdentifierChar(code) {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 36 ||
    code === 95
  )
}

function matchKeyword(source, index, word) {
  if (!source.startsWith(word, index)) {
    return false
  }
  const before = index > 0 ? source.charCodeAt(index - 1) : 0
  const after = source.charCodeAt(index + word.length)
  return !isIdentifierChar(before) && !isIdentifierChar(after)
}

function skipString(source, index) {
  const quote = source[index]
  let cursor = index + 1
  while (cursor < source.length) {
    if (source[cursor] === '\\') {
      cursor += 2
      continue
    }
    if (source[cursor] === quote) {
      return cursor + 1
    }
    cursor += 1
  }
  return cursor
}

function skipLineComment(source, index) {
  let cursor = index
  while (cursor < source.length && source[cursor] !== '\n') {
    cursor += 1
  }
  return cursor
}

function skipBlockComment(source, index) {
  let cursor = index + 2
  while (cursor < source.length) {
    if (source[cursor] === '*' && source[cursor + 1] === '/') {
      return cursor + 2
    }
    cursor += 1
  }
  return cursor
}

function skipSpaceAndComments(source, index) {
  let cursor = index
  while (cursor < source.length) {
    const char = source[cursor]
    const next = source[cursor + 1]
    if (char === ' ' || char === '\t' || char === '\r' || char === '\n') {
      cursor += 1
      continue
    }
    if (char === '/' && next === '/') {
      cursor = skipLineComment(source, cursor)
      continue
    }
    if (char === '/' && next === '*') {
      cursor = skipBlockComment(source, cursor)
      continue
    }
    break
  }
  return cursor
}

function readQuoted(source, index) {
  const quote = source[index]
  if (quote !== "'" && quote !== '"') {
    return null
  }
  let cursor = index + 1
  let value = ''
  while (cursor < source.length) {
    const char = source[cursor]
    if (char === '\\') {
      value += source[cursor + 1] ?? ''
      cursor += 2
      continue
    }
    if (char === quote) {
      return { specifier: value, end: cursor + 1 }
    }
    if (char === '\n') {
      return null
    }
    value += char
    cursor += 1
  }
  return null
}

function readNextSpecifier(source, index) {
  let cursor = index
  const end = Math.min(source.length, index + 800)
  while (cursor < end) {
    cursor = skipSpaceAndComments(source, cursor)
    if (cursor >= end) {
      return null
    }
    const char = source[cursor]
    if (char === "'" || char === '"') {
      return readQuoted(source, cursor)
    }
    if (char === ';') {
      return null
    }
    cursor += 1
  }
  return null
}

function readModuleSpecifier(source, index, bareString) {
  let cursor = index
  let depth = 0
  const end = Math.min(source.length, index + 800)
  while (cursor < end) {
    cursor = skipSpaceAndComments(source, cursor)
    if (cursor >= end) {
      return null
    }
    const char = source[cursor]
    if (char === "'" || char === '"') {
      if (bareString && depth === 0) {
        return readQuoted(source, cursor)
      }
      cursor = skipString(source, cursor)
      continue
    }
    if (char === '{') {
      depth += 1
      cursor += 1
      continue
    }
    if (char === '}') {
      depth = Math.max(0, depth - 1)
      cursor += 1
      continue
    }
    if (char === ';') {
      return null
    }
    if (depth === 0 && matchKeyword(source, cursor, 'from')) {
      return readNextSpecifier(source, cursor + 4)
    }
    cursor += 1
  }
  return null
}

export function extractSpecifiers(source, extension) {
  if (extension === '.css') {
    return extractCssSpecifiers(source)
  }
  return extractScriptSpecifiers(source)
}

function extractScriptSpecifiers(source) {
  const specifiers = []
  let index = 0
  while (index < source.length && specifiers.length < MAX_EDGES) {
    const char = source[index]
    const next = source[index + 1]
    if (char === "'" || char === '"' || char === '`') {
      index = skipString(source, index)
      continue
    }
    if (char === '/' && next === '/') {
      index = skipLineComment(source, index)
      continue
    }
    if (char === '/' && next === '*') {
      index = skipBlockComment(source, index)
      continue
    }

    if (matchKeyword(source, index, 'import')) {
      const after = skipSpaceAndComments(source, index + 'import'.length)
      const quoted =
        source[after] === '('
          ? readNextSpecifier(source, after + 1)
          : readModuleSpecifier(source, after, true)
      if (quoted?.specifier) {
        specifiers.push(quoted.specifier)
        index = quoted.end
        continue
      }
    }

    if (matchKeyword(source, index, 'export')) {
      const quoted = readModuleSpecifier(source, index + 'export'.length, false)
      if (quoted?.specifier) {
        specifiers.push(quoted.specifier)
        index = quoted.end
        continue
      }
    }

    if (matchKeyword(source, index, 'require')) {
      const after = skipSpaceAndComments(source, index + 'require'.length)
      if (source[after] === '(') {
        const quoted = readNextSpecifier(source, after + 1)
        if (quoted?.specifier) {
          specifiers.push(quoted.specifier)
          index = quoted.end
          continue
        }
      }
    }

    index += 1
  }
  return specifiers
}

function extractCssSpecifiers(source) {
  const specifiers = []
  let index = 0
  while (index < source.length && specifiers.length < MAX_EDGES) {
    const char = source[index]
    const next = source[index + 1]
    if (char === '/' && next === '*') {
      index = skipBlockComment(source, index)
      continue
    }
    if (source.startsWith('@import', index) && !isIdentifierChar(source.charCodeAt(index + 7))) {
      const quoted = readNextSpecifier(source, index + '@import'.length)
      if (quoted?.specifier) {
        specifiers.push(quoted.specifier)
        index = quoted.end
        continue
      }
    }
    if (char === "'" || char === '"') {
      index = skipString(source, index)
      continue
    }
    index += 1
  }
  return specifiers
}

function cleanSpecifier(specifier) {
  const query = specifier.indexOf('?')
  const hash = specifier.indexOf('#')
  let end = specifier.length
  if (query !== -1) {
    end = Math.min(end, query)
  }
  if (hash !== -1) {
    end = Math.min(end, hash)
  }
  return specifier.slice(0, end)
}

function rememberPath(seen, realPath) {
  const key = process.platform === 'win32' ? realPath.toLowerCase() : realPath
  if (seen.has(key)) {
    return false
  }
  seen.add(key)
  return true
}

async function resolveEdge(root, fromRelative, specifier) {
  const cleaned = cleanSpecifier(specifier)
  if (!cleaned || cleaned.includes('\0')) {
    return null
  }
  if (!cleaned.startsWith('.')) {
    return { specifier: cleaned, path: null, kind: 'package' }
  }

  const fromDir = path.posix.dirname(fromRelative)
  const joined = path.posix.normalize(path.posix.join(fromDir, cleaned))
  if (joined === '..' || joined.startsWith('../')) {
    return { specifier: cleaned, path: null, kind: 'outside' }
  }

  const extension = path.posix.extname(joined)
  const candidates = RESOLVE_EXTENSIONS.includes(extension)
    ? [joined]
    : [
        ...RESOLVE_EXTENSIONS.map((item) => `${joined}${item}`),
        ...['.js', '.jsx'].map((item) => `${joined}/index${item}`),
      ]

  for (const candidate of candidates) {
    try {
      const realPath = await resolveInsideRoot(root, candidate)
      const info = await fs.stat(realPath)
      if (!info.isFile()) {
        continue
      }
      return {
        specifier: cleaned,
        path: toPortableRelative(root, realPath),
        kind: 'file',
      }
    } catch {
      // Try the next extension. A miss is not an error.
    }
  }

  return { specifier: cleaned, path: null, kind: 'missing' }
}

async function edgesForFile(root, relativePath, text) {
  const extension = path.posix.extname(relativePath)
  const specifiers = extractSpecifiers(text, extension)
  const edges = []
  const seen = new Set()
  for (const specifier of specifiers) {
    if (edges.length >= MAX_EDGES) {
      break
    }
    const edge = await resolveEdge(root, relativePath, specifier)
    if (!edge) {
      continue
    }
    const key = edge.path ?? `${edge.kind}:${edge.specifier}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    edges.push(edge)
  }
  return edges
}

async function readSource(realPath) {
  const info = await fs.stat(realPath)
  if (!info.isFile() || info.size === 0 || info.size > MAX_FILE_BYTES) {
    return null
  }
  const handle = await fs.open(realPath, 'r')
  try {
    const buffer = Buffer.alloc(info.size)
    await handle.read(buffer, 0, info.size, 0)
    if (buffer.includes(0)) {
      return null
    }
    return buffer.toString('utf8')
  } finally {
    await handle.close()
  }
}

export async function buildImportGraph(root) {
  const files = new Map()
  const pending = [root]
  const seen = new Set()
  rememberPath(seen, root)
  let scannedFiles = 0
  let truncated = false

  while (pending.length > 0) {
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
      if (!listed.isFile() || !SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        continue
      }
      if (scannedFiles >= MAX_GRAPH_FILES) {
        truncated = true
        pending.length = 0
        break
      }
      scannedFiles += 1
      const relativePath = toPortableRelative(root, realPath)
      try {
        const text = await readSource(realPath)
        if (text === null) {
          files.set(relativePath, [])
          continue
        }
        files.set(relativePath, await edgesForFile(root, relativePath, text))
      } catch {
        files.set(relativePath, [])
      }
    }
  }

  return { files, scannedFiles, truncated }
}

function lookup(files, target) {
  if (files.has(target)) {
    return files.get(target)
  }
  if (process.platform !== 'win32') {
    return []
  }
  for (const [file, edges] of files) {
    if (samePath(file, target)) {
      return edges
    }
  }
  return []
}

export async function connectionsFromGraph(root, relativePath, graph) {
  const realPath = await resolveInsideRoot(root, relativePath)
  const info = await fs.stat(realPath)
  if (!info.isFile()) {
    throw new Error('Choose a file to see its connections.')
  }

  const target = toPortableRelative(root, realPath)
  const imports = lookup(graph.files, target)
  const importedBy = []
  for (const [file, edges] of graph.files) {
    if (
      edges.some((edge) => edge.kind === 'file' && edge.path && samePath(edge.path, target))
    ) {
      importedBy.push(file)
    }
  }
  importedBy.sort((left, right) => left.localeCompare(right))

  return {
    path: target,
    imports,
    importedBy,
    scannedFiles: graph.scannedFiles,
    truncated: graph.truncated,
  }
}

export async function fileConnections(root, relativePath) {
  const graph = await buildImportGraph(root)
  return connectionsFromGraph(root, relativePath, graph)
}
