const Module = require('module')
const path = require('path')

const functionsDir = path.resolve(__dirname, '../../functions')

const normalize = (request) => request.replace(/\.js$/, '').replace(/\/$/, '')

/*
  Carrega um módulo de functions/ substituindo dependências por stubs.
  As chaves podem ser pacotes ('firebase-admin') ou caminhos relativos a functions/ ('./context').
*/
const loadWithStubs = (modulePath, stubs = {}) => {
  const stubsByPath = new Map()
  Object.keys(stubs).forEach(key => {
    const target = key.startsWith('.') ? path.resolve(functionsDir, key) : key
    stubsByPath.set(normalize(target), stubs[key])
  })

  // cada teste recebe uma cópia nova dos módulos do app, com os próprios stubs
  const nodeModulesDir = path.join(functionsDir, 'node_modules') + path.sep
  Object.keys(require.cache).forEach(cachedPath => {
    if (cachedPath.startsWith(functionsDir + path.sep) && !cachedPath.startsWith(nodeModulesDir)) {
      delete require.cache[cachedPath]
    }
  })

  const originalLoad = Module._load
  Module._load = function (request, parent) {
    const target = request.startsWith('.') && parent && parent.filename
      ? path.resolve(path.dirname(parent.filename), request)
      : request
    const key = normalize(target)
    if (stubsByPath.has(key)) {
      return stubsByPath.get(key)
    }
    return originalLoad.apply(this, arguments)
  }
  try {
    return require(path.resolve(functionsDir, modulePath))
  } finally {
    Module._load = originalLoad
  }
}

const createLogger = () => {
  const lines = []
  const push = level => (msg) => {
    lines.push(`${level}: ${msg instanceof Error ? msg.message : msg}`)
  }
  return {
    lines,
    logger: {
      log: push('info'),
      info: push('info'),
      warn: push('warn'),
      error: push('error')
    }
  }
}

module.exports = {
  functionsDir,
  loadWithStubs,
  createLogger
}
