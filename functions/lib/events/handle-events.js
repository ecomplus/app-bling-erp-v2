const { Timestamp } = require('firebase-admin/firestore')
const admin = require('firebase-admin')
const getAppData = require('../store-api/get-app-data')
const { logger } = require('../../context')
const { getAppSdk, log } = require('./utils')

const integrationHandlers = {
  exportation: {
    product_ids: require('../integration/export-product'),
    order_ids: require('../integration/export-order')
  },
  importation: {
    skus: require('../integration/import-product'),
    order_numbers: require('../integration/import-order')
  }
}

// const limiteTime = (2 * 60 * 1000)

const handleEvents = async (event) => {
  const eventId = event.params.docId
  const snap = event.data
  const {
    documentId,
    storeId
  } = snap.data()

  logger.info(`>[${storeId}] Exec Event ${eventId} => ${documentId}`)
  const docRef = await admin.firestore().doc(`${documentId}`).get()
  const data = docRef?.data()

  if (docRef.exists) {
    const {
      eventBy,
      storeId,
      action,
      resourceId,
      queue,
      canCreateNew,
      mustUpdateAppQueue,
      isHiddenQueue,
      _blingId,
      webhookTransporte,
      webhookCodigosRastreamento
    } = data

    const appSdk = await getAppSdk()
    const auth = await appSdk.getAuth(storeId)
    const appData = await getAppData({ appSdk, storeId, auth }, true)

    if (appData) {
      const blingStore = appData.bling_store
      const blingDeposit = appData.bling_deposit

      const handler = integrationHandlers[action][queue.toLowerCase()]
      const queueEntry = { action, queue, nextId: resourceId, mustUpdateAppQueue, isHiddenQueue, webhookTransporte, webhookCodigosRastreamento }
      /*
        In some cases when importing products, Bling returns an empty list when searching for the SKU
        (which appears to be a bug in the Bling API, as it is a webhook event from Bling itself).
        To get around this, we will search for the product ID in Bling only if the list is empty.
      */

      if (_blingId) {
        queueEntry._blingId = _blingId
      }

      if (resourceId && handler) {
        logger.info(`> Start [${eventBy}]: ${action} ${queue} ${resourceId}`)
        await handler(
          { appSdk, storeId, auth },
          blingStore,
          blingDeposit,
          queueEntry,
          appData,
          canCreateNew,
          isHiddenQueue
        ).then(async (response) => {
          logger.info(`>Finish ${action} ${queue} ${resourceId} [${documentId}]`)
          await docRef.ref
            .delete()
            .catch(logger.error)

          return log({ appSdk, storeId }, queueEntry, response)
        })
          .catch(async (err) => {
            logger.error(err)
            const attempts = (data.attempts || 0) + 1
            let message = err.message

            if (err.message === 'Bling refreshToken is invalid need to update') {
              logger.warn(`> delete: ${documentId}`)
              await docRef.ref
                .delete()
            }

            if (err.response?.status >= 500 || err.response?.status === 429) {
              setTimeout(() => {
                // send to the end of the queue
                logger.warn(`> Error ${err.response.status}: ${documentId}`)
                return docRef.ref
                  .update({
                    processingAt: admin.firestore.FieldValue.delete(),
                    createdAt: Timestamp.now(),
                    attempts
                  })
              }, 1000)
              return
            } else if (err.response?.data) {
              logger.warn(`data Error: ${JSON.stringify(err.response.data)}`)
              message += ` => ${JSON.stringify(err.response.data)}`
            }

            if (!queueEntry.isNotQueued) {
              log({ appSdk, storeId }, queueEntry, err)
            }

            // send to the end of the queue
            return docRef.ref
              .update({
                processingAt: admin.firestore.FieldValue.delete(),
                createdAt: Timestamp.now(),
                message,
                attempts
              })
          })
      }
    }
  }

  return snap.ref.delete()
    .then(() => {
      logger.info(`>[${storeId}] Finish Event ${eventId} => ${documentId}`)
    })
}

module.exports = handleEvents
