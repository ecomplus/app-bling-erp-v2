const { Timestamp, getFirestore } = require('firebase-admin/firestore')
const { logger } = require('../../context')
const { nameCollectionEvents } = require('../../__env')
const checkApiBling = require('../../lib/bling-auth/check-enable-api')
// const getAppData = require('./../../lib/store-api/get-app-data')

exports.post = async ({ appSdk, admin }, req, res) => {
  try {
    // const blingToken = req.query.token
    const storeId = parseInt(req.query.store_id, 10)
    if (storeId > 100 && req.body) {
      await appSdk.getAuth(storeId)
      // const appData = await getAppData({ appSdk, storeId, auth })

      const isApiBlingOk = await checkApiBling(storeId)

      if (!isApiBlingOk) {
        logger.warn('> Error in request to api Bling')
        return res.sendStatus(403)
      }

      logger.info(`storeId: ${storeId} ${JSON.stringify(req.body)}`)

      let { retorno } = req.body
      if (!retorno && typeof req.body.data === 'string') {
        try {
          const data = JSON.parse(req.body.data)
          retorno = data.retorno
        } catch (e) {
        }
      }
      const now = Timestamp.now()
      const body = {
        eventBy: 'bling',
        storeId,
        action: 'importation',
        createdAt: now,
        mustUpdateAppQueue: false,
        canCreateNew: false,
        isHiddenQueue: true
      }

      const promises = []

      if (retorno) {
        if (retorno.pedidos && retorno.pedidos.length) {
          retorno.pedidos.forEach(({ pedido }) => {
            console.log(`${JSON.stringify(pedido)}`)
            const { numero } = pedido
            const resourceId = `${numero}`
            const docRef = getFirestore()
              .doc(`queue/${storeId}/${nameCollectionEvents}/order_${numero}`)
            promises.push(docRef.set({
              ...body,
              resourceId,
              queue: 'order_numbers',
              _blingId: numero
            }, { merge: true })
              .catch(logger.error)
            )
          })
        }

        if (retorno.estoques && retorno.estoques.length) {
          retorno.estoques.forEach(({ estoque }) => {
            const { id, codigo } = estoque
            const resourceId = `${codigo};:`
            const docRef = getFirestore()
              .doc(`queue/${storeId}/${nameCollectionEvents}/product_${id}`)
            promises.push(docRef.set({
              ...body,
              resourceId,
              queue: 'skus',
              _blingId: id
            }, { merge: true })
              .catch(logger.error)
            )
          })
        }

        if (retorno.produtos && retorno.produtos.length) {
          retorno.produtos.forEach(({ produto }) => {
            const { id, codigo } = produto
            const resourceId = `${codigo};:`
            const docRef = getFirestore()
              .doc(`queue/${storeId}/${nameCollectionEvents}/product_${id}`)
            promises.push(docRef.set({
              ...body,
              resourceId,
              queue: 'skus',
              _blingId: id,
              canCreateNew: true,
            }, { merge: true })
              .catch(logger.error)
            )
          })
        }

        await Promise.all(promises)
        return res.sendStatus(200)
        /*
          TODO: check Bling server IPs
          const clientIp = req.get('x-forwarded-for') || req.connection.remoteAddress
          */
      } else {
        logger.log(`#${storeId} unexpected Bling callback: ${JSON.stringify(req.body)}`)
        return res.status(200)
          .send('Ignoring invalid request body')
      }
    }

    return res.sendStatus(403)
  } catch (err) {
    logger.error(err)
    return res.sendStatus(500)
  }
}
