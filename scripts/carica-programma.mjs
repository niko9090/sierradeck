// Dopo electron-builder, dentro `npm run pubblica` (0.119.2): i 3 file del
// programma (installer, blockmap, latest.yml) sulla release v<versione>, in
// ogni caso.
//
// Perché: electron-builder pubblica in BOZZA (electron-builder.yml,
// `releaseType: draft`). Se la release v<versione> era già stata creata e resa
// PUBBLICA (con `gh release create` senza --draft), electron-builder la trova
// «di tipo non compatibile» e salta il caricamento senza fermarsi: il
// 25/11 (0.119.0) la release Latest è rimasta ~20 minuti senza installer e
// senza latest.yml, e nessun PC vedeva l'aggiornamento.
//
// Cosa fa:
// 1. legge dist/latest.yml e trova in dist l'installer e il blockmap che
//    descrive (electron-builder in dist li scrive con gli SPAZI,
//    «SierraDeck Setup X.exe»; su GitHub e in latest.yml hanno i TRATTINI);
// 2. controlla che l'installer locale sia proprio quello di latest.yml
//    (dimensione e sha512): mai caricare un latest.yml che descrive un altro file;
// 3. confronta con gli allegati della release (dimensione e, se GitHub la dà,
//    l'impronta sha256) e carica con `gh release upload --clobber` solo quelli
//    mancanti o diversi, col nome a trattini: prima installer e blockmap,
//    latest.yml PER ULTIMO (un PC che guarda a metà non trova un latest.yml che
//    punta a un installer che non c'è ancora);
// 4. se la release non c'è proprio, la crea in bozza (`--verify-tag`).
//
// Non rende pubblica la release: lo fa `controlla-release.mjs --sistema`, alla
// fine, quando ci sono tutti e 7 i file.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { leggiYml, tagDelProgramma } from './controlla-release.mjs'
import { noteDi } from './note-novita.mjs'
import { cancellaSicura } from '../src/shared/cancella-sicura.ts'

/**
 * Il file in dist che corrisponde al nome remoto (a trattini): lo stesso nome,
 * oppure quello con gli spazi al posto dei trattini, come lo scrive electron-builder.
 */
export function nomeLocale(nomeRemoto, presenti) {
  if (presenti.includes(nomeRemoto)) return nomeRemoto
  const spazi = nomeRemoto.replace(/-/g, ' ')
  return presenti.includes(spazi) ? spazi : null
}

/**
 * Quali file caricare, nell'ordine dato (latest.yml va messo per ultimo da chi
 * chiama). Un file va caricato se sulla release manca, ha un'altra dimensione o
 * un'altra impronta sha256 (quando GitHub la dà).
 *
 * @param {{ nome: string, byte: number, sha256: string }[]} attesi
 * @param {{ name: string, size: number, digest?: string | null }[]} remoti
 */
export function daCaricare(attesi, remoti) {
  return attesi
    .filter((a) => {
      const r = remoti.find((x) => x.name === a.nome)
      if (r === undefined) return true
      if (r.size !== a.byte) return true
      if (typeof r.digest === 'string' && r.digest.startsWith('sha256:') && r.digest.slice(7) !== a.sha256) return true
      return false
    })
    .map((a) => a.nome)
}

function principale() {
  const gh = (a) => spawnSync('gh', a, { encoding: 'utf8' })
  const ferma = (m) => { console.error(`\n[carica-programma] ${m}\n`); process.exit(1) }
  const dist = 'dist'
  const versione = JSON.parse(readFileSync('package.json', 'utf8')).version
  const tag = `v${versione}`
  if (!tagDelProgramma(tag)) ferma(`«${tag}» non è un tag del programma (v<numero>.<numero>.<numero>)`)

  const fileYml = join(dist, 'latest.yml')
  if (!existsSync(fileYml)) ferma(`manca ${fileYml}: electron-builder non ha costruito l'installer (prima \`npm run pacchetto\`)`)
  const testoYml = readFileSync(fileYml, 'utf8')
  const yml = leggiYml(testoYml)
  if (yml.version !== versione) ferma(`${fileYml} è della ${yml.version}, non della ${versione}: dist è vecchia, ricostruisci`)
  const exe = yml.path
  const voce = yml.files.find((f) => f.url === exe)
  if (exe === undefined || voce === undefined) ferma(`${fileYml} non dice quale installer (path/url)`)

  const presenti = readdirSync(dist)
  const exeLocale = nomeLocale(exe, presenti)
  const mappaLocale = nomeLocale(`${exe}.blockmap`, presenti)
  if (exeLocale === null) ferma(`in ${dist} non c'è l'installer ${exe} (né «${exe.replace(/-/g, ' ')}»)`)
  if (mappaLocale === null) ferma(`in ${dist} non c'è ${exe}.blockmap`)

  const leggi = (f) => readFileSync(join(dist, f))
  const bytesExe = leggi(exeLocale)
  if (bytesExe.length !== voce.size) ferma(`l'installer in dist pesa ${bytesExe.length} byte, latest.yml dice ${voce.size}: non sono lo stesso file, ricostruisci`)
  if (createHash('sha512').update(bytesExe).digest('base64') !== voce.sha512) ferma('l\'impronta sha512 dell\'installer in dist non è quella di latest.yml: ricostruisci')

  const sha256 = (b) => createHash('sha256').update(b).digest('hex')
  const bytesMappa = leggi(mappaLocale)
  const bytesYml = Buffer.from(testoYml, 'utf8')
  const attesi = [
    { nome: exe, locale: exeLocale, byte: bytesExe.length, sha256: sha256(bytesExe) },
    { nome: `${exe}.blockmap`, locale: mappaLocale, byte: bytesMappa.length, sha256: sha256(bytesMappa) },
    { nome: 'latest.yml', locale: 'latest.yml', byte: bytesYml.length, sha256: sha256(bytesYml) }
  ]

  const cartella = mkdtempSync(join(tmpdir(), 'programma-'))
  // La cartella temporanea se ne va alla fine, anche quando lo script si ferma con un errore
  // (`ferma` esce con process.exit, che salta i finally: per questo all'uscita). Dalla guardia, solo dentro Temp.
  process.on('exit', () => { try { cancellaSicura(cartella, { dentro: [tmpdir()] }) } catch { /* resta in Temp */ } })

  let vista = gh(['release', 'view', tag, '--json', 'isDraft,assets'])
  if (vista.status !== 0) {
    // La release non c'è: electron-builder non l'ha creata. Si crea in bozza, col tag già sul remoto.
    const note = join(cartella, 'note.md')
    let righe = []
    try { righe = noteDi(readFileSync(join('src', 'shared', 'novita.ts'), 'utf8'), versione) } catch { /* note vuote */ }
    writeFileSync(note, righe.map((r) => `- ${r}`).join('\n') + '\n', 'utf8')
    const c = spawnSync('gh', ['release', 'create', tag, '--draft', '--verify-tag', '--title', `SierraDeck ${versione}`, '--notes-file', note], { stdio: 'inherit' })
    if (c.status !== 0) ferma(`la release ${tag} non c'è e crearla non è riuscito (gh release create è uscito con ${c.status}). Il tag ${tag} è sul remoto?  git push origin ${tag}`)
    vista = gh(['release', 'view', tag, '--json', 'isDraft,assets'])
    if (vista.status !== 0) ferma(`la release ${tag} non si legge neanche dopo averla creata: ${vista.stderr}`)
  }
  const release = JSON.parse(vista.stdout)
  const nomi = daCaricare(attesi, release.assets ?? [])
  if (nomi.length === 0) {
    console.log(`[carica-programma] ${tag}: installer, blockmap e latest.yml già a posto (${release.isDraft ? 'bozza' : 'pubblica'})`)
    return
  }
  console.log(`[carica-programma] ${tag} (${release.isDraft ? 'bozza' : 'pubblica'}): carico ${nomi.join(', ')}`)

  // Copie col nome a trattini, quello di latest.yml.
  const copia = (a) => { const p = join(cartella, a.nome); copyFileSync(join(dist, a.locale), p); return p }
  const primi = attesi.filter((a) => a.nome !== 'latest.yml' && nomi.includes(a.nome))
  if (primi.length > 0) {
    const u = spawnSync('gh', ['release', 'upload', tag, ...primi.map(copia), '--clobber'], { stdio: 'inherit' })
    if (u.status !== 0) ferma(`gh release upload (installer/blockmap) su ${tag} è uscito con ${u.status}. Riprova:  node scripts/carica-programma.mjs`)
  }
  if (nomi.includes('latest.yml')) {
    const u = spawnSync('gh', ['release', 'upload', tag, copia(attesi[2]), '--clobber'], { stdio: 'inherit' })
    if (u.status !== 0) ferma(`gh release upload (latest.yml) su ${tag} è uscito con ${u.status}. Riprova:  node scripts/carica-programma.mjs`)
  }

  const dopo = JSON.parse(gh(['release', 'view', tag, '--json', 'assets']).stdout || '{}')
  const ancora = daCaricare(attesi, dopo.assets ?? [])
  if (ancora.length > 0) ferma(`su ${tag} non sono ancora a posto: ${ancora.join(', ')}. Riprova:  node scripts/carica-programma.mjs`)
  console.log(`[carica-programma] ${tag}: ${attesi.map((a) => a.nome).join(', ')} caricati e controllati`)
}

// Lanciato da solo (i test importano solo le funzioni pure).
if (process.argv[1] !== undefined && process.argv[1].replace(/\\/g, '/').endsWith('scripts/carica-programma.mjs')) principale()
