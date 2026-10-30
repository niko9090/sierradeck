import type { Autopilota, ChatGovernata } from '@shared/autopilota'
import { CONSEGNATI_RICORDATI_AUTOPILOTA } from '@shared/autopilota'
import { rapportoDiFineTurno } from '@shared/rapporti-chat'
import { segnaleDiFineTurno, segnaleSuperato } from '@shared/segnali-flotta'
import { rigaUltimaAzione } from '@shared/specialisti'
import { conPreambolo, prendiMessaggiPer } from './dialogo'
import type { EventoOrchestratore, TipoEvento } from './orchestratore'

/**
 * **Lo Stop veloce** degli specialisti dell'orchestratore unico (P3).
 *
 * Nel vecchio giro la fine di un turno misurava i criteri e chiedeva un
 * giudizio al supervisore dentro l'hook: minuti, con la chat ferma. Qui no:
 * - si registra la fine del turno (turni, sessione, ultima azione, il segnale
 *   e la riga `RAPPORTO:`; le righe `LEZIONI:` le scrive il servizio);
 * - se c'è un messaggio in coda per quella chat la risposta è `block` con il
 *   testo (la chat continua con quello), altrimenti `{}`;
 * - l'evento va all'orchestratore, che lo raccoglie con gli altri per 30 s.
 * Niente modello e niente criteri: i criteri si misurano solo in `unisci`.
 *
 * Pura: torna l'autopilota nuovo, la risposta all'hook e l'evento.
 */

export type FermataSpecialista = {
  autopilota: Autopilota
  risposta: Record<string, unknown>
  /** Per l'orchestratore; assente se la chat continua con un messaggio. */
  evento?: EventoOrchestratore
}

/** Il tipo di evento dal segnale e dal rapporto di fine turno. */
export function tipoDellaFermata(c: Pick<ChatGovernata, 'segnale' | 'rapporto'>): TipoEvento {
  if (c.segnale?.tipo === 'fatto' || c.rapporto?.tipo === 'finita') return 'finito'
  if (c.segnale?.tipo === 'bloccata' || c.rapporto?.tipo === 'bloccata') return 'bloccato'
  if (c.rapporto?.tipo === 'serve' || c.segnale?.tipo === 'aspetto') return 'domanda'
  return 'fermo'
}

const TESTO_EVENTO_MAX = 1200

export function fermataSpecialista(a: Autopilota, chatId: string, corpo: Record<string, unknown>, quando: string): FermataSpecialista {
  const c = a.chats.find((x) => x.id === chatId)
  // Una chat finita, in chiusura o che non è sua si lascia fermare.
  if (c === undefined || c.stato === 'finita' || c.fine !== undefined) return { autopilota: a, risposta: {} }
  const ultimo = typeof corpo.last_assistant_message === 'string' ? corpo.last_assistant_message : ''
  const sessionId = typeof corpo.session_id === 'string' && corpo.session_id !== '' ? corpo.session_id : undefined
  const segnale = segnaleDiFineTurno(ultimo, { sorelle: a.chats.map((x) => x.id), me: chatId, quando })
  const rapporto = rapportoDiFineTurno(ultimo, segnale, quando)
  const azione = rigaUltimaAzione(ultimo)
  const { ripresa: _r, ...senzaRipresa } = c
  let chat: ChatGovernata = {
    ...senzaRipresa,
    cicli: c.cicli + 1,
    ...(sessionId !== undefined ? { sessionId } : {}),
    ...(azione !== '' ? { ultimaAzione: azione } : {}),
    segnale,
    ...(rapporto !== undefined ? { rapporto } : {})
  }
  // I messaggi dell'orchestratore (o di Nicholas) per questa chat: partono adesso, con il turno.
  const presi = prendiMessaggiPer(a, chatId)
  const decisioni = [...a.decisioni, { quando, cosa: `${chatId} chiude il turno: ${segnale.tipo}${rapporto !== undefined ? ` — ${rapporto.testo.slice(0, 160)}` : ''}` }]
  if (presi.testi.length > 0) {
    // Gli si dà altro lavoro: un suo «fatto» di prima non vale più.
    chat = { ...chat, segnale: segnaleSuperato(chat.segnale, quando) ?? segnale }
    const arrivati = presi.presi.map((m) => ({ id: m.id, testo: m.testo.slice(0, 400), quando: m.quando, consegnatoIl: quando }))
    return {
      autopilota: {
        ...presi.autopilota,
        chats: presi.autopilota.chats.map((x) => (x.id === chatId ? chat : x)),
        consegnatiDi: [...(a.consegnatiDi ?? []).filter((x) => !arrivati.some((y) => y.id === x.id)), ...arrivati].slice(-CONSEGNATI_RICORDATI_AUTOPILOTA),
        decisioni: [...decisioni, { quando, cosa: `a ${chatId} ${presi.testi.length === 1 ? 'il messaggio in coda' : `${presi.testi.length} messaggi in coda`}, con la fine del turno` }]
      },
      risposta: { decision: 'block', reason: conPreambolo(presi.testi, 'Prosegui tenendone conto. A fine compito chiudi con le righe RAPPORTO: e SEGNALE: come sempre.') }
    }
  }
  const tipo = tipoDellaFermata(chat)
  const testo = (rapporto?.testo ?? '').trim() !== '' && tipo !== 'fermo'
    ? rapporto!.testo
    : (ultimo.trim() !== '' ? ultimo.trim() : azione)
  return {
    autopilota: { ...a, chats: a.chats.map((x) => (x.id === chatId ? chat : x)), decisioni },
    risposta: {},
    evento: { tipo, quando, chat: chatId, testo: testo.length > TESTO_EVENTO_MAX ? `${testo.slice(0, TESTO_EVENTO_MAX - 1)}…` : testo }
  }
}
