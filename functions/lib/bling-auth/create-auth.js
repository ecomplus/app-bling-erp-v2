const url = require('url')
const { logger } = require('../../context')

module.exports = (clientId, clientSecret, code, storeId, refreshToken) => new Promise((resolve, reject) => {
  //  https://developer.bling.com.br/aplicativos#fluxo-de-autoriza%C3%A7%C3%A3o
  const axios = require('./create-axios')(undefined, clientId, clientSecret)
  const request = (retryCount = 0) => {
    const path = '/oauth/token'
    logger.info(`>> Create Auth with ${refreshToken ? 'refresh_token' : 'code'}`)
    const grandType = {
      grant_type: refreshToken ? 'refresh_token' : 'authorization_code'
    }
    if (refreshToken) {
      grandType.refresh_token = refreshToken
    } else if (code) {
      grandType.code = code
    }
    const params = new url.URLSearchParams(grandType)
    axios.post(path, params.toString())
      .then(({ data }) => resolve(data))
      .catch(err => {
        logger.error(`> Deu erro s:${storeId} => ${JSON.stringify(err)}`)
        logger.error(`# ${storeId} => ${err.response?.data && JSON.stringify(err.response.data)}`)
        if (retryCount < 2 && err.response?.status === 429) {
          const delay = retryCount === 0 ? 15000 : 30000
          setTimeout(() => request(retryCount + 1), delay)
        } else {
          reject(err)
        }
      })
  }
  request(0)
})
