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

/**
 * I verbi che cancellano, **in posizione di comando** (0.37.1).
 *
 * Fino alla 0.37.0 si cercavano come parola ovunque nel pezzo: anche dentro
 * le virgolette, gli heredoc, gli argomenti di grep/curl/node -e e gli URL.
 * Bastava un test con scritto «il momento del fermo» dentro un heredoc perche'
 * «del» diventasse il comando di Windows e le parole dopo — fino a una rotta
 * dell'API, «/autopiloti/ap-fermo/archivia» — i percorsi da cancellare. Ora un
 * comando si legge come lo legge la shell: conta il **primo** comando di ogni
 * pezzo (dopo sudo, env, VAR=…, xargs…), il testo citato e gli heredoc sono
 * dati, e gli URL non sono percorsi. Il testo che la shell **esegue** — `bash -c
 * "…"`, `powershell -Command "…"`, `$(…)`, un heredoc dato a una shell —
 * si legge di nuovo come comando: niente buchi.
 */
const VERBI_CANCELLA = new Set(['rm', 'rmdir', 'del', 'erase', 'rd', 'remove-item', 'ri', 'unlink', 'shred', 'rimraf'])
/** Le shell: il loro `-c` (o un heredoc dato a loro) e' un altro comando. */
const SHELL = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'cmd', 'powershell', 'pwsh', 'wsl'])
/** Quelli che lanciano il comando che li segue. */
const INVOLUCRI = new Set(['sudo', 'env', 'nohup', 'time', 'command', 'exec', 'nice', 'xargs', 'doas', 'stdbuf', 'timeout'])
/** I loro argomenti con un valore («-n 10», «-I {}»). */
const CON_VALORE = new Set(['-n', '-i', '-p', '-d', '-l', '-u', '-g', '-s', '-c', '-e'])

type Parola = { testo: string; citata: boolean }
type Comando = { parole: Parola[]; heredoc: string[] }

/**
 * Spezza il testo in comandi come farebbe la shell: virgolette, `\`, `;`,
 * `&`, `|`, parentesi, a capo, heredoc. Le sostituzioni (`$(…)`, i backtick
 * di bash) finiscono in `annidati`, da rileggere come comandi.
 */
function leggiComandi(src: string, powershell: boolean): { comandi: Comando[]; annidati: string[] } {
  const comandi: Comando[] = []
  const annidati: string[] = []
  let parole: Parola[] = []
  let heredoc: string[] = []
  let attesi: { fine: string; tab: boolean }[] = []
  let buf = ''
  let citata = false
  let inParola = false
  const chiudiParola = (): void => {
    if (inParola) parole.push({ testo: buf, citata })
    buf = ''; citata = false; inParola = false
  }
  const chiudiComando = (): void => {
    chiudiParola()
    if (parole.length > 0 || heredoc.length > 0) comandi.push({ parole, heredoc })
    parole = []; heredoc = []
  }
  /** Da `(` all'aperta, la `)` che la chiude (con le virgolette in mezzo). */
  const finePar = (da: number): number => {
    let p = 0
    for (let j = da; j < src.length; j++) {
      const c = src[j]
      if (c === "'") { const k = src.indexOf("'", j + 1); if (k < 0) return src.length; j = k; continue }
      if (c === '(') p++
      else if (c === ')' && --p === 0) return j
    }
    return src.length
  }
  const esc = powershell ? '`' : '\\'
  let i = 0
  while (i < src.length) {
    const c = src[i] as string
    // In bash la `\` toglie il significato solo ai caratteri speciali: davanti
    // a una lettera resta, ed e' il separatore di un percorso di Windows.
    if (c === esc && i + 1 < src.length && (powershell || /[\s'"\\;&|()<>$`{}*?#~]/.test(src[i + 1] as string))) { buf += src[i + 1]; inParola = true; i += 2; continue }
    if (c === "'") {
      const k = src.indexOf("'", i + 1)
      const fine = k < 0 ? src.length : k
      buf += src.slice(i + 1, fine); citata = true; inParola = true; i = fine + 1; continue
    }
    if (c === '"') {
      let j = i + 1
      while (j < src.length && src[j] !== '"') {
        if (src[j] === esc) { buf += src[j + 1] ?? ''; j += 2; continue }
        if (src[j] === '$' && src[j + 1] === '(') { const f = finePar(j + 1); annidati.push(src.slice(j + 2, f)); buf += src.slice(j, f + 1); j = f + 1; continue }
        if (!powershell && src[j] === '`') { const k = src.indexOf('`', j + 1); const f = k < 0 ? src.length : k; annidati.push(src.slice(j + 1, f)); j = f + 1; continue }
        buf += src[j]; j++
      }
      citata = true; inParola = true; i = j + 1; continue
    }
    if (c === '$' && src[i + 1] === '(') { const f = finePar(i + 1); annidati.push(src.slice(i + 2, f)); buf += src.slice(i, f + 1); inParola = true; i = f + 1; continue }
    if (!powershell && c === '`') { const k = src.indexOf('`', i + 1); const f = k < 0 ? src.length : k; annidati.push(src.slice(i + 1, f)); i = f + 1; continue }
    if (c === '<' && src[i + 1] === '<' && src[i + 2] !== '<' && !powershell) {
      // Un heredoc: il delimitatore, poi il corpo dalla riga dopo.
      chiudiParola()
      let j = i + 2
      const tab = src[j] === '-'
      if (tab) j++
      while (src[j] === ' ' || src[j] === '\t') j++
      const m = /^(['"]?)([A-Za-z0-9_.-]+)\1/.exec(src.slice(j))
      if (m !== null) { attesi.push({ fine: m[2] as string, tab }); i = j + m[0].length; continue }
      i += 2; continue
    }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      // Gli heredoc attesi da questa riga: il loro corpo sono le righe dopo.
      const corpi: string[] = []
      let j = i + 1
      for (const a of attesi) {
        const righe: string[] = []
        while (j < src.length) {
          const n = src.indexOf('\n', j)
          const riga = src.slice(j, n < 0 ? src.length : n).replace(/\r$/, '')
          j = n < 0 ? src.length : n + 1
          if ((a.tab ? riga.replace(/^\t+/, '') : riga) === a.fine) break
          righe.push(riga)
        }
        corpi.push(righe.join('\n'))
      }
      if (attesi.length > 0) { chiudiParola(); heredoc = heredoc.concat(corpi); attesi = []; i = j; chiudiComando(); continue }
      chiudiComando(); i++; continue
    }
    if (c === ';' || c === '&' || c === '|' || c === '(' || c === ')' || c === '{' || c === '}') {
      // `2>&1` non spezza il comando: `&` dopo `>` fa parte del rinvio.
      if (c === '&' && buf.endsWith('>')) { buf += c; i++; continue }
      chiudiComando(); i++; continue
    }
    if (c === ' ' || c === '\t') { chiudiParola(); i++; continue }
    buf += c; inParola = true; i++
  }
  chiudiComando()
  return { comandi, annidati }
}

/** `C:\\x\\rm.exe` → `rm`, `Remove-Item` → `remove-item`. */
function nomeVerbo(w: string): string {
  return (w.split(/[\\/]/).pop() ?? w).replace(/\.(exe|cmd|bat|ps1)$/i, '').toLowerCase()
}

/** Toglie davanti assegnamenti e involucri: il comando vero e il resto. */
function comandoVero(ws: Parola[]): Parola[] {
  let i = 0
  while (i < ws.length) {
    const w = ws[i] as Parola
    if (!w.citata && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w.testo)) { i++; continue }
    const v = nomeVerbo(w.testo)
    if (INVOLUCRI.has(v)) {
      i++
      // Le opzioni dell'involucro, e i valori di quelle che ne hanno uno.
      while (i < ws.length && ((ws[i] as Parola).testo.startsWith('-') || (v === 'env' && /^[A-Za-z_][A-Za-z0-9_]*=/.test((ws[i] as Parola).testo)) || (v === 'timeout' && /^\d/.test((ws[i] as Parola).testo)))) {
        const o = (ws[i] as Parola).testo
        i++
        if (CON_VALORE.has(o.toLowerCase()) && i < ws.length && v !== 'env') i++
      }
      continue
    }
    break
  }
  return ws.slice(i)
}

/** Un argomento che non e' un percorso: opzione, URL, rinvio, interruttore di cmd. */
function nonPercorso(w: string): boolean {
  return w === '' || w.startsWith('-') || /^\/[a-z]$/i.test(w) || /^[a-z][a-z0-9+.-]*:\/\//i.test(w) || /^\d*>/.test(w) || /^</.test(w)
}

function percorsiDa(args: string[], base: string): string[] {
  const out: string[] = []
  for (let k = 0; k < args.length; k++) {
    const w = args[k] as string
    // `> file`, `2> file`: quello dopo e' dove va l'uscita, non un bersaglio.
    if (/^\d*>>?$/.test(w)) { k++; continue }
    if (nonPercorso(w)) continue
    // `/e/Users/...` di Git Bash (e `/mnt/e/...` di WSL) e' `E:/Users/...`
    // (0.38.1): senza, una cancellazione dentro le sue cartelle scritta cosi'
    // risultava «fuori» — un falso allarme visto sul campo.
    const unita = /^\/(?:mnt\/)?([a-zA-Z])(?=\/)/.exec(w)
    const finestre = unita !== null ? `${unita[1]!.toUpperCase()}:${w.slice(unita[0].length)}` : w
    const pulito = finestre.replace(/^~(?=[\\/]|$)/, process.env.USERPROFILE ?? process.env.HOME ?? '~')
    out.push(isAbsolute(pulito) || /^[a-zA-Z]:/.test(pulito) ? pulito : resolve(base, pulito))
  }
  return out
}

function analizza(comando: string, cwd: string, powershell: boolean, profondita: number, bersagli: string[]): void {
  if (profondita > 4) return
  const { comandi, annidati } = leggiComandi(comando, powershell)
  let base = cwd
  for (const a of annidati) analizza(a, base, powershell, profondita + 1, bersagli)
  for (const c of comandi) {
    const ws = comandoVero(c.parole)
    const testi = ws.map((w) => w.testo)
    const verbo = testi.length > 0 ? nomeVerbo(testi[0] as string) : ''
    const resto = testi.slice(1)
    if (verbo === 'cd' || verbo === 'set-location' || verbo === 'sl' || verbo === 'pushd' || verbo === 'chdir') {
      const dove = resto.find((w) => !w.startsWith('-'))
      if (dove !== undefined) base = percorsiDa([dove], base)[0] ?? base
      continue
    }
    if (VERBI_CANCELLA.has(verbo)) {
      const p = percorsiDa(resto.filter((w) => w.toLowerCase() !== 'remove'), base)
      // Senza percorsi (`xargs rm`, `… | Remove-Item`): non si sa cosa, si
      // giudica la cartella in cui si e'.
      if (p.length === 0) bersagli.push(base)
      else bersagli.push(...p)
      continue
    }
    if (verbo === 'git') {
      let dir = base
      let k = 0
      while (k < resto.length && (resto[k] as string).startsWith('-')) {
        const o = resto[k] as string
        k++
        if (o === '-C' && k < resto.length) { dir = percorsiDa([resto[k] as string], base)[0] ?? dir; k++ }
        else if (o === '-c' && k < resto.length) k++
      }
      const sub = resto[k]
      const dopo = resto.slice(k + 1)
      if (sub === 'clean' || sub === 'rm') {
        const p = percorsiDa(dopo, dir)
        if (p.length === 0) bersagli.push(dir)
        else bersagli.push(...p)
      } else if (sub === 'worktree' && dopo[0] === 'remove') {
        const p = percorsiDa(dopo.slice(1), dir)
        bersagli.push(...(p.length === 0 ? [dir] : p))
      }
      continue
    }
    if (verbo === 'find') {
      const minuscole = resto.map((w) => w.toLowerCase())
      const exec = minuscole.findIndex((w) => w === '-exec' || w === '-execdir' || w === '-ok')
      const cancella = minuscole.includes('-delete') || (exec >= 0 && VERBI_CANCELLA.has(nomeVerbo(resto[exec + 1] ?? '')))
      if (cancella) {
        const radici: string[] = []
        for (const w of resto) { if (w.startsWith('-') || w === '(' || w === '!') break; radici.push(w) }
        bersagli.push(...(radici.length === 0 ? [base] : percorsiDa(radici, base)))
      }
      continue
    }
    if (SHELL.has(verbo)) {
      // Quello che la shell esegue: l'argomento di -c / -Command / /c, o
      // l'heredoc che riceve. Si rilegge come comando.
      const k = resto.findIndex((w) => /^(-c|\/c|\/k|-command|-c(o(m(m(a(n(d)?)?)?)?)?)?)$/i.test(w))
      const ps = verbo === 'powershell' || verbo === 'pwsh'
      if (k >= 0) analizza(resto.slice(k + 1).join(' '), base, ps, profondita + 1, bersagli)
      const enc = resto.findIndex((w) => /^-e(nc(odedcommand)?)?$/i.test(w))
      if (enc >= 0 && resto[enc + 1] !== undefined) {
        analizza(Buffer.from(resto[enc + 1] as string, 'base64').toString('utf16le'), base, true, profondita + 1, bersagli)
      }
      if (verbo === 'wsl' && k < 0 && resto.length > 0) analizza(resto.join(' '), base, false, profondita + 1, bersagli)
      for (const h of c.heredoc) analizza(h, base, ps, profondita + 1, bersagli)
    }
  }
}

/** I percorsi che un comando di cancellazione colpisce (opzioni escluse). */
export function bersagliCancellazione(comando: string, cwd: string, powershell = false): string[] {
  const bersagli: string[] = []
  analizza(comando, cwd, powershell, 0, bersagli)
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

  for (const b of bersagliCancellazione(comando, cwd, nome === 'PowerShell')) {
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
