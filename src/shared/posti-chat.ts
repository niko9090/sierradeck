import { TETTO_CHAT_MAX } from './autopilota'

/**
 * Quante chat degli autopiloti lavorano insieme su questo PC (0.82.0).
 *
 * Prima il tetto era uno solo per tutti i PC (8 per autopilota, dentro il
 * freno sui limiti del piano) e due autopiloti con sei chat ciascuno erano
 * dodici `claude.exe` al lavoro, più i test che ognuno lancia: sul portatile
 * il PC si piantava, sul fisso no. Adesso il numero lo decide il PC su cui si
 * lavora, dai suoi processori, dalla memoria libera e da quanto sono occupati
 * i processori negli ultimi minuti, e vale per **tutti** gli autopiloti
 * insieme. Le chat in più aspettano in fila.
 *
 * Funzioni pure: uguali per il servizio (che decide) e per PC, pagina e app
 * (che mostrano «N di M chat» e il perché dietro «?»).
 *
 * I numeri (misurati il 21/10 sul fisso, 8 processori e 26 GB): un claude.exe
 * fermo pesa 250–350 MB, uno al lavoro 550–600 MB; con i test che lancia
 * (vitest su due processi) si arriva vicino agli 800. Le chat passano quasi
 * tutto il tempo ad aspettare il modello: i processori si riempiono solo
 * durante build e test, quindi tre chat ogni quattro processori.
 */

/** Mai meno di due: una chat che lavora e la sua Revisione. */
export const POSTI_MIN = 2
/** Oltre, le chat sulla stessa cartella si ostacolano invece di aiutarsi: il tetto con «più chat». */
export const POSTI_MAX = TETTO_CHAT_MAX
/**
 * Il tetto di serie, senza «più chat» nelle Impostazioni (0.85.2). Il 27/10,
 * con sei chat e i loro supervisori, il processore è rimasto sopra il 92% per
 * 17 minuti: ogni chat lancia test e compilazioni, e i giudizi sono altri
 * `claude.exe`. Quattro lasciano il PC usabile; chi lo vuole più pieno sceglie
 * «più chat» e torna fino a `POSTI_MAX`.
 */
export const POSTI_DI_SERIE = 4

/** Il tetto dei posti per la regolazione scelta. */
export function postiMassimi(regolazione: RegolazionePosti = 0): number {
  return regolazione === 1 ? POSTI_MAX : POSTI_DI_SERIE
}
/** Quanta memoria si conta per ogni chat in più (claude.exe al lavoro più i suoi test). */
export const MB_PER_CHAT = 800
/** La memoria che resta a Windows, al programma e a quello che Nicholas sta facendo. */
export const MB_DI_RISERVA = 2048
/** Sopra questa occupazione dei processori il PC è sotto sforzo: si scende di molto. */
export const CARICO_ALTO = 85
/** Sopra questa, si scende un poco. */
export const CARICO_MEDIO = 70
/** Si risale di un posto alla volta, al più uno ogni tanto: niente su e giù. */
export const SALITA_MS = 3 * 60_000

/** «Più chat / meno chat» nelle Impostazioni: −1 meno, 0 come dice il PC, +1 di più. */
export type RegolazionePosti = -1 | 0 | 1

export function leggiRegolazione(v: unknown): RegolazionePosti {
  return v === -1 || v === 1 ? v : 0
}

export type MisuraPc = {
  processori: number
  memoriaLiberaMb: number
  memoriaTotaleMb: number
  /** Occupazione media dei processori negli ultimi minuti, 0–100. */
  caricoPercento: number
}

/** Il numero massimo scelto a mano (k-57): da 1 al tetto di chat. */
export const POSTI_SCELTI_MIN = 1
export const POSTI_SCELTI_MAX = POSTI_MAX

/** Un numero scelto a mano valido (intero nel limite), o `undefined`: «Automatico». */
export function leggiPostiScelti(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isInteger(v) && v >= POSTI_SCELTI_MIN && v <= POSTI_SCELTI_MAX ? v : undefined
}

export type CalcoloPosti = {
  posti: number
  /** Cosa ha deciso il numero: serve al «?». */
  perche: 'processori' | 'memoria' | 'carico' | 'minimo' | 'massimo' | 'scelto'
}

/**
 * Quanti posti dà il PC adesso, senza ricordare il passato.
 *
 * `attive` sono le chat che già lavorano: la memoria che usano non è più
 * libera, quindi i posti dalla memoria sono loro più quelli che ci stanno
 * ancora.
 */
export function postiDalPc(m: MisuraPc, attive: number, regolazione: RegolazionePosti = 0, scelti?: number): CalcoloPosti {
  // Scelto da Nicholas: vince sempre, anche se il carico abbasserebbe.
  const voluti = leggiPostiScelti(scelti)
  if (voluti !== undefined) return { posti: voluti, perche: 'scelto' }
  const daProcessori = Math.floor((Math.max(1, m.processori) * 3) / 4)
  const daMemoria = Math.max(0, attive) + Math.max(0, Math.floor((m.memoriaLiberaMb - MB_DI_RISERVA) / MB_PER_CHAT))
  let base = Math.min(daProcessori, daMemoria)
  let perche: CalcoloPosti['perche'] = daMemoria < daProcessori ? 'memoria' : 'processori'
  if (regolazione === 1) base = Math.ceil(base * 1.5)
  if (regolazione === -1) base = Math.floor((base * 2) / 3)
  if (m.caricoPercento >= CARICO_ALTO) {
    base = Math.floor(base / 2)
    perche = 'carico'
  } else if (m.caricoPercento >= CARICO_MEDIO) {
    base = Math.floor((base * 3) / 4)
    perche = 'carico'
  }
  const massimo = postiMassimi(regolazione)
  if (base <= POSTI_MIN) return { posti: POSTI_MIN, perche: base < POSTI_MIN ? 'minimo' : perche }
  if (base >= massimo) return { posti: massimo, perche: base > massimo ? 'massimo' : perche }
  return { posti: base, perche }
}

export type StatoPosti = {
  posti: number
  perche: CalcoloPosti['perche']
  /** Quando il numero è cambiato l'ultima volta (ms). */
  cambiatoIl: number
  /** Da quando il PC ne darebbe di più (ms): si sale solo se dura. */
  salitaDal?: number
}

/**
 * Il numero di posti con la memoria del passato: scende subito quando il PC è
 * sotto sforzo (il carico è già una media di qualche minuto, non un picco), e
 * risale con calma, un posto alla volta, solo se il PC resta libero per
 * `SALITA_MS`. Senza, un test che finisce e uno che parte farebbero aprire e
 * aspettare le chat a ogni giro.
 */
export function prossimiPosti(prec: StatoPosti | undefined, calcolo: CalcoloPosti, ora: number): StatoPosti {
  if (prec === undefined) return { posti: calcolo.posti, perche: calcolo.perche, cambiatoIl: ora }
  if (calcolo.posti < prec.posti) return { posti: calcolo.posti, perche: calcolo.perche, cambiatoIl: ora }
  if (calcolo.posti === prec.posti) return { posti: prec.posti, perche: calcolo.perche, cambiatoIl: prec.cambiatoIl }
  const salitaDal = prec.salitaDal ?? ora
  if (ora - salitaDal >= SALITA_MS && ora - prec.cambiatoIl >= SALITA_MS) {
    return { posti: prec.posti + 1, perche: calcolo.perche, cambiatoIl: ora, ...(prec.posti + 1 < calcolo.posti ? { salitaDal: ora } : {}) }
  }
  return { ...prec, salitaDal }
}

/** Quello che PC, pagina e app mostrano: «N di M chat» e il perché. */
export type PostiChat = {
  /** Le chat degli autopiloti che lavorano adesso su questo PC. */
  attive: number
  posti: number
  /** Le chat che aspettano un posto, per autopilota. */
  inFila: number
  regolazione: RegolazionePosti
  /** Il numero massimo scelto da Nicholas (k-57); assente = automatico. */
  scelti?: number
  perche: CalcoloPosti['perche']
  /** Sta risalendo con calma: il PC ne darebbe di più. */
  risale: boolean
  misura?: MisuraPc
}

const gb = (mb: number): string => (mb / 1024).toLocaleString('it-IT', { maximumFractionDigits: 1 })

/** Il PC è sotto sforzo (a prescindere da chi ha scelto il numero). */
export function pcCarico(m: MisuraPc | undefined): boolean {
  return m !== undefined && m.caricoPercento >= CARICO_MEDIO
}

/** Da dove viene il numero: una riga corta per la modale. */
export function origineCorta(p: PostiChat): string {
  return p.scelti !== undefined ? 'Scelto da te' : 'Automatico, secondo il carico del PC'
}

/** L'avviso breve accanto al numero scelto, se il PC è carico. */
export function avvisoCarico(p: PostiChat): string | undefined {
  return p.scelti !== undefined && pcCarico(p.misura) ? 'Il PC è carico: con più chat può rallentare.' : undefined
}

/** La riga corta: «3 di 6 chat», con la fila se c'è. */
export function rigaPosti(p: PostiChat): string {
  return `${p.attive} di ${p.posti} chat${p.inFila > 0 ? ` · ${p.inFila} in fila` : ''}`
}

/** Il testo dietro «?»: com'è fatto il numero, in parole semplici. */
export function spiegaPosti(p: PostiChat): string {
  const righe: string[] = []
  const ex = p.scelti !== undefined ? ` (scelto da te: ${p.scelti})` : ''
  righe.push(`Su questo PC lavorano al massimo ${p.posti} chat degli autopiloti insieme${ex}; adesso ${p.attive === 1 ? 'ne lavora 1' : `ne lavorano ${p.attive}`}.`)
  if (p.misura !== undefined) {
    const m = p.misura
    righe.push(`Il numero viene dal PC: ${m.processori} processori, ${gb(m.memoriaLiberaMb)} GB di memoria libera su ${gb(m.memoriaTotaleMb)}, processori occupati al ${Math.round(m.caricoPercento)}% negli ultimi minuti.`)
  }
  const motivo: Record<CalcoloPosti['perche'], string> = {
    scelto: 'Il numero lo hai scelto tu: vale anche se il PC è carico. Con «Automatico» torna a decidere il PC.',
    processori: 'Adesso lo decidono i processori: tre chat ogni quattro.',
    memoria: `Adesso lo decide la memoria libera: circa ${gb(MB_PER_CHAT)} GB per chat, tenendone ${gb(MB_DI_RISERVA)} per il resto.`,
    carico: 'Il PC è sotto sforzo: le chat nuove aspettano finché si libera.',
    minimo: `È il minimo: ${POSTI_MIN} chat lavorano sempre, anche su un PC piccolo.`,
    massimo: p.regolazione === 1
      ? `È il massimo: oltre ${POSTI_MAX} chat sulla stessa cartella si ostacolano.`
      : `È il massimo di serie: ${POSTI_DI_SERIE} chat insieme lasciano il PC usabile anche mentre fanno girare test e compilazioni. Con «più chat» nelle Impostazioni si arriva a ${POSTI_MAX}.`
  }
  righe.push(motivo[p.perche])
  if (p.risale) righe.push('Il PC ne darebbe di più: il numero risale con calma, un posto ogni 3 minuti.')
  if (p.regolazione !== 0) righe.push(`Nelle Impostazioni è scelto «${p.regolazione === 1 ? 'più chat' : 'meno chat'}».`)
  if (p.inFila > 0) righe.push(`${p.inFila === 1 ? 'Una chat aspetta' : `${p.inFila} chat aspettano`} in fila: parte quando si libera un posto.`)
  righe.push('Le chat finite si chiudono da sole dopo qualche minuto, e il loro posto si libera. La conversazione resta.')
  return righe.join('\n')
}

/** Il testo scritto nel campo: un intero nel limite, o `undefined` se non va (k-57). */
export function leggiCampoPosti(testo: string): number | undefined {
  const t = testo.trim()
  return /^\d{1,2}$/u.test(t) ? leggiPostiScelti(Number(t)) : undefined
}

/** − e + : un posto alla volta, fermi ai limiti. */
export function passoPosti(valore: number, delta: 1 | -1): number {
  return Math.min(POSTI_SCELTI_MAX, Math.max(POSTI_SCELTI_MIN, valore + delta))
}

export const FRASE_LIMITE_PROCESSO = 'Il limite degli specialisti vale per l’autopilota al prossimo avvio: se sta lavorando riparte a turno finito.'

/** La riga nella conversazione dell'autopilota quando un compito resta in fila. */
export const IN_FILA = 'in fila: parte quando si libera un posto'

export function leggiPostiChat(v: unknown): PostiChat | undefined {
  if (typeof v !== 'object' || v === null) return undefined
  const o = v as Record<string, unknown>
  if (typeof o.attive !== 'number' || typeof o.posti !== 'number') return undefined
  const perche = ['processori', 'memoria', 'carico', 'minimo', 'massimo', 'scelto'].includes(o.perche as string) ? (o.perche as CalcoloPosti['perche']) : 'processori'
  const m = typeof o.misura === 'object' && o.misura !== null ? (o.misura as Record<string, unknown>) : undefined
  const misura = m !== undefined && typeof m.processori === 'number' && typeof m.memoriaLiberaMb === 'number' && typeof m.memoriaTotaleMb === 'number' && typeof m.caricoPercento === 'number'
    ? { processori: m.processori, memoriaLiberaMb: m.memoriaLiberaMb, memoriaTotaleMb: m.memoriaTotaleMb, caricoPercento: m.caricoPercento }
    : undefined
  return {
    attive: o.attive,
    posti: o.posti,
    inFila: typeof o.inFila === 'number' ? o.inFila : 0,
    regolazione: leggiRegolazione(o.regolazione),
    ...(leggiPostiScelti(o.scelti) !== undefined ? { scelti: leggiPostiScelti(o.scelti) } : {}),
    perche,
    risale: o.risale === true,
    ...(misura !== undefined ? { misura } : {})
  }
}
