const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { loadWithStubs, createLogger } = require('./helpers/load-with-stubs')
const { createFakeFirestore, createFirebaseStubs, FakeTimestamp } = require('./helpers/fake-firestore')
const { normalizeBlingStock, getBlingStockKey } = require('../functions/lib/integration/utils/callback-stock')

const storeId = 51266
const queuePath = 'queue/51266/events/product_111'
const runningPath = 'running_events/51266_product_111'

const stockDoc = (estoqueAtual) => {
  const blingStock = normalizeBlingStock({ estoqueAtual })
  return {
    eventBy: 'bling',
    storeId,
    action: 'importation',
    queue: 'skus',
    resourceId: 'SKU1;:',
    isHiddenQueue: true,
    canCreateNew: false,
    mustUpdateAppQueue: false,
    _blingId: 111,
    _blingStock: blingStock,
    _blingStockSeen: { [getBlingStockKey(blingStock)]: true },
    createdAt: FakeTimestamp.fromMillis(1000),
    processingAt: FakeTimestamp.fromMillis(2000)
  }
}

describe('handle-events', () => {
  const setup = ({ appData = {}, queueDoc, onHandle } = {}) => {
    const db = createFakeFirestore()
    const log = createLogger()
    const handled = []
    db.docs.set(queuePath, queueDoc || stockDoc(10))
    db.docs.set(runningPath, { documentId: queuePath, storeId })
    const handler = async (session, blingStore, blingDeposit, queueEntry) => {
      handled.push(queueEntry)
      if (onHandle) {
        await onHandle(db)
      }
      return { status: 200 }
    }
    const handleEvents = loadWithStubs('./lib/events/handle-events', {
      ...createFirebaseStubs(db),
      './context': { logger: log.logger },
      './lib/store-api/get-app-data': async () => appData,
      './lib/events/utils': {
        getAppSdk: async () => ({ getAuth: async () => ({}) }),
        log: () => {}
      },
      './lib/integration/export-product': handler,
      './lib/integration/export-order': handler,
      './lib/integration/import-product': handler,
      './lib/integration/import-order': handler
    })
    const event = {
      params: { docId: '51266_product_111' },
      data: {
        data: () => db.docs.get(runningPath),
        ref: db.doc(runningPath)
      }
    }
    return { run: () => handleEvents(event), db, log, handled }
  }

  // simula um novo callback do Bling chegando durante o processamento (merge no mesmo documento)
  const receiveCallback = estoqueAtual => async (db) => {
    const { _blingStock, _blingStockSeen } = stockDoc(estoqueAtual)
    await db.doc(queuePath).set({ _blingStock, _blingStockSeen, createdAt: FakeTimestamp.now() }, { merge: true })
  }

  it('repassa ao handler os dados recebidos no callback', async () => {
    const { run, handled } = setup()
    await run()
    assert.equal(handled[0]._blingStock.estoqueAtual, 10)
    assert.equal(Object.keys(handled[0]._blingStockSeen).length, 1)
  })

  it('remove o evento da fila quando nada mudou durante o processamento', async () => {
    const { run, db } = setup({ appData: { skip_unchanged_stock: true } })
    await run()
    assert.equal(db.docs.has(queuePath), false)
    assert.equal(db.docs.has(runningPath), false)
  })

  it('callback repetido durante o processamento não reenfileira', async () => {
    const { run, db, log } = setup({ appData: { skip_unchanged_stock: true }, onHandle: receiveCallback(10) })
    await run()
    assert.equal(db.docs.has(queuePath), false)
    assert.equal(log.lines.some(line => line.includes('[STOCK_REQUEUE]')), false)
  })

  it('ligado: saldo novo durante o processamento volta para a fila em vez de ser apagado', async () => {
    const { run, db, log } = setup({ appData: { skip_unchanged_stock: true }, onHandle: receiveCallback(7) })
    await run()
    const queueDoc = db.docs.get(queuePath)
    assert.ok(queueDoc, 'evento deveria continuar na fila')
    assert.equal(queueDoc.processingAt, undefined)
    assert.equal(queueDoc._blingStock.estoqueAtual, 7)
    assert.equal(Object.keys(queueDoc._blingStockSeen).length, 2)
    assert.ok(queueDoc.createdAt.toMillis() > 1000)
    assert.equal(db.docs.has(runningPath), false)
    assert.ok(log.lines.some(line => line.includes('[STOCK_REQUEUE] queue/51266/events/product_111 enabled=true')))
  })

  it('ligado: saldo que mudou e voltou ao inicial durante o processamento volta para a fila', async () => {
    const onHandle = async (db) => {
      await receiveCallback(7)(db)
      await receiveCallback(10)(db)
    }
    const { run, db, log } = setup({ appData: { skip_unchanged_stock: true }, onHandle })
    await run()
    const queueDoc = db.docs.get(queuePath)
    assert.ok(queueDoc, 'evento deveria continuar na fila')
    assert.equal(queueDoc._blingStock.estoqueAtual, 10)
    assert.equal(Object.keys(queueDoc._blingStockSeen).length, 2)
    assert.equal(queueDoc.processingAt, undefined)
    assert.ok(log.lines.some(line => line.includes('[STOCK_REQUEUE]')))
  })

  it('desligado (modo só log): mantém o comportamento atual e registra o caso', async () => {
    const { run, db, log } = setup({ appData: {}, onHandle: receiveCallback(7) })
    await run()
    assert.equal(db.docs.has(queuePath), false)
    assert.ok(log.lines.some(line => line.includes('[STOCK_REQUEUE] queue/51266/events/product_111 enabled=false')))
  })

  it('eventos sem saldo do callback seguem removidos e recebem a loja do pedido', async () => {
    const orderDoc = {
      eventBy: 'bling',
      storeId,
      action: 'importation',
      queue: 'order_numbers',
      resourceId: '394209',
      _blingId: '394209',
      _blingStore: '203862437'
    }
    const { run, db, handled } = setup({ queueDoc: orderDoc })
    await run()
    assert.equal(handled[0]._blingStore, '203862437')
    assert.equal(handled[0]._blingStock, undefined)
    assert.equal(db.docs.has(queuePath), false)
  })

  it('token do Bling inválido apaga o evento sem tentar devolvê-lo para a fila', async () => {
    const onHandle = async () => {
      throw new Error('Bling refreshToken is invalid need to update')
    }
    const { run, db, log } = setup({ onHandle })
    await run()
    assert.equal(db.docs.has(queuePath), false)
    assert.equal(db.docs.has(runningPath), false)
    assert.equal(log.lines.some(line => line.includes('NOT_FOUND')), false)
  })
})
