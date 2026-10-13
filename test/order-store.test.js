const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { loadWithStubs } = require('./helpers/load-with-stubs')

const { getBlingOrderStore, checkOrderStore } = loadWithStubs('./lib/integration/utils/order-store')

describe('getBlingOrderStore', () => {
  it('lê a loja do pedido no callback do Bling', () => {
    assert.equal(getBlingOrderStore({ numero: '394209', loja: '203173711' }), '203173711')
    assert.equal(getBlingOrderStore({ loja: 203862437 }), '203862437')
    assert.equal(getBlingOrderStore({ loja: { id: 203931200 } }), '203931200')
  })

  it('retorna null sem loja', () => {
    assert.equal(getBlingOrderStore({ numero: '1' }), null)
    assert.equal(getBlingOrderStore({ loja: '' }), null)
    assert.equal(getBlingOrderStore({ loja: {} }), null)
    assert.equal(getBlingOrderStore(undefined), null)
  })
})

describe('checkOrderStore', () => {
  const appData = { bling_store: '203173711', bling_store_orders_only: true }

  it('pedido da loja configurada segue o fluxo normal', () => {
    assert.equal(checkOrderStore('203173711', appData), null)
    assert.equal(checkOrderStore(203173711, { ...appData, bling_store: 203173711 }), null)
  })

  it('identifica pedido de outra loja do Bling', () => {
    assert.deepEqual(checkOrderStore('203862437', appData), {
      orderStore: '203862437',
      blingStore: '203173711',
      isEnabled: true
    })
  })

  it('indica se a opção está desligada (modo só log)', () => {
    assert.equal(checkOrderStore('203862437', { bling_store: '203173711' }).isEnabled, false)
  })

  it('não filtra sem loja configurada no app ou sem loja no pedido', () => {
    assert.equal(checkOrderStore('203862437', { bling_store_orders_only: true }), null)
    assert.equal(checkOrderStore('203862437', { bling_store: '', bling_store_orders_only: true }), null)
    assert.equal(checkOrderStore(null, appData), null)
    assert.equal(checkOrderStore(undefined, appData), null)
  })
})
