const crypto = require('crypto')

// App público do Bling (Central de Extensões). Convive com os apps privados que
// cada lojista cadastrou: só lojas conectadas pelo fluxo público usam esta
// credencial, e elas são reconhecidas pela marca app: 'public' no token.

const AUTHORIZE_URL = 'https://www.bling.com.br/Api/v3/oauth/authorize'

// Tempo entre gerar o link de autorização e o Bling devolver o lojista.
const STATE_MAX_AGE = 30 * 60 * 1000

const getPublicApp = () => {
  const { blingPublicApp } = require('../../__env')
  return blingPublicApp && blingPublicApp.clientId && blingPublicApp.clientSecret
    ? blingPublicApp
    : null
}

// Prefixos diferentes para que uma assinatura de link não sirva como state e
// vice-versa.
const sign = (secret, payload) => crypto
  .createHmac('sha256', secret)
  .update(payload)
  .digest('base64url')
  .slice(0, 32)

const safeEqual = (a, b) => {
  const bufA = Buffer.from(String(a))
  const bufB = Buffer.from(String(b))
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)
}

const createConnectToken = (secret, storeId) => sign(secret, `connect:${storeId}`)

const isValidConnectToken = (secret, storeId, token) => Boolean(token) &&
  safeEqual(createConnectToken(secret, storeId), token)

const createState = (secret, storeId, now = Date.now()) => {
  const issuedAt = now.toString(36)
  return `${storeId}.${issuedAt}.${sign(secret, `state:${storeId}.${issuedAt}`)}`
}

// Devolve a loja do state, ou null. O state gerado pelo Bling quando a
// instalação começa pela Central de Extensões (32 caracteres hex, sem pontos)
// sempre cai em null — o callback não sabe de que loja ele é.
const parseState = (secret, state, now = Date.now()) => {
  const parts = String(state || '').split('.')
  if (parts.length !== 3) return null
  const [rawStoreId, rawIssuedAt, signature] = parts
  const storeId = parseInt(rawStoreId, 10)
  const issuedAt = parseInt(rawIssuedAt, 36)
  if (!(storeId > 100) || String(storeId) !== rawStoreId || !Number.isFinite(issuedAt)) {
    return null
  }
  if (!safeEqual(sign(secret, `state:${rawStoreId}.${rawIssuedAt}`), signature)) {
    return null
  }
  if (now - issuedAt > STATE_MAX_AGE || issuedAt - now > 60 * 1000) {
    return null
  }
  return storeId
}

// Qual credencial renova o token de uma loja. O token é preso ao client_id que
// o emitiu, então quem decide é a marca no próprio token, não o cadastro da
// loja: uma loja que conectou pelo app público pode ainda ter a chave do app
// privado antigo salva, e renovar com ela bloquearia a loja.
const resolveCredentials = (tokenDoc, clientId, clientSecret, publicApp) => {
  if (!tokenDoc || tokenDoc.app !== 'public') {
    return { clientId, clientSecret }
  }
  const app = publicApp !== undefined ? publicApp : getPublicApp()
  if (!app) {
    const err = new Error('Bling public app credentials are not configured')
    err.code = 'NO_PUBLIC_APP'
    throw err
  }
  return { clientId: app.clientId, clientSecret: app.clientSecret }
}

module.exports = {
  AUTHORIZE_URL,
  STATE_MAX_AGE,
  getPublicApp,
  createConnectToken,
  isValidConnectToken,
  createState,
  parseState,
  resolveCredentials
}
