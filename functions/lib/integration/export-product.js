const ecomUtils = require('@ecomplus/utils')
const ecomClient = require('@ecomplus/client')
const errorHandling = require('../store-api/error-handling')
const blingAxios = require('../bling-auth/create-access')
const parseProduct = require('./parsers/product-to-bling')
const handleJob = require('./handle-job')

module.exports = ({ appSdk, storeId, auth }, _blingToken, blingStore, blingDeposit, queueEntry, appData, canCreateNew) => {
  const productId = queueEntry.nextId
  console.log('>> export products to bling ', productId)
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
      const bling = await blingAxios(clientId, clientSecret, storeId)

      const job = bling.get('/produtos', {
        params: {
          codigo: blingProductCode,
          idLoja: blingStore
        }
      })
        .catch(err => {
          if (err.response && err.response.status === 404) {
            return { data: [] }
          }
          throw err
        })

        .then(async ({ data: { data: blingProducts } }) => {
          if (blingProducts && Array.isArray(blingProducts)) {
            originalBlingProduct = blingProducts.find(({ codigo }) => product.sku === String(codigo))

            // Check blingProductId and update
            blingProductId = !blingProductId && originalBlingProduct ? originalBlingProduct.id : blingProductId

            if (!canCreateNew && !originalBlingProduct) {
              return null
            }
          }
          if (canCreateNew || appData.export_quantity || !blingStore) {
            if (originalBlingProduct) {
              originalBlingProduct = await bling.get(`/produtos/${blingProductId}`)
                .then(({ data: { data: productBling } }) => productBling)
            }
            const blingProduct = parseProduct(product, originalBlingProduct, blingProductCode, blingStore, appData)
            if (blingProduct) {
              const endpoint = originalBlingProduct ? `/produtos/${blingProductId}` : '/produtos'
              if (originalBlingProduct) {
                // TODO: remove debug
                console.log('>> Put Bling ', endpoint)
                console.log('>body ', JSON.stringify(blingProduct))

                // TODO: it isn't updating stock. Why?
                return bling.put(endpoint, blingProduct)
              }
              // TODO: remove debug
              console.log('>> Post Bling')
              return bling.post(endpoint, blingProduct)
            }
          }
          return null
        })

        .then(response => {
          if (!originalBlingProduct) {
            const responseData = response.data && response.data.data
            if (responseData) {
              if (!metafields) {
                metafields = []
              }

              if (blingProductCode) {
                metafields.push({
                  _id: ecomUtils.randomObjectId(),
                  namespace: 'bling',
                  field: 'bling:codigo',
                  value: String(blingProductCode)
                })
              }

              metafields.push({
                _id: ecomUtils.randomObjectId(),
                namespace: 'bling',
                field: 'bling:id',
                value: String(responseData.id)
              })

              appSdk.apiRequest(
                storeId,
                `products/${productId}.json`,
                'PATCH',
                { metafields },
                auth
              ).catch(console.error)
            }
          }
          return response
        })
        // TODO: remove debug
        .catch(err => {
          const data = err.response?.data
          if (data) {
            console.log('ERROR ', data && JSON.stringify(data))
          } else {
            console.error(err)
          }
        })

      handleJob({ appSdk, storeId }, queueEntry, job)
    })

    .catch(err => {
      if (err.response) {
        const { status } = err.response
        if (status >= 400 && status < 500) {
          const msg = `O produto ${productId} não existe (:${status})`
          const err = new Error(msg)
          err.isConfigError = true
          handleJob({ appSdk, storeId }, queueEntry, Promise.reject(err))
          return null
        }
      }
      errorHandling(err)
      throw err
    })
}
