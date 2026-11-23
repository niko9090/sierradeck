/**
 * Il registro e il piano di un workspace, letti da un altro PC (k-197d).
 *
 * Il PC di riferimento non vede il registro delle unioni di prova e dei criteri
 * (né il piano) di un workspace che vive su un altro PC: `/api/lavori/registro`,
 * di sola lettura e firmata con la chiave di casa come le altre rotte fra PC, li
 * dà. Solo righe di registro che parlano di unioni e criteri (filtrate per quel
 * workspace, con un tetto di righe e di byte) e, del piano, compiti, stati ed
 * esiti: mai testi di chat né contenuto di file.
 */

export const ROTTA_REGISTRO_WORKSPACE = '/api/lavori/registro'
export const MAX_RIGHE_REGISTRO = 60
export const MAX_BYTE_REGISTRO = 12 * 1024
export const MAX_COMPITI_PIANO = 60
const MAX_RIGA = 300

/** Un compito del piano, ridotto a quello che si può dire a un altro PC. */
export type CompitoVisto = {
  id: string
  richiesta: string
  titolo: string
  stato: string
  peso: number
  criterioVerde?: boolean
  esito?: string
  chiuso?: string
}

export type RichiestaVista = { id: string; titolo: string; stato: string }

export type PianoVisto = { compiti: CompitoVisto[]; richieste: RichiestaVista[] }

export type RegistroWorkspaceVisto = {
  ospitato: true
  workspace: string
  /** Le righe recenti del registro, dalla più vecchia, già dentro i tetti. */
  righe: string[]
  /** Quante righe pertinenti c'erano prima del tetto. */
  righeTotali: number
  piano: PianoVisto
}

export type RispostaRegistroWorkspace = RegistroWorkspaceVisto | { ospitato: false; workspace: string }

const ORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z \[[^\]]+\] \[[^\]]+\] (.*)$/
const SEGNO = /^\[(?:unione di prova|criterio)\] \[ws: ([^\]]+)\] /
const DELL_ORCHESTRATORE = /^\[orchestratore\] (.+?) — (.*)$/

/** Un nome di workspace è accettabile se è corto e senza caratteri di controllo. */
export function workspaceValido(x: unknown): x is string {
  // eslint-disable-next-line no-control-regex
  return typeof x === 'string' && x.trim() !== '' && x.length <= 1000 && !/[\u0000-\u001f\u007f]/.test(x)
}

/** Questa riga di registro parla di unioni o criteri del workspace dato? */
export function rigaDelWorkspace(riga: string, workspace: string): boolean {
  const m = ORA.exec(riga)
  if (m === null) return false
  const t = m[1] as string
  const s = SEGNO.exec(t)
  if (s !== null) return (s[1] as string).trim() === workspace.trim()
  const o = DELL_ORCHESTRATORE.exec(t)
  if (o !== null && o[1] === workspace) return /unione in fila|ripres[ao] dopo il riavvio|\(scaduta/.test(o[2] as string)
  return false
}

/** Le righe del workspace, le più recenti dentro i due tetti, dalla più vecchia. */
export function righeDelWorkspace(
  righe: readonly string[], workspace: string, tetto: { righe?: number; byte?: number } = {}
): { righe: string[]; totali: number } {
  const maxRighe = Math.max(0, tetto.righe ?? MAX_RIGHE_REGISTRO)
  const maxByte = Math.max(0, tetto.byte ?? MAX_BYTE_REGISTRO)
  const buone = righe.filter((r) => rigaDelWorkspace(r, workspace)).map((r) => r.replace(/\r$/, '').slice(0, MAX_RIGA))
  const fuori: string[] = []
  let byte = 0
  for (let i = buone.length - 1; i >= 0 && fuori.length < maxRighe; i--) {
    const peso = new TextEncoder().encode(buone[i] as string).length + 1
    if (byte + peso > maxByte) break
    byte += peso
    fuori.unshift(buone[i] as string)
  }
  return { righe: fuori, totali: buone.length }
}

/** Il corpo di una richiesta: il workspace, e basta. */
export function leggiRichiestaRegistro(x: unknown): { ok: true; workspace: string } | { ok: false; errore: string } {
  const w = typeof x === 'object' && x !== null ? (x as { workspace?: unknown }).workspace : undefined
  return workspaceValido(w) ? { ok: true, workspace: w.trim() } : { ok: false, errore: 'serve il workspace' }
}

const corto = (s: unknown, n: number): string => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '')

/** Riduce il piano e la coda a stati ed esiti: nessun testo di chat, nessun contenuto di file. */
export function pianoVisto(
  compiti: ReadonlyArray<{ id: string; richiesta: string; titolo: string; stato: string; peso: number; criterioVerde?: boolean; esito?: string; chiuso?: { come: string } }>,
  richieste: ReadonlyArray<{ id: string; titolo: string; stato: string }>
): PianoVisto {
  return {
    compiti: compiti.slice(-MAX_COMPITI_PIANO).map((c) => ({
      id: corto(c.id, 60), richiesta: corto(c.richiesta, 60), titolo: corto(c.titolo, 120), stato: corto(c.stato, 40), peso: c.peso,
      ...(c.criterioVerde !== undefined ? { criterioVerde: c.criterioVerde } : {}),
      ...(c.esito !== undefined && c.esito !== '' ? { esito: corto(c.esito, 200) } : {}),
      ...(c.chiuso !== undefined ? { chiuso: corto(c.chiuso.come, 40) } : {})
    })),
    richieste: richieste.slice(-MAX_COMPITI_PIANO).map((r) => ({ id: corto(r.id, 60), titolo: corto(r.titolo, 120), stato: corto(r.stato, 40) }))
  }
}

/** Il riassunto in markdown per l'autopilota, da aggiungere al riassunto dei lavori. */
export function testoRegistroRemoto(pc: string, v: RegistroWorkspaceVisto): string {
  const aperti = v.piano.compiti.filter((c) => c.chiuso === undefined && !(c.stato === 'unito' && c.criterioVerde === true))
  return [
    `### Registro di ${v.workspace} su ${pc}`,
    '',
    `Compiti: ${v.piano.compiti.length}, ancora aperti ${aperti.length}.`,
    ...aperti.slice(0, 15).map((c) => `- ${c.id} (${c.stato}${c.criterioVerde === false ? ', criterio rosso' : ''}): ${c.titolo}${c.esito !== undefined ? ` — ${c.esito}` : ''}`),
    '',
    `Righe recenti (${v.righe.length} di ${v.righeTotali}):`,
    '',
    '```',
    ...v.righe,
    '```',
    ''
  ].join('\n')
}
