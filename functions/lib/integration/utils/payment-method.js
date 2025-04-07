const parsePaymentType = {
  credit_card: 3, // Cartão de Crédito
  banking_billet: 15, // Boleto Bancário
  online_debit: 16,
  account_deposit: 20, // Pagamento Instantâneo (PIX) – Estático
  debit_card: 4, // Cartão de Débito
  balance_on_intermediary: 18,
  loyalty_points: 19, // Programa de Fidelidade, Cashback, Crédito Virtual
  other: 99 // Outros
}

const getPaymentMethod = async (blingAxios, paymentMethodCode) => {
  const numberMethod = parsePaymentType[paymentMethodCode]
  return blingAxios.get(`/formas-pagamentos?tiposPagamentos[]=${numberMethod}`)
    .then(({ data: { data } }) => data)
}

const postPaymentMethod = async (blingAxios, paymentMethod, body) => {
  const numberMethod = parsePaymentType[paymentMethod]
  body.tipoPagamento = numberMethod
  return blingAxios.post('/formas-pagamentos', body)
    .then(({ data: { data } }) => data)
}

const getPaymentBling = async (blingAxios, transaction, appDataParsePayment, paymentLabel) => {
  const paymentMethod = transaction?.payment_method || {}
  const namePaymentMethod = (paymentLabel || paymentMethod.name)?.toLowerCase()
  let parsePayment
  if (appDataParsePayment && appDataParsePayment.length) {
    parsePayment = appDataParsePayment.find(payment => payment.ecom_payment.toLowerCase() === namePaymentMethod)
  }
  if (!parsePayment) {
    const query = paymentMethod.code ? `?tiposPagamentos[]=${parsePaymentType[paymentMethod.code]}` : ''
    const formasPagamentos = await blingAxios.get(`/formas-pagamentos${query}`)
      .then(({ data }) => {
        if (!data.data?.length) {
          return blingAxios.get('/formas-pagamentos')
            .then(({ data }) => {
              return data.data && data.data[0]
            })
        }
        return data.data[0]
      })
    return formasPagamentos?.id
  }
  return parsePayment.bling_payment
}

module.exports = {
  getPaymentMethod,
  postPaymentMethod,
  getPaymentBling
}
