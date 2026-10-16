import type { Autopilota, ChatAdottata, MessaggioAdottata } from './autopilota'
import { RUOLI, type Ruolo } from './ruoli-agenti'

/**
 * Le chat già avviate adottate dall'autopilota del loro workspace (0.78.0).
 *
 * Nicholas, 16/10: «le chat già avviate non le hai convertite e quindi di
 * fatto non è cambiato nulla». La migrazione della 0.74.1 aveva acceso la
 * vista a elenco con un autopilota dormiente, ma le chat esistenti erano
 * rimaste chat normali che l'autopilota non conosceva.
 *
 * Adottare **non tocca la chat**: nessun kill, riavvio, ripresa o
 * spostamento. L'autopilota la conosce (titolo, ruolo dal contenuto o «Chat»
 * generica) e, quando Nicholas gli scrive, può mandarle un messaggio: il
 * Gestore lo scrive nel suo terminale, quello che c'è già, solo quando la
 * chat è ferma. Il giro dell'autopilota non la guida da solo, non la chiude e
 * non le scrive mai se Nicholas l'ha segnata «solo mia».
 *
 * Tutto puro: il servizio, il main, il PC, la pagina e l'app usano queste regole.
 */

/** Il nome di una chat adottata senza ruolo. */
export const CHAT_GENERICA = 'Chat'

/**
 * Le parole di ogni ruolo per una chat esistente, a parole intere e più
 * strette di quelle dei compiti degli specialisti (`ruoloDaTesto`): sui dati
 * veri del 16/10 «UxC» (il prezzo dell'uranio) diventava «ux», Interfaccia.
 * Nel dubbio la chat resta «Chat».
 */
const PAROLE_RUOLO: readonly [Ruolo, RegExp][] = [
  ['rilascio', /\b(rilascio|rilascia|release|pubblica la versione|changelog)\b/i],
  ['revisione', /\b(revisione|rivedi|review|code review)\b/i],
  ['collaudo', /\b(test|testa|collaud\w*|prova dal vero|prove dal vero)\b/i],
  ['interfaccia', /\b(interfaccia|grafica|css|ui|ux|schermat\w*|pulsant\w*|layout)\b/i],
  ['sviluppo', /\b(svilupp\w*|implement\w*|codice|corregg\w*|correzion\w*|fix|bug|funzion\w*|refactor\w*|aggiung\w*|programm\w*|script)\b/i]
]

/**
 * Il ruolo di una chat esistente dal suo contenuto (il titolo, cioè la prima
 * cosa che le è stata chiesta): un ruolo solo quando le parole lo dicono, se
 * no «Chat» generica (assente). Un titolo già da specialista («Collaudo ·
 * Notte») vale quello.
 */
export function ruoloDaContenuto(titolo: string): Ruolo | undefined {
  const davanti = titolo.split(' · ')[0]?.trim()
  const dichiarato = (Object.keys(RUOLI) as Ruolo[]).find((r) => RUOLI[r].nome === davanti)
  if (dichiarato !== undefined && titolo.includes(' · ')) return dichiarato
  return PAROLE_RUOLO.find(([, re]) => re.test(titolo))?.[0]
}

/** Le sessioni che sono già dell'autopilota (la sua chat, i suoi specialisti, i supervisori): non si adottano. */
export function sessioniProprie(a: Autopilota): Set<string> {
  const s = new Set<string>()
  for (const x of [a.sessionId, a.sessioneIntervista, a.sessioneSupervisore]) if (x !== undefined) s.add(x)
  for (const c of a.chats) for (const x of [c.sessionId, c.sessioneSupervisore]) if (x !== undefined) s.add(x)
  return s
}

/**
 * Le adottate dopo aver guardato le chat del workspace: quelle già adottate
 * restano come sono (ruolo e «solo mia» compresi), le nuove si aggiungono in
 * fondo. Idempotente: rifatta con le stesse chat non cambia niente. Una chat
 * chiusa nel frattempo resta adottata: si riconosce se torna.
 */
export function conChatAdottate(
  a: Autopilota,
  chat: readonly { sessionId: string; titolo: string }[],
  quando: string,
  soloMie: ReadonlySet<string> = new Set()
): { autopilota: Autopilota; nuove: ChatAdottata[] } {
  const gia = a.adottate ?? []
  const conosciute = new Set(gia.map((x) => x.sessionId))
  const proprie = sessioniProprie(a)
  const nuove: ChatAdottata[] = []
  for (const c of chat) {
    if (c.sessionId === '' || conosciute.has(c.sessionId) || proprie.has(c.sessionId)) continue
    conosciute.add(c.sessionId)
    const ruolo = ruoloDaContenuto(c.titolo)
    nuove.push({ sessionId: c.sessionId, titolo: c.titolo, ...(ruolo !== undefined ? { ruolo } : {}), ...(soloMie.has(c.sessionId) ? { soloMia: true as const } : {}), adottataIl: quando })
  }
  if (nuove.length === 0) return { autopilota: a, nuove }
  return { autopilota: { ...a, adottate: [...gia, ...nuove] }, nuove }
}

/** Segna o toglie «solo mia». Segnata, i suoi messaggi in attesa si tolgono: non le scrive più. */
export function conSoloMia(a: Autopilota, sessionId: string, soloMia: boolean): Autopilota {
  const adottate = (a.adottate ?? []).map((x) => {
    if (x.sessionId !== sessionId) return x
    const { soloMia: _, ...resto } = x
    return soloMia ? { ...resto, soloMia: true as const } : resto
  })
  return {
    ...a,
    adottate,
    ...(soloMia && a.perAdottate !== undefined ? { perAdottate: a.perAdottate.filter((m) => m.sessionId !== sessionId) } : {})
  }
}

/** Le adottate che l'autopilota può guidare, con la chiave corta che usa nel dialogo (A1, A2, …). */
export function adottateGuidabili(a: Autopilota): { chiave: string; chat: ChatAdottata }[] {
  return (a.adottate ?? []).filter((x) => x.soloMia !== true).map((chat, i) => ({ chiave: `A${i + 1}`, chat }))
}

/** Le righe del prompt del dialogo sulle chat adottate. Vuoto se non ce ne sono. */
export function righePromptAdottate(a: Autopilota): string[] {
  const g = adottateGuidabili(a)
  if (g.length === 0) return []
  const chiave = new Map(g.map((x) => [x.chat.sessionId, x.chiave]))
  const attesa = (a.perAdottate ?? []).map((m) => `- per ${chiave.get(m.sessionId) ?? '?'}: «${m.testo.slice(0, 160)}»`)
  return [
    '',
    '## Le altre chat del workspace, che hai adottato',
    'Sono chat che c\'erano già: non le hai aperte tu e non le guidi da solo. Puoi mandare',
    'un messaggio a una di loro **solo se te lo chiede chi ti scrive** (o se serve per fare',
    'quello che ti chiede): le arriva quando è ferma, mai mentre lavora.',
    ...g.map((x) => `- ${x.chiave}: «${x.chat.titolo.slice(0, 120)}» (${x.chat.ruolo !== undefined ? RUOLI[x.chat.ruolo].nome : CHAT_GENERICA})`),
    // Quello che è davvero in coda (prova del 16/10: il supervisore credeva in coda un messaggio perso e non lo rimandava).
    ...(attesa.length > 0
      ? ['In coda adesso, non ancora scritti (partono quando la chat è ferma):', ...attesa]
      : ['In coda adesso: nessun messaggio. Quelli già scritti sono nelle ultime mosse («messaggio scritto alla chat adottata»).']),
    'Per scriverle aggiungi al JSON: "perLeChat": [{"chat": "A1", "testo": "il messaggio, scritto alla chat"}]'
  ]
}

/**
 * Legge `perLeChat` dalla risposta del dialogo e la trasforma in messaggi per
 * le adottate guidabili: una chiave sconosciuta o di una chat «solo mia» si
 * scarta (mai scrivere a chi non si deve).
 */
export function messaggiPerAdottate(a: Autopilota, raw: unknown, quando: string, nuovoId: () => string): MessaggioAdottata[] {
  if (!Array.isArray(raw)) return []
  const perChiave = new Map(adottateGuidabili(a).map((x) => [x.chiave, x.chat.sessionId]))
  return raw.flatMap((v) => {
    if (typeof v !== 'object' || v === null) return []
    const r = v as Record<string, unknown>
    const sessionId = typeof r.chat === 'string' ? perChiave.get(r.chat.trim().toUpperCase()) : undefined
    const testo = typeof r.testo === 'string' ? r.testo.trim() : ''
    return sessionId !== undefined && testo !== '' ? [{ id: nuovoId(), quando, sessionId, testo: testo.slice(0, 4000) }] : []
  })
}

/** Quanti messaggi per le adottate restano in coda al più: gli ultimi. */
export const PER_ADOTTATE_MAX = 20

export function conMessaggiAdottate(a: Autopilota, m: readonly MessaggioAdottata[]): Autopilota {
  if (m.length === 0) return a
  return { ...a, perAdottate: [...(a.perAdottate ?? []), ...m].slice(-PER_ADOTTATE_MAX) }
}

/** Tolti dalla coda i messaggi scritti. */
export function senzaMessaggiAdottate(a: Autopilota, ids: readonly string[]): Autopilota {
  if (a.perAdottate === undefined || ids.length === 0) return a
  return { ...a, perAdottate: a.perAdottate.filter((m) => !ids.includes(m.id)) }
}

/**
 * Cosa scrivere adesso, e dove: per ogni chat adottata **viva e ferma** il
 * messaggio più vecchio che le spetta, uno per volta. Una chat che lavora, che
 * non c'è (chiusa, mai aperta qui) o «solo mia» non riceve niente: il
 * messaggio aspetta. Mai aprire o riprendere una chat per scriverle.
 */
export function daScrivereAdesso(
  a: Autopilota,
  chat: readonly { id: string; sessione?: string; aspetta?: boolean; viva?: boolean }[]
): { messaggio: MessaggioAdottata; chatId: string }[] {
  const mie = new Set((a.adottate ?? []).filter((x) => x.soloMia === true).map((x) => x.sessionId))
  const fuori: { messaggio: MessaggioAdottata; chatId: string }[] = []
  const servite = new Set<string>()
  for (const m of a.perAdottate ?? []) {
    if (mie.has(m.sessionId) || servite.has(m.sessionId)) continue
    const c = chat.find((x) => x.sessione === m.sessionId)
    if (c === undefined || c.viva === false || c.aspetta !== true) continue
    servite.add(m.sessionId)
    fuori.push({ messaggio: m, chatId: c.id })
  }
  return fuori
}
