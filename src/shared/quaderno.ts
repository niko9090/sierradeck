/**
 * Il quaderno di una cartella di lavoro: cosa è stato fatto, in schede.
 *
 * Non è il registro delle conversazioni — quello esiste già, sono i `.jsonl` di
 * Claude Code, ed è fatto per essere ripreso da una macchina. Questo è il
 * livello sopra: **scritto per essere letto da una persona**, una scheda per
 * argomento invece di un diario unico che cresce all'infinito.
 *
 * Serve a due cose insieme, e la seconda è quella che si sente in bolletta:
 * ritrovare cosa si era deciso senza riaprire la chat, e non ripagare in token
 * un contesto che si può leggere in dieci righe.
 *
 * Markdown con un'intestazione, perché una scheda deve restare utile anche il
 * giorno in cui questo programma non c'è più: si apre con qualunque editor, si
 * cerca con qualunque strumento, si mette in git accanto al codice che descrive.
 */

export type Scheda = {
  /** Il nome del file, senza cartella: è anche l'identità della scheda. */
  file: string
  titolo: string
  /** Quando è stata scritta l'ultima volta, in ISO. */
  quando: string
  /** Le etichette per ritrovarla: poche, scelte a mano. */
  tag: string[]
  /** La sessione da cui nasce, quando ne ha una. */
  sessione?: string
  /** Il corpo in Markdown, senza intestazione. */
  corpo: string
}

/** La cartella del quaderno dentro una cartella di lavoro. */
export const CARTELLA_QUADERNO = '.sierradeck'
export const SOTTOCARTELLA = 'quaderno'

/** Un titolo lungo non è un nome di file: si taglia dove smette di aiutare. */
const NOME_MAX = 60

/**
 * Il nome del file per un titolo.
 *
 * Solo caratteri che sopravvivono a Windows, a git e a un URL: un quaderno che
 * si può copiare da una macchina all'altra vale più di uno che conserva gli
 * accenti nei nomi.
 */
export function nomeFile(titolo: string, quando: string): string {
  const giorno = quando.slice(0, 10)
  const slug = titolo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, NOME_MAX)
  return `${giorno}-${slug === '' ? 'scheda' : slug}.md`
}

/**
 * Scrive la scheda in Markdown.
 *
 * L'intestazione è YAML fra due righe di `---`, la stessa convenzione che usano
 * gli editor di note: chi apre il file con un altro strumento la vede come una
 * scheda, non come rumore in cima al testo.
 */
export function componiScheda(s: Omit<Scheda, 'file'>): string {
  const tag = s.tag.length > 0 ? `tag: [${s.tag.map((t) => JSON.stringify(t)).join(', ')}]\n` : ''
  const sessione = s.sessione !== undefined ? `sessione: ${s.sessione}\n` : ''
  return `---\ntitolo: ${JSON.stringify(s.titolo)}\nquando: ${s.quando}\n${tag}${sessione}---\n\n${s.corpo.trim()}\n`
}

/**
 * Rilegge una scheda.
 *
 * Un file senza intestazione non viene rifiutato: è una nota scritta a mano, e
 * buttarla perché non ha il cappello sarebbe esattamente il contrario di quello
 * che serve. Diventa una scheda con il titolo preso dal nome del file.
 */
export function leggiScheda(file: string, testo: string): Scheda {
  const vuota: Scheda = {
    file,
    titolo: titoloDaNome(file),
    quando: '',
    tag: [],
    corpo: testo.trim()
  }
  if (!testo.startsWith('---')) return vuota

  const fine = testo.indexOf('\n---', 3)
  if (fine === -1) return vuota

  const intestazione = testo.slice(3, fine)
  const corpo = testo.slice(fine + 4).trim()
  const valore = (chiave: string): string | undefined => {
    const riga = intestazione.split('\n').find((r) => r.trim().startsWith(`${chiave}:`))
    if (riga === undefined) return undefined
    const grezzo = riga.slice(riga.indexOf(':') + 1).trim()
    if (grezzo === '') return undefined
    try {
      return grezzo.startsWith('"') ? (JSON.parse(grezzo) as string) : grezzo
    } catch {
      return grezzo
    }
  }

  const tagGrezzi = valore('tag') ?? ''
  const tag = tagGrezzi
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((t) => t.trim().replace(/^"|"$/g, ''))
    .filter((t) => t !== '')

  const sessione = valore('sessione')
  return {
    file,
    titolo: valore('titolo') ?? titoloDaNome(file),
    quando: valore('quando') ?? '',
    tag,
    ...(sessione !== undefined ? { sessione } : {}),
    corpo
  }
}

function titoloDaNome(file: string): string {
  return file
    .replace(/\.md$/i, '')
    .replace(/^\d{4}-\d{2}-\d{2}-/, '')
    .replace(/-/g, ' ')
}

/** Le schede in ordine di lettura: la più recente in cima, come si guarda. */
export function ordinaSchede(schede: Scheda[]): Scheda[] {
  return [...schede].sort((a, b) => {
    if (a.quando !== b.quando) return a.quando < b.quando ? 1 : -1
    return a.file < b.file ? 1 : -1
  })
}

/** Le schede che contengono tutte le parole cercate, nel titolo, nei tag o nel corpo. */
export function cerca(schede: Scheda[], domanda: string): Scheda[] {
  const parole = domanda.toLowerCase().split(/\s+/).filter((p) => p !== '')
  if (parole.length === 0) return schede
  return schede.filter((s) => {
    const dove = `${s.titolo} ${s.tag.join(' ')} ${s.corpo}`.toLowerCase()
    return parole.every((p) => dove.includes(p))
  })
}
