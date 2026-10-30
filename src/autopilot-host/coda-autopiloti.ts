import type { Autopilota, ChatGovernata } from '@shared/autopilota'
import type { RichiestaVecchia, Vecchio } from './migra-orchestratore'
import { chiaveCompito } from '@shared/segnali-flotta'
import {
  aggiungi, chiaveWorkspace, passoDichiarato,
  type Coda, type CompitoMisurato, type EventoCoda, type MisuraCompito, type Modifica
} from '@shared/coda-richieste'

/**
 * La coda delle richieste e gli autopiloti di prima (P1):
 *
 * - **La migrazione**, una volta sola per workspace: le richieste (`richieste[]`)
 *   e i compiti in coda (`compitiDaFare`) di ogni autopilota del workspace, più
 *   i compiti delle chat ancora al lavoro, entrano nella coda. Si tengono
 *   `fattaIl`, versione e commit; il testo intero si riprende dal dialogo
 *   quando c'è ancora (il registro lo tagliava a 2000 caratteri).
 * - **La misura dei compiti** delle chat adottate dall'autopilota unico: in
 *   corso (una chat ci lavora, col «passo k di n» della sua ultima azione), in
 *   revisione (la chat ha finito, il ramo non è ancora unito) o unito.
 *
 * Tutto puro.
 */

export const autopilotiDel = (ws: string, tutti: Autopilota[]): Autopilota[] => tutti.filter((a) => chiaveWorkspace(a) === ws)

/** Il testo intero di una richiesta, dal dialogo (la battuta di Nicholas con la stessa data), se c'è ancora. */
function testoIntero(a: Autopilota, r: RichiestaVecchia): string {
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
export function migraAutopiloti(coda: Coda, autopiloti: Vecchio[], adesso: string): Modifica {
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
    for (const compito of [...(a.compitiDaFare ?? []), ...vivi]) {
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
export function misuraDaAutopiloti(autopiloti: Pick<Autopilota, 'chats'>[]): MisuraCompito {
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
