// L'ultimo passo di `npm run pubblica` (0.119.2): la release si controlla da sola.
//
// Il 25/11 (0.119.0) la release era Latest ma senza installer né latest.yml per
// ~20 minuti, e nessuno se n'era accorto: ogni passo aveva fatto «il suo» e
// nessuno guardava il risultato. Qui si guarda il risultato, su GitHub:
//
// - la release v<versione> non è in bozza ed è l'ultima (Latest);
// - ha i 7 file: latest.yml, SierraDeck-Setup-X.exe e .blockmap,
//   app-android.json, aiutante.yml, SierraDeck-Aiutante-Setup-Y.exe e .blockmap;
// - l'installer su GitHub pesa quanto dice latest.yml (e così l'Aiutante con
//   aiutante.yml), e latest.yml punta all'installer giusto;
// - latest.yml su GitHub è lo stesso file di dist/latest.yml (sha512).
//
// Se qualcosa non torna esce con 1 e scrive cosa manca e il comando per rimediare.
//
//   node scripts/controlla-release.mjs [versione] [--sistema] [--vecchia] [--dist <cartella>]
//
//   --sistema  se mancano solo «pubblica» e «Latest» (i file ci sono tutti e
//              sono giusti), la rende pubblica e Latest e ricontrolla. Solo per
//              i tag del programma v<n>.<n>.<n>: mai «App Android» né «aiutante».
//   --vecchia  per ricontrollare una release passata: non chiede che sia
//              l'ultima e non la confronta con dist (che è di un'altra versione).
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileRelease } from './allega-aiutante.mjs'
import { nomeInstaller, versioneAiutante, YML_AIUTANTE } from './pacchetto-aiutante.mjs'
import { cancellaSicura } from '../src/shared/cancella-sicura.ts'

const REPO = 'niko9090/sierradeck'

/** Solo i tag del programma completo: «v0.119.0» sì, «app-android» e «aiutante» no. */
export function tagDelProgramma(tag) {
  return typeof tag === 'string' && /^v\d+\.\d+\.\d+$/.test(tag)
}

/** latest.yml / aiutante.yml di electron-builder, quanto basta: version, path, sha512 e i files. */
export function leggiYml(testo) {
  const fuori = { version: undefined, path: undefined, sha512: undefined, files: [] }
  let voce = null
  const pulisci = (v) => v.trim().replace(/^'(.*)'$/, '$1').replace(/^"(.*)"$/, '$1')
  for (const riga of String(testo ?? '').split(/\r?\n/)) {
    let m = /^\s*-\s+url:\s*(.+)$/.exec(riga)
    if (m) { voce = { url: pulisci(m[1]), sha512: undefined, size: undefined }; fuori.files.push(voce); continue }
    m = /^\s+(sha512|size):\s*(.+)$/.exec(riga)
    if (m && voce !== null) { voce[m[1]] = m[1] === 'size' ? Number(pulisci(m[2])) : pulisci(m[2]); continue }
    m = /^(version|path|sha512):\s*(.+)$/.exec(riga)
    if (m) { fuori[m[1]] = pulisci(m[2]); voce = null }
  }
  return fuori
}

/** a è una versione dopo b (0.119.1 dopo 0.119.0; 0.120.0 dopo 0.119.9). */
export function piuNuova(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0)
  return false
}

const sha512 = (testo) => createHash('sha512').update(String(testo), 'utf8').digest('base64')

/**
 * Il confronto, puro: niente gh, niente disco. Torna l'elenco dei problemi
 * (vuoto = tutto a posto), ognuno con `tipo` ('bozza' | 'ultima' | 'file'),
 * `motivo` in italiano semplice e `rimedio` (il comando da dare).
 *
 * @param {object} d
 * @param {string} d.versione             la versione del programma (0.119.0)
 * @param {string} d.versioneAiutante     la versione dell'Aiutante allegato (1.4.0)
 * @param {{ isDraft: boolean, assets: { name: string, size: number }[] } | null} d.release
 * @param {string | null} d.ultima        il tag della release Latest del repository
 * @param {string | null} d.latestRemoto  il testo di latest.yml su GitHub
 * @param {string | null} d.aiutanteRemoto il testo di aiutante.yml su GitHub
 * @param {string | null} d.latestLocale  il testo di dist/latest.yml
 * @param {boolean} [d.controllaUltima]   false per una release passata
 * @param {boolean} [d.controllaLocale]   false per una release passata
 */
export function esaminaRelease(d) {
  const { versione, versioneAiutante: va, release, ultima, latestRemoto, aiutanteRemoto, latestLocale } = d
  const controllaUltima = d.controllaUltima !== false
  const controllaLocale = d.controllaLocale !== false
  const tag = `v${versione}`
  const problemi = []
  const file = (motivo, rimedio) => problemi.push({ tipo: 'file', motivo, rimedio })
  const programma = 'node scripts/carica-programma.mjs'
  const aiutante = 'node scripts/allega-aiutante.mjs --senza-build'

  if (release === null || release === undefined) {
    file(`la release ${tag} non c'è su GitHub`, `git push origin ${tag}  e poi  npm run pubblica`)
    return problemi
  }
  if (release.isDraft === true) problemi.push({ tipo: 'bozza', motivo: `la release ${tag} è ancora in BOZZA: nessun PC la vede`, rimedio: `gh release edit ${tag} --draft=false --latest` })
  if (controllaUltima && ultima !== tag && tagDelProgramma(ultima) && piuNuova(ultima.slice(1), versione)) {
    // L'ultima è già una versione dopo: questa è una release passata, non va rimessa Latest.
    problemi.push({ tipo: 'file', motivo: `${tag} è una release passata (l'ultima è ${ultima}): non va rimessa Latest`, rimedio: `node scripts/controlla-release.mjs ${versione} --vecchia` })
  } else if (controllaUltima && ultima !== tag) {
    problemi.push({ tipo: 'ultima', motivo: `l'ultima release (Latest) è «${ultima ?? 'nessuna'}», non ${tag}: i PC e l'Aiutante guardano solo l'ultima`, rimedio: `gh release edit ${tag} --draft=false --latest` })
  }

  const assets = release.assets ?? []
  const allegato = (n) => assets.find((a) => a.name === n)
  const exe = `SierraDeck-Setup-${versione}.exe`
  const exeAiutante = nomeInstaller(va)
  for (const n of fileRelease(versione, va)) {
    if (allegato(n) !== undefined) continue
    const rimedio = n === 'app-android.json' ? 'node scripts/allega-json.mjs' : n.startsWith('SierraDeck-Aiutante-') || n === YML_AIUTANTE ? aiutante : programma
    file(`manca il file ${n}`, rimedio)
  }

  // latest.yml su GitHub: della versione giusta, punta all'installer giusto, che pesa quanto dice.
  if (allegato('latest.yml') !== undefined) {
    if (latestRemoto === null || latestRemoto === undefined) file('latest.yml su GitHub non si scarica', programma)
    else {
      const y = leggiYml(latestRemoto)
      const voce = y.files.find((f) => f.url === exe)
      if (y.version !== versione) file(`latest.yml su GitHub è della ${y.version ?? '?'}, non della ${versione}`, programma)
      if (y.path !== exe || voce === undefined) file(`latest.yml su GitHub non punta a ${exe} (dice «${y.path ?? '?'}»): l'aggiornamento cercherebbe un file che non c'è`, programma)
      const suGitHub = allegato(exe)
      if (voce !== undefined && suGitHub !== undefined && suGitHub.size !== voce.size) {
        file(`${exe} su GitHub pesa ${suGitHub.size} byte, latest.yml dice ${voce.size}: l'aggiornamento verrebbe scartato`, programma)
      }
      if (controllaLocale) {
        if (latestLocale === null || latestLocale === undefined) file('manca dist/latest.yml per il confronto: è stata costruita da un\'altra cartella?', `node scripts/controlla-release.mjs ${versione} --dist <cartella dist della costruzione>`)
        else if (leggiYml(latestLocale).version !== versione) file(`dist/latest.yml è della ${leggiYml(latestLocale).version ?? '?'}, non della ${versione}: non si può confrontare (per una release passata usa --vecchia)`, `node scripts/controlla-release.mjs ${versione} --vecchia`)
        else if (sha512(latestLocale) !== sha512(latestRemoto)) file('latest.yml su GitHub non è quello di dist (sha512 diversa): descrive un altro installer', programma)
      }
    }
  }

  // aiutante.yml su GitHub: stessa cosa per l'Aiutante.
  if (allegato(YML_AIUTANTE) !== undefined) {
    if (aiutanteRemoto === null || aiutanteRemoto === undefined) file(`${YML_AIUTANTE} su GitHub non si scarica`, aiutante)
    else {
      const y = leggiYml(aiutanteRemoto)
      const voce = y.files.find((f) => f.url === exeAiutante)
      if (y.version !== va) file(`${YML_AIUTANTE} su GitHub è della ${y.version ?? '?'}, non della ${va}`, aiutante)
      if (y.path !== exeAiutante || voce === undefined) file(`${YML_AIUTANTE} su GitHub non punta a ${exeAiutante}`, aiutante)
      const suGitHub = allegato(exeAiutante)
      if (voce !== undefined && suGitHub !== undefined && suGitHub.size !== voce.size) {
        file(`${exeAiutante} su GitHub pesa ${suGitHub.size} byte, ${YML_AIUTANTE} dice ${voce.size}`, aiutante)
      }
    }
  }
  return problemi
}

/** Mancano solo «pubblica» e «Latest»: i file sono tutti giusti, si può rendere pubblica. */
export function soloDaRenderePubblica(problemi) {
  return problemi.length > 0 && problemi.every((p) => p.tipo === 'bozza' || p.tipo === 'ultima')
}

/** Il testo per chi legge: cosa non va e, sotto, i comandi (senza ripetizioni). */
export function rapporto(tag, problemi) {
  if (problemi.length === 0) return `[controlla-release] ${tag} a posto: pubblica, Latest, 7 file, installer e latest.yml che si corrispondono.`
  const rimedi = [...new Set(problemi.map((p) => p.rimedio))]
  return [
    `[controlla-release] ${tag} NON è a posto:`,
    ...problemi.map((p) => `  - ${p.motivo}`),
    'Per rimediare:',
    ...rimedi.map((r) => `  ${r}`),
    `Poi ricontrolla:  node scripts/controlla-release.mjs`
  ].join('\n')
}

function principale() {
  const argv = process.argv.slice(2)
  const opzioni = new Set(argv.filter((a) => a.startsWith('--')))
  const iDist = argv.indexOf('--dist')
  const dist = iDist >= 0 ? argv[iDist + 1] : 'dist'
  const libero = argv.filter((a, i) => !a.startsWith('--') && !(iDist >= 0 && i === iDist + 1))
  const delPacchetto = JSON.parse(readFileSync('package.json', 'utf8')).version
  const versione = libero[0] ?? delPacchetto
  const tag = `v${versione}`
  const vecchia = opzioni.has('--vecchia')
  const ferma = (m) => { console.error(`\n${m}\n`); process.exit(1) }
  if (!tagDelProgramma(tag)) ferma(`[controlla-release] «${tag}» non è un tag del programma (v<n>.<n>.<n>): «App Android» e «aiutante» non si controllano qui`)

  // Le letture da GitHub a volte falliscono a vuoto (rete, limiti): fino a 3 tentativi,
  // e se restano rosse si dice perché, invece di un «nessuna» muto.
  const gh = (a) => {
    let r
    for (let i = 0; i < 3; i++) {
      r = spawnSync('gh', a, { encoding: 'utf8' })
      if (r.status === 0) return r
    }
    console.warn(`[controlla-release] gh ${a.slice(0, 3).join(' ')} … è uscito con ${r.status}: ${(r.stderr ?? '').trim().slice(0, 300)}`)
    return r
  }
  const cartella = mkdtempSync(join(tmpdir(), 'controlla-release-'))
  // Dalla guardia, solo dentro Temp; anche quando si esce con process.exit.
  process.on('exit', () => { try { cancellaSicura(cartella, { dentro: [tmpdir()] }) } catch { /* resta in Temp */ } })

  const raccogli = () => {
    const vista = gh(['release', 'view', tag, '--json', 'isDraft,assets'])
    const release = vista.status === 0 ? JSON.parse(vista.stdout) : null
    const u = gh(['api', `repos/${REPO}/releases/latest`, '--jq', '.tag_name'])
    const ultima = u.status === 0 ? u.stdout.trim() : null
    const scarica = (nome) => {
      if (release === null || !(release.assets ?? []).some((a) => a.name === nome)) return null
      const r = gh(['release', 'download', tag, '-p', nome, '-D', cartella, '--clobber'])
      const p = join(cartella, nome)
      return r.status === 0 && existsSync(p) ? readFileSync(p, 'utf8') : null
    }
    const latestRemoto = scarica('latest.yml')
    const aiutanteRemoto = scarica(YML_AIUTANTE)
    // L'Aiutante atteso: quello di versione.json per la versione in costruzione; per una
    // release passata, quello che dice il suo aiutante.yml (o quello di adesso, se manca).
    let va = versioneAiutante()
    if (versione !== delPacchetto && aiutanteRemoto !== null) va = leggiYml(aiutanteRemoto).version ?? va
    const fileLocale = join(dist, 'latest.yml')
    const latestLocale = existsSync(fileLocale) ? readFileSync(fileLocale, 'utf8') : null
    return { versione, versioneAiutante: va, release, ultima, latestRemoto, aiutanteRemoto, latestLocale, controllaUltima: !vecchia, controllaLocale: !vecchia }
  }

  let problemi = esaminaRelease(raccogli())
  if (opzioni.has('--sistema') && !vecchia && soloDaRenderePubblica(problemi)) {
    console.log(`[controlla-release] i file di ${tag} ci sono tutti: la rendo pubblica e Latest`)
    const e = spawnSync('gh', ['release', 'edit', tag, '--draft=false', '--latest'], { stdio: 'inherit' })
    if (e.status !== 0) console.error(`[controlla-release] gh release edit è uscito con ${e.status}`)
    problemi = esaminaRelease(raccogli())
  }
  const testo = rapporto(tag, problemi)
  if (problemi.length > 0) ferma(testo)
  if (vecchia) console.log('[controlla-release] (release passata: non controllati «Latest» e il confronto con dist)')
  console.log(testo)
}

// Lanciato da solo (i test importano solo le funzioni pure).
if (process.argv[1] !== undefined && process.argv[1].replace(/\\/g, '/').endsWith('scripts/controlla-release.mjs')) principale()
