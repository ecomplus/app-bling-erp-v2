const admin = require('firebase-admin')
const { nameCollectionEvents } = require('../../__env')
// const { sendMessageTopic } = require('./utils')
const { logger } = require('../../context')

const limitTimeProcessing = (2 * 60 * 1000)
const Timestamp = admin.firestore.Timestamp
const createEvent = async (storeId, id, documentId) => {
  return admin.firestore().doc(`running_events/${storeId}_${id}`)
    .set({
      documentId,
      storeId,
      createdAt: new Date().toISOString(),
      status: 'create'
    }, { merge: true })
  // return sendMessageTopic('webhooks', { documentId, storeId })
}

const addEventsQueue = async (change, context) => {
  const strStoreId = context.params.storeId
  // if (strStoreId !== '1131') {
  //   return null
  // }

  const docRefQueue = await admin.firestore().doc(`queue/${strStoreId}`).get()

  const collectionName = `queue/${strStoreId}/${nameCollectionEvents}`
  const eventRef = admin.firestore().collection(collectionName)

  const oldestEventSnapshot = await eventRef
    .orderBy('createdAt', 'asc')
    .limit(1)
    .get()

  if (!oldestEventSnapshot.empty) {
    const docOldestEvent = oldestEventSnapshot.docs[0]
    const oldestEvent = docOldestEvent.data()
    const {
      storeId,
      processingAt
    } = oldestEvent

    const id = docOldestEvent.id
    const documentId = `${collectionName}/${id}`
    const now = Timestamp.now()
    const processingTime = processingAt && (now.toMillis() - processingAt.toMillis())
    const isProcessing = processingTime && processingTime < limitTimeProcessing
    if (!processingAt) {
      await createEvent(storeId, id, documentId)
        .then(async (messageId) => {
          logger.info(`>[${storeId}] Send event ${id} => ${documentId}`)
          await docOldestEvent.ref.update({
            processingAt: Timestamp.now(),
            eventId: messageId
          })
        })
        .catch(async (err) => {
          logger.error(err)

          await docOldestEvent.ref.set({
            flag: 'Error'
          }, { merge: true })
        })

      await docRefQueue.ref.set({
        updatedAt: Timestamp.now()
      }, { merge: true })
    } else if (!isProcessing) {
      const attempts = (oldestEvent.attempts || 0) + 1
      if (attempts <= 4) {
        // send to the end of the queue
        await docOldestEvent.ref
          .update({
            processingAt: admin.firestore.FieldValue.delete(),
            createdAt: Timestamp.now(),
            attempts
          })
      } else {
        await docOldestEvent.ref.delete()
      }
    }
  }

  return null
}

module.exports = {
  addEventsQueue
}
