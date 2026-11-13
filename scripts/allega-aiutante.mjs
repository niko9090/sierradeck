// Alla fine di `npm run pubblica` (13/11): SierraDeck Aiutante allegato alla
// STESSA pubblicazione v<versione> del programma completo.
//
// Regola di Nicholas (13/11): «l'Aiutante deve SEMPRE essere allegato alla
// release del programma completo, non separato». Prima usciva da solo sulla
// pubblicazione fissa «aiutante» (`npm run pubblica-aiutante`, ritirato).
//
//   node scripts/allega-aiutante.mjs [--senza-build]
//
// L'Aiutante ha la sua versione (src/aiutante/versione.json): se non è
// cambiata, lo stesso installer si allega di nuovo alla release nuova, perché
// l'Aiutante si aggiorna dall'ULTIMA release (`releases/latest/download/`) e
// lì deve trovare sempre il suo file. Il file è `aiutante.yml` (il canale
// «aiutante»), mai `latest.yml`, che resta del programma completo: ognuno
// legge solo il suo.
//
// Cosa fa, e dove si ferma con un errore:
// 1. la release v<versione del programma> deve esistere già (la crea
//    `gh release create … --draft` e la riempie electron-builder);
// 2. costruisce l'installer dell'Aiutante (`pacchetto-aiutante.mjs`), salvo
//    --senza-build; poi controlla installer, blockmap e aiutante.yml, e che
//    aiutante.yml sia della versione di versione.json e nomini quell'installer;
// 3. carica PRIMA installer e blockmap, e aiutante.yml PER ULTIMO: un Aiutante
//    che guarda a metà caricamento non trova un aiutante.yml che punta a un
//    installer che non c'è ancora;
// 4. aggiunge alle note della release l'Aiutante allegato, con le sue novità
//    (src/aiutante/novita-aiutante.txt, obbligatorie per la sua versione);
// 5. controlla i file della release (i 4 del programma e i 3 dell'Aiutante).
//    Se la release è pubblica, l'ultima del repository deve essere lei (tag v…);
//    se è ancora in bozza (il giro normale: si rende pubblica a mano dopo),
//    lo ricorda con il comando da dare.
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { noteDi } from './note-novita.mjs'
import { costruisci, nomeInstaller, versioneAiutante, YML_AIUTANTE } from './pacchetto-aiutante.mjs'
import { cancellaSicura } from '../src/shared/cancella-sicura.ts'

const REPO = 'niko9090/sierradeck'
export const SEGNO_NOTE = '<!-- aiutante -->'

/** I file dell'Aiutante nell'ordine in cui si caricano: il .yml sempre per ultimo. */
export function fileAiutante(versione) {
  const exe = nomeInstaller(versione)
  return [exe, `${exe}.blockmap`, YML_AIUTANTE]
}

/** I file che la release del programma completo deve avere alla fine. */
export function fileRelease(versioneProgramma, versioneDellAiutante) {
  return [`SierraDeck-Setup-${versioneProgramma}.exe`, `SierraDeck-Setup-${versioneProgramma}.exe.blockmap`, 'latest.yml', 'app-android.json', ...fileAiutante(versioneDellAiutante)]
}

/** aiutante.yml va bene se è della versione giusta e punta all'installer giusto. Torna il motivo, o null. */
export function problemaYml(testo, versione) {
  const exe = nomeInstaller(versione)
  if (!new RegExp(`^version: ${versione.replace(/\./g, '\\.')}\\s*$`, 'm').test(testo)) return `${YML_AIUTANTE} non è della ${versione}`
  if (!new RegExp(`^path: ${exe.replace(/\./g, '\\.')}\\s*$`, 'm').test(testo)) return `${YML_AIUTANTE} non punta a ${exe} (path)`
  if (!testo.includes(`url: ${exe}`)) return `${YML_AIUTANTE} non punta a ${exe} (url)`
  return null
}

/** Le note della release con la sezione dell'Aiutante: aggiunta in fondo, o rifatta se c'era già. */
export function noteConAiutante(corpo, versione, novita = []) {
  const exe = nomeInstaller(versione)
  const righe = novita.length > 0 ? `\n${novita.map((r) => `- ${r}`).join('\n')}\n` : ''
  const sezione = `${SEGNO_NOTE}\n### SierraDeck Aiutante ${versione}\n\nAllegato anche \`${exe}\`: il mini programma che lavora per gli altri PC («Aiuta la rete»). Si installa a parte e si aggiorna da solo da questa pubblicazione.\n${righe}`
  const base = (corpo ?? '').split(SEGNO_NOTE)[0].trimEnd()
  return base === '' ? sezione : `${base}\n\n${sezione}`
}

function principale() {
  const args = new Set(process.argv.slice(2))
  const gh = (a) => spawnSync('gh', a, { encoding: 'utf8' })
  const ferma = (m) => { console.error(`\n[allega-aiutante] ${m}\n`); process.exit(1) }

  const programma = JSON.parse(readFileSync('package.json', 'utf8')).version
  const tag = `v${programma}`
  const versione = versioneAiutante()
  const [exe, mappa, yml] = fileAiutante(versione)
  const fileNovita = join('src', 'aiutante', 'novita-aiutante.txt')
  const novita = existsSync(fileNovita) ? noteDi(readFileSync(fileNovita, 'utf8'), versione) : []
  if (novita.length === 0) ferma(`mancano le novità dell'Aiutante ${versione} in ${fileNovita} (una voce con la sua versione in cima, e le sue righe)`)

  const vista = gh(['release', 'view', tag, '--json', 'isDraft,assets'])
  if (vista.status !== 0) ferma(`la release ${tag} non c'è: l'Aiutante si allega solo alla release del programma completo (prima \`gh release create ${tag} --draft\` e electron-builder)`)

  if (!args.has('--senza-build')) costruisci()
  const dist = 'dist-aiutante'
  for (const f of [exe, mappa, yml]) if (!existsSync(join(dist, f))) ferma(`manca ${join(dist, f)}: l'installer dell'Aiutante non è stato costruito`)
  const problema = problemaYml(readFileSync(join(dist, yml), 'utf8'), versione)
  if (problema !== null) ferma(problema)

  const cartella = mkdtempSync(join(tmpdir(), 'aiutante-'))
  // La cartella temporanea se ne va alla fine, anche quando lo script si ferma con un errore
  // (`ferma` esce con process.exit, che salta i finally: per questo all'uscita). Dalla guardia, solo dentro Temp.
  process.on('exit', () => { try { cancellaSicura(cartella, { dentro: [tmpdir()] }) } catch { /* resta in Temp */ } })
  const copia = (f) => { const p = join(cartella, f); copyFileSync(join(dist, f), p); return p }

  // Prima installer e blockmap…
  const u1 = spawnSync('gh', ['release', 'upload', tag, copia(exe), copia(mappa), '--clobber'], { stdio: 'inherit' })
  if (u1.status !== 0) ferma(`gh release upload (installer dell'Aiutante) su ${tag} è uscito con ${u1.status}`)
  // …e aiutante.yml per ultimo.
  const u2 = spawnSync('gh', ['release', 'upload', tag, copia(yml), '--clobber'], { stdio: 'inherit' })
  if (u2.status !== 0) ferma(`gh release upload (${yml}) su ${tag} è uscito con ${u2.status}`)

  // Le note: l'Aiutante allegato, con le sue novità.
  const corpo = gh(['release', 'view', tag, '--json', 'body', '--jq', '.body'])
  if (corpo.status === 0) {
    const testo = join(cartella, 'note.md')
    writeFileSync(testo, noteConAiutante(corpo.stdout, versione, novita), 'utf8')
    const e = gh(['release', 'edit', tag, '--notes-file', testo])
    if (e.status !== 0) console.warn(`[allega-aiutante] note non aggiornate (gh release edit è uscito con ${e.status}): ${e.stderr}`)
  } else console.warn('[allega-aiutante] note della release non lette: restano com\'erano')

  const controllo = gh(['release', 'view', tag, '--json', 'isDraft,assets'])
  const fatto = JSON.parse(controllo.stdout || '{}')
  const caricati = (fatto.assets ?? []).map((x) => x.name)
  const mancano = fileRelease(programma, versione).filter((n) => !caricati.includes(n))
  if (mancano.length > 0) ferma(`alla release ${tag} mancano: ${mancano.join(', ')}`)
  if (fatto.isDraft === true) {
    console.log(`SierraDeck Aiutante ${versione} allegato a ${tag} (installer, blockmap, ${yml}).`)
    console.log(`La release è ancora in BOZZA: rendila pubblica con  gh release edit ${tag} --draft=false --latest  e poi controlla che l'ultima sia ${tag}.`)
    return
  }
  const ultima = gh(['api', `repos/${REPO}/releases/latest`, '--jq', '.tag_name']).stdout.trim()
  if (!ultima.startsWith('v')) ferma(`ATTENZIONE: l'ultima pubblicazione è «${ultima}», non una del programma completo (v…): né il programma né l'Aiutante vedono gli aggiornamenti. Va rimessa come «ultima» ${tag}`)
  if (ultima !== tag) console.warn(`[allega-aiutante] l'ultima pubblicazione è ${ultima}, non ${tag}: finché non lo diventa l'Aiutante non vede la ${versione}`)
  console.log(`SierraDeck Aiutante ${versione} allegato a ${tag} (pubblica, ultima: ${ultima})`)
}

// Lanciato da solo (i test importano solo le funzioni pure).
if (process.argv[1] !== undefined && process.argv[1].replace(/\\/g, '/').endsWith('scripts/allega-aiutante.mjs')) principale()
