import type { Ruolo } from './ruoli-agenti'

/**
 * Un colore fisso per cosa fa una chat (0.82.0). Nicholas: un colore per
 * attività — sviluppo, revisione, collaudo, rilascio, interfaccia, aspetta te,
 * ferma o errore, finita — uguale su PC, pagina e app.
 *
 * È l'unica tabella: il PC la importa, la pagina la riceve scritta dentro il
 * suo script, l'app ne ha una copia generata (`ColoriAttivita.kt`) che un test
 * confronta con questa (`AGGIORNA=1` la riscrive). Ogni attività ha anche un
 * simbolo e una parola: si legge anche senza i colori. I colori sono provati
 * contro i fondi della tavolozza a ogni chiarore (contrasto almeno 4,5:1).
 *
 * Revisione e Rilascio avevano ambra e rosso, gli stessi di «aspetta te» e
 * «errore»: ora hanno un colore loro (rosa e lime), e ambra e rosso dicono
 * solo «ti aspetta» e «si è fermata».
 */

export type Attivita = Ruolo | 'aspetta' | 'ferma' | 'finita'

export type NomeColore = 'blu' | 'viola' | 'acqua' | 'rosa' | 'lime' | 'ambra' | 'rosso' | 'verde' | 'quieto'

/** I colori per nome, in `#rrggbb`: chi disegna non ne scrive altri. */
export const COLORI: Record<NomeColore, string> = {
  blu: '#4aa3ff',
  viola: '#b48cff',
  acqua: '#3cc8c0',
  rosa: '#f283c0',
  lime: '#b4d454',
  ambra: '#e0a33c',
  rosso: '#f2857c',
  verde: '#54c07a',
  quieto: '#9aa1a9'
}

export type SchedaAttivita = {
  id: Attivita
  /** Il nome nella legenda. */
  nome: string
  /** La parola corta accanto al simbolo. */
  parola: string
  /** Il simbolo: l'attività si riconosce anche senza colori. */
  icona: string
  colore: NomeColore
  /** Una riga, nella legenda dietro «?». */
  spiega: string
}

/** L'ordine della legenda: prima i cinque ruoli, poi gli stati. */
export const ATTIVITA_ORDINE: readonly Attivita[] = ['sviluppo', 'interfaccia', 'collaudo', 'revisione', 'rilascio', 'aspetta', 'ferma', 'finita']

export const ATTIVITA: Record<Attivita, SchedaAttivita> = {
  sviluppo: { id: 'sviluppo', nome: 'Sviluppo', parola: 'sviluppo', icona: '✎', colore: 'blu', spiega: 'scrive il codice e i suoi test' },
  interfaccia: { id: 'interfaccia', nome: 'Interfaccia', parola: 'interfaccia', icona: '◧', colore: 'viola', spiega: 'sistema quello che vedi su PC, pagina e app' },
  collaudo: { id: 'collaudo', nome: 'Collaudo', parola: 'collaudo', icona: '◎', colore: 'acqua', spiega: 'prova il lavoro e cerca i difetti' },
  revisione: { id: 'revisione', nome: 'Revisione', parola: 'revisione', icona: '◈', colore: 'rosa', spiega: 'rilegge il lavoro di un’altra chat prima di unirlo' },
  rilascio: { id: 'rilascio', nome: 'Rilascio', parola: 'rilascio', icona: '▲', colore: 'lime', spiega: 'prepara la versione e le novità' },
  aspetta: { id: 'aspetta', nome: 'Aspetta te', parola: 'aspetta te', icona: '◆', colore: 'ambra', spiega: 'ha una domanda o un permesso per te' },
  ferma: { id: 'ferma', nome: 'Ferma o errore', parola: 'ferma', icona: '■', colore: 'rosso', spiega: 'si è fermata: in pausa, bloccata o per un errore' },
  finita: { id: 'finita', nome: 'Finita', parola: 'finita', icona: '✓', colore: 'quieto', spiega: 'ha finito il suo compito' }
}

export function eAttivita(x: unknown): x is Attivita {
  return typeof x === 'string' && (ATTIVITA_ORDINE as readonly string[]).includes(x)
}

/**
 * Gli stati che arrivano dai vari posti: la scheda della Panoramica
 * (`lavora`, `chiede`, `ferma`, `finita`), la chat governata (`lavoro`,
 * `bloccata`, `pausa`, `finita`) e l'autopilota (`attesa`, `sospeso`,
 * `fallito`, `finito`…).
 */
const ASPETTA = new Set(['chiede', 'bloccata', 'attesa', 'aspetta'])
const FERMA = new Set(['ferma', 'fermo', 'pausa', 'sospeso', 'fallito', 'errore', 'guasto'])
const FINITA = new Set(['finita', 'finito'])

/**
 * Cosa fa una chat: lo stato vince sul ruolo (una Revisione che ti aspetta è
 * «aspetta te»); al lavoro è il suo ruolo, e una chat senza ruolo che lavora
 * è sviluppo.
 */
export function attivitaDi(ruolo: Ruolo | undefined, stato: string): Attivita {
  if (ASPETTA.has(stato)) return 'aspetta'
  if (FINITA.has(stato)) return 'finita'
  if (FERMA.has(stato)) return 'ferma'
  return ruolo ?? 'sviluppo'
}

/** Il colore di un nome, con il grigio per un nome che non c'è (un PC più nuovo). */
export function coloreDi(nome: string | undefined): string {
  return COLORI[nome as NomeColore] ?? COLORI.quieto
}

/** Il colore di un'attività. */
export function coloreAttivita(a: Attivita): string {
  return COLORI[ATTIVITA[a].colore]
}

/** Simbolo e parola, per chi non vede il colore: «◆ aspetta te». */
export function etichettaAttivita(a: Attivita): string {
  return `${ATTIVITA[a].icona} ${ATTIVITA[a].parola}`
}

const RUOLI_ATTIVITA: readonly Attivita[] = ['sviluppo', 'interfaccia', 'collaudo', 'revisione', 'rilascio']

/** Lo stato in una parola accanto al ruolo: «al lavoro» per i ruoli, altrimenti «aspetta te», «ferma», «finita». */
export function parolaStato(a: Attivita): string {
  return RUOLI_ATTIVITA.includes(a) ? 'al lavoro' : ATTIVITA[a].parola
}

export type VoceLegenda = { id: Attivita; icona: string; nome: string; spiega: string; colore: string }

/** La legenda dietro «?», una voce per attività, nell'ordine fisso. */
export function legendaAttivita(): VoceLegenda[] {
  return ATTIVITA_ORDINE.map((id) => ({ id, icona: ATTIVITA[id].icona, nome: ATTIVITA[id].nome, spiega: ATTIVITA[id].spiega, colore: coloreAttivita(id) }))
}

export const TITOLO_LEGENDA = 'I colori delle chat'

// ─── Contrasto (WCAG 2.x) ──────────────────────────────────────────────

const canale = (c: number): number => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }

/** La luminanza relativa di `#rrggbb`. */
export function luminanza(esa: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(esa)
  if (m === null) throw new Error(`colore non valido: ${esa}`)
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => canale(parseInt(x!, 16))) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Il rapporto di contrasto fra due colori, da 1 a 21. */
export function contrasto(a: string, b: string): number {
  const [x, y] = [luminanza(a), luminanza(b)].sort((p, q) => q - p) as [number, number]
  return (x + 0.05) / (y + 0.05)
}
