import { isAbsolute, normalize, resolve, sep } from 'node:path'

/**
 * I divieti dell'autopilota, fatti rispettare dal **programma**, non dal modello.
 *
 * Decisione di Nicholas (30/09): l'autopilota fa da solo commit, merge dei suoi
 * rami, push e pubblicazione; restano comunque vietati — e li deve bloccare il
 * programma — toccare chat e autopiloti non suoi, «Porta qui», uscire
 * dall'account, cambiare le preferenze, cancellare file fuori dalle sue cartelle.
 *
 * Due porte:
 * 1. **le mosse del supervisore** (`giudicaMossa`): l'elenco di quello che puo'
 *    chiedere al programma. Tutto cio' che non e' nell'elenco e' rifiutato, e
 *    le mosse vietate sono nominate apposta perche' il rifiuto dica perche';
 * 2. **gli strumenti delle chat che governa** (`giudicaStrumento`), dall'hook
 *    PreToolUse di Claude Code: un comando che cancella fuori dalle sue
 *    cartelle, o che parla al programma per fare una cosa vietata, viene negato
 *    prima di partire.
 */

// ─── Le mosse del supervisore ─────────────────────────────────────────────

export type Mossa =
  | { tipo: 'apriChat'; compito: string }
  | { tipo: 'chiudiChat'; chat: string }
  | { tipo: 'quaderno'; titolo: string; corpo: string }
  | { tipo: 'vietata'; nome: string }

/** Le mosse che il programma rifiuta sempre, con il nome che il modello potrebbe usare. */
export const MOSSE_VIETATE: Record<string, string> = {
  portaQui: '«Porta qui» dal Drive cambia i file di questo computer con quelli di un altro: lo decide Nicholas',
  esciAccount: 'uscire dall’account toglie l’accesso a tutto il programma',
  entraAccount: 'l’account lo sceglie Nicholas',
  preferenze: 'le preferenze del programma sono di Nicholas',
  chiudiChatAltrui: 'le chat che non sono sue non si toccano',
  scriviChatAltrui: 'le chat che non sono sue non si toccano',
  fermaAutopilota: 'gli altri autopiloti non sono suoi',
  eliminaAutopilota: 'gli altri autopiloti non sono suoi',
  cambiaWorkspace: 'il workspace davanti è quello su cui lavora Nicholas',
  eliminaWorkspace: 'i workspace sono di Nicholas',
  cancellaFile: 'i file si cancellano solo dentro le sue cartelle, dalla chat'
}

/** Legge le mosse dal JSON del supervisore: le sconosciute diventano `vietata`. */
export function leggiMosse(raw: unknown): Mossa[] {
  if (!Array.isArray(raw)) return []
  const mosse: Mossa[] = []
  for (const m of raw.slice(0, 10)) {
    if (typeof m !== 'object' || m === null) continue
    const o = m as Record<string, unknown>
    const tipo = typeof o.tipo === 'string' ? o.tipo : ''
    const testo = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
    if (tipo === 'apriChat' && testo(o.compito) !== '') mosse.push({ tipo, compito: testo(o.compito).slice(0, 2000) })
    else if (tipo === 'chiudiChat' && testo(o.chat) !== '') mosse.push({ tipo, chat: testo(o.chat) })
    else if (tipo === 'quaderno' && testo(o.titolo) !== '' && testo(o.corpo) !== '') {
      mosse.push({ tipo, titolo: testo(o.titolo).slice(0, 200), corpo: testo(o.corpo).slice(0, 20_000) })
    } else if (tipo !== '') mosse.push({ tipo: 'vietata', nome: tipo })
  }
  return mosse
}

export type Giudizio = { ok: true } | { ok: false; motivo: string }

/**
 * Si puo' fare? `sueChat` sono gli id delle chat di questo autopilota: chiudere
 * una chat che non e' fra quelle e' toccare una chat altrui.
 */
export function giudicaMossa(m: Mossa, sueChat: string[]): Giudizio {
  if (m.tipo === 'vietata') {
    return { ok: false, motivo: MOSSE_VIETATE[m.nome] ?? `«${m.nome}» non è fra le mosse permesse` }
  }
  if (m.tipo === 'chiudiChat' && !sueChat.includes(m.chat)) {
    return { ok: false, motivo: MOSSE_VIETATE.chiudiChatAltrui as string }
  }
  return { ok: true }
}

// ─── Gli strumenti delle chat che governa (hook PreToolUse) ───────────────

export type RichiestaStrumento = {
  tool_name?: unknown
  tool_input?: unknown
  cwd?: unknown
}

/** Le rotte del programma che fanno cose vietate: una chat non ci deve bussare. */
const ROTTE_VIETATE = [
  '/api/drive/porta', '/api/drive/portaWorkspace', '/api/account/esci', '/api/account/entra',
  '/api/preferenze', '/api/workspace/elimina', '/api/autopilota/elimina', '/api/autopilota/ferma',
  '/api/chat/chiudi'
]

/** I comandi che cancellano, e dopo i quali vengono i percorsi. */
const CANCELLA = /(^|[\s;&|(])(rm|rmdir|del|erase|rd|remove-item|ri|unlink|shred)(?=\s|$)/i
const CANCELLA_GIT = /\bgit\s+(clean\b|worktree\s+remove\b|rm\b)/i

/** Spezza un comando in parole, tenendo insieme le virgolette. */
function parole(comando: string): string[] {
  const out: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(comando)) !== null) out.push(m[1] ?? m[2] ?? m[3] ?? '')
  return out
}

/** `a` sta dentro `b` (o e' `b`)? Su Windows senza distinguere maiuscole. */
export function dentro(a: string, b: string): boolean {
  const piega = (x: string): string => {
    const n = normalize(x).replace(/[\\/]+$/, '')
    return process.platform === 'win32' || /^[a-zA-Z]:/.test(n) ? n.toLowerCase() : n
  }
  const pa = piega(a)
  const pb = piega(b)
  return pa === pb || pa.startsWith(pb + sep) || pa.startsWith(pb + '/') || pa.startsWith(pb + '\\')
}

/** I percorsi che un comando di cancellazione colpisce (opzioni escluse). */
export function bersagliCancellazione(comando: string, cwd: string): string[] {
  const bersagli: string[] = []
  // Ogni pezzo della catena (;, &&, ||, |) si guarda da solo.
  for (const pezzo of comando.split(/;|&&|\|\||\|/)) {
    const p = pezzo.trim()
    if (!CANCELLA.test(p) && !CANCELLA_GIT.test(p)) continue
    const ws = parole(p)
    const i = ws.findIndex((w) => /^(rm|rmdir|del|erase|rd|remove-item|ri|unlink|shred)$/i.test(w))
    const gitI = ws.findIndex((w) => w === 'git')
    const dopo = i >= 0 ? ws.slice(i + 1) : ws.slice(gitI + 2)
    const percorsi = dopo.filter((w) => w !== '' && !w.startsWith('-') && !/^\/[a-z]$/i.test(w) && w !== 'remove')
    // `git clean` senza percorso pulisce la cartella in cui si e'.
    if (percorsi.length === 0) bersagli.push(cwd)
    for (const w of percorsi) {
      const pulito = w.replace(/^~(?=[\\/]|$)/, process.env.USERPROFILE ?? process.env.HOME ?? '~')
      bersagli.push(isAbsolute(pulito) || /^[a-zA-Z]:/.test(pulito) ? pulito : resolve(cwd, pulito))
    }
  }
  return bersagli
}

/**
 * Il giudizio su uno strumento che una chat governata sta per usare.
 *
 * `ammesse` sono le cartelle dell'autopilota: la sua cartella di lavoro e i
 * worktree delle sue chat. Si nega:
 * - una cancellazione (rm, del, Remove-Item, git clean, git worktree remove…)
 *   che colpisce qualcosa **fuori** da quelle cartelle, o una cartella intera
 *   di lavoro (cancellare il progetto non e' «dentro» il progetto);
 * - una chiamata alle rotte del programma che fanno cose vietate (Porta qui,
 *   account, preferenze, chat e autopiloti altrui).
 * Tutto il resto passa: il lavoro vero lo decide la chat.
 */
export function giudicaStrumento(r: RichiestaStrumento, ammesse: string[]): Giudizio {
  const nome = typeof r.tool_name === 'string' ? r.tool_name : ''
  const input = (typeof r.tool_input === 'object' && r.tool_input !== null ? r.tool_input : {}) as Record<string, unknown>
  const cwd = typeof r.cwd === 'string' && r.cwd !== '' ? r.cwd : (ammesse[0] ?? process.cwd())
  if (nome !== 'Bash' && nome !== 'PowerShell') return { ok: true }
  const comando = typeof input.command === 'string' ? input.command : ''
  if (comando === '') return { ok: true }

  for (const rotta of ROTTE_VIETATE) {
    if (comando.includes(rotta) && /(curl|Invoke-WebRequest|Invoke-RestMethod|iwr|irm|wget|fetch)/i.test(comando)) {
      return { ok: false, motivo: `SierraDeck blocca questa chiamata: ${rotta} fa una cosa che l'autopilota non può fare da solo (vedi i divieti decisi da Nicholas).` }
    }
  }

  for (const b of bersagliCancellazione(comando, cwd)) {
    const radice = ammesse.some((c) => dentro(c, b))
    const dentroUna = ammesse.some((c) => dentro(b, c))
    if (!dentroUna || radice) {
      return {
        ok: false,
        motivo: `SierraDeck blocca questa cancellazione: «${b}» è ${radice ? 'una cartella di lavoro intera' : 'fuori dalle cartelle di questo autopilota'} (${ammesse.join(', ')}). Si cancellano solo file dentro le sue cartelle.`
      }
    }
  }
  return { ok: true }
}

/** La risposta che Claude Code si aspetta da un hook PreToolUse. */
export function rispostaPreTool(g: Giudizio): unknown {
  if (g.ok) return {}
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: g.motivo
    }
  }
}
