const { firestore } = require('firebase-admin')
const { setup } = require('@ecomplus/application-sdk')
const { logger } = require('../../context')
const getAppData = require('../store-api/get-app-data')
const upsertBlingAccessToken = require('../bling-auth/create-access')

const listStoreIds = () => {
  const storeIds = []
  const date = new Date()
  date.setHours(date.getHours() - 72)
  return firestore()
    .collection('ecomplus_app_auth')
    .where('updated_at', '>', firestore.Timestamp.fromDate(date))
    .get().then(querySnapshot => {
      querySnapshot.forEach(documentSnapshot => {
        const storeId = documentSnapshot.get('store_id')
        if (storeIds.indexOf(storeId) === -1) {
          storeIds.push(storeId)
        }
      })
      return storeIds
    })
}

const updateBlingToken = ({ appSdk, storeId }) => {
  return new Promise((resolve, reject) => {
    getAppData({ appSdk, storeId })
      .then(appData => {
        resolve()
        const {
          client_id: clientId,
          client_secret: clientSecret
        } = appData
        upsertBlingAccessToken(
          clientId,
          clientSecret,
          storeId,
          1000 * 60 * 60 + 1000 * 60 * 10
        )
          .then(() => {
            logger.info(`Checked Bling token for #${storeId}`)
          })
          .catch((err) => {
            if (err.code === 'NO_BLING_TOKEN') return
            logger.warn(err)
          })
      })
      .catch(reject)
  })
}

module.exports = context => setup(null, true, firestore())
  .then(appSdk => {
    return listStoreIds().then(storeIds => {
      const runAllStores = fn => storeIds
        .sort(() => Math.random() - Math.random())
        .map(storeId => fn({ appSdk, storeId }))
      return Promise.all(runAllStores(updateBlingToken))
    })
  })
  .catch(logger.error)
