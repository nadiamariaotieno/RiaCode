const MAX_SYMBOLS = 200

function isIdentifierChar(code) {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 36 ||
    code === 95
  )
}

function isIdentifierStart(code) {
  return (
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 36 ||
    code === 95
  )
}

function createState(source) {
  return { source, index: 0, line: 1, depth: 0 }
}

function advance(state, nextIndex) {
  const end = Math.min(nextIndex, state.source.length)
  while (state.index < end) {
    if (state.source[state.index] === '\n') {
      state.line += 1
    }
    state.index += 1
  }
}

function matchKeyword(state, word) {
  if (!state.source.startsWith(word, state.index)) {
    return false
  }
  const before = state.index > 0 ? state.source.charCodeAt(state.index - 1) : 0
  const after = state.source.charCodeAt(state.index + word.length)
  return !isIdentifierChar(before) && !isIdentifierChar(after)
}

function skipSpace(state) {
  while (state.index < state.source.length) {
    const char = state.source[state.index]
    if (char === ' ' || char === '\t' || char === '\r' || char === '\n') {
      advance(state, state.index + 1)
      continue
    }
    break
  }
}

function skipLineComment(state) {
  while (state.index < state.source.length && state.source[state.index] !== '\n') {
    state.index += 1
  }
}

function skipBlockComment(state) {
  advance(state, state.index + 2)
  while (state.index < state.source.length) {
    if (state.source[state.index] === '*' && state.source[state.index + 1] === '/') {
      advance(state, state.index + 2)
      return
    }
    advance(state, state.index + 1)
  }
}

function skipString(state) {
  const quote = state.source[state.index]
  advance(state, state.index + 1)
  while (state.index < state.source.length) {
    if (state.source[state.index] === '\\') {
      advance(state, state.index + 2)
      continue
    }
    if (state.source[state.index] === quote) {
      advance(state, state.index + 1)
      return
    }
    advance(state, state.index + 1)
  }
}

function skipTrivia(state) {
  while (state.index < state.source.length) {
    const char = state.source[state.index]
    const next = state.source[state.index + 1]
    if (char === ' ' || char === '\t' || char === '\r' || char === '\n') {
      advance(state, state.index + 1)
      continue
    }
    if (char === '/' && next === '/') {
      skipLineComment(state)
      continue
    }
    if (char === '/' && next === '*') {
      skipBlockComment(state)
      continue
    }
    break
  }
}

function readIdentifier(state) {
  skipTrivia(state)
  if (!isIdentifierStart(state.source.charCodeAt(state.index))) {
    return null
  }
  const line = state.line
  const start = state.index
  state.index += 1
  while (isIdentifierChar(state.source.charCodeAt(state.index))) {
    state.index += 1
  }
  return { name: state.source.slice(start, state.index), line }
}

function remember(symbols, kind, name) {
  if (!name || symbols.length >= MAX_SYMBOLS) {
    return
  }
  symbols.push({
    name: name.name,
    kind,
    line: name.line,
    depth: name.depth,
  })
}

function readFunctionName(state, symbols) {
  const keyword = 'function'
  advance(state, state.index + keyword.length)
  skipTrivia(state)
  if (state.source[state.index] === '*') {
    advance(state, state.index + 1)
  }
  const name = readIdentifier(state)
  if (name) {
    remember(symbols, 'function', { ...name, depth: state.depth })
  }
}

function readClassName(state, symbols) {
  advance(state, state.index + 'class'.length)
  const name = readIdentifier(state)
  if (name) {
    remember(symbols, 'class', { ...name, depth: state.depth })
  }
}

function skipNested(state, opener, closer) {
  let depth = 1
  advance(state, state.index + 1)
  while (state.index < state.source.length && depth > 0) {
    const char = state.source[state.index]
    const next = state.source[state.index + 1]
    if (char === "'" || char === '"' || char === '`') {
      skipString(state)
      continue
    }
    if (char === '/' && next === '/') {
      skipLineComment(state)
      continue
    }
    if (char === '/' && next === '*') {
      skipBlockComment(state)
      continue
    }
    if (char === opener) {
      depth += 1
    } else if (char === closer) {
      depth -= 1
    }
    advance(state, state.index + 1)
  }
}

function skipInitializer(state) {
  while (state.index < state.source.length) {
    const char = state.source[state.index]
    const next = state.source[state.index + 1]
    if (char === "'" || char === '"' || char === '`') {
      skipString(state)
      continue
    }
    if (char === '/' && next === '/') {
      skipLineComment(state)
      continue
    }
    if (char === '/' && next === '*') {
      skipBlockComment(state)
      continue
    }
    if (char === '(') {
      skipNested(state, '(', ')')
      continue
    }
    if (char === '{') {
      skipNested(state, '{', '}')
      continue
    }
    if (char === '[') {
      skipNested(state, '[', ']')
      continue
    }
    if (char === ',' || char === ';') {
      return char
    }
    if (char === '\n' && state.depth >= 0) {
      const rest = state.source.slice(state.index + 1).match(/^[ \t]*/)
      const after = state.source[state.index + 1 + (rest?.[0].length ?? 0)]
      if (after !== ',') {
        return ';'
      }
    }
    advance(state, state.index + 1)
  }
  return ';'
}

function readDeclarations(state, symbols, kind) {
  advance(state, state.index + kind.length)
  while (symbols.length < MAX_SYMBOLS && state.index < state.source.length) {
    skipTrivia(state)
    if (state.source[state.index] === '{' || state.source[state.index] === '[') {
      return
    }
    const name = readIdentifier(state)
    if (!name) {
      return
    }
    remember(symbols, kind, { ...name, depth: state.depth })
    skipTrivia(state)
    const stop = skipInitializer(state)
    if (stop !== ',') {
      return
    }
    advance(state, state.index + 1)
  }
}

export function collectSymbols(source) {
  if (typeof source !== 'string') {
    return []
  }
  const state = createState(source)
  const symbols = []
  while (state.index < state.source.length && symbols.length < MAX_SYMBOLS) {
    const char = state.source[state.index]
    const next = state.source[state.index + 1]
    if (char === "'" || char === '"' || char === '`') {
      skipString(state)
      continue
    }
    if (char === '/' && next === '/') {
      skipLineComment(state)
      continue
    }
    if (char === '/' && next === '*') {
      skipBlockComment(state)
      continue
    }
    if (char === '{') {
      state.depth += 1
      advance(state, state.index + 1)
      continue
    }
    if (char === '}') {
      state.depth = Math.max(0, state.depth - 1)
      advance(state, state.index + 1)
      continue
    }
    if (matchKeyword(state, 'function')) {
      readFunctionName(state, symbols)
      continue
    }
    if (matchKeyword(state, 'class')) {
      readClassName(state, symbols)
      continue
    }
    if (matchKeyword(state, 'const') || matchKeyword(state, 'let') || matchKeyword(state, 'var')) {
      const kind = char === 'c' ? 'const' : char === 'l' ? 'let' : 'var'
      readDeclarations(state, symbols, kind)
      continue
    }
    advance(state, state.index + 1)
  }
  return symbols
}

function readSpecifier(state) {
  skipTrivia(state)
  const quote = state.source[state.index]
  if (quote !== "'" && quote !== '"') {
    return null
  }
  const start = state.index + 1
  skipString(state)
  return state.source.slice(start, state.index - 1)
}

function parseImportClause(clause, specifier, bindings) {
  const text = clause.trim()
  if (!text) {
    return
  }
  if (text.startsWith('*')) {
    const match = text.match(/^\*\s+as\s+([A-Za-z_$][\w$]*)/)
    if (match) {
      bindings.push({
        local: match[1],
        imported: '*',
        specifier,
        kind: 'namespace',
      })
    }
    return
  }

  const brace = text.indexOf('{')
  const before = (brace === -1 ? text : text.slice(0, brace)).replace(/,\s*$/, '').trim()
  if (/^[A-Za-z_$][\w$]*$/.test(before)) {
    bindings.push({
      local: before,
      imported: 'default',
      specifier,
      kind: 'default',
    })
  }
  if (brace === -1) {
    return
  }
  const inside = text.slice(brace + 1, text.lastIndexOf('}'))
  for (const part of inside.split(',')) {
    const pieces = part.trim().split(/\s+as\s+/)
    const imported = pieces[0]?.trim()
    const local = (pieces[1] ?? pieces[0])?.trim()
    if (/^[A-Za-z_$][\w$]*$/.test(imported) && /^[A-Za-z_$][\w$]*$/.test(local)) {
      bindings.push({
        local,
        imported,
        specifier,
        kind: imported === 'default' ? 'default' : 'named',
      })
    }
  }
}

export function importedBindings(source) {
  if (typeof source !== 'string') {
    return []
  }
  const state = createState(source)
  const bindings = []
  while (state.index < state.source.length && bindings.length < MAX_SYMBOLS) {
    const char = state.source[state.index]
    const next = state.source[state.index + 1]
    if (char === "'" || char === '"' || char === '`') {
      skipString(state)
      continue
    }
    if (char === '/' && next === '/') {
      skipLineComment(state)
      continue
    }
    if (char === '/' && next === '*') {
      skipBlockComment(state)
      continue
    }
    if (matchKeyword(state, 'import')) {
      const afterKeyword = state.index + 'import'.length
      advance(state, afterKeyword)
      skipTrivia(state)
      if (state.source[state.index] === '(') {
        continue
      }
      const clauseStart = state.index
      let clauseEnd = state.index
      let specifier = null
      while (state.index < state.source.length) {
        skipTrivia(state)
        if (matchKeyword(state, 'from')) {
          clauseEnd = state.index
          advance(state, state.index + 'from'.length)
          specifier = readSpecifier(state)
          break
        }
        if (state.source[state.index] === "'" || state.source[state.index] === '"') {
          clauseEnd = state.index
          specifier = readSpecifier(state)
          break
        }
        advance(state, state.index + 1)
      }
      if (
        specifier &&
        state.source[clauseStart] !== "'" &&
        state.source[clauseStart] !== '"'
      ) {
        parseImportClause(state.source.slice(clauseStart, clauseEnd), specifier, bindings)
      }
      continue
    }
    if (matchKeyword(state, 'const') || matchKeyword(state, 'let') || matchKeyword(state, 'var')) {
      const saved = state.index
      advance(state, state.index + (char === 'c' ? 5 : 3))
      const name = readIdentifier(state)
      skipTrivia(state)
      if (name && state.source[state.index] === '=') {
        advance(state, state.index + 1)
        skipTrivia(state)
        if (matchKeyword(state, 'require')) {
          advance(state, state.index + 'require'.length)
          skipTrivia(state)
          if (state.source[state.index] === '(') {
            advance(state, state.index + 1)
            const specifier = readSpecifier(state)
            if (specifier) {
              bindings.push({
                local: name.name,
                imported: 'default',
                specifier,
                kind: 'default',
              })
            }
          }
        }
      } else {
        state.index = saved
        advance(state, state.index + 1)
      }
      continue
    }
    advance(state, state.index + 1)
  }
  return bindings
}

export function findDefaultExportLine(source) {
  const state = createState(source)
  while (state.index < state.source.length) {
    const char = state.source[state.index]
    const next = state.source[state.index + 1]
    if (char === "'" || char === '"' || char === '`') {
      skipString(state)
      continue
    }
    if (char === '/' && next === '/') {
      skipLineComment(state)
      continue
    }
    if (char === '/' && next === '*') {
      skipBlockComment(state)
      continue
    }
    if (matchKeyword(state, 'export')) {
      const line = state.line
      advance(state, state.index + 'export'.length)
      skipTrivia(state)
      if (matchKeyword(state, 'default')) {
        return line
      }
      continue
    }
    advance(state, state.index + 1)
  }
  return null
}

export function findNamedReexport(source, exportedName) {
  const state = createState(source)
  while (state.index < state.source.length) {
    const char = state.source[state.index]
    const next = state.source[state.index + 1]
    if (char === "'" || char === '"' || char === '`') {
      skipString(state)
      continue
    }
    if (char === '/' && next === '/') {
      skipLineComment(state)
      continue
    }
    if (char === '/' && next === '*') {
      skipBlockComment(state)
      continue
    }
    if (matchKeyword(state, 'export')) {
      advance(state, state.index + 'export'.length)
      skipTrivia(state)
      if (state.source[state.index] !== '{') {
        continue
      }
      const clauseStart = state.index
      skipNested(state, '{', '}')
      skipTrivia(state)
      if (!matchKeyword(state, 'from')) {
        continue
      }
      advance(state, state.index + 'from'.length)
      const specifier = readSpecifier(state)
      if (!specifier) {
        continue
      }
      const inside = state.source.slice(clauseStart + 1, state.source.indexOf('}', clauseStart))
      for (const part of inside.split(',')) {
        const pieces = part.trim().split(/\s+as\s+/)
        const original = pieces[0]?.trim()
        const exported = (pieces[1] ?? pieces[0])?.trim()
        if (exported !== exportedName || !/^[A-Za-z_$][\w$]*$/.test(original)) {
          continue
        }
        return {
          specifier,
          imported: original,
          kind: original === 'default' ? 'default' : 'named',
        }
      }
      continue
    }
    advance(state, state.index + 1)
  }
  return null
}

export function locateExport(source, binding) {
  if (binding.kind === 'namespace') {
    return { line: 1 }
  }
  if (binding.kind === 'default') {
    const line = findDefaultExportLine(source)
    return line ? { line } : null
  }
  const declared = collectSymbols(source).find((symbol) => symbol.name === binding.imported)
  if (declared) {
    return { line: declared.line }
  }
  const reexport = findNamedReexport(source, binding.imported)
  if (reexport) {
    return { reexport }
  }
  return null
}
