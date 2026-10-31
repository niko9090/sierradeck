// Il pacchetto non esce se gli manca un modulo (0.88.7).
//
// La 0.88.6 è stata costruita da uno specialista nella sua copia di lavoro
// (.claude/worktrees/agent-…), dove `node_modules` è un collegamento alla
// cartella vera: electron-builder ci ha messo solo i 10 moduli diretti e non i
// 38 che servono a loro. L'app installata non partiva («Cannot find module
// 'dijkstrajs'») e, ferma all'avvio, non poteva nemmeno aggiornarsi da sola.
//
//   --prima  rifiuta di costruire se `node_modules` è un collegamento;
//   --dopo   ogni modulo di produzione del package-lock deve stare nell'app.asar.
import { lstatSync, readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const radice = process.cwd()
const ferma = (msg) => { console.error(`\n[controlla-pacchetto] ${msg}\n`); process.exit(1) }

export function moduliDiProduzione(lock) {
  return Object.entries(lock.packages ?? {})
    .filter(([k, v]) => k.startsWith('node_modules/') && v.dev !== true && v.devOptional !== true && v.optional !== true)
    .map(([k]) => k)
}

// electron-builder porta in cima anche i moduli annidati (qrcode/node_modules/yargs
// finisce in node_modules/yargs): si cerca il nome, a qualunque profondità.
const nomeModulo = (percorso) => percorso.slice(percorso.lastIndexOf('node_modules/') + 'node_modules/'.length)

export function mancanti(lock, vociAsar) {
  const ci = new Set(vociAsar.map((x) => x.replace(/\\/g, '/')).filter((x) => x.includes('node_modules/')).map(nomeModulo))
  return moduliDiProduzione(lock).filter((m) => !ci.has(nomeModulo(m)))
}

function prima() {
  const nm = join(radice, 'node_modules')
  if (!existsSync(nm)) ferma('manca node_modules: prima `npm ci`.')
  if (lstatSync(nm).isSymbolicLink()) {
    ferma('node_modules qui è un collegamento (una copia di lavoro di un agente?): il pacchetto uscirebbe senza le dipendenze indirette. Costruisci dalla cartella principale del progetto.')
  }
}

function dopo() {
  const asar = process.argv[3] ?? join(radice, 'dist', 'win-unpacked', 'resources', 'app.asar')
  if (!existsSync(asar)) ferma(`non trovo ${asar}`)
  const { listPackage } = createRequire(import.meta.url)('@electron/asar')
  const lock = JSON.parse(readFileSync(join(radice, 'package-lock.json'), 'utf8'))
  const via = mancanti(lock, listPackage(asar))
  if (via.length > 0) ferma(`nel pacchetto mancano ${via.length} moduli: ${via.join(', ')}. Non pubblicarlo.`)
  console.log(`[controlla-pacchetto] app.asar completo: ${moduliDiProduzione(lock).length} moduli di produzione presenti`)
}

const modo = process.argv[2]
if (modo === '--prima') prima()
else if (modo === '--dopo') dopo()
