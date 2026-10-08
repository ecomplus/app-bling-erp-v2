// node --test test/bling-public-app.test.js
const { test } = require('node:test')
const assert = require('node:assert')
const {
  STATE_MAX_AGE,
  createConnectToken,
  isValidConnectToken,
  createState,
  parseState,
  resolveCredentials
} = require('../functions/lib/bling-auth/public-app')

const SECRET = 'segredo-de-teste'
const PUBLIC_APP = { clientId: 'publico-id', clientSecret: 'publico-secret' }
const NOW = Date.UTC(2026, 9, 8, 12)

test('loja sem a marca continua com a chave do próprio cadastro', () => {
  const doc = { access_token: 'x', refresh_token: 'y' }
  assert.deepStrictEqual(
    resolveCredentials(doc, 'privado-id', 'privado-secret', PUBLIC_APP),
    { clientId: 'privado-id', clientSecret: 'privado-secret' }
  )
})

test('loja sem a marca não depende da chave pública estar configurada', () => {
  assert.deepStrictEqual(
    resolveCredentials({}, 'privado-id', 'privado-secret', null),
    { clientId: 'privado-id', clientSecret: 'privado-secret' }
  )
})

test('token do app público renova com a chave pública, mesmo com chave privada no cadastro', () => {
  assert.deepStrictEqual(
    resolveCredentials({ app: 'public' }, 'privado-antigo', 'secret-antigo', PUBLIC_APP),
    { clientId: 'publico-id', clientSecret: 'publico-secret' }
  )
})

test('token do app público sem a chave configurada falha antes de tentar renovar', () => {
  assert.throws(
    () => resolveCredentials({ app: 'public' }, 'publico-id', '', null),
    (err) => err.code === 'NO_PUBLIC_APP'
  )
})

test('state gerado por nós devolve a loja', () => {
  assert.strictEqual(parseState(SECRET, createState(SECRET, 45114, NOW), NOW + 1000), 45114)
})

test('state do Bling (instalação pela Central) não identifica loja', () => {
  assert.strictEqual(parseState(SECRET, '66dadb040f2116a87c66ba9a72c7f130', NOW), null)
})

test('state com a loja trocada é recusado', () => {
  const [, issuedAt, signature] = createState(SECRET, 45114, NOW).split('.')
  assert.strictEqual(parseState(SECRET, `51494.${issuedAt}.${signature}`, NOW), null)
})

test('state assinado com outro segredo é recusado', () => {
  assert.strictEqual(parseState(SECRET, createState('outro-segredo', 45114, NOW), NOW), null)
})

test('state vencido é recusado', () => {
  const state = createState(SECRET, 45114, NOW)
  assert.strictEqual(parseState(SECRET, state, NOW + STATE_MAX_AGE + 1), null)
})

test('state vazio ou malformado é recusado', () => {
  for (const state of [undefined, '', 'a.b.c', '45114', '045114.x.y', '50.lzk.abc']) {
    assert.strictEqual(parseState(SECRET, state, NOW), null, String(state))
  }
})

test('link de conexão vale só para a loja dele', () => {
  const token = createConnectToken(SECRET, 45114)
  assert.strictEqual(isValidConnectToken(SECRET, 45114, token), true)
  assert.strictEqual(isValidConnectToken(SECRET, 51494, token), false)
  assert.strictEqual(isValidConnectToken(SECRET, 45114, undefined), false)
})

test('assinatura de state não serve como link de conexão', () => {
  const [, , stateSignature] = createState(SECRET, 45114, NOW).split('.')
  assert.strictEqual(isValidConnectToken(SECRET, 45114, stateSignature), false)
})
