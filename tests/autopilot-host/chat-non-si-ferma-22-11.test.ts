import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { apriCode } from '../../src/autopilot-host/coda-store'
import { apriOrchestratori, type ArchivioOrchestratori } from '../../src/autopilot-host/orchestratore-store'
import type { AvviaProcesso, ProcessoClaude } from '../../src/autopilot-host/orchestratore'
import { promessaSenzaFine } from '../../src/autopilot-host/finito-a-meta'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import { attendi } from '../setup/attendi'
import { orologioDa } from '../setup/orologio'

/**
 * 22/11 (k-174a). Nicholas: «ci sono delle chat che hanno ripreso a fermarsi senza aver completato
 * il compito». Il caso: uno specialista lancia i test, scrive «aspetto l'esito e riprendo» e chiude il
 * turno. Per un sotto-agente chiudere il turno vuol dire «finito»: nessun esito lo risveglia. Il
 * programma lo dava per finito, metteva il compito «in revisione» e ne univa il ramo a metà; di
 * «riprendo» non restava niente, e il lavoro non ripartiva.
 */

const FRASE_VERA = [
  'Ho scritto il test e la correzione, ho lanciato la suite completa in sottofondo.',
  'La suite gira da qualche minuto: aspetto l’esito e riprendo con il controllo dei tipi.',
  'RAPPORTO: provo — suite in corso, aspetto l’esito'
].join('\n')

describe('promessaSenzaFine: «riprendo» come ultima parola non è un compito finito', () => {
  it('riconosce le chiusure con una promessa (casi veri di fine turno)', () => {
    expect(promessaSenzaFine(FRASE_VERA)).toContain('aspetto')
    expect(promessaSenzaFine('Le prove sono partite.\nContinuo appena finisce la compilazione.')).toContain('Continuo')
    expect(promessaSenzaFine('Fatto il primo passo.\nRiprendo subito dopo con il secondo.\nSEGNALE: avanti — il secondo passo')).toContain('Riprendo')
    expect(promessaSenzaFine('Lancio il typecheck, poi vado avanti con i test vicini.')).toBeDefined()
  })

  it('non scambia per promessa una chiusura vera', () => {
    expect(promessaSenzaFine(undefined)).toBeUndefined()
    expect(promessaSenzaFine('')).toBeUndefined()
    expect(promessaSenzaFine('Fatto. Test verdi, commit a1b2c3.\nRAPPORTO: finita — commit a1b2c3, 42 test verdi')).toBeUndefined()
    // finita, anche se una riga sopra dice «continuo» (era il passo di prima)
    expect(promessaSenzaFine('Continuo con il typecheck.\nTutto verde.\nRAPPORTO: finita — tutto verde')).toBeUndefined()
    expect(promessaSenzaFine('Mi fermo: bloccato: manca la chiave del servizio.')).toBeUndefined()
    expect(promessaSenzaFine('bloccato: serve una decisione sul nome.\nRAPPORTO: bloccata perché — serve il nome')).toBeUndefined()
    expect(promessaSenzaFine('Non continuo oltre: il resto è fuori dal compito.')).toBeUndefined()
    // una promessa lontana dalla fine (oltre le ultime righe) è storia, non l'ultima parola
    expect(promessaSenzaFine(['Prima continuo.', 'a', 'b', 'c', 'd', 'Finito tutto, test verdi.'].join('\n'))).toBeUndefined()
  })
})

type Finto = ProcessoClaude & { scritte: string[]; emetti: (o: unknown) => void }

let server: ServerAutopiloti | undefined
let orch: ArchivioOrchestratori
let archivio: Archivio
let processi: Finto[] = []

const avvia: AvviaProcesso = () => {
  const righe: ((r: string) => void)[] = []
  const p: Finto = {
    scritte: [],
    scrivi: (r) => { p.scritte.push(r) },
    uccidi: () => {},
    suRiga: (f) => { righe.push(f) },
    suUscita: () => {},
    emetti: (o) => { for (const f of righe) f(JSON.stringify(o)) }
  }
  processi.push(p)
  return p
}

const zitto = (): void => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

async function avviaServizio(): Promise<void> {
  const orologio = orologioDa('2026-11-22T08:00:00.000Z')
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-meta-')))
  const prima: Autopilota = {
    ...nuovoAutopilota({ id: 'ap-vecchio', nome: 'Prima', obiettivo: 'la barra', cwd: process.cwd(), iniziatoIl: '2026-11-22T06:00:00.000Z', workspace: 'Lavoro' }),
    stato: 'lavoro',
    chats: [{ id: 'c-1', compito: 'la barra delle chat', stato: 'lavoro', cicli: 1, sessionId: 's-1' }]
  }
  archivio.scrivi(prima)
  const cartella = mkdtempSync(join(tmpdir(), 'ap-meta-orch-'))
  orch = apriOrchestratori(cartella)
  processi = []
  const s = creaServer({
    archivio,
    memoria: apriMemoria(mkdtempSync(join(tmpdir(), 'ap-meta-mem-'))),
    versione: '0.112.1',
    esegui: () => Promise.resolve({ codice: 1, uscita: 'non ancora' }),
    avviaLavoro: () => Promise.resolve(),
    avvisa: () => Promise.resolve(),
    domande: creaRegistroDomande({ adesso: orologio.ms }),
    ultimoDetto: () => undefined,
    scadenzaDomandaMs: 5000,
    adesso: orologio.iso,
    coda: apriCode(cartella),
    orchestratori: orch,
    avviaProcesso: avvia,
    porta: 47998,
    raccoltaEventiMs: 5,
    unioneDaSola: false
  })
  server = s
  await new Promise<void>((ris) => s.listen(0, '127.0.0.1', () => ris()))
  expect(s.migraVecchi()).toBe(1)
}

afterEach(() => { server?.close(); server = undefined; vi.restoreAllMocks() })

/** Il compito k-1 «da fare»; uno specialista lo prende, scrive il suo messaggio finale e chiude. */
function specialistaChiude(messaggioFinale: string): void {
  const p = processi[0]!
  p.emetti({ type: 'result', result: 'Pronto.', total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
  orch.scriviPiano('Lavoro', { versione: 1, compiti: [{ id: 'k-1', richiesta: 'r-1', titolo: 'la correzione del guardiano', criterio: 'il test passa', dopo: [], peso: 2, stato: 'da-fare', creato: '2026-11-22T07:00:00.000Z' }] })
  const descrizione = 'k-1: la correzione del guardiano'
  p.emetti({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: 'tu-1', name: 'Agent', input: { subagent_type: 'sviluppatore', description: descrizione } }] } })
  p.emetti({ type: 'system', subtype: 'task_started', task_id: 't-1', tool_use_id: 'tu-1', task_type: 'local_agent', description: descrizione })
  p.emetti({ type: 'system', subtype: 'task_notification', task_id: 't-1', tool_use_id: 'tu-1', status: 'completed', summary: messaggioFinale })
}

describe('uno specialista che chiude dicendo «aspetto l’esito e riprendo»', () => {
  it('il compito non va «in revisione»: torna da fare, e l’autopilota riceve l’ordine di rilanciarlo', async () => {
    zitto()
    await avviaServizio()
    specialistaChiude(FRASE_VERA)
    expect(orch.piano('Lavoro').compiti[0]!.stato).toBe('da-fare')
    expect(orch.piano('Lavoro').compiti[0]!.esito).toContain('a metà')
    // La notifica di fine specialista apre un turno dell'autopilota: chiuso quello, gli eventi in coda partono.
    processi[0]!.emetti({ type: 'result', result: 'preso nota', total_cost_usd: 0.001, session_id: 'sess-1', usage: { input_tokens: 100 } })
    await attendi(() => processi[0]!.scritte.some((r) => r.includes('non è finito')), { cosa: 'l’ordine di rilanciare lo specialista' })
    const testo = processi[0]!.scritte.filter((r) => r.includes('non è finito')).join('\n')
    expect(testo).toContain('aspetto')
    expect(testo).toContain('Rilancialo adesso')
  })

  it('una chiusura vera (RAPPORTO: finita) va in revisione, come prima', async () => {
    zitto()
    await avviaServizio()
    specialistaChiude('Fatto, test verdi, commit a1b2c3.\nRAPPORTO: finita — commit a1b2c3, test verdi')
    expect(orch.piano('Lavoro').compiti[0]!.stato).toBe('in-revisione')
  })
})
