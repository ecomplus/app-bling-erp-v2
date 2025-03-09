module.exports = (situacao, appData) => {
  let financialStatus, fulfillmentStatus
  switch (situacao) {
    case 'venda agenciada':
    case 'aprovado':
    case 'pago':
      financialStatus = 'paid'
      break
    case 'em andamento':
    case 'em separação':
    case 'em separacao':
      fulfillmentStatus = 'in_separation'
      break
    case 'em produção':
    case 'em producao':
      fulfillmentStatus = 'in_production'
      break
    case 'faturado':
    case 'atendido':
    case 'nf emitida':
      fulfillmentStatus = 'invoice_issued'
      break
    case 'pronto para envio':
      fulfillmentStatus = 'ready_for_shipping'
      break
    case 'parte enviado':
      fulfillmentStatus = 'partially_shipped'
      break
    case 'enviado':
    case 'despachado':
      fulfillmentStatus = 'shipped'
      break
    case 'parte entregue':
      fulfillmentStatus = 'partially_delivered'
      break
    case 'entregue':
      fulfillmentStatus = 'delivered'
      break
    case 'cancelado':
      financialStatus = 'voided'
      break
    case 'aguardando troca':
      fulfillmentStatus = 'received_for_exchange'
      break
    case 'parte devolvido':
      fulfillmentStatus = 'partially_refunded'
      break
    case 'devolvido':
      fulfillmentStatus = 'refunded'
      break
    case 'retorno e troca':
      fulfillmentStatus = 'returned_for_exchange'
      break
    case 'parte pago':
      financialStatus = 'partially_paid'
      break
    case 'disputa':
      financialStatus = 'in_dispute'
      break
  }

  if (!financialStatus && !fulfillmentStatus) {

    const statusApp = appData.parse_status.find(status => status.status_bling === situacao)
    
    if (statusApp && statusApp.status_ecom) {
      const parseStatus = [
        ['pending', 'Pendente', 'financial'],
        ['under_analysis', 'Em análise', 'financial'],
        ['authorized', 'Autorizado', 'financial'],
        ['unauthorized', 'Não autorizado', 'financial'],
        ['partially_paid', 'Parte pago', 'financial'],
        ['paid', 'Pago', 'financial'],
        ['in_dispute', 'Disputa', 'financial'],
        ['partially_refunded', 'Parte devolvido', 'financial'],
        ['refunded', 'Devolvido', 'financial'],
        ['voided', 'Cancelado', 'financial'],
        ['in_production', 'Em produção', 'fulfillment'],
        ['in_separation', 'Em separação', 'fulfillment'],
        ['ready_for_shipping', 'Pronto para envio', 'fulfillment'],
        ['invoice_issued', 'NF emitida', 'fulfillment'],
        ['shipped', 'Enviado', 'fulfillment'],
        ['partially_shipped', 'Parte enviado', 'fulfillment'],
        ['partially_delivered', 'Parte entregue', 'fulfillment'],
        ['delivered', 'Entregue', 'fulfillment'],
        ['returned_for_exchange', 'Retorno e troca', 'fulfillment'],
        ['received_for_exchange', 'Aguardando troca', 'fulfillment']
      ];

      const matchedEcom = parseStatus.find(([key, val]) => val.toLowerCase() === statusObject.status_ecom.toLowerCase());
      if (matchedEcom) {
          const [key, , category] = matchedEcom;
          category === 'financial' ? 
            financialStatus = key 
            : fulfillmentStatus = key
      }
    }

  }
  return { financialStatus, fulfillmentStatus }
}
