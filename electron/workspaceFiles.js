import fs from 'node:fs/promises'
import path from 'node:path'

const MAX_DIRECTORY_ENTRIES = 5000
const MAX_RELATIVE_PATH_LENGTH = 4096

// path.relative normalizes ".." segments. A result that still contains ".."
// is outside the root, including a different drive on Windows. A folder named
// "..hidden" stays inside, because the segment is not exactly "..".
export function isInsideRoot(root, candidate) {
  const relative = path.relative(root, candidate)
  if (relative === '') {
    return true
  }
  if (path.isAbsolute(relative)) {
    return false
  }
  return !relative.split(path.sep).includes('..')
}

function assertRelativePath(relativePath) {
  if (typeof relativePath !== 'string') {
    throw new Error('A path inside the open folder is required.')
  }
  if (
    relativePath.length > MAX_RELATIVE_PATH_LENGTH ||
    relativePath.includes('\0') ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error('That path is not allowed.')
  }
}

export async function resolveInsideRoot(root, relativePath) {
  assertRelativePath(relativePath)
  const candidate = path.resolve(root, relativePath)
  let realPath
  try {
    realPath = await fs.realpath(candidate)
  } catch {
    throw new Error('That path could not be opened.')
  }
  if (!isInsideRoot(root, realPath)) {
    throw new Error('That path is outside the open folder.')
  }
  return realPath
}

export function toPortableRelative(root, candidate) {
  return path.relative(root, candidate).split(path.sep).join('/')
}

export async function listDirectory(root, relativePath) {
  const realPath = await resolveInsideRoot(root, relativePath)
  const info = await fs.stat(realPath)
  if (!info.isDirectory()) {
    throw new Error('That path is not a folder.')
  }

  const entries = await fs.readdir(realPath, { withFileTypes: true })
  if (entries.length > MAX_DIRECTORY_ENTRIES) {
    throw new Error(
      `Folders with more than ${MAX_DIRECTORY_ENTRIES} entries are not listed yet.`,
    )
  }

  const children = []
  for (const entry of entries) {
    if (entry.name === '.' || entry.name === '..' || entry.name.includes('\0')) {
      continue
    }

    const childPath = path.join(realPath, entry.name)
    let childReal
    try {
      childReal = await fs.realpath(childPath)
    } catch {
      continue
    }
    if (!isInsideRoot(root, childReal)) {
      continue
    }

    const childInfo = await fs.stat(childReal)
    children.push({
      name: entry.name,
      relativePath: toPortableRelative(root, childPath),
      type: childInfo.isDirectory() ? 'folder' : 'file',
    })
  }

  children.sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === 'folder' ? -1 : 1
    }
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
  })
  return children
}

export async function resolveWorkspaceFile(root, relativePath) {
  const realPath = await resolveInsideRoot(root, relativePath)
  const info = await fs.stat(realPath)
  if (!info.isFile()) {
    throw new Error('That path is not a file.')
  }
  return realPath
}

const INVALID_FILE_NAME = /[<>:"|?*]/

function hasControlCharacter(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < 32 || code === 127) {
      return true
    }
  }
  return false
}

export function portableNewFilePath(input) {
  if (typeof input !== 'string') {
    throw new Error('Enter a file name.')
  }
  const trimmed = input.trim()
  if (!trimmed || trimmed.length > MAX_RELATIVE_PATH_LENGTH) {
    throw new Error('Enter a file name.')
  }
  if (path.isAbsolute(trimmed) || trimmed.includes('\0')) {
    throw new Error('That file name is not allowed.')
  }

  const segments = trimmed.split(/[\\/]+/)
  if (
    segments.length === 0 ||
    segments.some((segment) => segment.length === 0)
  ) {
    throw new Error('That file name is not allowed.')
  }
  for (const segment of segments) {
    assertPathSegment(segment)
  }
  return segments.join('/')
}

function assertPathSegment(segment) {
  if (
    segment === '.' ||
    segment === '..' ||
    segment.endsWith('.') ||
    segment.endsWith(' ') ||
    INVALID_FILE_NAME.test(segment) ||
    hasControlCharacter(segment)
  ) {
    throw new Error('That name is not allowed.')
  }
}

export function entryName(input) {
  if (typeof input !== 'string') {
    throw new Error('Enter a name.')
  }
  const trimmed = input.trim()
  if (!trimmed || trimmed.length > 255) {
    throw new Error('Enter a name.')
  }
  if (
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('\0')
  ) {
    throw new Error('That name is not allowed.')
  }
  assertPathSegment(trimmed)
  return trimmed
}

async function locateEntry(root, relativePath) {
  assertRelativePath(relativePath)
  const segments = relativePath.split(/[\\/]+/).filter((segment) => segment.length > 0)
  if (segments.length === 0) {
    throw new Error('The open folder cannot be changed.')
  }
  for (const segment of segments) {
    if (segment === '.' || segment === '..') {
      throw new Error('That path is not allowed.')
    }
  }

  const name = segments[segments.length - 1]
  const parentPath = segments.slice(0, -1).join('/')
  const parentReal = await resolveInsideRoot(root, parentPath)
  const leafPath = path.join(parentReal, name)
  if (!isInsideRoot(root, leafPath)) {
    throw new Error('That path is outside the open folder.')
  }

  let info
  try {
    info = await fs.lstat(leafPath)
  } catch (error) {
    throw new Error('That path could not be opened.', { cause: error })
  }
  return {
    portable: segments.join('/'),
    parentReal,
    name,
    leafPath,
    info,
  }
}

function entryType(info) {
  if (info.isSymbolicLink()) {
    return 'link'
  }
  if (info.isDirectory()) {
    return 'folder'
  }
  if (info.isFile()) {
    return 'file'
  }
  throw new Error('That path cannot be changed.')
}

export async function createWorkspaceFile(root, input) {
  const relativePath = portableNewFilePath(input)
  const segments = relativePath.split('/')
  const fileName = segments[segments.length - 1]
  const parentPath = segments.slice(0, -1).join('/')

  let parentReal
  try {
    parentReal = await resolveInsideRoot(root, parentPath)
  } catch (error) {
    throw new Error('That folder does not exist in the open folder.', {
      cause: error,
    })
  }
  const parentInfo = await fs.stat(parentReal)
  if (!parentInfo.isDirectory()) {
    throw new Error('That path is not a folder.')
  }

  const candidate = path.resolve(parentReal, fileName)
  if (!isInsideRoot(root, candidate)) {
    throw new Error('That path is outside the open folder.')
  }

  let handle
  try {
    handle = await fs.open(candidate, 'wx')
  } catch (error) {
    if (error.code === 'EEXIST' || error.code === 'EISDIR') {
      throw new Error('That file already exists.', { cause: error })
    }
    throw new Error('That file could not be created.', { cause: error })
  }
  await handle.close()

  let realPath
  try {
    realPath = await fs.realpath(candidate)
    if (!isInsideRoot(root, realPath)) {
      throw new Error('That path is outside the open folder.')
    }
  } catch (error) {
    await fs.rm(candidate, { force: true })
    if (error.message === 'That path is outside the open folder.') {
      throw error
    }
    throw new Error('That file could not be created.', { cause: error })
  }
  return realPath
}

const MAX_REMOVAL_ENTRIES = 5000

async function collectRemoval(root, leafPath) {
  const items = []

  async function walk(target) {
    if (items.length >= MAX_REMOVAL_ENTRIES) {
      throw new Error(
        `Folders with more than ${MAX_REMOVAL_ENTRIES} entries are not deleted yet.`,
      )
    }
    const info = await fs.lstat(target)
    if (info.isSymbolicLink()) {
      items.push({ target, kind: 'link' })
      return
    }

    const realPath = await fs.realpath(target)
    if (!isInsideRoot(root, realPath)) {
      throw new Error('That path is outside the open folder.')
    }
    if (info.isDirectory()) {
      const names = await fs.readdir(realPath)
      for (const name of names) {
        await walk(path.join(realPath, name))
      }
      items.push({ target: realPath, kind: 'dir' })
      return
    }
    if (!info.isFile()) {
      throw new Error('That path cannot be deleted.')
    }
    items.push({ target: realPath, kind: 'file' })
  }

  await walk(leafPath)
  return items
}

export async function renameWorkspaceEntry(root, relativePath, nextName) {
  const name = entryName(nextName)
  const entry = await locateEntry(root, relativePath)
  if (name === entry.name) {
    const realPath = entry.info.isSymbolicLink()
      ? entry.leafPath
      : await fs.realpath(entry.leafPath)
    return {
      type: entryType(entry.info),
      fromRelative: entry.portable,
      toRelative: entry.portable,
      fromReal: realPath,
      toReal: realPath,
    }
  }

  const destination = path.join(entry.parentReal, name)
  if (!isInsideRoot(root, destination)) {
    throw new Error('That path is outside the open folder.')
  }

  const caseOnly =
    entry.leafPath.toLowerCase() === destination.toLowerCase() &&
    process.platform === 'win32'
  if (!caseOnly) {
    try {
      await fs.lstat(destination)
      throw new Error('That name is already used.')
    } catch (error) {
      if (error.message === 'That name is already used.') {
        throw error
      }
      if (error.code !== 'ENOENT') {
        throw new Error('That item could not be renamed.', { cause: error })
      }
    }
  }

  const temporary = path.join(
    entry.parentReal,
    `.riacode-rename-${process.pid}-${Date.now()}`,
  )
  try {
    if (caseOnly) {
      await fs.rename(entry.leafPath, temporary)
      await fs.rename(temporary, destination)
    } else {
      await fs.rename(entry.leafPath, destination)
    }
  } catch (error) {
    if (caseOnly) {
      await fs.rename(temporary, entry.leafPath).catch(() => {})
    }
    throw new Error('That item could not be renamed.', { cause: error })
  }

  let toReal
  try {
    toReal = entry.info.isSymbolicLink()
      ? destination
      : await fs.realpath(destination)
    if (!entry.info.isSymbolicLink() && !isInsideRoot(root, toReal)) {
      throw new Error('That path is outside the open folder.')
    }
  } catch (error) {
    await fs.rename(destination, entry.leafPath).catch(() => {})
    if (error.message === 'That path is outside the open folder.') {
      throw error
    }
    throw new Error('That item could not be renamed.', { cause: error })
  }

  const slash = entry.portable.lastIndexOf('/')
  const parentPortable = slash === -1 ? '' : entry.portable.slice(0, slash)
  const toRelative = parentPortable ? `${parentPortable}/${name}` : name
  const fromReal = entry.info.isSymbolicLink()
    ? entry.leafPath
    : path.join(path.dirname(toReal), entry.name)

  return {
    type: entryType(entry.info),
    fromRelative: entry.portable,
    toRelative,
    fromReal,
    toReal,
  }
}

export async function deleteWorkspaceEntry(root, relativePath) {
  const entry = await locateEntry(root, relativePath)
  const type = entryType(entry.info)
  const items = await collectRemoval(root, entry.leafPath)

  try {
    for (const item of items) {
      if (item.kind !== 'dir') {
        await fs.unlink(item.target)
      }
    }
    // Directories are recorded after their children, so this removes
    // the inner folders before the folder that contained them.
    for (const item of items) {
      if (item.kind === 'dir') {
        await fs.rmdir(item.target)
      }
    }
  } catch (error) {
    throw new Error('That item could not be deleted.', { cause: error })
  }

  const realPath = entry.info.isSymbolicLink()
    ? entry.leafPath
    : items[items.length - 1].target
  return {
    type,
    relativePath: entry.portable,
    realPath,
  }
}
