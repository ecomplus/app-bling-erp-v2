const ecomUtils = require('@ecomplus/utils')
const { logger } = require('./../../context')
const errorHandling = require('../store-api/error-handling')
const Bling = require('../bling-auth/client')
const parseOrder = require('./parsers/order-to-bling/')
const parseStatus = require('./parsers/order-to-bling/status')
const url = require('url')
const getCustomerBling = require('./utils/get-customer-bling')
const getProductsBling = require('./utils/get-products-bling')
const { getPaymentBling } = require('./utils/payment-method')

const getStatusBling = async (bling) => bling.get('/situacoes/modulos')
  .then(({ data: { data: modules } }) => {
    const salesModules = modules.find((module) => module.nome.toLowerCase() === 'vendas')
    if (salesModules) {
      return bling.get(`/situacoes/modulos/${salesModules.id}`)
        .then(({ data: { data: situacoes } }) => {
          return situacoes
        })
    }
    return null
  })

module.exports = ({ appSdk, storeId, auth }, blingStore, _blingDeposit, queueEntry, appData, canCreateNew) => {
  const orderId = queueEntry.nextId
  const logHead = `#${storeId} ${orderId}`
  if (storeId === 51266) {
    logger.info(`[Store 51266] Starting order export process for ${logHead}`)
  }
  const {
    client_id: clientId,
    client_secret: clientSecret,
    bling_store: appDataBlingStore
  } = appData
  logger.info(`Try find Order id ${orderId}`)
  return appSdk.apiRequest(storeId, `/orders/${orderId}.json`, 'GET', null, auth)
    .then(async ({ response }) => {
      const order = response.data
      if (storeId === 51266) {
        logger.info(`[Store 51266] Order data retrieved:`, { 
          orderId,
          financial_status: order.financial_status,
          metafields: order.metafields 
        })
      }
      const transaction = order.transactions && order.transactions[0]
      const logHead = `#${storeId} ${orderId}`
      if (!order.financial_status) {
        logger.info(`${logHead} skipped with no financial status`)
        return null
      }

      let blingOrderNumber
      let blingOrderId
      let hasCreatedBlingOrder
      let { metafields } = order
      let metafieldId

      if (metafields) {
        metafieldId = metafields.find(({ field }) => field === 'bling:id')
        const metafieldNumber = metafields.find(({ field }) => field === 'bling:numero')
        blingOrderNumber = metafieldNumber?.value
        if (metafieldId) {
          blingOrderId = metafieldId.value
          if (blingOrderId === 'skip') {
            logger.info(`${logHead} skipped by metafield`)
            return null
          }
          hasCreatedBlingOrder = Boolean(blingOrderId)
        }
      }
      const urlParams = {
        numero: order.number
      }
      if (appData.random_order_number === true) {
        urlParams.numero = blingOrderNumber
      }

      if (appDataBlingStore || blingStore) {
        urlParams.idLoja = appDataBlingStore || blingStore
      }
      const params = new url.URLSearchParams(urlParams)
      const bling = new Bling(clientId, clientSecret, storeId)
      const endpoint = `/pedidos/vendas${hasCreatedBlingOrder ? `/${blingOrderId}` : `?${params.toString()}`}`

      const paymentTypeId = transaction ? await getPaymentBling(bling, transaction, appData.parse_payment) : null
      const allStatusBling = await getStatusBling(bling)

      const job = bling.get(endpoint)
        .catch(err => {
          logger.error(`${logHead} Error fetching from Bling:`, {
            endpoint,
            error: err.message,
            response: err.response?.data
          })
          if (err.response && err.response.status === 404) {
            if (blingOrderId) {
              const newEndpoint = `/pedidos/vendas?${params.toString()}`
              hasCreatedBlingOrder = undefined
              blingOrderId = undefined
              return bling.get(newEndpoint)
                .catch(err => {
                  if (err.response && err.response.status === 404) {
                    logger.warn(`Order Bling not found ${endpoint}`)
                    return { data: {} }
                  }
                  throw err
                })
            }
            logger.warn(`Order Bling not found ${endpoint}`)
            return { data: {} }
          }
          throw err
        })
        .then(async ({ data: { data } }) => {
          const blingStatuses = parseStatus(order, appData)
          const hasFoundByNumber = Boolean(Array.isArray(data) && data.length)
          let originalBlingOrder
          if (hasFoundByNumber) {
            originalBlingOrder = data.find((pedido) => {
              if (String(order.number) === pedido.numeroLoja) {
                return !blingStore || (String(blingStore) === String(pedido.loja && pedido.loja.id))
              }
              return false
            })

            if (!originalBlingOrder && blingOrderNumber) {
              originalBlingOrder = data.find((pedido) => {
                return blingOrderNumber === String(pedido.numero)
              })
            }
          }
          if (originalBlingOrder) {
            blingOrderId = originalBlingOrder.id
            return { blingStatuses }
          } else if (!canCreateNew) {
            if (canCreateNew === false || hasCreatedBlingOrder) {
              return {}
            }
          }
          if (!originalBlingOrder) {
            if (appData.approved_orders_only && blingStatuses) {
              for (let i = 0; i < blingStatuses.length; i++) {
                const blingStatus = blingStatuses[i]
                switch (blingStatus) {
                  case 'pendente':
                  case 'em aberto':
                  case 'cancelado':
                    logger.info(`${logHead} skipped with status "${blingStatus}"`)
                    return {}
                }
              }
            }
            if (!blingOrderNumber) {
              blingOrderNumber = (hasFoundByNumber || appData.random_order_number === true)
                ? String(Math.floor(Math.random() * (99999999 - 10000000)) + 10000000)
                : String(order.number)
            }

            const customerIdBling = await getCustomerBling(bling, appData, order)
            if (!customerIdBling) {
              logger.info('Bling Customer not found')
              throw new Error('Bling Customer not found')
            }
            const itemsBling = await getProductsBling(bling, order)
            /*
            if (order.items?.length !== itemsBling?.length) {
              logger.warn(`Bling Item(s) not found orderItems: ${JSON.stringify(order.items)} => blingItems'${JSON.stringify(itemsBling)}`)
              throw new Error('Bling Item(s) not found')
            }
            */

            const blingOrder = parseOrder(order, blingOrderNumber, blingStore, appData, customerIdBling, paymentTypeId, itemsBling, originalBlingOrder)
            const endpoint = `/pedidos/vendas${blingOrderId ? `/${blingOrderId}` : ''}`
            const method = blingOrderId ? 'put' : 'post'
            logger.info(`[${method}]: ${endpoint} for ${order._id}`)
            return bling[method](endpoint, blingOrder)
              .then(async ({ data: { data } }) => {
                const actionType = method === 'put' ? 'updated' : 'created'
                logger.info(`${logHead} Bling Order ${actionType} successfully`, {
                  blingOrderId: data.id,
                  method,
                  endpoint
                })
                if (data.id) {
                  blingOrderId = data.id
                  if (!metafields) {
                    metafields = []
                  }
                  if (!metafieldId) {
                    metafields.push({
                      _id: ecomUtils.randomObjectId(),
                      namespace: 'bling',
                      field: 'bling:id',
                      value: String(blingOrderId)
                    })
                  } else {
                    metafieldId.value = String(blingOrderId)
                  }

                  appSdk.apiRequest(storeId, `/orders/${order._id}.json`, 'PATCH', {
                    metafields
                  }, auth)
                }

                return { blingStatuses }
              })
              .catch(err => {
                const errorDetails = {
                  orderId: order._id,
                  storeId,
                  endpoint,
                  method,
                  errorMessage: err.message,
                  responseData: err.response?.data
                }
                logger.error(`${logHead} Failed exporting order to Bling:`, errorDetails)
                if (storeId === 51266) {
                  logger.info(`[Store 51266] Detailed error info:`, {
                    ...errorDetails,
                    orderData: order,
                    blingOrderData: blingOrder
                  })
                }
                throw err
              })
          }
          return {}
        })

        .then((response) => {
          const blingStatuses = response?.blingStatuses
          if (blingOrderId) {
            const getParseStatusBling = (situacoes) => {
              let blingStatusObj
              if (blingStatuses) {
                for (let i = 0; i < blingStatuses.length; i++) {
                  const blingStatus = blingStatuses[i]
                  blingStatusObj = situacoes.find((situacao) => {
                    return situacao.nome && situacao.nome.toLowerCase() === blingStatus
                  })
                  if (blingStatusObj) {
                    break
                  }
                }
              }
              return blingStatusObj
            }

            return bling.get(`/pedidos/vendas/${blingOrderId}`).then(async ({ data: { data } }) => {
              const situacao = data.situacao
              const newStatusBling = getParseStatusBling(allStatusBling)
              if (newStatusBling) {
                let blingStatusCurrent
                if (situacao) {
                  blingStatusCurrent = await bling.get(`/situacoes/${data.situacao.id}`)
                    .then(({ data: { data } }) => {
                      return getParseStatusBling([data])
                    })
                }
                if (!blingStatusCurrent || blingStatusCurrent.nome !== newStatusBling.nome) {
                  return bling.patch(`/pedidos/vendas/${blingOrderId}/situacoes/${newStatusBling.id}`)
                    .then(() => logger.info('Bling order status updated successfully'))
                    .catch(err => {
                      if (err.response) {
                        logger.warn(JSON.stringify(err.response.data))
                      }
                      logger.error(err)
                    })
                }
                return null
              }
              const err = new Error('Sua conta Bling não tem "situacoes" cadastradas ou a API do Bling falhou')
              err.isConfigError = true
              throw err
            })
          }
          return null
        })
      // handleJob({ appSdk, storeId }, queueEntry, job)
      return job
    })

    .catch(err => {
      const errorDetails = {
        orderId,
        storeId,
        isConfigError: err.isConfigError,
        status: err.response?.status,
        message: err.message
      }
      logger.error(`${logHead} Order export failed:`, errorDetails)
      
      if (storeId === 51266) {
        logger.info(`[Store 51266] Export error details:`, {
          ...errorDetails,
          stack: err.stack
        })
      }
      
      if (err.response) {
        const { status } = err.response
        if (status >= 400 && status < 500) {
          const msg = `O pedido ${orderId} não existe (:${status})`
          const err = new Error(msg)
          err.isConfigError = true
          // handleJob({ appSdk, storeId }, queueEntry, Promise.reject(err))
          return err
        }
      }
      errorHandling(err)
      throw err
    })
}
