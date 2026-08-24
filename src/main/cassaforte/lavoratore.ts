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
export function esecutoreSuThread(percorsoWorker: string): Esecutore {
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
      try {
        return await nelWorker(
          { tipo: 'prepara', dati: req.dati, radiceClaude: req.radiceClaude, maestra: copiaArrayBuffer(req.maestra), adesso: req.adesso },
          [],
          onProgresso,
          (m) => ({ cifrato: Buffer.from(m.cifrato as ArrayBuffer), voci: m.voci ?? 0 })
        )
      } catch (e) {
        console.error('[sync] worker non disponibile, uso in processo:', e)
        return esecutoreInProcesso.prepara(req, onProgresso)
      }
    },
    async applica(req, onProgresso) {
      // Il blocco è grande e il main non lo usa più: lo si trasferisce.
      const bloccoAb = copiaArrayBuffer(req.blocco)
      try {
        return await nelWorker(
          { tipo: 'applica', dati: req.dati, radiceClaude: req.radiceClaude, maestra: copiaArrayBuffer(req.maestra), blocco: bloccoAb },
          [bloccoAb],
          onProgresso,
          (m) => m.esito as EsitoApplica
        )
      } catch (e) {
        console.error('[sync] worker non disponibile, uso in processo:', e)
        return esecutoreInProcesso.applica(req, onProgresso)
      }
    }
  }
}
