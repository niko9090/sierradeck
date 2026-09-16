/**
 * Le scorciatoie da tastiera: quali azioni esistono, i tasti di fabbrica, e
 * come si legge una pressione di tasti.
 *
 * Nicholas (16/09/2026): «predisponiamo anche le shortcut per spostarsi tra
 * workspace e il resto, facciamoli personalizzabili». Qui sta la parte pura:
 * niente DOM, niente React, così si prova con vitest e la si usa uguale dal
 * pannello delle impostazioni, dalla console e dal terminale.
 *
 * Una combinazione è una stringa canonica come `Ctrl+Shift+Tab`, `Alt+3`,
 * `Ctrl+PageDown`: i modificatori nell'ordine Ctrl, Alt, Shift, poi il tasto
 * scritto con il nome **fisico** (`KeyboardEvent.code`), non con il carattere.
 * Serve il tasto fisico perché con la tastiera italiana Shift+1 dà «!» e
 * AltGr+E dà «€»: se si guardasse il carattere, la stessa scorciatoia varrebbe
 * o no a seconda della lingua. La stringa vuota vuol dire «nessun tasto».
 */

export const AZIONI = [
  'workspaceSuccessivo',
  'workspacePrecedente',
  'workspace1', 'workspace2', 'workspace3', 'workspace4', 'workspace5',
  'workspace6', 'workspace7', 'workspace8', 'workspace9',
  'menuWorkspace',
  'chatSuccessiva',
  'chatPrecedente',
  'nuovaChat',
  'elencoChat',
  'impostazioni',
  'autopiloti',
  'drive',
  'quaderno',
  'negozio',
  'chiudiPannello'
] as const

export type Azione = (typeof AZIONI)[number]

export type Scorciatoie = Record<Azione, string>

/** Cosa fa ogni azione, detto per esteso: è il testo del pannello. */
export const DESCRIZIONE_AZIONE: Record<Azione, string> = {
  workspaceSuccessivo: 'Passa al workspace dopo (dall’ultimo torna al primo)',
  workspacePrecedente: 'Passa al workspace prima (dal primo va all’ultimo)',
  workspace1: 'Vai al 1º workspace',
  workspace2: 'Vai al 2º workspace',
  workspace3: 'Vai al 3º workspace',
  workspace4: 'Vai al 4º workspace',
  workspace5: 'Vai al 5º workspace',
  workspace6: 'Vai al 6º workspace',
  workspace7: 'Vai al 7º workspace',
  workspace8: 'Vai al 8º workspace',
  workspace9: 'Vai al 9º workspace',
  menuWorkspace: 'Apre l’elenco dei workspace (poi frecce e Invio, o scrivi un pezzo del nome)',
  chatSuccessiva: 'Porta il cursore nella chat dopo, nel mosaico',
  chatPrecedente: 'Porta il cursore nella chat prima, nel mosaico',
  nuovaChat: 'Nuova chat (la finestra che chiede dove e come chiamarla)',
  elencoChat: 'L’elenco delle chat per cartella («Riprendi una conversazione»)',
  impostazioni: 'Apre o chiude le Impostazioni',
  autopiloti: 'Apre o chiude gli Autopiloti',
  drive: 'Apre o chiude la scheda Drive',
  quaderno: 'Apre o chiude il Quaderno',
  negozio: 'Apre o chiude il Negozio',
  chiudiPannello: 'Chiude il pannello aperto e torna alla chat'
}

/** I gruppi del pannello, nell'ordine in cui si leggono. */
export const GRUPPI_AZIONI: { titolo: string; azioni: Azione[] }[] = [
  {
    titolo: 'Workspace',
    azioni: ['workspaceSuccessivo', 'workspacePrecedente', 'menuWorkspace',
      'workspace1', 'workspace2', 'workspace3', 'workspace4', 'workspace5',
      'workspace6', 'workspace7', 'workspace8', 'workspace9']
  },
  { titolo: 'Chat', azioni: ['chatSuccessiva', 'chatPrecedente', 'nuovaChat', 'elencoChat'] },
  { titolo: 'Pannelli', azioni: ['impostazioni', 'autopiloti', 'drive', 'quaderno', 'negozio', 'chiudiPannello'] }
]

/**
 * I tasti di fabbrica.
 *
 * Scelti per non pestare i piedi a Claude Code dentro il terminale, che usa
 * quasi tutti i Ctrl+lettera (Ctrl+C, Ctrl+R, Ctrl+U, Ctrl+L, Ctrl+O…), né
 * ad AltGr sulla tastiera italiana (AltGr = Ctrl+Alt: AltGr+E è «€», AltGr+ò
 * è «@»). Restano Ctrl+Shift+lettera, Alt+cifra, e i tasti di spostamento con
 * Ctrl. Ctrl+Shift+C e Ctrl+Shift+V sono copia e incolla e non si toccano.
 */
export const SCORCIATOIE_PREDEFINITE: Scorciatoie = {
  workspaceSuccessivo: 'Ctrl+Tab',
  workspacePrecedente: 'Ctrl+Shift+Tab',
  workspace1: 'Alt+1',
  workspace2: 'Alt+2',
  workspace3: 'Alt+3',
  workspace4: 'Alt+4',
  workspace5: 'Alt+5',
  workspace6: 'Alt+6',
  workspace7: 'Alt+7',
  workspace8: 'Alt+8',
  workspace9: 'Alt+9',
  menuWorkspace: 'Ctrl+Shift+W',
  chatSuccessiva: 'Ctrl+PageDown',
  chatPrecedente: 'Ctrl+PageUp',
  nuovaChat: 'Ctrl+Shift+N',
  elencoChat: 'Ctrl+Shift+E',
  impostazioni: 'Ctrl+,',
  autopiloti: 'Ctrl+Shift+A',
  drive: 'Ctrl+Shift+D',
  quaderno: 'Ctrl+Shift+Q',
  negozio: 'Ctrl+Shift+S',
  chiudiPannello: 'Ctrl+Shift+X'
}

/** Il sottoinsieme di `KeyboardEvent` che serve: niente DOM nei test. */
export type TastoPremuto = {
  code: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

/** Da `KeyboardEvent.code` al nome che si scrive nella combinazione. */
const NOMI_TASTO: Record<string, string> = {
  ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down',
  Comma: ',', Period: '.', Minus: '-', Equal: '=', Slash: '/', Backslash: '\\',
  BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: '\'', Backquote: '`',
  Space: 'Space', Escape: 'Esc'
}

const MODIFICATORI = new Set(['ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'ShiftLeft', 'ShiftRight', 'MetaLeft', 'MetaRight'])

/**
 * La combinazione che rappresenta una pressione, o `undefined` se non è una
 * combinazione da scorciatoia: un modificatore da solo, il tasto Windows, o
 * un carattere senza Ctrl né Alt (che è scrittura, non comando). Fanno
 * eccezione i tasti funzione, che si possono usare anche nudi.
 */
export function combinazioneDi(e: TastoPremuto): string | undefined {
  if (e.metaKey || MODIFICATORI.has(e.code)) return undefined
  const tasto = nomeTasto(e.code)
  if (tasto === undefined) return undefined
  const funzione = /^F\d{1,2}$/.test(tasto)
  if (!e.ctrlKey && !e.altKey && !funzione) return undefined
  const parti: string[] = []
  if (e.ctrlKey) parti.push('Ctrl')
  if (e.altKey) parti.push('Alt')
  if (e.shiftKey) parti.push('Shift')
  parti.push(tasto)
  return parti.join('+')
}

function nomeTasto(code: string): string | undefined {
  if (code in NOMI_TASTO) return NOMI_TASTO[code]
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit\d$/.test(code)) return code.slice(5)
  if (/^Numpad\d$/.test(code)) return 'Num' + code.slice(6)
  if (/^F\d{1,2}$/.test(code)) return code
  if (['Tab', 'Enter', 'Backspace', 'Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown'].includes(code)) return code
  return undefined
}

const TASTI_VALIDI = /^(?:[A-Z]|\d|Num\d|F\d{1,2}|Left|Right|Up|Down|Tab|Enter|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Space|Esc|[,.\-=/\\[\];'`])$/

/** Una stringa è una combinazione scritta bene (o vuota = nessun tasto)? */
export function combinazioneValida(s: unknown): s is string {
  if (typeof s !== 'string') return false
  if (s === '') return true
  const parti = s.split('+')
  // «Ctrl+,» si divide in ['Ctrl', ','] ma «Ctrl++» no: il '+' non è un tasto.
  const tasto = parti[parti.length - 1]
  if (tasto === undefined || !TASTI_VALIDI.test(tasto)) return false
  const mod = parti.slice(0, -1)
  const ordine = ['Ctrl', 'Alt', 'Shift']
  let ultimo = -1
  for (const m of mod) {
    const i = ordine.indexOf(m)
    if (i <= ultimo) return false
    ultimo = i
  }
  const funzione = /^F\d{1,2}$/.test(tasto)
  return mod.includes('Ctrl') || mod.includes('Alt') || funzione
}

/** Le scorciatoie lette da un file: quelle scritte male tornano di fabbrica. */
export function normalizzaScorciatoie(raw: unknown): Scorciatoie {
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const esito = { ...SCORCIATOIE_PREDEFINITE }
  for (const a of AZIONI) {
    const v = o[a]
    if (combinazioneValida(v)) esito[a] = v
  }
  return esito
}

/** L'azione legata a una combinazione, se c'è. Con un doppione vince la prima nell'ordine di `AZIONI`. */
export function azionePer(scorciatoie: Scorciatoie, combinazione: string | undefined): Azione | undefined {
  if (combinazione === undefined || combinazione === '') return undefined
  for (const a of AZIONI) if (scorciatoie[a] === combinazione) return a
  return undefined
}

/** Le combinazioni usate da più di un'azione: il pannello le segna in ambra. */
export function doppioni(scorciatoie: Scorciatoie): Map<string, Azione[]> {
  const per = new Map<string, Azione[]>()
  for (const a of AZIONI) {
    const c = scorciatoie[a]
    if (c === '') continue
    per.set(c, [...(per.get(c) ?? []), a])
  }
  for (const [c, az] of per) if (az.length < 2) per.delete(c)
  return per
}

/**
 * Il workspace su cui andare per «successivo», «precedente» o «il numero N».
 * Con un nome solo non c'è dove andare: `undefined`.
 */
export function workspaceDaAzione(azione: Azione, nomi: string[], attivo: string): string | undefined {
  if (nomi.length === 0) return undefined
  const i = nomi.indexOf(attivo)
  if (azione === 'workspaceSuccessivo') return nomi.length > 1 ? nomi[(i + 1) % nomi.length] : undefined
  if (azione === 'workspacePrecedente') return nomi.length > 1 ? nomi[(i - 1 + nomi.length) % nomi.length] : undefined
  const n = /^workspace(\d)$/.exec(azione)
  if (n === null) return undefined
  const scelto = nomi[Number(n[1]) - 1]
  return scelto !== undefined && scelto !== attivo ? scelto : undefined
}
