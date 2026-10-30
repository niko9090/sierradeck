import type { ChatSuPc } from '@shared/pc-remoto'
import type { Posta, VocePosta } from '@shared/posta'
import { ErroreRemoto, type MotivoRemoto } from '../pc-remoto'

/**
 * Scrivere a una chat di un progetto che vive su un altro PC (0.88.0).
 *
 * Semplice, senza fronzoli: se quel PC risponde (rete di casa, poi Tailscale:
 * `pc-remoto.ts`) il testo arriva subito nella chat (`/api/scrivi`). Se non
 * risponde, o la chat là non è aperta, il testo va nella sua **posta** sul
 * Drive (`posta.ts`): il suo postino lo consegna appena quel PC torna acceso,
 * aprendo o riprendendo la chat se serve. Chi scrive vede «in attesa»,
 * «consegnato» o «fallito» dagli esiti che scrive il destinatario.
 *
 * Mai due volte: una scrittura diretta finita in un tempo scaduto può essere
 * arrivata, e non si rimanda per la posta; lo si dice.
 */

/** I motivi per cui la strada diretta non c'è, ma la posta sì: il testo aspetta là. */
export const MOTIVI_VERSO_POSTA: readonly MotivoRemoto[] = [
  'sconosciuto', 'non-so', 'spento', 'senza-indirizzi', 'irraggiungibile', 'collegando', 'lento', 'chat', 'chiave', 'rifiutato'
]

export type Invio = {
  pcId: string
  testo: string
  /** L'id della chat su quel PC, se lo si sa già (il riquadro remoto). */
  chat?: string
  /** La conversazione: per ritrovarla là, e per la posta. */
  sessione?: string
  /** La cartella della chat come la conosce quel PC: serve alla posta. */
  cwd?: string
  /** L'id del messaggio, contro i doppioni sulla strada diretta. */
  idMessaggio?: string
  /** Chi scrive, se non è questo PC (il telefono): per il PIN. */
  visore?: string
  origine?: 'umano' | 'autopilota'
}

export type EsitoInvio =
  | { ok: true; via: 'diretta'; dati: unknown }
  | { ok: true; via: 'posta'; voce: string; messaggio: string }
  | { ok: false; messaggio: string; motivo?: MotivoRemoto | 'senza-cartella' | 'posta'; stato?: number; pin?: boolean }

/** Come sta un messaggio mandato da qui per la posta. */
export type StatoInvio = { id: string; testo: string; stato: 'attesa' | 'consegnato' | 'fallito'; creataIl: string; consegnataIl?: string; esito?: string; sessione?: string; cwd: string }

export type DipendenzeInvio = {
  chiama: (pcId: string, percorso: string, corpo?: unknown, visore?: string) => Promise<unknown>
  /** Una voce nella posta di quel PC (`postino.aggiungi`): la cassetta come la vede chiunque dopo. */
  accoda: (pcId: string, voce: { id: string; cwd: string; testo: string; sessione?: string; origine?: 'umano' | 'autopilota'; daVisore?: string }) => Promise<Posta | undefined>
  /** La posta di quel PC (`postino.posta`). */
  posta: (pcId: string) => Promise<Posta | undefined>
  /** La cartella di una conversazione di quel PC, se la si sa (battito, registro). */
  cwdDi?: (pcId: string, sessione: string) => string | undefined
  nomeDi?: (pcId: string) => string
  io: () => string
  nuovoId?: () => string
  log?: (m: string) => void
}

export type MandaAChat = {
  manda: (i: Invio) => Promise<EsitoInvio>
  /** I messaggi mandati da qui per la posta a quel PC, con il loro stato. */
  stati: (pcId: string) => Promise<StatoInvio[]>
}

export function statoDaVoce(v: VocePosta): StatoInvio {
  return {
    id: v.id, testo: v.testo, cwd: v.cwd, creataIl: v.creataIl,
    stato: v.stato === 'consegnata' ? 'consegnato' : v.stato === 'fallita' ? 'fallito' : 'attesa',
    ...(v.consegnataIl !== undefined ? { consegnataIl: v.consegnataIl } : {}),
    ...(v.esito !== undefined ? { esito: v.esito } : {}),
    ...(v.sessione !== undefined ? { sessione: v.sessione } : {})
  }
}

export function creaMandaAChat(deps: DipendenzeInvio): MandaAChat {
  const nuovoId = deps.nuovoId ?? ((): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`)
  const nome = (pcId: string): string => deps.nomeDi?.(pcId) ?? 'quel PC'
  const log = deps.log ?? ((): void => {})

  /** La chat là: quella indicata, o quella con la conversazione, o la prima che aspetta nella cartella. */
  const trovaLa = async (i: Invio): Promise<ChatSuPc | undefined> => {
    const st = await deps.chiama(i.pcId, '/api/stato', undefined, i.visore) as { chat?: ChatSuPc[] }
    const chat = Array.isArray(st.chat) ? st.chat : []
    if (i.sessione !== undefined && i.sessione !== '') return chat.find((c) => c.sessione === i.sessione && c.viva !== false)
    if (i.cwd !== undefined) return chat.find((c) => c.cwd === i.cwd && c.viva !== false && c.aspetta === true)
    return undefined
  }

  const perPosta = async (i: Invio, perche: string): Promise<EsitoInvio> => {
    const cwd = i.cwd ?? (i.sessione !== undefined ? deps.cwdDi?.(i.pcId, i.sessione) : undefined)
    if (cwd === undefined || cwd === '') {
      return { ok: false, motivo: 'senza-cartella', messaggio: `${nome(i.pcId)} non risponde (${perche}) e non so in quale cartella sta questa chat là: non posso lasciargli il messaggio. Riprova quando è acceso.` }
    }
    const id = nuovoId()
    let p: Posta | undefined
    try {
      p = await deps.accoda(i.pcId, {
        id, cwd, testo: i.testo,
        ...(i.sessione !== undefined && i.sessione !== '' ? { sessione: i.sessione } : {}),
        ...(i.origine !== undefined ? { origine: i.origine } : {}),
        ...(i.visore !== undefined ? { daVisore: i.visore } : {})
      })
    } catch (err) {
      return { ok: false, motivo: 'posta', messaggio: `${nome(i.pcId)} non risponde e la posta sul Drive non si scrive: ${err instanceof Error ? err.message : String(err)}. Il messaggio non è partito.` }
    }
    if (p === undefined || !p.voci.some((v) => v.id === id)) {
      return { ok: false, motivo: 'posta', messaggio: `${nome(i.pcId)} non risponde e la posta sul Drive non è disponibile (Drive scollegato o cassaforte chiusa). Il messaggio non è partito.` }
    }
    log(`[invio] ${nome(i.pcId)} non risponde (${perche}): messaggio nella sua posta, lo consegna quando torna`)
    return { ok: true, via: 'posta', voce: id, messaggio: `In attesa: ${nome(i.pcId)} non risponde adesso. Il messaggio è nella sua posta e arriva nella chat appena torna acceso.` }
  }

  return {
    async manda(i) {
      const testo = i.testo.trim()
      if (testo === '') return { ok: false, messaggio: 'testo vuoto' }
      try {
        const chat = i.chat !== undefined && i.chat !== '' ? i.chat : (await trovaLa(i))?.id
        // Quel PC risponde, ma la chat là non è aperta: la posta la riapre e consegna.
        if (chat === undefined) return await perPosta(i, 'la chat là non è aperta')
        const dati = await deps.chiama(i.pcId, '/api/scrivi', {
          chat: String(chat), testo: i.testo, ...(i.idMessaggio !== undefined && i.idMessaggio !== '' ? { idMessaggio: i.idMessaggio } : {})
        }, i.visore)
        return { ok: true, via: 'diretta', dati }
      } catch (err) {
        if (!(err instanceof ErroreRemoto)) return { ok: false, messaggio: err instanceof Error ? err.message : String(err) }
        if (err.motivo === 'pin') return { ok: false, motivo: 'pin', pin: true, messaggio: err.message, ...(err.stato !== undefined ? { stato: err.stato } : {}) }
        if (MOTIVI_VERSO_POSTA.includes(err.motivo)) return perPosta(i, err.motivo === 'chat' ? 'la chat là non è aperta' : err.message)
        // Risponde con un errore vero, o non ha finito in tempo (forse è arrivato): niente posta, mai due volte.
        return { ok: false, motivo: err.motivo, messaggio: err.message, ...(err.stato !== undefined ? { stato: err.stato } : {}) }
      }
    },
    async stati(pcId) {
      const p = await deps.posta(pcId)
      const io = deps.io()
      return (p?.voci ?? []).filter((v) => v.daPc === io).map(statoDaVoce)
    }
  }
}
