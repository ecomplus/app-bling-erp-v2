// Bling, Store API e Search API falsos, registrando as chamadas feitas

const createFakeBling = (routes) => {
  const calls = []
  class FakeBling {
    async get (url) {
      calls.push(url)
      const route = routes.find(([pattern]) => pattern instanceof RegExp ? pattern.test(url) : pattern === url)
      if (!route) {
        throw new Error(`GET inesperado no Bling: ${url}`)
      }
      const response = typeof route[1] === 'function' ? route[1](url) : route[1]
      if (response instanceof Error) {
        throw response
      }
      return { data: response }
    }
  }
  return { FakeBling, calls }
}

const createFakeEcomClient = ({ searchHits = [], products = {} } = {}) => {
  const calls = []
  const client = {
    async search ({ url, data }) {
      calls.push(`search ${url} ${JSON.stringify(data.query)}`)
      return { data: { hits: { hits: searchHits } } }
    },
    async store ({ url }) {
      calls.push(`store ${url}`)
      const [, productId] = url.match(/\/products\/(\w+)\.json/) || []
      if (!products[productId]) {
        const err = new Error('Not found')
        err.response = { status: 404 }
        throw err
      }
      return { data: JSON.parse(JSON.stringify(products[productId])) }
    }
  }
  return { client, calls }
}

const createFakeAppSdk = ({ getResponse } = {}) => {
  const requests = []
  const appSdk = {
    async getAuth () {
      return { myId: 'app-auth-id' }
    },
    async apiRequest (storeId, url, method = 'GET', body) {
      requests.push({ url, method, body })
      const data = method === 'GET' && getResponse ? getResponse(url) : {}
      return { response: { status: 200, data, config: { url } } }
    }
  }
  return { appSdk, requests }
}

module.exports = {
  createFakeBling,
  createFakeEcomClient,
  createFakeAppSdk
}
