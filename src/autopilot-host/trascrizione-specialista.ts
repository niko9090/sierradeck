import { closeSync, existsSync, fstatSync, openSync, readdirSync, readFileSync, readSync } from 'node:fs'
import { join } from 'node:path'
import type { RigaSpecialista } from '@shared/piano-orchestratore'

/**
 * Le chat degli specialisti, da guardare (0.90.0).
 *
 * Nicholas, 02/11: «non vedo chat sulla destra attive, sono tutte dentro
 * all'autopilota»; e poi «se l'autopilota è fatto bene non mi dovrebbe servire
 * scrivere all'interno». Gli specialisti sono sottoagenti del `claude -p`
 * dell'autopilota: niente terminale, ma la CLI scrive la loro conversazione in
 * `<progetti>/<slug>/<sessione>/subagents/agent-<id>.jsonl`, con accanto un
 * `.meta.json` che dice il `toolUseId` dell'Agent che l'ha lanciato. Qui la si
 * trova e la si riduce a righe da leggere.
 *
 * Non solleva mai: è il file di un altro programma, a metà di una scrittura.
 */

/** Quanto della coda del file si legge: le ultime cose, non tutta la storia. */
const CODA_BYTE = 512 * 1024
export const RIGHE_SPECIALISTA = 80

const SCRITTO = /has been (updated|created) successfully|^File created successfully/iu

const slug = (percorso: string): string => percorso.replace(/[^a-zA-Z0-9]/g, '-')

/** Il file della conversazione di uno specialista, dall'id dell'Agent (o dell'agente). */
export function trovaTrascrizione(cartellaClaude: string, cwd: string, s: { id: string; agente?: string }): string | undefined {
  const progetto = join(cartellaClaude, 'projects', slug(cwd))
  let sessioni: string[]
  try { sessioni = readdirSync(progetto, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => join(progetto, d.name, 'subagents')) } catch { return undefined }
  if (s.agente !== undefined && s.agente !== '') {
    for (const d of sessioni) {
      const f = join(d, `agent-${s.agente}.jsonl`)
      if (existsSync(f)) return f
    }
  }
  for (const d of sessioni) {
    let nomi: string[]
    try { nomi = readdirSync(d).filter((n) => n.endsWith('.meta.json')) } catch { continue }
    for (const n of nomi) {
      try {
        const m = JSON.parse(readFileSync(join(d, n), 'utf8')) as { toolUseId?: unknown }
        if (m.toolUseId === s.id) return join(d, n.replace(/\.meta\.json$/u, '.jsonl'))
      } catch { /* a metà di una scrittura */ }
    }
  }
  return undefined
}

function codaDel(file: string): string {
  let fd: number | undefined
  try {
    fd = openSync(file, 'r')
    const n = fstatSync(fd).size
    const da = Math.max(0, n - CODA_BYTE)
    const b = Buffer.alloc(n - da)
    readSync(fd, b, 0, b.length, da)
    const t = b.toString('utf8')
    // Tagliata in mezzo: la prima riga è un pezzo.
    return da > 0 ? t.slice(t.indexOf('\n') + 1) : t
  } catch {
    return ''
  } finally {
    if (fd !== undefined) try { closeSync(fd) } catch { /* già chiuso */ }
  }
}

const breve = (t: string, n: number): string => {
  const x = t.replace(/\s+/gu, ' ').trim()
  return x.length > n ? `${x.slice(0, n - 1)}…` : x
}

/** Cosa fa uno strumento, in una riga: «Bash · npm test», «Edit · src/a.ts». */
function rigaStrumento(nome: string, input: Record<string, unknown>): string {
  const s = (k: string): string => (typeof input[k] === 'string' ? (input[k] as string) : '')
  // Di un file bastano le ultime due parti: il resto è la copia dello specialista, sempre uguale.
  const file = s('file_path') || s('notebook_path')
  const corto = file !== '' ? file.split(/[\\/]/u).filter((p) => p !== '').slice(-2).join('/') : ''
  const cosa = s('command') || corto || s('pattern') || s('url') || s('query') || s('description') || s('prompt')
  return cosa !== '' ? `${nome} · ${breve(cosa, 200)}` : nome
}

/** Pura: le righe da leggere di una conversazione jsonl (le ultime `max`). */
export function righeDa(jsonl: string, max = RIGHE_SPECIALISTA): RigaSpecialista[] {
  const out: RigaSpecialista[] = []
  for (const riga of jsonl.split('\n')) {
    if (riga.trim() === '') continue
    let e: { type?: unknown; timestamp?: unknown; message?: { content?: unknown } }
    try { e = JSON.parse(riga) as typeof e } catch { continue }
    const quando = typeof e.timestamp === 'string' ? e.timestamp : undefined
    const con = (r: Omit<RigaSpecialista, 'quando'>): void => { out.push(quando !== undefined ? { ...r, quando } : r) }
    const c = e.message?.content
    if (e.type === 'user') {
      if (typeof c === 'string') { con({ tipo: 'compito', testo: breve(c, 1200) }); continue }
      if (!Array.isArray(c)) continue
      for (const b of c as Array<Record<string, unknown>>) {
        if (b.type === 'text' && typeof b.text === 'string') con({ tipo: 'compito', testo: breve(b.text, 1200) })
        else if (b.type === 'tool_result') {
          const t = typeof b.content === 'string' ? b.content : Array.isArray(b.content) ? (b.content as Array<Record<string, unknown>>).map((x) => (typeof x.text === 'string' ? x.text : '')).join(' ') : ''
          // «The file … has been updated successfully»: la riga dello strumento lo dice già.
          if (t.trim() === '' || (b.is_error !== true && SCRITTO.test(t))) continue
          con({ tipo: 'esito', testo: breve(t, 240), ...(b.is_error === true ? { errore: true } : {}) })
        }
      }
    } else if (e.type === 'assistant' && Array.isArray(c)) {
      for (const b of c as Array<Record<string, unknown>>) {
        if (b.type === 'text' && typeof b.text === 'string' && b.text.trim() !== '') con({ tipo: 'testo', testo: b.text.trim().slice(0, 4000) })
        else if (b.type === 'tool_use' && typeof b.name === 'string') con({ tipo: 'strumento', testo: rigaStrumento(b.name, (typeof b.input === 'object' && b.input !== null ? b.input : {}) as Record<string, unknown>) })
      }
    }
  }
  return out.slice(-max)
}

export function leggiTrascrizione(file: string, max = RIGHE_SPECIALISTA): RigaSpecialista[] {
  return righeDa(codaDel(file), max)
}
