/*
  Valida com o emulador do Firestore (semântica real de merge e transações) as gravações feitas
  pelo callback do Bling, pelo registro de saldo aplicado e pelo reenfileiramento da fila.
  Rodar com: npm run test:emulator (requer Java e dependências instaladas em functions/)
*/
const { describe, it, before } = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const { loadWithStubs, functionsDir } = require('../helpers/load-with-stubs')

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Use "npm run test:emulator" para rodar com o emulador do Firestore')
}

// mesmas instâncias usadas pelos módulos de functions/
const requireFromFunctions = name => require(require.resolve(name, { paths: [functionsDir] }))
const admin = requireFromFunctions('firebase-admin')
const { Timestamp } = requireFromFunctions('firebase-admin/firestore')
const { getBlingStockKey } = require(path.join(functionsDir, 'lib/integration/utils/callback-stock'))

const storeId = 51266
const silentLogger = { logger: { log () {}, info () {}, warn () {}, error () {} } }
const productPath = `queue/${storeId}/events/product_16223867940`

const stockCallback = (estoqueAtual, withDeposits = true) => ({
  data: JSON.stringify({
    retorno: {
      estoques: [{
        estoque: {
          id: 16223867940,
          codigo: '41446',
          estoqueAtual,
          depositos: withDeposits
            ? [
                { deposito: { desconsiderar: 'N', id: '1600563451', saldo: estoqueAtual + 15, saldoVirtual: estoqueAtual } },
                { deposito: { desconsiderar: 'S', id: '14888338153', saldo: 0, saldoVirtual: -15 } }
              ]
            : undefined
        }
      }]
    }
  })
})

describe('Firestore (emulador)', () => {
  let db, postCallback

  before(async () => {
    admin.initializeApp({ projectId: 'demo-test' })
    db = admin.firestore()
    // token do Bling válido para a rota aceitar o callback
    await db.doc(`bling_tokens/${storeId}`).set({ updatedAt: Timestamp.now(), isBloqued: false, isRateLimit: false })
    const route = loadWithStubs('./routes/bling/callback', { './context': silentLogger })
    postCallback = async (body) => {
      let statusCode
      const res = {
        sendStatus (code) {
          statusCode = code
          return this
        },
        status (code) {
          statusCode = code
          return this
        },
        send () {
          return this
        }
      }
      await route.post({ appSdk: { getAuth: async () => ({}) } }, { query: { store_id: String(storeId) }, body }, res)
      return statusCode
    }
  })

  it('callback: merge real substitui o saldo e acumula saldos distintos', async () => {
    await db.doc(productPath).delete()
    assert.equal(await postCallback(stockCallback(5807)), 200)
    const first = (await db.doc(productPath).get()).data()
    // chave calculada sobre o documento lido do Firestore = chave gravada no callback
    assert.deepEqual(Object.keys(first._blingStockSeen), [getBlingStockKey(first._blingStock)])

    await postCallback(stockCallback(5807))
    await postCallback(stockCallback(5806))
    let doc = (await db.doc(productPath).get()).data()
    assert.equal(doc._blingStock.estoqueAtual, 5806)
    assert.equal(doc._blingStock.depositos.find(d => d.id === '1600563451').saldo, 5821)
    assert.equal(Object.keys(doc._blingStockSeen).length, 2)

    // callback sem depósitos: lista anterior não pode sobrar no documento
    await postCallback(stockCallback(5800, false))
    doc = (await db.doc(productPath).get()).data()
    assert.equal(doc._blingStock.depositos, null)
    assert.equal(doc._blingStock.estoqueAtual, 5800)
    assert.equal(Object.keys(doc._blingStockSeen).length, 3)
    assert.equal(doc.resourceId, '41446;:')
  })

  it('callback de pedido grava a loja do Bling', async () => {
    await postCallback({
      data: JSON.stringify({ retorno: { pedidos: [{ pedido: { numero: '394209', loja: '203862437' } }] } })
    })
    const doc = (await db.doc(`queue/${storeId}/events/order_394209`).get()).data()
    assert.equal(doc._blingStore, '203862437')
  })

  it('saldo aplicado: grava e lê com SKU contendo caracteres especiais', async () => {
    const { setAppliedStock, getAppliedStock } = loadWithStubs('./lib/integration/utils/applied-stock', { './context': silentLogger })
    const before = Date.now()
    await setAppliedStock(storeId, 'SKU/1 #A', { quantity: 12, productId: 'p1', variationId: undefined })
    const applied = await getAppliedStock(storeId, 'SKU/1 #A')
    assert.equal(applied.quantity, 12)
    assert.equal(applied.productId, 'p1')
    assert.equal(applied.variationId, null)
    assert.ok(applied.appliedAt >= before - 1000)
    assert.equal(await getAppliedStock(storeId, 'inexistente'), null)
  })

  for (const isEnabled of [true, false]) {
    it(`fila: saldo novo durante o processamento ${isEnabled ? 'reenfileira (ligado)' : 'segue apagado (desligado)'}`, async () => {
      await db.doc(productPath).delete()
      await postCallback(stockCallback(10))
      await db.doc(productPath).update({ processingAt: Timestamp.now(), createdAt: Timestamp.fromMillis(1000) })
      const runningPath = `running_events/${storeId}_product_16223867940`
      await db.doc(runningPath).set({ documentId: productPath, storeId })

      const handler = async () => {
        // novo callback do Bling chegando enquanto o evento é processado
        await postCallback(stockCallback(7))
        return { status: 200 }
      }
      const handleEvents = loadWithStubs('./lib/events/handle-events', {
        './context': silentLogger,
        './lib/store-api/get-app-data': async () => ({ skip_unchanged_stock: isEnabled }),
        './lib/events/utils': { getAppSdk: async () => ({ getAuth: async () => ({}) }), log: () => {} },
        './lib/integration/export-product': handler,
        './lib/integration/export-order': handler,
        './lib/integration/import-product': handler,
        './lib/integration/import-order': handler
      })
      await handleEvents({
        params: { docId: `${storeId}_product_16223867940` },
        data: { data: () => ({ documentId: productPath, storeId }), ref: db.doc(runningPath) }
      })

      const queueDoc = await db.doc(productPath).get()
      assert.equal((await db.doc(runningPath).get()).exists, false)
      if (isEnabled) {
        assert.equal(queueDoc.exists, true)
        const data = queueDoc.data()
        assert.equal(data.processingAt, undefined)
        assert.equal(data._blingStock.estoqueAtual, 7)
        assert.ok(data.createdAt.toMillis() > 1000)
      } else {
        assert.equal(queueDoc.exists, false)
      }
    })
  }
})
