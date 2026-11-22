import type { CompitoPiano } from '@shared/piano-orchestratore'
import { compitoDallaDescrizione } from '@shared/flusso-orchestratore'
import { chiavePercorso, togliCopiaUnita } from './autopulizia'
import type { GitAsincrono } from './worktree'

/** Le copie di `git worktree list --porcelain` con il loro ramo (senza la prima, che è la cartella principale). */
function copieConRamo(porcelain: string): { cartella: string; ramo?: string }[] {
  return porcelain.split(/\r?\n\r?\n/u).flatMap((blocco) => {
    const righe = blocco.split(/\r?\n/u)
    const w = righe.find((r) => r.startsWith('worktree '))
    if (w === undefined) return []
    const b = righe.find((r) => r.startsWith('branch '))
    return [{ cartella: w.slice('worktree '.length).trim(), ...(b !== undefined ? { ramo: b.slice('branch '.length).trim().replace(/^refs\/heads\//u, '') } : {}) }]
  }).slice(1)
}

/** 22/11: un ramo di specialista deve essere fermo da almeno così, prima che il programma lo tolga (può essere di chi lavora adesso). */
export const RAMO_SUPERATO_DOPO_MS = 10 * 60_000

/**
 * 22/11 (Nicholas: «i rami vecchi fermi e già integrati con altri agenti è inutile tenerli lì»): il compito del ramo è già
 * dentro con il criterio verde (unito da un altro ramo) o è chiuso nel piano? Torna la frase del perché, o niente.
 * Un compito ancora aperto, o unito con criterio rosso, non è superato: il ramo resta e se ne occupa l'autopilota.
 */
export function perCheSuperato(compito: Pick<CompitoPiano, 'id' | 'stato' | 'criterioVerde' | 'ramo' | 'chiuso'> | undefined, ramo: string): string | undefined {
  if (compito === undefined) return undefined
  if (compito.chiuso !== undefined) return `il suo compito ${compito.id} è chiuso nel piano`
  if (compito.stato === 'unito' && compito.criterioVerde === true && compito.ramo !== undefined && compito.ramo !== ramo) {
    return `il suo compito ${compito.id} era già unito da ${compito.ramo}`
  }
  return undefined
}

/** Il compito di un ramo: quello che lo ricorda nel piano, altrimenti quello dell'id nel soggetto del suo ultimo commit. */
export function compitoDelRamo<C extends Pick<CompitoPiano, 'id' | 'ramo' | 'rami'>>(compiti: readonly C[], ramo: string, soggetto: string): C | undefined {
  const citato = compiti.find((c) => c.ramo === ramo || (c.rami ?? []).includes(ramo))
  if (citato !== undefined) return citato
  const id = compitoDallaDescrizione(soggetto)
  return id !== undefined ? compiti.find((c) => c.id === id) : undefined
}

export type RamoSuperato = { ramo: string; compito: string; perche: string }

/**
 * Il giro: fra i rami `worktree-agent-*` (con il momento dell'ultimo commit, in millisecondi) toglie quelli superati.
 * `protetti`: rami di compiti aperti o in fila, di specialisti vivi, di chat «solo mia»: non si toccano mai.
 * Torna i tolti e, per i superati che non si sono potuti togliere, il motivo.
 */
export async function togliRamiSuperati(g: GitAsincrono, p: {
  cwd: string
  compiti: readonly CompitoPiano[]
  rami: readonly { ramo: string; quando: number }[]
  protetti: ReadonlySet<string>
  ora: number
  fermoAlmenoMs?: number
}): Promise<{ tolti: RamoSuperato[]; nonTolti: { ramo: string; motivo: string }[] }> {
  const tolti: RamoSuperato[] = []
  const nonTolti: { ramo: string; motivo: string }[] = []
  const wt = await g(['worktree', 'list', '--porcelain'], p.cwd)
  const cartelle = wt.codice === 0 ? copieConRamo(wt.uscita) : []
  for (const { ramo, quando } of p.rami) {
    if (!ramo.startsWith('worktree-agent-') || p.protetti.has(ramo)) continue
    if (!Number.isFinite(quando) || p.ora - quando < (p.fermoAlmenoMs ?? RAMO_SUPERATO_DOPO_MS)) continue
    const s = await g(['log', '--no-merges', '--format=%s', '-n', '1', `refs/heads/${ramo}`], p.cwd)
    const k = compitoDelRamo(p.compiti, ramo, s.codice === 0 ? (s.uscita.split(/\r?\n/u)[0] ?? '').trim() : '')
    const perche = perCheSuperato(k, ramo)
    if (perche === undefined || k === undefined) continue
    const r = await togliRamoSuperato(g, { cwd: p.cwd, ramo, cartelle })
    if (r.tolto) tolti.push({ ramo, compito: k.id, perche })
    else nonTolti.push({ ramo, motivo: r.motivo ?? '' })
  }
  return { tolti, nonTolti }
}

/**
 * Toglie, in locale, la copia di lavoro e il ramo di uno specialista superato. Mai dal remoto. La giunzione a
 * `node_modules` si stacca con `togliCopiaUnita` (rmdir/unlink del collegamento, mai dentro). Se la copia non si
 * toglie, il ramo resta (git non lascia cancellare un ramo con la copia attiva).
 */
export async function togliRamoSuperato(g: GitAsincrono, p: { cwd: string; ramo: string; cartelle: readonly { cartella: string; ramo?: string }[] }): Promise<{ tolto: boolean; motivo?: string }> {
  if (!p.ramo.startsWith('worktree-agent-')) return { tolto: false, motivo: 'non è un ramo di specialista' }
  const sua = p.cartelle.find((v) => v.ramo === p.ramo)
  if (sua !== undefined) {
    if (chiavePercorso(sua.cartella) === chiavePercorso(p.cwd)) return { tolto: false, motivo: 'è nella cartella principale' }
    const r = await togliCopiaUnita(g, { cwd: p.cwd, cartella: sua.cartella, ramo: p.ramo, forza: true })
    if (!r.tolta) return { tolto: false, motivo: r.motivo ?? 'la copia non si è tolta' }
  }
  // `togliCopiaUnita` toglie già il ramo: se non c'è più, è fatto.
  const resta = await g(['rev-parse', '--verify', '--quiet', `refs/heads/${p.ramo}`], p.cwd)
  if (resta.codice !== 0) return { tolto: true }
  const b = await g(['branch', '-D', p.ramo], p.cwd)
  return b.codice === 0 ? { tolto: true } : { tolto: false, motivo: b.uscita.slice(0, 160) }
}
