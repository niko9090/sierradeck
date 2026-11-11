import { createHash } from 'node:crypto'
import { chiaveFermo, riparteDaSolo, type Autopilota } from '@shared/autopilota'
import { chiusuraDaMotivo, type ComeChiuso, type FattoDomanda } from '@shared/avvisi-telefono'
import { partiDaTesto } from '@shared/domanda-strutturata'
import { DOMANDA_DECIDO_IO_MS } from './domande-in-chat'
import { soloInChat, type DomandaAperta, type RegistroDomande } from './domande'
import type { GiornaleAvvisi } from './giornale-avvisi'
import type { Avvisatore, TipoAvviso } from './telegram'

/**
 * **Dal servizio al giornale degli avvisi** (11/11): due involucri, montati
 * in `index.ts`, che non cambiano niente di quello che fanno il registro delle
 * domande e l'avvisatore, e in più scrivono il fatto nel giornale.
 *
 * - Il registro delle domande: una domanda che Nicholas deve vedere (aperta
 *   fuori dalla chat, o uscita dalla chat) è una notizia; la risposta, il
 *   ritiro, la scelta del programma dopo un'ora sono la sua chiusura.
 * - L'avvisatore (prima: Telegram): «Fatta: …» e «Lavoro fermo». Telegram
 *   adesso lo manda il programma, dal registro degli avvisi, come l'app.
 */

/** Il workspace di un autopilota, come si legge nel titolo dell'avviso. */
export type DoveDomanda = (autopilotaId: string) => { workspace: string } | undefined

/** Il fatto di una domanda aperta: la frase, le scelte, chi decide e quando. */
export function fattoDomanda(d: DomandaAperta, workspace: string): FattoDomanda {
  const c = d.contesto
  const domanda = d.parti?.domanda?.trim() || c?.grezza?.trim() || partiDaTesto(d.testo).domanda || d.testo
  const scelte = d.parti !== undefined && d.parti.scelte.length > 0
    ? d.parti.scelte.map((s) => ({ scelta: s.scelta, ...(s.consigliata === true ? { consigliata: true } : {}), ...(s.libera === true ? { libera: true } : {}) }))
    : (d.opzioni ?? []).map((s) => ({ scelta: s }))
  const aspettaTe = c?.rischiosa === true || c?.maiDaSola === true
  const decide = !aspettaTe && c?.rischiosa === false
  return {
    cosa: 'domanda', id: d.id, workspace, autopilota: d.autopilotaId, domanda,
    ...(scelte.length > 0 ? { scelte } : {}),
    ...(aspettaTe ? { aspettaTe: true } : {}),
    ...(decide ? { scadeIl: d.apertaIl + DOMANDA_DECIDO_IO_MS } : {})
  }
}

/**
 * Il registro delle domande che scrive anche il giornale. Una domanda aperta
 * fuori dalla chat si annuncia appena chi l'ha aperta ha scritto il suo
 * contesto (rischiosa o no: subito dopo `apri`, nello stesso giro), per questo
 * l'annuncio aspetta il prossimo microtask.
 */
export function conGiornale(r: RegistroDomande, g: GiornaleAvvisi, dove: DoveDomanda, poi: (f: () => void) => void = queueMicrotask): RegistroDomande {
  const annuncia = (d: DomandaAperta): void => {
    try { g.annota(fattoDomanda(d, dove(d.autopilotaId)?.workspace ?? '')) } catch (err) { console.error('[avviso] domanda non scritta nel giornale:', err) }
  }
  const visibile = (id: string): DomandaAperta | undefined => {
    const d = r.aperte().find((x) => x.id === id)
    return d !== undefined && !soloInChat(d) ? d : undefined
  }
  const chiusa = (id: string, come: ComeChiuso, testo?: string): void => {
    try { g.annota({ cosa: 'domanda-chiusa', id, come, ...(testo !== undefined && testo.trim() !== '' ? { testo } : {}) }) } catch (err) { console.error('[avviso] chiusura non scritta nel giornale:', err) }
  }
  return {
    ...r,
    apri(p) {
      const d = r.apri(p)
      if (p.inChat !== true) poi(() => { const ora = visibile(d.id); if (ora !== undefined) annuncia(ora) })
      return d
    },
    emergi(id, ora) {
      const e = r.emergi(id, ora)
      if (e !== undefined) annuncia(e)
      return e
    },
    rispondi(id, risposta, da) {
      const era = visibile(id)
      const ok = r.rispondi(id, risposta, da)
      if (ok && era !== undefined) chiusa(id, 'risposta', risposta)
      return ok
    },
    superata(id, motivo, extra) {
      const era = visibile(id)
      const ok = r.superata(id, motivo, extra)
      if (ok && era !== undefined) { const c = chiusuraDaMotivo(motivo); chiusa(id, c.come, c.testo) }
      return ok
    },
    ...(r.ritira !== undefined ? {
      ritira(id: string, motivo: string) {
        const era = visibile(id)
        const ok = r.ritira?.(id, motivo) ?? false
        if (ok && era !== undefined) chiusa(id, 'ritirata')
        return ok
      }
    } : {}),
    chiudiDi(autopilotaId) {
      const erano = r.aperte(autopilotaId).filter((d) => !soloInChat(d))
      r.chiudiDi(autopilotaId)
      const restano = new Set(r.aperte(autopilotaId).map((d) => d.id))
      for (const d of erano) if (!restano.has(d.id)) chiusa(d.id, 'ritirata')
    }
  }
}

/**
 * All'avvio del servizio: le domande già visibili che il giornale non ha
 * ancora (le aperte prima di questa versione, o con il giornale perso). Il
 * programma non le ripete: l'id dell'avviso è quello della domanda.
 */
export function annunciaAperte(r: RegistroDomande, g: GiornaleAvvisi, dove: DoveDomanda): number {
  let n = 0
  for (const d of r.visibili()) {
    if (g.haDomanda(d.id)) continue
    g.annota(fattoDomanda(d, dove(d.autopilotaId)?.workspace ?? ''))
    n += 1
  }
  return n
}

const workspaceDi = (a: Pick<Autopilota, 'workspace' | 'nome'>): string => a.workspace ?? a.nome
const impronta = (t: string): string => createHash('sha1').update(t).digest('hex').slice(0, 16)

/**
 * L'avvisatore del servizio: «Fatta: …» (una richiesta, o tutte) e «Lavoro
 * fermo» diventano notizie del giornale. Le domande no: le scrive il registro
 * delle domande, che sa anche quando si chiudono.
 */
export function avvisaNelGiornale(g: GiornaleAvvisi, adesso: () => number = Date.now): Avvisatore {
  const avvisa = async (tipo: TipoAvviso, a: Autopilota, testo?: string): Promise<void> => {
    try {
      if (tipo === 'domanda' || tipo === 'stallo' || tipo === 'pronto') return
      const annuncio = a.annuncio
      if (tipo === 'avviso' && annuncio?.titolo === 'Lavoro fermo') {
        g.annota({ cosa: 'fermo', id: annuncio.id, workspace: workspaceDi(a), autopilota: a.id, motivo: testo ?? '' })
        return
      }
      if (tipo === 'sospeso') {
        if (riparteDaSolo(a) || a.archiviato === true) return
        g.annota({ cosa: 'fermo', id: impronta(chiaveFermo(a)), workspace: workspaceDi(a), autopilota: a.id, motivo: a.motivoSospensione ?? testo ?? '' })
        return
      }
      const titolo = annuncio?.titolo ?? testo ?? a.nome
      g.annota({
        cosa: 'fatto', id: annuncio?.id ?? impronta(`${a.id}|${titolo}|${adesso()}`), workspace: workspaceDi(a), autopilota: a.id, titolo,
        ...(tipo === 'finito' ? { tutte: true } : {})
      })
    } catch (err) { console.error('[avviso] notizia non scritta nel giornale:', err) }
  }
  return Object.assign(avvisa, { svuotaOra: async (): Promise<void> => undefined })
}
