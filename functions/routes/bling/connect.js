const { logger } = require('../../context')
const renderPage = require('../../lib/bling-auth/connect-page')
const {
  AUTHORIZE_URL,
  getPublicApp,
  isValidConnectToken,
  createState
} = require('../../lib/bling-auth/public-app')

// Início da conexão pelo app público: /bling/connect?store_id=X&token=Y.
// O token é a assinatura da loja, então só quem recebeu o link dela consegue
// iniciar a conexão — ninguém liga a própria conta Bling à loja de outro.
exports.get = (_ctx, req, res) => {
  const publicApp = getPublicApp()
  if (!publicApp) {
    return res.status(503).send(renderPage({
      title: 'Conexão indisponível',
      message: 'A conexão pelo aplicativo público do Bling ainda não está disponível.'
    }))
  }

  const storeId = parseInt(req.query.store_id, 10)
  if (!(storeId > 100) || !isValidConnectToken(publicApp.clientSecret, storeId, req.query.token)) {
    logger.warn(`Bling connect: link inválido para a loja ${req.query.store_id}`)
    return res.status(403).send(renderPage({
      title: 'Link inválido',
      message: 'Este link de conexão não é válido. Abra o aplicativo Bling no painel da sua loja E-Com Plus para gerar um novo.'
    }))
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: publicApp.clientId,
    state: createState(publicApp.clientSecret, storeId)
  })
  return res.redirect(`${AUTHORIZE_URL}?${params.toString()}`)
}
