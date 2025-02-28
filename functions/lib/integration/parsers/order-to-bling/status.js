const findStatusConfig = (statusApi, appData) => {
  if (!appData.parse_status || !appData.parse_status.length) return null

  const parseStatus = {
    pending: 'Pendente',
    under_analysis: 'Em análise',
    authorized: 'Autorizado',
    unauthorized: 'Não autorizado',
    partially_paid: 'Parte pago',
    paid: 'Pago',
    in_dispute: 'Disputa',
    partially_refunded: 'Parte devolvido',
    refunded: 'Devolvido',
    voided: 'Cancelado',
    in_production: 'Em produção',
    in_separation: 'Em separação',
    ready_for_shipping: 'Pronto para envio',
    invoice_issued: 'NF emitida',
    shipped: 'Enviado',
    partially_shipped: 'Parte enviado',
    partially_delivered: 'Parte entregue',
    delivered: 'Entregue',
    returned_for_exchange: 'Retorno e troca',
    received_for_exchange: 'Aguardando troca'
  }

  const statusApp = appData.parse_status.find(status => status.status_ecom === parseStatus[statusApi])
  return statusApp?.status_bling || null
}

module.exports = (order, appData) => {
  let financialStatus = order.financial_status && order.financial_status.current
  if (!financialStatus) {
    const paymentsHistory = order.payments_history
    if (paymentsHistory && paymentsHistory.length) {
      financialStatus = paymentsHistory[paymentsHistory.length - 1].status
    }
  }

  switch (financialStatus) {
    case 'pending':
    case 'under_analysis':
    case 'unknown':
    case 'authorized':
    case 'partially_paid':
      return findStatusConfig(financialStatus, appData) || 'em aberto'
    case 'voided':
    case 'refunded':
    case 'in_dispute':
    case 'unauthorized':
    case 'partially_refunded':
      return findStatusConfig(financialStatus, appData) || 'cancelado'
  }

  const fulfillmentStatus = order.fulfillment_status && order.fulfillment_status.current
  switch (fulfillmentStatus) {
    case 'in_production':
      return findStatusConfig(fulfillmentStatus, appData) || ['em produção', 'em andamento']
    case 'in_separation':
      return findStatusConfig(fulfillmentStatus, appData) || ['em separação', 'em andamento']
    case 'invoice_issued':
      return findStatusConfig(fulfillmentStatus, appData) || ['faturado', 'atendido']
    case 'ready_for_shipping':
      return findStatusConfig(fulfillmentStatus, appData) || ['pronto para envio', 'pronto envio']
    case 'shipped':
    case 'partially_shipped':
      return findStatusConfig(fulfillmentStatus, appData) || ['enviado', 'atendido']
    case 'delivered':
      return findStatusConfig(fulfillmentStatus, appData) || ['entregue', 'atendido']
  }

  if (financialStatus && financialStatus === 'paid') {
    return findStatusConfig(fulfillmentStatus, appData) || ['aprovado', 'em aberto']
  }
  return 'em aberto'
}
