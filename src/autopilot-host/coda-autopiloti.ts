import type { Autopilota, ChatGovernata } from '@shared/autopilota'
import type { RichiestaNicholas } from '@shared/richieste-nicholas'
import { chiaveCompito } from '@shared/segnali-flotta'
import {
  aggiungi, candidatiUnione, chiaveWorkspace, compatta, daSeguire, passoDichiarato,
  type CandidatoUnione, type Coda, type CollegamentoRichiesta, type CompitoMisurato,
  type EventoCoda, type MisuraCompito, type Modifica, type Richiesta, type StatoCoda
} from '@shared/coda-richieste'

/**
 * La coda delle richieste e gli autopiloti di oggi (P1): finché non c'è
 * l'orchestratore unico (P3), il lavoro lo fanno ancora gli autopiloti, e la
 * coda lo guarda da qui.
 *
 * - **La migrazione**, una volta sola per workspace: le richieste (`richieste[]`)
 *   e i compiti in coda (`compitiDaFare`) di ogni autopilota del workspace, più
 *   i compiti delle chat ancora al lavoro, entrano nella coda. Si tengono
 *   `fattaIl`, versione e commit; il testo intero si riprende dal dialogo
 *   quando c'è ancora (il registro lo tagliava a 2000 caratteri).
 * - **La misura dei compiti**: un compito è da fare (in `compitiDaFare`), in
 *   corso (una chat ci lavora, col «passo k di n» della sua ultima azione), in
 *   revisione (la chat ha finito, il ramo non è ancora unito) o unito.
 * - **L'allineamento**: lo stato di ogni richiesta e la sua data di fine
 *   seguono i fatti degli autopiloti. Torna la stessa coda se non cambia niente.
 *
 * Tutto puro.
 */

export const autopilotiDel = (ws: string, tutti: Autopilota[]): Autopilota[] => tutti.filter((a) => chiaveWorkspace(a) === ws)

/** Il testo intero di una richiesta, dal dialogo (la battuta di Nicholas con la stessa data), se c'è ancora. */
function testoIntero(a: Autopilota, r: RichiestaNicholas): string {
  const b = a.dialogo.find((s) => s.da === 'tu' && s.quando === r.quando)
  return b !== undefined && b.testo.length >= r.testo.length ? b.testo : r.testo
}

const chiaviLegate = (c: Coda): Set<string> => {
  const k = new Set<string>()
  for (const r of c.richieste) {
    for (const x of r.collegate ?? []) {
      if (x.richiesta !== undefined) k.add(`r|${x.autopilota}|${x.richiesta}`)
      if (x.compito !== undefined) k.add(`c|${chiaveCompito(x.compito)}`)
    }
    for (const t of r.compiti) k.add(`c|${chiaveCompito(t)}`)
  }
  return k
}

/**
 * Porta nella coda le richieste e i compiti degli autopiloti del workspace che
 * non ci sono ancora. Una volta sola per autopilota (`migrati`), e senza
 * doppioni: una richiesta già legata (per id) o un compito già di una
 * richiesta (per chiave) non rientrano.
 */
export function migraAutopiloti(coda: Coda, autopiloti: Autopilota[], adesso: string): Modifica {
  const gia = new Set(coda.migrati ?? [])
  const nuovi = autopiloti.filter((a) => !gia.has(a.id)).sort((a, b) => a.iniziatoIl.localeCompare(b.iniziatoIl))
  if (nuovi.length === 0 && coda.migrata !== undefined) return { coda, eventi: [] }
  let c = coda
  const eventi: EventoCoda[] = []
  const ids: string[] = []
  const metti = (n: Parameters<typeof aggiungi>[1]): void => {
    const m = aggiungi(c, n)
    c = m.coda
    eventi.push(...m.eventi)
    ids.push(m.richiesta.id)
  }
  for (const a of nuovi) {
    const legate = chiaviLegate(c)
    for (const r of [...(a.richieste ?? [])].sort((x, y) => x.quando.localeCompare(y.quando))) {
      if (legate.has(`r|${a.id}|${r.id}`)) continue
      metti({
        testo: testoIntero(a, r),
        quando: r.quando,
        titolo: r.titolo,
        punti: [r.titolo],
        compiti: r.compiti,
        criterio: r.criterio,
        collegate: [{ autopilota: a.id, richiesta: r.id }],
        ...(r.fattaIl !== undefined ? { fattaIl: r.fattaIl } : {}),
        ...(r.versione !== undefined ? { versione: r.versione } : {}),
        ...(r.commit !== undefined ? { commit: r.commit } : {})
      })
    }
    const dopo = chiaviLegate(c)
    // I compiti in coda e quelli delle chat ancora al lavoro: tutto va fatto.
    const vivi = a.chats.filter((x) => x.stato !== 'finita' && x.revisioneDi === undefined && x.compito.trim() !== '').map((x) => x.compito)
    for (const compito of [...a.compitiDaFare, ...vivi]) {
      const k = `c|${chiaveCompito(compito)}`
      if (dopo.has(k)) continue
      dopo.add(k)
      metti({ testo: compito, quando: a.iniziatoIl, compiti: [compito], collegate: [{ autopilota: a.id, compito }] })
    }
  }
  return {
    coda: { ...c, migrata: c.migrata ?? adesso, migrati: [...gia, ...nuovi.map((a) => a.id)] },
    eventi: nuovi.length > 0 ? [...eventi, { tipo: 'migrazione', quando: adesso, autopiloti: nuovi.map((a) => a.id), ids }] : eventi
  }
}

/** Lo stato di un compito per una chat che ce l'ha. */
function misuraChat(c: ChatGovernata): CompitoMisurato {
  if (c.conclusa?.come === 'unito' || c.approvata === true) return { stato: 'unito' }
  if (c.stato === 'finita') return c.conclusa?.come === 'tolto' ? { stato: 'da-fare' } : { stato: 'in-revisione' }
  const passo = passoDichiarato(c.ultimaAzione)
  return { stato: 'in-corso', ...(passo !== undefined ? { passo } : {}) }
}

const AVANTI: Record<CompitoMisurato['stato'], number> = { 'da-fare': 0, 'in-corso': 1, 'in-revisione': 2, unito: 3 }

/**
 * Come misurare un compito, dagli autopiloti del workspace: la chat più
 * avanti che ce l'ha (per testo o per chiave), se no «da fare».
 */
export function misuraDaAutopiloti(autopiloti: Autopilota[]): MisuraCompito {
  const perChiave = new Map<string, CompitoMisurato>()
  for (const a of autopiloti) {
    for (const c of a.chats) {
      if (c.revisioneDi !== undefined) continue
      const k = chiaveCompito(c.compito)
      const m = misuraChat(c)
      const prima = perChiave.get(k)
      if (prima === undefined || AVANTI[m.stato] > AVANTI[prima.stato]) perChiave.set(k, m)
    }
  }
  return (compito) => perChiave.get(chiaveCompito(compito))
}

/** Lo stato di una richiesta non ancora fatta, dai suoi compiti. */
function statoDaiCompiti(r: Richiesta, misura: MisuraCompito): StatoCoda {
  // Senza compiti misurabili resta dov'era.
  if (r.compiti.length === 0) return r.stato
  const stati = r.compiti.map((c) => misura(c)?.stato ?? 'da-fare')
  if (stati.some((s) => s === 'in-corso')) return 'in-corso'
  if (stati.every((s) => s === 'in-revisione' || s === 'unito')) return 'in-verifica'
  if (stati.some((s) => s === 'in-revisione' || s === 'unito')) return 'in-corso'
  return 'pianificata'
}

/**
 * Lo stato di ogni richiesta segue i fatti degli autopiloti:
 * - **fatta** quando tutte le sue richieste di autopilota sono fatte (il
 *   criterio verde: `fattaIl`, con versione e commit), o — per le richieste
 *   nate da un compito — quando tutti i compiti sono uniti;
 * - altrimenti dai compiti: in corso, in verifica, pianificata.
 * Una fatta non torna indietro. Torna la stessa coda se non cambia niente.
 */
export function allineaConAutopiloti(coda: Coda, autopiloti: Autopilota[], adesso: string): Modifica {
  const misura = misuraDaAutopiloti(autopiloti)
  const perId = new Map(autopiloti.map((a) => [a.id, a]))
  const eventi: EventoCoda[] = []
  let cambiata = false
  const richieste = coda.richieste.map((r) => {
    if (r.stato === 'fatta') return r
    const links = r.collegate ?? []
    const perRichiesta = links.filter((x) => x.richiesta !== undefined)
    const legate = perRichiesta.flatMap((x) => {
      const rn = perId.get(x.autopilota)?.richieste?.find((y) => y.id === x.richiesta)
      return rn !== undefined ? [rn] : []
    })
    const perCompito = links.filter((x) => x.compito !== undefined).map((x) => x.compito!)
    let nuova: Richiesta = r
    // I compiti che l'autopilota ha legato dopo (una richiesta che riceve compiti nuovi).
    const compiti = [...new Set([...r.compiti, ...legate.flatMap((x) => x.compiti)])]
    if (compiti.length !== r.compiti.length) nuova = { ...nuova, compiti }
    // Fatta quando ogni legame lo dice: la richiesta dell'autopilota col criterio
    // verde, il compito col ramo unito. Un legame che non si trova più non la chiude.
    const fatta = links.length > 0 &&
      legate.length === perRichiesta.length && legate.every((x) => x.fattaIl !== undefined) &&
      perCompito.every((c) => misura(c)?.stato === 'unito')
    const stato: StatoCoda = fatta ? 'fatta' : statoDaiCompiti(nuova, misura)
    if (stato !== r.stato) {
      eventi.push({ tipo: 'stato', quando: adesso, id: r.id, da: r.stato, a: stato })
      nuova = { ...nuova, stato }
      if (stato === 'fatta') {
        const date = legate.map((x) => x.fattaIl!).sort()
        const versione = legate.map((x) => x.versione).find((v) => v !== undefined)
        const commit = legate.map((x) => x.commit).find((v) => v !== undefined)
        nuova = {
          ...nuova,
          fattaIl: date[date.length - 1] ?? adesso,
          ...(versione !== undefined ? { versione } : {}),
          ...(commit !== undefined ? { commit } : {}),
          punti: nuova.punti.map((p) => (p.stato === 'aperto' ? { ...p, stato: 'fatto' as const } : p))
        }
      }
    }
    if (nuova !== r) cambiata = true
    return nuova
  }).map((r) => {
    // Versione e commit arrivano dopo la data (la release esce più tardi).
    if (r.stato !== 'fatta' || (r.versione !== undefined && r.commit !== undefined)) return r
    const legate = (r.collegate ?? []).flatMap((x) => (x.richiesta !== undefined ? [perId.get(x.autopilota)?.richieste?.find((y) => y.id === x.richiesta)] : []))
    const versione = r.versione ?? legate.map((x) => x?.versione).find((v) => v !== undefined)
    const commit = r.commit ?? legate.map((x) => x?.commit).find((v) => v !== undefined)
    if (versione === r.versione && commit === r.commit) return r
    cambiata = true
    return { ...r, ...(versione !== undefined ? { versione } : {}), ...(commit !== undefined ? { commit } : {}) }
  })
  const allineata = cambiata ? { ...coda, richieste } : coda
  const compattata = compatta(allineata, adesso)
  return { coda: compattata.coda, eventi: [...eventi, ...compattata.eventi] }
}

export type DallaRichiesta = {
  autopilota: Autopilota
  /** Le parole intere del messaggio. */
  testo: string
  quando: string
  /** Le richieste che l'autopilota ha appena registrato per questo messaggio. */
  nuove: RichiestaNicholas[]
}

/**
 * Un messaggio di Nicholas che è diventato richiesta (una o più, per
 * l'autopilota) entra nella coda come **una** richiesta: le sue parole intere,
 * un punto per ogni richiesta vista, i loro compiti e il legame con
 * l'autopilota. Con le candidate all'unione fra quelle aperte; se una candidata
 * è già fatta, la nuova la segue.
 */
export function aggiungiDalMessaggio(coda: Coda, d: DallaRichiesta): Modifica & { richiesta: Richiesta; candidati: CandidatoUnione[] } {
  const candidati = candidatiUnione(coda, d.testo)
  const aperte = candidati.filter((c) => !c.fatta).map((c) => c.id)
  const segue = daSeguire(candidati)
  const collegate: CollegamentoRichiesta[] = d.nuove.map((n) => ({ autopilota: d.autopilota.id, richiesta: n.id }))
  const m = aggiungi(coda, {
    testo: d.testo,
    quando: d.quando,
    ...(d.nuove.length === 1 ? { titolo: d.nuove[0]!.titolo } : {}),
    punti: d.nuove.length > 1 ? d.nuove.map((n) => n.titolo) : [d.testo],
    compiti: d.nuove.flatMap((n) => n.compiti),
    ...(d.nuove.length === 1 ? { criterio: d.nuove[0]!.criterio } : {}),
    collegate,
    ...(segue !== undefined && aperte.length === 0 ? { segue } : {}),
    candidati: aperte
  })
  return { ...m, candidati }
}

/** Le candidate aperte per il prompt del dialogo: id, titolo e punti non superati. */
export type CandidataNelPrompt = { id: string; titolo: string; punti: { id: string; testo: string; stato?: 'fatto' | 'superato' }[] }

export function candidatePerPrompt(coda: Coda, testo: string, max = 5): CandidataNelPrompt[] {
  return candidatiUnione(coda, testo)
    .filter((c) => !c.fatta)
    .slice(0, max)
    .flatMap((c) => {
      const r = coda.richieste.find((x) => x.id === c.id)
      return r === undefined ? [] : [{ id: r.id, titolo: r.titolo, punti: r.punti.map((p) => ({ id: p.id, testo: p.testo, ...(p.stato !== 'aperto' ? { stato: p.stato } : {}) })) }]
    })
}
