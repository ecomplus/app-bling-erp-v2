// setup server and app options from Functions config (and mocks)
let pkg, server, ecomApp
try {
  const config = require('firebase-functions').config()
  pkg = config.pkg
  server = config.server
  ecomApp = config.app
} catch (e) {
  //
}

if (!pkg || !pkg.name) {
  pkg = {
    name: process.env.NAME,
    version: process.env.VERSION
  }
}
if (!server || !server.operator_token) {
  server = {
    operator_token: process.env.SERVER_OPERATOR_TOKEN,
    base_uri: process.env.SERVER_BASE_URI,
    functionName: process.env.FUNCTION_NAME
  }
}
const functionName = server.functionName || 'app'

// O app_id muda por ambiente: um ambiente de homologação precisa do seu próprio
// registro na E-Com para que callbacks e webhooks não caiam em produção. Sem
// nada configurado, continua sendo o app de produção.
const appId = parseInt((ecomApp && ecomApp.id) || process.env.ECOM_APP_ID, 10) || 102418

module.exports = {
  functionName,
  appId,
  operatorToken: server && server.operator_token,
  baseUri: (server && server.base_uri) ||
    `https://us-central1-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/${functionName}`,
  pkg: {
    ...pkg
  },
  nameCollectionEvents: 'events'
}
