import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande, type RegistroDomande } from '../../src/autopilot-host/domande'
import { apriCode } from '../../src/autopilot-host/coda-store'
import { apriOrchestratori } from '../../src/autopilot-host/orchestratore-store'
import type { AvviaProcesso, ProcessoClaude } from '../../src/autopilot-host/orchestratore'
import { creaClientAutopilota } from '../../src/main/autopilot-client'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'
import { paginaClient } from '../../src/main/client-pagina'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import type { Conversazione } from '@shared/domande-conversazioni'
import type { DomandaScheda } from '@shared/domande-autopilota'
import { orologioDa } from '../setup/orologio'

// L'orologio del servizio di prova parte da un istante fisso e avanza col
// tempo vero: le attese funzionano come prima, il giorno non cambia mai.
const orologio = orologioDa('2026-10-29T10:00:00.000Z')

/** P4: il servizio vero con l'autopilota del workspace «Lavoro» già scritto. */
function servizioCon(a: Autopilota, domande: RegistroDomande): ServerAutopiloti {
  const archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'sd-dom-')))
  archivio.scrivi(a)
  const cartella = mkdtempSync(join(tmpdir(), 'sd-dom-orch-'))
  const orchestratori = apriOrchestratori(cartella)
  orchestratori.cambiaImpostazioni('Lavoro', (i) => ({ ...i, autopilota: a.id }))
  const avviaProcesso: AvviaProcesso = () => ({ scrivi: () => {}, uccidi: () => {}, suRiga: () => {}, suUscita: () => {} }) as unknown as ProcessoClaude
  return creaServer({
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
}

/**
 * «Le domande sono tutte tagliate» (Nicholas, 02/10, 0.39.1).
 *
 * La causa, trovata sui dati veri (`%APPDATA%/SierraDeck/autopiloti/*.json`):
 * gli obiettivi dei due autopiloti sono lunghi 815 e 1015 caratteri. Il servizio
 * componeva la domanda con `domandaChiara` — chi chiede, **poi l'obiettivo
 * intero**, poi la domanda — e la tagliava a 500 caratteri (`MOTIVO_MAX`): la
 * domanda vera finiva oltre il taglio e nelle Domande arrivava solo mezzo
 * obiettivo. Qui una domanda di 3000 caratteri su piu' righe arriva intera dal
 * servizio fino a quello che la linguetta, la pagina e l'app mostrano.
 */
const LUNGA = Array.from({ length: 30 }, (_x, i) => `Riga ${i + 1}: ${'parola '.repeat(13)}fine riga ${i + 1}.`).join('\n')
const OBIETTIVO = `Analizza e correggi l’app Android. ${'Allinea pagina, app e PC. '.repeat(40)}`

let server: ServerAutopiloti | undefined
afterEach(() => { server?.close(); server = undefined })

describe('la domanda arriva intera, con i suoi a capo', () => {
  it('le misure sono quelle dei dati veri: 3000 caratteri, piu righe, obiettivo oltre 800', () => {
    expect(LUNGA.length).toBeGreaterThanOrEqual(3000)
    expect(LUNGA.split('\n').length).toBe(30)
    expect(OBIETTIVO.length).toBeGreaterThan(800)
  })

  it('il servizio non accorcia piu le domande', () => {
    const server = readFileSync(join(__dirname, '../../src/autopilot-host/server.ts'), 'utf8')
    expect(server).not.toContain('motivoSospensione: decisione.domanda.slice(')
    expect(server).not.toContain('motivoSospensione: esito.testo.slice(')
  })

  it('dal servizio vero alla colonna, alla linguetta e al telefono: uguale carattere per carattere', async () => {
    const domande = creaRegistroDomande({ adesso: orologio.ms })
    server = servizioCon({
      ...nuovoAutopilota({ id: 'ap-1', nome: 'App Android', obiettivo: OBIETTIVO, cwd: process.cwd(), iniziatoIl: '2026-10-02T09:00:00.000Z', workspace: 'Lavoro' }),
      stato: 'lavoro'
    }, domande)
    const porta = await new Promise<number>((ok) => server!.listen(0, '127.0.0.1', () => ok((server!.address() as { port: number }).port)))
    // P4: la domanda è quella che l'autopilota scrive con «chiedi_utente», intera.
    const testo = LUNGA
    domande.apri({ autopilotaId: 'ap-1', testo, scadenzaMs: 60_000 })

    const client = creaClientAutopilota({ porta, avviaServizio: () => undefined })
    const rotte = rotteClient({
      dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-intere-disp-'))),
      chat: () => [],
      autopiloti: () => client.elenca(),
      domande: () => client.domande(),
      rispondi: (id: string, r: string) => client.rispondi(id, r),
      scriviAChat: () => undefined
    } as unknown as DipendenzeRotte)

    // La colonna, la pagina e l'app (`/api/domande`): la domanda in fondo alla conversazione.
    const lista = (await rotte({ metodo: 'GET', percorso: '/api/domande', corpo: undefined })).corpo as { conversazioni: Conversazione[] }
    const conv = lista.conversazioni.find((c) => c.chiave === 'ap:ap-1')
    expect(conv?.messaggi.at(-1)?.testo).toBe(testo)
    // La linguetta «Domande» del PC, della pagina e dell'app (`domandeScheda`).
    const dettaglio = (await rotte({ metodo: 'POST', percorso: '/api/autopilota', corpo: { autopilota: 'ap-1' } })).corpo as { domandeScheda: DomandaScheda[] }
    expect(dettaglio.domandeScheda[0]?.testo).toBe(testo)
    expect(dettaglio.domandeScheda[0]?.testo).toContain(LUNGA)
    // Dal computer al telefono passa come JSON: gli a capo restano.
    expect((JSON.parse(JSON.stringify(dettaglio)) as typeof dettaglio).domandeScheda[0]?.testo.split('\n')).toEqual(testo.split('\n'))
  })
})

describe('nessuno stile la taglia', () => {
  const css = readFileSync(join(__dirname, '../../src/renderer/console.css'), 'utf8')
  const regola = (sel: string): string => {
    const i = css.indexOf(`${sel} {`)
    return i < 0 ? '' : css.slice(i, css.indexOf('}', i))
  }

  it('PC: la linguetta (anche staccata) va a capo dove la domanda va a capo, e scorre il pannello', () => {
    const testo = regola('.domande-ap__testo')
    expect(testo).toContain('white-space: pre-wrap')
    expect(testo).toContain('overflow-wrap: anywhere')
    expect(testo).not.toMatch(/line-clamp|max-height|text-overflow|nowrap|overflow:\s*hidden/)
    expect(regola('.diario__pannello')).toContain('overflow-y: auto')
    expect(regola('.finestra-pannello__corpo')).toContain('overflow: auto')
  })

  it('PC: la colonna mostra le bolle intere e scorre', () => {
    const bolla = regola('.chatap__bolla')
    expect(bolla).toContain('white-space: pre-wrap')
    expect(bolla).not.toMatch(/line-clamp|max-height|text-overflow|nowrap/)
    expect(regola('.chatap__flusso')).toContain('overflow-y: auto')
  })

  it('pagina del telefono: la domanda e pre-wrap e scorre, mai tagliata', () => {
    const html = paginaClient()
    const m = /\.domanda-ap \{([^}]*)\}/.exec(html)
    expect(m?.[1]).toContain('white-space: pre-wrap')
    expect(m?.[1]).toContain('overflow-y: auto')
    expect(m?.[1]).not.toMatch(/line-clamp|text-overflow|nowrap/)
    // Le viste della domanda (la schermata «TI STA CHIEDENDO», la linguetta e, dalla 0.72.1, la scheda essenziale) la usano.
    expect(html.match(/class="grande domanda-ap"/g)?.length).toBe(3)
    expect(html).toMatch(/\.battuta \{[^}]*white-space: pre-wrap/)
  })
})
