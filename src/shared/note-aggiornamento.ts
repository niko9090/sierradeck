import { confrontaVersioni } from './novita'

/**
 * Le note di un aggiornamento, per la finestra di «Installa» (0.39.0).
 *
 * Nicholas, 02/10: «quando si trova un aggiornamento invece che installa e
 * riavvia esce un pulsante installa che apre una finestra dove si vede il
 * change log di quello che cambia». Le note sono il corpo delle release su
 * GitHub, che a sua volta e' scritto dalle voci di `novita.ts` quando si
 * pubblica: la finestra mostra **quello che e' stato scritto per lui**, non
 * l'elenco dei cambi tecnici.
 *
 * Il corpo e' Markdown scritto da noi, ma passa da internet: qui non diventa
 * **mai** HTML. Si scompone in blocchi e pezzi di testo semplice, e ognuno dei
 * tre schermi (PC, pagina servita, app) li disegna con i suoi mezzi senza
 * interpretare niente. Un `<script>` nel corpo resta testo — anzi sparisce,
 * perche' le etichette HTML si tolgono — e un link e' cliccabile solo se porta
 * a github.com.
 */

/** Un pezzo di riga, con il suo stile. Mai HTML: solo testo e qualche segno. */
export type Pezzo = {
  testo: string
  grassetto?: true
  corsivo?: true
  codice?: true
  /** Solo un indirizzo https://github.com/…, gia' controllato da `linkAmmesso`. */
  link?: string
}

export type Blocco =
  | { tipo: 'titolo'; pezzi: Pezzo[] }
  | { tipo: 'paragrafo'; pezzi: Pezzo[] }
  | { tipo: 'elenco'; voci: Pezzo[][] }
  | { tipo: 'codice'; testo: string }

/** Il testo grezzo di una versione, com'e' scritto nella release. */
export type NotaVersione = { versione: string; testo: string }

/** Una versione pronta da disegnare. */
export type NotaResa = { versione: string; blocchi: Blocco[] }

/** Quello che la finestra di «Installa» mostra, sul PC e sul telefono. */
export type NoteAggiornamento = {
  /** La versione che si installerebbe. */
  versione: string
  /** Quella che c'e' adesso. */
  installata: string
  /** Dalla piu' recente: la nuova e poi quelle saltate. */
  note: NotaResa[]
  /** Da dove vengono: le release di GitHub, l'aggiornamento stesso, o nessuna delle due. */
  fonte: 'github' | 'aggiornamento' | 'nessuna'
  /** La pagina dove leggerle per intero, sempre. */
  dove: string
  /** Cosa manca, quando manca qualcosa: detto per esteso, mai una finestra vuota. */
  avviso?: string
}

export const PAGINA_VERSIONI = 'https://github.com/niko9090/sierradeck/releases'

const VERSIONE = /^\d+\.\d+\.\d+$/

/** `v0.39.0` → `0.39.0`; un'etichetta che non e' una versione → `undefined`. */
export function versioneDaTag(tag: string): string | undefined {
  const v = tag.trim().replace(/^v/i, '')
  return VERSIONE.test(v) ? v : undefined
}

/**
 * Le note che servono: dopo quella installata e fino alla nuova comprese,
 * dalla piu' recente. Una versione che compare due volte vale la prima volta
 * (chi chiama mette davanti la fonte migliore); una senza testo non c'e'.
 */
export function noteFra(note: NotaVersione[], installata: string, nuova: string): NotaVersione[] {
  const viste = new Set<string>()
  const scelte: NotaVersione[] = []
  for (const n of note) {
    if (!VERSIONE.test(n.versione) || viste.has(n.versione) || n.testo.trim() === '') continue
    if (confrontaVersioni(n.versione, installata) <= 0 || confrontaVersioni(n.versione, nuova) > 0) continue
    viste.add(n.versione)
    scelte.push(n)
  }
  return scelte.sort((a, b) => confrontaVersioni(b.versione, a.versione))
}

/**
 * Un indirizzo si puo' aprire solo se e' https e porta a github.com: e' li'
 * che vivono le release e il codice. Qualunque altro resta testo.
 */
export function linkAmmesso(url: string): string | undefined {
  try {
    const u = new URL(url.trim())
    if (u.protocol !== 'https:') return undefined
    if (u.hostname !== 'github.com' && u.hostname !== 'www.github.com') return undefined
    if (u.username !== '' || u.password !== '') return undefined
    return u.href
  } catch {
    return undefined
  }
}

/** Il segno di uno stile, per unire i pezzi vicini uguali. */
function firma(p: Pezzo): string {
  return `${p.grassetto === true ? 'g' : ''}${p.corsivo === true ? 'c' : ''}${p.codice === true ? 'k' : ''}|${p.link ?? ''}`
}

function aggiungi(pezzi: Pezzo[], p: Pezzo): void {
  if (p.testo === '') return
  const ultimo = pezzi[pezzi.length - 1]
  if (ultimo !== undefined && firma(ultimo) === firma(p)) ultimo.testo += p.testo
  else pezzi.push(p)
}

function stile(testo: string, g: boolean, c: boolean, link?: string): Pezzo {
  return { testo, ...(g ? { grassetto: true as const } : {}), ...(c ? { corsivo: true as const } : {}), ...(link !== undefined ? { link } : {}) }
}

/** La punteggiatura in coda a un indirizzo nudo appartiene alla frase, non all'indirizzo. */
const CODA_URL = /[).,;:!?»”’'"]+$/

/**
 * Una riga di Markdown in pezzi: `**grassetto**`, `*corsivo*`, `` `codice` ``,
 * `[testo](indirizzo)` e gli indirizzi nudi. Quello che non si riconosce resta
 * testo cosi' com'e'.
 */
export function analizzaRiga(riga: string): Pezzo[] {
  const pezzi: Pezzo[] = []
  let g = false
  let c = false
  let buf = ''
  const svuota = (): void => { aggiungi(pezzi, stile(buf, g, c)); buf = '' }
  let i = 0
  while (i < riga.length) {
    const ch = riga[i]!
    const resto = riga.slice(i)
    if (ch === '\\' && i + 1 < riga.length && /[\\`*_[\]()#+\-.!>~]/.test(riga[i + 1]!)) {
      buf += riga[i + 1]
      i += 2
      continue
    }
    if (ch === '`') {
      const fine = riga.indexOf('`', i + 1)
      if (fine > i + 1) {
        svuota()
        aggiungi(pezzi, { testo: riga.slice(i + 1, fine), codice: true })
        i = fine + 1
        continue
      }
    }
    if (resto.startsWith('**') || resto.startsWith('__')) {
      const segno = resto.slice(0, 2)
      // Si apre solo se si chiude: due asterischi spaiati restano testo.
      if (g || riga.indexOf(segno, i + 2) > i + 2) {
        svuota()
        g = !g
        i += 2
        continue
      }
    }
    if (ch === '*' && (c || (riga[i + 1] !== ' ' && riga.indexOf('*', i + 1) > i + 1))) {
      svuota()
      c = !c
      i += 1
      continue
    }
    if (ch === '[') {
      const m = /^\[([^\]]*)\]\(([^)\s]*)(?:\s+"[^"]*")?\)/.exec(resto)
      if (m !== null) {
        svuota()
        const link = linkAmmesso(m[2] ?? '')
        for (const dentro of analizzaRiga(m[1] ?? '')) {
          aggiungi(pezzi, {
            ...dentro,
            ...(g && dentro.grassetto === undefined ? { grassetto: true as const } : {}),
            ...(c && dentro.corsivo === undefined ? { corsivo: true as const } : {}),
            ...(link !== undefined && dentro.codice === undefined ? { link } : {})
          })
        }
        i += m[0].length
        continue
      }
    }
    if ((ch === 'h' || ch === 'H') && /^https?:\/\//i.test(resto) && (i === 0 || /[\s(<]/.test(riga[i - 1]!))) {
      const tutto = /^\S+/.exec(resto)![0]
      const url = tutto.replace(CODA_URL, '')
      const link = linkAmmesso(url)
      svuota()
      aggiungi(pezzi, stile(url, g, c, link))
      i += url.length
      continue
    }
    buf += ch
    i += 1
  }
  svuota()
  return pezzi
}

/** Le etichette HTML e i commenti si tolgono: il loro testo resta, il resto no. */
function senzaHtml(testo: string): string {
  return testo.replace(/<!--[\s\S]*?-->/g, '').replace(/<\/?[A-Za-z][^>]*>/g, '')
}

const VOCE = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/
const TITOLO = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/
const RIGA_ORIZZONTALE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/
const RECINTO = /^\s*(```|~~~)/

/**
 * Un testo Markdown in blocchi: titoli, paragrafi, elenchi e codice.
 *
 * Le voci separate da una riga vuota restano nello **stesso** elenco: le
 * release sono scritte cosi' («- **…** …», riga vuota, «- **…** …»), e
 * spezzarle avrebbe fatto un elenco per voce.
 */
export function analizzaMarkdown(testo: string): Blocco[] {
  const righe = senzaHtml(testo.replace(/\r\n?/g, '\n')).split('\n')
  const blocchi: Blocco[] = []
  let paragrafo: string[] = []
  let elenco: string[] | undefined
  let codice: string[] | undefined
  let vuotaDopoElenco = false

  const chiudiParagrafo = (): void => {
    const t = paragrafo.join(' ').trim()
    if (t !== '') blocchi.push({ tipo: 'paragrafo', pezzi: analizzaRiga(t) })
    paragrafo = []
  }
  const chiudiElenco = (): void => {
    if (elenco !== undefined && elenco.length > 0) {
      blocchi.push({ tipo: 'elenco', voci: elenco.map((v) => analizzaRiga(v.trim())) })
    }
    elenco = undefined
    vuotaDopoElenco = false
  }

  for (const riga of righe) {
    if (codice !== undefined) {
      if (RECINTO.test(riga)) {
        blocchi.push({ tipo: 'codice', testo: codice.join('\n') })
        codice = undefined
      } else {
        codice.push(riga)
      }
      continue
    }
    if (RECINTO.test(riga)) {
      chiudiParagrafo()
      chiudiElenco()
      codice = []
      continue
    }
    if (riga.trim() === '') {
      chiudiParagrafo()
      if (elenco !== undefined) vuotaDopoElenco = true
      continue
    }
    const voce = VOCE.exec(riga)
    if (voce !== null && !RIGA_ORIZZONTALE.test(riga)) {
      chiudiParagrafo()
      if (elenco === undefined) elenco = []
      elenco.push(voce[1] ?? '')
      vuotaDopoElenco = false
      continue
    }
    // Una riga rientrata subito dopo una voce la continua.
    if (elenco !== undefined && !vuotaDopoElenco && /^\s{2,}\S/.test(riga)) {
      elenco[elenco.length - 1] += ` ${riga.trim()}`
      continue
    }
    chiudiElenco()
    if (RIGA_ORIZZONTALE.test(riga)) {
      chiudiParagrafo()
      continue
    }
    const titolo = TITOLO.exec(riga)
    if (titolo !== null) {
      chiudiParagrafo()
      blocchi.push({ tipo: 'titolo', pezzi: analizzaRiga(titolo[1] ?? '') })
      continue
    }
    paragrafo.push(riga.replace(/^\s*>\s?/, '').trim())
  }
  if (codice !== undefined) blocchi.push({ tipo: 'codice', testo: codice.join('\n') })
  chiudiParagrafo()
  chiudiElenco()
  return blocchi
}

const ENTITA: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decodificaEntita(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (tutto, nome: string) => {
    if (nome[0] === '#') {
      const n = nome[1] === 'x' || nome[1] === 'X' ? Number.parseInt(nome.slice(2), 16) : Number.parseInt(nome.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''
    }
    return ENTITA[nome.toLowerCase()] ?? tutto
  })
}

/**
 * Le note come le porta electron-updater (HTML gia' reso da GitHub) di nuovo
 * in Markdown semplice, perche' passino dalla stessa strada sicura: grassetti,
 * voci, paragrafi e link tornano segni, ogni altra etichetta sparisce.
 */
export function markdownDaHtml(html: string): string {
  const conSegni = html
    .replace(/\r\n?/g, '\n')
    .replace(/\n/g, ' ')
    .replace(/<a\s[^>]*href\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_t, url: string, dentro: string) => `[${dentro.replace(/<[^>]*>/g, '')}](${url})`)
    .replace(/<\/?(strong|b)\b[^>]*>/gi, '**')
    .replace(/<\/?(em|i)\b[^>]*>/gi, '*')
    .replace(/<\/?code\b[^>]*>/gi, '`')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<h[1-6]\b[^>]*>/gi, '\n\n## ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|ul|ol|h[1-6]|li|blockquote|pre)>/gi, '\n')
    .replace(/<p\b[^>]*>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
  return decodificaEntita(conSegni)
    .split('\n')
    .map((r) => r.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Le release dall'API pubblica di GitHub: solo quelle vere (niente bozze, niente prove). */
export function daRilasciGithub(json: unknown): NotaVersione[] {
  if (!Array.isArray(json)) return []
  const note: NotaVersione[] = []
  for (const r of json as unknown[]) {
    if (typeof r !== 'object' || r === null) continue
    const x = r as { tag_name?: unknown; body?: unknown; draft?: unknown; prerelease?: unknown }
    if (x.draft === true || x.prerelease === true || typeof x.tag_name !== 'string') continue
    const versione = versioneDaTag(x.tag_name)
    if (versione === undefined) continue
    note.push({ versione, testo: typeof x.body === 'string' ? x.body : '' })
  }
  return note
}

/**
 * Le `releaseNotes` di electron-updater: una stringa (solo la versione nuova)
 * o, con `fullChangelog`, un elenco `{ version, note }` di tutte quelle fra
 * la installata e la nuova. In tutti e due i casi HTML, riportato a Markdown.
 */
export function daNoteAggiornamento(releaseNotes: unknown, nuova: string): NotaVersione[] {
  if (typeof releaseNotes === 'string') return [{ versione: nuova, testo: markdownDaHtml(releaseNotes) }]
  if (!Array.isArray(releaseNotes)) return []
  const note: NotaVersione[] = []
  for (const r of releaseNotes as unknown[]) {
    if (typeof r !== 'object' || r === null) continue
    const x = r as { version?: unknown; note?: unknown }
    const versione = typeof x.version === 'string' ? versioneDaTag(x.version) : undefined
    if (versione === undefined) continue
    note.push({ versione, testo: typeof x.note === 'string' ? markdownDaHtml(x.note) : '' })
  }
  return note
}

/**
 * Raccoglie le note per la finestra di «Installa».
 *
 * Prima le release di GitHub (Markdown originale, tutte le versioni saltate),
 * poi quello che l'aggiornamento porta con se', per le versioni che mancano.
 * Se non c'e' niente si dice dove leggerle: la finestra non resta mai vuota e
 * muta, e non impedisce di installare.
 */
export async function raccogliNote(p: {
  installata: string
  nuova: string
  /** Le release dall'API di GitHub, il JSON cosi' com'e'. Puo' fallire. */
  rilasci?: () => Promise<unknown>
  /** `info.releaseNotes` di electron-updater, se c'e'. */
  releaseNotes?: unknown
  dove?: string
}): Promise<NoteAggiornamento> {
  const dove = p.dove ?? PAGINA_VERSIONI
  let daGithub: NotaVersione[] = []
  let guastoGithub: string | undefined
  if (p.rilasci !== undefined) {
    try {
      daGithub = noteFra(daRilasciGithub(await p.rilasci()), p.installata, p.nuova)
    } catch (err) {
      guastoGithub = err instanceof Error ? err.message : String(err)
    }
  }
  const daAggiornamento = noteFra(daNoteAggiornamento(p.releaseNotes, p.nuova), p.installata, p.nuova)
  const unite = noteFra([...daGithub, ...daAggiornamento], p.installata, p.nuova)
  const fonte: NoteAggiornamento['fonte'] = daGithub.length > 0 ? 'github' : unite.length > 0 ? 'aggiornamento' : 'nessuna'
  const note = unite.map((n) => ({ versione: n.versione, blocchi: analizzaMarkdown(n.testo) }))
  let avviso: string | undefined
  if (unite.length === 0) {
    avviso = `Non sono riuscito a leggere le note della ${p.nuova}${guastoGithub !== undefined ? ' (GitHub non ha risposto)' : ''}. Le trovi scritte per esteso nella pagina delle versioni: ${dove}. Puoi installare lo stesso: le note servono a sapere cosa cambia, non sono un permesso.`
  } else if (!unite.some((n) => n.versione === p.nuova)) {
    avviso = `Della ${p.nuova} non ho trovato le note: qui sotto ci sono quelle delle versioni prima. Le trovi per esteso nella pagina delle versioni: ${dove}.`
  }
  return { versione: p.nuova, installata: p.installata, note, fonte, dove, ...(avviso !== undefined ? { avviso } : {}) }
}

/**
 * Le novità scritte in `novita.ts` (quelle della versione installata, dal
 * menu) nella stessa forma: ogni riga diventa una voce d'elenco.
 */
export function noteDaNovita(novita: { versione: string; righe: string[] }[]): NotaResa[] {
  return novita.map((n) => ({ versione: n.versione, blocchi: analizzaMarkdown(n.righe.map((r) => `- ${r}`).join('\n')) }))
}
