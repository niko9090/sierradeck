export type ParsedUsage = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export type ParsedLine = {
  type: string
  timestamp?: string
  cwd?: string
  gitBranch?: string
  version?: string
  permissionMode?: string
  model?: string
  aiTitle?: string
  usage?: ParsedUsage
  isMessage: boolean
  /**
   * Il testo che ha scritto l'utente, se questa riga è un suo messaggio.
   *
   * Serve a riconoscere di che cosa parla una conversazione quando il titolo
   * non c'è — sei sessioni su dieci — e a distinguere due chat che il titolo ce
   * l'hanno uguale.
   */
  testoUtente?: string
  /**
   * Riga che non è farina dell'utente: preamboli iniettati dal sistema
   * (`isMeta`) e messaggi dei sottoagenti (`isSidechain`).
   */
  diServizio: boolean
}

const MESSAGE_TYPES = new Set(['user', 'assistant'])

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined
}

/**
 * Il testo di un messaggio utente, nelle due forme in cui Claude Code lo scrive.
 *
 * I risultati degli strumenti sono anch'essi messaggi «user»: contarli farebbe
 * diventare l'output di un comando il prompt che ha aperto la conversazione.
 */
function testoDelMessaggio(message: Record<string, unknown> | undefined): string | undefined {
  if (message === undefined) return undefined
  const content = message.content
  if (typeof content === 'string') return content === '' ? undefined : content
  if (!Array.isArray(content)) return undefined
  for (const blocco of content) {
    if (typeof blocco !== 'object' || blocco === null) continue
    const b = blocco as Record<string, unknown>
    if (b.type === 'text' && typeof b.text === 'string' && b.text !== '') return b.text
  }
  return undefined
}

export function parseLine(line: string): ParsedLine | undefined {
  if (line.trim() === '') return undefined

  let raw: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(line)
    if (typeof parsed !== 'object' || parsed === null) return undefined
    raw = parsed as Record<string, unknown>
  } catch {
    return undefined
  }

  const type = str(raw.type)
  if (type === undefined) return undefined

  const message = (typeof raw.message === 'object' && raw.message !== null)
    ? (raw.message as Record<string, unknown>)
    : undefined

  const usageRaw = (message !== undefined && typeof message.usage === 'object' && message.usage !== null)
    ? (message.usage as Record<string, unknown>)
    : undefined

  return {
    type,
    timestamp: str(raw.timestamp),
    cwd: str(raw.cwd),
    gitBranch: str(raw.gitBranch),
    version: str(raw.version),
    permissionMode: str(raw.permissionMode),
    model: message !== undefined ? str(message.model) : undefined,
    // Il campo si chiama `aiTitle`, non `title`: verificato sui file reali.
    aiTitle: type === 'ai-title' ? str(raw.aiTitle) : undefined,
    usage: usageRaw !== undefined
      ? {
          input: num(usageRaw.input_tokens),
          output: num(usageRaw.output_tokens),
          cacheRead: num(usageRaw.cache_read_input_tokens),
          cacheWrite: num(usageRaw.cache_creation_input_tokens)
        }
      : undefined,
    isMessage: MESSAGE_TYPES.has(type),
    testoUtente: type === 'user' ? testoDelMessaggio(message) : undefined,
    diServizio: raw.isMeta === true || raw.isSidechain === true
  }
}
