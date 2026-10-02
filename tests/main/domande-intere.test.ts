import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { domandaChiara } from '../../src/autopilot-host/risposta-autonoma'
import { creaClientAutopilota } from '../../src/main/autopilot-client'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'
import { paginaClient } from '../../src/main/client-pagina'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import type { Conversazione } from '@shared/domande-conversazioni'
import type { DomandaScheda } from '@shared/domande-autopilota'

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

  it('domandaChiara la tiene intera e la mette prima dell obiettivo', () => {
    const a = nuovoAutopilota({ id: 'ap-1', nome: 'App Android', obiettivo: OBIETTIVO, cwd: '.', criteri: [], iniziatoIl: '2026-10-02T09:00:00.000Z' })
    const t = domandaChiara(a, LUNGA)
    expect(t).toContain(LUNGA)
    expect(t.indexOf(LUNGA)).toBeLessThan(t.indexOf(OBIETTIVO))
    // Il vecchio taglio a 500 caratteri la perdeva del tutto.
    expect(t.slice(0, 500)).not.toContain(LUNGA)
  })

  it('il servizio non accorcia piu le domande', () => {
    const server = readFileSync(join(__dirname, '../../src/autopilot-host/server.ts'), 'utf8')
    expect(server).not.toMatch(/domandaChiara\([^)]*\)\s*\.slice\(/)
    expect(server).not.toMatch(/domandaChiara\(\s*a,[\s\S]{0,120}?\)\.slice\(/)
    expect(server).not.toContain('motivoSospensione: decisione.domanda.slice(')
    expect(server).not.toContain('motivoSospensione: esito.testo.slice(')
  })

  it('dal servizio vero alla colonna, alla linguetta e al telefono: uguale carattere per carattere', async () => {
    const archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'sd-intere-')))
    const domande = creaRegistroDomande({ adesso: () => Date.now() })
    archivio.scrivi({
      ...nuovoAutopilota({ id: 'ap-1', nome: 'App Android', obiettivo: OBIETTIVO, cwd: process.cwd(), criteri: [{ descrizione: 'c', soddisfatto: false }], iniziatoIl: '2026-10-02T09:00:00.000Z' }),
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
    const a = archivio.leggi('ap-1') as Autopilota
    const testo = domandaChiara(a, LUNGA)
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
    // Le due viste della domanda (la schermata «TI STA CHIEDENDO» e la linguetta) la usano.
    expect(html.match(/class="grande domanda-ap"/g)?.length).toBe(2)
    expect(html).toMatch(/\.battuta \{[^}]*white-space: pre-wrap/)
  })
})
