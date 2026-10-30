import type { Autopilota, ChatGovernata, MessaggioPerLaChat } from '@shared/autopilota'
import { CONSEGNATI_RICORDATI_AUTOPILOTA } from '@shared/autopilota'
import { rapportoDiFineTurno } from '@shared/rapporti-chat'
import { segnaleDiFineTurno, segnaleSuperato } from '@shared/segnali-flotta'
import { rigaUltimaAzione } from '@shared/specialisti'
import type { EventoOrchestratore, TipoEvento } from './orchestratore'

/** Quanti messaggi aspettano al più una chat adottata. */
const DA_CONSEGNARE_MAX = 20

/**
 * Prende i messaggi che spettano a **questa** chat e li toglie dalla coda:
 * la chiave della chat si toglie dall'elenco, e il messaggio sparisce quando
 * nessuna deve più riceverlo.
 */
export function prendiMessaggiPer(
  a: Autopilota,
  chiave: string
): { autopilota: Autopilota; testi: string[]; presi: MessaggioPerLaChat[] } {
  const testi: string[] = []
  const presi: MessaggioPerLaChat[] = []
  const restanti: MessaggioPerLaChat[] = []
  for (const m of a.daConsegnare) {
    if (!m.chats.includes(chiave)) {
      restanti.push(m)
      continue
    }
    testi.push(m.testo)
    presi.push({ ...m, chats: [chiave] })
    const chats = m.chats.filter((c) => c !== chiave)
    if (chats.length > 0) restanti.push({ ...m, chats })
  }
  if (testi.length === 0) return { autopilota: a, testi, presi }
  return { autopilota: { ...a, daConsegnare: restanti }, testi, presi }
}

/**
 * Rimette in coda i messaggi di una consegna che non è partita (0.56.4), in
 * testa e senza doppioni.
 */
export function rimettiInCoda(a: Autopilota, messaggi: MessaggioPerLaChat[]): Autopilota {
  let coda = [...a.daConsegnare]
  const davanti: MessaggioPerLaChat[] = []
  for (const m of messaggi) {
    const gia = coda.find((x) => x.id === m.id)
    if (gia !== undefined) {
      coda = coda.map((x) => (x.id === m.id ? { ...x, chats: [...new Set([...x.chats, ...m.chats])] } : x))
    } else {
      const doppio = davanti.find((x) => x.id === m.id)
      if (doppio !== undefined) doppio.chats = [...new Set([...doppio.chats, ...m.chats])]
      else davanti.push({ ...m })
    }
  }
  return { ...a, daConsegnare: [...davanti, ...coda].slice(-DA_CONSEGNARE_MAX) }
}

/**
 * Le istruzioni del turno, con davanti i messaggi per la chat: detti per
 * quello che sono, parole di chi ha affidato il lavoro, che valgono di più.
 */
export function conPreambolo(testi: string[], istruzioni: string): string {
  if (testi.length === 0) return istruzioni
  const righe = testi.length === 1
    ? [`Chi ti ha dato il compito ti scrive: «${testi[0]}»`]
    : ['Chi ti ha dato il compito ti scrive:', ...testi.map((t) => `- «${t}»`)]
  return [...righe, '', 'Tienine conto prima di tutto il resto: vale più delle istruzioni che seguono.', '', istruzioni].join('\n')
}

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
  let chat: ChatGovernata = {
    ...c,
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
