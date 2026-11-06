import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Autopilota } from '@shared/autopilota'
import { scriviAtomico, scriviJsonAtomico } from '@shared/scrittura-atomica'
import { CARTELLA_COPIE_RIPARAZIONE, nomeCorto, type VoceRiparazione } from '@shared/autoriparazione'
import type { ImpostazioniOrchestratore } from './orchestratore-store'
import type { EsitoAutopulizia } from './autopulizia'
import { viva } from './migra-orchestratore'

/**
 * **L'autoriparazione, dalla parte del servizio** (k-59): gli autopiloti e le
 * chat governate di questo PC. Riusa il passaggio all'autopilota unico
 * (`assicura`, cioè `passaAllUnico`) e l'autopulizia; aggiunge solo quello che
 * non c'era: le chat orfane.
 *
 * - **Una copia prima di ogni cambiamento**, per workspace, in
 *   `copie-autoriparazione/<id>/servizio` con un manifesto: «Torna come
 *   prima» (`annullaRiparazioneServizio`) rimette i file com'erano.
 * - **Una chat occupata non si tocca**: il suo workspace aspetta (`rimandato`)
 *   e si ripara a turno finito. Niente stop, niente riavvii.
 * - **«Solo mia»**: segnalate, mai toccate.
 * - **Idempotente**: dopo una riparazione non resta niente da riparare, e una
 *   seconda esecuzione non scrive niente e non fa copie.
 */

export type DipendenzeRiparazioneServizio = {
  /** La cartella dei dati (quella che contiene `autopiloti/` e `orchestratori/`). */
  dati: string
  archivio: { cartella: string; elenca: () => Autopilota[]; scrivi: (a: Autopilota) => void }
  orchestratori: {
    impostazioni: (ws: string) => ImpostazioniOrchestratore
    cambiaImpostazioni: (ws: string, f: (i: ImpostazioniOrchestratore) => ImpostazioniOrchestratore) => ImpostazioniOrchestratore
    dimentica?: (ws: string) => void
  }
  /** La cartella su disco di un workspace (`orchestratori/<ws>`). */
  cartellaWs: (ws: string) => string
  wsDi: (a: Pick<Autopilota, 'cwd' | 'workspace'>) => string
  /** Gli autopiloti di prima del workspace, non ancora passati al suo unico. */
  vecchiDel: (ws: string) => Autopilota[]
  unicoDi: (ws: string) => Autopilota | undefined
  unici: () => Autopilota[]
  assicura: (ws: string) => { ok: true; unico: Autopilota } | { ok: false; motivo: string }
  /** Salva un autopilota come fa il servizio (disco e memoria). */
  salva: (a: Autopilota) => void
  /** La chat ha un turno in corso adesso: non si tocca. */
  occupata: (a: Autopilota, chat: Autopilota['chats'][number]) => boolean
  cartellaEsiste: (cartella: string) => boolean
  /** Il ramo della chat: unito nel principale, non unito, tolto, o non si sa. */
  statoRamo?: (cwd: string, ramo: string) => 'unito' | 'non-unito' | 'mancante' | 'ignoto'
  autopulizia?: () => Promise<EsitoAutopulizia>
  adesso: () => string
  log: (riga: string) => void
}

export type EsitoRiparazioneServizio = { voci: VoceRiparazione[]; copiato: boolean }

type Manifesto = {
  id: string
  quando: string
  /** Gli autopiloti messi da parte: `c'era` falso = nato con la riparazione. */
  autopiloti: Array<{ id: string; cEra: boolean }>
  workspace: Array<{ ws: string; cartella: string; file: string[]; orchestratore: boolean }>
}

const radiceCopia = (dati: string, id: string): string => join(dati, CARTELLA_COPIE_RIPARAZIONE, id, 'servizio')

/** Un turno in corso: una chat occupata, o un autopilota «a chat sola» al lavoro. */
function lavora(d: DipendenzeRiparazioneServizio, a: Autopilota): boolean {
  if (a.chats.some((c) => viva(c) && d.occupata(a, c))) return true
  if ((a.inVolo ?? []).length > 0) return true
  return a.chats.length === 0 && a.sessionId !== undefined && a.stato === 'lavoro'
}

/** La riparazione dei workspace e delle chat di questo PC. Non solleva: gli errori sono voci. */
export async function riparaServizio(d: DipendenzeRiparazioneServizio, id: string): Promise<EsitoRiparazioneServizio> {
  const voci: VoceRiparazione[] = []
  const radice = radiceCopia(d.dati, id)
  let manifesto: Manifesto | undefined
  const salvaManifesto = (): void => {
    if (manifesto !== undefined) scriviJsonAtomico(join(radice, 'manifesto.json'), manifesto, 'autoriparazione')
  }
  /** La copia del workspace, una volta per esecuzione, prima del primo cambiamento. */
  const copia = (ws: string, ids: string[]): void => {
    manifesto ??= { id, quando: d.adesso(), autopiloti: [], workspace: [] }
    if (manifesto.workspace.some((w) => w.ws === ws)) return
    mkdirSync(join(radice, 'autopiloti'), { recursive: true })
    for (const x of ids) {
      if (manifesto.autopiloti.some((y) => y.id === x)) continue
      const da = join(d.archivio.cartella, `${x}.json`)
      const c = existsSync(da)
      if (c) copyFileSync(da, join(radice, 'autopiloti', `${x}.json`))
      manifesto.autopiloti.push({ id: x, cEra: c })
    }
    const cartella = d.cartellaWs(ws)
    const sub = join(radice, 'orchestratori', String(manifesto.workspace.length))
    mkdirSync(sub, { recursive: true })
    const file = existsSync(cartella) ? readdirSync(cartella).filter((n) => n.endsWith('.json')) : []
    for (const n of file) copyFileSync(join(cartella, n), join(sub, n))
    manifesto.workspace.push({ ws, cartella, file, orchestratore: file.includes('orchestratore.json') })
    salvaManifesto()
  }

  // 1. Autopiloti di prima mai passati all'unico del loro workspace.
  const wsViste = new Set<string>()
  for (const a of d.archivio.elenca()) {
    const ws = d.wsDi(a)
    if (wsViste.has(ws)) continue
    wsViste.add(ws)
    const vecchi = d.vecchiDel(ws).filter((v) => v.archiviato !== true)
    if (vecchi.length === 0) continue
    const nome = nomeCorto(ws)
    const occupati = vecchi.filter((v) => lavora(d, v))
    if (occupati.length > 0) {
      voci.push({ caso: 'autopiloti-di-prima', workspace: ws, esito: 'rimandato', cosa: `«${nome}»: ${occupati.length === 1 ? 'un autopilota di prima ha' : `${occupati.length} autopiloti di prima hanno`} una chat al lavoro; li passo all’autopilota unico a turno finito` })
      continue
    }
    try {
      const gia = d.unicoDi(ws)
      const dichiarato = d.orchestratori.impostazioni(ws).autopilota
      copia(ws, [...vecchi.map((v) => v.id), ...(gia !== undefined ? [gia.id] : dichiarato !== undefined ? [dichiarato] : [])])
      const chatPrima = gia?.chats.length ?? 0
      const e = d.assicura(ws)
      if (!e.ok) {
        voci.push({ caso: 'autopiloti-di-prima', workspace: ws, esito: 'fallito', cosa: `«${nome}»: non riesco a passare gli autopiloti di prima all’unico: ${e.motivo}` })
        continue
      }
      if (gia === undefined && manifesto !== undefined && !manifesto.autopiloti.some((y) => y.id === e.unico.id)) {
        manifesto.autopiloti.push({ id: e.unico.id, cEra: false })
        salvaManifesto()
      }
      const adottate = Math.max(0, e.unico.chats.length - chatPrima)
      voci.push({
        caso: dichiarato !== undefined && gia === undefined ? 'autopilota-mancante' : 'autopiloti-di-prima',
        workspace: ws,
        esito: 'sistemato',
        cosa: `«${nome}»: ${vecchi.length === 1 ? 'un autopilota di prima passato' : `${vecchi.length} autopiloti di prima passati`} all’autopilota ${gia === undefined ? 'nuovo' : 'unico'} del workspace, ${adottate} chat adottate (nessuna fermata)`
      })
    } catch (err) {
      voci.push({ caso: 'autopiloti-di-prima', workspace: ws, esito: 'fallito', cosa: `«${nome}»: passaggio non riuscito: ${String(err).slice(0, 160)}` })
    }
  }

  // 2. Chat orfane degli autopiloti unici: la copia (worktree) non c'è più.
  for (const u0 of d.unici()) {
    if (u0.archiviato === true || !d.cartellaEsiste(u0.cwd)) continue
    const ws = d.wsDi(u0)
    const nome = nomeCorto(ws)
    const orfane = u0.chats.filter((c) => viva(c) && c.cartella !== undefined && c.cartella !== u0.cwd && !d.cartellaEsiste(c.cartella))
    const sistemare: Array<{ id: string; come: 'unito' | 'tolto' }> = []
    for (const c of orfane) {
      if (d.occupata(u0, c)) {
        voci.push({ caso: 'chat-orfana', workspace: ws, esito: 'rimandato', cosa: `«${nome}»: la chat ${c.id} ha la copia sparita ma sta lavorando; la guardo a turno finito` })
        continue
      }
      const ramo = c.ramo !== undefined && d.statoRamo !== undefined ? d.statoRamo(u0.cwd, c.ramo) : 'mancante'
      if (ramo === 'non-unito' || ramo === 'ignoto') {
        voci.push({ caso: 'chat-orfana', workspace: ws, esito: 'segnalato', cosa: `«${nome}»: la chat ${c.id} ha la copia sparita ma il ramo ${c.ramo ?? ''} ${ramo === 'ignoto' ? 'non si sa se ha lavoro non unito' : 'ha lavoro non unito'}: lo guardi tu` })
        continue
      }
      sistemare.push({ id: c.id, come: ramo === 'unito' ? 'unito' : 'tolto' })
    }
    if (sistemare.length === 0) continue
    try {
      copia(ws, [u0.id])
      const quando = d.adesso()
      // Si rilegge l'autopilota: la copia è stata fatta adesso e niente deve sovrascrivere un cambiamento arrivato nel frattempo.
      const u = d.unici().find((x) => x.id === u0.id) ?? u0
      const aggiornato: Autopilota = {
        ...u,
        chats: u.chats.map((c) => {
          const s = sistemare.find((x) => x.id === c.id)
          return s === undefined || !viva(c) ? c : { ...c, stato: 'finita' as const, conclusa: { il: quando, come: s.come }, dal: quando }
        }),
        decisioni: [...u.decisioni, ...sistemare.map((s) => ({ quando, cosa: `autoriparazione: la chat ${s.id} era orfana (la sua copia non c'è più, ramo ${s.come === 'unito' ? 'unito' : 'tolto'}): chiusa` }))]
      }
      d.salva(aggiornato)
      voci.push({ caso: 'chat-orfana', workspace: ws, esito: 'sistemato', cosa: `«${nome}»: ${sistemare.length === 1 ? `la chat ${sistemare[0]!.id} era orfana` : `${sistemare.length} chat orfane`} (copia sparita, niente da unire): chius${sistemare.length === 1 ? 'a' : 'e'}` })
    } catch (err) {
      voci.push({ caso: 'chat-orfana', workspace: ws, esito: 'fallito', cosa: `«${nome}»: chat orfane non sistemate: ${String(err).slice(0, 160)}` })
    }
  }

  // 3. Copie, rami e trascrizioni rimasti di chat chiuse: l'autopulizia, con le sue regole (mai un ramo non unito).
  if (d.autopulizia !== undefined) {
    try {
      const e = await d.autopulizia()
      const tolte = e.copieTolte + e.ramiTolti + (e.trascrizioniTolte ?? 0) + (e.cartelleVuoteTolte ?? 0)
      if (tolte > 0) voci.push({ caso: 'copie-e-rami', esito: 'sistemato', cosa: `${e.copieTolte} copie, ${e.ramiTolti} rami e ${(e.trascrizioniTolte ?? 0) + (e.cartelleVuoteTolte ?? 0)} cartelle di chat chiuse tolti (le copie nel recupero)` })
      for (const g of (e.daGuardare ?? []).slice(0, 5)) voci.push({ caso: 'copie-e-rami', esito: 'segnalato', cosa: `${g.cosa}: ${g.perche}` })
      if (e.saltata !== undefined) voci.push({ caso: 'copie-e-rami', esito: 'rimandato', cosa: `pulizia di copie e rami rimandata: ${e.saltata}` })
      for (const m of e.errori.slice(0, 3)) voci.push({ caso: 'copie-e-rami', esito: 'fallito', cosa: m.slice(0, 200) })
    } catch (err) {
      voci.push({ caso: 'copie-e-rami', esito: 'fallito', cosa: `autopulizia non riuscita: ${String(err).slice(0, 160)}` })
    }
  }

  // 4. Le chat «solo mia» di Nicholas: solo segnalate.
  for (const a of d.archivio.elenca()) {
    if (a.archiviato === true) continue
    const n = (a.adottate ?? []).filter((x) => x.soloMia === true).length
    if (n > 0) voci.push({ caso: 'chat-solo-mia', workspace: d.wsDi(a), esito: 'segnalato', cosa: `«${nomeCorto(d.wsDi(a))}»: ${n === 1 ? 'una chat «solo mia» lasciata com’è' : `${n} chat «solo mia» lasciate come sono`}` })
  }

  for (const v of voci) if (v.esito === 'sistemato') d.log(`[autoriparazione] ${v.cosa}`)
  return { voci, copiato: manifesto !== undefined }
}

export type EsitoAnnulloServizio = { ripristinati: string[]; rimandati: string[]; errori: string[] }

/**
 * «Torna come prima», dalla parte del servizio: i file degli autopiloti e dei
 * workspace come nella copia. Un autopilota nato con la riparazione si
 * archivia (mai si cancella). Se un autopilota coinvolto ha una chat al
 * lavoro, quel workspace resta com'è e si ritenta.
 */
export function annullaRiparazioneServizio(d: DipendenzeRiparazioneServizio, id: string): EsitoAnnulloServizio {
  const r: EsitoAnnulloServizio = { ripristinati: [], rimandati: [], errori: [] }
  const radice = radiceCopia(d.dati, id)
  let m: Manifesto
  try { m = JSON.parse(readFileSync(join(radice, 'manifesto.json'), 'utf8')) as Manifesto } catch { r.errori.push('la copia della riparazione non c’è più'); return r }
  const adesso = d.archivio.elenca()
  const sotto = (ws: string): Autopilota[] => adesso.filter((a) => d.wsDi(a) === ws)
  m.workspace.forEach((w, i) => {
    const coinvolti = adesso.filter((a) => m.autopiloti.some((x) => x.id === a.id))
    const mio = coinvolti.filter((a) => d.wsDi(a) === w.ws || sotto(w.ws).some((s) => s.id === a.id))
    if (mio.some((a) => lavora(d, a))) { r.rimandati.push(w.ws); return }
    try {
      for (const x of m.autopiloti) {
        const a = adesso.find((y) => y.id === x.id)
        if (a === undefined || (d.wsDi(a) !== w.ws)) continue
        if (x.cEra) d.archivio.scrivi(JSON.parse(readFileSync(join(radice, 'autopiloti', `${x.id}.json`), 'utf8')) as Autopilota)
        else d.archivio.scrivi({ ...a, archiviato: true })
      }
      const sub = join(radice, 'orchestratori', String(i))
      if (w.orchestratore) scriviAtomico(join(w.cartella, 'orchestratore.json'), readFileSync(join(sub, 'orchestratore.json'), 'utf8'), 'autoriparazione')
      else d.orchestratori.cambiaImpostazioni(w.ws, (imp) => { const { autopilota: _a, assorbiti: _s, attivatoIl: _t, ...resto } = imp; return resto })
      d.orchestratori.dimentica?.(w.ws)
      r.ripristinati.push(w.ws)
      d.log(`[autoriparazione] «Torna come prima»: «${nomeCorto(w.ws)}» com’era`)
    } catch (err) {
      r.errori.push(`${w.ws}: ${String(err).slice(0, 160)}`)
    }
  })
  return r
}
