import { readFile, rename, stat, unlink, utimes, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { cifra, decifra } from './cifratura'
import { cancellaVoci, firmaRadici, percorsoSicuro, ripristina, type Radice } from './raccolta'
import type { Voce } from './pacchetto'
import type { Archivio } from './archivio'
import type { Progresso } from './motore'

/**
 * La sincronizzazione **incrementale**: manda solo ciò che è cambiato.
 *
 * Ogni file da sincronizzare (una trascrizione, un file d'assetto) diventa un
 * file cifrato a sé nell'archivio, con un nome stabile derivato dal suo percorso.
 * Un **manifesto** cifrato tiene l'elenco: percorso → nome del file + firma
 * (dimensione, data). Al salvataggio si confronta la firma attuale con quella
 * dell'ultimo manifesto e si **caricano solo i file nuovi o modificati**, si
 * cancellano quelli spariti, si riscrive il manifesto. Per un utente con
 * migliaia di chat e un paio di GB, un salvataggio passa da minuti a secondi.
 *
 * Niente conflitto a versione unica (non c'è più un blocco solo): l'ultimo che
 * scrive vince, che per l'uso «i miei PC, uno alla volta» è quello che serve. La
 * cifratura resta end-to-end: il nome dei file è un hash del percorso, e il
 * contenuto — manifesto compreso — non si legge senza la chiave.
 */

const NOME_MANIFESTO = 'sierradeck.manifesto'

export type VoceManifesto = { nome: string; size: number; mtime: number }
export type Manifesto = {
  versione: 1
  creatoIl: string
  file: Record<string, VoceManifesto>
}

export function manifestoVuoto(): Manifesto {
  return { versione: 1, creatoIl: '', file: {} }
}

/** Il nome stabile di un file nell'archivio: un hash del suo percorso logico. */
/** Il pezzo prima della prima barra: la radice a cui il file appartiene. */
export function prefissoDi(percorso: string): string {
  const barra = percorso.indexOf('/')
  return barra === -1 ? percorso : percorso.slice(0, barra)
}

function nomeDi(percorso: string): string {
  return `f_${createHash('sha256').update(percorso).digest('hex')}`
}

/** Quanti file lavorare in parallelo: molte piccole chiamate al Drive si fanno
 * a gruppi, o il primo salvataggio (migliaia di file, uno per volta) durerebbe
 * minuti inutili. Sei è un buon compromesso senza infastidire i limiti di Drive. */
const PARALLELI = 6

/** Esegue `fn` su ogni elemento con al massimo `limite` in corso insieme. */
async function conLimite<T>(items: T[], limite: number, fn: (x: T) => Promise<void>): Promise<void> {
  let prossimo = 0
  const lavoratore = async (): Promise<void> => {
    while (prossimo < items.length) {
      const i = prossimo
      prossimo += 1
      await fn(items[i] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, () => lavoratore()))
}

async function scriviManifesto(archivio: Archivio, maestra: Buffer, manifesto: Manifesto): Promise<void> {
  const blob = await cifra(maestra, Buffer.from(JSON.stringify(manifesto), 'utf8'))
  await archivio.carica(NOME_MANIFESTO, blob)
}

type EsitoManifesto =
  | { stato: 'assente' }
  | { stato: 'illeggibile' }
  | { stato: 'ok'; manifesto: Manifesto }

async function leggiManifesto(archivio: Archivio, maestra: Buffer): Promise<EsitoManifesto> {
  const blob = await archivio.scarica(NOME_MANIFESTO)
  if (blob === undefined) return { stato: 'assente' }
  const chiaro = await decifra(maestra, blob)
  if (chiaro === undefined) return { stato: 'illeggibile' }
  try {
    const m = JSON.parse(chiaro.toString('utf8')) as Manifesto
    if (m.versione !== 1 || typeof m.file !== 'object') return { stato: 'illeggibile' }
    return { stato: 'ok', manifesto: m }
  } catch {
    return { stato: 'illeggibile' }
  }
}

/**
 * Due firme uguali: stessa dimensione, stesso istante.
 *
 * Al millisecondo e mezzo: i manifesti scritti prima della 0.12.58 hanno i
 * decimali di `mtimeMs`, quelli nuovi no, e un file non deve sembrare
 * cambiato per un arrotondamento.
 */
export function stessaFirma(
  a: { size: number; mtime: number } | undefined,
  b: { size: number; mtime: number } | undefined
): boolean {
  if (a === undefined || b === undefined) return false
  return a.size === b.size && Math.abs(a.mtime - b.mtime) < 1.5
}

/**
 * Un conflitto: due PC hanno scritto lo stesso file, ognuno senza vedere
 * l'altro. Vince il piu' recente; l'altro, nei progetti, resta accanto come
 * copia — `copia` e' il suo percorso relativo nel manifesto.
 */
export type Conflitto = { percorso: string; vinto: 'mio' | 'drive'; copia?: string }

/** `src/main.ts` + «torre» + 2026-09-04T21:30:00 → `src/main.conflitto-torre-20260904-213000.ts`. */
export function nomeCopiaConflitto(percorso: string, chi: string, quando: string): string {
  const barra = percorso.lastIndexOf('/')
  const dir = barra === -1 ? '' : percorso.slice(0, barra + 1)
  const nome = percorso.slice(barra + 1)
  const punto = nome.lastIndexOf('.')
  const base = punto > 0 ? nome.slice(0, punto) : nome
  const est = punto > 0 ? nome.slice(punto) : ''
  const stampo = quando.replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
  const pulito = chi.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'altro-pc'
  return `${dir}${base}.conflitto-${pulito}-${stampo}${est}`
}

const PROGETTI = (prefisso: string): boolean => prefisso.startsWith('progetto-')

function discoDi(radici: Map<string, Radice>, percorso: string): string | undefined {
  const r = radici.get(prefissoDi(percorso))
  if (r === undefined) return undefined
  return percorsoSicuro(r.cartella, percorso.slice(prefissoDi(percorso).length + 1))
}

async function firmaSuDisco(disco: string): Promise<{ size: number; mtime: number } | undefined> {
  try {
    const s = await stat(disco)
    return { size: s.size, mtime: Math.round(s.mtimeMs) }
  } catch {
    return undefined
  }
}

async function scriviSuDisco(disco: string, contenuto: Buffer, mtime: number): Promise<void> {
  await mkdir(dirname(disco), { recursive: true })
  await writeFile(disco, contenuto)
  try { await utimes(disco, mtime / 1000, mtime / 1000) } catch { /* si rimandera' una volta */ }
}

/**
 * Salva sul Drive cio' che e' cambiato su questo PC.
 *
 * Si parte dal manifesto **del Drive**, non da quello che questo PC ricorda:
 * fra l'uno e l'altro un altro PC puo' aver salvato, e un manifesto riscritto
 * dalla propria memoria cancellerebbe il suo lavoro dall'elenco — senza che
 * nessuno se ne accorga, finche' un ripristino non lo trova sparito.
 *
 * Sopra il manifesto del Drive si applicano i cambi di qui: i file cambiati
 * salgono, quelli tolti si tolgono. Dove un file e' cambiato **da tutte e due
 * le parti** e' un conflitto, e vale la regola: vince il piu' recente; nei
 * progetti l'altro resta accanto come copia, cosi' non si perde niente.
 */
export async function salvaIncrementale(deps: {
  radici: Radice[]
  maestra: Buffer
  archivio: Archivio
  /** L'ultimo manifesto che questo PC conosce (la sua idea di cosa c'e' sul Drive). */
  manifestoPrec: Manifesto
  adesso: string
  /** Come si chiama questo PC, per il nome delle copie in conflitto. */
  pcNome?: string
  /** Per quali prefissi un conflitto lascia una copia accanto (i progetti). */
  copieDiConflitto?: (prefisso: string) => boolean
  onProgresso?: (p: Progresso) => void
}): Promise<{ manifesto: Manifesto; caricati: number; cancellati: number; conflitti: Conflitto[] }> {
  const copie = deps.copieDiConflitto ?? PROGETTI
  const pcNome = deps.pcNome ?? 'questo-pc'
  const firma = await firmaRadici(deps.radici)
  const prec = deps.manifestoPrec
  const perPrefisso = new Map(deps.radici.map((r) => [r.prefisso, r]))
  const prefissiNostri = new Set(perPrefisso.keys())

  const cambiati: string[] = []
  for (const [percorso, f] of firma) {
    if (!stessaFirma(prec.file[percorso], f)) cambiati.push(percorso)
  }
  // Niente cambi locali? Non si tocca niente: salvataggio a costo zero.
  const forseCancellati = Object.keys(prec.file).filter((p) => !firma.has(p) && prefissiNostri.has(prefissoDi(p)))
  if (cambiati.length === 0 && forseCancellati.length === 0) {
    return { manifesto: prec, caricati: 0, cancellati: 0, conflitti: [] }
  }

  const sulDrive = await leggiManifesto(deps.archivio, deps.maestra)
  if (sulDrive.stato === 'illeggibile') {
    throw new Error('Il manifesto sul Drive non si apre con questa chiave: non salvo sopra.')
  }
  const base = sulDrive.stato === 'ok' ? sulDrive.manifesto : manifestoVuoto()
  const nuovo: Manifesto = { versione: 1, creatoIl: deps.adesso, file: { ...base.file } }
  const conflitti: Conflitto[] = []

  // Si cancella dal Drive solo cio' che **questa** macchina ha smesso di avere,
  // sotto un prefisso che qui esiste — e che nessun altro ha toccato nel
  // frattempo: una modifica altrui vince su una cancellazione di qui.
  const cancellati = forseCancellati.filter((p) => stessaFirma(base.file[p], prec.file[p]))

  let fatto = 0
  const avanza = (): void => {
    fatto += 1
    deps.onProgresso?.({ fase: 'carico', fatto, totale: cambiati.length, unita: 'file' })
  }
  const carica = async (percorso: string, contenuto: Buffer, f: { size: number; mtime: number }): Promise<void> => {
    const nome = nomeDi(percorso)
    await deps.archivio.carica(nome, await cifra(deps.maestra, contenuto))
    // Mutazione fra due `await`: JS e' a thread singolo, non c'e' corsa vera.
    nuovo.file[percorso] = { nome, size: f.size, mtime: f.mtime }
  }
  const scaricaChiaro = async (voce: VoceManifesto): Promise<Buffer | undefined> => {
    const blob = await deps.archivio.scarica(voce.nome)
    return blob === undefined ? undefined : decifra(deps.maestra, blob)
  }

  await conLimite(cambiati, PARALLELI, async (percorso) => {
    const f = firma.get(percorso)
    if (f === undefined) { avanza(); return }
    const contenuto = await readFile(f.disco).catch(() => undefined)
    if (contenuto === undefined) { avanza(); return }
    const voceDrive = base.file[percorso]
    const altriHannoCambiato = voceDrive !== undefined && !stessaFirma(voceDrive, prec.file[percorso])
    if (!altriHannoCambiato) {
      await carica(percorso, contenuto, f)
      avanza()
      return
    }
    // Conflitto: cambiato qui e cambiato la'. Vince il piu' recente.
    const mioVince = f.mtime >= voceDrive.mtime
    const conCopia = copie(prefissoDi(percorso))
    if (mioVince) {
      // La versione del Drive si scarica **prima** di caricare la mia: sul
      // Drive un file sta sotto un nome che deriva dal percorso, e caricare la
      // mia sopra cancellerebbe la sua prima di averla messa da parte.
      const loro = conCopia ? await scaricaChiaro(voceDrive) : undefined
      await carica(percorso, contenuto, f)
      if (conCopia) {
        const copia = nomeCopiaConflitto(percorso, 'drive', deps.adesso)
        const disco = discoDi(perPrefisso, copia)
        if (loro !== undefined && disco !== undefined) {
          await scriviSuDisco(disco, loro, voceDrive.mtime)
          await carica(copia, loro, { size: loro.length, mtime: voceDrive.mtime })
          conflitti.push({ percorso, vinto: 'mio', copia })
        } else {
          conflitti.push({ percorso, vinto: 'mio' })
        }
      } else {
        conflitti.push({ percorso, vinto: 'mio' })
      }
    } else {
      // Vince il Drive: il mio resta accanto come copia (nei progetti), e il
      // file prende la versione del Drive.
      if (conCopia) {
        const copia = nomeCopiaConflitto(percorso, pcNome, deps.adesso)
        const discoCopia = discoDi(perPrefisso, copia)
        if (discoCopia !== undefined) {
          await rename(f.disco, discoCopia).catch(async () => { await scriviSuDisco(discoCopia, contenuto, f.mtime) })
          await carica(copia, contenuto, f)
        }
        const loro = await scaricaChiaro(voceDrive)
        if (loro !== undefined) await scriviSuDisco(f.disco, loro, voceDrive.mtime)
        conflitti.push({ percorso, vinto: 'drive', ...(discoCopia !== undefined ? { copia } : {}) })
      } else {
        conflitti.push({ percorso, vinto: 'drive' })
      }
    }
    avanza()
  })

  await conLimite(cancellati, PARALLELI, async (percorso) => {
    const voce = base.file[percorso]
    if (voce !== undefined) await deps.archivio.cancella(voce.nome)
    delete nuovo.file[percorso]
  })

  // Quello che un altro PC ha tolto dal Drive, e qui e' rimasto com'era: nei
  // progetti si toglie anche qui, o al prossimo giro risalirebbe come nuovo.
  for (const p of Object.keys(prec.file)) {
    if (base.file[p] !== undefined || !copie(prefissoDi(p))) continue
    const f = firma.get(p)
    if (f === undefined || !stessaFirma(prec.file[p], f)) continue
    await unlink(f.disco).catch(() => undefined)
    delete nuovo.file[p]
  }

  await scriviManifesto(deps.archivio, deps.maestra, nuovo)
  return { manifesto: nuovo, caricati: cambiati.length, cancellati: cancellati.length, conflitti }
}

/**
 * Toglie dal Drive tutto cio' che sta sotto un prefisso: i file e le loro
 * voci nel manifesto. Serve a «Togli» di un progetto: prima toglieva solo
 * la riga dal registro, e i file restavano lassu' per sempre, che nessun PC
 * li considerava piu' suoi.
 *
 * Si parte dal manifesto del Drive, come al salvataggio: un altro PC puo'
 * aver salvato nel frattempo. Quanti file ha tolto.
 */
export async function togliPrefisso(deps: {
  maestra: Buffer
  archivio: Archivio
  prefisso: string
  adesso: string
}): Promise<{ tolti: number; manifesto?: Manifesto }> {
  const esito = await leggiManifesto(deps.archivio, deps.maestra)
  if (esito.stato === 'assente') return { tolti: 0 }
  if (esito.stato === 'illeggibile') throw new Error('Il manifesto sul Drive non si apre con questa chiave: non tocco niente.')
  const manifesto = esito.manifesto
  const daTogliere = Object.keys(manifesto.file).filter((p) => prefissoDi(p) === deps.prefisso)
  if (daTogliere.length === 0) return { tolti: 0, manifesto }
  const nuovo: Manifesto = { versione: 1, creatoIl: deps.adesso, file: { ...manifesto.file } }
  await conLimite(daTogliere, PARALLELI, async (percorso) => {
    const voce = manifesto.file[percorso]
    if (voce !== undefined) await deps.archivio.cancella(voce.nome).catch(() => undefined)
    delete nuovo.file[percorso]
  })
  await scriviManifesto(deps.archivio, deps.maestra, nuovo)
  return { tolti: daTogliere.length, manifesto: nuovo }
}

export async function ripristinaIncrementale(deps: {
  radici: Radice[]
  maestra: Buffer
  archivio: Archivio
  onProgresso?: (p: Progresso) => void
  /**
   * Quali prefissi del manifesto ripristinare adesso. Il ripristino va in due
   * tempi: prima l'assetto (che contiene il registro dei progetti), poi i
   * progetti, che senza registro non saprebbero dove andare.
   */
  soloPrefissi?: (prefisso: string) => boolean
  /**
   * Cio' che questo PC sapeva del Drive. Un file uguale nel manifesto di
   * allora e in quello di adesso, e uguale sul disco, non si riscarica: e'
   * quello che rende leggero un ripristino ripetuto — e il passaggio di
   * testimone, che ripristina un progetto ogni volta che cambia mano.
   *
   * E un file cambiato **qui** dopo l'ultimo salvataggio non si sovrascrive:
   * se il Drive non e' cambiato si tiene il mio; se e' cambiato anche la' e'
   * un conflitto, e vince il piu' recente (l'altro resta come copia nei
   * progetti).
   */
  manifestoPrec?: Manifesto
  /** Togliere dal disco i file che il Drive non ha piu' (rispetto a `manifestoPrec`). */
  elimina?: boolean
  pcNome?: string
  copieDiConflitto?: (prefisso: string) => boolean
  adesso?: string
}): Promise<{
  trovato: boolean; scritti: number; saltati: string[]; manifesto?: Manifesto; illeggibile?: boolean
  invariati: number; eliminati: number; conflitti: Conflitto[]; tenuti: number
}> {
  const vuoto = { scritti: 0, saltati: [], invariati: 0, eliminati: 0, conflitti: [], tenuti: 0 }
  const esito = await leggiManifesto(deps.archivio, deps.maestra)
  if (esito.stato === 'assente') return { trovato: false, ...vuoto }
  if (esito.stato === 'illeggibile') return { trovato: false, illeggibile: true, ...vuoto }
  const manifesto = esito.manifesto
  const copie = deps.copieDiConflitto ?? PROGETTI
  const pcNome = deps.pcNome ?? 'questo-pc'
  const adesso = deps.adesso ?? new Date().toISOString()
  const scelto = (p: string): boolean => deps.soloPrefissi === undefined || deps.soloPrefissi(prefissoDi(p))
  const perPrefisso = new Map(deps.radici.map((r) => [r.prefisso, r]))
  const prec = deps.manifestoPrec

  let invariati = 0
  let tenuti = 0
  const conflitti: Conflitto[] = []
  const candidati = Object.keys(manifesto.file).filter(scelto)
  const daScaricare: string[] = []
  for (const p of candidati) {
    const voce = manifesto.file[p] as VoceManifesto
    const disco = discoDi(perPrefisso, p)
    const locale = disco === undefined ? undefined : await firmaSuDisco(disco)
    const sapevo = prec?.file[p]
    if (locale !== undefined && sapevo !== undefined) {
      const driveUguale = stessaFirma(voce, sapevo)
      const localeUguale = stessaFirma(locale, sapevo)
      if (driveUguale && localeUguale) { invariati += 1; continue }
      if (driveUguale && !localeUguale) { tenuti += 1; continue }
    }
    daScaricare.push(p)
  }

  const voci: Voce[] = []
  let fatto = 0
  await conLimite(daScaricare, PARALLELI, async (percorso) => {
    const voce = manifesto.file[percorso]
    if (voce === undefined) return
    const blob = await deps.archivio.scarica(voce.nome)
    fatto += 1
    deps.onProgresso?.({ fase: 'scarico', fatto, totale: daScaricare.length, unita: 'file' })
    if (blob === undefined) return
    const chiaro = await decifra(deps.maestra, blob)
    if (chiaro === undefined) return

    const disco = discoDi(perPrefisso, percorso)
    const locale = disco === undefined ? undefined : await firmaSuDisco(disco)
    const sapevo = prec?.file[percorso]
    if (disco !== undefined && locale !== undefined) {
      const cambiatoQui = sapevo === undefined
        ? !(await readFile(disco).catch(() => undefined))?.equals(chiaro)
        : !stessaFirma(locale, sapevo)
      if (cambiatoQui) {
        // Conflitto: cambiato qui e cambiato la'. Vince il piu' recente.
        const mioVince = locale.mtime >= voce.mtime
        const conCopia = copie(prefissoDi(percorso))
        if (mioVince) {
          if (conCopia) {
            const copia = nomeCopiaConflitto(percorso, 'drive', adesso)
            voci.push({ percorso: copia, contenuto: chiaro, mtime: voce.mtime })
            conflitti.push({ percorso, vinto: 'mio', copia })
          } else {
            conflitti.push({ percorso, vinto: 'mio' })
          }
          return
        }
        if (conCopia) {
          const copia = nomeCopiaConflitto(percorso, pcNome, adesso)
          const discoCopia = discoDi(perPrefisso, copia)
          if (discoCopia !== undefined) {
            await rename(disco, discoCopia).catch(() => undefined)
            conflitti.push({ percorso, vinto: 'drive', copia })
          } else {
            conflitti.push({ percorso, vinto: 'drive' })
          }
        } else {
          conflitti.push({ percorso, vinto: 'drive' })
        }
      }
    }
    voci.push({ percorso, contenuto: chiaro, mtime: voce.mtime })
  })

  const { scritti, saltati } = await ripristina(
    voci, deps.radici,
    (f, t) => deps.onProgresso?.({ fase: 'ripristino', fatto: f, totale: t })
  )
  let eliminati = 0
  if (deps.elimina === true && prec !== undefined) {
    const spariti: string[] = []
    for (const p of Object.keys(prec.file)) {
      if (manifesto.file[p] !== undefined || !scelto(p) || !perPrefisso.has(prefissoDi(p))) continue
      // Un file cambiato qui dopo l'ultimo salvataggio non si butta: l'altro
      // PC l'ha tolto, ma questo ci ha lavorato sopra. Vince chi ha scritto.
      const disco = discoDi(perPrefisso, p)
      const locale = disco === undefined ? undefined : await firmaSuDisco(disco)
      if (locale !== undefined && !stessaFirma(locale, prec.file[p])) { tenuti += 1; continue }
      spariti.push(p)
    }
    eliminati = await cancellaVoci(spariti, deps.radici)
  }
  return { trovato: true, scritti, saltati, manifesto, invariati, eliminati, conflitti, tenuti }
}
