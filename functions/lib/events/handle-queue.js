const admin = require('firebase-admin')
const { nameCollectionEvents } = require('../../__env')
// const { sendMessageTopic } = require('./utils')
const { logger } = require('../../context')

const limitTimeProcessing = (2 * 60 * 1000)
const Timestamp = admin.firestore.Timestamp

const delay = (timeoutMs = 1000) => new Promise(resolve => {
  setTimeout(() => {
    resolve(true)
  }, timeoutMs)
})

const deleteEvent = (storeId, id) => {
  return admin.firestore().doc(`running_events/${storeId}_${id}`)
    .delete()
}
const createEvent = async (storeId, id, documentId) => {
  const docEvent = admin.firestore().doc(`running_events/${storeId}_${id}`)
  const docEventSnapshot = await docEvent.get()

  if (docEventSnapshot.exists) {
    const { createdAt } = docEventSnapshot.data()
    if ((new Date().getTime() - new Date(createdAt).getTime()) > limitTimeProcessing) {
      // remove event queue and send to last
      await docEvent.delete()
      return admin.firestore().doc(`${documentId}`)
        .update({
          processingAt: admin.firestore.FieldValue.delete(),
          createdAt: Timestamp.now()
        })
        .then(() => null)
    }
  }

  await delay()
  return docEvent.set({
    documentId,
    storeId,
    createdAt: new Date().toISOString(),
    status: 'create'
  }, { merge: true })
    .then(() => true)
}

const addEventsQueue = async (event) => {
  const strStoreId = event.params.storeId
  const collectionName = `queue/${strStoreId}/${nameCollectionEvents}`
  const eventRef = admin.firestore().collection(collectionName)

  const oldestEventSnapshot = await eventRef
    .orderBy('createdAt', 'asc')
    .limit(1)
    .get()

  if (oldestEventSnapshot.empty) {
    logger.info('> is empty')
    return null
  }

  const docRef = oldestEventSnapshot.docs[0].ref

  // Single atomic decision point: read + claim happen in the same transaction,
  // so concurrent executions racing for the same oldest event can't both win.
  // Losers get { action: 'skip' } and do nothing further.
  const claim = await admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(docRef)
    if (!snap.exists) {
      return { action: 'none' }
    }

    const { storeId, processingAt, attempts = 0 } = snap.data()
    const now = Timestamp.now()
    const processingTime = processingAt && (now.toMillis() - processingAt.toMillis())
    const isProcessing = processingTime !== null && processingTime !== undefined && processingTime < limitTimeProcessing

    if (!storeId || attempts > 3) {
      tx.delete(docRef)
      return { action: 'deleted', storeId }
    }
    if (!processingAt) {
      tx.update(docRef, { processingAt: now })
      return { action: 'claim', storeId, id: docRef.id }
    }
    if (!isProcessing) {
      const nextAttempts = attempts + 1
      if (nextAttempts <= 3) {
        // send to the end of the queue
        tx.update(docRef, {
          processingAt: admin.firestore.FieldValue.delete(),
          createdAt: now,
          attempts: nextAttempts
        })
      } else {
        tx.delete(docRef)
      }
      return { action: 'requeued', storeId }
    }

    logger.info(`${collectionName}/${docRef.id}, ${processingAt.toDate().toISOString()}, ${processingTime}`)
    return { action: 'skip', storeId }
  })

  const documentId = `${collectionName}/${docRef.id}`

  if (claim.action === 'deleted' || claim.action === 'requeued') {
    await deleteEvent(claim.storeId, docRef.id) // event starts only on creation
  }

  if (claim.action === 'claim') {
    try {
      const created = await createEvent(claim.storeId, claim.id, documentId)
      if (created) {
        logger.info(`>[${claim.storeId}] Send event ${claim.id} => ${documentId}`)
      }

      await admin.firestore().doc(`queue/${strStoreId}`).set({
        updatedAt: admin.firestore.FieldValue.delete(),
        lastTimeExecuted: Timestamp.now(),
        lastExecuted: documentId
      }, { merge: true })
    } catch (err) {
      logger.error(err)

      // Only flag if the document still exists — avoids recreating a
      // phantom doc (without createdAt) that would re-trigger the queue.
      const stillExists = await docRef.get()
      if (stillExists.exists) {
        await docRef.set({
          flag: 'Error'
        }, { merge: true })
      }
    }
  }

  return null
}

module.exports = {
  addEventsQueue
}
