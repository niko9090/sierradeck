export type SpawnOptions = {
  sessionUuid: string
  cwd: string
  command: string
  args: string[]
  cols: number
  rows: number
  /**
   * Variabili da aggiungere all'ambiente della chat.
   *
   * Servono a dirottare Claude Code su un'API diversa da quella di Anthropic.
   * Le decide il Core: l'host non sa niente di provider, riceve un ambiente e
   * lo passa al processo.
   */
  env?: Record<string, string>
}

export type CoreToHost =
  | ({ id: string; kind: 'spawn' } & SpawnOptions)
  | { id: string; kind: 'write'; data: string }
  | { id: string; kind: 'resize'; cols: number; rows: number }
  | { id: string; kind: 'kill' }
  /**
   * Chiede all'host di riagganciare un riquadro a un pty già esistente.
   *
   * La risposta è `scrollback` se quel pty c'è, `assente` se non c'è: è l'host a
   * saperlo, non il Core. Vedi D14 nel piano — un elenco dei vivi tenuto dal
   * Core sarebbe una seconda verità e divergerebbe nella finestra fra la morte
   * di un pty e l'arrivo del suo `exit`.
   */
  | { id: string; kind: 'attach' }
  /**
   * Spegnimento ordinato dell'intero host: chiude tutti i terminali ed esce.
   *
   * È l'unica variante senza `id`, e l'assenza del campo è deliberata. Un id
   * convenzionale come `'*'` vivrebbe nello stesso spazio dei nomi degli id
   * veri (uuid generati dal Core): il Core lo aggiungerebbe o lo toglierebbe
   * da `live` come se fosse un pty, e l'host proverebbe a rispondergli. Il
   * tipo deve dire la verità — questo messaggio non ha un destinatario — e
   * così facendo costringe il typecheck a segnalare ogni punto che dava per
   * scontato che ogni messaggio ne avesse uno.
   */
  | { kind: 'shutdown' }

/**
 * I messaggi diretti a un singolo pty: tutto `CoreToHost` tranne lo
 * spegnimento. È il tipo che accetta chi instrada per id.
 */
export type CoreToHostPty = Extract<CoreToHost, { id: string }>

export type HostToCore =
  | { id: string; kind: 'spawned'; pid: number }
  | { id: string; kind: 'data'; data: string }
  | { id: string; kind: 'exit'; code: number }
  | { id: string; kind: 'error'; message: string }
  /** Risposta ad `attach`: il pty esiste, ecco l'output conservato. */
  | { id: string; kind: 'scrollback'; data: string }
  /**
   * Risposta ad `attach`: quel pty non esiste più.
   *
   * Distinto da `error` di proposito: `error` significa «è andato storto
   * qualcosa», e il riquadro lo mostra all'utente. Questo significa «rilancia»,
   * ed è un esito normale — succede a ogni riavvio dell'applicazione.
   */
  | { id: string; kind: 'assente' }

export function encodeMessage(msg: unknown): string {
  return JSON.stringify(msg) + '\n'
}

/**
 * Le righe illeggibili non spariscono: finiscono in `dropped`, e sta al
 * chiamante renderle visibili. Il vincolo globale "nessun fallimento
 * silenzioso" vale anche qui, non solo nell'interfaccia.
 */
export function decodeMessages(buffer: string): {
  messages: unknown[]
  rest: string
  dropped: string[]
} {
  const parts = buffer.split('\n')
  const rest = parts.pop() ?? ''
  const messages: unknown[] = []
  const dropped: string[] = []
  for (const line of parts) {
    if (line.trim() === '') continue
    try {
      messages.push(JSON.parse(line))
    } catch {
      dropped.push(line)
    }
  }
  return { messages, rest, dropped }
}
