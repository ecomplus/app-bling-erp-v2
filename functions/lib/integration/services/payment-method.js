const blingAxios = require('../../bling-auth/create-access')

const parsePayment = (method) => {
  switch (method) {
    case 'credit_card':
      return 3
    case 'banking_billet':
      return 15
    case 'online_debit':
      return 16
    case 'account_deposit':
      return 17
    case 'debit_card':
      return 4
    case 'balance_on_intermediary':
      return 18
    case 'loyalty_points':
      return 19
    case 'other':
      return 99
  }
}

const getPaymentMethod = async (appData, storeId, paymentMethod) => {
  const {
    client_id: clientId,
    client_secret: clientSecret
  } = appData
  const bling = await blingAxios(clientId, clientSecret, storeId)
  const numberMethod = parsePayment(paymentMethod)
  const methodPayment = await bling.get(`/formas-pagamentos?tiposPagamentos[${numberMethod}]`)
  return methodPayment && methodPayment.data && methodPayment.data.data
}

const postPaymentMethod = async (appData, storeId, paymentMethod, body) => {
  const {
    client_id: clientId,
    client_secret: clientSecret
  } = appData
  const bling = await blingAxios(clientId, clientSecret, storeId)
  const numberMethod = parsePayment(paymentMethod)
  body.tipoPagamento = numberMethod
  const methodPayment = await bling.post('/formas-pagamentos', body)
  return methodPayment && methodPayment.data && methodPayment.data.data
}

module.exports = {
  getPaymentMethod,
  postPaymentMethod
}
