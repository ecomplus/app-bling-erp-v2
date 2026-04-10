const axios = require('axios')

module.exports = (accessToken, clientId, clientSecret) => {
  let headers = {
  }

  console.log('>>> Request with ', accessToken ? ` token: ${accessToken}` : 'Basic Auth', ` ${new Date().toISOString()}`)
  const baseURL = 'https://api.bling.com.br/Api/v3'
  if (accessToken) {
    headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    }
  } else if (clientId && clientSecret) {
    console.log('> client id ', clientId, ' client secret', clientSecret, ' <')
    headers = {
      Accept: '1.0',
      Authorization: 'Basic ' +
        Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64')
    }
  }
  const body = {
    baseURL,
    headers,
    timeout: accessToken ? 10000 : 30000
  }

  return axios.create(body)
}
