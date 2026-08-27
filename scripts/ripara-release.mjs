/**
 * Rimette a posto una pubblicazione mutilata dalla race di electron-builder.
 *
 * Il difetto è suo e si ripete: caricando installer e blockmap in parallelo
 * tenta di **creare due volte** la stessa release. Il secondo tentativo fallisce
 * con 422 e porta giù l'intera pubblicazione, lasciando su GitHub una release
 * con il solo `.exe` — senza `latest.yml`, che è il file da cui i programmi già
 * installati scoprono che esiste una versione nuova. Il risultato è il peggiore
 * possibile: la release **sembra** pubblicata, e nessuno si aggiorna.
 *
 * Ricostruire a mano funziona (è stato fatto quattro volte) ma è un rito lungo
 * e sbagliabile, ed è esattamente il genere di cosa che va scritta una volta.
 *
 *   node scripts/ripara-release.mjs 0.12.13
 *
 * Non ricostruisce niente: usa l'installer che sta già in `dist`, e prima di
 * toccare qualcosa verifica che sia **lo stesso** che è finito su GitHub —
 * perché caricare un `latest.yml` che descrive un file diverso da quello
 * pubblicato è peggio del problema che risolve.
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const versione = process.argv[2]
if (versione === undefined || !/^\d+\.\d+\.\d+$/.test(versione)) {
  console.error('uso: node scripts/ripara-release.mjs <versione>   (per esempio 0.12.13)')
  process.exit(1)
}

const tag = `v${versione}`
const esePath = join('dist', `SierraDeck Setup ${versione}.exe`)
const blockmapPath = `${esePath}.blockmap`
const nomeRemoto = `SierraDeck-Setup-${versione}.exe`

if (!existsSync(esePath)) {
  console.error(`manca ${esePath}: ricostruisci con "npm run pacchetto" prima di riparare`)
  process.exit(1)
}

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' })

// 1. Cosa c'è davvero sulla release, e quanto pesa.
const allegati = JSON.parse(gh('release', 'view', tag, '--json', 'assets'))
  .assets.map((a) => ({ nome: a.name, byte: a.size }))
const remoto = allegati.find((a) => a.nome === nomeRemoto)

// 2. L'installer. La race lascia due mutilazioni diverse, a caso: a volte c'è
//    l'exe e mancano gli altri due, a volte c'è **solo** il blockmap. Nel primo
//    caso l'installer locale dev'essere lo stesso che è già lassù — scrivere un
//    `latest.yml` che descrive un file diverso da quello che la gente scarica è
//    peggio del problema. Nel secondo si carica quello che manca.
const bytes = readFileSync(esePath)
if (remoto !== undefined && bytes.length !== remoto.byte) {
  console.error(
    `l'installer locale (${bytes.length} byte) non è quello pubblicato (${remoto.byte}): ` +
      'non scrivo un latest.yml che descrive un file diverso da quello che la gente scaricherà'
  )
  process.exit(1)
}
const sha512 = createHash('sha512').update(bytes).digest('base64')

// 3. Il latest.yml, nella forma che electron-updater si aspetta.
const latest = [
  `version: ${versione}`,
  'files:',
  `  - url: ${nomeRemoto}`,
  `    sha512: ${sha512}`,
  `    size: ${bytes.length}`,
  `path: ${nomeRemoto}`,
  `sha512: ${sha512}`,
  `releaseDate: ${new Date().toISOString()}`,
  ''
].join('\n')
writeFileSync(join('dist', 'latest.yml'), latest)

// 4. Il blockmap va caricato con il nome a trattini, come l'installer.
const blockmapTrattini = join('dist', `${nomeRemoto}.blockmap`)
if (existsSync(blockmapPath)) copyFileSync(blockmapPath, blockmapTrattini)

const daCaricare = [join('dist', 'latest.yml')]
if (existsSync(blockmapTrattini)) daCaricare.push(blockmapTrattini)
if (remoto === undefined) {
  // L'installer non è mai arrivato: si carica col nome a trattini, che è quello
  // che `latest.yml` indica e che l'aggiornamento andrà a cercare.
  const eseTrattini = join('dist', nomeRemoto)
  copyFileSync(esePath, eseTrattini)
  daCaricare.push(eseTrattini)
}
gh('release', 'upload', tag, ...daCaricare, '--clobber')

// 5. Si controlla il risultato invece di fidarsi: mancare latest.yml è
//    silenzioso, ed è tutto il problema.
const dopo = JSON.parse(gh('release', 'view', tag, '--json', 'assets')).assets.map((a) => a.name)
const attesi = ['latest.yml', nomeRemoto, `${nomeRemoto}.blockmap`]
const mancanti = attesi.filter((n) => !dopo.includes(n))
if (mancanti.length > 0) {
  console.error(`ancora mancanti su ${tag}: ${mancanti.join(', ')}`)
  process.exit(1)
}
console.log(`${tag} a posto: ${dopo.join(', ')}`)
