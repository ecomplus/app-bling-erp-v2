const ecomUtils = require('@ecomplus/utils')
const parseAddress = require('../address-to-bling')
const { logger } = require('../../../../context')

module.exports = (order, blingOrderNumber, blingStore, appData, customerIdBling, paymentTypeId, itemsBling, originalBlingOrder) => {
  try {
    const { amount } = order

    const blingOrder = {
      numeroLoja: String(order.number),
      data: (order.opened_at || order.created_at).substring(0, 10),
      numeroPedidoCompra: order._id,
      contato: { id: customerIdBling }
    }
    blingOrder.dataSaida = blingOrder.data
    if (order.number && !appData.disable_order_number) {
      blingOrder.numero = appData.random_order_number === true ? blingOrderNumber : order.number
    }
    if (blingStore) {
      blingOrder.loja = {
        id: Number(blingStore)
      }
    }

    const shippingLine = order.shipping_lines && order.shipping_lines[0]
    const transaction = order.transactions && order.transactions[0]
    const shippingAddress = shippingLine && shippingLine.to

    if (order.items && order.items.length) {
      blingOrder.itens = []
      order.items.forEach(item => {
        if (item.quantity) {
          const itemRef = (item.sku || item._id).substring(0, 40)
          const itemToBling = {
            codigo: itemRef,
            descricao: item.name ? item.name.substring(0, 120) : itemRef,
            unidade: 'Un',
            quantidade: item.quantity,
            valor: ecomUtils.price(item)
          }
          const productBlingId = (itemsBling.find(itemBling => itemBling?.codigo === item?.sku))?.id
          if (productBlingId) {
            Object.assign(itemToBling, { produto: { id: productBlingId } })
          }
          blingOrder.itens.push(itemToBling)
        }
      })
    }

    if (transaction) {
      let blingPaymentLabel = ''
      if (order.payment_method_label) {
        blingPaymentLabel = order.payment_method_label
      } else if (transaction.payment_method.name) {
        blingPaymentLabel = transaction.payment_method.name.substring(0, 140)
      }
      blingOrder.parcelas = []
      if (transaction.installments) {
        const { number } = transaction.installments
        const extra = amount.extra || 0
        const vlr = (amount.total - extra) / number
        const date = new Date(blingOrder.data).getTime()
        for (let i = 0; i < number; i++) {
          const addDaysMs = i ? (i * 30 * 24 * 60 * 60 * 1000) : 0
          const deadLine = new Date(date + addDaysMs)
          blingOrder.parcelas.push({
            dataVencimento: deadLine.toISOString().substring(0, 10),
            valor: vlr,
            observacoes: `${blingPaymentLabel} (${(i + 1)}/${number})`,
            formaPagamento: { id: paymentTypeId }
          })
        }
      } else {
        blingOrder.parcelas.push({
          dataVencimento: blingOrder.data,
          valor: amount.total,
          observacoes: `${blingPaymentLabel} (1/1)`,
          formaPagamento: { id: paymentTypeId }
        })
      }
    }

    if (shippingLine) {
      blingOrder.transporte = {}
      let shippingService
      const blingShipping = appData.parse_shipping
      if (shippingLine.app && blingShipping && blingShipping.length) {
        shippingService = blingShipping.find(shippingFind =>
          shippingFind.ecom_shipping && shippingFind.ecom_shipping.toLowerCase() === shippingLine.app.label?.toLowerCase()
        )
      }
      if (!originalBlingOrder || !originalBlingOrder.transporte?.volumes?.length) {
        let shippingLabel = shippingService?.bling_shipping
        if (!shippingLabel) {
          shippingLabel = shippingLine.app?.service_code || order.shipping_method_label
        }
        if (shippingLabel) {
          blingOrder.transporte.volumes = [{ servico: shippingLabel }]
        }
      }

      if (shippingLine.package && shippingLine.package.weight) {
        const { unit, value } = shippingLine.package.weight
        blingOrder.transporte.pesoBruto = unit === 'g'
          ? value / 1000
          : unit === 'mg'
            ? value / 1000000
            : value
      }

      if (shippingAddress) {
        blingOrder.transporte.etiqueta = {}
        parseAddress(shippingAddress, blingOrder.transporte.etiqueta)
      }
    }

    if (typeof amount.freight === 'number') {
      if (!(blingOrder.transporte && Object.keys(blingOrder.transporte).length)) {
        blingOrder.transporte = {}
      }
      blingOrder.transporte.frete = amount.freight
    }

    if (amount.discount) {
      blingOrder.desconto = {
        valor: amount.discount,
        unidade: 'REAL'
      }
    }
    if (amount.balance) {
      if (!(blingOrder.desconto && blingOrder.desconto.valor)) {
        blingOrder.desconto = {
          valor: 0,
          unidade: 'REAL'
        }
      }
      blingOrder.desconto.valor += amount.balance
    }

    if (order.notes) {
      blingOrder.observacoes = order.notes
    }

    return blingOrder
  } catch (err) {
    logger.error(err)
  }
}
