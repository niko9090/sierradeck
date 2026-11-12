import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { scriviAtomico } from '@shared/scrittura-atomica'
import { modelloAutopilotaAmmesso } from '@shared/modelli'
import { leggiPiano, pianoVuoto, type PercentoWs, type Piano } from '@shared/piano-orchestratore'
import { leggiPermessi, type PermessiScelti } from '@shared/permessi-nicholas'
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

export type ModelloOrchestratore = string

export type ImpostazioniOrchestratore = {
  /** L'autopilota del workspace: ce n'è uno solo, sempre acceso. */
  autopilota?: string
  attivatoIl?: string
  modello: ModelloOrchestratore
  /**
   * 0.89.2: Nicholas ha scelto lui il modello dalle impostazioni. Senza questa
   * scelta l'autopilota usa Opus (01/11: «deve essere avviato con il modello
   * migliore possibile perché è la parte che coordina»): anche il «sonnet»
   * scritto dalle versioni di prima diventa Opus.
   */
  modelloScelto?: boolean
  /** Quanti specialisti insieme in questo workspace: 5 di serie (3 fino alla 0.103.3). 11/11: il massimo lo decide Nicholas, non più il programma (era 4). */
  tettoSpecialisti: number
  /**
   * 12/11: il tetto l'ha scelto Nicholas. Senza, vale quello di serie: il 3 scritto
   * da sé dalle versioni di prima in ogni workspace non blocca il valore nuovo.
   */
  tettoScelto?: boolean
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
  /** 11/11: i rami degli specialisti già guardati (`ramo@commit`): quelli con lavoro mai unito si dicono all'autopilota una volta sola. */
  ramiSegnalati?: string[]
  /**
   * 11/11: le sveglie chieste dall'autopilota («riprendo stasera alle 19»). Stanno sul disco: prima il promemoria
   * viveva nella sessione di `claude`, che si spegne dopo 10 minuti di quiete, e non suonava mai.
   */
  sveglie?: Sveglia[]
  /**
   * 11/11: le classi di azioni protette che Nicholas ha tolto per questo progetto con «Sì, sempre»
   * (`@shared/permessi-nicholas`). Le scrive solo il programma, da una sua risposta o dalle impostazioni.
   */
  permessi?: PermessiScelti
}

export type Sveglia = { il: string; perche: string; chiesta: string }
/** Quante sveglie in attesa per workspace, al più. */
export const SVEGLIE_MAX = 10

// 12/11 (Nicholas: «lavora in parallelo più che puoi per abbattere i tempi»): 3 → 5. Le prove pesanti
// restano una alla volta sul PC (`guardia-pc.ts`) e i posti scendono da soli se il PC è sotto sforzo.
export const TETTO_SPECIALISTI = 5
/** Il tetto di serie delle versioni fino alla 0.103.3, scritto da sé in ogni workspace. */
export const TETTO_SPECIALISTI_DI_PRIMA = 3
export const TETTO_SPECIALISTI_MAX = 4
/** Quanti rami già guardati si ricordano, al più. */
export const RAMI_SEGNALATI_MAX = 300

export function impostazioniPredefinite(): ImpostazioniOrchestratore {
  return { modello: 'opus', tettoSpecialisti: TETTO_SPECIALISTI }
}

export function leggiImpostazioni(x: unknown): ImpostazioniOrchestratore {
  const d = impostazioniPredefinite()
  if (typeof x !== 'object' || x === null) return d
  const o = x as Record<string, unknown>
  const scritto = typeof o.tettoSpecialisti === 'number' && Number.isInteger(o.tettoSpecialisti) ? Math.max(1, o.tettoSpecialisti) : undefined
  // Un numero diverso dal 3 di serie di prima l'ha scelto Nicholas anche senza il segno.
  const tettoScelto = scritto !== undefined && (o.tettoScelto === true || o.tettoSpecialisti !== TETTO_SPECIALISTI_DI_PRIMA)
  const tetto = tettoScelto ? scritto! : d.tettoSpecialisti
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
    modello: o.modelloScelto === true && modelloAutopilotaAmmesso(o.modello) ? o.modello : 'opus',
    ...(o.modelloScelto === true ? { modelloScelto: true } : {}),
    tettoSpecialisti: tetto,
    ...(tettoScelto ? { tettoScelto: true } : {}),
    ...(typeof o.autopilota === 'string' && o.autopilota !== '' ? { autopilota: o.autopilota } : {}),
    ...(typeof o.attivatoIl === 'string' ? { attivatoIl: o.attivatoIl } : {}),
    ...(typeof o.sessione === 'string' && o.sessione !== '' ? { sessione: o.sessione } : {}),
    ...(typeof o.contesto === 'number' ? { contesto: o.contesto } : {}),
    ...(typeof o.rotazioni === 'number' ? { rotazioni: o.rotazioni } : {}),
    ...(o.daSeminare === true ? { daSeminare: true } : {}),
    ...(percento !== undefined ? { percento } : {}),
    ...(Array.isArray(o.domande) ? { domande: o.domande.filter((q): q is string => typeof q === 'string').slice(-20) } : {}),
    ...(Array.isArray(o.assorbiti) ? { assorbiti: o.assorbiti.filter((q): q is string => typeof q === 'string') } : {}),
    ...(Array.isArray(o.ramiSegnalati) ? { ramiSegnalati: o.ramiSegnalati.filter((q): q is string => typeof q === 'string').slice(-RAMI_SEGNALATI_MAX) } : {}),
    ...(leggiSveglie(o.sveglie).length > 0 ? { sveglie: leggiSveglie(o.sveglie) } : {}),
    ...(Object.keys(leggiPermessi(o.permessi)).length > 0 ? { permessi: leggiPermessi(o.permessi) } : {})
  }
}

function leggiSveglie(x: unknown): Sveglia[] {
  if (!Array.isArray(x)) return []
  return x.flatMap((v): Sveglia[] => {
    const q = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>
    if (typeof q.il !== 'string' || Number.isNaN(Date.parse(q.il)) || typeof q.perche !== 'string') return []
    return [{ il: q.il, perche: q.perche.slice(0, 300), chiesta: typeof q.chiesta === 'string' ? q.chiesta : q.il }]
  }).slice(0, SVEGLIE_MAX)
}

/** `nicholas` (11/11): la riga l'ha scritta lui a mano nel dialogo (non il programma, non una risposta riportata): serve a sapere cosa ha chiesto davvero. */
export type RigaDialogo ={ quando: string; da: 'tu' | 'lui' | 'evento'; testo: string; domanda?: { id: string; scelte: string[] }; nicholas?: true }

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
  /** La cartella del workspace (31/10: per metterla nel recupero quando l'autopilota è un doppione). */
  cartellaDi?: (ws: string) => string
  /** Dimentica quello che tiene in memoria del workspace: la cartella non c'è più. */
  dimentica?: (ws: string) => void
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
    cartellaDi: dir,
    dimentica(ws) {
      impostazioni.delete(ws)
      piani.delete(ws)
    },
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
