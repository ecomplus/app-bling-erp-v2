const { getFirestore, Timestamp } = require('firebase-admin/firestore')
const { logger } = require('../../../context')

// último saldo gravado pelo app em cada SKU, usado para ignorar callbacks repetidos
const collectionName = 'bling_stock_applied'
// registros com mais de 24h já não ignoram callbacks (APPLIED_STOCK_MAX_AGE), a política de TTL
// do Firestore no campo expireAt remove os antigos
const EXPIRE_AFTER = 2 * 24 * 60 * 60 * 1000

const getDocRef = (storeId, sku) => getFirestore()
  .doc(`${collectionName}/${storeId}_${encodeURIComponent(sku)}`)

const getAppliedStock = async (storeId, sku) => {
  try {
    const docSnapshot = await getDocRef(storeId, sku).get()
    if (!docSnapshot.exists) {
      return null
    }
    const { quantity, productId, variationId, appliedAt } = docSnapshot.data()
    return {
      quantity,
      productId,
      variationId: variationId || null,
      appliedAt: appliedAt && appliedAt.toMillis ? appliedAt.toMillis() : null
    }
  } catch (err) {
    logger.warn(`#${storeId} [STOCK_SKIP] erro ao ler saldo aplicado ${sku}: ${err.message}`)
    return null
  }
}

const setAppliedStock = async (storeId, sku, { quantity, productId, variationId }) => {
  const docRef = getDocRef(storeId, sku)
  try {
    await docRef.set({
      storeId: Number(storeId),
      sku,
      quantity,
      productId,
      variationId: variationId || null,
      appliedAt: Timestamp.now(),
      expireAt: Timestamp.fromMillis(Date.now() + EXPIRE_AFTER)
    })
  } catch (err) {
    logger.warn(`#${storeId} [STOCK_SKIP] erro ao salvar saldo aplicado ${sku}: ${err.message}`)
    // sem registro o próximo callback consulta o Bling, nunca ignora com saldo desatualizado
    await docRef.delete().catch(logger.error)
  }
}

module.exports = {
  getAppliedStock,
  setAppliedStock
}
