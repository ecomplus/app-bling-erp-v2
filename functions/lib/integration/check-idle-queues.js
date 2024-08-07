const { firestore } = require('firebase-admin')
const { setup } = require('@ecomplus/application-sdk')
const getAppData = require('../store-api/get-app-data')
const updateAppData = require('../store-api/update-app-data')

const listStoreIds = async () => {
  const storeIds = []
  const date = new Date()
  date.setHours(date.getHours() - 48)
  const querySnapshot = await firestore()
    .collection('ecomplus_app_auth')
    .where('updated_at', '>', firestore.Timestamp.fromDate(date))
    .get()
  querySnapshot.forEach(documentSnapshot => {
    const storeId = documentSnapshot.get('store_id')
    if (storeIds.indexOf(storeId) === -1) {
      storeIds.push(storeId)
    }
  })
  return storeIds
}

const checkIdleQueue = ({ appSdk, storeId }) => {
  return new Promise((resolve, reject) => {
    getAppData({ appSdk, storeId })
      .then(appData => {
        resolve()

        let hasWaitingQueue = false
        const { importation, exportation } = appData
        console.log('the is importation', JSON.stringify(importation))
        if (
          importation &&
          (
            (Array.isArray(importation.skus) && importation.skus.length) ||
            (Array.isArray(importation.order_numbers) && importation.order_numbers.length)
          )
        ) {
          hasWaitingQueue = true
        } else if (
          exportation &&
          (
            (Array.isArray(exportation.order_ids) && exportation.order_ids.length) ||
            (Array.isArray(exportation.product_ids) && exportation.product_ids.length)
          )
        ) {
          hasWaitingQueue = true
        }

        if (hasWaitingQueue) {
          firestore().doc(`running/${storeId}`).get()
            .then(documentSnapshot => {
              if (
                !documentSnapshot.exists ||
                Date.now() - documentSnapshot.updateTime.toDate().getTime() > 1000 * 60 * 3
              ) {
                console.log(`> #${storeId} Random trigger`)
                return updateAppData({ appSdk, storeId }, {
                  __rand: String(Math.random())
                })
              }
            })
            .catch(console.error)
        }
      })
      .catch(reject)
  })
}

module.exports = context => setup(null, true, firestore())
  .then(async appSdk => {
    const storeIds = await listStoreIds()
    console.log('store ids', storeIds)
    const runAllStores = fn_1 => storeIds
      .sort(() => Math.random() - Math.random())
      .map(storeId => fn_1({ appSdk, storeId }))
    return await Promise.all(runAllStores(checkIdleQueue))
  })
  .catch(console.error)
