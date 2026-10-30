import { FERMA_DA_DIRE_MS, idChatNuova, type Autopilota, type ChatGovernata } from '@shared/autopilota'
import { haDettoFatto } from '@shared/segnali-flotta'
import { chiaveTurno } from './guardiano'

/**
 * **L'autopilota non resta mai fermo con il lavoro da finire** (0.84.1).
 *
 * La notte fra il 21 e il 22/10 l'autopilota era «al lavoro» con tre chat:
 * il guardiano le ha messe da parte alle 23:23, 23:30 e 23:34 perché tacevano
 * da un'ora, e poi più niente fino alle 06:51, quando Nicholas ha scritto.
 * L'autopilota si muove solo quando una sua chat chiude un turno: con tutte
 * le chat zitte nessuno lo svegliava, e «messa da parte» voleva dire
 * abbandonata.
 *
 * Qui c'è la regola, pura: quando il servizio fa un giro da solo e cosa fa
 * con ogni chat. Le mosse le esegue il server.
 *
 * - Una chat muta si **riprende**: la si interrompe (se non è già ferma al
 *   prompt) e le si riscrive l'ultima istruzione.
 * - Se dopo la ripresa resta muta, il suo compito **passa a una chat nuova**
 *   nella stessa cartella e sullo stesso ramo; la vecchia va nel recupero di 30
 *   giorni. Il compito resta a una chat sola: niente doppioni.
 * - Senza chat al lavoro si aprono i compiti in coda; senza nemmeno quelli, si
 *   apre una chat che riprende l'obiettivo (il «finito» lo decide poi il
 *   supervisore, con i criteri misurati).
 */

/** Dopo quanto tempo senza nessuna chat al lavoro il servizio fa un giro da solo. */
export const NESSUNO_AL_LAVORO_MS = 10 * 60_000
/** Quanto si aspetta una risposta dopo una ripresa prima di passare il compito a una chat nuova. */
export const RIPRESA_SENZA_RISPOSTA_MS = 10 * 60_000
/** Oltre queste chat nuove per lo stesso compito si riprende soltanto (e lo si dice a Nicholas). */
export const SOSTITUZIONI_MAX = 2

export type MossaMaiFermo =
  /** Interrompere (se `interrompi`) e riscrivere l'ultima istruzione. `chatId` assente: la chat singola. */
  | { tipo: 'riprendi'; chatId?: string; interrompi: boolean; muta: number }
  /** Il compito passa a una chat nuova sullo stesso ramo, la vecchia va nel recupero. */
  | { tipo: 'sostituisci'; chatId?: string; muta: number }
  /** Ci sono compiti in coda e nessuno li ha aperti. */
  | { tipo: 'apriCompiti' }
  /** Nessuna chat e nessun compito: una chat nuova riprende l'obiettivo. */
  | { tipo: 'nuovoCompito'; compito: string }
  /**
   * 29/10: la chat ha detto «fatto» e il suo lavoro è già nel principale: si
   * chiude invece di riprenderla o di dare il suo compito a una chat nuova.
   */
  | { tipo: 'chiudi'; chatId: string }

export type GiroMaiFermo = {
  /**
   * Perché il giro: nessuno lavora (tutto l'autopilota), chat messe da parte,
   * chat già riprese che non hanno risposto, o (0.84.3) chat ferme da più di
   * 15 minuti mentre le sorelle lavorano. La riga del diario dice il motivo vero.
   */
  perche: 'nessuno-al-lavoro' | 'messe-da-parte' | 'riprese-mute' | 'ferme'
  mosse: MossaMaiFermo[]
  /** Una riga per chat: com'è messa e cosa se ne fa. Va nel diario. */
  righe: string[]
  /** Il compito non trova una chat che risponda: lo si dice a Nicholas, una volta. */
  avvisaNicholas: string[]
}

export type VistaMaiFermo = {
  ora: number
  /** Quando è partito questo processo del servizio: dopo un riavvio la memoria dei segnali è vuota. */
  avvioServizio: number
  /** L'ultimo segnale (turno chiuso o battito del Gestore) per la chiave di `chiaveTurno`. */
  ultimoSegnale: (chiave: string) => number | undefined
  /**
   * L'ultimo segnale venuto **dalla chat** (hook, battiti), senza le consegne
   * del servizio: dice se ha risposto dopo la ripresa (0.84.3, D2). Assente:
   * `ultimoSegnale`.
   */
  ultimaRisposta?: (chiave: string) => number | undefined
  /** La chat (o la chat singola, `undefined`) ha una fermata in giudizio: sta lavorando il servizio. */
  inGiudizio: (chatId: string | undefined) => boolean
  /** Il Gestore la vede ferma al prompt: interromperla non serve. */
  fermaAlPrompt: (chiave: string) => boolean
  /** Domande aperte dell'autopilota per Nicholas. */
  domandeAperte: number
  /**
   * Quante chat si aprirebbero adesso con questa coda, e se nessuna perché
   * (0.84.3): la riga del giro dice cosa succede davvero. Assente: la riga
   * di prima, senza promesse.
   */
  apertura?: (compiti: string[]) => { daAprire: number; motivo?: string }
  /**
   * 29/10: il lavoro è compiuto (`lavoroCompiuto`): nessun giro, lo chiude il
   * servizio. Il 27/10 il giro da solo riapriva lavoro già fatto e pubblicato.
   */
  compiuto?: boolean
  /**
   * 29/10: c'è ancora qualcosa da fare: un criterio rosso, un commit nuovo nel
   * principale dall'ultimo giro, un ramo non ancora unito. `false`: niente
   * chat nuove (né sostituite né per riprendere l'obiettivo). Assente: come
   * prima.
   */
  qualcosaDaFare?: boolean
  /** 29/10: il lavoro di questa chat è già nel principale (ramo unito, tolto o senza novità). */
  giaFatto?: (c: ChatGovernata) => boolean
}

const t = (iso: string | undefined): number => {
  const v = iso === undefined ? NaN : Date.parse(iso)
  return Number.isNaN(v) ? -Infinity : v
}

/** Il compito che riprende l'obiettivo quando non c'è più nessuno al lavoro. */
export function compitoDiRipresa(a: Autopilota): string {
  // 29/10: niente rimandi a file grandi (la lista dei lavori è di 46 KB): git
  // log e i criteri bastano a vedere cosa manca.
  return 'Riprendi il lavoro dell’autopilota: nessuna chat lavora più e il lavoro non è chiuso. ' +
    'Guarda com’è messo (git log, i criteri di fine) e porta a termine solo quello che manca: non rifare quello che è già nel principale. ' +
    `Se è già tutto fatto, verificalo con i criteri e chiudi con «SEGNALE: fatto». Obiettivo: ${a.obiettivo.slice(0, 400)}`
}

type Unita = { chiave: string; ripresa?: { il: string; volte: number }; sostituzioni: number; dal?: string }

/**
 * Da quanti millisecondi la chat tace, misurato da quello che c'è di più
 * recente: l'ultimo segnale, la ripresa da solo, l'ingresso nello stato
 * `lavoro`, l'avvio del servizio (dopo un riavvio la memoria dei segnali è
 * vuota: si aspetta di nuovo, invece di dare la colpa alla chat).
 */
function silenzio(u: Unita, v: VistaMaiFermo, segnale: (k: string) => number | undefined): number {
  return v.ora - Math.max(segnale(u.chiave) ?? -Infinity, t(u.ripresa?.il), t(u.dal), v.avvioServizio)
}

/** Oltre quante riprese di fila l'attesa smette di raddoppiare: 10, 20, 40, 80, 160 minuti. */
export const RADDOPPI_MAX = 4

/**
 * Quanto si aspetta prima di toccare la chat. 29/10: dopo ogni ripresa senza
 * risposta l'attesa raddoppia, fino a `RADDOPPI_MAX` volte. Prima una chat
 * muta riceveva «Dimmi il punto» ogni 10 minuti per tutta la notte.
 */
export function sogliaDi(u: { ripresa?: { volte: number } }): number {
  if (u.ripresa === undefined) return NESSUNO_AL_LAVORO_MS
  return RIPRESA_SENZA_RISPOSTA_MS * 2 ** Math.min(RADDOPPI_MAX, Math.max(0, u.ripresa.volte - 1))
}

/** Riprendere o passare a una chat nuova: dipende da come è andata la ripresa di prima. */
function mossaPer(u: Unita, v: VistaMaiFermo, segnale: (k: string) => number | undefined, chatId: string | undefined, risposta: (k: string) => number | undefined = segnale): MossaMaiFermo {
  const muta = silenzio(u, v, segnale)
  const s = risposta(u.chiave)
  const haRisposto = u.ripresa !== undefined && s !== undefined && s > t(u.ripresa.il)
  if (u.ripresa === undefined || haRisposto || u.sostituzioni >= SOSTITUZIONI_MAX) {
    return { tipo: 'riprendi', ...(chatId !== undefined ? { chatId } : {}), interrompi: !v.fermaAlPrompt(u.chiave), muta }
  }
  return { tipo: 'sostituisci', ...(chatId !== undefined ? { chatId } : {}), muta }
}

const minuti = (ms: number): number => Math.max(0, Math.round(ms / 60_000))

/** Cosa fa il giro con i compiti in coda, detto com'è. */
function rigaApertura(ap: { daAprire: number; motivo?: string } | undefined, inCoda: number): string {
  if (ap === undefined) return 'provo ad aprire le chat'
  if (ap.daAprire === 0) return `non apro niente: ${ap.motivo ?? 'il PC non li lascia partire'}`
  const quante = ap.daAprire === 1 ? 'apro 1 chat' : `apro ${ap.daAprire} chat`
  return ap.daAprire < inCoda ? `${quante}, ${inCoda - ap.daAprire === 1 ? 'l’altro aspetta' : 'gli altri aspettano'}` : quante
}

function rigaMossa(m: MossaMaiFermo, nome: string): string {
  if (m.tipo === 'riprendi') return `${nome}: nessun segnale da ${minuti(m.muta)} min → ${m.interrompi ? 'la interrompo e ' : ''}le riscrivo l’ultima istruzione`
  if (m.tipo === 'sostituisci') return `${nome}: muta anche dopo la ripresa (${minuti(m.muta)} min) → il suo compito passa a una chat nuova sullo stesso ramo, lei va nel recupero`
  return ''
}

/**
 * La nota della riga «ferma» nella conversazione (0.84.3): da quanto e cosa fa
 * l'autopilota, in parole semplici. Completa la frase «Sviluppo («…») …».
 */
export function notaFerma(m: MossaMaiFermo): string | undefined {
  if (m.tipo === 'riprendi') return `è ferma da ${minuti(m.muta)} minuti senza segnali: ${m.interrompi ? 'la interrompo e ' : ''}le riscrivo l’ultima istruzione`
  if (m.tipo === 'sostituisci') return `non risponde nemmeno dopo la ripresa (${minuti(m.muta)} minuti): il suo compito passa a una chat nuova sullo stesso ramo, lei va nel recupero per 30 giorni`
  return undefined
}

/**
 * Il giro da fare adesso, o `undefined` se non serve.
 *
 * Due casi. **Nessuno al lavoro**: l'autopilota è in `lavoro` e da
 * `NESSUNO_AL_LAVORO_MS` nessuna chat dà segnali (o non ce n'è nessuna): si
 * guarda ogni chat e si decide. **Messe da parte**: altre chat lavorano, ma
 * una messa da parte dal guardiano non resta abbandonata.
 */
export function giroMaiFermo(a: Autopilota, v: VistaMaiFermo): GiroMaiFermo | undefined {
  if (a.stato !== 'lavoro' || a.fermatoPerAggiornamento === true || a.archiviato === true) return undefined
  // 29/10: lavoro compiuto, niente giro (lo chiude il servizio).
  if (v.compiuto === true) return undefined
  const daParte = new Set(a.daParte ?? [])

  // ── La chat singola: la chiave è quella dell'autopilota ──
  if (a.chats.length === 0) {
    if (v.inGiudizio(undefined) || v.domandeAperte > 0) return undefined
    const u: Unita = { chiave: chiaveTurno(a.id), ...(a.ripresa !== undefined ? { ripresa: a.ripresa } : {}), sostituzioni: SOSTITUZIONI_MAX }
    if (silenzio(u, v, v.ultimoSegnale) < sogliaDi(u)) return undefined
    const m = mossaPer(u, v, v.ultimoSegnale, undefined, v.ultimaRisposta ?? v.ultimoSegnale)
    return { perche: 'nessuno-al-lavoro', mosse: [m], righe: [rigaMossa(m, 'la chat')], avvisaNicholas: [] }
  }

  // Le chat della flotta: la chiave dei segnali è `autopilota::chat`.
  const segnale = (chatId: string): number | undefined => v.ultimoSegnale(chiaveTurno(a.id, chatId))
  const risposta = (chatId: string): number | undefined => (v.ultimaRisposta ?? v.ultimoSegnale)(chiaveTurno(a.id, chatId))
  const unita = (c: ChatGovernata): Unita => ({
    chiave: c.id,
    ...(c.ripresa !== undefined ? { ripresa: c.ripresa } : {}),
    sostituzioni: c.sostituzioni ?? 0,
    ...(c.dal !== undefined ? { dal: c.dal } : {})
  })
  const vistaChat: VistaMaiFermo = { ...v, fermaAlPrompt: (k) => v.fermaAlPrompt(chiaveTurno(a.id, k)) }
  const alLavoro = a.chats.filter((c) => c.stato === 'lavoro')
  const viva = (c: ChatGovernata): boolean => v.inGiudizio(c.id) || silenzio(unita(c), v, segnale) < sogliaDi(unita(c))
  const mute = alLavoro.filter((c) => !viva(c))

  // Da quanto l'autopilota è senza nessuno al lavoro: l'ultimo segno di
  // qualunque chat, l'ultimo cambio di stato, l'ultimo giro da solo, l'avvio.
  const quieteDa = Math.max(
    v.avvioServizio,
    t(a.giroDaSolo),
    ...a.chats.map((c) => Math.max(segnale(c.id) ?? -Infinity, t(c.dal), t(c.ripresa?.il)))
  )
  const tuttoFermo = mute.length === alLavoro.length && v.ora - quieteDa >= NESSUNO_AL_LAVORO_MS

  // Le mute da toccare: tutte se nessuno lavora, altrimenti quelle messe da
  // parte, quelle già riprese che non hanno risposto e (0.84.3, il Punto)
  // quelle ferme da più di 15 minuti mentre le sorelle lavorano.
  // (collaudo c-96, D2) Chi ha detto «aspetto» una sorella che lavora non è
  // ferma: aspetta come le è stato chiesto. Se anche la sorella tace, sono
  // ferme tutte e due e si riprendono.
  const aspettaUnaViva = (c: ChatGovernata): boolean => {
    if (c.segnale?.tipo !== 'aspetto' || c.segnale.di === undefined) return false
    const sorella = alLavoro.find((x) => x.id === c.segnale?.di)
    return sorella !== undefined && !mute.includes(sorella)
  }
  const daToccare = tuttoFermo
    ? mute
    : mute.filter((c) => daParte.has(c.id) || c.ripresa !== undefined || (silenzio(unita(c), v, segnale) >= FERMA_DA_DIRE_MS && !aspettaUnaViva(c)))
  const mosse: MossaMaiFermo[] = []
  const righe: string[] = []
  const avvisaNicholas: string[] = []
  for (const c of daToccare) {
    // 29/10: chi ha detto «fatto» con il lavoro già nel principale si chiude.
    if (haDettoFatto(c) && v.giaFatto?.(c) === true) {
      mosse.push({ tipo: 'chiudi', chatId: c.id })
      righe.push(`${c.id}: ha detto «fatto» e il suo lavoro è già nel principale → la chiudo`)
      continue
    }
    let m = mossaPer(unita(c), vistaChat, segnale, c.id, risposta)
    // 29/10: il compito passa a una chat nuova solo se c'è ancora qualcosa da
    // fare e il suo lavoro non è già nel principale; chi ha detto «fatto» non
    // si sostituisce mai (si riprende: al turno dopo lo chiude il supervisore).
    if (m.tipo === 'sostituisci') {
      if (v.giaFatto?.(c) === true) {
        mosse.push({ tipo: 'chiudi', chatId: c.id })
        righe.push(`${c.id}: muta, ma il suo lavoro è già nel principale → la chiudo invece di darlo a una chat nuova`)
        continue
      }
      if (v.qualcosaDaFare === false || haDettoFatto(c)) m = { tipo: 'riprendi', chatId: c.id, interrompi: !vistaChat.fermaAlPrompt(c.id), muta: m.muta }
    }
    // Al tetto delle chat nuove, una riga a Nicholas alla prima ripresa che non risponde.
    if (m.tipo === 'riprendi' && c.ripresa?.volte === 1 && (c.sostituzioni ?? 0) >= SOSTITUZIONI_MAX) {
      avvisaNicholas.push(`Il compito «${c.compito.slice(0, 80)}» non riparte: ${SOSTITUZIONI_MAX + 1} chat di fila non hanno risposto. Continuo a riprenderlo, sempre più di rado (da ${minuti(RIPRESA_SENZA_RISPOSTA_MS)} fino a ${minuti(sogliaDi({ ripresa: { volte: RADDOPPI_MAX + 1 } }))} minuti); se vuoi, guardalo tu.`)
    }
    mosse.push(m)
    righe.push(rigaMossa(m, c.id))
  }

  if (tuttoFermo) {
    for (const c of a.chats) {
      if (c.stato === 'bloccata') righe.push(`${c.id}: aspetta una tua risposta, non la tocco`)
      else if (c.stato === 'pausa') righe.push(`${c.id}: in pausa per i limiti del piano, riparte da sola`)
    }
    const aspettaNicholas = a.chats.some((c) => c.stato === 'bloccata') || v.domandeAperte > 0
    if (a.compitiDaFare.length > 0) {
      mosse.push({ tipo: 'apriCompiti' })
      const n = a.compitiDaFare.length
      righe.push(`${n === 1 ? 'un compito in coda' : `${n} compiti in coda`}: ${rigaApertura(v.apertura?.(a.compitiDaFare), n)}`)
    } else if (alLavoro.length === 0 && !aspettaNicholas && !a.chats.some((c) => c.stato === 'pausa') && v.qualcosaDaFare !== false) {
      // 29/10: solo se resta qualcosa (un criterio rosso, un commit nuovo, un
      // ramo da unire). Con tutto verde e niente di nuovo si riapriva il
      // lavoro già fatto.
      const compito = compitoDiRipresa(a)
      mosse.push({ tipo: 'nuovoCompito', compito })
      const ap = v.apertura?.([compito])
      righe.push(`nessuna chat e nessun compito in coda, ma il lavoro non è chiuso: ${ap === undefined || ap.daAprire > 0 ? 'apro una chat che riprende l’obiettivo' : `metto in coda un compito che riprende l’obiettivo, ma non apro niente: ${ap.motivo ?? 'il PC non lo lascia partire'}`}`)
    }
  }

  if (mosse.length === 0) return undefined
  // Il motivo vero (prova di 2 ore della 0.84.3): «messe da parte» solo se ce n'è una.
  const perche: GiroMaiFermo['perche'] = tuttoFermo
    ? 'nessuno-al-lavoro'
    : daToccare.some((c) => daParte.has(c.id)) ? 'messe-da-parte'
      : daToccare.some((c) => c.ripresa !== undefined) ? 'riprese-mute'
        : 'ferme'
  return { perche, mosse, righe, avvisaNicholas }
}

/** La riga del diario per il giro da solo. */
export function rigaGiro(g: GiroMaiFermo): string {
  const testa = g.perche === 'nessuno-al-lavoro'
    ? `giro da solo: da ${minuti(NESSUNO_AL_LAVORO_MS)} minuti nessuna chat lavora e il lavoro non è finito`
    : g.perche === 'messe-da-parte' ? 'giro da solo per le chat messe da parte'
      : g.perche === 'riprese-mute' ? 'giro da solo per le chat riprese che non hanno risposto'
        : `giro da solo per le chat ferme da più di ${minuti(FERMA_DA_DIRE_MS)} minuti mentre le altre lavorano`
  return `${testa}. ${g.righe.join('; ')}`
}

/** Il messaggio alla chat ripresa: l'ultima istruzione valida, o il suo compito. */
/** Quanto dell'ultima istruzione torna con «Dimmi il punto» (29/10: prima fino a 8.000 caratteri). */
export const ULTIME_NELLA_RIPRESA = 1500

export function testoRipresa(a: Autopilota, c: ChatGovernata | undefined, muta: number): string {
  const tutte = (c !== undefined ? c.ultimeIstruzioni : a.ultimeIstruzioni)?.trim() ?? ''
  const ultime = tutte.length <= ULTIME_NELLA_RIPRESA ? tutte : `${tutte.slice(0, ULTIME_NELLA_RIPRESA - 1)}…`
  const compito = c !== undefined && c.compito !== '' ? c.compito : a.obiettivo
  return [
    `Dimmi il punto: da ${minuti(muta)} minuti non arriva nessun segnale da questa chat e il lavoro non è finito.`,
    'Scrivi subito una riga RAPPORTO: con l’ultimo passo fatto, oppure «bloccata perché…» o «mi serve…»: fermarsi senza motivo non è ammesso.',
    'Poi rimettiti al lavoro. Se eri fermo su un comando che non finisce, lascialo perdere e prosegui in un altro modo.',
    '',
    ultime !== '' ? `L’ultima istruzione che avevi ricevuto:\n${ultime}` : `Il tuo compito: ${compito}`,
    '',
    'Chiudi il turno con la riga SEGNALE, come sempre.'
  ].join('\n')
}

/** La chat nuova che prende il compito di quella muta: stessa cartella, stesso ramo, sessione nuova. */
export function chatCheSostituisce(a: Autopilota, vecchia: ChatGovernata, sessionId: string, il: string): ChatGovernata {
  return {
    id: idChatNuova(a),
    compito: vecchia.compito,
    stato: 'lavoro',
    cicli: 0,
    sessionId,
    ...(vecchia.ruolo !== undefined ? { ruolo: vecchia.ruolo } : {}),
    ...(vecchia.revisioneDi !== undefined ? { revisioneDi: vecchia.revisioneDi } : {}),
    ...(vecchia.cartella !== undefined ? { cartella: vecchia.cartella } : {}),
    ...(vecchia.ramo !== undefined ? { ramo: vecchia.ramo } : {}),
    ...(vecchia.ultimeIstruzioni !== undefined ? { ultimeIstruzioni: vecchia.ultimeIstruzioni } : {}),
    ...(vecchia.rifacimenti !== undefined ? { rifacimenti: vecchia.rifacimenti } : {}),
    // L'ultima strada è del compito, non della sessione: chi la eredita, se si blocca, chiede (0.84.3).
    ...(vecchia.ultimaStrada === true ? { ultimaStrada: true } : {}),
    sostituisce: vecchia.id,
    sostituzioni: (vecchia.sostituzioni ?? 0) + 1,
    dal: il
  }
}

/**
 * L'autopilota con il compito passato dalla chat muta a quella nuova. La
 * vecchia è `finita`, senza ramo (il ramo è della nuova: niente doppia unione
 * né doppia Revisione) e segnata nel recupero; chi la stava rivedendo rivede
 * la nuova.
 */
export function conSostituzione(a: Autopilota, vecchiaId: string, nuova: ChatGovernata, il: string): Autopilota {
  const chats = a.chats.map((c): ChatGovernata => {
    if (c.id === vecchiaId) {
      const { ramo: _ramo, ripresa: _ripresa, ...resto } = c
      return { ...resto, stato: 'finita', sostituitaDa: nuova.id, nelRecupero: il, dal: il }
    }
    if (c.revisioneDi === vecchiaId) return { ...c, revisioneDi: nuova.id }
    return c
  })
  const daParte = (a.daParte ?? []).filter((k) => k !== vecchiaId)
  const { daParte: _via, ...senza } = a
  return { ...senza, ...(daParte.length > 0 ? { daParte } : {}), chats: [...chats, nuova] }
}

/** Il primo messaggio della chat nuova, prima del compito vero e proprio. */
export function testoPassaggio(vecchia: ChatGovernata): string {
  const dove = vecchia.ramo !== undefined ? `Sei nella sua cartella, sul suo ramo ${vecchia.ramo}` : 'Sei nella sua cartella'
  const tutte = vecchia.ultimeIstruzioni?.trim() ?? ''
  const ultime = tutte.length <= ULTIME_NELLA_RIPRESA ? tutte : `${tutte.slice(0, ULTIME_NELLA_RIPRESA - 1)}…`
  return [
    `Prendi in mano il compito della chat ${vecchia.id}: si è fermata e non ha risposto nemmeno dopo essere stata rimessa al lavoro.`,
    `${dove}: prima guarda cosa ha già fatto (git log, git status, i file cambiati) e riparti da lì, senza rifare quello che c’è già.`,
    ...(ultime !== '' ? ['', `L’ultima istruzione che aveva ricevuto:\n${ultime}`] : [])
  ].join('\n')
}
