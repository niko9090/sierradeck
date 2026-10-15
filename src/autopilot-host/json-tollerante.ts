/**
 * Leggere il JSON scritto da un modello, anche quando non è JSON valido
 * (0.72.1).
 *
 * Il 15/10 due risposte dell'autopilota a Nicholas sono finite in «Non sono
 * riuscito a leggere la mia stessa risposta». Erano lunghe (6–7 mila
 * caratteri) e dentro `perLaChat` citavano le sue parole con le virgolette
 * dritte non protette: `messaggi "consegnato alle" che…`. `JSON.parse` si
 * ferma lì e si perdeva tutto, anche la `risposta`, che era corretta.
 *
 * Qui si ripara quello che un modello sbaglia davvero:
 * - virgolette dentro una stringa senza `\` (si capisce che non chiudono
 *   perché dopo non viene `,` + chiave, `}`, `]` o `:`);
 * - `\` seguita da un carattere che in JSON non è un escape (`\$`, `\.`, `\|`
 *   nei comandi);
 * - a capo e tabulazioni crudi dentro una stringa.
 * La lettura delle parentesi tiene conto delle stringhe: una `}` dentro un
 * comando non spezza più l'oggetto.
 */

const ESCAPE_VALIDI = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u'])

function saltaSpazi(s: string, i: number): number {
  while (i < s.length && /\s/.test(s[i]!)) i += 1
  return i
}

/** Dopo una `"` dentro una stringa: è la fine della stringa o una virgoletta del testo? */
function chiudeLaStringa(s: string, i: number): boolean {
  const j = saltaSpazi(s, i + 1)
  if (j >= s.length) return true
  const c = s[j]!
  if (c === '}' || c === ']' || c === ':') return true
  if (c !== ',') return false
  // Dopo la virgola deve cominciare un valore o una chiave JSON, non del testo.
  const k = saltaSpazi(s, j + 1)
  if (k >= s.length) return false
  return /["{[\]}\-0-9tfn]/.test(s[k]!)
}

/** Riscrive `s` come JSON valido dove sa farlo; il resto lo lascia com'è. */
export function riparaJson(s: string): string {
  let fuori = ''
  let inStringa = false
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i]!
    if (!inStringa) {
      fuori += c
      if (c === '"') inStringa = true
      continue
    }
    if (c === '\\') {
      const dopo = s[i + 1]
      if (dopo !== undefined && ESCAPE_VALIDI.has(dopo)) {
        if (dopo === 'u' && !/^[0-9a-fA-F]{4}$/.test(s.slice(i + 2, i + 6))) {
          fuori += '\\\\'
          continue
        }
        fuori += c + dopo
        i += 1
      } else {
        fuori += '\\\\'
      }
      continue
    }
    if (c === '"') {
      if (chiudeLaStringa(s, i)) {
        fuori += c
        inStringa = false
      } else {
        fuori += '\\"'
      }
      continue
    }
    if (c === '\n') fuori += '\\n'
    else if (c === '\r') fuori += '\\r'
    else if (c === '\t') fuori += '\\t'
    else if (c < ' ') fuori += `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`
    else fuori += c
  }
  return fuori
}

function comeOggetto(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : undefined
}

function prova(s: string): Record<string, unknown> | undefined {
  try {
    return comeOggetto(JSON.parse(s))
  } catch {
    try {
      return comeOggetto(JSON.parse(riparaJson(s)))
    } catch {
      return undefined
    }
  }
}

/**
 * Dove finisce l'oggetto che comincia in `inizio`, contando le parentesi
 * fuori dalle stringhe (con la stessa idea di «virgoletta che chiude» della
 * riparazione). `-1` se non si chiude.
 */
function fineOggetto(s: string, inizio: number): number {
  let profondita = 0
  let inStringa = false
  for (let i = inizio; i < s.length; i += 1) {
    const c = s[i]!
    if (inStringa) {
      if (c === '\\') i += 1
      else if (c === '"' && chiudeLaStringa(s, i)) inStringa = false
      continue
    }
    if (c === '"') inStringa = true
    else if (c === '{') profondita += 1
    else if (c === '}') {
      profondita -= 1
      if (profondita === 0) return i
    }
  }
  return -1
}

/**
 * L'**ultimo** oggetto JSON del testo che ha la chiave `chiave` (il modello
 * può ragionare prima, o mettere il JSON in un blocco ```json). `undefined`
 * se nessun oggetto si legge, nemmeno riparato.
 */
export function ultimoOggettoCon(testo: string, chiave: string): Record<string, unknown> | undefined {
  let trovato: Record<string, unknown> | undefined
  let i = testo.indexOf('{')
  while (i !== -1) {
    const fine = fineOggetto(testo, i)
    const letto = fine === -1 ? prova(testo.slice(i, testo.lastIndexOf('}') + 1)) : prova(testo.slice(i, fine + 1))
    if (letto !== undefined && chiave in letto) {
      trovato = letto
      // Si continua dopo questo oggetto: vince l'ultimo.
      i = fine === -1 ? -1 : testo.indexOf('{', fine + 1)
      continue
    }
    i = testo.indexOf('{', i + 1)
  }
  return trovato
}

/**
 * L'ultima risorsa: il testo del campo `chiave` preso a mano, anche se il
 * resto dell'oggetto non si legge. Il valore finisce alla virgoletta seguita
 * da `, "altraChiave":` o da `}`.
 */
export function campoTestoTollerante(testo: string, chiave: string): string | undefined {
  const re = new RegExp(`"${chiave}"\\s*:\\s*"`, 'g')
  let ultimo: string | undefined
  for (let m = re.exec(testo); m !== null; m = re.exec(testo)) {
    const inizio = m.index + m[0].length
    let i = inizio
    let fine = -1
    while (i < testo.length) {
      const c = testo[i]!
      if (c === '\\') { i += 2; continue }
      if (c === '"' && /^"\s*(,\s*"[A-Za-z_]+"\s*:|})/.test(testo.slice(i, i + 80))) { fine = i; break }
      i += 1
    }
    if (fine === -1) continue
    try {
      const v: unknown = JSON.parse(riparaJson(`"${testo.slice(inizio, fine)}"`))
      if (typeof v === 'string') ultimo = v
    } catch {
      // si prova il prossimo
    }
  }
  return ultimo
}
