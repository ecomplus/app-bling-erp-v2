const axios = require('axios')

module.exports = (accessToken, clientId, clientSecret) => {
  let headers = {
  }

  console.log('>>> Request with ', accessToken ? 'Bearer token' : 'Basic Auth', ` ${new Date().toISOString()}`)
  const baseURL = 'https://api.bling.com.br/Api/v3'
  if (accessToken) {
    headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    }
  } else if (clientId && clientSecret) {
    // Nunca logar o client_secret: no app público ele é compartilhado por
    // todas as lojas, e o log identifica a credencial pelos 4 últimos dígitos.
    console.log('> client id ', `***${String(clientId).slice(-4)}`, ' <')
    headers = {
      Accept: '1.0',
      'enable-jwt': '1',
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
