// Prima di electron-builder, dentro `npm run pubblica` (26/11): la release
// v<versione> c'è già, in BOZZA, prima che electron-builder carichi i file.
//
// Perché: electron-builder carica installer e blockmap IN PARALLELO, e se la
// release non c'è ognuno dei due caricamenti la crea per conto suo («creating
// GitHub release … release doesn't exist», due volte nello stesso secondo).
// Risultato, a ogni pubblicazione (0.99.3, 0.118.3, 0.120.0, 0.121.0,
// 0.122.0): due release con lo stesso tag, una con i file e una bozza doppia
// con un pezzo dei file, da togliere a mano per id. Con la bozza già pronta i
// due caricamenti la trovano e non ne creano altre.
//
// Se la release c'è già (bozza o pubblica) non la tocca: i file li sistema
// comunque `carica-programma.mjs`.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { noteDi } from './note-novita.mjs'
import { cancellaSicura } from '../src/shared/cancella-sicura.ts'

const ferma = (m) => { console.error(`[prepara-release] ${m}`); process.exit(1) }
const versione = JSON.parse(readFileSync('package.json', 'utf8')).version
const tag = `v${versione}`

const vista = spawnSync('gh', ['release', 'view', tag, '--json', 'isDraft'], { encoding: 'utf8' })
if (vista.status === 0) {
  console.log(`[prepara-release] ${tag} c'è già: non la tocco`)
  process.exit(0)
}

const cartella = mkdtempSync(join(tmpdir(), 'prepara-release-'))
process.on('exit', () => { try { cancellaSicura(cartella, { dentro: [tmpdir()] }) } catch { /* resta in Temp */ } })
const note = join(cartella, 'note.md')
let righe = []
try { righe = noteDi(readFileSync(join('src', 'shared', 'novita.ts'), 'utf8'), versione) } catch { /* note vuote */ }
writeFileSync(note, righe.map((r) => `- ${r}`).join('\n') + '\n', 'utf8')
const c = spawnSync('gh', ['release', 'create', tag, '--draft', '--verify-tag', '--title', `SierraDeck ${versione}`, '--notes-file', note], { stdio: 'inherit' })
if (c.status !== 0) ferma(`creare la bozza ${tag} non è riuscito (gh è uscito con ${c.status}). Il tag è sul remoto?  git push origin ${tag}`)
console.log(`[prepara-release] bozza ${tag} pronta: electron-builder ci carica dentro`)
