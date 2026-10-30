/**
 * **Il flusso dell'orchestratore, letto** (P3, 30/10/2026). L'orchestratore
 * è un processo `claude -p --input-format stream-json --output-format
 * stream-json --verbose` per workspace; i suoi specialisti sono subagenti
 * nativi di Claude Code (`--agents`). Dall'uscita, una riga JSON per evento:
 *
 * - `system/init`: la sessione;
 * - `assistant` senza `parent_tool_use_id`: l'orchestratore; un `tool_use`
 *   `Agent` (o `Task`) con `{subagent_type, description, prompt}` è uno
 *   specialista che parte;
 * - `assistant`/`user` con `parent_tool_use_id`: quello che fa lo specialista;
 * - `system/task_started`, `task_progress`, `task_updated`,
 *   `task_notification`: lo specialista in sottofondo (stato, avanzamento);
 * - `user` con il `tool_result` dell'`Agent`: il suo riepilogo;
 * - `result`: fine del turno, con `total_cost_usd`, `usage`, `session_id`.
 *
 * Qui solo la lettura, pura: da una riga allo stato compatto del workspace
 * (gli specialisti con ruolo, attività, stato e durata, e un registro breve)
 * più gli «effetti» che il servizio deve eseguire. I campi esatti degli
 * eventi `task_*` non sono documentati: si leggono con prudenza, per nome.
 */

export type StatoSpecialista = 'avviato' | 'lavoro' | 'finito' | 'fallito' | 'fermato'

export type Specialista = {
  /** L'id del `tool_use` dell'Agent che l'ha lanciato. */
  id: string
  /** L'id del task in sottofondo, se c'è. */
  task?: string
  /** L'id dell'agente (per trovare il suo worktree). */
  agente?: string
  ruolo: string
  descrizione: string
  /** Il compito del piano, se la descrizione comincia con il suo id («k-3: …»). */
  compito?: string
  stato: StatoSpecialista
  attivita?: string
  inizio: string
  fine?: string
  /** Il worktree e il ramo, se gli eventi li dicono. */
  cartella?: string
  ramo?: string
  /** Il riepilogo finale (con le righe RAPPORTO:/LEZIONI:). */
  riepilogo?: string
  /** Già unito dal cancello. */
  unito?: boolean
}

export type RigaRegistro = { quando: string; tipo: 'turno' | 'specialista' | 'strumento' | 'costo' | 'errore'; testo: string; specialista?: string }

export type CostoTurno = {
  quando: string
  usd: number
  input: number
  output: number
  cacheLettura: number
  cacheScrittura: number
  /** Token di contesto dell'ultima chiamata (per la rotazione). */
  contesto: number
  sessione?: string
  durataMs?: number
}

export type StatoFlusso = {
  sessione?: string
  /** Un turno dell'orchestratore è in corso (dall'ultimo input, o da un risveglio, al `result`). */
  inTurno: boolean
  specialisti: Specialista[]
  registro: RigaRegistro[]
  costi: CostoTurno[]
  /**
   * Il contesto dell'ultima chiamata dell'orchestratore (dall'`usage` del suo
   * ultimo messaggio `assistant`). Il `usage` del `result` **somma** tutte le
   * chiamate del turno (provato il 30/10: 173k «di contesto» per un turno di
   * 38k), e non vale per la rotazione.
   */
  ultimoContesto?: number
}

export type EffettoFlusso =
  | { tipo: 'sessione'; id: string }
  | { tipo: 'risposta'; testo: string; errore?: string }
  | { tipo: 'costo'; costo: CostoTurno }
  | { tipo: 'specialista-partito'; specialista: Specialista }
  | { tipo: 'specialista-finito'; specialista: Specialista }

export const REGISTRO_MAX = 60
export const SPECIALISTI_RICORDATI = 30
export const COSTI_RICORDATI = 50

export const flussoVuoto = (): StatoFlusso => ({ inTurno: false, specialisti: [], registro: [], costi: [] })

const o = (x: unknown): Record<string, unknown> => (typeof x === 'object' && x !== null && !Array.isArray(x) ? x as Record<string, unknown> : {})
const s = (x: unknown): string | undefined => (typeof x === 'string' && x.trim() !== '' ? x.trim() : undefined)
const n = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0)
const corto = (t: string, m: number): string => { const x = t.replace(/\s+/gu, ' ').trim(); return x.length > m ? `${x.slice(0, m - 1)}…` : x }

/** Il compito del piano in testa alla descrizione: «k-3: …», «[k-3] …». */
export function compitoDallaDescrizione(d: string): string | undefined {
  const m = /^\s*(?:\[([A-Za-z][\w.-]{0,30})\]\s*[:—–-]?\s|([A-Za-z][\w.-]{0,30})\s*[:—–-]\s)/u.exec(d)
  return m?.[1] ?? m?.[2]
}

/** Il testo di un contenuto (stringa, o blocchi `text`). */
function testoDi(c: unknown): string {
  if (typeof c === 'string') return c
  if (!Array.isArray(c)) return ''
  return c.map((b) => { const x = o(b); return x.type === 'text' && typeof x.text === 'string' ? x.text : '' }).filter((t) => t !== '').join('\n')
}

/** Una riga per l'attività di uno specialista: lo strumento e il suo bersaglio. */
export function attivitaDi(nome: string, input: unknown): string {
  const i = o(input)
  const bersaglio = s(i.file_path) ?? s(i.path) ?? s(i.command) ?? s(i.pattern) ?? s(i.url) ?? s(i.description)
  return corto(bersaglio !== undefined ? `${nome} ${bersaglio}` : nome, 140)
}

function statoDa(x: string | undefined): StatoSpecialista | undefined {
  if (x === undefined) return undefined
  if (/complet|done|success|finish/iu.test(x)) return 'finito'
  if (/fail|error/iu.test(x)) return 'fallito'
  if (/kill|cancel|stop|abort/iu.test(x)) return 'fermato'
  if (/run|progress|start|pending|active/iu.test(x)) return 'lavoro'
  return undefined
}

const terminale = (st: StatoSpecialista): boolean => st === 'finito' || st === 'fallito' || st === 'fermato'

/** Cerca, fra i campi di un evento (anche annidati), il worktree, il ramo e l'id dell'agente. */
function dettagliDelTask(ev: Record<string, unknown>): { cartella?: string; ramo?: string; agente?: string } {
  const fuori: { cartella?: string; ramo?: string; agente?: string } = {}
  const visita = (x: unknown, chiave: string, prof: number): void => {
    if (prof > 4) return
    if (typeof x === 'string') {
      const k = chiave.toLowerCase()
      if (fuori.ramo === undefined && k.includes('branch')) fuori.ramo = x
      else if (fuori.cartella === undefined && (k.includes('worktree') || k === 'cwd') && /worktrees?[\\/]/iu.test(x)) fuori.cartella = x
      else if (fuori.agente === undefined && (k === 'agent_id' || k === 'agentid')) fuori.agente = x
      return
    }
    if (Array.isArray(x)) { for (const y of x) visita(y, chiave, prof + 1); return }
    if (typeof x === 'object' && x !== null) for (const [k, v] of Object.entries(x)) visita(v, k, prof + 1)
  }
  visita(ev, '', 0)
  return fuori
}

/**
 * Applica una riga dell'uscita allo stato. Le righe che non sono JSON (o
 * sconosciute) non cambiano niente. Non solleva.
 */
export function applicaRiga(prima: StatoFlusso, riga: string, quando: string): { stato: StatoFlusso; effetti: EffettoFlusso[] } {
  let ev: Record<string, unknown>
  try { ev = o(JSON.parse(riga)) } catch { return { stato: prima, effetti: [] } }
  const st: StatoFlusso = { ...prima, specialisti: [...prima.specialisti], registro: [...prima.registro], costi: [...prima.costi] }
  const effetti: EffettoFlusso[] = []
  const registra = (r: Omit<RigaRegistro, 'quando'>): void => { st.registro = [...st.registro, { quando, ...r }].slice(-REGISTRO_MAX) }
  const cambia = (id: string, f: (x: Specialista) => Specialista): Specialista | undefined => {
    const i = st.specialisti.findIndex((x) => x.id === id || x.task === id)
    if (i < 0) return undefined
    const nuovo = f(st.specialisti[i]!)
    st.specialisti[i] = nuovo
    return nuovo
  }
  const finisci = (id: string, esito: StatoSpecialista, riepilogo: string | undefined): void => {
    let gia = false
    const x = cambia(id, (y) => {
      if (terminale(y.stato)) { gia = true; return riepilogo !== undefined && y.riepilogo === undefined ? { ...y, riepilogo } : y }
      return { ...y, stato: esito, fine: quando, ...(riepilogo !== undefined ? { riepilogo } : {}) }
    })
    if (x === undefined || gia) return
    registra({ tipo: 'specialista', specialista: x.id, testo: `${x.ruolo} ${esito === 'finito' ? 'ha finito' : esito === 'fallito' ? 'non è riuscito' : 'è stato fermato'}: ${corto(x.descrizione, 100)}` })
    effetti.push({ tipo: 'specialista-finito', specialista: x })
  }
  const tipo = s(ev.type)
  const genitore = s(ev.parent_tool_use_id)

  if (tipo === 'system') {
    const sotto = s(ev.subtype) ?? ''
    if (sotto === 'init') {
      const id = s(ev.session_id)
      if (id !== undefined && id !== st.sessione) { st.sessione = id; effetti.push({ tipo: 'sessione', id }) }
    } else if (sotto.startsWith('task_')) {
      // Dal vivo (CLI 2.1.314): task_started {task_id, tool_use_id, description,
      // subagent_type, task_type: "local_agent"}; task_progress {task_id,
      // tool_use_id, description: «Running …»/«Writing …», last_tool_name,
      // usage}; task_updated {task_id, patch: {status, end_time}};
      // task_notification {task_id, tool_use_id, status, summary, output_file}.
      // Il task_id di un local_agent è l'id dell'agente: il suo worktree è
      // `.claude/worktrees/agent-<id>`, il ramo `worktree-agent-<id>`.
      const ref = s(ev.tool_use_id) ?? s(ev.parent_tool_use_id) ?? s(o(ev.task).tool_use_id)
      const task = s(ev.task_id) ?? s(o(ev.task).id) ?? s(ev.id)
      const id = (ref !== undefined && st.specialisti.some((x) => x.id === ref) ? ref : undefined)
        ?? (task !== undefined && st.specialisti.some((x) => x.task === task) ? task : undefined)
        // Un task di agente senza riferimento: il più recente specialista senza
        // task. Un task con un riferimento a un altro strumento (un Bash in
        // sottofondo) non è uno specialista.
        ?? (ref === undefined && (s(ev.task_type) ?? 'local_agent') === 'local_agent' ? [...st.specialisti].reverse().find((x) => x.task === undefined && !terminale(x.stato))?.id : undefined)
      if (id !== undefined) {
        const d = dettagliDelTask(ev)
        const stato = statoDa(s(ev.status) ?? s(o(ev.patch).status) ?? s(o(ev.task).status) ?? (sotto === 'task_started' ? 'started' : undefined))
        // task_started porta la descrizione del compito, non un'attività.
        const attivita = sotto === 'task_progress'
          ? s(ev.description) ?? s(ev.last_tool_name) ?? s(ev.activity)
          : sotto === 'task_started' || sotto === 'task_notification' ? undefined : s(ev.activity) ?? s(ev.last_tool_name)
        const agente = d.agente ?? ((s(ev.task_type) ?? 'local_agent') === 'local_agent' ? task : undefined)
        const x = cambia(id, (y) => ({
          ...y,
          ...(task !== undefined && y.task === undefined ? { task } : {}),
          ...(d.cartella !== undefined ? { cartella: d.cartella } : {}),
          ...(d.ramo !== undefined ? { ramo: d.ramo } : {}),
          ...(agente !== undefined && y.agente === undefined ? { agente } : {}),
          ...(attivita !== undefined ? { attivita: corto(attivita, 140) } : {}),
          ...(stato === 'lavoro' && !terminale(y.stato) ? { stato: 'lavoro' as const } : {})
        }))
        if (x !== undefined && stato !== undefined && terminale(stato) && sotto === 'task_updated') {
          // Arriva subito prima della notifica, senza il riepilogo: la fine la
          // dice la notifica. Il turno di risveglio è già in arrivo.
          st.inTurno = true
        } else if (x !== undefined && stato !== undefined && terminale(stato)) {
          finisci(x.id, stato, s(ev.result) ?? s(ev.summary) ?? s(ev.output) ?? (sotto === 'task_notification' ? s(ev.message) : undefined))
          // La notifica sveglia l'orchestratore: la CLI gli fa fare un turno da
          // sé. Fino al suo `result` il processo non va a riposo né ruota.
          if (sotto === 'task_notification') st.inTurno = true
        }
      }
    }
    return { stato: st, effetti }
  }

  if (tipo === 'assistant') {
    const blocchi = Array.isArray(o(ev.message).content) ? o(ev.message).content as unknown[] : []
    if (genitore !== undefined) {
      // Lo specialista lavora: l'ultimo strumento (o l'ultima frase) è la sua attività.
      const ultimo = [...blocchi].reverse().map(o).find((b) => b.type === 'tool_use' || (b.type === 'text' && typeof b.text === 'string'))
      if (ultimo !== undefined) {
        const att = ultimo.type === 'tool_use' ? attivitaDi(s(ultimo.name) ?? 'strumento', ultimo.input) : corto(String(ultimo.text), 140)
        cambia(genitore, (y) => ({ ...y, attivita: att, ...(terminale(y.stato) ? {} : { stato: 'lavoro' as const }) }))
      }
      return { stato: st, effetti }
    }
    // L'orchestratore parla: se non era in turno, si è svegliato da solo (uno specialista ha finito).
    st.inTurno = true
    const uso = o(o(ev.message).usage)
    const ctx = n(uso.input_tokens) + n(uso.cache_read_input_tokens) + n(uso.cache_creation_input_tokens)
    if (ctx > 0) st.ultimoContesto = ctx
    for (const b of blocchi.map(o)) {
      if (b.type !== 'tool_use') continue
      const nome = s(b.name) ?? ''
      const id = s(b.id)
      if ((nome === 'Agent' || nome === 'Task') && id !== undefined) {
        const i = o(b.input)
        const descrizione = s(i.description) ?? s(i.prompt)?.slice(0, 120) ?? 'specialista'
        const compito = compitoDallaDescrizione(descrizione)
        const nuovo: Specialista = { id, ruolo: s(i.subagent_type) ?? 'general-purpose', descrizione, stato: 'avviato', inizio: quando, ...(compito !== undefined ? { compito } : {}) }
        st.specialisti = [...st.specialisti.filter((x) => x.id !== id), nuovo].slice(-SPECIALISTI_RICORDATI)
        registra({ tipo: 'specialista', specialista: id, testo: `parte ${nuovo.ruolo}: ${corto(descrizione, 100)}` })
        effetti.push({ tipo: 'specialista-partito', specialista: nuovo })
      } else if (nome !== '') {
        registra({ tipo: 'strumento', testo: attivitaDi(nome.replace(/^mcp__sierradeck__/u, ''), b.input) })
      }
    }
    return { stato: st, effetti }
  }

  if (tipo === 'user') {
    if (genitore !== undefined) return { stato: st, effetti }
    // Il risultato dell'Agent: per uno specialista in primo piano è la fine;
    // per uno in sottofondo (ha un task) solo l'avvio, la fine la dice il task.
    const blocchi = Array.isArray(o(ev.message).content) ? o(ev.message).content as unknown[] : []
    for (const b of blocchi.map(o)) {
      if (b.type !== 'tool_result') continue
      const id = s(b.tool_use_id)
      const x = id === undefined ? undefined : st.specialisti.find((y) => y.id === id)
      if (x === undefined) continue
      const testo = testoDi(b.content)
      const d = dettagliDelTask(o(ev.tool_use_result))
      // «Async agent launched successfully. … agentId: a59… (internal ID …)»
      const agente = d.agente ?? /\bagentId:\s*([\w-]+)/u.exec(testo)?.[1]
      cambia(x.id, (y) => ({ ...y, ...(d.cartella !== undefined ? { cartella: d.cartella } : {}), ...(d.ramo !== undefined ? { ramo: d.ramo } : {}), ...(agente !== undefined && y.agente === undefined ? { agente } : {}) }))
      const inSottofondo = x.task !== undefined || /background|sottofondo|async/iu.test(testo.slice(0, 300))
      if (!inSottofondo) finisci(x.id, b.is_error === true ? 'fallito' : 'finito', testo !== '' ? testo : undefined)
      else if (testo !== '' && /RAPPORTO:|LEZIONI:/u.test(testo)) finisci(x.id, 'finito', testo)
    }
    return { stato: st, effetti }
  }

  if (tipo === 'result') {
    const u = o(ev.usage)
    // Il contesto vero: l'ultima chiamata (l'ultimo messaggio dell'orchestratore,
    // o l'ultima voce di `usage.iterations`); il `usage` del result è la somma del turno.
    const iterazioni = Array.isArray(u.iterations) ? u.iterations.map(o) : []
    const ultima = iterazioni[iterazioni.length - 1]
    const daIterazione = ultima === undefined ? 0 : n(ultima.input_tokens) + n(ultima.cache_read_input_tokens) + n(ultima.cache_creation_input_tokens)
    const contesto = st.ultimoContesto ?? (daIterazione > 0 ? daIterazione : n(u.input_tokens) + n(u.cache_read_input_tokens) + n(u.cache_creation_input_tokens))
    const costo: CostoTurno = {
      quando,
      usd: n(ev.total_cost_usd),
      input: n(u.input_tokens),
      output: n(u.output_tokens),
      cacheLettura: n(u.cache_read_input_tokens),
      cacheScrittura: n(u.cache_creation_input_tokens),
      contesto,
      ...(s(ev.session_id) !== undefined ? { sessione: s(ev.session_id)! } : {}),
      ...(typeof ev.duration_ms === 'number' ? { durataMs: ev.duration_ms } : {})
    }
    st.inTurno = false
    st.costi = [...st.costi, costo].slice(-COSTI_RICORDATI)
    if (costo.sessione !== undefined && costo.sessione !== st.sessione) { st.sessione = costo.sessione; effetti.push({ tipo: 'sessione', id: costo.sessione }) }
    const testo = s(ev.result) ?? ''
    const errore = ev.is_error === true ? (testo !== '' ? testo : s(ev.subtype) ?? 'errore') : undefined
    registra({ tipo: errore !== undefined ? 'errore' : 'turno', testo: errore !== undefined ? `turno finito con un errore: ${corto(errore, 160)}` : `turno chiuso (${costo.usd.toFixed(4)} $, contesto ${costo.contesto} token)` })
    effetti.push({ tipo: 'costo', costo })
    effetti.push({ tipo: 'risposta', testo, ...(errore !== undefined ? { errore } : {}) })
    return { stato: st, effetti }
  }

  return { stato: st, effetti }
}

/** Gli specialisti ancora al lavoro (il processo non si spegne finché ce n'è uno). */
export function specialistiAlLavoro(st: StatoFlusso): Specialista[] {
  return st.specialisti.filter((x) => !terminale(x.stato))
}

/** Quanto è durato (o dura) uno specialista, in parole. */
export function durata(x: Pick<Specialista, 'inizio' | 'fine'>, adesso: number): string {
  const a = Date.parse(x.inizio)
  const b = x.fine !== undefined ? Date.parse(x.fine) : adesso
  if (Number.isNaN(a) || Number.isNaN(b)) return ''
  const sec = Math.max(0, Math.round((b - a) / 1000))
  return sec < 60 ? `${sec} s` : sec < 3600 ? `${Math.round(sec / 60)} min` : `${Math.floor(sec / 3600)} h ${Math.round((sec % 3600) / 60)} min`
}
