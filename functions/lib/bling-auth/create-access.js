const createAxios = require('./create-axios')
const blingAuth = require('./create-auth')
const { Timestamp } = require('firebase-admin/firestore')
const { logger } = require('../../context')

const firestoreColl = 'bling_tokens'

module.exports = async function (clientId, clientSecret, storeId, tokenExpirationGap = 9000, isRateLimit = false) {
  let docRef
  if (firestoreColl) {
    docRef = require('firebase-admin')
      .firestore()
      .doc(`${firestoreColl}/${storeId}`)
  }
  const docSnapshot = await docRef.get()
  let accessToken
  if (docSnapshot.exists) {
    const {
      access_token: docAccessToken,
      refresh_token: refreshToken,
      expiredAt,
      isBloqued,
      updatedAt,
      isRateLimit: isRateLimitDoc
    } = docSnapshot.data()

    const now = Timestamp.now()
    const timeLimitBloqued = Timestamp.fromMillis(updatedAt.toMillis() + (12 * 60 * 60 * 1000))

    if (isBloqued) {
      throw new Error('Bling refreshToken is invalid need to update')
    }

    if (isRateLimit) {
      // enable daily rate limit
      await docRef.set({
        isRateLimit: false,
        updatedAt: now,
        countErr: 0
      }, { merge: true }).catch(logger.error)

      throw new Error('Bling daily rate limit reached, please try again later')
    } else if (isRateLimitDoc && now.toMillis() < timeLimitBloqued.toMillis()) {
      throw new Error('Bling daily rate limit reached, please try again later')
    } else if (isRateLimitDoc && now.toMillis() >= timeLimitBloqued.toMillis()) {
      // disable daily rate limit
      await docRef.set({
        isRateLimit: false,
        updatedAt: now,
        countErr: 0
      }, { merge: true }).catch(logger.error)
    }

    if (now.toMillis() + tokenExpirationGap < expiredAt.toMillis()) {
      accessToken = docAccessToken
    } else {
      try {
        const data = await blingAuth(clientId, clientSecret, null, storeId, refreshToken)
        await docRef.set({
          ...data,
          updatedAt: now,
          expiredAt: Timestamp.fromMillis(now.toMillis() + ((data.expires_in - 300) * 1000)),
          countErr: 0
        }, { merge: true })
        accessToken = data.access_token
      } catch (err) {
        logger.warn(`Cant refresh Bling OAuth token ${JSON.stringify({
          url: err.config.url,
          body: err.config.data,
          response: err.response.data,
          status: err.response.status
        })}`)
        const doc = await docRef.get()

        const countErr = doc.data().countErr || 0

        if (countErr > 3) {
          await docRef.set({
            isBloqued: true,
            updatedAt: now
          }, { merge: true }).catch(logger.error)
        }
        throw err
      }
    }
  } else {
    const err = new Error('No Bling token document')
    err.code = 'NO_BLING_TOKEN'
    throw err
  }

  return createAxios(accessToken)
}
