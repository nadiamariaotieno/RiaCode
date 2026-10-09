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
    if (
      segment === '.' ||
      segment === '..' ||
      segment.endsWith('.') ||
      segment.endsWith(' ') ||
      INVALID_FILE_NAME.test(segment) ||
      hasControlCharacter(segment)
    ) {
      throw new Error('That file name is not allowed.')
    }
  }
  return segments.join('/')
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
