// setup server and app options from Functions config (and mocks)
let pkg, server, ecomApp, blingApp
try {
  const config = require('firebase-functions').config()
  pkg = config.pkg
  server = config.server
  ecomApp = config.app
  blingApp = config.bling
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

// Credencial do app público do Bling. Fica no functions config (bling.client_id
// e bling.client_secret), nunca no repositório. Sem ela, o fluxo público fica
// desligado e o app se comporta como antes.
const blingPublicApp = {
  clientId: (blingApp && blingApp.client_id) || process.env.BLING_PUBLIC_CLIENT_ID,
  clientSecret: (blingApp && blingApp.client_secret) || process.env.BLING_PUBLIC_CLIENT_SECRET
}

module.exports = {
  functionName,
  appId,
  blingPublicApp,
  operatorToken: server && server.operator_token,
  baseUri: (server && server.base_uri) ||
    `https://us-central1-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/${functionName}`,
  pkg: {
    ...pkg
  },
  nameCollectionEvents: 'events'
}
