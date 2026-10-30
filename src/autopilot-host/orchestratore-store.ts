import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { scriviAtomico } from '@shared/scrittura-atomica'
import { leggiPiano, pianoVuoto, type PercentoWs, type Piano } from '@shared/piano-orchestratore'
import { cartellaWorkspace } from './coda-store'

/**
 * Il disco dell'orchestratore unico (P3), accanto alla coda, in
 * `orchestratori/<workspace>/`:
 * - `orchestratore.json`: l'autopilota del workspace, le impostazioni, la
 *   sessione di `claude -p`, l'ultima percentuale, le domande dell'ultima
 *   ora e gli autopiloti di prima già passati a lui;
 * - `piano.json`: i compiti (`@shared/piano-orchestratore`);
 * - `dialogo.jsonl`: il dialogo con Nicholas, solo aggiunte, mai troncato.
 *   La conversazione nella scheda (`Autopilota.dialogo`) ne tiene la coda.
 */

export type ModelloOrchestratore = 'sonnet' | 'opus'

export type ImpostazioniOrchestratore = {
  /** L'autopilota del workspace: ce n'è uno solo, sempre acceso. */
  autopilota?: string
  attivatoIl?: string
  modello: ModelloOrchestratore
  /** Quanti specialisti insieme in questo workspace: 3 di serie, al più 4. */
  tettoSpecialisti: number
  /** La sessione di `claude -p`, ripresa con `--resume`. */
  sessione?: string
  /** I token di contesto dell'ultima chiamata (dall'`usage`). */
  contesto?: number
  /** Quante volte la sessione è ruotata. */
  rotazioni?: number
  /** La sessione nuova non ha ancora ricevuto le ultime battute del dialogo. */
  daSeminare?: boolean
  percento?: PercentoWs
  /** Quando sono partite le domande a Nicholas (per il tetto all'ora). */
  domande?: string[]
  /** Gli autopiloti di prima già passati a lui (P4): non si riassorbono e vanno nel recupero. */
  assorbiti?: string[]
}

export const TETTO_SPECIALISTI = 3
export const TETTO_SPECIALISTI_MAX = 4

export function impostazioniPredefinite(): ImpostazioniOrchestratore {
  return { modello: 'sonnet', tettoSpecialisti: TETTO_SPECIALISTI }
}

export function leggiImpostazioni(x: unknown): ImpostazioniOrchestratore {
  const d = impostazioniPredefinite()
  if (typeof x !== 'object' || x === null) return d
  const o = x as Record<string, unknown>
  const tetto = typeof o.tettoSpecialisti === 'number' && Number.isInteger(o.tettoSpecialisti) ? Math.min(TETTO_SPECIALISTI_MAX, Math.max(1, o.tettoSpecialisti)) : d.tettoSpecialisti
  const p = o.percento as Record<string, unknown> | undefined
  const percento: PercentoWs | undefined = typeof p === 'object' && p !== null && typeof p.il === 'string'
    ? {
        il: p.il,
        ...(typeof p.valore === 'number' ? { valore: p.valore } : {}),
        ...(typeof p.calo === 'object' && p.calo !== null && typeof (p.calo as { perche?: unknown }).perche === 'string'
          ? { calo: p.calo as PercentoWs['calo'] & object }
          : {})
      }
    : undefined
  return {
    modello: o.modello === 'opus' ? 'opus' : 'sonnet',
    tettoSpecialisti: tetto,
    ...(typeof o.autopilota === 'string' && o.autopilota !== '' ? { autopilota: o.autopilota } : {}),
    ...(typeof o.attivatoIl === 'string' ? { attivatoIl: o.attivatoIl } : {}),
    ...(typeof o.sessione === 'string' && o.sessione !== '' ? { sessione: o.sessione } : {}),
    ...(typeof o.contesto === 'number' ? { contesto: o.contesto } : {}),
    ...(typeof o.rotazioni === 'number' ? { rotazioni: o.rotazioni } : {}),
    ...(o.daSeminare === true ? { daSeminare: true } : {}),
    ...(percento !== undefined ? { percento } : {}),
    ...(Array.isArray(o.domande) ? { domande: o.domande.filter((q): q is string => typeof q === 'string').slice(-20) } : {}),
    ...(Array.isArray(o.assorbiti) ? { assorbiti: o.assorbiti.filter((q): q is string => typeof q === 'string') } : {})
  }
}

export type RigaDialogo = { quando: string; da: 'tu' | 'lui' | 'evento'; testo: string }

export type ArchivioOrchestratori = {
  impostazioni: (ws: string) => ImpostazioniOrchestratore
  cambiaImpostazioni: (ws: string, f: (i: ImpostazioniOrchestratore) => ImpostazioniOrchestratore) => ImpostazioniOrchestratore
  piano: (ws: string) => Piano
  scriviPiano: (ws: string, p: Piano) => void
  aggiungiDialogo: (ws: string, r: RigaDialogo) => void
  /** Le ultime righe del dialogo, dal file. */
  ultimeDialogo: (ws: string, n: number) => RigaDialogo[]
  /** Scrive un file del workspace (agenti, impostazioni della CLI) e ne torna il percorso. */
  scriviFile: (ws: string, nome: string, contenuto: string) => string
  /** Il costo di un turno (dal `result` della CLI), solo aggiunte. */
  aggiungiCosto: (ws: string, c: Record<string, unknown>) => void
}

export function apriOrchestratori(cartella: string): ArchivioOrchestratori {
  const impostazioni = new Map<string, ImpostazioniOrchestratore>()
  const piani = new Map<string, Piano>()
  const dir = (ws: string): string => join(cartella, cartellaWorkspace(ws))
  const file = (ws: string, nome: string): string => join(dir(ws), nome)
  const leggiJson = (f: string): unknown => {
    try { return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) as unknown : undefined } catch (err) {
      console.error(`[orchestratore] ${f} illeggibile:`, err)
      return undefined
    }
  }
  const scrivi = (ws: string, nome: string, x: unknown): void => {
    try { mkdirSync(dir(ws), { recursive: true }) } catch { /* lo dice la scrittura */ }
    scriviAtomico(file(ws, nome), JSON.stringify(x, null, 2), 'orchestratore')
  }
  const imp = (ws: string): ImpostazioniOrchestratore => {
    const gia = impostazioni.get(ws)
    if (gia !== undefined) return gia
    const l = leggiImpostazioni(leggiJson(file(ws, 'orchestratore.json')))
    impostazioni.set(ws, l)
    return l
  }
  return {
    impostazioni: imp,
    cambiaImpostazioni(ws, f) {
      const prima = imp(ws)
      const dopo = f(prima)
      if (JSON.stringify(dopo) === JSON.stringify(prima)) return prima
      impostazioni.set(ws, dopo)
      scrivi(ws, 'orchestratore.json', dopo)
      return dopo
    },
    piano(ws) {
      const gia = piani.get(ws)
      if (gia !== undefined) return gia
      const l = leggiJson(file(ws, 'piano.json'))
      const p = l === undefined ? pianoVuoto() : leggiPiano(l)
      piani.set(ws, p)
      return p
    },
    scriviPiano(ws, p) {
      piani.set(ws, p)
      scrivi(ws, 'piano.json', p)
    },
    aggiungiDialogo(ws, r) {
      try {
        mkdirSync(dir(ws), { recursive: true })
        appendFileSync(file(ws, 'dialogo.jsonl'), `${JSON.stringify(r)}\n`, 'utf8')
      } catch (err) {
        console.error(`[orchestratore] ${ws}: dialogo non scritto:`, err)
      }
    },
    scriviFile(ws, nome, contenuto) {
      try { mkdirSync(dir(ws), { recursive: true }) } catch { /* lo dice la scrittura */ }
      scriviAtomico(file(ws, nome), contenuto, 'orchestratore')
      return file(ws, nome)
    },
    aggiungiCosto(ws, c) {
      try {
        mkdirSync(dir(ws), { recursive: true })
        appendFileSync(file(ws, 'costi.jsonl'), `${JSON.stringify(c)}
`, 'utf8')
      } catch (err) {
        console.error(`[orchestratore] ${ws}: costo non scritto:`, err)
      }
    },
    ultimeDialogo(ws, n) {
      try {
        const f = file(ws, 'dialogo.jsonl')
        if (!existsSync(f)) return []
        return readFileSync(f, 'utf8').split('\n').filter((x) => x.trim() !== '').slice(-n).flatMap((x) => {
          try { return [JSON.parse(x) as RigaDialogo] } catch { return [] }
        })
      } catch {
        return []
      }
    }
  }
}
