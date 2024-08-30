const ecomUtils = require('@ecomplus/utils')
const parseAddress = require('../parsers/address-to-bling')
const { logger } = require('../../../context')
const url = require('url')

module.exports = async (blingAxios, appData, order) => {
  const _contatTypeClientId = appData.outher_config?._contatTypeClientId
  const buyer = order.buyers && order.buyers[0]
  const urlParams = {
    numeroDocumento: buyer.doc_number
  }
  const params = new url.URLSearchParams(urlParams)
  const contato = await blingAxios.get(`/contatos?${params.toString()}`)
    .then(({ data }) => {
      return data?.data && data.data[0]
    })
    .catch(logger.error)

  if (contato) {
    return contato.id
  }

  const shippingLine = order.shipping_lines && order.shipping_lines[0]
  const transaction = order.transactions && order.transactions[0]
  const shippingAddress = shippingLine && shippingLine.to
  const billingAddress = transaction && transaction.billing_address
  let body

  if (buyer) {
    const blingCustomer = {
      nome: (buyer.corporate_name || ecomUtils.fullName(buyer)).substring(0, 30) ||
        `Comprador de #${order.number}`,
      tipo: buyer.registry_type === 'j' ? 'J' : 'F'
    }
    if (buyer.doc_number && buyer.doc_number.length <= 18) {
      blingCustomer.numeroDocumento = buyer.doc_number
    }
    if (buyer.inscription_number && buyer.inscription_number.length <= 18) {
      blingCustomer.ie = buyer.inscription_number
    }
    if (buyer.main_email && buyer.main_email.length <= 60) {
      blingCustomer.email = buyer.main_email
    }
    if (buyer.phones) {
      ;['celular', 'tel'].forEach((blingCustomerField, i) => {
        const phone = buyer.phones && buyer.phones[i]
        if (phone) {
          // blingCustomer[blingCustomerField] = phone.country_code ? `+${phone.country_code} ` : ''
          blingCustomer[blingCustomerField] = phone.number
        }
      })
    }
    let cobranca
    let geral
    if (billingAddress) {
      cobranca = {}
      parseAddress(billingAddress, cobranca)
    }

    if (shippingAddress) {
      geral = {}
      parseAddress(shippingAddress, geral)
    }
    blingCustomer.endereco = { cobranca, geral }

    body = blingCustomer
  } else {
    body = {
      nome: `Comprador de #${order.number}`
    }
  }

  body.tiposContato = { id: _contatTypeClientId }
  body.situacao = 'A'

  return blingAxios.post('/contatos', body)
    .then(({ data }) => data?.data.id)
    .catch(err => {
      if (err.response) {
        logger.error(err.response)
        logger.warn(JSON.stringify(err.response?.data))
      }
    })
}
