const ecomUtils = require('@ecomplus/utils')
const ecomClient = require('@ecomplus/client')
const { logger } = require('./../../context')
const errorHandling = require('../store-api/error-handling')
const Bling = require('../bling-auth/client')
const parseProduct = require('./parsers/product-to-bling')
const url = require('url')

const getBlingStockId = (blingApi, blingProductId) => {
  const urlParams = {
    'idsProdutos[]': blingProductId
  }

  const params = new url.URLSearchParams(urlParams)
  return blingApi.get(`/estoques/saldos?${params.toString()}`).then(({ data }) => {
    const depositos = data?.data.length && data?.data[0].depositos
    if (depositos && depositos.length) {
      return depositos[0].id
    }
  }).catch(logger.error)
}

module.exports = ({ appSdk, storeId, auth }, blingStore, blingDeposit, queueEntry, appData, canCreateNew) => {
  const productId = queueEntry.nextId
  logger.info(`>> export products to bling ${productId}`)
  const { client_id: clientId, client_secret: clientSecret } = appData
  return ecomClient.store({
    storeId,
    url: `/products/${productId}.json`
  })

    .then(async ({ data }) => {
      const product = data
      let blingProductCode, originalBlingProduct, blingProductId
      let { metafields } = product
      if (metafields) {
        const metafieldCodigo = metafields.find(({ field }) => field === 'bling:codigo')
        const metafieldId = metafields.find(({ field }) => field === 'bling:id')
        if (metafieldCodigo) {
          blingProductCode = metafieldCodigo.value
        }
        if (metafieldId) {
          blingProductId = metafieldId.value
        }
      }
      if (!blingProductCode) {
        blingProductCode = product.sku
      }
      // Bling Requests
      const blingApi = new Bling(clientId, clientSecret, storeId)
      const urlParams = { codigo: blingProductCode }
      if (blingStore) {
        urlParams.idLoja = blingStore
      }

      const params = new url.URLSearchParams(urlParams)
      const endpoint = `/produtos${blingProductId ? `/${blingProductId}` : `?${params.toString()}`}`
      let bodyBlingProduct

      const job = blingApi.get(endpoint)
        .catch(err => {
          if (err.response && err.response.status === 404) {
            if (blingProductId) {
              blingProductId = null
              return blingApi.get(`/produtos?${params.toString()}`)
            }
            return { data: [] }
          }
          throw err
        })

        .then(async ({ data: { data: blingProducts } }) => {
          if (blingProducts && Array.isArray(blingProducts) && blingProducts.length) {
            originalBlingProduct = blingProducts.find(({ codigo }) => product.sku === String(codigo))

            // Check blingProductId and update
            blingProductId = !blingProductId && originalBlingProduct ? originalBlingProduct.id : blingProductId

            if (!canCreateNew && !originalBlingProduct) {
              return null
            }
          }
          if (canCreateNew || appData.export_quantity || !blingStore) {
            if (!originalBlingProduct && blingProductId) {
              originalBlingProduct = blingProductId && await blingApi.get(`/produtos/${blingProductId}`)
                .then(({ data: { data: productBling } }) => productBling)
            }
            bodyBlingProduct = parseProduct(product, originalBlingProduct, blingProductCode, blingStore, appData)
            logger.info('>body ', JSON.stringify(bodyBlingProduct))
            if (bodyBlingProduct) {
              const endpoint = `/produtos${originalBlingProduct ? `/${blingProductId}` : ''}`
              if (originalBlingProduct) {
                return blingApi.put(endpoint, bodyBlingProduct)
              }
              return blingApi.post(endpoint, bodyBlingProduct)
            }
          }
          return null
        })

        .then(async (response) => {
          const responseData = response?.data?.data
          if (!metafields) {
            metafields = []
          }

          if (responseData) {
            blingProductId = String(responseData.id)

            if (blingProductCode) {
              metafields.push({
                _id: ecomUtils.randomObjectId(),
                namespace: 'bling',
                field: 'bling:codigo',
                value: String(blingProductCode)
              })
            }
          }

          const estoqueId = blingDeposit || await getBlingStockId(blingApi, blingProductId)
          if (blingProductId && (!metafields.length || !originalBlingProduct)) {
            metafields.push({
              _id: ecomUtils.randomObjectId(),
              namespace: 'bling',
              field: 'bling:id',
              value: blingProductId
            })
          }

          if (metafields.length) {
            appSdk.apiRequest(
              storeId,
              `products/${productId}.json`,
              'PATCH',
              { metafields },
              auth
            ).catch(logger.error)
          }

          const isVariations = Boolean(product.variations && product.variations.length)
          const blingQuantity = originalBlingProduct?.quantity
          const productQuantity = !isVariations ? product?.quantity : 0
          const isUpdateStock = appData.export_quantity === true || Boolean(!originalBlingProduct)

          const promise = []
          if (isUpdateStock && estoqueId && !isVariations && blingQuantity !== productQuantity) {
            const bodyStock = {
              produto: { id: Number(blingProductId) },
              deposito: { id: Number(estoqueId) },
              operacao: 'B',
              quantidade: productQuantity,
              observacoes: `Update in ${new Date().toISOString()}`
            }

            promise.push(blingApi.post('/estoques', bodyStock)
              .catch(logger.error)
            )
          } else if (isVariations && estoqueId) {
            const newVariations = responseData.variations.saved

            product.variations.forEach((variation) => {
              const variationFind = bodyBlingProduct.variacoes.find(({ nome }) => nome === variation.name)
              const newVariation = newVariations.find(({ nomeVariacao }) => nomeVariacao === variationFind.variacao?.nome)
              const isUpdateStockVariation = appData.export_quantity === true || Boolean(newVariation)

              if (variationFind && isUpdateStockVariation) {
                const bodyStock = {
                  produto: { id: Number((newVariation || variationFind).id) },
                  deposito: { id: Number(estoqueId) },
                  operacao: 'B',
                  quantidade: variation.quantity || 0,
                  observacoes: `Update in ${new Date().toISOString()}`
                }

                promise.push(blingApi.post('/estoques', bodyStock)
                  .catch(logger.error)
                )
              }
            })
          }

          // await Promise.all(promise)
          for await (const result of promise) {
            if (result) {
              //
            }
          }

          return response
        })
        // TODO: remove debug
        .catch(err => {
          const data = err.response?.data
          if (data) {
            logger.warn((data && JSON.stringify(data)) || JSON.stringify(err.response))
            logger.error(err.response)
          } else {
            logger.error(err)
          }
          throw err
        })

      return job
    })

    .catch(err => {
      if (err.response) {
        const { status } = err.response
        if (status >= 400 && status < 500) {
          const msg = `O produto ${productId} não existe (:${status})`
          const err = new Error(msg)
          err.isConfigError = true
        }
      }
      errorHandling(err)
      throw err
    })
}
