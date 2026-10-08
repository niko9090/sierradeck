/**
 * Il negozio, la parte che vale ovunque (0.53.0): come si chiama lo stato di
 * ogni voce, cosa vuol dire, cosa cambia dopo un'azione, e come si leggono le
 * risposte vere del CLI di Claude Code (2.1.294).
 *
 * Lo stato lo calcola **il PC** e lo manda già scritto al telefono e alla
 * pagina: così le tre facce del negozio dicono la stessa cosa con le stesse
 * parole, e non c'è una seconda copia della regola che diverge al primo
 * ritocco. Le funzioni qui sono pure, provate su risposte vere del CLI
 * (`tests/fixtures/claude-2.1.294-negozio/`).
 */

export type Tono = 'ok' | 'spento' | 'attesa' | 'errore' | 'neutro'

/** Lo stato di una voce: la parola breve, il colore, e cosa vuol dire per esteso. */
export type StatoVoce = { etichetta: string; tono: Tono; spiegazione: string }

export type PluginVoce = {
  /** `nome@marketplace`: l'identificatore per installare, accendere, spegnere. */
  id: string
  nome: string
  descrizione: string
  marketplace: string
  installato: boolean
  abilitato: boolean
  installazioni?: number
  /** La versione installata, se il CLI la dice. */
  versione?: string
  /** La versione nel catalogo, quando è diversa da quella installata. */
  versioneNuova?: string
  aggiornamento?: boolean
  /** Dove è installato: user, project, local. */
  ambito?: string
  /** La cartella del plugin installato (per leggerne le skill). */
  percorso?: string
  stato?: StatoVoce
}

export type OrigineSkill = 'utente' | 'progetto' | 'plugin'

export type SkillVoce = {
  nome: string
  descrizione: string
  origine: OrigineSkill
  percorso: string
  abilitata: boolean
  /** Il valore di `skillOverrides`, se c'è: off, name-only, user-invocable-only. */
  override?: string
  /** Per una skill portata da un plugin: quale. */
  plugin?: string
  stato?: StatoVoce
}

export type AmbitoMcp = 'locale' | 'utente' | 'progetto' | 'altro'
export type ConfigMcp = 'attivo' | 'spento' | 'da-approvare' | 'rifiutato'
export type SaluteMcp = 'connesso' | 'errore' | 'da-autenticare' | 'da-approvare' | 'rifiutato' | 'spento'

export type McpVoce = {
  nome: string
  /** locale = solo io in questa cartella; utente = tutti i miei progetti; progetto = .mcp.json; altro = plugin o claude.ai. */
  ambito: AmbitoMcp
  tipo: string
  /** Come parte: il comando o l'indirizzo, con i valori che sembrano segreti coperti. */
  come: string
  /** I nomi delle variabili d'ambiente impostate. Mai i valori. */
  variabili: string[]
  /** I nomi delle intestazioni HTTP impostate. Mai i valori. */
  intestazioni: string[]
  config: ConfigMcp
  /** Per i telefoni di prima della 0.53.0. */
  abilitato: boolean
  salute?: SaluteMcp
  motivo?: string
  stato?: StatoVoce
}

/** Le parole di un'ambito, per chi le legge. */
export function nomeAmbitoMcp(a: AmbitoMcp): string {
  return a === 'locale' ? 'solo questa cartella' : a === 'utente' ? 'tutti i progetti' : a === 'progetto' ? 'file .mcp.json del progetto' : 'da un plugin o da claude.ai'
}

export function statoPlugin(p: {
  installato: boolean
  abilitato: boolean
  marketplace: string
  aggiornamento?: boolean
  versione?: string
  versioneNuova?: string
}): StatoVoce {
  if (!p.installato) {
    return {
      etichetta: 'da installare',
      tono: 'neutro',
      spiegazione: 'Non è installato. «Installa» lo scarica dal marketplace ' + (p.marketplace || 'da cui arriva') +
        ' e lo accende per tutte le chat di questo computer: le chat che apri da adesso lo usano subito.'
    }
  }
  if (p.aggiornamento === true) {
    return {
      etichetta: 'aggiornamento disponibile',
      tono: 'attesa',
      spiegazione: 'Installata la ' + (p.versione || 'versione di prima') +
        (p.versioneNuova ? ', nel catalogo c’è la ' + p.versioneNuova : ', nel catalogo ce n’è una più nuova') +
        '. «Aggiorna» scarica la nuova; le chat la usano da quando le riapri.' +
        (p.abilitato ? '' : ' Intanto resta spento.')
    }
  }
  if (p.abilitato) {
    return {
      etichetta: 'attivo',
      tono: 'ok',
      spiegazione: 'Installato e acceso: le chat di questo computer lo usano. «Disattiva» lo spegne senza toglierlo, «Rimuovi» lo toglie del tutto.'
    }
  }
  return {
    etichetta: 'disattivato',
    tono: 'spento',
    spiegazione: 'Installato ma spento: nessuna chat lo usa. «Attiva» lo riaccende senza riscaricarlo.'
  }
}

export function statoSkill(s: { nome?: string; origine: OrigineSkill; abilitata: boolean; override?: string; plugin?: string }): StatoVoce {
  if (s.origine === 'plugin') {
    return s.abilitata
      ? { etichetta: 'dal plugin', tono: 'ok', spiegazione: 'Arriva dal plugin ' + (s.plugin || '') + ': è accesa finché il plugin è acceso. Si accende e si spegne con lui, dalla scheda Plugin.' }
      : { etichetta: 'plugin spento', tono: 'spento', spiegazione: 'Arriva dal plugin ' + (s.plugin || '') + ', che è spento: nessuna chat la vede. Si riaccende con il plugin, dalla scheda Plugin.' }
  }
  if (!s.abilitata) {
    return {
      etichetta: 'disattivata',
      tono: 'spento',
      spiegazione: 'Spenta: le chat non la vedono, ma i suoi file restano dove sono. «Attiva» la riaccende, anche nelle chat già aperte.'
    }
  }
  const dove = s.origine === 'utente' ? 'vale in tutti i progetti di questo computer' : 'vale nelle chat di questa cartella'
  if (s.override === 'name-only') {
    return { etichetta: 'solo il nome', tono: 'attesa', spiegazione: 'Accesa, ma le chat ne vedono solo il nome e non la descrizione (impostazione «name-only»): ' + dove + '.' }
  }
  if (s.override === 'user-invocable-only') {
    return { etichetta: 'solo a mano', tono: 'attesa', spiegazione: 'Claude non la usa di sua iniziativa: parte solo quando la richiami tu con /' + (s.nome || 'nome') + ' (impostazione «user-invocable-only»): ' + dove + '.' }
  }
  return {
    etichetta: 'attiva',
    tono: 'ok',
    spiegazione: 'Attiva: ' + dove + '. Claude la usa quando serve. «Disattiva» la spegne senza cancellarla.'
  }
}

export function statoMcp(m: { ambito: AmbitoMcp; config: ConfigMcp; salute?: SaluteMcp; motivo?: string }): StatoVoce {
  if (m.config === 'spento' || m.salute === 'spento') {
    return {
      etichetta: 'disattivato',
      tono: 'spento',
      spiegazione: 'Spento per questa cartella: le chat non lo avviano. La configurazione resta com’è; «Attiva» lo riaccende per le chat che apri da adesso.'
    }
  }
  if (m.config === 'rifiutato' || m.salute === 'rifiutato') {
    return {
      etichetta: 'rifiutato',
      tono: 'spento',
      spiegazione: 'Sta nel file .mcp.json del progetto ed è stato rifiutato per questa cartella: le chat non lo avviano. «Approva» lo autorizza.'
    }
  }
  if (m.config === 'da-approvare' || m.salute === 'da-approvare') {
    return {
      etichetta: 'da approvare',
      tono: 'attesa',
      spiegazione: 'Sta nel file .mcp.json del progetto, e Claude Code non lo avvia finché qualcuno non lo approva. «Approva» lo autorizza per questa cartella; «Rifiuta» lo lascia spento.'
    }
  }
  if (m.salute === 'errore') {
    return {
      etichetta: 'errore',
      tono: 'errore',
      spiegazione: 'Configurato ma non si collega' + (m.motivo ? ': ' + m.motivo : '') +
        '. Controlla il comando o l’indirizzo e le variabili, poi «Verifica di nuovo». Le chat non ne vedono gli strumenti.'
    }
  }
  if (m.salute === 'da-autenticare') {
    return {
      etichetta: 'da autenticare',
      tono: 'attesa',
      spiegazione: 'Il server chiede di entrare con il suo account. In una chat scrivi /mcp, scegli questo server e segui l’accesso.'
    }
  }
  if (m.salute === 'connesso') {
    return { etichetta: 'connesso', tono: 'ok', spiegazione: 'Attivo e collegato: le chat ne vedono gli strumenti.' }
  }
  return {
    etichetta: 'attivo',
    tono: 'neutro',
    spiegazione: 'Attivo: le chat che apri lo avviano. Se si collega davvero lo dice «Verifica i collegamenti».'
  }
}

export type AzioneNegozio =
  | 'installa' | 'aggiorna' | 'attiva-plugin' | 'disattiva-plugin' | 'rimuovi-plugin'
  | 'attiva-skill' | 'disattiva-skill' | 'aggiungi-skill' | 'togli-skill'
  | 'attiva-mcp' | 'disattiva-mcp' | 'approva-mcp' | 'rifiuta-mcp' | 'aggiungi-mcp' | 'togli-mcp' | 'variabili-mcp'
  | 'aggiungi-marketplace' | 'aggiorna-marketplace' | 'togli-marketplace'

/**
 * Cosa cambia dopo un'azione riuscita, detto per chi la fa. Le regole sono
 * quelle della documentazione di Claude Code: le skill si rileggono da sole
 * anche nelle chat aperte; plugin e MCP valgono dalla prossima chat (o, per i
 * plugin, dopo /reload-plugins nella chat).
 */
export function cosaCambia(a: AzioneNegozio): string {
  switch (a) {
    case 'installa': return 'Installato e acceso. Le chat che apri da adesso lo usano; in una chat già aperta scrivi /reload-plugins.'
    case 'aggiorna': return 'Aggiornato. La versione nuova vale dalle chat che apri da adesso: quelle già aperte vanno riaperte.'
    case 'attiva-plugin': return 'Acceso. Le chat che apri da adesso lo usano; in una chat già aperta scrivi /reload-plugins.'
    case 'disattiva-plugin': return 'Spento, ma resta installato. Le chat che apri da adesso non lo vedono; in una già aperta scrivi /reload-plugins.'
    case 'rimuovi-plugin': return 'Tolto da questo computer, con i suoi dati. Le chat che apri da adesso non lo vedono più.'
    case 'attiva-skill': return 'Accesa. Claude Code se ne accorge da solo, anche nelle chat già aperte.'
    case 'disattiva-skill': return 'Spenta. I file restano; Claude Code smette di usarla anche nelle chat già aperte.'
    case 'aggiungi-skill': return 'Aggiunta. Claude Code la vede da solo, anche nelle chat già aperte (se la cartella delle skill non c’era, in quelle chat scrivi /reload-skills).'
    case 'togli-skill': return 'Spostata nel Cestino di Windows: se ti serve ancora, la ripristini da lì. Le chat smettono di vederla.'
    case 'attiva-mcp': return 'Acceso per questa cartella: le chat che apri da adesso lo avviano.'
    case 'disattiva-mcp': return 'Spento per questa cartella: le chat che apri da adesso non lo avviano. La configurazione resta.'
    case 'approva-mcp': return 'Approvato per questa cartella: le chat che apri da adesso lo avviano.'
    case 'rifiuta-mcp': return 'Rifiutato per questa cartella: le chat non lo avviano. Si può approvare quando vuoi.'
    case 'aggiungi-mcp': return 'Aggiunto. Le chat che apri da adesso lo avviano; «Verifica i collegamenti» dice se risponde.'
    case 'togli-mcp': return 'Tolto dalla configurazione. Le chat che apri da adesso non lo avviano più.'
    case 'variabili-mcp': return 'Salvato. I valori nuovi valgono dalle chat che apri da adesso.'
    case 'aggiungi-marketplace': return 'Aggiunto: i suoi plugin sono nel catalogo, pronti da installare.'
    case 'aggiorna-marketplace': return 'Catalogo riletto dalla sua sorgente: compaiono i plugin nuovi e le versioni nuove.'
    case 'togli-marketplace': return 'Tolto, e con lui i plugin installati da lì, con le loro opzioni e i loro dati (Claude Code li toglie insieme). Per riaverli: aggiungi di nuovo la fonte e reinstallali.'
  }
}

export type EsitoCli = {
  ok: boolean
  messaggio?: string
  /** Il codice del guasto del CLI (not_found, invalid_source, …). */
  codice?: string
  /** Era già così: per chi tocca un interruttore è riuscito. */
  giaFatto?: boolean
  /**
   * Il marketplace chiede di eseguire un suo comando per installare: non lo si
   * accetta mai al buio. Si mostra, e si installa solo con una seconda
   * conferma che porta questa impronta (`--accept-command`).
   */
  conferma?: { sha256: string; comando: string }
  /** Per «aggiorna»: com'è andata. */
  aggiornato?: { da?: string; a?: string; giaUltima: boolean }
  /** Il messaggio del CLI quando è riuscito, così com'è. */
  detto?: string
}

/** L'ultima riga JSON dell'uscita del CLI che porta un esito. */
function rigaEsito(testo: string): Record<string, unknown> | undefined {
  const righe = testo.split(/\r?\n/).map((r) => r.trim()).filter((r) => r.startsWith('{'))
  for (let i = righe.length - 1; i >= 0; i--) {
    try {
      const o = JSON.parse(righe[i] as string) as unknown
      if (o !== null && typeof o === 'object' && !Array.isArray(o) && 'outcome' in o) return o as Record<string, unknown>
    } catch {
      // una riga che sembra JSON e non lo e': si guarda la prima prima
    }
  }
  return undefined
}

/** Le stringhe di un comando dichiarato, comunque si chiamino i campi. */
function testoComando(v: unknown): string {
  if (typeof v === 'string') return v
  if (v === null || typeof v !== 'object') return ''
  const o = v as Record<string, unknown>
  for (const k of ['command', 'display', 'text', 'cmd']) {
    const x = o[k]
    if (typeof x === 'string' && x !== '') return x
    if (Array.isArray(x)) return x.filter((y) => typeof y === 'string').join(' ')
  }
  return JSON.stringify(o)
}

/**
 * Perché un'azione non è riuscita, detto in modo da sapere cosa fare.
 * Il messaggio originale del CLI resta in coda, tra virgolette.
 */
export function motivoLeggibile(grezzo: string): string {
  const m = grezzo.replace(/\s+/g, ' ').trim()
  const coda = m === '' ? '' : ' (Claude Code: «' + m.slice(0, 300) + '»)'
  if (/filename too long/i.test(m)) {
    return 'Windows ha rifiutato un percorso troppo lungo mentre git scaricava il plugin. Rimedio: in un terminale scrivi «git config --global core.longpaths true», poi Riprova.' + coda
  }
  if (/not found in marketplace/i.test(m)) {
    return 'Nel catalogo scaricato su questo computer quel plugin non c’è più. Aggiorna il marketplace (scheda Fonti, «Aggiorna») e Riprova.' + coda
  }
  if (/not found in installed plugins/i.test(m)) {
    return 'Non risulta installato: forse è già stato tolto. L’elenco si ricarica da solo.' + coda
  }
  if (/path does not exist/i.test(m)) {
    return 'La cartella indicata non esiste su questo computer: controlla il percorso.' + coda
  }
  if (/spawn git|git(\.exe)?['"]? (is )?not (found|recognized)|git: command not found/i.test(m)) {
    return 'Per scaricare da GitHub serve git, e su questo computer non c’è. Installa Git per Windows e Riprova.' + coda
  }
  if (/ENOTFOUND|getaddrinfo|ECONNRESET|ETIMEDOUT|could not resolve host|unable to access|network/i.test(m)) {
    return 'Non arrivo in rete per scaricarlo: controlla la connessione e Riprova.' + coda
  }
  if (/already exists|already configured/i.test(m)) {
    return 'C’è già una voce con quel nome.' + coda
  }
  return m === '' ? 'Claude Code non ha detto perché.' : m.slice(0, 400)
}

/**
 * L'esito di un comando `claude plugin … --json`: una riga JSON con
 * `outcome`, anche quando il comando fallisce (e allora esce con 1, e sotto
 * stampa la riga ✘ per le persone). Senza riga JSON si ripiega sui glifi.
 */
export function esitoCli(r: { ok: boolean; stdout: string; stderr: string }): EsitoCli {
  const o = rigaEsito(r.stdout) ?? rigaEsito(r.stderr)
  if (o !== undefined) {
    const messaggio = typeof o.message === 'string' ? o.message : ''
    const codice = typeof o.failureCode === 'string' ? o.failureCode : undefined
    const sc = o.shownCommand
    if (sc !== undefined && sc !== null && typeof sc === 'object' && typeof (sc as Record<string, unknown>).sha256 === 'string' && o.outcome !== 'ok') {
      return {
        ok: false,
        conferma: { sha256: (sc as Record<string, unknown>).sha256 as string, comando: testoComando(sc) },
        messaggio: 'Il marketplace chiede di eseguire un suo comando per installare questo plugin. Leggilo: se ti fidi, conferma.',
        ...(codice !== undefined ? { codice } : {})
      }
    }
    if (o.outcome === 'ok') {
      const agg = typeof o.updateOutcome === 'string'
        ? {
            aggiornato: {
              ...(typeof o.oldVersion === 'string' ? { da: o.oldVersion } : {}),
              ...(typeof o.newVersion === 'string' ? { a: o.newVersion } : {}),
              giaUltima: o.updateOutcome === 'up_to_date'
            }
          }
        : {}
      return { ok: true, ...(messaggio !== '' ? { detto: messaggio } : {}), ...agg }
    }
    if (codice === 'already_in_goal_state' || o.alreadyInGoalState === true) {
      return { ok: true, giaFatto: true, ...(messaggio !== '' ? { detto: messaggio } : {}) }
    }
    return { ok: false, messaggio: motivoLeggibile(messaggio), ...(codice !== undefined ? { codice } : {}) }
  }
  const out = r.stdout + '\n' + r.stderr
  if (/✔/.test(out) && !/✘/.test(out)) return { ok: true }
  if (!/✘/.test(out) && r.ok) return { ok: true }
  const righe = out.split('\n').map((x) => x.replace(/[✔✘]/g, '').trim()).filter((x) => x !== '')
  const rilevante = righe.find((x) => /fail|error|not found|impossibile|non /i.test(x)) ?? righe[righe.length - 1] ?? ''
  return { ok: false, messaggio: motivoLeggibile(rilevante) }
}

/**
 * Se c'è una versione più nuova di un plugin installato.
 *
 * Tre strade, dalle risposte vere: un marketplace in una cartella dice
 * `folderVersion` accanto a `version`; un catalogo con `version` si
 * confronta; uno con il solo `sha` del commit si confronta con la versione
 * installata, che per i plugin presi da git comincia con i primi 12 caratteri
 * di quel commit. Senza nessuna delle tre non si sa, e non si dice.
 */
export function aggiornamentoDisponibile(
  installato: { version?: string; folderVersion?: string },
  catalogo?: { version?: string; sha?: string }
): { aggiornamento: boolean; nuova?: string } {
  const v = installato.version
  if (v === undefined || v === '') return { aggiornamento: false }
  if (installato.folderVersion !== undefined && installato.folderVersion !== '' && installato.folderVersion !== v) {
    return { aggiornamento: true, nuova: installato.folderVersion }
  }
  if (catalogo?.version !== undefined && catalogo.version !== '' && catalogo.version !== v && !v.startsWith(catalogo.version + '-')) {
    return { aggiornamento: true, nuova: catalogo.version }
  }
  const sha = catalogo?.sha
  if (sha !== undefined && /^[0-9a-f]{12}(-|$)/.test(v) && !sha.startsWith(v.slice(0, 12))) {
    return { aggiornamento: true, nuova: sha.slice(0, 12) }
  }
  return { aggiornamento: false }
}

/**
 * `claude mcp list`, riga per riga: «nome: come - ✔ Connected». Il nome può
 * avere spazi (i connettori di claude.ai), il «come» due punti (gli
 * indirizzi): si taglia al primo «: » e all'ultimo « - » prima del glifo.
 */
export function saluteDaMcpList(testo: string): Record<string, { salute: SaluteMcp; come: string; motivo?: string }> {
  const fuori: Record<string, { salute: SaluteMcp; come: string; motivo?: string }> = {}
  for (const riga of testo.split(/\r?\n/)) {
    const m = /^(.+?): (.*) - ([✔✘!⏸⊘])\s*(.*)$/.exec(riga.trim())
    if (m === null) continue
    const nome = m[1] as string
    const glifo = m[3] as string
    const resto = (m[4] ?? '').trim()
    let salute: SaluteMcp
    if (glifo === '✔') salute = 'connesso'
    else if (glifo === '⏸') salute = 'da-approvare'
    else if (glifo === '⊘') salute = 'spento'
    else if (glifo === '!') salute = 'da-autenticare'
    else salute = /rejected/i.test(resto) ? 'rifiutato' : 'errore'
    const dettaglio = resto.includes('—') ? resto.slice(resto.indexOf('—') + 1).trim() : ''
    fuori[nome] = { salute, come: m[2] as string, ...(salute === 'errore' ? { motivo: dettaglio || resto } : {}) }
  }
  return fuori
}

/**
 * Il catalogo per un telefono: non i 3500 plugin di oggi, ma gli installati
 * più quelli che corrispondono alla ricerca (o i più installati, senza
 * ricerca), fino a un tetto. `totale` dice quanti ce ne sarebbero.
 */
export function vetrina(plugin: PluginVoce[], q: string, tetto: number): { plugin: PluginVoce[]; totale: number } {
  const parola = q.trim().toLowerCase()
  const corrisponde = (p: PluginVoce): boolean =>
    parola === '' || p.nome.toLowerCase().includes(parola) || p.descrizione.toLowerCase().includes(parola) || p.id.toLowerCase().includes(parola)
  const trovati = plugin.filter(corrisponde)
  const ordinati = [...trovati].sort((a, b) =>
    Number(b.installato) - Number(a.installato) || (b.installazioni ?? 0) - (a.installazioni ?? 0) || a.nome.localeCompare(b.nome))
  const installati = ordinati.filter((p) => p.installato)
  const altri = ordinati.filter((p) => !p.installato).slice(0, Math.max(0, tetto - (parola === '' ? 0 : installati.length)))
  return { plugin: [...installati, ...altri], totale: trovati.length }
}

/** Un valore che sembra un segreto non si mostra: né sul PC né, soprattutto, sul telefono. */
const PAROLA_SEGRETA = /(token|key|secret|password|passwd|pass|auth|bearer|credential|api[-_]?key)/i

/**
 * Il comando o l'indirizzo di un MCP da mostrare: gli argomenti dopo un
 * `--token`, i `CHIAVE=valore` con nomi da segreto, la parte utente:password
 * e i parametri da segreto di un indirizzo diventano «•••».
 */
export function comeMostrare(cfg: { command?: string; args?: unknown; url?: string }): string {
  if (typeof cfg.url === 'string' && cfg.url !== '') {
    let u = cfg.url.replace(/\/\/[^/@\s]+@/, '//•••@')
    u = u.replace(/([?&])([^=&#]+)=([^&#]*)/g, (t, sep: string, k: string) => (PAROLA_SEGRETA.test(k) ? sep + k + '=•••' : t))
    return u
  }
  const args = Array.isArray(cfg.args) ? cfg.args.filter((a): a is string => typeof a === 'string') : []
  const fuori: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string
    const prima = i > 0 ? (args[i - 1] as string) : ''
    if (/^-/.test(prima) && PAROLA_SEGRETA.test(prima) && !/^-/.test(a)) fuori.push('•••')
    else if (/^[^=\s]+=/.test(a) && PAROLA_SEGRETA.test(a.slice(0, a.indexOf('=')))) fuori.push(a.slice(0, a.indexOf('=') + 1) + '•••')
    else fuori.push(a)
  }
  return [cfg.command ?? '', ...fuori].filter((x) => x !== '').join(' ')
}

/** Com'è andata un'azione del negozio: il motivo se no, cosa cambia se sì. */
export type EsitoNegozio = {
  ok: boolean
  messaggio?: string
  fatto?: string
  codice?: string
  conferma?: { sha256: string; comando: string }
}

export type MarketplaceVoce = { nome: string; tipo: string; riferimento: string; ufficiale: boolean; aggiornato?: string }

export type AgenteVoce = {
  nome: string; descrizione: string; origine: 'utente' | 'progetto'
  percorso: string; strumenti?: string; modello?: string
}

export type ScopeNegozio = { pluginSpenti: string[]; skillSpente: string[]; mcpSpenti: string[] }

export type NuovoMcpModulo = {
  nome: string
  ambito: 'locale' | 'utente' | 'progetto'
  tipo: 'stdio' | 'http' | 'sse'
  comando?: string
  argomenti?: string[]
  url?: string
  variabili?: Record<string, string>
  intestazioni?: Record<string, string>
}

export type ModificheMcpModulo = { variabili?: Record<string, string | null>; intestazioni?: Record<string, string | null> }

/** Il negozio come lo vede il pannello del PC (preload ↔ processo principale). */
export type ApiNegozio = {
  plugin: (fresco?: boolean) => Promise<{ plugin: PluginVoce[]; errore?: string }>
  installaPlugin: (id: string, accetta?: string) => Promise<EsitoNegozio>
  aggiornaPlugin: (id: string, accetta?: string) => Promise<EsitoNegozio>
  disinstallaPlugin: (id: string) => Promise<EsitoNegozio>
  commutaPlugin: (id: string, on: boolean) => Promise<EsitoNegozio>
  skill: (cwd?: string) => Promise<SkillVoce[]>
  commutaSkill: (nome: string, on: boolean) => Promise<EsitoNegozio>
  creaSkill: (dove: 'utente' | 'progetto', cwd: string | undefined, dati: { nome: string; descrizione: string; istruzioni: string }) => Promise<EsitoNegozio>
  importaSkill: (dove: 'utente' | 'progetto', cwd: string | undefined) => Promise<EsitoNegozio>
  togliSkill: (percorso: string, cwd: string | undefined) => Promise<EsitoNegozio>
  mcp: (cwd: string) => Promise<McpVoce[]>
  saluteMcp: (cwd: string) => Promise<{ mcp: McpVoce[]; errore?: string }>
  commutaMcp: (cwd: string, nome: string, on: boolean) => Promise<EsitoNegozio>
  approvaMcp: (cwd: string, nome: string, si: boolean) => Promise<EsitoNegozio>
  aggiungiMcp: (cwd: string, dati: NuovoMcpModulo) => Promise<EsitoNegozio>
  togliMcp: (cwd: string, nome: string, ambito: AmbitoMcp) => Promise<EsitoNegozio>
  variabiliMcp: (cwd: string, nome: string, ambito: AmbitoMcp, modifiche: ModificheMcpModulo) => Promise<EsitoNegozio>
  agenti: (cwd?: string) => Promise<AgenteVoce[]>
  dettagliPlugin: (id: string) => Promise<{ testo: string; errore?: string }>
  marketplace: () => Promise<{ marketplace: MarketplaceVoce[]; errore?: string }>
  aggiungiMarketplace: (sorgente: string) => Promise<EsitoNegozio>
  rimuoviMarketplace: (nome: string) => Promise<EsitoNegozio>
  aggiornaMarketplace: (nome?: string) => Promise<EsitoNegozio>
  rivela: (percorso: string) => Promise<void>
  scope: (cwd: string) => Promise<ScopeNegozio>
  impostaScope: (cwd: string, scope: ScopeNegozio) => Promise<{ ok: boolean; messaggio?: string }>
}
