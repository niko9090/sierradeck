import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { scriviAtomico } from '@shared/scrittura-atomica'
import { codaVuota, leggiCoda, type Coda, type EventoCoda, type Modifica } from '@shared/coda-richieste'

/**
 * La coda delle richieste sul disco (P1): per ogni workspace
 * `%APPDATA%/SierraDeck/orchestratori/<workspace>/coda.json` (lo stato,
 * scritto per intero e in modo atomico) più `coda.eventi.jsonl` (solo
 * aggiunte: ogni originale parola per parola, ogni unione e separazione).
 *
 * Si scrive **solo quando cambia**: le regole pure tornano la stessa coda se
 * non cambia niente, e qui si confronta anche il testo con l'ultimo scritto.
 */

export type ArchivioCode = {
  cartella: string
  /** La coda di un workspace (vuota se non c'è ancora). Non scrive niente. */
  leggi: (workspace: string) => Coda
  /**
   * Cambia la coda di un workspace: `f` torna la modifica (o `undefined`, o
   * la stessa coda, per «niente»). Scrive lo stato e gli eventi solo se serve.
   * Torna la coda di adesso.
   */
  cambia: (workspace: string, f: (c: Coda) => Modifica | undefined) => Coda
  /** I workspace che hanno una coda sul disco. */
  workspaces: () => string[]
}

/**
 * Il nome della cartella di un workspace: il nome leggibile (senza i caratteri
 * che Windows non vuole) più un pezzo di impronta, perché due nomi diversi non
 * finiscano nella stessa cartella.
 */
export function cartellaWorkspace(workspace: string): string {
  const leggibile = workspace.normalize('NFC').replace(/[^\p{L}\p{N} _.-]+/gu, '_').replace(/[. ]+$/u, '').trim().slice(0, 60) || 'ws'
  const impronta = createHash('sha1').update(workspace).digest('hex').slice(0, 8)
  return `${leggibile}-${impronta}`
}

export function apriCode(cartella: string): ArchivioCode {
  const tenute = new Map<string, { coda: Coda; scritto: string | undefined }>()
  const fileDi = (ws: string): { dir: string; stato: string; eventi: string } => {
    const dir = join(cartella, cartellaWorkspace(ws))
    return { dir, stato: join(dir, 'coda.json'), eventi: join(dir, 'coda.eventi.jsonl') }
  }
  const carica = (ws: string): { coda: Coda; scritto: string | undefined } => {
    const gia = tenute.get(ws)
    if (gia !== undefined) return gia
    const f = fileDi(ws)
    let voce: { coda: Coda; scritto: string | undefined } = { coda: codaVuota(ws), scritto: undefined }
    if (existsSync(f.stato)) {
      try {
        const testo = readFileSync(f.stato, 'utf8')
        voce = { coda: leggiCoda(JSON.parse(testo), ws), scritto: testo }
      } catch (err) {
        // Illeggibile: si riparte dal vuoto, ma il file non si sovrascrive finché non cambia qualcosa.
        console.error(`[coda] ${ws}: coda.json illeggibile, riparto vuota:`, err)
      }
    }
    tenute.set(ws, voce)
    return voce
  }
  return {
    cartella,
    leggi: (ws) => carica(ws).coda,
    cambia(ws, f) {
      const voce = carica(ws)
      const m = f(voce.coda)
      if (m === undefined || (m.coda === voce.coda && m.eventi.length === 0)) return voce.coda
      const file = fileDi(ws)
      try { mkdirSync(file.dir, { recursive: true }) } catch { /* la scrittura dirà perché */ }
      if (m.eventi.length > 0) {
        try {
          appendFileSync(file.eventi, m.eventi.map((e: EventoCoda) => JSON.stringify(e)).join('\n') + '\n', 'utf8')
        } catch (err) {
          console.error(`[coda] ${ws}: eventi non scritti:`, err)
        }
      }
      const testo = JSON.stringify(m.coda, null, 2)
      if (testo !== voce.scritto) {
        if (scriviAtomico(file.stato, testo, 'coda')) tenute.set(ws, { coda: m.coda, scritto: testo })
        else tenute.set(ws, { coda: m.coda, scritto: voce.scritto })
      } else {
        tenute.set(ws, { coda: m.coda, scritto: testo })
      }
      return m.coda
    },
    workspaces() {
      const fuori = new Set(tenute.keys())
      try {
        for (const d of readdirSync(cartella, { withFileTypes: true })) {
          if (!d.isDirectory()) continue
          const f = join(cartella, d.name, 'coda.json')
          if (!existsSync(f)) continue
          try {
            const ws = (JSON.parse(readFileSync(f, 'utf8')) as { workspace?: unknown }).workspace
            if (typeof ws === 'string' && ws !== '') fuori.add(ws)
          } catch { /* illeggibile: non è di nessuno */ }
        }
      } catch { /* la cartella non c'è ancora */ }
      return [...fuori]
    }
  }
}
