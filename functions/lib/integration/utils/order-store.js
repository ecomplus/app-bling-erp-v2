// loja (canal de venda) do pedido recebido no callback do Bling
const getBlingOrderStore = (pedido) => {
  const loja = pedido && pedido.loja
  if (loja && typeof loja === 'object') {
    return loja.id ? String(loja.id) : null
  }
  return loja ? String(loja) : null
}

/*
  Identifica pedidos de outras lojas do Bling (marketplaces, outros canais).
  Retorna null quando o pedido deve seguir o fluxo normal.
*/
const checkOrderStore = (orderStore, appData) => {
  const blingStore = appData && appData.bling_store
  if (!orderStore || !blingStore || String(orderStore) === String(blingStore)) {
    return null
  }
  return {
    orderStore: String(orderStore),
    blingStore: String(blingStore),
    isEnabled: appData.bling_store_orders_only === true
  }
}

module.exports = {
  getBlingOrderStore,
  checkOrderStore
}
