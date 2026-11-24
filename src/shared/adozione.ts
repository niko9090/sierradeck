import type { Autopilota, ChatAdottata, MessaggioAdottata, StatoAdottata } from './autopilota'
import { RUOLI, type Ruolo } from './ruoli-agenti'
import { chatsDi } from './chats-di'

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

/** Le sessioni che sono già dell'autopilota (la sua chat, i suoi specialisti): non si adottano. */
export function sessioniProprie(a: Autopilota): Set<string> {
  const s = new Set<string>()
  if (a.sessionId !== undefined) s.add(a.sessionId)
  for (const c of chatsDi(a)) if (c.sessionId !== undefined) s.add(c.sessionId)
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

/** k-280b: una chat adottata senza segni di vita da più di così è «vecchia ferma» e esce dalla vista di chi lavora. */
export const ADOTTATA_VECCHIA_MS = 24 * 3_600_000

export type GruppoAdottata = 'lavoro' | 'aspetta' | 'ferma' | 'vecchia'

/**
 * In quale gruppo sta una chat adottata (k-280b): «al lavoro», «aspetta te» (una domanda
 * o un permesso), «ferma» da poco, o «vecchia» (ferma da più di 24 ore). Una chat che aspetta
 * Nicholas resta tale: è lui che deve muoversi. Senza stato (chat adottate prima) vale l'ultimo
 * segno, o il giorno dell'adozione. Le «solo mia» non hanno gruppo: non sono dell'autopilota.
 */
export function gruppoAdottata(x: ChatAdottata, adesso: number): GruppoAdottata | undefined {
  if (x.soloMia === true) return undefined
  if (x.stato === 'aspetta') return 'aspetta'
  const segno = Date.parse(x.ultimoSegno ?? x.adottataIl)
  const vecchia = !Number.isNaN(segno) && adesso - segno > ADOTTATA_VECCHIA_MS
  if (vecchia) return 'vecchia'
  return x.stato === 'lavoro' ? 'lavoro' : 'ferma'
}

export type ContaAdottate = { lavoro: number; aspettano: number; ferme: number; vecchie: number; soloMie: number }

/** Le adottate divise nei gruppi, per lo stato e per le viste. */
export function contaAdottate(adottate: readonly ChatAdottata[], adesso: number): ContaAdottate {
  const c: ContaAdottate = { lavoro: 0, aspettano: 0, ferme: 0, vecchie: 0, soloMie: 0 }
  for (const x of adottate) {
    const g = gruppoAdottata(x, adesso)
    if (g === undefined) c.soloMie++
    else if (g === 'lavoro') c.lavoro++
    else if (g === 'aspetta') c.aspettano++
    else if (g === 'ferma') c.ferme++
    else c.vecchie++
  }
  return c
}

/** I segni che il Gestore ha visto: per ogni sessione se lavora, aspetta Nicholas o è ferma. */
export type SegnoAdottata = { sessionId: string; stato: StatoAdottata; quando: string }

/**
 * Registra i segni. Lo stato si aggiorna sempre; l'ultimo segno di vita solo se la chat
 * lavora o aspetta (una chat ferma non dà segni: il suo ultimo resta quello di prima).
 * Torna lo stesso oggetto se non cambia niente.
 */
export function conSegniAdottate(a: Autopilota, segni: readonly SegnoAdottata[]): Autopilota {
  if (a.adottate === undefined || segni.length === 0) return a
  const per = new Map(segni.map((s) => [s.sessionId, s]))
  let cambiato = false
  const adottate = a.adottate.map((x) => {
    const s = per.get(x.sessionId)
    if (s === undefined) return x
    const vivo = s.stato !== 'ferma'
    const nuovo: ChatAdottata = { ...x, stato: s.stato, ...(vivo ? { ultimoSegno: s.quando } : {}) }
    if (nuovo.stato === x.stato && nuovo.ultimoSegno === x.ultimoSegno) return x
    cambiato = true
    return nuovo
  })
  return cambiato ? { ...a, adottate } : a
}

/** Ogni quanto si rinnova l'ultimo segno di una chat che continua a lavorare: non si scrive il file a ogni giro. */
export const RINNOVO_SEGNO_MS = 5 * 60_000

/**
 * Cosa dire al servizio sulle adottate, guardando le chat aperte sul PC: viva e con una
 * domanda o un permesso = «aspetta» Nicholas; viva e che scrive = «lavoro»; chiusa o ferma al
 * prompt = «ferma». Solo i cambiamenti (o il rinnovo del segno di chi lavora). Mai le «solo mia».
 */
export function segniDaMandare(
  a: Autopilota,
  chat: readonly { sessione?: string; aspetta?: boolean; viva?: boolean; chiedeSegnale?: boolean; sceltaAperta?: boolean; domanda?: string }[],
  adesso: number
): SegnoAdottata[] {
  const fuori: SegnoAdottata[] = []
  for (const x of a.adottate ?? []) {
    if (x.soloMia === true) continue
    const c = chat.find((y) => y.sessione === x.sessionId)
    const stato: StatoAdottata = c === undefined || c.viva === false
      ? 'ferma'
      : c.chiedeSegnale === true || c.sceltaAperta === true || (c.domanda !== undefined && c.domanda !== '')
        ? 'aspetta'
        : c.aspetta === true ? 'ferma' : 'lavoro'
    const segno = x.ultimoSegno === undefined ? NaN : Date.parse(x.ultimoSegno)
    const vecchioSegno = Number.isNaN(segno) || adesso - segno >= RINNOVO_SEGNO_MS
    if (stato !== x.stato || (stato !== 'ferma' && vecchioSegno)) fuori.push({ sessionId: x.sessionId, stato, quando: new Date(adesso).toISOString() })
  }
  return fuori
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
