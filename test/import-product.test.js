const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const { loadWithStubs, createLogger } = require('./helpers/load-with-stubs')
const { createFakeFirestore, createFirebaseStubs, FakeTimestamp } = require('./helpers/fake-firestore')
const { createFakeBling, createFakeEcomClient, createFakeAppSdk } = require('./helpers/fakes')
const { normalizeBlingStock, getBlingStockKey } = require('../functions/lib/integration/utils/callback-stock')

const storeId = 51266
const blingStore = '203173711'
const appliedPath = sku => `bling_stock_applied/${storeId}_${encodeURIComponent(sku)}`

// respostas da API v3 do Bling para um produto simples (SKU1) e uma variação (VAR1)
const blingRoutes = ({ simpleStock = 10, variationStock = 4, storePrice = 55 } = {}) => [
  ['/produtos?codigo=SKU1', { data: [{ id: 111, codigo: 'SKU1' }] }],
  ['/produtos/111', { data: { id: 111, codigo: 'SKU1', preco: 50, estoque: { saldoVirtualTotal: simpleStock } } }],
  ['/estoques/saldos?idsProdutos[]=111&', {
    data: [{
      produto: { id: 111 },
      depositos: [{ id: 1, saldoFisico: simpleStock + 2, saldoVirtual: simpleStock }],
      saldoFisicoTotal: simpleStock + 2,
      saldoVirtualTotal: simpleStock
    }]
  }],
  ['/produtos/200', {
    data: {
      id: 200,
      codigo: 'PAI',
      preco: 80,
      estoque: { saldoVirtualTotal: variationStock + 5 },
      variacoes: [
        { id: 222, codigo: 'VAR1', estoque: { saldoVirtualTotal: variationStock } },
        { id: 223, codigo: 'VAR2', estoque: { saldoVirtualTotal: 5 } }
      ]
    }
  }],
  [/^\/estoques\/saldos\?idsProdutos\[\]=200&/, { data: [] }],
  [/^\/produtos\/lojas\?/, { data: [{ preco: storePrice }] }]
]

const simpleHit = { _id: 'p1', _source: { sku: 'SKU1', name: 'Produto 1', quantity: 7 } }
const variationHit = { _id: 'p2', _source: { sku: 'PAI', variations: [{ sku: 'VAR1' }] } }
const variationProduct = {
  _id: 'p2',
  sku: 'PAI',
  metafields: [{ field: 'bling:id', value: '200' }],
  variations: [{ _id: 'v1', sku: 'VAR1', quantity: 3 }, { _id: 'v2', sku: 'VAR2', quantity: 5 }]
}

// evento criado pelo callback de estoque do Bling (functions/routes/bling/callback.js)
const callbackQueueEntry = (sku, estoqueAtual, seen) => {
  const blingStock = normalizeBlingStock({ estoqueAtual })
  return {
    action: 'importation',
    queue: 'skus',
    nextId: `${sku};:`,
    isHiddenQueue: true,
    _blingId: 111,
    _blingStock: blingStock,
    _blingStockSeen: seen || { [getBlingStockKey(blingStock)]: true }
  }
}

const manualQueueEntry = sku => ({ action: 'importation', queue: 'skus', nextId: sku })

describe('import-product', () => {
  let db, log, bling, ecom, sdk, parsedProducts

  const setup = ({ routes = blingRoutes(), searchHits = [simpleHit], products = {} } = {}) => {
    db = createFakeFirestore()
    log = createLogger()
    bling = createFakeBling(routes)
    ecom = createFakeEcomClient({ searchHits, products })
    sdk = createFakeAppSdk()
    parsedProducts = []
    return loadWithStubs('./lib/integration/import-product', {
      ...createFirebaseStubs(db),
      '@ecomplus/client': ecom.client,
      '@ecomplus/utils': { randomObjectId: () => 'random-id' },
      './context': { logger: log.logger },
      './lib/bling-auth/client': bling.FakeBling,
      './lib/integration/parsers/product-to-ecomplus': async (blingProduct) => {
        parsedProducts.push(blingProduct)
        return { name: 'Produto atualizado', price: blingProduct.preco }
      }
    })
  }

  const setApplied = (sku, quantity, extra = {}) => db.docs.set(appliedPath(sku), {
    quantity,
    productId: 'p1',
    variationId: null,
    appliedAt: FakeTimestamp.now(),
    ...extra
  })

  const logsWith = tag => log.lines.filter(line => line.includes(tag))

  describe('#3 preço da multiloja (/produtos/lojas)', () => {
    beforeEach(() => {})

    it('não consulta o preço quando só o estoque é atualizado', async () => {
      const importProduct = setup()
      const appData = { bling_store: blingStore }
      await importProduct({ appSdk: sdk.appSdk, storeId }, blingStore, undefined, manualQueueEntry('SKU1'), appData)
      assert.equal(bling.calls.some(url => url.startsWith('/produtos/lojas')), false)
      assert.deepEqual(sdk.requests, [{ url: '/products/p1/quantity.json', method: 'PUT', body: { quantity: 10 } }])
    })

    it('consulta e usa o preço com "Sobrescrever produtos" em produto simples', async () => {
      const importProduct = setup()
      const appData = { bling_store: blingStore, update_product: true }
      await importProduct({ appSdk: sdk.appSdk, storeId }, blingStore, undefined, manualQueueEntry('SKU1'), appData)
      assert.equal(bling.calls.filter(url => url.startsWith('/produtos/lojas')).length, 1)
      assert.equal(parsedProducts[0].preco, 55)
      assert.equal(sdk.requests[0].method, 'PATCH')
      assert.equal(sdk.requests[0].url, '/products/p1.json')
    })

    it('não consulta o preço em variação, mesmo com "Sobrescrever produtos"', async () => {
      const importProduct = setup({ searchHits: [variationHit], products: { p2: variationProduct } })
      const appData = { bling_store: blingStore, update_product: true }
      await importProduct({ appSdk: sdk.appSdk, storeId }, blingStore, undefined, manualQueueEntry('VAR1'), appData)
      assert.equal(bling.calls.some(url => url.startsWith('/produtos/lojas')), false)
      assert.deepEqual(sdk.requests, [{ url: '/products/p2/variations/v1/quantity.json', method: 'PUT', body: { quantity: 4 } }])
    })

    it('consulta o preço ao criar produto novo', async () => {
      const importProduct = setup({ searchHits: [] })
      const appData = { bling_store: blingStore, import_product: true }
      await importProduct({ appSdk: sdk.appSdk, storeId }, blingStore, undefined, manualQueueEntry('SKU1'), appData, true, false)
      assert.equal(bling.calls.filter(url => url.startsWith('/produtos/lojas')).length, 1)
      assert.equal(sdk.requests[0].method, 'POST')
      assert.equal(sdk.requests[0].body.price, 55)
    })
  })

  describe('#1 callbacks de estoque sem alteração', () => {
    it('ligado: saldo igual ao último aplicado não consulta Bling nem a loja', async () => {
      const importProduct = setup()
      setApplied('SKU1', 10)
      const appData = { bling_store: blingStore, skip_unchanged_stock: true }
      const result = await importProduct({ appSdk: sdk.appSdk, storeId }, blingStore, undefined, callbackQueueEntry('SKU1', 10), appData, false, true)
      assert.deepEqual(result, { status: 'unchanged' })
      assert.deepEqual(bling.calls, [])
      assert.deepEqual(ecom.calls, [])
      assert.deepEqual(sdk.requests, [])
      assert.equal(logsWith('[STOCK_SKIP]').length, 1)
      assert.match(logsWith('[STOCK_SKIP]')[0], /callback=10 applied=10 seen=1 unchanged=true reason=null enabled=true/)
    })

    it('desligado (modo só log): segue o fluxo atual e registra a validação', async () => {
      const importProduct = setup()
      setApplied('SKU1', 10)
      const appData = { bling_store: blingStore }
      await importProduct({ appSdk: sdk.appSdk, storeId }, blingStore, undefined, callbackQueueEntry('SKU1', 10), appData, false, true)
      assert.deepEqual(bling.calls, ['/produtos?codigo=SKU1', '/produtos/111', '/estoques/saldos?idsProdutos[]=111&'])
      assert.deepEqual(sdk.requests, [{ url: '/products/p1/quantity.json', method: 'PUT', body: { quantity: 10 } }])
      assert.match(logsWith('[STOCK_SKIP]')[0], /unchanged=true reason=null enabled=false/)
      assert.match(logsWith('[STOCK_SKIP_CHECK]')[0], /callback=10 applied=10 bling=10 unchanged=true ok=true/)
    })

    it('modo só log detecta quando ignorar o callback teria deixado o estoque errado', async () => {
      const importProduct = setup({ routes: blingRoutes({ simpleStock: 6 }) })
      setApplied('SKU1', 10)
      await importProduct({ appSdk: sdk.appSdk, storeId }, blingStore, undefined, callbackQueueEntry('SKU1', 10), {}, false, true)
      assert.match(logsWith('[STOCK_SKIP_CHECK]')[0], /applied=10 bling=6 unchanged=true ok=false/)
    })

    it('saldo diferente do último aplicado consulta o Bling e atualiza o registro', async () => {
      const importProduct = setup()
      setApplied('SKU1', 8)
      const appData = { skip_unchanged_stock: true }
      await importProduct({ appSdk: sdk.appSdk, storeId }, undefined, undefined, callbackQueueEntry('SKU1', 10), appData, false, true)
      assert.equal(bling.calls.length, 3)
      assert.deepEqual(sdk.requests, [{ url: '/products/p1/quantity.json', method: 'PUT', body: { quantity: 10 } }])
      const applied = db.docs.get(appliedPath('SKU1'))
      assert.equal(applied.quantity, 10)
      assert.equal(applied.productId, 'p1')
      assert.equal(applied.variationId, null)
    })

    it('sem registro de saldo aplicado consulta o Bling e cria o registro', async () => {
      const importProduct = setup()
      const appData = { skip_unchanged_stock: true }
      await importProduct({ appSdk: sdk.appSdk, storeId }, undefined, undefined, callbackQueueEntry('SKU1', 10), appData, false, true)
      assert.equal(bling.calls.length, 3)
      assert.match(logsWith('[STOCK_SKIP]')[0], /reason=no-applied-stock/)
      assert.equal(db.docs.get(appliedPath('SKU1')).quantity, 10)
    })

    it('saldos diferentes recebidos enquanto aguardava na fila consultam o Bling', async () => {
      const importProduct = setup()
      setApplied('SKU1', 10)
      const entry = callbackQueueEntry('SKU1', 10, { a: true, b: true })
      await importProduct({ appSdk: sdk.appSdk, storeId }, undefined, undefined, entry, { skip_unchanged_stock: true }, false, true)
      assert.equal(bling.calls.length, 3)
      assert.match(logsWith('[STOCK_SKIP]')[0], /seen=2 unchanged=false reason=multiple-values/)
    })

    it('registro com mais de 24h revalida no Bling', async () => {
      const importProduct = setup()
      setApplied('SKU1', 10, { appliedAt: FakeTimestamp.fromMillis(Date.now() - 25 * 60 * 60 * 1000) })
      await importProduct({ appSdk: sdk.appSdk, storeId }, undefined, undefined, callbackQueueEntry('SKU1', 10), { skip_unchanged_stock: true }, false, true)
      assert.equal(bling.calls.length, 3)
      assert.match(logsWith('[STOCK_SKIP]')[0], /reason=expired/)
    })

    it('"Sobrescrever produtos" em produto simples não ignora o callback', async () => {
      const importProduct = setup()
      setApplied('SKU1', 10)
      const appData = { skip_unchanged_stock: true, update_product: true }
      await importProduct({ appSdk: sdk.appSdk, storeId }, undefined, undefined, callbackQueueEntry('SKU1', 10), appData, false, true)
      assert.match(logsWith('[STOCK_SKIP]')[0], /reason=update-product/)
      assert.equal(sdk.requests[0].method, 'PATCH')
    })

    it('variação: ignora com saldo igual e grava registro com a variação', async () => {
      const importProduct = setup({ searchHits: [variationHit], products: { p2: variationProduct } })
      const appData = { skip_unchanged_stock: true }
      // primeiro callback: sem registro, consulta o Bling e grava
      await importProduct({ appSdk: sdk.appSdk, storeId }, undefined, undefined, callbackQueueEntry('VAR1', 4), appData, false, true)
      assert.deepEqual(sdk.requests, [{ url: '/products/p2/variations/v1/quantity.json', method: 'PUT', body: { quantity: 4 } }])
      assert.deepEqual(
        { ...db.docs.get(appliedPath('VAR1')), appliedAt: null },
        { appliedAt: null, productId: 'p2', quantity: 4, sku: 'VAR1', storeId, variationId: 'v1' }
      )
      // callback repetido: ignorado
      const callsBefore = bling.calls.length
      const result = await importProduct({ appSdk: sdk.appSdk, storeId }, undefined, undefined, callbackQueueEntry('VAR1', 4), appData, false, true)
      assert.deepEqual(result, { status: 'unchanged' })
      assert.equal(bling.calls.length, callsBefore)
      assert.equal(sdk.requests.length, 1)
    })

    it('importação manual (sem saldo no evento) não usa a regra nem lê o registro', async () => {
      const importProduct = setup()
      setApplied('SKU1', 10)
      await importProduct({ appSdk: sdk.appSdk, storeId }, undefined, undefined, manualQueueEntry('SKU1'), { skip_unchanged_stock: true })
      assert.equal(logsWith('[STOCK_SKIP]').length, 0)
      assert.equal(bling.calls.length, 3)
      assert.equal(sdk.requests.length, 1)
    })

    it('falha ao gravar o registro não interrompe a importação e não deixa registro desatualizado', async () => {
      const importProduct = setup()
      setApplied('SKU1', 8)
      db.failWrites = true
      const result = await importProduct({ appSdk: sdk.appSdk, storeId }, undefined, undefined, callbackQueueEntry('SKU1', 10), { skip_unchanged_stock: true }, false, true)
      assert.equal(result.response.status, 200)
      assert.deepEqual(sdk.requests, [{ url: '/products/p1/quantity.json', method: 'PUT', body: { quantity: 10 } }])
      assert.equal(db.docs.has(appliedPath('SKU1')), false)
      assert.equal(logsWith('erro ao salvar saldo aplicado').length, 1)
    })

    it('falha ao ler o registro consulta o Bling normalmente', async () => {
      const importProduct = setup()
      setApplied('SKU1', 10)
      db.doc = () => ({ get: async () => { throw new Error('firestore indisponível') }, set: async () => {}, delete: async () => {} })
      await importProduct({ appSdk: sdk.appSdk, storeId }, undefined, undefined, callbackQueueEntry('SKU1', 10), { skip_unchanged_stock: true }, false, true)
      assert.match(logsWith('[STOCK_SKIP]').find(line => line.includes('reason=')), /reason=no-applied-stock/)
      assert.equal(bling.calls.length, 3)
    })
  })
})
