const ecomUtils = require('@ecomplus/utils')
const parseAddress = require('../parsers/address-to-bling')
const { logger } = require('../../../context')
const url = require('url')

module.exports = async (blingAxios, appData, order) => {
  const _contatTypeClientId = appData.outher_config?._contatTypeClientId
  const buyer = order.buyers && order.buyers[0]
  const urlParams = {
    numeroDocumento: buyer.doc_number,
    criterio: 1 // Todos
  }
  const params = new url.URLSearchParams(urlParams)
  const contato = await blingAxios.get(`/contatos?${params.toString()}`)
    .then(({ data }) => {
      return data?.data && data.data[0]
    })
    .catch(logger.error)

  if (contato && contato.situacao === 'A') {
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
    if (!appData.disable_buyer_inscription) {
      if (
        buyer.inscription_number &&
        buyer.inscription_number.length <= 18 &&
        buyer.inscription_type !== 'Municipal'
      ) {
        blingCustomer.ie = buyer.inscription_number
      }
    }
    if (buyer.main_email && buyer.main_email.length <= 60) {
      blingCustomer.email = buyer.main_email
      blingCustomer.emailNotaFiscal = buyer.main_email
    }
    if (buyer.phones) {
      ;['celular', 'tel'].forEach((blingCustomerField, i) => {
        const phone = buyer.phones && buyer.phones[i]
        if (phone?.number.length >= 9 && phone.number.length <= 11) {
          if (phone.number.length === 9) {
            blingCustomer[blingCustomerField] = `11${phone.number}`
            return
          }
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

  const method = !contato ? 'post' : 'put'
  const endpoint = `/contatos${contato ? `/${contato.id}` : ''}`
  return blingAxios[method](endpoint, body)
    .then(({ data }) => contato ? contato.id : data?.data.id)
    .catch(err => {
      if (err.response) {
        logger.error(err.response)
        logger.warn(JSON.stringify(err.response?.data))
      }
    })
}
