const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { loadWithStubs } = require('./helpers/load-with-stubs')

const {
  APPLIED_STOCK_MAX_AGE,
  normalizeBlingStock,
  getBlingStockKey,
  getCallbackQuantity,
  getPlatformQuantity,
  checkUnchangedStock,
  hasNewBlingStock
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

  it('saldo ausente no depósito usado não conta como zero', () => {
    const semVirtual = normalizeBlingStock({ estoqueAtual: 7, depositos: [{ deposito: { id: '1', saldo: 7 } }] })
    assert.equal(getCallbackQuantity(semVirtual, { storeId: 1, blingDeposit: '1', hasStockReserve: true }), null)
    assert.equal(getCallbackQuantity(semVirtual, { storeId: 1, blingDeposit: '1' }), 7)
    const semSaldo = normalizeBlingStock({ estoqueAtual: '', depositos: [{ deposito: { id: '1' } }] })
    assert.equal(getCallbackQuantity(semSaldo, { storeId: 1 }), null)
    // somando todos os depósitos, basta um sem saldo para não calcular
    const parcial = normalizeBlingStock({ depositos: [{ deposito: { id: '1', saldo: 3 } }, { deposito: { id: '2' } }] })
    assert.equal(getCallbackQuantity(parcial, { storeId: 1 }), null)
  })
})

describe('getPlatformQuantity', () => {
  const product = { _id: 'p2', quantity: 9, variations: [{ _id: 'v1', quantity: 3 }, { _id: 'v2' }] }

  it('lê a quantidade do produto ou da variação', () => {
    assert.equal(getPlatformQuantity(product), 9)
    assert.equal(getPlatformQuantity(product, 'v1'), 3)
  })

  it('retorna null sem quantidade conhecida', () => {
    assert.equal(getPlatformQuantity(product, 'v2'), null)
    assert.equal(getPlatformQuantity(product, 'v9'), null)
    assert.equal(getPlatformQuantity({ _id: 'p1' }), null)
    assert.equal(getPlatformQuantity(null), null)
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
  const product = { _id: 'p1', quantity: 10 }
  const variationProduct = { _id: 'p2', variations: [{ _id: 'v1', quantity: 10 }] }
  const check = (overrides = {}) => checkUnchangedStock({
    storeId: 51266,
    appData: { skip_unchanged_stock: true },
    blingDeposit: undefined,
    queueEntry,
    appliedStock,
    product,
    variationId: undefined,
    now,
    ...overrides
  })

  it('ignora quando o saldo do callback é igual ao último aplicado', () => {
    assert.deepEqual(check(), {
      callbackQuantity: 10,
      appliedQuantity: 10,
      platformQuantity: 10,
      hasPlatformDrift: false,
      seenCount: 1,
      isUnchanged: true,
      reason: null,
      isEnabled: true
    })
  })

  it('indica quando a plataforma mudou o estoque depois do último saldo gravado', () => {
    const result = check({ product: { _id: 'p1', quantity: 9 } })
    assert.equal(result.platformQuantity, 9)
    assert.equal(result.hasPlatformDrift, true)
    // só registra: a busca e a leitura pública da plataforma podem estar em cache
    assert.equal(result.isUnchanged, true)
    assert.equal(check({ product: { _id: 'p1' } }).hasPlatformDrift, false)
  })

  it('consulta o Bling quando o SKU está em outro produto', () => {
    assert.equal(check({ product: { _id: 'p9', quantity: 10 } }).reason, 'product-changed')
  })

  it('consulta o Bling quando o SKU mudou de variação para produto simples ou o contrário', () => {
    const appliedVariation = { ...appliedStock, productId: 'p1', variationId: 'v1' }
    assert.equal(check({ appliedStock: appliedVariation }).reason, 'product-changed')
    assert.equal(check({ product: { ...variationProduct, _id: 'p1' }, variationId: 'v1' }).reason, 'product-changed')
  })

  it('não ignora sem produto encontrado na plataforma', () => {
    assert.equal(check({ product: null }).reason, 'no-product')
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
      appliedStock: { ...appliedStock, productId: 'p2', variationId: 'v1' },
      product: variationProduct,
      variationId: 'v1'
    })
    assert.equal(result.isUnchanged, true)
    assert.equal(result.platformQuantity, 10)
  })

  it('não ignora sem saldo calculável no callback', () => {
    const emptyStock = { estoqueAtual: null, depositos: null }
    assert.equal(check({ queueEntry: { _blingStock: emptyStock } }).reason, 'no-callback-quantity')
  })
})

describe('hasNewBlingStock', () => {
  const stockOf = estoqueAtual => normalizeBlingStock({ estoqueAtual })
  const keyOf = estoqueAtual => getBlingStockKey(stockOf(estoqueAtual))
  const start = { _blingStock: stockOf(10), _blingStockSeen: { [keyOf(10)]: true } }

  it('nada novo quando o documento não mudou ou recebeu o mesmo saldo', () => {
    assert.equal(hasNewBlingStock(start, start), false)
    assert.equal(hasNewBlingStock(start, { ...start, createdAt: 123 }), false)
  })

  it('saldo diferente durante o processamento', () => {
    assert.equal(hasNewBlingStock(start, {
      _blingStock: stockOf(7),
      _blingStockSeen: { [keyOf(10)]: true, [keyOf(7)]: true }
    }), true)
  })

  it('saldo que mudou e voltou ao inicial (A -> B -> A)', () => {
    assert.equal(hasNewBlingStock(start, {
      _blingStock: stockOf(10),
      _blingStockSeen: { [keyOf(10)]: true, [keyOf(7)]: true }
    }), true)
  })

  it('evento reenfileirado só considera saldos que chegaram depois do início', () => {
    const requeued = {
      _blingStock: stockOf(7),
      _blingStockSeen: { [keyOf(10)]: true, [keyOf(7)]: true }
    }
    assert.equal(hasNewBlingStock(requeued, requeued), false)
  })
})
