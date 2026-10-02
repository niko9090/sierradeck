import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { creaClientAutopilota } from '../../src/main/autopilot-client'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'
import { nuovoAutopilota } from '@shared/autopilota'
import { decidiColonnaDomande, richiestaRisposta, type Conversazione } from '@shared/domande-conversazioni'
import { domandeScheda, dopoLaRisposta } from '@shared/domande-autopilota'

/**
 * «NON VEDO LE DOMANDEEEE!!!!» (Nicholas, 01/10, 13:52 UTC). Dal servizio
 * vero alla colonna e ritorno: una domanda aperta nel registro del servizio
 * (com'era quella del supervisore delle 12:46, «chiediUtente») arriva in
 * `/api/domande` — la lista della colonna del PC, della pagina e dell'app —
 * e la risposta mandata da li' arriva al servizio, che sblocca chi aspetta.
 */
let server: ServerAutopiloti | undefined
afterEach(() => { server?.close(); server = undefined })

describe('le domande del servizio arrivano nella colonna e la risposta torna', () => {
  it('domanda del supervisore aperta nel servizio → conversazione nella colonna → risposta al servizio', async () => {
    const archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'sd-dom-')))
    const domande = creaRegistroDomande({ adesso: () => Date.now() })
    archivio.scrivi({
      ...nuovoAutopilota({ id: 'ap-1', nome: 'App Android', obiettivo: 'o', cwd: process.cwd(), criteri: [{ descrizione: 'c', soddisfatto: false }], iniziatoIl: '2026-10-01T10:00:00.000Z' }),
      stato: 'lavoro'
    })
    server = creaServer({
      archivio, domande,
      esegui: () => Promise.resolve({ codice: 0, uscita: 'ok' }),
      interroga: () => Promise.resolve({ testo: '{"azione": "finito"}' }),
      avviaLavoro: () => Promise.resolve(),
      fermaLavoro: () => undefined,
      avvisa: () => Promise.resolve(),
      scadenzaDomandaMs: 60_000,
      scadenzaInterviataMs: 60_000,
      adesso: () => new Date().toISOString()
    })
    const porta = await new Promise<number>((ok) => server!.listen(0, '127.0.0.1', () => ok((server!.address() as { port: number }).port)))
    // La domanda, come la apre il supervisore con «chiediUtente».
    const d = domande.apri({ autopilotaId: 'ap-1', testo: 'Mi dai l’ok a considerare superato il criterio della versione?', scadenzaMs: 60_000, opzioni: ['sì', 'no'] })
    const attesa = domande.attendi(d.id)

    const client = creaClientAutopilota({ porta, avviaServizio: () => undefined })
    const deps = {
      dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-dom-disp-'))),
      chat: () => [],
      autopiloti: () => client.elenca(),
      domande: () => client.domande(),
      rispondi: (id: string, r: string) => client.rispondi(id, r),
      scriviAChat: () => undefined
    } as unknown as DipendenzeRotte
    const rotte = rotteClient(deps)

    const r = await rotte({ metodo: 'GET', percorso: '/api/domande', corpo: undefined })
    const corpo = r.corpo as { conversazioni: Conversazione[]; chiedono: number }
    expect(corpo.chiedono).toBe(1)
    const c = corpo.conversazioni.find((x) => x.chiave === 'ap:ap-1')
    expect(c?.messaggi.at(-1)?.testo).toContain('criterio della versione')
    expect(c?.messaggi.at(-1)?.opzioni?.map((o) => o.testo)).toEqual(['sì', 'no'])

    // La colonna chiusa, domanda gia' vista: all'avvio si fa avanti la sua
    // linguetta «Domande»; la colonna, per un autopilota, resta chiusa (0.39.1).
    const viste = new Set([`d:${d.id}`])
    expect(decidiColonnaDomande({ conversazioni: corpo.conversazioni, viste, aperta: false, avvio: true })).toMatchObject({ apri: false, linguette: ['ap-1'] })

    // La risposta dalla colonna (la stessa richiesta di pagina e app).
    const q = richiestaRisposta(c!.risposta, 'sì')
    expect((await rotte({ metodo: 'POST', percorso: q.percorso, corpo: q.corpo })).stato).toBe(200)
    expect(await attesa).toMatchObject({ risposta: 'sì' })
    expect(domande.aperte('ap-1')).toEqual([])

    // 0.38.0: nella chat con l'autopilota restano la domanda e la risposta,
    // una sotto l'altra; per la linguetta non ci sono altre domande: si chiude.
    const dopo = await client.elenca()
    const a = dopo.find((x) => x.id === 'ap-1')!
    expect(a.dialogo.slice(-2)).toMatchObject([
      { da: 'lui', testo: 'Mi dai l’ok a considerare superato il criterio della versione?', traccia: true },
      { da: 'tu', testo: 'sì', traccia: true }
    ])
    expect(dopoLaRisposta(domandeScheda(a, await client.domande()))).toEqual({ chiudi: true })
  })
})

describe('la colonna non lascia una domanda in attesa senza farsi vedere (0.37.3)', () => {
  // Domande di chat: sono quelle che stanno nella colonna (0.39.1).
  const domanda = (id: string): Conversazione => ({
    chiave: `chat:${id}`, tipo: 'chat', titolo: id, sotto: '', chiede: true,
    messaggi: [{ da: 'lui', testo: 'ok?', tono: 'domanda' }], risposta: { via: 'scrivi', chat: id }, segnaposto: ''
  })
  const vista = (id: string): string => `k:${id}:ok?:`
  const finita: Conversazione = { chiave: 'chat:f', tipo: 'chat', titolo: 'f', sotto: '', chiede: false, messaggi: [], risposta: { via: 'scrivi', chat: 'f' }, segnaposto: '' }

  it('all avvio una domanda già in attesa (e già vista) apre la colonna', () => {
    expect(decidiColonnaDomande({ conversazioni: [domanda('d1')], viste: new Set([vista('d1')]), aperta: false, avvio: true }))
      .toEqual({ apri: true, evidenzia: 'chat:d1', nuove: [], richiamo: false, linguette: [] })
  })
  it('chiusa a mano, la stessa domanda non la riapre ma il tasto chiama; una diversa la riapre', () => {
    const gia = decidiColonnaDomande({ conversazioni: [domanda('d1')], viste: new Set([vista('d1')]), aperta: false, avvio: false })
    expect(gia).toMatchObject({ apri: false, richiamo: true })
    const nuova = decidiColonnaDomande({ conversazioni: [domanda('d1'), domanda('d2')], viste: new Set([vista('d1')]), aperta: false, avvio: false })
    expect(nuova).toMatchObject({ apri: true, evidenzia: 'chat:d2', nuove: [vista('d2')] })
  })
  it('niente in attesa: niente da aprire e il tasto non chiama; colonna aperta: niente da chiamare', () => {
    expect(decidiColonnaDomande({ conversazioni: [finita], viste: new Set(), aperta: false, avvio: true })).toMatchObject({ apri: false, richiamo: false })
    expect(decidiColonnaDomande({ conversazioni: [domanda('d1')], viste: new Set([vista('d1')]), aperta: true, avvio: false })).toMatchObject({ apri: false, richiamo: false })
  })
})
