// Firestore em memória com o subconjunto da API usado pelo app
const DELETE_FIELD = Symbol('FieldValue.delete')

class FakeTimestamp {
  constructor (millis) {
    this.millis = millis
  }

  toMillis () {
    return this.millis
  }

  toDate () {
    return new Date(this.millis)
  }

  static now () {
    return new FakeTimestamp(Date.now())
  }

  static fromMillis (millis) {
    return new FakeTimestamp(millis)
  }
}

const isMap = value => value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  !(value instanceof FakeTimestamp)

const clone = (value) => {
  if (Array.isArray(value)) {
    return value.map(clone)
  }
  if (isMap(value)) {
    // o Firestore devolve os campos de mapas em ordem alfabética
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = clone(value[key])
      return result
    }, {})
  }
  return value
}

const merge = (target, source) => {
  const result = clone(target || {})
  Object.keys(source).forEach(key => {
    const value = source[key]
    if (value === DELETE_FIELD) {
      delete result[key]
    } else if (isMap(value) && isMap(result[key])) {
      result[key] = merge(result[key], value)
    } else {
      result[key] = clone(value)
    }
  })
  return result
}

const createFakeFirestore = () => {
  const docs = new Map()
  const db = {
    docs,
    failWrites: false,
    doc: path => createDocRef(db, path),
    runTransaction: async (fn) => fn({
      get: ref => ref.get(),
      delete: (ref) => {
        docs.delete(ref.path)
      },
      update: (ref, data) => {
        docs.set(ref.path, merge(docs.get(ref.path), data))
      }
    })
  }
  return db
}

const createDocRef = (db, path) => {
  const ref = {
    path,
    id: path.split('/').pop(),
    async get () {
      const data = db.docs.get(path)
      return {
        exists: Boolean(data),
        id: ref.id,
        ref,
        data: () => data ? clone(data) : undefined
      }
    },
    async set (data, opts) {
      if (db.failWrites) {
        throw new Error('fake write failure')
      }
      db.docs.set(path, opts && opts.merge ? merge(db.docs.get(path), data) : merge({}, data))
    },
    async update (data) {
      if (db.failWrites) {
        throw new Error('fake write failure')
      }
      if (!db.docs.has(path)) {
        throw new Error(`NOT_FOUND: ${path}`)
      }
      db.docs.set(path, merge(db.docs.get(path), data))
    },
    async delete () {
      db.docs.delete(path)
    }
  }
  return ref
}

// stubs de 'firebase-admin' e 'firebase-admin/firestore' ligados ao mesmo banco
const createFirebaseStubs = (db) => {
  const FieldValue = {
    delete: () => DELETE_FIELD
  }
  const firestore = () => db
  firestore.FieldValue = FieldValue
  firestore.Timestamp = FakeTimestamp
  return {
    'firebase-admin': { firestore },
    'firebase-admin/firestore': {
      getFirestore: () => db,
      Timestamp: FakeTimestamp,
      FieldValue
    }
  }
}

module.exports = {
  DELETE_FIELD,
  FakeTimestamp,
  createFakeFirestore,
  createFirebaseStubs
}
