import fs from 'node:fs/promises'
import { resolveEdge } from './workspaceGraph.js'
import { resolveInsideRoot, toPortableRelative } from './workspaceFiles.js'
import { importedBindings, locateExport } from '../src/languageSymbols.js'

const MAX_CONTENT_BYTES = 1024 * 1024
const MAX_HOPS = 3

function assertName(name) {
  if (typeof name !== 'string' || !/^[A-Za-z_$][\w$]*$/.test(name) || name.length > 200) {
    throw new Error('Place the cursor on a name.')
  }
}

function assertContent(content) {
  if (typeof content !== 'string' || content.includes('\0')) {
    throw new Error('The editor text could not be read.')
  }
  if (Buffer.byteLength(content) > MAX_CONTENT_BYTES) {
    throw new Error('Files larger than 1 MB are not supported yet.')
  }
}

async function readText(realPath) {
  const info = await fs.stat(realPath)
  if (!info.isFile() || info.size > MAX_CONTENT_BYTES) {
    return null
  }
  const buffer = await fs.readFile(realPath)
  if (buffer.includes(0)) {
    return null
  }
  return buffer.toString('utf8')
}

export async function findDefinition(root, relativePath, content, name) {
  assertName(name)
  assertContent(content)
  const fromReal = await resolveInsideRoot(root, relativePath)
  const fromInfo = await fs.stat(fromReal)
  if (!fromInfo.isFile()) {
    throw new Error('Choose a file to look up a definition.')
  }

  const binding = importedBindings(content).find((item) => item.local === name)
  if (!binding) {
    return { kind: 'none' }
  }

  let current = {
    from: toPortableRelative(root, fromReal),
    binding,
  }
  const seen = new Set([current.from])

  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    const edge = await resolveEdge(root, current.from, current.binding.specifier)
    if (!edge) {
      return { kind: 'none' }
    }
    if (edge.kind === 'package') {
      return { kind: 'package', specifier: edge.specifier }
    }
    if (edge.kind === 'outside') {
      return { kind: 'outside' }
    }
    if (edge.kind !== 'file' || !edge.path) {
      return { kind: 'missing', specifier: current.binding.specifier }
    }
    if (seen.has(edge.path)) {
      return { kind: 'file', path: edge.path, line: 1 }
    }
    seen.add(edge.path)

    const realPath = await resolveInsideRoot(root, edge.path)
    const text = await readText(realPath)
    if (text === null) {
      return { kind: 'missing', specifier: current.binding.specifier }
    }
    const located = locateExport(text, current.binding)
    if (!located) {
      return { kind: 'file', path: edge.path, line: 1 }
    }
    if (located.reexport) {
      current = {
        from: edge.path,
        binding: {
          local: name,
          imported: located.reexport.imported,
          specifier: located.reexport.specifier,
          kind: located.reexport.kind,
        },
      }
      continue
    }
    return { kind: 'file', path: edge.path, line: located.line }
  }

  return { kind: 'none' }
}
