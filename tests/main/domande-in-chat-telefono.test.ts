import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { apriCode } from '../../src/autopilot-host/coda-store'
import { apriOrchestratori } from '../../src/autopilot-host/orchestratore-store'
import type { AvviaProcesso, ProcessoClaude } from '../../src/autopilot-host/orchestratore'
import { creaClientAutopilota } from '../../src/main/autopilot-client'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'
import { TELEFONO_VISTO_MS, workspaceVisti } from '../../src/main/chat-vista'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import { orologioDa } from '../setup/orologio'

/**
 * 0.96.0 (k-45) — le domande che stanno ancora solo nella chat dell'autopilota
 * non arrivano a Domande, conteggio, pagina del telefono e app (rotte
 * `/api/domande`: il conteggio e le voci vengono dalla stessa lista del servizio); la scheda aperta sul telefono conta come «vista».
 */

describe('quali workspace sono davanti a Nicholas', () => {
  const finestre = [
    { workspace: 'Lavoro', inPrimoPiano: true },
    { workspace: 'Dietro', inPrimoPiano: false },
    { workspace: undefined, inPrimoPiano: true }
  ]
  it('sul PC conta solo la finestra in primo piano, col suo workspace', () => {
    expect(workspaceVisti({ finestre, telefono: new Map(), ora: 1000 })).toEqual(['Lavoro'])
  })
  it('sul telefono conta la scheda letta da poco, non quella lasciata da un pezzo', () => {
    const telefono = new Map([['Casa', 1000], ['Vecchio', 1000 - TELEFONO_VISTO_MS - 1]])
    expect(workspaceVisti({ finestre: [], telefono, ora: 1000 }).sort()).toEqual(['Casa'])
  })
  it('lo stesso workspace da PC e telefono è uno solo', () => {
    expect(workspaceVisti({ finestre, telefono: new Map([['Lavoro', 1000]]), ora: 1000 })).toEqual(['Lavoro'])
  })
})

const orologio = orologioDa('2026-11-06T09:00:00.000Z')
let server: ServerAutopiloti | undefined
afterEach(() => { server?.close(); server = undefined })

function ap(): Autopilota {
  return { ...nuovoAutopilota({ id: 'ap-1', nome: 'App', obiettivo: 'o', cwd: process.cwd(), iniziatoIl: '2026-11-06T08:00:00.000Z', workspace: 'Lavoro' }), stato: 'lavoro' }
}

describe('telefono e pagina non vedono le domande in attesa nella chat', () => {
  it('/api/domande e il conteggio le contano solo quando passano nelle Domande; la scheda aperta segna il workspace «visto»', async () => {
    const archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'sd-chat-tel-')))
    archivio.scrivi(ap())
    const cartella = mkdtempSync(join(tmpdir(), 'sd-chat-tel-orch-'))
    const orchestratori = apriOrchestratori(cartella)
    orchestratori.cambiaImpostazioni('Lavoro', (i) => ({ ...i, autopilota: 'ap-1' }))
    const domande = creaRegistroDomande({ adesso: orologio.ms })
    const avviaProcesso: AvviaProcesso = () => ({ scrivi: () => {}, uccidi: () => {}, suRiga: () => {}, suUscita: () => {} }) as unknown as ProcessoClaude
    server = creaServer({
      archivio, domande,
      esegui: () => Promise.resolve({ codice: 0, uscita: 'ok' }),
      avviaLavoro: () => Promise.resolve(),
      avvisa: () => Promise.resolve(),
      scadenzaDomandaMs: 60_000,
      adesso: orologio.iso,
      coda: apriCode(cartella),
      orchestratori,
      avviaProcesso
    })
    const porta = await new Promise<number>((ok) => server!.listen(0, '127.0.0.1', () => ok((server!.address() as { port: number }).port)))
    const client = creaClientAutopilota({ porta, avviaServizio: () => undefined })
    const viste: string[] = []
    const deps = {
      dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-chat-tel-disp-'))),
      chat: () => [],
      autopiloti: () => client.elenca(),
      autopilota: (id: string) => client.dettaglio(id),
      domande: () => client.domande(),
      risolte: () => client.risolte(),
      workspace: () => Promise.resolve({ nomi: ['Lavoro'], attivo: 'Lavoro' }),
      schedaApertaSulTelefono: (ws: string) => { viste.push(ws) },
      adesso: () => Date.now()
    } as unknown as DipendenzeRotte
    const rotte = rotteClient(deps)
    const chiedono = async (): Promise<number> => ((await rotte({ metodo: 'GET', percorso: '/api/domande', corpo: undefined })).corpo as { chiedono: number }).chiedono

    const d = domande.apri({ autopilotaId: 'ap-1', testo: 'Tengo il verde?', scadenzaMs: 60_000, opzioni: ['sì', 'no'], inChat: true })
    // Nel periodo di attesa: niente nelle Domande, niente nel numero.
    expect(await client.domande()).toEqual([])
    expect(await chiedono()).toBe(0)

    // La scheda dell'autopilota aperta sul telefono: il suo workspace è «visto».
    const scheda = await rotte({ metodo: 'POST', percorso: '/api/autopilota', corpo: { autopilota: 'ap-1' } })
    expect(scheda.stato).toBe(200)
    expect(viste).toEqual(['Lavoro'])
    expect((scheda.corpo as { domandaId?: string }).domandaId).toBeUndefined()

    // Passata nelle Domande: da qui la vedono tutti.
    domande.emergi(d.id, orologio.ms())
    // Le conversazioni di un visore si tengono qualche secondo: un visore nuovo le rilegge.
    const nuove = rotteClient(deps)
    const dopo = (await nuove({ metodo: 'GET', percorso: '/api/domande', corpo: undefined })).corpo as { chiedono: number }
    expect(dopo.chiedono).toBe(1)
    expect(((await nuove({ metodo: 'POST', percorso: '/api/autopilota', corpo: { autopilota: 'ap-1' } })).corpo as { domandaId?: string }).domandaId).toBe(d.id)
  })
})
