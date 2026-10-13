import { cerca, type Scheda } from './quaderno'

/**
 * Il Quaderno riprogettato (0.70.0): a tutta finestra, in tre colonne — i
 * progetti con quante schede ha ognuno e i tag, l'elenco con la ricerca, la
 * scheda. Qui le regole pure: quali tag ci sono, come si filtra e si ordina,
 * come si dice «quando» in poche lettere. Le usano il PC e la pagina del
 * telefono (copiate), l'app le ha in QuadernoVista.kt.
 */

export type OrdineSchede = 'recenti' | 'titolo'

/** I tag di un quaderno con quante schede li portano: i più usati in cima, poi in ordine alfabetico. */
export function tuttiITag(schede: Scheda[]): Array<{ tag: string; n: number }> {
  const conti = new Map<string, number>()
  for (const s of schede) for (const t of new Set(s.tag)) conti.set(t, (conti.get(t) ?? 0) + 1)
  return [...conti.entries()]
    .map(([tag, n]) => ({ tag, n }))
    .sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag, 'it'))
}

/** Le schede che restano con la ricerca e, se scelto, un tag. */
export function filtraSchede(schede: Scheda[], filtro: { domanda?: string; tag?: string }): Scheda[] {
  const conTag = filtro.tag === undefined || filtro.tag === '' ? schede : schede.filter((s) => s.tag.includes(filtro.tag as string))
  return cerca(conTag, filtro.domanda ?? '')
}

/** Le più recenti in cima (a parità, per titolo), oppure per titolo. Non tocca l'elenco di partenza. */
export function ordinaSchedeCome(schede: Scheda[], come: OrdineSchede): Scheda[] {
  const perTitolo = (a: Scheda, b: Scheda): number => a.titolo.localeCompare(b.titolo, 'it', { sensitivity: 'base' })
  return [...schede].sort(come === 'titolo' ? perTitolo : (a, b) => (b.quando > a.quando ? 1 : b.quando < a.quando ? -1 : perTitolo(a, b)))
}

const due = (n: number): string => String(n).padStart(2, '0')

/** «oggi 14:20», «ieri», «3 giorni fa», «12/09», «12/09/2025»: quanto basta per riconoscerla. */
export function quandoBreve(iso: string, ora: number): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso.slice(0, 10)
  const d = new Date(t)
  const oggi = new Date(ora)
  const inizio = (x: Date): number => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const giorni = Math.round((inizio(oggi) - inizio(d)) / 86_400_000)
  if (giorni === 0) return `oggi ${due(d.getHours())}:${due(d.getMinutes())}`
  if (giorni === 1) return 'ieri'
  if (giorni > 1 && giorni < 7) return `${giorni} giorni fa`
  const data = `${due(d.getDate())}/${due(d.getMonth() + 1)}`
  return d.getFullYear() === oggi.getFullYear() ? data : `${data}/${d.getFullYear()}`
}

/** La prima riga con del testo del corpo: l'assaggio nell'elenco, per riconoscerla a colpo d'occhio. */
export function assaggio(corpo: string): string {
  for (const riga of corpo.split('\n')) {
    const pulita = riga.replace(/^#+\s*/, '').replace(/[*_`>-]/g, '').trim()
    if (pulita !== '') return pulita.slice(0, 90)
  }
  return ''
}

/** Il nome corto di una cartella di lavoro: l'ultima parte del percorso, per la colonna dei progetti. */
export function nomeCartella(cwd: string): string {
  const parti = cwd.split(/[\\/]/).filter((p) => p !== '')
  return parti[parti.length - 1] ?? cwd
}

/** Le cartelle delle chat aperte, una volta sola ciascuna, con il nome della prima chat che la usa. */
export function cartelleUniche(cartelle: Array<{ cwd: string; titolo: string }>): Array<{ cwd: string; nome: string; chat: number }> {
  const viste = new Map<string, { cwd: string; nome: string; chat: number }>()
  for (const c of cartelle) {
    if (c.cwd === '') continue
    const chiave = c.cwd.replace(/[\\/]+$/, '').toLowerCase()
    const gia = viste.get(chiave)
    if (gia !== undefined) gia.chat += 1
    else viste.set(chiave, { cwd: c.cwd, nome: nomeCartella(c.cwd), chat: 1 })
  }
  return [...viste.values()]
}
