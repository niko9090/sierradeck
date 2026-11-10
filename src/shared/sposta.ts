/**
 * «Sposta su questo PC» (0.88.0) come lo vedono la finestra, la pagina e
 * l'app: i passi e lo stato. La procedura vera sta in
 * `src/main/progetti/sposta.ts`.
 */

export type FaseSposta =
  | 'controlli' | 'chiesta' | 'attesa-proprietario' | 'scarico' | 'verifica' | 'cambio' | 'vecchia-copia'
  | 'fatta' | 'fallita'

/** I passi, nell'ordine, con il titolo da mostrare. */
export const PASSI_SPOSTA: { fase: FaseSposta; titolo: string }[] = [
  { fase: 'controlli', titolo: 'Controlli' },
  { fase: 'chiesta', titolo: 'Il PC di prima ferma le chat del progetto e carica tutto sul Drive' },
  { fase: 'scarico', titolo: 'Scarico file e chat dal Drive' },
  { fase: 'verifica', titolo: 'Verifico le impronte, file per file' },
  { fase: 'cambio', titolo: 'Il progetto diventa di questo PC' },
  { fase: 'vecchia-copia', titolo: 'La copia di prima va nel recupero (30 giorni)' }
]

/** Il motivo detto quando il Drive è pieno: lo stesso per avvio, posta e proprietario. */
export const MOTIVO_DRIVE_PIENO_SPOSTA = 'Il Drive è pieno, libera spazio prima (svuota il cestino o le pulizie in Progetti) e poi riprova.'

/** Quanto sta caricando il PC di prima sul Drive (lo dice lui, passo per passo). */
export type AvanzamentoPrepara = {
  passo: 'controllo' | 'chat' | 'carico' | 'confronto'
  fatto?: number
  totale?: number
  unita?: 'file' | 'byte'
  dettaglio?: string
}

/**
 * Da quale a quale percentuale complessiva va ogni passo (poi `percentualePasso`
 * dice a che punto è dentro il suo pezzo).
 */
const FASCE_SPOSTA: Partial<Record<FaseSposta, [number, number]>> = {
  controlli: [0, 2], chiesta: [2, 35], 'attesa-proprietario': [2, 35], scarico: [35, 85], verifica: [85, 95], cambio: [95, 98], 'vecchia-copia': [98, 100]
}

/** La percentuale complessiva (0…100) di uno spostamento, da passo e avanzamento del passo (0…100). */
export function percentualeSposta(fase: FaseSposta, passoPerc: number | undefined): number {
  if (fase === 'fatta') return 100
  const fascia = FASCE_SPOSTA[fase]
  if (fascia === undefined) return 0
  const dentro = Math.max(0, Math.min(100, passoPerc ?? 0)) / 100
  return Math.round(fascia[0] + (fascia[1] - fascia[0]) * dentro)
}

/** Lo stato di uno spostamento, per chi lo guarda. */
export type VistaSposta = {
  progetto: string
  nome: string
  daNome: string
  fase: FaseSposta
  messaggio: string
  errore?: string
  /** Dove arriva su questo PC. */
  percorso: string
  avvisi?: string[]
  /** I file (e le chat) fatti e da fare nel passo di adesso: caricare dal PC di prima, scaricare, verificare. */
  fileFatti?: number
  fileTotali?: number
  /** Gli stessi, in byte (quando il passo li conta). */
  byteFatti?: number
  byteTotali?: number
  /** Quanto è fatto in tutto, 0…100 (sempre presente dal PC; opzionale solo per i dati vecchi). */
  percentuale?: number
  /** Quanto è fatto nel passo di adesso, 0…100 (assente se il passo non si conta). */
  percentualePasso?: number
  /** L'ultima volta che il PC di prima ha risposto (ISO). */
  ultimoContatto?: string
  /** Perché si aspetta (un PC spento, una chat che lavora, il Drive): vuoto se non si aspetta. */
  attesa?: string
  /** Fallita: il bottone «Riprova» rifà partire lo spostamento (stessa azione di «Sposta su questo PC»). */
  puoRiprovare?: boolean
}

/** A che passo è (1…6), per la barra; 0 = finita o fallita. */
export function passoDi(f: FaseSposta): number {
  if (f === 'fatta' || f === 'fallita') return 0
  const i = PASSI_SPOSTA.findIndex((p) => p.fase === (f === 'attesa-proprietario' ? 'chiesta' : f))
  return i < 0 ? 0 : i + 1
}

/** Da quale percentuale complessiva comincia ogni passo di `PASSI_SPOSTA` (serve a dire dove si è fermato uno spostamento fallito). */
export const INIZI_PASSI_SPOSTA: number[] = [0, 2, 35, 85, 95, 98]

export type StatoPassoSposta = 'fatto' | 'in-corso' | 'da-fare' | 'fermo'

/** Lo spostamento come lo disegnano il PC e la pagina del telefono: tutto già calcolato. */
export type AvanzamentoSposta = {
  /** 0…100, in tutto. */
  percentuale: number
  passi: { titolo: string; stato: StatoPassoSposta; nota?: string }[]
  /** Il passo di adesso: la sua barra (assente se non si conta) e i numeri («3 di 10 file», «2 MB di 8 MB»). */
  passo?: { titolo: string; percentuale?: number; numeri?: string }
  /** «ultimo contatto con <PC>: 12 s fa». */
  contatto?: string
  /** «sto aspettando: …». */
  attesa?: string
  puoRiprovare: boolean
  /** Il motivo è il Drive pieno: si offre «Libera spazio sul Drive». */
  drivePieno: boolean
}

/**
 * Da `VistaSposta` a quello che si disegna. Stesso codice per la finestra,
 * per la pagina del telefono (arriva intero con `toString()`: niente
 * funzioni annidate, niente costanti di modulo) e per i test.
 * `fmtByte` rende leggibili i byte; `adesso` è in millisecondi.
 */
export function avanzamentoSposta(
  s: VistaSposta,
  adesso: number,
  opz: { passi: { fase: string; titolo: string }[]; inizi: number[]; fmtByte: (n: number) => string; motivoDrivePieno: string }
): AvanzamentoSposta {
  const fallita = s.fase === 'fallita'
  const fatta = s.fase === 'fatta'
  const fasePassi = s.fase === 'attesa-proprietario' ? 'chiesta' : s.fase
  let corrente = opz.passi.findIndex((p) => p.fase === fasePassi)
  if (fallita) {
    // Dove si è fermato: il passo che contiene la percentuale (se la sappiamo).
    corrente = -1
    if (typeof s.percentuale === 'number') for (let i = 0; i < opz.inizi.length; i++) if (s.percentuale >= opz.inizi[i]!) corrente = i
  }
  const perc = fatta ? 100 : Math.max(0, Math.min(100, Math.round(s.percentuale ?? 0)))
  const passi = opz.passi.map((p, i) => {
    const stato: StatoPassoSposta = fatta || (corrente >= 0 && i < corrente) ? 'fatto' : i === corrente ? (fallita ? 'fermo' : 'in-corso') : 'da-fare'
    const nota = stato === 'fermo' ? s.errore : stato === 'in-corso' && s.attesa ? s.attesa : undefined
    return nota !== undefined && nota !== '' ? { titolo: p.titolo, stato, nota } : { titolo: p.titolo, stato }
  })
  const inCorso = !fatta && !fallita && corrente >= 0
  let passo: AvanzamentoSposta['passo']
  if (inCorso) {
    let numeri: string | undefined
    if (typeof s.byteTotali === 'number' && s.byteTotali > 0 && typeof s.byteFatti === 'number') numeri = `${opz.fmtByte(s.byteFatti)} di ${opz.fmtByte(s.byteTotali)}`
    else if (typeof s.fileTotali === 'number' && s.fileTotali > 0 && typeof s.fileFatti === 'number') numeri = `${s.fileFatti} di ${s.fileTotali} file`
    passo = { titolo: opz.passi[corrente]!.titolo }
    if (typeof s.percentualePasso === 'number') passo.percentuale = Math.max(0, Math.min(100, Math.round(s.percentualePasso)))
    if (numeri !== undefined) passo.numeri = numeri
  }
  let contatto: string | undefined
  if (inCorso && s.ultimoContatto) {
    const t = Date.parse(s.ultimoContatto)
    if (Number.isFinite(t)) {
      const sec = Math.max(0, Math.round((adesso - t) / 1000))
      const fa = sec < 60 ? `${sec} s fa` : sec < 3600 ? `${Math.floor(sec / 60)} min fa` : sec < 86400 ? `${Math.floor(sec / 3600)} h fa` : `${Math.floor(sec / 86400)} g fa`
      contatto = `ultimo contatto con ${s.daNome}: ${fa}`
    }
  }
  const attesa = !fatta && s.attesa ? s.attesa : undefined
  const drivePieno = (s.errore ?? '') === opz.motivoDrivePieno || (s.attesa ?? '') === opz.motivoDrivePieno
  const fine: AvanzamentoSposta = { percentuale: perc, passi, puoRiprovare: fallita && s.puoRiprovare === true, drivePieno }
  if (passo !== undefined) fine.passo = passo
  if (contatto !== undefined) fine.contatto = contatto
  if (attesa !== undefined) fine.attesa = attesa
  return fine
}

/** La conferma prima di partire: cosa succede, detto semplice. */
export function testoConfermaSposta(p: { nome: string; daNome: string; qui: string; daAcceso: boolean }): { titolo: string; righe: string[]; conferma: string } {
  return {
    titolo: `Sposta «${p.nome}» su ${p.qui}?`,
    righe: [
      `Adesso «${p.nome}» vive su ${p.daNome}.`,
      `${p.daNome} ferma le chat del progetto (mai una che sta lavorando) e carica tutto sul Drive.`,
      `Questo PC scarica file e chat e controlla le impronte, file per file. Se una sola non torna, si ferma e il progetto resta su ${p.daNome}.`,
      `Solo dopo il progetto diventa di ${p.qui}, e la copia di ${p.daNome} va nel recupero per 30 giorni: niente si cancella.`,
      ...(p.daAcceso ? [] : [`${p.daNome} adesso sembra spento: la richiesta resta nella sua posta e lo spostamento riparte da solo quando si accende.`])
    ],
    conferma: `Sposta su ${p.qui}`
  }
}
