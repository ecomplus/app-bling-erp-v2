const getAppData = require('./../../lib/store-api/get-app-data')
const updateAppData = require('./../../lib/store-api/update-app-data')
const { getFirestore, Timestamp } = require('firebase-admin/firestore')
const blingAuth = require('../../lib/bling-auth/create-auth')
const Bling = require('../../lib/bling-auth/client')
const { logger } = require('../../context')
// const { baseUri } = require('./../../__env')

const firestoreColl = 'bling_tokens'
exports.get = async ({ appSdk, admin }, req, res) => {
  const { query } = req
  const { state, code } = query
  const storeId = parseInt(query.store_id, 10)
  logger.info(`'>> Store: ${storeId} code: ${code} aplicativo ${state} <<'`)
  if (storeId > 100 && code) {
    return appSdk.getAuth(storeId)
      .then(async (auth) => {
        try {
          getAppData({ appSdk, storeId, auth })
            .then(async (appData) => {
              const { client_id: clientId, client_secret: clientSecret } = appData
              logger.info(`Pass variables ${JSON.stringify({ clientId, clientSecret, code, storeId })}`)
              await blingAuth(clientId, clientSecret, code, storeId).then(async (data) => {
                const now = Timestamp.now()
                await getFirestore().doc(`${firestoreColl}/${storeId}`).set({
                  ...data,
                  expiredAt: Timestamp.fromMillis(now.toMillis() + ((data.expires_in - 3600) * 1000)),
                  createdAt: now,
                  updatedAt: now,
                  isBloqued: false
                })
              })
              const blingApi = new Bling(clientId, clientSecret, storeId)
              const contatsType = await blingApi.get('/contatos/tipos').then(({ data }) => data?.data)
              const contatTypeClient = contatsType.find(({ descricao }) => descricao === 'Cliente')
              logger.info(`contatos ${JSON.stringify(contatTypeClient)}`)

              if (contatTypeClient) {
                const otherConfig = appData.other_config || {}
                Object.assign(otherConfig, { _contatTypeClientId: contatTypeClient.id })
                await updateAppData({ appSdk, storeId, auth }, { other_config: otherConfig }, true)
                  .catch(err => logger.error(err))
              }

              return res.status(200).redirect('https://app.e-com.plus/#/apps/edit/102418/')
            })
        } catch (error) {
          const { response, config } = error
          let status
          if (response) {
            status = response.status
            const err = new Error(`#${storeId} Bling Webhook error ${status}`)
            err.url = config && config.url
            err.status = status
            err.response = JSON.stringify(response.data)
            logger.error(err)
          } else {
            logger.error(error)
          }
          if (!res.headersSent) {
            return res.sendStatus(400)
          }
        }
      })
      .catch(() => {
        if (!res.headersSent) {
          res.sendStatus(401)
        }
      })
  } else {
    return res.send({
      status: 404,
      msg: `StoreId #${storeId} not found`
    })
  }
}
