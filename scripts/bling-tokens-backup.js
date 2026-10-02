#!/usr/bin/env node
// Backup e restauração da coleção bling_tokens (as credenciais OAuth de cada
// loja integrada ao Bling).
//
// Existe por causa de um modo de falha específico: se o app renovar token com a
// credencial errada, lib/bling-auth/create-access.js incrementa countErr e, no
// terceiro erro, grava isBloqued: true. Como o cron updateBlingTokens roda duas
// vezes por hora, dá para bloquear todas as lojas em ~1h30 sem ninguém tocar em
// nada — e reverter o código NÃO desbloqueia, porque isBloqued fica persistido.
// Com um backup, restaura-se o estado anterior sem reautorizar loja por loja.
//
// Rode ANTES de cada deploy que toque em lib/bling-auth/ ou no fluxo de token.
//
// Uso:
//   node scripts/bling-tokens-backup.js                      # backup
//   node scripts/bling-tokens-backup.js --restore=<arquivo>  # simula restauração
//   node scripts/bling-tokens-backup.js --restore=<arquivo> --apply
//   node scripts/bling-tokens-backup.js --restore=<arquivo> --apply --store=45114
//
// Variáveis:
//   FIREBASE_PROJECT_ID  projeto do Firestore (padrão: ecom-bling-v2)
//   BLING_BACKUP_DIR     pasta dos backups (padrão: ~/bling-tokens-backups)
//
// O arquivo gerado contém access_token e refresh_token de TODAS as lojas. Ele é
// gravado fora do repositório, com permissão 0600, e não deve ser versionado nem
// enviado por canal aberto.

const fs = require('fs')
const os = require('os')
const path = require('path')

const COLL = 'bling_tokens'
const {
  FIREBASE_PROJECT_ID = 'ecom-bling-v2',
  BLING_BACKUP_DIR
} = process.env

const argOf = (name) => {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`))
  return arg ? arg.split('=').slice(1).join('=') : null
}
const backupDir = BLING_BACKUP_DIR || path.join(os.homedir(), 'bling-tokens-backups')
const restoreFile = argOf('restore')
const onlyStore = argOf('store')
const isApply = process.argv.includes('--apply')

const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'))
// Pela subrota ('firebase-admin/firestore') não resolve quando o pacote é
// exigido por caminho absoluto, que é o caso aqui.
const { Timestamp } = admin.firestore
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: FIREBASE_PROJECT_ID
})
const db = admin.firestore()

// Timestamp do Firestore não sobrevive a JSON.stringify — marca e reconstrói.
const encode = (value) => {
  if (value instanceof Timestamp) return { __timestamp__: { seconds: value.seconds, nanoseconds: value.nanoseconds } }
  if (Array.isArray(value)) return value.map(encode)
  if (value && typeof value === 'object') {
    const out = {}
    for (const k of Object.keys(value)) out[k] = encode(value[k])
    return out
  }
  return value
}
const decode = (value) => {
  if (value && typeof value === 'object' && value.__timestamp__) {
    return new Timestamp(value.__timestamp__.seconds, value.__timestamp__.nanoseconds)
  }
  if (Array.isArray(value)) return value.map(decode)
  if (value && typeof value === 'object') {
    const out = {}
    for (const k of Object.keys(value)) out[k] = decode(value[k])
    return out
  }
  return value
}

const resumo = (docs) => {
  const bloqueadas = docs.filter((d) => d.data.isBloqued).length
  const comErro = docs.filter((d) => d.data.countErr > 0).length
  return `${docs.length} lojas | ${bloqueadas} bloqueadas | ${comErro} com countErr > 0`
}

async function backup () {
  const snap = await db.collection(COLL).get()
  const docs = snap.docs.map((d) => ({ id: d.id, data: encode(d.data()) }))
  fs.mkdirSync(backupDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = path.join(backupDir, `bling_tokens-${FIREBASE_PROJECT_ID}-${stamp}.json`)
  fs.writeFileSync(file, JSON.stringify({
    project: FIREBASE_PROJECT_ID,
    collection: COLL,
    createdAt: new Date().toISOString(),
    docs
  }, null, 2), { mode: 0o600 })
  console.log(`Backup gravado: ${file}`)
  console.log(`  ${resumo(docs)}`)
  console.log('\nO arquivo contém refresh_token de todas as lojas — mantenha fora do repositório.')
}

async function restore () {
  const payload = JSON.parse(fs.readFileSync(restoreFile, 'utf8'))
  if (payload.project !== FIREBASE_PROJECT_ID) {
    throw new Error(`Backup é do projeto "${payload.project}", mas FIREBASE_PROJECT_ID é "${FIREBASE_PROJECT_ID}". Restauração abortada.`)
  }
  let docs = payload.docs
  if (onlyStore) {
    docs = docs.filter((d) => d.id === String(onlyStore))
    if (!docs.length) throw new Error(`Loja ${onlyStore} não está no backup.`)
  }
  console.log(`Backup de ${payload.createdAt} — ${resumo(payload.docs)}`)
  console.log(`Restaurando ${docs.length} documento(s) em ${FIREBASE_PROJECT_ID}/${COLL}\n`)

  const mudancas = []
  for (const doc of docs) {
    const atual = await db.collection(COLL).doc(doc.id).get()
    const antes = atual.exists ? atual.data() : null
    const depois = decode(doc.data)
    const difs = []
    if (!antes) difs.push('documento não existe mais')
    else {
      for (const campo of ['access_token', 'refresh_token', 'isBloqued', 'countErr']) {
        const a = antes[campo]
        const b = depois[campo]
        if (JSON.stringify(a) !== JSON.stringify(b)) {
          const fmt = (v) => (campo.endsWith('token') ? (v ? `***${String(v).slice(-6)}` : String(v)) : String(v))
          difs.push(`${campo}: ${fmt(a)} -> ${fmt(b)}`)
        }
      }
    }
    if (difs.length) mudancas.push({ id: doc.id, difs })
  }

  if (!mudancas.length) {
    console.log('Nada a restaurar: o estado atual já é igual ao do backup.')
    return
  }
  mudancas.forEach(({ id, difs }) => console.log(`  ${id}: ${difs.join(' | ')}`))
  console.log(`\n${mudancas.length} documento(s) seriam alterados.`)

  if (!isApply) {
    console.log('\nSimulação apenas. Para gravar de fato, repita o comando com --apply')
    return
  }
  // Sobrescreve o documento inteiro: restauração parcial deixaria o doc num
  // estado misto entre o backup e o que o app gravou depois.
  let batch = db.batch()
  let n = 0
  for (const doc of docs) {
    batch.set(db.collection(COLL).doc(doc.id), decode(doc.data))
    if (++n % 400 === 0) { await batch.commit(); batch = db.batch() }
  }
  await batch.commit()
  console.log(`\nRestaurados ${docs.length} documento(s).`)
}

const run = restoreFile ? restore : backup
run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nFalhou:', err.message)
    process.exit(1)
  })
