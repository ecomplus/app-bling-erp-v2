const ecomClient = require('@ecomplus/client')
const ecomUtils = require('@ecomplus/utils')
const { logger } = require('./../../context')
const Bling = require('../bling-auth/client')
const parseProduct = require('./parsers/product-to-ecomplus')

const createUpdateProduct = async ({ appSdk, storeId, auth }, appData, sku, product, variationId, blingDeposit, blingProduct, isStockOnly) => {
  let blingItems = [blingProduct]
  if (Array.isArray(blingProduct.variacoes)) {
    blingItems = blingItems.concat(blingProduct.variacoes)
  }
  blingItems.forEach(blingItem => {
    if (
      Array.isArray(blingItem.depositos) &&
      (blingDeposit || typeof blingItem.estoqueAtual !== 'number')
    ) {
      const depositFind = blingItem.depositos.find((deposito) => String(deposito.id) === String(blingDeposit))
      const deposits = depositFind ? [depositFind] : blingItem.depositos
      let quantity = 0
      deposits.forEach(deposit => {
        if (Number(storeId) === 51292 || appData.has_stock_reserve) {
          quantity += !Number.isNaN(Number(deposit.saldoVirtual)) ? Number(deposit.saldoVirtual) : 0
        } else {
          const saldo = typeof deposit.saldo === 'number' ? Number(deposit.saldo) : Number(deposit.saldoFisico)
          quantity += !Number.isNaN(saldo) ? saldo : 0
        }
      })
      blingItem.estoqueAtual = quantity
      delete blingItem.depositos
    }
  })

  const blingProductFind = !variationId ? blingProduct : blingItems.find(item => item.codigo === sku)
  let quantity = Number(blingProductFind.estoqueAtual)

  // logger.info(`> BlingProduct: ${JSON.stringify(blingProduct)}`)

  if (product && (isStockOnly === true || !appData.update_product || variationId)) {
    if (!isNaN(quantity)) {
      if (quantity < 0) {
        quantity = 0
      }
      let endpoint = `/products/${product._id}`
      if (variationId) {
        endpoint += `/variations/${variationId}`
      }
      endpoint += '/quantity.json'
      logger.info(`#${storeId} ${endpoint}`, { quantity, sku })
      return appSdk.apiRequest(storeId, endpoint, 'PUT', { quantity }, auth)
    }
    return null
  }

  let method
  let endpoint
  const productId = product && product._id
  if (productId) {
    method = 'PATCH'
    endpoint = `/products/${productId}.json`
  } else {
    method = 'POST'
    endpoint = '/products.json'
  }
  if (method === 'POST' && blingProduct.codigoPai) {
    logger.info(`#${storeId} skipping ${sku} - is a variation`)
    return
  }

  // TODO: import categories
  // const category = await getCategories(appData, storeId)
  // logger.info(`> Category with store ${JSON.stringify(category || {})}`)

  return parseProduct(blingProduct, product && product.variations, storeId, auth, method === 'POST', appData)
    .then(bodyProduct => {
      if (!isNaN(quantity)) {
        bodyProduct.quantity = quantity >= 0 ? quantity : 0
      }
      if (!product?.metafields) {
        bodyProduct.metafields = []
        bodyProduct.metafields.push({
          _id: ecomUtils.randomObjectId(),
          namespace: 'bling',
          field: 'bling:id',
          value: `${blingProduct.id}`
        })
      }
      logger.info(`#${storeId} ${method} ${endpoint}`, { bodyProduct })

      return appSdk.apiRequest(storeId, endpoint, method, bodyProduct, auth)
    })
}

module.exports = async ({ appSdk, storeId, auth }, _blingStore, blingDeposit, queueEntry, appData, _, isHiddenQueue) => {
  const [sku, productId] = String(queueEntry.nextId).split(';:')
  const { client_id: clientId, client_secret: clientSecret } = appData

  const findingProduct = productId
    ? ecomClient.store({
      storeId,
      url: `/products/${productId}.json`
    })
      .then(({ data }) => data)
      .catch(err => {
        if (err.response && err.response.status >= 400 && err.response.status < 500) {
          logger.info(`#${storeId} ${productId} => ${err.response.status}`)
          return Promise.resolve(null)
        }
        logger.error(err)
        throw err
      })

    : ecomClient.search({
      storeId,
      url: '/items.json',
      data: {
        size: 1,
        query: {
          bool: {
            must: {
              term: { skus: sku }
            }
          }
        }
      }
    }).then(({ data }) => {
      const hit = Array.isArray(data.hits.hits) && data.hits.hits[0] && data.hits.hits[0]
      if (hit) {
        const { _id, _source } = hit
        if (_source.variations && _source.variations.length) {
          return ecomClient.store({
            storeId,
            url: `/products/${_id}.json`
          }).then(({ data }) => data)
        }
        return {
          _id,
          ..._source
        }
      }
      return Promise.resolve(null)
    })

  return findingProduct
    .then(product => {
      // logger.warn(`product: ${JSON.stringify(product)}`)
      const hasVariations = product && product.variations && product.variations.length
      if (hasVariations) {
        const variation = product.variations.find(variation => sku === variation.sku)
        if (variation) {
          return {
            product,
            variationId: variation._id,
            hasVariations
          }
        } else if (isHiddenQueue) {
          if (product.sku === sku) {
            return { product }
          }
          return null
        } else if (!appData.update_product) {
          const msg = sku +
                ' corresponde a um produto com variações, especifique o SKU da variação para importar.'
          const err = new Error(msg)
          err.isConfigError = true
          throw err
        }
      } else if (!product && !sku.length) {
        const msg = 'Produto sem SKU, especifique-o para importar.'
        const err = new Error(msg)
        err.isConfigError = true
        throw err
      }
      return { product, hasVariations }
    })

    .then(payload => {
      if (!payload && !appData.import_product) {
        const err = new Error('Skip')
        err.isHiddenQueue = isHiddenQueue
        err._payload = payload
        throw err
      }
      const { product } = payload

      if (!product && (isHiddenQueue || productId) && !appData.import_product) {
        const err = new Error('Skip')
        err.isHiddenQueue = isHiddenQueue
        err._payload = payload
        throw err
      }
      return payload
    })
    .then(async (payload) => {
      const bling = new Bling(clientId, clientSecret, storeId)
      let blingProductId
      if (payload?.product && payload.product.metafields) {
        const metafield = payload.product.metafields.find(({ field }) => field === 'bling:id')
        if (metafield) {
          blingProductId = metafield.value
        }
      }

      let endpoint = '/produtos'
      endpoint += !blingProductId ? `?codigo=${sku}` : `/${blingProductId}`
      const blingProduct = await bling.get(endpoint)
        .then(async ({ data }) => {
          const responseData = data && data.data
          if (responseData) {
            // logger.info(`DEBUG ${JSON.stringify(responseData)}`)
            const blingProduct = !blingProductId && responseData.length ? responseData[0] : responseData
            if (blingProduct) {
              const idsProdutos = [blingProduct.id]
              const _blingId = queueEntry._blingId

              const blingProductData = !blingProductId
                ? await bling.get(`/produtos/${blingProduct.id || _blingId}`)
                  .then(({ data: { data } }) => {
                    if (data.variacao?.produtoPai?.id) {
                      const id = data.variacao?.produtoPai?.id

                      return bling.get(`/produtos/${id}`)
                        .then(({ data: { data } }) => data)
                    }

                    return data
                  })
                : blingProduct

              blingProductData?.variacoes?.forEach(variation => {
                idsProdutos.push(variation.id)
              })

              const params = idsProdutos.reduce((acc, idProduto) => {
                return acc + `idsProdutos[]=${idProduto}&`
              }, '')
              const stokeEndpoint = `/estoques/saldos?${params}`
              const blingProductStoke = await bling.get(stokeEndpoint)
                .then(({ data: { data } }) => data)

              if (blingProductData) {
                if (blingProductStoke.length) {
                  const stokeProduct = blingProductStoke.find(stoke => stoke.produto.id === blingProductData.id)
                  if (stokeProduct) {
                    Object.assign(blingProductData, { depositos: stokeProduct.depositos })
                  }
                  if (blingProductData.variacoes.length) {
                    blingProductData.variacoes.forEach(variation => {
                      const stokeVariation = blingProductStoke.find(stoke => stoke.produto.id === variation.id)
                      if (stokeVariation) {
                        Object.assign(variation, { depositos: stokeVariation.depositos })
                      }
                    })
                  }
                }

                return blingProductData
              }
            }
          }
          // logger.info(`The returned product is ${JSON.stringify(data?.data)}`)
          const msg = `SKU ${sku} não encontrado no Bling`
          const err = new Error(msg)
          err.isConfigError = true
          throw new Error(err)
        })

      const { product, variationId } = payload
      const isStockOnly = Boolean(product && !(appData.update_product || appData.update_product_auto))
      return createUpdateProduct({ appSdk, storeId, auth }, appData, sku, product, variationId, blingDeposit, blingProduct, isStockOnly)
    })
    .catch(err => {
      if (err.message === 'Skip') {
        logger.info(`#${storeId} skipping ${sku} / ${productId} => isHiddenQueue: ${err.isHiddenQueue}`)
        return { status: 'skipping' }
      }
      throw err
    })
}
