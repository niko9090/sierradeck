import {
  preparaBlocco, applicaBlocco,
  type RichiestaPrepara, type RichiestaApplica, type EsitoApplica
} from './lavoro'
import type { Progresso } from './motore'

/**
 * Chi esegue il lavoro pesante della sincronizzazione.
 *
 * C'era anche un esecutore **su thread** (`esecutoreSuThread`, con il suo
 * `sync-worker.ts`): non lo avviava più nessuno, e la 0.86.2 l'ha tolto
 * insieme al worker e alla sua voce nella build.
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
