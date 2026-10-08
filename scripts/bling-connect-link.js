#!/usr/bin/env node
// Gera o link de conexão de uma loja ao app público do Bling.
//
// Enquanto o painel da E-Com não tem o botão "Conectar ao Bling", este link é
// o caminho para conectar uma loja pelo app público — por exemplo, a loja de
// teste antes de liberar para as demais. Quem abrir o link autoriza a conta
// Bling dele nessa loja, então envie só para o responsável por ela.
//
// Uso:
//   BLING_PUBLIC_CLIENT_SECRET=... node scripts/bling-connect-link.js --store=45114
//
// Variáveis:
//   BLING_PUBLIC_CLIENT_SECRET  o mesmo valor de bling.client_secret no functions config
//   FIREBASE_PROJECT_ID         projeto (padrão: ecom-bling-v2)

const { createConnectToken } = require('../functions/lib/bling-auth/public-app')

const {
  BLING_PUBLIC_CLIENT_SECRET,
  FIREBASE_PROJECT_ID = 'ecom-bling-v2'
} = process.env

const arg = process.argv.find((a) => a.startsWith('--store='))
const storeId = arg ? parseInt(arg.split('=')[1], 10) : NaN

if (!BLING_PUBLIC_CLIENT_SECRET) {
  console.error('Defina BLING_PUBLIC_CLIENT_SECRET (o client_secret do app público).')
  process.exit(1)
}
if (!(storeId > 100)) {
  console.error('Informe a loja: --store=<store_id>')
  process.exit(1)
}

const params = new URLSearchParams({
  store_id: String(storeId),
  token: createConnectToken(BLING_PUBLIC_CLIENT_SECRET, storeId)
})
console.log(`https://us-central1-${FIREBASE_PROJECT_ID}.cloudfunctions.net/app/bling/connect?${params.toString()}`)
