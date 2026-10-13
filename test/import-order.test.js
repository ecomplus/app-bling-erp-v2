const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { loadWithStubs, createLogger } = require('./helpers/load-with-stubs')
const { createFakeBling, createFakeAppSdk } = require('./helpers/fakes')

const storeId = 51266
const appData = { client_id: 'id', client_secret: 'secret', bling_store: '203173711' }

describe('import-order: #2 pedidos de outras lojas do Bling', () => {
  const setup = ({ ecomOrders = [] } = {}) => {
    const log = createLogger()
    const bling = createFakeBling([
      ['/pedidos/vendas?limite=1&numero=394209', { data: [{ id: 999 }] }],
      ['/pedidos/vendas/999', { data: { id: 999, numero: 394209, numeroLoja: '394209', situacao: { id: 9 } } }],
      ['/situacoes/9', { data: { id: 9, nome: 'Em aberto' } }]
    ])
    const sdk = createFakeAppSdk({ getResponse: () => ({ result: ecomOrders }) })
    const importOrder = loadWithStubs('./lib/integration/import-order', {
      './context': { logger: log.logger },
      './lib/bling-auth/client': bling.FakeBling,
      './lib/integration/parsers/order-to-ecomplus': async () => ({}),
      './lib/integration/parsers/order-to-ecomplus/status': () => ({})
    })
    const run = (queueEntry, data = appData) => importOrder({ appSdk: sdk.appSdk, storeId }, data.bling_store, undefined, queueEntry, data)
    return { run, log, bling, sdk }
  }

  const callbackEntry = loja => ({ action: 'importation', queue: 'order_numbers', nextId: '394209', _blingId: '394209', _blingStore: loja })
  const filterLogs = log => log.lines.filter(line => line.includes('[ORDER_STORE_FILTER]'))

  it('ligado: ignora pedido de outra loja sem consultar Bling nem a loja', async () => {
    const { run, log, bling, sdk } = setup()
    const result = await run(callbackEntry('203862437'), { ...appData, bling_store_orders_only: true })
    assert.equal(result, null)
    assert.deepEqual(bling.calls, [])
    assert.deepEqual(sdk.requests, [])
    assert.match(filterLogs(log)[0], /numero=394209 loja=203862437 bling_store=203173711 enabled=true/)
  })

  it('desligado (modo só log): segue o fluxo e registra que o pedido não existe na loja', async () => {
    const { run, log, bling, sdk } = setup()
    await run(callbackEntry('203862437'))
    assert.equal(bling.calls.length, 3)
    assert.equal(sdk.requests[0].url.startsWith('/orders.json?'), true)
    const lines = filterLogs(log)
    assert.match(lines[0], /enabled=false/)
    assert.match(lines[1], /numero=394209 loja=203862437 found=false/)
  })

  it('modo só log detecta pedido de outra loja que existe na plataforma', async () => {
    const { run, log } = setup({ ecomOrders: [{ _id: 'o1', shipping_lines: [] }] })
    await run(callbackEntry('203862437'))
    assert.match(filterLogs(log)[1], /found=true/)
  })

  it('pedido da loja configurada segue o fluxo normal sem logs do filtro', async () => {
    const { run, log, bling } = setup({ ecomOrders: [{ _id: 'o1', shipping_lines: [] }] })
    await run(callbackEntry('203173711'), { ...appData, bling_store_orders_only: true })
    assert.equal(bling.calls.length, 3)
    assert.deepEqual(filterLogs(log), [])
  })

  it('importação manual (sem loja no evento) segue o fluxo normal', async () => {
    const { run, bling } = setup()
    await run({ action: 'importation', queue: 'order_numbers', nextId: '394209' }, { ...appData, bling_store_orders_only: true })
    assert.equal(bling.calls.length, 3)
  })

  it('sem código da loja no app segue o fluxo normal', async () => {
    const { run, bling } = setup()
    await run(callbackEntry('203862437'), { ...appData, bling_store: '', bling_store_orders_only: true })
    assert.equal(bling.calls.length, 3)
  })
})
