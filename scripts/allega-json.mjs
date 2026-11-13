// Alla fine di `npm run pubblica` (0.103.2): `app-android.json` anche sulla
// pubblicazione nuova del programma del PC, senza ricostruire l'app.
//
// Perché: le app fino alla 3.0.2 cercano il file nell'ULTIMA pubblicazione del
// programma. L'app esce ormai per conto suo («App Android», `npm run
// pubblica-app`); qui si copia soltanto il suo file, così quelle app continuano
// a vedere gli aggiornamenti anche dopo una versione del PC.
//
// Il file si prende da «App Android»; se non c'è ancora, dall'ultima
// pubblicazione del programma (quella di prima).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cancellaSicura } from '../src/shared/cancella-sicura.ts'

const REPO = 'niko9090/sierradeck'
const programma = JSON.parse(readFileSync('package.json', 'utf8')).version
const tag = `v${programma}`
const gh = (a) => spawnSync('gh', a, { encoding: 'utf8' })
const ferma = (m) => { console.error(`ALLEGA APP-ANDROID.JSON FERMATO: ${m}`); process.exit(1) }

const cartella = mkdtempSync(join(tmpdir(), 'app-json-'))
// 12/11: la cartella temporanea se ne va alla fine, anche quando lo script si ferma con un errore
// (`ferma` esce con process.exit, che salta i finally: per questo all'uscita). Dalla guardia, solo dentro Temp.
process.on('exit', () => { try { cancellaSicura(cartella, { dentro: [tmpdir()] }) } catch { /* resta in Temp */ } })
const file = join(cartella, 'app-android.json')
const prendi = (da) => gh(['release', 'download', da, '-p', 'app-android.json', '-D', cartella, '--clobber']).status === 0 && existsSync(file)
let da = 'app-android'
if (!prendi(da)) {
  da = gh(['api', `repos/${REPO}/releases/latest`, '--jq', '.tag_name']).stdout.trim()
  if (da === tag || !/^v\d+\.\d+\.\d+$/.test(da) || !prendi(da)) ferma('non trovo app-android.json né su «App Android» né sull\'ultima pubblicazione')
}
const letto = JSON.parse(readFileSync(file, 'utf8'))
if (typeof letto.versione !== 'string' || typeof letto.apk !== 'string') ferma(`app-android.json di ${da} non si legge`)
const u = spawnSync('gh', ['release', 'upload', tag, file, '--clobber'], { stdio: 'inherit' })
if (u.status !== 0) ferma(`gh release upload su ${tag} è uscito con ${u.status}`)
console.log(`app-android.json (app ${letto.versione}, da ${da}) allegato a ${tag}`)

// 13/11: il titolo è sempre «SierraDeck X.Y.Z», come Aiutante e App Android
// (senza, la release prendeva il nome nudo del tag/versione: «0.105.2»).
const t = spawnSync('gh', ['release', 'edit', tag, '--title', `SierraDeck ${programma}`], { stdio: 'inherit' })
if (t.status !== 0) ferma(`gh release edit --title su ${tag} è uscito con ${t.status}`)
console.log(`titolo della release: SierraDeck ${programma}`)
