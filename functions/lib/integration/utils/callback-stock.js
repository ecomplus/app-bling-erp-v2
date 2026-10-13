const crypto = require('crypto')

// mesmo com callbacks iguais, revalida o saldo no Bling ao menos uma vez por dia
const APPLIED_STOCK_MAX_AGE = 24 * 60 * 60 * 1000

const compareIds = (a, b) => a < b ? -1 : (a > b ? 1 : 0)

const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const number = Number(value)
  return Number.isNaN(number) ? null : number
}

// normaliza o estoque recebido no callback do Bling (retorno.estoques[].estoque)
const normalizeBlingStock = (estoque) => {
  let depositos = null
  if (Array.isArray(estoque?.depositos)) {
    depositos = estoque.depositos
      .map(item => item?.deposito || item)
      .filter(deposito => deposito && deposito.id !== undefined && deposito.id !== null)
      .map(deposito => ({
        id: String(deposito.id),
        saldo: toNumberOrNull(deposito.saldo),
        saldoVirtual: toNumberOrNull(deposito.saldoVirtual),
        desconsiderar: deposito.desconsiderar || null
      }))
      .sort((a, b) => compareIds(a.id, b.id))
  }
  return {
    estoqueAtual: toNumberOrNull(estoque?.estoqueAtual),
    depositos
  }
}

// chave estável do saldo recebido, independente da ordem dos campos lidos do Firestore
const getBlingStockKey = (blingStock) => {
  if (!blingStock) {
    return null
  }
  const depositos = Array.isArray(blingStock.depositos)
    ? blingStock.depositos
      .map(({ id, saldo, saldoVirtual, desconsiderar }) => [String(id), saldo, saldoVirtual, desconsiderar])
      .sort((a, b) => compareIds(a[0], b[0]))
    : null
  return crypto.createHash('sha1')
    .update(JSON.stringify([blingStock.estoqueAtual, depositos]))
    .digest('hex')
    .slice(0, 16)
}

// mesma regra de cálculo usada em createUpdateProduct (import-product.js)
const getCallbackQuantity = (blingStock, { storeId, blingDeposit, hasStockReserve }) => {
  if (!blingStock) {
    return null
  }
  let quantity = toNumberOrNull(blingStock.estoqueAtual)
  const { depositos } = blingStock
  if (Array.isArray(depositos) && (blingDeposit || quantity === null)) {
    const depositFind = depositos.find(deposito => String(deposito.id) === String(blingDeposit))
    const deposits = depositFind ? [depositFind] : depositos
    quantity = 0
    deposits.forEach(deposito => {
      const saldo = Number(storeId) === 51292 || hasStockReserve
        ? Number(deposito.saldoVirtual)
        : Number(deposito.saldo)
      quantity += !Number.isNaN(saldo) ? saldo : 0
    })
  }
  return quantity === null ? null : Math.max(0, quantity)
}

/*
  Decide se o callback de estoque pode ser ignorado sem consultar o Bling:
  só quando o saldo recebido é igual ao último saldo que o próprio app gravou na loja.
  Retorna null quando o evento não veio de callback de estoque.
*/
const checkUnchangedStock = ({ storeId, appData, blingDeposit, queueEntry, appliedStock, now = Date.now() }) => {
  const blingStock = queueEntry && queueEntry._blingStock
  if (!blingStock) {
    return null
  }
  const callbackQuantity = getCallbackQuantity(blingStock, {
    storeId,
    blingDeposit,
    hasStockReserve: appData.has_stock_reserve
  })
  const seenCount = queueEntry._blingStockSeen
    ? Object.keys(queueEntry._blingStockSeen).length
    : 1
  const appliedQuantity = appliedStock ? appliedStock.quantity : null

  let reason
  if (callbackQuantity === null) {
    reason = 'no-callback-quantity'
  } else if (seenCount > 1) {
    // recebeu saldos diferentes enquanto o evento aguardava na fila
    reason = 'multiple-values'
  } else if (!appliedStock || typeof appliedQuantity !== 'number') {
    reason = 'no-applied-stock'
  } else if (appData.update_product && !appliedStock.variationId) {
    // com "Sobrescrever produtos" o cadastro inteiro é atualizado, não apenas o estoque
    reason = 'update-product'
  } else if (!appliedStock.appliedAt || now - appliedStock.appliedAt > APPLIED_STOCK_MAX_AGE) {
    reason = 'expired'
  } else if (appliedQuantity !== callbackQuantity) {
    reason = 'changed'
  }

  return {
    callbackQuantity,
    appliedQuantity,
    seenCount,
    isUnchanged: !reason,
    reason: reason || null,
    isEnabled: appData.skip_unchanged_stock === true
  }
}

module.exports = {
  APPLIED_STOCK_MAX_AGE,
  normalizeBlingStock,
  getBlingStockKey,
  getCallbackQuantity,
  checkUnchangedStock
}
