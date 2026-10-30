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
}

/** A che passo è (1…6), per la barra; 0 = finita o fallita. */
export function passoDi(f: FaseSposta): number {
  if (f === 'fatta' || f === 'fallita') return 0
  const i = PASSI_SPOSTA.findIndex((p) => p.fase === (f === 'attesa-proprietario' ? 'chiesta' : f))
  return i < 0 ? 0 : i + 1
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
