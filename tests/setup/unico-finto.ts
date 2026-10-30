import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { chiaveWorkspace } from '@shared/coda-richieste'
import type { Archivio } from '../../src/autopilot-host/archivio'
import { apriCode, type ArchivioCode } from '../../src/autopilot-host/coda-store'
import { apriOrchestratori, type ArchivioOrchestratori } from '../../src/autopilot-host/orchestratore-store'
import type { AvviaProcesso, ProcessoClaude } from '../../src/autopilot-host/orchestratore'

/** Un processo `claude` finto: registra cosa gli si scrive, non risponde mai da solo. */
export type ProcessoFinto = ProcessoClaude & { args: string[]; scritte: string[]; emetti: (o: unknown) => void }

/**
 * Quello che il servizio (P4) vuole sempre: la coda, il disco degli
 * orchestratori e chi avvia `claude`, su una cartella temporanea.
 *
 * Con `archivio`, ogni autopilota scritto diventa **l'autopilota del suo
 * workspace** se il workspace non ne ha ancora uno: le prove che scrivono un
 * autopilota a mano e poi chiamano le rotte lo trovano come prima.
 */
export function unicoFinto(archivio?: Archivio): {
  coda: ArchivioCode
  orchestratori: ArchivioOrchestratori
  avviaProcesso: AvviaProcesso
  processi: ProcessoFinto[]
  /** Fa di `id` l'autopilota del workspace `ws`. */
  registra: (ws: string, id: string) => void
} {
  const cartella = mkdtempSync(join(tmpdir(), 'sd-unico-finto-'))
  const coda = apriCode(cartella)
  const orchestratori = apriOrchestratori(cartella)
  const processi: ProcessoFinto[] = []
  const avviaProcesso: AvviaProcesso = ({ args }) => {
    const righe: ((r: string) => void)[] = []
    const p: ProcessoFinto = {
      args, scritte: [],
      scrivi: (r) => { p.scritte.push(r) },
      uccidi: () => {},
      suRiga: (f) => { righe.push(f) },
      suUscita: () => {},
      emetti: (o) => { for (const f of righe) f(JSON.stringify(o)) }
    }
    processi.push(p)
    return p
  }
  const registra = (ws: string, id: string): void => {
    orchestratori.cambiaImpostazioni(ws, (i) => ({ ...i, autopilota: id }))
  }
  if (archivio !== undefined) {
    const scrivi = archivio.scrivi.bind(archivio)
    archivio.scrivi = (a) => {
      scrivi(a)
      const ws = chiaveWorkspace(a)
      if (orchestratori.impostazioni(ws).autopilota === undefined) registra(ws, a.id)
    }
  }
  return { coda, orchestratori, avviaProcesso, processi, registra }
}
