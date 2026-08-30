/**
 * Un Markdown minimo, ridotto a nodi da disegnare.
 *
 * Non produce HTML: produce un albero di nodi che il renderer trasforma in
 * elementi React. È una scelta di **sicurezza**, non di comodità — le schede del
 * quaderno possono venire da un autopilota o da chiunque abbia scritto un `.md`
 * nella cartella, e un renderer che costruisse HTML da quel testo sarebbe una
 * porta d'ingresso per l'iniezione, la stessa classe di difetto chiusa nella
 * pagina del telefono. Qui il testo resta testo: React lo mette a schermo già
 * neutralizzato, e i link passano da `urlSicuro`, che lascia solo http/https,
 * mailto e i percorsi relativi — mai `javascript:` o `data:`.
 *
 * Il sottoinsieme copre ciò che una scheda usa davvero: titoli, grassetto,
 * corsivo, codice in riga e a blocco, elenchi, citazioni, link, righe
 * orizzontali. Quello che non riconosce resta testo, che è sempre meglio di un
 * errore.
 */

export type NodoInline =
  | { tipo: 'testo'; testo: string }
  | { tipo: 'forte'; figli: NodoInline[] }
  | { tipo: 'enfasi'; figli: NodoInline[] }
  | { tipo: 'codice'; testo: string }
  | { tipo: 'link'; testo: string; url: string }

export type NodoBlocco =
  | { tipo: 'titolo'; livello: number; figli: NodoInline[] }
  | { tipo: 'paragrafo'; figli: NodoInline[] }
  | { tipo: 'codice'; testo: string; lingua?: string }
  | { tipo: 'citazione'; figli: NodoBlocco[] }
  | { tipo: 'elenco'; ordinato: boolean; voci: NodoInline[][] }
  | { tipo: 'riga' }

/** Tutto cio' che un browser ignora dentro un indirizzo, e noi no. */
const CONTROLLO = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']', 'g')

/**
 * Un URL che si può seguire senza rischi.
 *
 * http/https/mailto e i percorsi relativi passano; qualunque altro **schema** —
 * `javascript:`, `data:`, e simili — diventa `undefined`, e chi chiama lo rende
 * come testo invece che come link. È la riga che impedisce a `[clic](javascript:…)`
 * di diventare un link che esegue codice.
 */
export function urlSicuro(url: string): string | undefined {
  // I caratteri di controllo si tolgono **prima** di guardare lo schema, e non
  // e' pignoleria: un browser li butta via quando interpreta un indirizzo,
  // quindi `java<TAB>script:` diventa `javascript:` al momento del clic. Qui
  // pero' non somigliava a uno schema — il controllo cade sui due punti — e
  // passava per percorso relativo, cioe' proprio la via che questa funzione
  // esiste per chiudere. Si guarda, e si restituisce, il testo ripulito.
  const u = url.replace(CONTROLLO, '').trim()
  if (u === '') return undefined
  if (/^(https?:|mailto:)/i.test(u)) return u
  // Uno schema qualunque (`nome:`) che non sia fra quelli sopra si rifiuta.
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return undefined
  // Nessuno schema: è un percorso relativo, si tiene.
  return u
}

const RIGA_LISTA = /^(\s*)([-*+]|\d+\.)\s+(.*)$/
const RIGA_TITOLO = /^(#{1,6})\s+(.*)$/
const RIGA_ORIZZONTALE = /^(-{3,}|\*{3,}|_{3,})\s*$/
const FENCE = /^```(\w*)\s*$/

/** Vero se la riga apre un blocco diverso da un paragrafo: serve a chiudere il paragrafo in corso. */
function iniziaBlocco(riga: string): boolean {
  return (
    FENCE.test(riga) ||
    RIGA_TITOLO.test(riga) ||
    RIGA_ORIZZONTALE.test(riga) ||
    /^>\s?/.test(riga) ||
    RIGA_LISTA.test(riga)
  )
}

/** Scompone il testo in riga in grassetto/corsivo/codice/link, il resto è testo. */
export function analizzaInline(testo: string): NodoInline[] {
  const nodi: NodoInline[] = []
  let buffer = ''
  const scarica = (): void => {
    if (buffer !== '') {
      nodi.push({ tipo: 'testo', testo: buffer })
      buffer = ''
    }
  }
  let i = 0
  while (i < testo.length) {
    const resto = testo.slice(i)
    // Il codice in riga per primo: dentro non si interpreta altro.
    const codice = /^`([^`]+)`/.exec(resto)
    if (codice) {
      scarica()
      nodi.push({ tipo: 'codice', testo: codice[1]! })
      i += codice[0].length
      continue
    }
    const link = /^\[([^\]]*)\]\(([^)\s]+)\)/.exec(resto)
    if (link) {
      scarica()
      const url = urlSicuro(link[2]!)
      if (url !== undefined) nodi.push({ tipo: 'link', testo: link[1]!, url })
      // Un link a uno schema non sicuro non sparisce: resta come lo si era scritto.
      else nodi.push({ tipo: 'testo', testo: link[0] })
      i += link[0].length
      continue
    }
    // Grassetto prima del corsivo: `**` va riconosciuto prima del singolo `*`.
    const forte = /^\*\*([^*]+)\*\*/.exec(resto)
    if (forte) {
      scarica()
      nodi.push({ tipo: 'forte', figli: analizzaInline(forte[1]!) })
      i += forte[0].length
      continue
    }
    const enfasi = /^(?:\*([^*\n]+)\*|_([^_\n]+)_)/.exec(resto)
    if (enfasi) {
      scarica()
      nodi.push({ tipo: 'enfasi', figli: analizzaInline((enfasi[1] ?? enfasi[2])!) })
      i += enfasi[0].length
      continue
    }
    buffer += testo[i]
    i += 1
  }
  scarica()
  return nodi
}

/** Trasforma una scheda in Markdown in blocchi da disegnare. Non solleva mai. */
export function analizzaMarkdown(testo: string): NodoBlocco[] {
  const righe = testo.replace(/\r\n/g, '\n').split('\n')
  const blocchi: NodoBlocco[] = []
  let i = 0
  while (i < righe.length) {
    const riga = righe[i] ?? ''
    if (riga.trim() === '') {
      i += 1
      continue
    }

    const fence = FENCE.exec(riga)
    if (fence) {
      const linee: string[] = []
      i += 1
      while (i < righe.length && !/^```\s*$/.test(righe[i] ?? '')) {
        linee.push(righe[i] ?? '')
        i += 1
      }
      i += 1 // la riga di chiusura
      blocchi.push({
        tipo: 'codice',
        testo: linee.join('\n'),
        ...(fence[1] !== undefined && fence[1] !== '' ? { lingua: fence[1] } : {})
      })
      continue
    }

    const titolo = RIGA_TITOLO.exec(riga)
    if (titolo) {
      blocchi.push({ tipo: 'titolo', livello: titolo[1]!.length, figli: analizzaInline(titolo[2]!.trim()) })
      i += 1
      continue
    }

    if (RIGA_ORIZZONTALE.test(riga)) {
      blocchi.push({ tipo: 'riga' })
      i += 1
      continue
    }

    if (/^>\s?/.test(riga)) {
      const linee: string[] = []
      while (i < righe.length && /^>\s?/.test(righe[i] ?? '')) {
        linee.push((righe[i] ?? '').replace(/^>\s?/, ''))
        i += 1
      }
      blocchi.push({ tipo: 'citazione', figli: analizzaMarkdown(linee.join('\n')) })
      continue
    }

    const lista = RIGA_LISTA.exec(riga)
    if (lista) {
      const ordinato = /\d+\./.test(lista[2]!)
      const voci: NodoInline[][] = []
      while (i < righe.length) {
        const m = RIGA_LISTA.exec(righe[i] ?? '')
        if (m === null) break
        // Un elenco resta dello stesso tipo: passare da puntato a numerato apre un
        // elenco nuovo, come ci si aspetta vedendolo.
        if (/\d+\./.test(m[2]!) !== ordinato) break
        voci.push(analizzaInline(m[3]!))
        i += 1
      }
      blocchi.push({ tipo: 'elenco', ordinato, voci })
      continue
    }

    // Un paragrafo: le righe non vuote fino al prossimo blocco o alla riga vuota.
    const linee: string[] = []
    while (i < righe.length) {
      const r = righe[i] ?? ''
      if (r.trim() === '' || iniziaBlocco(r)) break
      linee.push(r)
      i += 1
    }
    if (linee.length > 0) blocchi.push({ tipo: 'paragrafo', figli: analizzaInline(linee.join(' ')) })
    else i += 1
  }
  return blocchi
}
