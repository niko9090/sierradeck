import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { paginaClient } from '../../src/main/client-pagina'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'
import { nuovoAutopilota } from '@shared/autopilota'
import type { Punto } from '@shared/punto-autopilota'

// 0.84.3: il Punto in cima alla conversazione dell'autopilota anche sulla
// pagina del telefono, con il segnale di ogni chat nei colori del PC. Le
// righe le calcola il PC (`puntoDi`) e arrivano con `/api/autopilota`.

const html = paginaClient()
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
function funzione(nome: string): string {
  const inizio = script.indexOf(`function ${nome}`)
  if (inizio < 0) throw new Error(`${nome} non trovata`)
  let profondita = 0
  for (let i = script.indexOf('{', inizio); i < script.length; i += 1) {
    if (script[i] === '{') profondita += 1
    else if (script[i] === '}' && --profondita === 0) return script.slice(inizio, i + 1)
  }
  throw new Error(`${nome} non chiusa`)
}

const COLORE_VISTA = { verde: 'VERDE', ambra: 'AMBRA', rosso: 'ROSSO', blu: 'BLU', quieto: 'QUIETO' }
const esc = (s: unknown): string => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
const puntoHtml = new Function('esc', 'aiuto', 'COLORE_VISTA', `${funzione('puntoHtml')}; return puntoHtml`)(esc, () => '', COLORE_VISTA) as (p: unknown) => string

const punto: Punto = {
  indicatore: {
    versione: 'Prossima versione 0.85.0: 1 di 3 pezzi pronti · manca: Indicatore e altri 1 · circa 2 h',
    fine: { testo: 'Fine del lavoro: 4 di 6 criteri · 3 compiti in coda · 1 chat al lavoro', percento: 67 },
    andamento: { livello: 'fermo', colore: 'rosso', simbolo: '■', testo: 'Fermo: nessun segnale vero da 7 h · l’autopilota: riprendo le chat' },
    dettaglio: ['Sviluppo («Il menu»): commit 7 h fa'],
    aiuto: 'Tre righe'
  },
  richieste: [
    { id: 'r-2', giorno: '23/10', titolo: 'Le risposte prese davvero', stato: 'in-corso', parola: 'in corso', colore: 'blu' },
    { id: 'r-1', giorno: '22/10', titolo: 'Togli il freno', stato: 'fatta', parola: 'fatta nella versione 0.84.2', colore: 'verde' }
  ],
  richiesteTotale: 3,
  passo: 'Lavora: 1 di 3 criteri soddisfatti',
  chat: [
    { id: 'c-2', chi: 'Interfaccia', compito: 'La pagina', testo: 'nessun segno da 20 min', tono: 'ferma', colore: 'rosso', segnale: { tipo: 'bloccata', parola: 'bloccata: manca la chiave', colore: 'rosso', simbolo: '■' } },
    { id: 'c-1', chi: 'Sviluppo', compito: 'Il menu', testo: 'al lavoro da 3 min', tono: 'lavoro', colore: 'verde', segnale: { tipo: 'avanti', parola: 'va avanti', colore: 'verde', simbolo: '●' } }
  ],
  finite: 2,
  fatto: ['Il motore'],
  fattoTotale: 1,
  dopo: ['Le notifiche'],
  dopoTotale: 3,
  daTe: [],
  limiti: 'Limiti del piano: 5 ore 42%. Solo per informazione: le chat non si fermano per questo.'
}

describe('il Punto sulla pagina del telefono', () => {
  it('0.85.0: l’indicatore in cima, con la barra e il colore del PC', () => {
    const h = puntoHtml(punto)
    expect(h.indexOf('Prossima versione 0.85.0')).toBeLessThan(h.indexOf('Punto<'))
    expect(h).toContain('Fine del lavoro: 4 di 6 criteri · 3 compiti in coda · 1 chat al lavoro')
    expect(h).toContain('aria-valuenow="67"><span style="width:67%"></span>')
    expect(h).toContain('style="color:ROSSO"><b>■</b> Fermo: nessun segnale vero da 7 h')
    // Un PC più vecchio senza indicatore: il Punto si legge lo stesso.
    const { indicatore: _via, ...vecchio } = punto
    expect(puntoHtml(vecchio)).not.toContain('punto-ap__indicatore')
  })
  it('ogni chat con il suo segnale nei colori del PC, finito, dopo, da te e i limiti', () => {
    const h = puntoHtml(punto)
    expect(h).toContain('Punto')
    expect(h).toContain('Lavora: 1 di 3 criteri soddisfatti')
    expect(h).toContain('<b style="color:ROSSO">Interfaccia</b>')
    expect(h).toContain('style="color:ROSSO">■ bloccata: manca la chiave</span>')
    expect(h).toContain('style="color:VERDE">● va avanti</span>')
    expect(h).toContain('2 chat finite')
    expect(h).toContain('<b>Finito:</b> Il motore')
    expect(h).toContain('<b>Dopo:</b> Le notifiche e altri 2')
    expect(h).toContain('<b>Da te:</b> niente, va avanti da solo.')
    expect(h).toContain('Limiti del piano: 5 ore 42%')
  })
  it('in cima le richieste di Nicholas con lo stato nel suo colore (0.85.0)', () => {
    const h = puntoHtml(punto)
    expect(h).toContain('<b>Le tue richieste:</b>')
    expect(h).toContain('23/10 · Le risposte prese davvero — <span style="color:BLU">in corso</span>')
    expect(h).toContain('22/10 · Togli il freno — <span style="color:VERDE">fatta nella versione 0.84.2</span>')
    expect(h).toContain('e un altro')
    expect(h.indexOf('Le tue richieste')).toBeLessThan(h.indexOf('Lavora: 1 di 3'))
    // Un PC di prima della 0.85.0: niente richieste, il resto uguale.
    expect(puntoHtml({ ...punto, richieste: undefined })).not.toContain('Le tue richieste')
  })
  it('un PC che non manda il Punto non rompe la pagina', () => {
    expect(puntoHtml(undefined)).toBe('')
  })
  it('sta sopra la conversazione, e «Adesso» non si ripete quando c’è', () => {
    expect(script).toContain("puntoHtml(a.punto) +\n    '<div class=\"flusso-ap\"")
    expect(script).toContain("(apDettaglio.punto ? '' : adessoHtml(apDettaglio.adesso))")
  })
  it('lo script della pagina resta valido', () => {
    expect(() => new Function(script)).not.toThrow()
  })
})

describe('/api/autopilota manda il Punto', () => {
  it('con le domande aperte di questo autopilota e i limiti letti', async () => {
    const deps = {
      dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-punto-'))),
      chat: () => [],
      autopiloti: () => Promise.resolve([{
        ...nuovoAutopilota({ id: 'ap-1', nome: 'Notte', obiettivo: 'Test', cwd: 'C:\\p', criteri: [{ descrizione: 'x', soddisfatto: true }], iniziatoIl: '2026-10-22T10:00:00.000Z' }),
        stato: 'lavoro' as const
      }]),
      domande: () => Promise.resolve([{ id: 'd-1', autopilotaId: 'ap-1', testo: 'Quale?' }, { id: 'd-2', autopilotaId: 'ap-2', testo: 'Altro' }]),
      consumi: () => Promise.resolve({ limiti: { cinqueOre: { percento: 37 }, settimana: { percento: 12 } } })
    } as unknown as DipendenzeRotte
    const e = await rotteClient(deps)({ metodo: 'POST', percorso: '/api/autopilota', corpo: { autopilota: 'ap-1' }, dispositivo: 'telefono' })
    expect(e.stato).toBe(200)
    const p = (e.corpo as { punto: Punto & { aiuto: string } }).punto
    expect(p.passo).toBe('Lavora: 1 di 1 criteri soddisfatti')
    expect(p.daTe).toEqual(['Una risposta: la domanda è nella linguetta «Domande».'])
    expect(p.limiti).toContain('5 ore 37%, settimana 12%')
    expect(p.aiuto).toContain('15 minuti')
  })
})
