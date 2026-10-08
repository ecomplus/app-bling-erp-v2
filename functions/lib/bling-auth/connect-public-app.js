const { getFirestore, Timestamp } = require('firebase-admin/firestore')
const { appId } = require('../../__env')
const { logger } = require('../../context')
const getAppData = require('../store-api/get-app-data')
const updateAppData = require('../store-api/update-app-data')
const blingAuth = require('./create-auth')
const Bling = require('./client')
const renderPage = require('./connect-page')
const { getPublicApp, parseState } = require('./public-app')

// Retorno do Bling quando a autorização foi pelo app público. O state diz de
// que loja é a conexão; sem um state assinado por nós (instalação iniciada na
// Central de Extensões do Bling) nada é gravado.
module.exports = async ({ appSdk }, req, res) => {
  const { code, state } = req.query
  const publicApp = getPublicApp()
  const panelUrl = `https://app.e-com.plus/#/apps/edit/${appId}/`
  const storeId = parseState(publicApp.clientSecret, state)

  if (!storeId) {
    logger.info('Bling public app: autorização sem state da E-Com, pedindo para concluir pelo painel')
    return res.status(200).send(renderPage({
      title: 'Quase lá',
      message: 'Para concluir a conexão, abra o aplicativo Bling no painel da sua loja E-Com Plus e clique em "Conectar ao Bling".',
      link: panelUrl,
      linkLabel: 'Abrir painel da E-Com Plus'
    }))
  }

  try {
    const auth = await appSdk.getAuth(storeId)
    const tokenData = await blingAuth(publicApp.clientId, publicApp.clientSecret, code, storeId)

    const db = getFirestore()
    const docRef = db.doc(`bling_tokens/${storeId}`)
    const previous = await docRef.get()
    if (previous.exists) {
      // Guarda o token anterior antes de substituir: se a loja usava um app
      // privado, dá para voltar atrás sem pedir nova autorização.
      await db.doc(`bling_tokens_history/${storeId}_${Date.now()}`).set({
        ...previous.data(),
        replacedAt: Timestamp.now()
      })
    }
    const now = Timestamp.now()
    await docRef.set({
      ...tokenData,
      app: 'public',
      expiredAt: Timestamp.fromMillis(now.toMillis() + ((tokenData.expires_in - 3600) * 1000)),
      createdAt: now,
      updatedAt: now,
      isBloqued: false,
      countErr: 0
    })

    // O client_id público no cadastro é o que faz o webhook da E-Com processar
    // a loja; o segredo nunca vai para o cadastro, que o lojista consegue ler.
    const appData = await getAppData({ appSdk, storeId, auth })
    const hiddenData = { client_id: publicApp.clientId, client_secret: '' }
    try {
      const bling = new Bling(publicApp.clientId, publicApp.clientSecret, storeId)
      const contactTypes = await bling.get('/contatos/tipos').then(({ data }) => data?.data)
      const contactTypeClient = contactTypes && contactTypes.find(({ descricao }) => descricao === 'Cliente')
      if (contactTypeClient) {
        hiddenData.other_config = {
          ...(appData.other_config || {}),
          _contatTypeClientId: contactTypeClient.id
        }
      }
    } catch (err) {
      logger.warn(`Bling public app: não leu tipos de contato da loja ${storeId}: ${err.message}`)
    }
    await updateAppData({ appSdk, storeId, auth }, hiddenData, true)

    logger.info(`Bling public app conectado na loja ${storeId}`)
    return res.redirect(panelUrl)
  } catch (err) {
    logger.error(`Bling public app: falha ao conectar loja ${storeId} ${JSON.stringify({
      message: err.message,
      status: err.response?.status,
      response: err.response?.data
    })}`)
    return res.status(400).send(renderPage({
      title: 'Não foi possível conectar',
      message: 'A conexão com o Bling não foi concluída. Tente novamente pelo painel da sua loja E-Com Plus.',
      link: panelUrl,
      linkLabel: 'Voltar ao painel'
    }))
  }
}
