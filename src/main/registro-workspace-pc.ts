import {
  leggiRichiestaRegistro, pianoVisto, righeDelWorkspace, ROTTA_REGISTRO_WORKSPACE,
  type PianoVisto, type RegistroWorkspaceVisto, type RispostaRegistroWorkspace
} from '@shared/registro-workspace'
import type { ClientPcRemoto } from './pc-remoto'

/**
 * Il registro e il piano di un workspace per un altro PC (k-197d), sul canale
 * che c'è già: `/api/lavori/registro` fra le rotte del Client, firmata con la
 * chiave di casa (`pc-remoto.ts`). Qui chi risponde e chi chiede.
 */

/** Quello che sa questo PC; ogni voce è iniettabile (i test non toccano il disco). */
export type FonteRegistroWorkspace = {
  /** Le righe dei registri di questi giorni (le più vecchie prima). */
  righe: () => string[]
  /** Il workspace vive su questo PC? */
  ospita: (workspace: string) => Promise<boolean> | boolean
  /** Compiti e richieste, già ridotti. */
  piano: (workspace: string) => Promise<PianoVisto | undefined>
}

const daAltroPc = (d: string | undefined): boolean => d !== undefined && (d === 'pc' || d.startsWith('pc:')) && !d.startsWith('pc:tel:')

/**
 * La rotta di chi risponde: `undefined` se non è `/api/lavori/registro`. Senza
 * fonte (l'Aiutante non ospita workspace) risponde che non lo ospita.
 */
export async function rispondiRegistroWorkspace(
  r: { metodo: string; percorso: string; corpo: unknown; dispositivo?: string }, fonte: FonteRegistroWorkspace | undefined
): Promise<{ stato: number; corpo: unknown } | undefined> {
  if (r.percorso !== ROTTA_REGISTRO_WORKSPACE) return undefined
  if (r.metodo !== 'POST') return { stato: 405, corpo: { errore: 'solo POST' } }
  if (!daAltroPc(r.dispositivo)) return { stato: 403, corpo: { errore: 'Il registro dei lavori si chiede da un altro PC con la stessa cassaforte.' } }
  const l = leggiRichiestaRegistro(r.corpo)
  if (!l.ok) return { stato: 400, corpo: { errore: l.errore } }
  const non: RispostaRegistroWorkspace = { ospitato: false, workspace: l.workspace }
  if (fonte === undefined) return { stato: 200, corpo: non }
  try {
    if (!(await fonte.ospita(l.workspace))) return { stato: 200, corpo: non }
    const { righe, totali } = righeDelWorkspace(fonte.righe(), l.workspace)
    const piano = (await fonte.piano(l.workspace)) ?? pianoVisto([], [])
    const corpo: RegistroWorkspaceVisto = { ospitato: true, workspace: l.workspace, righe, righeTotali: totali, piano }
    return { stato: 200, corpo }
  } catch (err) {
    return { stato: 500, corpo: { errore: `non riesco a leggere il registro: ${(err instanceof Error ? err.message : String(err)).slice(0, 160)}` } }
  }
}

const eRisposta = (x: unknown): x is RispostaRegistroWorkspace => {
  const o = typeof x === 'object' && x !== null ? x as Record<string, unknown> : undefined
  if (o === undefined || typeof o.workspace !== 'string') return false
  if (o.ospitato === false) return true
  return o.ospitato === true && Array.isArray(o.righe) && o.righe.every((s) => typeof s === 'string') && typeof o.righeTotali === 'number' &&
    typeof o.piano === 'object' && o.piano !== null && Array.isArray((o.piano as PianoVisto).compiti)
}

/**
 * Dal lato di chi chiede: il registro e il piano di un workspace di un altro
 * PC. Mai un'eccezione: `undefined` se quel PC non risponde, è più vecchio o
 * dà una risposta che non torna.
 */
export async function chiediRegistroWorkspace(
  client: Pick<ClientPcRemoto, 'chiama'>, pcId: string, workspace: string
): Promise<RispostaRegistroWorkspace | undefined> {
  try {
    const r = await client.chiama(pcId, ROTTA_REGISTRO_WORKSPACE, { workspace })
    return eRisposta(r) ? r : undefined
  } catch {
    return undefined
  }
}
