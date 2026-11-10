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
  /** Fallita: il passo in cui si è fermata (l'app e la pagina lo segnano in rosso; gli altri prima sono fatti). */
  fallitaIn?: FaseSposta
}

/** A che passo è (1…6), per la barra; 0 = finita o fallita. */
export function passoDi(f: FaseSposta): number {
  if (f === 'fatta' || f === 'fallita') return 0
  const i = PASSI_SPOSTA.findIndex((p) => p.fase === (f === 'attesa-proprietario' ? 'chiesta' : f))
  return i < 0 ? 0 : i + 1
}

export type StatoPassoSposta = 'fatto' | 'in-corso' | 'da-fare' | 'errore'

/**
 * Lo stato di ogni passo di `PASSI_SPOSTA`, nell'ordine: fatto, in corso, da
 * fare, o in errore (quello dove si è fermata). Una fermata senza `fallitaIn`
 * è avvenuta nei controlli, prima di cominciare. L'app Android ha la stessa
 * regola (`SpostaRegole.stati`, un test le confronta).
 */
export function statiPassiSposta(v: { fase: FaseSposta; fallitaIn?: FaseSposta }): StatoPassoSposta[] {
  if (v.fase === 'fatta') return PASSI_SPOSTA.map(() => 'fatto')
  const indice = (f: FaseSposta | undefined): number => PASSI_SPOSTA.findIndex((p) => p.fase === (f === 'attesa-proprietario' ? 'chiesta' : f))
  if (v.fase === 'fallita') {
    const i = Math.max(0, indice(v.fallitaIn))
    return PASSI_SPOSTA.map((_, k) => (k < i ? 'fatto' : k === i ? 'errore' : 'da-fare'))
  }
  const i = indice(v.fase)
  return PASSI_SPOSTA.map((_, k) => (k < i ? 'fatto' : k === i ? 'in-corso' : 'da-fare'))
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
