/**
 * Pagina «Progetti» unica (k-u2). Regole pure: cosa sta nel dettaglio di un
 * progetto, cosa resta negli «Strumenti», come si dice lo stato di un PC.
 * Una cosa si mostra in un posto solo: i doppioni si cercano con `doppioni`.
 */
import { statoPc } from './stato-pc'

/** Le sezioni del dettaglio di un progetto, in ordine. Ognuna ha un solo posto. */
export const SEZIONI_DETTAGLIO = [
  { id: 'problemi', titolo: 'Da sistemare' },
  { id: 'chat', titolo: 'Chat' },
  { id: 'cartella', titolo: 'Cartella e quaderno' },
  { id: 'spazio', titolo: 'Spazio sul Drive' },
  { id: 'drive', titolo: 'Sul Drive' },
  { id: 'salvataggio', titolo: 'Salvataggio e sincronizzazione' }
] as const
export type IdSezioneDettaglio = (typeof SEZIONI_DETTAGLIO)[number]['id']

export type VoceStrumenti = { id: 'chat' | 'workspace' | 'spazio' | 'recupero' | 'gestione'; testo: string; spiega: string }

/**
 * Le voci di «Strumenti ▾»: solo ciò che non è di un progetto in particolare.
 * Contenuto del Drive e Salvataggio stanno nel dettaglio; «Gestione progetti»
 * e «Spazio sul Drive» hanno il loro tasto in alto e non si ripetono qui.
 */
export function vociStrumenti(inRecupero: number): VoceStrumenti[] {
  return [
    { id: 'chat', testo: 'Tutte le chat', spiega: 'Ogni chat con il PC dove vive il suo progetto.' },
    { id: 'workspace', testo: 'Workspace sul Drive', spiega: 'I workspace salvati sul Drive: toglierli e rimetterli.' },
    ...(inRecupero > 0 ? [{ id: 'recupero' as const, testo: `Cartelle in recupero (${inRecupero})`, spiega: 'Le cartelle tolte da questo PC, ripristinabili per 30 giorni.' }] : [])
  ]
}

/** Ids che compaiono più di una volta (per provare «niente doppioni»). */
export function doppioni(ids: readonly string[]): string[] {
  const visti = new Set<string>()
  const doppi = new Set<string>()
  for (const i of ids) { if (visti.has(i)) doppi.add(i); visti.add(i) }
  return [...doppi]
}

/** Il progetto del catalogo del Drive è questo progetto? Per id, altrimenti per nome. */
export function catalogoDiProgetto(g: { id?: string | undefined; nome: string }, r: { id: string; ids: readonly string[]; nome: string }): boolean {
  if (g.id !== undefined) return g.id === r.id || r.ids.includes(g.id)
  return g.nome.trim().toLowerCase() === r.nome.trim().toLowerCase()
}

/** Lo stato del PC proprietario, con le parole comuni di `statoPc`. */
export function parolaProprietario(acceso: boolean | undefined, adesso: number): string {
  return statoPc(acceso === true ? new Date(adesso).toISOString() : undefined, adesso).frase
}
