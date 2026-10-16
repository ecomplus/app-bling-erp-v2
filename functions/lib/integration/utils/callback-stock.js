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

/*
  Saldo do callback pela regra de createUpdateProduct (import-product.js): saldo virtual com reserva
  de estoque (ou loja 51292), saldo físico sem, e soma dos depósitos sem depósito configurado ou
  quando ele não é encontrado. Diferente de lá, um saldo ausente não conta como zero: retorna null
  para o callback nunca ser ignorado com um valor que o Bling não enviou.
*/
const getCallbackQuantity = (blingStock, { storeId, blingDeposit, hasStockReserve }) => {
  if (!blingStock) {
    return null
  }
  let quantity = toNumberOrNull(blingStock.estoqueAtual)
  const { depositos } = blingStock
  if (Array.isArray(depositos) && (blingDeposit || quantity === null)) {
    const depositFind = depositos.find(deposito => String(deposito.id) === String(blingDeposit))
    const deposits = depositFind ? [depositFind] : depositos
    const isVirtual = Number(storeId) === 51292 || hasStockReserve
    quantity = 0
    for (const deposito of deposits) {
      const saldo = toNumberOrNull(isVirtual ? deposito.saldoVirtual : deposito.saldo)
      if (saldo === null) {
        return null
      }
      quantity += saldo
    }
  }
  return quantity === null ? null : Math.max(0, quantity)
}

// quantidade atual do produto ou da variação na plataforma (busca/leitura pública, pode ter cache)
const getPlatformQuantity = (product, variationId) => {
  const item = variationId && product && Array.isArray(product.variations)
    ? product.variations.find(variation => variation._id === variationId)
    : product
  return item && typeof item.quantity === 'number' ? item.quantity : null
}

/*
  Decide se o callback de estoque pode ser ignorado sem consultar o Bling:
  só quando o saldo recebido é igual ao último saldo que o próprio app gravou no mesmo produto
  (ou variação) encontrado agora na plataforma.
  Retorna null quando o evento não veio de callback de estoque.
*/
const checkUnchangedStock = ({ storeId, appData, blingDeposit, queueEntry, appliedStock, product, variationId, now = Date.now() }) => {
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
  const platformQuantity = getPlatformQuantity(product, variationId)

  let reason
  if (callbackQuantity === null) {
    reason = 'no-callback-quantity'
  } else if (seenCount > 1) {
    // recebeu saldos diferentes enquanto o evento aguardava na fila
    reason = 'multiple-values'
  } else if (!product || !product._id) {
    reason = 'no-product'
  } else if (!appliedStock || typeof appliedQuantity !== 'number') {
    reason = 'no-applied-stock'
  } else if (
    appliedStock.productId !== product._id ||
    (appliedStock.variationId || null) !== (variationId || null)
  ) {
    // SKU passou para outro produto ou variação depois do último saldo gravado
    reason = 'product-changed'
  } else if (appData.update_product && !variationId) {
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
    platformQuantity,
    // a plataforma mudou o estoque depois do último saldo gravado (pedido, edição manual etc.)
    hasPlatformDrift: platformQuantity !== null && appliedQuantity !== null && platformQuantity !== appliedQuantity,
    seenCount,
    isUnchanged: !reason,
    reason: reason || null,
    isEnabled: appData.skip_unchanged_stock === true
  }
}

/*
  Indica se chegou algum saldo novo no documento da fila depois do início do processamento,
  inclusive quando o último saldo voltou a ser igual ao inicial (A -> B -> A).
*/
const hasNewBlingStock = (startData, currentData) => {
  if (getBlingStockKey(currentData._blingStock) !== getBlingStockKey(startData._blingStock)) {
    return true
  }
  const startSeen = startData._blingStockSeen || {}
  return Object.keys(currentData._blingStockSeen || {}).some(key => !startSeen[key])
}

module.exports = {
  APPLIED_STOCK_MAX_AGE,
  normalizeBlingStock,
  getBlingStockKey,
  getCallbackQuantity,
  getPlatformQuantity,
  checkUnchangedStock,
  hasNewBlingStock
}
