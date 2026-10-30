import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { datiPannello } from '../../src/main/pannello-drive-dati'
import { paginaClient } from '../../src/main/client-pagina'
import { conVista } from '../../src/shared/progetti-vista'

/**
 * Il pannello delle chat e dei progetti del Drive come lo manda un PC alla
 * 0.58.0 (`/api/drive/pannello`), su dati d'esempio. L'app lo legge da
 * `android/app/src/test/resources/pannello-drive/pannello-0.60.json`
 * (dalla 0.60.0; `pannello-0.58.json` resta com'era: l'app legge anche i PC vecchi)
 * (PannelloDriveTest; dalla 0.69.0 `pannello-0.69.json`, con la vista dei progetti; dalla 0.88.0
 * `pannello-0.88.json`, un proprietario per progetto); la pagina lo disegna qui sotto. `AGGIORNA=1` riscrive.
 */
const ORA = Date.parse('2026-10-10T18:00:00Z')

function esempio(): Record<string, unknown> {
  const p = datiPannello({
    io: { id: 'pc-qui', nome: 'PC-ESEMPIO', battito: new Date(ORA).toISOString() },
    pc: [
      { id: 'pc-port', nome: 'PORTATILE-ESEMPIO', battito: new Date(ORA - 60_000).toISOString(), locali: { chat: [{ sessione: 's-uno', cwd: 'D:\\Lavoro\\Gestionale', mtime: ORA - 3_600_000 }], progetti: [] } },
      { id: 'pc-vecchio', nome: 'PC-VECCHIO', battito: new Date(ORA - 120_000).toISOString() }
    ],
    locali: [
      { sessione: 's-due', titolo: 'Note di prova', cwd: 'C:\\Progetti\\Sito', mtime: ORA - 7_200_000 },
      // 0.60.0: una chat senza nome, attaccata al suo progetto per cartella e nascosta dagli elenchi.
      { sessione: 's-tre', titolo: '', cwd: 'C:\\Progetti\\Sito\\sotto', mtime: ORA - 9_000_000 }
    ],
    manifesto: undefined, aperteQui: ['s-due'], alLavoroQui: ['s-due'], titoliNoti: [{ sessione: 's-uno', titolo: 'Fatture' }],
    progetti: [
      { id: 'prog-g', nome: 'Gestionale', proprietario: 'pc-port', percorso: 'D:\\Lavoro\\Gestionale', aggiuntoIl: '2026-09-01T00:00:00Z' },
      { id: 'prog-s', nome: 'Sito', proprietario: 'pc-qui', percorso: 'C:\\Progetti\\Sito', aggiuntoIl: '2026-09-20T00:00:00Z' }
    ],
    workspaceQui: ['Sito', 'Altro'],
    adesso: ORA
  })
  // La vista dei progetti (0.69.0): la calcola il PC, l'app e la pagina la disegnano.
  const conLaVista = conVista(p, {})
  return JSON.parse(JSON.stringify({
    ...conLaVista,
    rimozione: {
      stati: [],
      inRecupero: [{ id: 'Vecchio-2026', progetto: 'prog-v', nome: 'Vecchio', percorsoOriginale: 'C:\\Progetti\\Vecchio', dove: 'C:\\Dati\\recupero-progetti\\Vecchio-2026', quando: '2026-10-01T10:00:00.000Z', motivo: 'spostato su PORTATILE-ESEMPIO', scadeIl: '2026-10-31T10:00:00.000Z' }]
    }
  }).replace(/"letto":"[^"]*"/, '"letto":"2026-10-10T18:00:00.000Z"'))
}

describe('il pannello del Drive per la pagina e per l’app', () => {
  const atteso = esempio()
  it('la risposta è quella che l’app si aspetta', () => {
    // Dalla 0.88.0 un proprietario per progetto; `pannello-0.69.json` resta com'era, per i PC di prima.
    const file = join('android', 'app', 'src', 'test', 'resources', 'pannello-drive', 'pannello-0.88.json')
    if (process.env.AGGIORNA === '1' || !existsSync(file)) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(atteso, null, 2) + '\n') }
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(atteso)
  })
  it('i progetti hanno le azioni con i testi del PC: apri qui; apri là o sposta su questo PC', () => {
    const progetti = atteso.progetti as { id: string; azioni: { id: string; testo: string }[] }[]
    expect(progetti.find((g) => g.id === 'prog-s')?.azioni.map((a) => a.id)).toEqual(['apri'])
    const g = progetti.find((x) => x.id === 'prog-g')!
    expect(g.azioni.map((a) => a.id)).toEqual(['apri-remoto', 'sposta-qui'])
    expect(g.azioni.find((a) => a.id === 'sposta-qui')?.testo).toContain('recupero per 30 giorni')
    expect(atteso.pcDaAggiornare).toEqual(['PC-VECCHIO'])
  })
  it('la pagina lo disegna: riassunto, conferma, ripristina, azioni', () => {
    const html = paginaClient()
    const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
    const estrai = (nome: string): string => {
      const inizio = script.indexOf(`function ${nome}(`)
      let p = 0
      for (let i = script.indexOf('{', inizio); i < script.length; i++) {
        if (script[i] === '{') p++
        else if (script[i] === '}' && --p === 0) return script.slice(inizio, i + 1)
      }
      throw new Error(nome)
    }
    const riga = (inizio: string): string => script.split(String.fromCharCode(10)).find((r) => r.trimStart().startsWith(inizio)) ?? ''
    const disegna = (dati: unknown, scelto = '', strumento = ''): string => (new Function('pdDati', 'pdScelto', 'pdStrumento', `
      ${riga('const esc =')}; ${riga('const escJs =')}
      var pdErrore = ''; var pdVista = 'progetti'; var pdFiltro = 'tutti'; var pdDaConfermare = ''; var pdSenzaNome = false, aiutiAperti = {}
      var pdGruppo = 'tutti'; var pdQ = ''; var pdOrdine = 'stato'
      ${estrai('aiuto')}
      ${riga('const PD_PASSI =')}; ${riga('const PD_TIPI =')}; ${estrai('pdByte')} ${estrai('pdTraslochiHtml')} ${estrai('pdSpazioHtml')}
      ${riga('const PD_GRUPPI =')}; ${riga('const PD_ORDINI =')}; ${riga('const PD_COLORE =')}; ${riga('const PD_RANGO =')}
      ${estrai('pdPiano')} ${estrai('pdVistaDi')} ${estrai('pdOrdinate')} ${estrai('pdPillola')} ${estrai('pdElencoHtml')} var pdSpostaVerso = ''; ${estrai('pdSpostaHtml')} ${estrai('pdDettaglioHtml')} ${estrai('pdStrumentiHtml')}
      ${estrai('pdQuando')} ${estrai('pdStato')} ${estrai('pdProblemi')} ${estrai('pdFiltra')} ${estrai('pdScegliPc')} ${estrai('pannelloDriveHtml')}
      return pannelloDriveHtml()`) as (d: unknown, s: string, t: string) => string)(dati, scelto, strumento)
    // 0.69.0: l'elenco con lo stato in una parola (dal PC), i gruppi con i conti, gli strumenti.
    const h = disegna(atteso)
    for (const t of ['Gestionale', 'Sito', 'va aggiornato', 'pdApri(', 'Tutte le chat', 'Cartelle in recupero (1)']) expect(h).toContain(t)
    // Il dettaglio a tutto schermo: le azioni del PC in vista, le chat dove vivono.
    const d = disegna(atteso, 'prog-g')
    for (const t of ['‹ Progetti', 'Apri su PORTATILE-ESEMPIO', 'Sposta su questo PC', 'Fatture', 'Guarda su PORTATILE-ESEMPIO', 'pdApriChat(']) expect(d).toContain(t)
    expect(disegna(atteso, '', 'recupero')).toContain('Ripristina')
    // 0.65.0: lo spazio sul Drive negli strumenti.
    const conTrasloco = { ...atteso, spazio: { misura: { totale: { file: 3, byte: 2048 }, perTipo: { chat: { file: 3, byte: 2048 } }, inRecupero: { file: 0, byte: 0 }, misuratoIl: '' }, proposte: [{ tipo: 'doppie', titolo: 'Copie doppie', breve: '1 chat salvate due volte', spiega: 'x', voci: [], byte: 1024 }], pulizie: [] } }
    const h3 = disegna(conTrasloco, '', 'spazio')
    for (const t of ['Spazio sul Drive', 'SierraDeck usa <b>2,0 KB</b>', 'Copie doppie', 'libera 1,0 KB', 'Pulisci…']) expect(h3).toContain(t)
  })
  it('«Progetti» è una voce propria della pagina (0.58.2; 0.83.0 la prima linguetta)', () => {
    const html = paginaClient()
    expect(html).toContain('"id":"progetti"')
    expect(html).toContain(': pannelloDriveHtml() +')
  })
})

describe('la pagina ridisegna «Progetti» quando cambia (0.69.0)', () => {
  it('l’impronta della pagina guarda i dati e le scelte del pannello', () => {
    const html = paginaClient()
    const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
    const corpo = script.slice(script.indexOf('function impronta('), script.indexOf('function segnaScorrimento('))
    for (const t of ['pdDati ?', 'pdGruppo', 'pdOrdine', 'pdScelto', 'pdStrumento', 'pdDaConfermare']) expect(corpo, t).toContain(t)
  })
})
