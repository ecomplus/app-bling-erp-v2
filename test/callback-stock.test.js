const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { loadWithStubs } = require('./helpers/load-with-stubs')

const {
  APPLIED_STOCK_MAX_AGE,
  normalizeBlingStock,
  getBlingStockKey,
  getCallbackQuantity,
  checkUnchangedStock
} = loadWithStubs('./lib/integration/utils/callback-stock')

// formato real recebido em functions/routes/bling/callback.js (loja 51266)
const callbackEstoque = {
  id: 16223867940,
  codigo: '41446',
  nome: 'TELA MOSQUITEIRA DE ENCAIXE REGULÁVEL PARA JANELAS 50 X 134CM PRETA',
  estoqueAtual: 5807,
  depositos: [
    { deposito: { desconsiderar: 'N', id: '1600563451', nome: 'ESTOQUE FÍSICO', saldo: 5822, saldoVirtual: 5807, tipo: '1' } },
    { deposito: { desconsiderar: 'S', id: '14888338153', nome: 'Shopee 203931200 (Fulfillment)', saldo: 0, saldoVirtual: -15, tipo: '1' } }
  ]
}

describe('normalizeBlingStock', () => {
  it('extrai saldo atual e depósitos do callback', () => {
    assert.deepEqual(normalizeBlingStock(callbackEstoque), {
      estoqueAtual: 5807,
      depositos: [
        { id: '14888338153', saldo: 0, saldoVirtual: -15, desconsiderar: 'S' },
        { id: '1600563451', saldo: 5822, saldoVirtual: 5807, desconsiderar: 'N' }
      ]
    })
  })

  it('aceita valores numéricos como texto e campos ausentes', () => {
    assert.deepEqual(normalizeBlingStock({ estoqueAtual: '12.5' }), { estoqueAtual: 12.5, depositos: null })
    assert.deepEqual(normalizeBlingStock({ estoqueAtual: 'abc', depositos: [{ deposito: { id: 1 } }] }), {
      estoqueAtual: null,
      depositos: [{ id: '1', saldo: null, saldoVirtual: null, desconsiderar: null }]
    })
    assert.deepEqual(normalizeBlingStock(undefined), { estoqueAtual: null, depositos: null })
  })
})

describe('getBlingStockKey', () => {
  it('não depende da ordem dos depósitos nem dos campos', () => {
    const stock = normalizeBlingStock(callbackEstoque)
    const reordered = {
      depositos: stock.depositos.slice().reverse().map(({ saldoVirtual, saldo, id, desconsiderar }) => ({ saldoVirtual, saldo, id, desconsiderar })),
      estoqueAtual: stock.estoqueAtual
    }
    assert.equal(getBlingStockKey(stock), getBlingStockKey(reordered))
  })

  it('muda quando qualquer saldo muda', () => {
    const stock = normalizeBlingStock(callbackEstoque)
    const changed = normalizeBlingStock({ ...callbackEstoque, estoqueAtual: 5806 })
    const changedDeposit = JSON.parse(JSON.stringify(callbackEstoque))
    changedDeposit.depositos[1].deposito.saldoVirtual = -16
    assert.notEqual(getBlingStockKey(stock), getBlingStockKey(changed))
    assert.notEqual(getBlingStockKey(stock), getBlingStockKey(normalizeBlingStock(changedDeposit)))
    assert.equal(getBlingStockKey(null), null)
  })
})

describe('getCallbackQuantity', () => {
  const stock = normalizeBlingStock(callbackEstoque)

  it('sem depósito configurado usa o saldo atual do callback', () => {
    assert.equal(getCallbackQuantity(stock, { storeId: 51266 }), 5807)
    assert.equal(getCallbackQuantity(stock, { storeId: 51266, hasStockReserve: true }), 5807)
  })

  it('com depósito configurado usa saldo virtual se houver reserva de estoque', () => {
    assert.equal(getCallbackQuantity(stock, { storeId: 1, blingDeposit: '1600563451', hasStockReserve: true }), 5807)
  })

  it('com depósito configurado usa saldo físico sem reserva de estoque', () => {
    assert.equal(getCallbackQuantity(stock, { storeId: 1, blingDeposit: 1600563451 }), 5822)
  })

  it('loja 51292 sempre usa saldo virtual (mesma regra do import-product)', () => {
    assert.equal(getCallbackQuantity(stock, { storeId: 51292, blingDeposit: '1600563451' }), 5807)
  })

  it('depósito configurado e não encontrado soma todos os depósitos', () => {
    assert.equal(getCallbackQuantity(stock, { storeId: 1, blingDeposit: '999' }), 5822)
    assert.equal(getCallbackQuantity(stock, { storeId: 1, blingDeposit: '999', hasStockReserve: true }), 5792)
  })

  it('sem saldo atual soma os depósitos', () => {
    assert.equal(getCallbackQuantity({ ...stock, estoqueAtual: null }, { storeId: 1 }), 5822)
  })

  it('nunca retorna saldo negativo', () => {
    assert.equal(getCallbackQuantity({ estoqueAtual: -3, depositos: null }, { storeId: 1 }), 0)
  })

  it('retorna null quando não há como calcular', () => {
    assert.equal(getCallbackQuantity({ estoqueAtual: null, depositos: null }, { storeId: 1 }), null)
    assert.equal(getCallbackQuantity(null, { storeId: 1 }), null)
  })
})

describe('checkUnchangedStock', () => {
  const now = Date.now()
  const blingStock = normalizeBlingStock({ estoqueAtual: 10 })
  const queueEntry = {
    _blingStock: blingStock,
    _blingStockSeen: { [getBlingStockKey(blingStock)]: true }
  }
  const appliedStock = { quantity: 10, productId: 'p1', variationId: null, appliedAt: now - 1000 }
  const check = (overrides = {}) => checkUnchangedStock({
    storeId: 51266,
    appData: { skip_unchanged_stock: true },
    blingDeposit: undefined,
    queueEntry,
    appliedStock,
    now,
    ...overrides
  })

  it('ignora quando o saldo do callback é igual ao último aplicado', () => {
    assert.deepEqual(check(), {
      callbackQuantity: 10,
      appliedQuantity: 10,
      seenCount: 1,
      isUnchanged: true,
      reason: null,
      isEnabled: true
    })
  })

  it('não se aplica a eventos sem saldo do callback (importação manual)', () => {
    assert.equal(check({ queueEntry: { nextId: '123' } }), null)
  })

  it('indica se a opção está desligada (modo só log)', () => {
    const result = check({ appData: {} })
    assert.equal(result.isUnchanged, true)
    assert.equal(result.isEnabled, false)
  })

  it('consulta o Bling quando o saldo mudou', () => {
    assert.equal(check({ appliedStock: { ...appliedStock, quantity: 9 } }).reason, 'changed')
  })

  it('consulta o Bling quando recebeu saldos diferentes na fila', () => {
    const result = check({ queueEntry: { ...queueEntry, _blingStockSeen: { a: true, b: true } } })
    assert.equal(result.reason, 'multiple-values')
    assert.equal(result.seenCount, 2)
  })

  it('consulta o Bling sem saldo aplicado registrado', () => {
    assert.equal(check({ appliedStock: null }).reason, 'no-applied-stock')
  })

  it('revalida no Bling após 24h do último saldo aplicado', () => {
    const expired = { ...appliedStock, appliedAt: now - APPLIED_STOCK_MAX_AGE - 1 }
    assert.equal(check({ appliedStock: expired }).reason, 'expired')
  })

  it('não ignora produto simples com "Sobrescrever produtos"', () => {
    assert.equal(check({ appData: { skip_unchanged_stock: true, update_product: true } }).reason, 'update-product')
  })

  it('ignora variação mesmo com "Sobrescrever produtos" (só o estoque é atualizado)', () => {
    const result = check({
      appData: { skip_unchanged_stock: true, update_product: true },
      appliedStock: { ...appliedStock, variationId: 'v1' }
    })
    assert.equal(result.isUnchanged, true)
  })

  it('não ignora sem saldo calculável no callback', () => {
    const emptyStock = { estoqueAtual: null, depositos: null }
    assert.equal(check({ queueEntry: { _blingStock: emptyStock } }).reason, 'no-callback-quantity')
  })
})
