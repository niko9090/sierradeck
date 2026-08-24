import { Worker } from 'node:worker_threads'
import {
  preparaBlocco, applicaBlocco,
  type RichiestaPrepara, type RichiestaApplica, type EsitoApplica
} from './lavoro'
import type { Progresso } from './motore'

/**
 * Chi esegue il lavoro pesante della sincronizzazione. Due implementazioni:
 * **in processo** (semplice, ma blocca — per i test e come riserva) e **su
 * thread** (il lavoro va in un worker, l'interfaccia resta viva).
 */
export type Esecutore = {
  prepara: (req: RichiestaPrepara, onProgresso?: (p: Progresso) => void) => Promise<{ cifrato: Buffer; voci: number }>
  applica: (req: RichiestaApplica, onProgresso?: (p: Progresso) => void) => Promise<EsitoApplica>
}

/** In processo: funziona sempre, ma il lavoro pesante blocca l'event loop. */
export const esecutoreInProcesso: Esecutore = {
  prepara: (req, onProgresso) => preparaBlocco(req, onProgresso),
  applica: (req, onProgresso) => applicaBlocco(req, onProgresso)
}

/** Una copia dei byte in un ArrayBuffer proprio: `slice` copia, così l'originale resta intatto. */
function copiaArrayBuffer(b: Buffer): ArrayBuffer {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

type Risposta =
  | { tipo: 'progresso'; p: Progresso }
  | { tipo: 'fatto'; cifrato?: ArrayBuffer; voci?: number; esito?: EsitoApplica }
  | { tipo: 'errore'; errore: string }

/**
 * Esecutore su thread separato. Un worker per operazione (salva/ripristina sono
 * rari): parte, fa il lavoro, si spegne. Se il worker non si avvia — percorso
 * sbagliato in un pacchetto, ambiente strano — si **ripiega** su quello in
 * processo: meglio un blocco momentaneo che una sincronizzazione che non parte.
 */
export function esecutoreSuThread(percorsoWorker: string, log?: (m: string) => void): Esecutore {
  const nelWorker = <T>(
    messaggio: Record<string, unknown>,
    trasferibili: readonly ArrayBuffer[],
    onProgresso: ((p: Progresso) => void) | undefined,
    leggiEsito: (m: Extract<Risposta, { tipo: 'fatto' }>) => T
  ): Promise<T> =>
    new Promise<T>((risolvi, rifiuta) => {
      let worker: Worker
      try {
        worker = new Worker(percorsoWorker)
      } catch (e) {
        rifiuta(e)
        return
      }
      worker.on('message', (m: Risposta) => {
        if (m.tipo === 'progresso') { onProgresso?.(m.p); return }
        if (m.tipo === 'fatto') { risolvi(leggiEsito(m)); void worker.terminate(); return }
        if (m.tipo === 'errore') { rifiuta(new Error(m.errore)); void worker.terminate() }
      })
      worker.on('error', (e) => { rifiuta(e); void worker.terminate() })
      worker.postMessage(messaggio, trasferibili)
    })

  return {
    async prepara(req, onProgresso) {
      // maestra è piccola: la si clona (non si trasferisce, o si staccherebbe
      // dall'originale che il main tiene in memoria).
      const t0 = Date.now()
      try {
        const r = await nelWorker(
          { tipo: 'prepara', dati: req.dati, radiceClaude: req.radiceClaude, maestra: copiaArrayBuffer(req.maestra), adesso: req.adesso },
          [],
          onProgresso,
          (m) => ({ cifrato: Buffer.from(m.cifrato as ArrayBuffer), voci: m.voci ?? 0 })
        )
        log?.(`prepara: THREAD ok in ${((Date.now() - t0) / 1000).toFixed(1)}s (${r.voci} file → ${(r.cifrato.length / 1048576).toFixed(1)} MB cifrati)`)
        return r
      } catch (e) {
        log?.(`prepara: THREAD non disponibile (${e instanceof Error ? e.message : String(e)}) → uso in processo (può bloccare)`)
        const r = await esecutoreInProcesso.prepara(req, onProgresso)
        log?.(`prepara: in processo finito in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
        return r
      }
    },
    async applica(req, onProgresso) {
      // Il blocco è grande e il main non lo usa più: lo si trasferisce.
      const bloccoAb = copiaArrayBuffer(req.blocco)
      const t0 = Date.now()
      try {
        const r = await nelWorker(
          { tipo: 'applica', dati: req.dati, radiceClaude: req.radiceClaude, maestra: copiaArrayBuffer(req.maestra), blocco: bloccoAb },
          [bloccoAb],
          onProgresso,
          (m) => m.esito as EsitoApplica
        )
        log?.(`applica: THREAD ok in ${((Date.now() - t0) / 1000).toFixed(1)}s (${r.scritti} file scritti)`)
        return r
      } catch (e) {
        log?.(`applica: THREAD non disponibile (${e instanceof Error ? e.message : String(e)}) → uso in processo (può bloccare)`)
        const r = await esecutoreInProcesso.applica(req, onProgresso)
        log?.(`applica: in processo finito in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
        return r
      }
    }
  }
}
