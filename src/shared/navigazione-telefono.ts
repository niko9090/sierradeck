/**
 * **Dove si è sulla pagina del telefono** (0.83.0), con le stesse regole
 * dell'app (`Navigazione.kt`): quattro voci fisse (Adesso, Chat, Progetti,
 * Altro), le linguette in cima a Chat e Progetti, l'elenco delle sezioni di
 * Altro, e «indietro» uguale ovunque.
 *
 * Le funzioni finiscono **scritte dentro lo script della pagina** con
 * `.toString()`: per questo ognuna basta a se stessa (niente import, niente
 * chiamate fra loro, niente costanti di fuori). Le prove stanno in
 * `tests/shared/navigazione-telefono.test.ts`.
 */
import type { IdTelefono } from './menu-principale'

export type PostoTelefono = {
  voce: IdTelefono
  /** La linguetta scelta per voce (si ricorda tornandoci); assente = la prima. */
  linguette: Partial<Record<IdTelefono, number>>
  /** La sezione di Altro aperta, o null per l'elenco. */
  sezione: string | null
}

/** Una sezione di Altro: le prime tre erano la scheda Salute, le altre le Impostazioni. */
export type SezioneAltro = { id: string; titolo: string; sotto: string; impostazioni: boolean }

/** Le sezioni di Altro, nell'ordine dell'app (`SezioneAltro` in `Navigazione.kt`). */
export const SEZIONI_ALTRO: readonly SezioneAltro[] = [
  { id: 'salute', titolo: 'Salute del sistema', sotto: 'Da sistemare, computer, Drive, errori', impostazioni: false },
  { id: 'pc', titolo: 'Altri computer', sotto: 'Accesi o spenti, chat dal vivo, cassetta', impostazioni: false },
  { id: 'consumi', titolo: 'Consumi', sotto: 'Token, limiti del piano, contesto', impostazioni: false },
  { id: 'aggiornamenti', titolo: 'Aggiornamenti', sotto: 'La versione e l’aggiornamento del computer', impostazioni: true },
  { id: 'chat', titolo: 'Chat e quaderno personale', sotto: 'Workspace a elenco, Torna come prima, le tue note', impostazioni: true },
  { id: 'drive', titolo: 'Drive', sotto: 'Account Google, cassaforte, salvataggio', impostazioni: true },
  { id: 'aspetto', titolo: 'Aspetto', sotto: 'Banco o Foglio, chiarore', impostazioni: true },
  { id: 'notifiche', titolo: 'Avvisi', sotto: 'Quali notifiche', impostazioni: true },
  { id: 'info', titolo: 'Info ed errori', sotto: 'Versioni, Copia i dettagli, errori', impostazioni: true }
]

/** Si apre su Adesso: le domande per te sono la prima cosa da vedere. */
export function postoIniziale(): PostoTelefono {
  return { voce: 'adesso', linguette: {}, sezione: null }
}

/** Il tocco su una voce della fascia. Sulla voce in cui sei già: torna al suo inizio. */
export function toccaVoce(p: PostoTelefono, v: IdTelefono): PostoTelefono {
  const linguette: Partial<Record<IdTelefono, number>> = {}
  for (const k in p.linguette) if (k !== v || p.voce !== v) linguette[k as IdTelefono] = p.linguette[k as IdTelefono]
  return { voce: v, linguette, sezione: null }
}

/** Il tocco su una linguetta della voce in cui sei (0 = la prima). */
export function scegliLinguetta(p: PostoTelefono, i: number): PostoTelefono {
  const linguette: Partial<Record<IdTelefono, number>> = {}
  for (const k in p.linguette) if (k !== p.voce) linguette[k as IdTelefono] = p.linguette[k as IdTelefono]
  if (i > 0) linguette[p.voce] = i
  return { voce: p.voce, linguette, sezione: p.sezione }
}

/** La linguetta scelta nella voce in cui sei (0 = la prima). */
export function linguettaDi(p: PostoTelefono): number {
  return p.linguette[p.voce] || 0
}

/** Apre una sezione di Altro. */
export function apriSezioneAltro(p: PostoTelefono, id: string): PostoTelefono {
  return { voce: 'altro', linguette: p.linguette, sezione: id }
}

/**
 * Dove porta «indietro», dopo che dialoghi e dettagli sono già chiusi (passi
 * 1-2, li fa la pagina): 3. la sezione di Altro torna all'elenco, 4. la
 * linguetta torna alla prima, 5. la voce torna ad Adesso; da Adesso `null`,
 * cioè si esce.
 */
export function indietroTelefono(p: PostoTelefono): PostoTelefono | null {
  if (p.sezione !== null) return { voce: p.voce, linguette: p.linguette, sezione: null }
  if ((p.linguette[p.voce] || 0) !== 0) {
    const linguette: Partial<Record<IdTelefono, number>> = {}
    for (const k in p.linguette) if (k !== p.voce) linguette[k as IdTelefono] = p.linguette[k as IdTelefono]
    return { voce: p.voce, linguette, sezione: null }
  }
  if (p.voce !== 'adesso') return { voce: 'adesso', linguette: p.linguette, sezione: null }
  return null
}

/**
 * Dove porta una destinazione di prima, con le sette voci del PC: i salti da
 * dentro la pagina («Rispondi», «Guarda», «Apri cartella», «Apri la chat») la
 * chiedono ancora così. Uguale a `Navigazione.verso` dell'app.
 */
export function versoDestinazione(p: PostoTelefono, nome: string): PostoTelefono {
  const senza = (v: IdTelefono): Partial<Record<IdTelefono, number>> => {
    const l: Partial<Record<IdTelefono, number>> = {}
    for (const k in p.linguette) if (k !== v) l[k as IdTelefono] = p.linguette[k as IdTelefono]
    return l
  }
  if (nome === 'chat') return { voce: 'chat', linguette: senza('chat'), sezione: null }
  if (nome === 'progetti') return { voce: 'progetti', linguette: senza('progetti'), sezione: null }
  if (nome === 'file') { const l = senza('progetti'); l.progetti = 1; return { voce: 'progetti', linguette: l, sezione: null } }
  if (nome === 'salute') return { voce: 'altro', linguette: p.linguette, sezione: 'salute' }
  if (nome === 'impostazioni') return { voce: 'altro', linguette: p.linguette, sezione: null }
  // domande, autopiloti e tutto quello che non si conosce: Adesso.
  return { voce: 'adesso', linguette: p.linguette, sezione: null }
}

/**
 * I pannelli di prima che una linguetta o una sezione mostra già aperti: il
 * loro «Chiudi» lì vuol dire «indietro».
 */
export function pannelliDelPosto(p: PostoTelefono): string[] {
  const l = p.linguette[p.voce] || 0
  if (p.voce === 'chat' && l === 2) return ['negozio']
  if (p.voce === 'progetti' && l === 2) return ['drive', 'code']
  if (p.voce === 'altro' && (p.sezione === 'pc' || p.sezione === 'consumi')) return [p.sezione]
  return []
}
