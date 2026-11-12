// Pubblica SierraDeck Aiutante PER CONTO SUO (12/11).
//
//   npm run pubblica-aiutante
//   node scripts/pubblica-aiutante.mjs [--senza-build]
//
// L'Aiutante e il programma completo sono due programmi. L'Aiutante esce nella
// pubblicazione FISSA «aiutante» (tag `aiutante`), che NON è mai l'ultima: il
// programma completo si aggiorna leggendo solo l'ultima (`releases/latest`),
// quindi non la vede; l'Aiutante si aggiorna leggendo solo questa
// (`releases/download/aiutante/latest.yml`).
//
// Cosa fa, e dove si ferma con un errore:
// 1. la versione da src/aiutante/versione.json; se è già pubblicata si ferma
//    (va alzata la versione);
// 2. le novità di quella versione da src/aiutante/novita-aiutante.txt (obbligatorie);
// 3. costruisce l'installer (`pacchetto-aiutante.mjs`), salvo --senza-build;
// 4. crea «aiutante» in BOZZA la prima volta (`--latest=false --target main`);
// 5. carica PRIMA installer e blockmap, e latest.yml PER ULTIMO: un Aiutante
//    che guarda a metà caricamento non trova un latest.yml che punta a un
//    installer che non c'è ancora;
// 6. la rende pubblica, sempre con `--latest=false`;
// 7. controlla che l'ultima pubblicazione del repository sia ancora quella del
//    programma completo (tag che comincia con «v») e che i tre file ci siano.
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { noteDi } from './note-novita.mjs'
import { costruisci, nomeInstaller, versioneAiutante } from './pacchetto-aiutante.mjs'
import { cancellaSicura } from '../src/shared/cancella-sicura.ts'

export const TAG_AIUTANTE = 'aiutante'
const REPO = 'niko9090/sierradeck'
const args = new Set(process.argv.slice(2))
const gh = (a) => spawnSync('gh', a, { encoding: 'utf8' })
const ferma = (msg) => { console.error(`\n[pubblica-aiutante] ${msg}\n`); process.exit(1) }

const versione = versioneAiutante()
const nomeExe = nomeInstaller(versione)
const nomeMappa = `${nomeExe}.blockmap`

const fileNovita = join('src', 'aiutante', 'novita-aiutante.txt')
const note = existsSync(fileNovita) ? noteDi(readFileSync(fileNovita, 'utf8'), versione) : []
if (note.length === 0) ferma(`mancano le novità della ${versione} in ${fileNovita} (una voce «versione: '${versione}'» con le sue righe)`)

const vista = gh(['release', 'view', TAG_AIUTANTE, '--json', 'assets,isDraft'])
const esiste = vista.status === 0
if (esiste) {
  const nomi = (JSON.parse(vista.stdout).assets ?? []).map((x) => x.name)
  if (nomi.includes(nomeExe)) ferma(`l'Aiutante ${versione} è già pubblicato: alza la versione in src/aiutante/versione.json`)
}

if (!args.has('--senza-build')) costruisci()
const dist = 'dist-aiutante'
for (const f of [nomeExe, nomeMappa, 'latest.yml']) if (!existsSync(join(dist, f))) ferma(`manca ${join(dist, f)}: l'installer non è stato costruito`)
const yml = readFileSync(join(dist, 'latest.yml'), 'utf8')
if (!yml.includes(`version: ${versione}`) || !yml.includes(nomeExe)) ferma(`latest.yml non è della ${versione} (o non nomina ${nomeExe})`)

const cartella = mkdtempSync(join(tmpdir(), 'aiutante-'))
// La cartella temporanea se ne va alla fine, anche quando lo script si ferma con un errore
// (`ferma` esce con process.exit, che salta i finally: per questo all'uscita). Dalla guardia, solo dentro Temp.
process.on('exit', () => { try { cancellaSicura(cartella, { dentro: [tmpdir()] }) } catch { /* resta in Temp */ } })
const testo = join(cartella, 'note.md')
writeFileSync(testo, `## SierraDeck Aiutante ${versione}\n\n${note.map((r) => `- ${r}`).join('\n')}\n\nÈ il mini programma che lavora per gli altri PC («Aiuta la rete»): si aggiorna da solo. Non è una versione del programma completo.\n`)
const copia = (f) => { const p = join(cartella, f); copyFileSync(join(dist, f), p); return p }

if (!esiste) {
  const c = gh(['release', 'create', TAG_AIUTANTE, '--draft', '--latest=false', '--target', 'main', '--title', `SierraDeck Aiutante ${versione}`, '--notes-file', testo])
  if (c.status !== 0) ferma(`gh release create (bozza) è uscito con ${c.status}: ${c.stderr}`)
}
// Prima installer e blockmap…
const u1 = spawnSync('gh', ['release', 'upload', TAG_AIUTANTE, copia(nomeExe), copia(nomeMappa), '--clobber'], { stdio: 'inherit' })
if (u1.status !== 0) ferma(`gh release upload (installer) è uscito con ${u1.status}`)
// …e latest.yml per ultimo.
const u2 = spawnSync('gh', ['release', 'upload', TAG_AIUTANTE, copia('latest.yml'), '--clobber'], { stdio: 'inherit' })
if (u2.status !== 0) ferma(`gh release upload (latest.yml) è uscito con ${u2.status}`)
const e = gh(['release', 'edit', TAG_AIUTANTE, '--draft=false', '--latest=false', '--title', `SierraDeck Aiutante ${versione}`, '--notes-file', testo])
if (e.status !== 0) ferma(`gh release edit è uscito con ${e.status}: ${e.stderr}`)

// L'ultima pubblicazione deve restare quella del programma completo (v…): è da lì che si aggiorna.
const ultima = gh(['api', `repos/${REPO}/releases/latest`, '--jq', '.tag_name']).stdout.trim()
if (!ultima.startsWith('v')) ferma(`ATTENZIONE: l'ultima pubblicazione adesso è «${ultima}», non una del programma completo (v…). Va rimessa come «ultima» a mano, dalla pagina delle pubblicazioni di GitHub, la versione v… più recente`)

const controllo = gh(['release', 'view', TAG_AIUTANTE, '--json', 'isDraft,assets'])
const fatto = JSON.parse(controllo.stdout || '{}')
const caricati = (fatto.assets ?? []).map((x) => x.name)
if (fatto.isDraft !== false || ![nomeExe, nomeMappa, 'latest.yml'].every((n) => caricati.includes(n))) ferma(`«aiutante» non è a posto: bozza=${fatto.isDraft}, file=${caricati.join(', ')}`)
console.log(`pubblicato SierraDeck Aiutante ${versione} su «aiutante», senza toccare il programma completo (ultima resta ${ultima})`)
