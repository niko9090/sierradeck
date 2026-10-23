import type { Autopilota, ChatGovernata } from './autopilota'
import { compitoBreve, nomeChi, senzaSigle } from './chat-autopilota'

/**
 * Il riquadro «Adesso» (0.81.0): una riga per chat, con cosa fa, da quanto,
 * e se è ferma, perché.
 *
 * Nicholas, 20/10: «non mi sento partecipe». c-14 e c-15 sono rimaste ferme
 * 844 minuti senza che nessuno glielo dicesse, mentre la scheda le dava «al
 * lavoro». Qui lo stato di ogni chat si legge dai fatti: lo stato salvato, da
 * quando (`dal`), l'ultimo segno di vita arrivato al servizio, la chat messa da
 * parte (0.80.1).
 *
 * Pura: la calcola il PC, e la pagina e l'app mostrano le righe come sono.
 */

export type RigaAdesso = {
  /** La chiave della chat: la sua nella flotta, l'autopilota per la chat sola. */
  id: string
  /** «Sviluppo», «Revisione», «Una chat»… */
  chi: string
  /** Il compito in poche parole. */
  compito: string
  /** La riga: «al lavoro da 12 min», «ferma da 40 min: non chiude un turno». */
  testo: string
  /** Il colore: `ferma` è quella che deve saltare all'occhio. */
  tono: 'lavoro' | 'aspetta' | 'pausa' | 'ferma'
}

export type Adesso = {
  righe: RigaAdesso[]
  /** Le chat finite non hanno una riga ciascuna: solo quante sono. */
  finite: number
}

/** Le informazioni dal vivo che il servizio aggiunge all'elenco (non salvate). */
export type SegniDalVivo = {
  ultimoSegno?: string
  segniChat?: Record<string, string>
  /**
   * Da quando il servizio raccoglie i segni (il suo avvio). Senza segni una
   * chat è muta da qui, non da sempre: dopo un riavvio nessuno ne ha ancora.
   */
  segniDal?: string
}

/**
 * Una chat che non chiude un turno né dà segni da tanto è ferma, anche se è
 * scritta «al lavoro». I segni comprendono il battito del Gestore dentro un
 * turno lungo, quindi cinque minuti di silenzio vogliono dire davvero ferma.
 *
 * Cinque minuti come la riga che la conversazione scrive a Nicholas
 * (`SILENZIO_DA_DIRE_MS`, c-10). Con 15 la prova del 20/10 ha dato per dieci
 * minuti la stessa chat «non dà segnali da 5 minuti» nella conversazione e
 * verde «al lavoro da 11 min» in «Adesso».
 */
export const MUTA_DA_MS = 5 * 60_000
/** Aperta da tanto senza un turno chiuso né un segno: non è mai partita. Stessa soglia, per lo stesso motivo. */
export const MAI_PARTITA_DA_MS = 5 * 60_000

/** «3 min», «2 h 10 min», «1 g 4 h»: corto, da leggere in una riga. */
export function durata(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000))
  if (min < 1) return 'meno di un minuto'
  if (min < 60) return `${min} min`
  const ore = Math.floor(min / 60)
  if (ore < 24) return min % 60 === 0 ? `${ore} h` : `${ore} h ${min % 60} min`
  const giorni = Math.floor(ore / 24)
  return ore % 24 === 0 ? `${giorni} g` : `${giorni} g ${ore % 24} h`
}

const istante = (s: string | undefined): number | undefined => {
  const t = Date.parse(s ?? '')
  return Number.isNaN(t) ? undefined : t
}

const daQuanto = (dal: string | undefined, ora: number): string => {
  const t = istante(dal)
  return t === undefined ? '' : ` da ${durata(ora - t)}`
}

/** La riga di una chat della flotta. */
function rigaChat(a: Autopilota & SegniDalVivo, c: ChatGovernata, ora: number): RigaAdesso {
  // 0.84.3 (collaudo c-96, D1): senza sigle anche qui, come nel Punto. Una chat
  // senza ruolo è «Una chat», distinta dal suo compito; il compito senza «(c-14)».
  const base = { id: c.id, chi: nomeChi(c), compito: senzaSigle(compitoBreve(c.compito)) }
  const dal = daQuanto(c.dal, ora)
  // In «attesa» le chat della flotta continuano (come `chatAlLavoro`): solo
  // con l'autopilota fermo sono ferme tutte, con il suo motivo.
  if (a.stato !== 'lavoro' && a.stato !== 'attesa') {
    const perche = a.motivoSospensione !== undefined && a.motivoSospensione !== '' ? ` (${senzaSigle(a.motivoSospensione)})` : ''
    return { ...base, testo: `ferma: l’autopilota è fermo${perche}`, tono: 'ferma' }
  }
  if (a.daParte?.includes(c.id) === true) {
    return { ...base, testo: `ferma${dal}: non chiude un turno, messa da parte. Torna da sola appena risponde`, tono: 'ferma' }
  }
  if (c.stato === 'bloccata') return { ...base, testo: `aspetta la tua risposta${dal}`, tono: 'aspetta' }
  if (c.stato === 'pausa') return { ...base, testo: `in pausa per i limiti del piano${dal}`, tono: 'pausa' }
  const segno = istante(a.segniChat?.[c.id])
  const aperta = istante(c.dal)
  const raccolti = istante(a.segniDal)
  // Dopo un riavvio del servizio una chat viva dà un segno entro pochi minuti:
  // prima di allora l'assenza di segni non dice niente.
  const senzaSegni = segno === undefined && (raccolti === undefined || ora - raccolti >= MAI_PARTITA_DA_MS)
  if (c.cicli === 0 && senzaSegni && aperta !== undefined && ora - aperta >= MAI_PARTITA_DA_MS) {
    return { ...base, testo: `non è ancora partita: aperta ${durata(ora - aperta)} fa, nessun segno`, tono: 'ferma' }
  }
  // Muta da: l'ultimo segno; senza segni, da quando li si raccoglie (o da quando
  // è al lavoro, se è dopo). Senza nessuna delle due date non si giudica.
  const riferimento = segno ?? (raccolti === undefined ? undefined : Math.max(raccolti, aperta ?? raccolti))
  if (riferimento !== undefined && ora - riferimento >= MUTA_DA_MS) {
    const testo = c.cicli === 0 && segno === undefined ? `non è ancora partita: nessun segno da ${durata(ora - riferimento)}` : `nessun segno da ${durata(ora - riferimento)}`
    return { ...base, testo, tono: 'ferma' }
  }
  const ultima = c.ultimaAzione !== undefined && c.ultimaAzione !== '' ? ` · ${c.ultimaAzione}` : ''
  return { ...base, testo: `al lavoro${dal}${ultima}`, tono: 'lavoro' }
}

/** La riga quando l'autopilota lavora con una chat sola. */
function rigaSola(a: Autopilota & SegniDalVivo, ora: number): RigaAdesso {
  const base = { id: a.id, chi: 'La chat', compito: compitoBreve(a.nome !== '' ? a.nome : a.obiettivo) }
  // Niente «da quanto»: `ultimoEvento` cambia a ogni salvataggio, non è l'ora della domanda.
  if (a.stato === 'attesa') return { ...base, testo: 'aspetta la tua risposta', tono: 'aspetta' }
  if (a.stato !== 'lavoro') {
    const perche = a.motivoSospensione !== undefined && a.motivoSospensione !== '' ? `: ${senzaSigle(a.motivoSospensione)}` : ''
    return { ...base, testo: `ferma${daQuanto(a.fermatoIl, ora)}${perche}`, tono: 'ferma' }
  }
  if (a.daParte?.includes(a.id) === true) {
    return { ...base, testo: 'ferma: non chiude un turno, messa da parte. Torna da sola appena risponde', tono: 'ferma' }
  }
  const raccolti = istante(a.segniDal)
  const segno = istante(a.ultimoSegno) ?? raccolti
  if (segno !== undefined && ora - segno >= MUTA_DA_MS) {
    return { ...base, testo: `nessun segno da ${durata(ora - segno)}`, tono: 'ferma' }
  }
  const ultima = a.ultimaAzioneChat !== undefined && a.ultimaAzioneChat !== '' ? ` · ${a.ultimaAzioneChat}` : ''
  return { ...base, testo: `al lavoro${ultima}`, tono: 'lavoro' }
}

/**
 * Le righe di «Adesso». Prima le ferme, poi chi aspetta te, poi le altre: la
 * cosa da sapere sta in cima. Niente righe per un autopilota finito o che non
 * è ancora partito: la scheda lo dice già.
 */
export function adessoDi(a: Autopilota & SegniDalVivo, ora: number): Adesso {
  if (a.stato === 'finito' || a.stato === 'intervista' || a.stato === 'pronto') return { righe: [], finite: 0 }
  if (a.chats.length === 0) return a.sessionId === undefined ? { righe: [], finite: 0 } : { righe: [rigaSola(a, ora)], finite: 0 }
  const vive = a.chats.filter((c) => c.stato !== 'finita')
  const peso: Record<RigaAdesso['tono'], number> = { ferma: 0, aspetta: 1, pausa: 2, lavoro: 3 }
  const righe = vive.map((c) => rigaChat(a, c, ora)).sort((x, y) => peso[x.tono] - peso[y.tono])
  return { righe, finite: a.chats.length - vive.length }
}

/** Lo stesso colore su PC, pagina e app. */
export const COLORE_ADESSO: Record<RigaAdesso['tono'], 'rosso' | 'ambra' | 'quieto' | 'verde'> = {
  ferma: 'rosso',
  aspetta: 'ambra',
  pausa: 'quieto',
  lavoro: 'verde'
}

/** Il «?» del riquadro, uguale dappertutto. */
export const AIUTO_ADESSO = 'Una riga per ogni chat dell’autopilota: cosa fa e da quanto. Una chat ferma sta in cima, in rosso, con il perché: non chiude un turno, non dà segni da cinque minuti, o non è mai partita. Le chat finite sono contate in fondo.'
