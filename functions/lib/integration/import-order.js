const { logger } = require('./../../context')
const Bling = require('../bling-auth/client')
const parseOrder = require('./parsers/order-to-ecomplus/')
const parseStatus = require('./parsers/order-to-ecomplus/status')

const getLastStatus = records => {
  let statusRecord
  records.forEach(record => {
    if (record && (!statusRecord || !record.date_time || record.date_time >= statusRecord.date_time)) {
      statusRecord = record
    }
  })
  return statusRecord && statusRecord.status
}

module.exports = async ({ appSdk, storeId, auth }, _blingStore, _blingDeposit, queueEntry, appData) => {
  const blingOrderNumber = queueEntry.nextId
  const {
    client_id: clientId,
    client_secret: clientSecret
  } = appData
  const bling = new Bling(clientId, clientSecret, storeId)

  const endpoint = `/pedidos/vendas?limite=1&numero=${blingOrderNumber}`
  const job = bling.get(endpoint)
    .then(({ data: { data } }) => {
      const blingOrderId = data.length && data[0].id
      return bling.get(`/pedidos/vendas/${blingOrderId}`)
    })
    .then(async ({ data: { data } }) => {
      logger.info(`order :${JSON.stringify(data)}`)
      const blingOrder = data

      logger.info(`#${storeId} found order ${blingOrder.numero}`)

      const situacao = blingOrder.situacao && blingOrder.situacao.id
        ? await bling.get(`/situacoes/${blingOrder.situacao.id}`)
          .then(({ data: { data } }) => data.nome?.toLowerCase())
        : null

      const numero = blingOrder.numeroLoja && blingOrder.numeroLoja.length ? blingOrder.numeroLoja : blingOrder.numero
      const listEndpoint = '/orders.json?limit=1&fields=_id,payments_history,fulfillments,shipping_lines' +
      `&number=${numero}`
      return appSdk.apiRequest(storeId, listEndpoint, 'GET', null, auth)
        .then(({ response }) => {
          const { result } = response.data
          if (!result.length) {
            return null
          }
          const order = result[0]
          return parseOrder(blingOrder, order.shipping_lines, bling, storeId).then(partialOrder => {
            const promises = []
            if (partialOrder && Object.keys(partialOrder).length) {
              promises.push(appSdk
                .apiRequest(storeId, `/orders/${order._id}.json`, 'PATCH', partialOrder, auth))
            }

            const { fulfillmentStatus, financialStatus } = parseStatus(situacao?.toLowerCase(), appData)
            const data = {
              date_time: new Date().toISOString(),
              flags: ['from-bling']
            }

              ;[
              [financialStatus, 'payments_history'],
              [fulfillmentStatus, 'fulfillments']
            ].forEach(([newStatus, subresource]) => {
              if (
                newStatus &&
                  (!order[subresource] || getLastStatus(order[subresource]) !== newStatus)
              ) {
                data.status = newStatus
                const endpoint = `/orders/${order._id}/${subresource}.json`
                promises.push(appSdk.apiRequest(storeId, endpoint, 'POST', data, auth))
              }
            })
            return Promise.all(promises).then(([firstResult]) => firstResult)
          })
        })
        .then((payload) => (payload && payload.response) || payload)
    })

  return job
}
