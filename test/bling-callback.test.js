const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { loadWithStubs, createLogger } = require('./helpers/load-with-stubs')
const { createFakeFirestore, createFirebaseStubs } = require('./helpers/fake-firestore')
const { createFakeAppSdk } = require('./helpers/fakes')

const storeId = 51266
const productPath = 'queue/51266/events/product_16223867940'

// corpo real dos callbacks do Bling (formato da API v2, campo "data" em texto)
const stockCallback = (estoqueAtual, saldoVirtualShopee = -15) => ({
  data: JSON.stringify({
    retorno: {
      estoques: [{
        estoque: {
          id: 16223867940,
          codigo: '41446',
          nome: 'TELA MOSQUITEIRA',
          estoqueAtual,
          depositos: [
            { deposito: { desconsiderar: 'N', id: '1600563451', nome: 'ESTOQUE FÍSICO', saldo: estoqueAtual + 15, saldoVirtual: estoqueAtual, tipo: '1' } },
            { deposito: { desconsiderar: 'S', id: '14888338153', nome: 'Shopee (Fulfillment)', saldo: 0, saldoVirtual: saldoVirtualShopee, tipo: '1' } }
          ]
        }
      }]
    }
  })
})

const orderCallback = loja => ({
  data: JSON.stringify({
    retorno: {
      pedidos: [{ pedido: { numero: '394209', numeroPedidoLoja: '394209', loja, tipoIntegracao: 'MercadoLivre', situacao: 'Em aberto' } }]
    }
  })
})

describe('rota /bling/callback', () => {
  const setup = () => {
    const db = createFakeFirestore()
    const log = createLogger()
    const route = loadWithStubs('./routes/bling/callback', {
      ...createFirebaseStubs(db),
      './context': { logger: log.logger },
      './__env': { nameCollectionEvents: 'events' },
      './lib/bling-auth/check-enable-api': async () => true
    })
    const { appSdk } = createFakeAppSdk()
    const post = async (body) => {
      const res = {
        statusCode: null,
        sendStatus (code) {
          this.statusCode = code
          return this
        },
        status (code) {
          this.statusCode = code
          return this
        },
        send () {
          return this
        }
      }
      await route.post({ appSdk }, { query: { store_id: String(storeId) }, body }, res)
      return res
    }
    return { post, db }
  }

  it('guarda o saldo recebido no evento de estoque', async () => {
    const { post, db } = setup()
    const res = await post(stockCallback(5807))
    assert.equal(res.statusCode, 200)
    const doc = db.docs.get(productPath)
    assert.equal(doc.resourceId, '41446;:')
    assert.equal(doc.queue, 'skus')
    assert.equal(doc._blingId, 16223867940)
    assert.deepEqual(doc._blingStock, {
      depositos: [
        { desconsiderar: 'S', id: '14888338153', saldo: 0, saldoVirtual: -15 },
        { desconsiderar: 'N', id: '1600563451', saldo: 5822, saldoVirtual: 5807 }
      ],
      estoqueAtual: 5807
    })
    assert.equal(Object.keys(doc._blingStockSeen).length, 1)
  })

  it('callbacks repetidos não acumulam saldos diferentes', async () => {
    const { post, db } = setup()
    await post(stockCallback(5807))
    await post(stockCallback(5807))
    assert.equal(Object.keys(db.docs.get(productPath)._blingStockSeen).length, 1)
  })

  it('saldo diferente enquanto o evento aguarda é registrado e sobrescreve o anterior', async () => {
    const { post, db } = setup()
    await post(stockCallback(5807))
    await post(stockCallback(5806))
    await post(stockCallback(5806, -16))
    const doc = db.docs.get(productPath)
    assert.equal(Object.keys(doc._blingStockSeen).length, 3)
    assert.equal(doc._blingStock.estoqueAtual, 5806)
    assert.equal(doc._blingStock.depositos[0].saldoVirtual, -16)
  })

  it('guarda a loja do Bling no evento de pedido', async () => {
    const { post, db } = setup()
    await post(orderCallback('203862437'))
    const doc = db.docs.get('queue/51266/events/order_394209')
    assert.equal(doc.queue, 'order_numbers')
    assert.equal(doc._blingStore, '203862437')
  })

  it('pedido sem loja no callback fica sem filtro', async () => {
    const { post, db } = setup()
    await post(orderCallback(undefined))
    assert.equal(db.docs.get('queue/51266/events/order_394209')._blingStore, null)
  })
})
