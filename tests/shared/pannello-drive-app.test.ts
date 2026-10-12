import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { datiPannello } from '../../src/main/pannello-drive-dati'
import { paginaClient } from '../../src/main/client-pagina'
import { chiaveProgetto, sceltaProgetto } from '../../src/shared/allineamento'
import { testoRiassunto } from '../../src/shared/residenza'
import { ferma, nuovoTrasloco, segna } from '../../src/shared/trasloco'
import { conVista } from '../../src/shared/progetti-vista'

/**
 * Il pannello delle chat e dei progetti del Drive come lo manda un PC alla
 * 0.58.0 (`/api/drive/pannello`), su dati d'esempio. L'app lo legge da
 * `android/app/src/test/resources/pannello-drive/pannello-0.60.json`
 * (dalla 0.60.0; `pannello-0.58.json` resta com'era: l'app legge anche i PC vecchi)
 * (PannelloDriveTest; dalla 0.69.0 `pannello-0.69.json`, con la vista dei progetti); la pagina lo disegna qui sotto. `AGGIORNA=1` riscrive.
 */
const ORA = Date.parse('2026-10-10T18:00:00Z')

function esempio(): Record<string, unknown> {
  const p = datiPannello({
    io: { id: 'pc-qui', nome: 'PC-ESEMPIO', battito: new Date(ORA).toISOString() },
    pc: [
      { id: 'pc-port', nome: 'PORTATILE-ESEMPIO', battito: new Date(ORA - 60_000).toISOString(), locali: { chat: [{ sessione: 's-uno', cwd: 'D:\\Lavoro\\Gestionale', mtime: ORA - 3_600_000 }], progetti: [] } },
      { id: 'pc-vecchio', nome: 'PC-VECCHIO', battito: new Date(ORA - 120_000).toISOString() }
    ],
    case: { versione: 1, case: {
      's-uno': { pc: 'pc-port', pcNome: 'PORTATILE-ESEMPIO', motivo: 'scelta', decisaIl: '2026-10-01T00:00:00Z', da: 'nicholas' },
      ...sceltaProgetto({ id: 'prog-g', nome: 'Gestionale', pc: { id: 'pc-port', nome: 'PORTATILE-ESEMPIO' }, chi: { id: 'pc-qui', nome: 'PC-ESEMPIO' }, quando: '2026-10-05T00:00:00Z' })
    } },
    locali: [
      { sessione: 's-due', titolo: 'Note di prova', cwd: 'C:\\Progetti\\Gestionale', mtime: ORA - 7_200_000 },
      // 0.60.0: una chat senza nome, attaccata al suo progetto per cartella e nascosta dagli elenchi.
      { sessione: 's-tre', titolo: '', cwd: 'C:\\Progetti\\Gestionale\\sotto', mtime: ORA - 9_000_000 }
    ],
    manifesto: undefined, aperteQui: ['s-due'], alLavoroQui: ['s-due'], titoliNoti: [{ sessione: 's-uno', titolo: 'Fatture' }],
    progetti: [
      { id: 'prog-g', nome: 'Gestionale', percorsi: { 'pc-qui': 'C:\\Progetti\\Gestionale', 'pc-port': 'D:\\Lavoro\\Gestionale' }, aggiuntoIl: '2026-09-01T00:00:00Z' },
      // 0.60.0: lo stesso progetto registrato una seconda volta da un altro PC (stesso nome, normalizzato).
      { id: 'prog-g2', nome: 'gestionale (2)', percorsi: { 'pc-port': 'E:\\Copie\\gestionale (2)' }, aggiuntoIl: '2026-09-20T00:00:00Z' }
    ],
    workspaceQui: ['Gestionale', 'gestionale (2)', 'Altro'],
    adesso: ORA,
    piano: { azioni: [{ tipo: 'solo-cloud', progetto: 'prog-g', nome: 'Gestionale', percorso: 'C:\\Progetti\\Gestionale', residente: 'PORTATILE-ESEMPIO', perche: 'Il residente di «Gestionale» è PORTATILE-ESEMPIO: qui dovrebbe essere solo cloud.' }], senzaScelta: 0 }
  })
  const corpo = {
    nome: 'Gestionale', pcNome: 'PC-ESEMPIO', destinazione: 'C:\\Progetti\\Gestionale', nuova: false, git: false,
    copie: [{ chiave: 'drive:prog-g2', tipo: 'drive' as const, etichetta: 'sul Drive, salvata da PORTATILE-ESEMPIO (prog-g)', uguali: 10, aggiunti: 2, sostituiti: 1, recuperati: 1, esclusi: 0, vaInRecupero: false }],
    file: { uguali: 10, aggiunti: 2, sostituiti: 1, recuperati: 1, note: 1 },
    chat: { daSpostare: 0, delProgetto: 3, daAltriPc: 1 },
    workspace: { tiene: 'Gestionale', uniti: ['gestionale (2)'], aperti: [] },
    registro: { principale: 'prog-g', uniti: ['prog-g2'] },
    recupero: [], inUso: [], recuperati: '.sierradeck/recuperati/unione-2026-10-10-18-00-00'
  }
  const rimozione = [{ progetto: 'prog-g', nome: 'Gestionale', residente: 'PORTATILE-ESEMPIO', fase: 'attesa-conferma' as const, messaggio: 'Progetto «Gestionale», confrontato da PORTATILE-ESEMPIO (il residente).', quando: new Date(ORA).toISOString() }]
  // La vista dei progetti (0.69.0): la calcola il PC, l'app e la pagina la disegnano.
  const conLaVista = conVista(p, { rimozione })
  return JSON.parse(JSON.stringify({
    ...conLaVista,
    residenza: [{ progetto: 'prog-g', nome: 'Gestionale', fase: 'attesa-conferma', messaggio: testoRiassunto(corpo).join(' '), riassunto: { ...corpo, righe: testoRiassunto(corpo) }, quando: new Date(ORA).toISOString() }],
    unioni: [{ id: 'Sito-2026-10-09', progetto: 'prog-s', nome: 'Sito', quando: '2026-10-09T10:00:00.000Z', destinazione: 'C:\\Progetti\\Sito', scadeIl: '2026-11-08T10:00:00.000Z' }],
    rimozione: {
      stati: rimozione,
      inRecupero: [{ id: 'Vecchio-2026', progetto: 'prog-v', nome: 'Vecchio', percorsoOriginale: 'C:\\Progetti\\Vecchio', dove: 'C:\\Dati\\recupero-progetti\\Vecchio-2026', quando: '2026-10-01T10:00:00.000Z', motivo: 'solo cloud', scadeIl: '2026-10-31T10:00:00.000Z' }]
    }
  }).replace(/"letto":"[^"]*"/, '"letto":"2026-10-10T18:00:00.000Z"'))
}

describe('il pannello del Drive per la pagina e per l’app', () => {
  const atteso = esempio()
  it('la risposta è quella che l’app si aspetta', () => {
    // Dalla 0.69.0 con la vista; `pannello-0.60.json` resta com'era, per i PC di prima.
    const file = join('android', 'app', 'src', 'test', 'resources', 'pannello-drive', 'pannello-0.69.json')
    if (process.env.AGGIORNA === '1' || !existsSync(file)) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(atteso, null, 2) + '\n') }
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(atteso)
  })
  it('il progetto ha le azioni con i testi del PC: rendi residente qui, rendi solo cloud qui', () => {
    const g = (atteso.progetti as { azioni: { id: string; testo: string }[] }[])[0]!
    expect(g.azioni.map((a) => a.id)).toEqual(['apri', 'residente-qui', 'solo-cloud-qui'])
    expect(g.azioni.find((a) => a.id === 'solo-cloud-qui')?.testo).toContain('cartella di recupero')
    expect(atteso.pcDaAggiornare).toEqual(['PC-VECCHIO'])
    expect(Object.keys((atteso as { case?: unknown }).case ?? {})).not.toContain(chiaveProgetto('prog-g'))
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
    const disegna = new Function('pdDati', `
      ${riga('const esc =')}; ${riga('const escJs =')}
      var pdErrore = ''; var pdVista = 'progetti'; var pdFiltro = 'tutti'; var pdDaConfermare = ''; var pdSenzaNome = false, aiutiAperti = {}
      ${estrai('aiuto')}
      ${riga('const PD_PASSI =')}; ${riga('const PD_TIPI =')}; ${estrai('pdByte')} ${estrai('pdTraslochiHtml')} ${estrai('pdSpazioHtml')}
      ${estrai('pdQuando')} ${estrai('pdStato')} ${estrai('pdProblemi')} ${estrai('pdFiltra')} ${estrai('pdScegliPc')} ${estrai('pannelloDriveHtml')}
      return pannelloDriveHtml()`) as (d: unknown) => string
    const h = disegna(atteso)
    for (const t of ['Gestionale', 'Conferma e togli da questo PC', 'Ripristina', 'Lavora su questo PC', 'Togli da questo PC', 'va aggiornato alla 0.58', 'Piano di allineamento']) expect(h).toContain(t)
    // 0.67.0: le chat del progetto sotto la sua riga, con «Apri su <PC>» dove vivono altrove.
    for (const t of ['Fatture', 'Apri su PORTATILE-ESEMPIO', 'pdApriChat(']) expect(h).toContain(t)
    // 0.60.0: un progetto solo per nome, il riassunto di «Rendi residente» con la conferma, le unioni annullabili.
    for (const t of ['Stesso nome, stesso progetto: 2 voci nel registro', 'Conferma e unisci', 'Annulla l’unione', '(di cui 1 senza nome)', '«gestionale (2)» entra in «Gestionale»']) expect(h).toContain(t)
    // 0.65.0: il trasloco passo per passo (fermo, con il motivo e «Riprendi») e lo spazio sul Drive.
    const base = nuovoTrasloco({ id: 'trasloco-1', progetto: 'prog-g', nome: 'Gestionale', verso: { pc: 'pc-qui', nome: 'PC-ESEMPIO' }, chiesto: { da: 'pc-port', come: 'sposta' }, altrove: [{ pc: 'pc-port', nome: 'PORTATILE-ESEMPIO' }], adesso: '2026-10-12T10:00:00Z' })
    const fermo = ferma(segna(base, 'raccolta', { stato: 'fatto', dettaglio: '1 copia salvata sul Drive' }, '2026-10-12T10:01:00Z'), 'analisi', 'PORTATILE-ESEMPIO non risponde', true, '2026-10-12T10:02:00Z')
    const h2 = disegna({ ...atteso, traslochi: [fermo], spazio: { misura: { totale: { file: 3, byte: 2048 }, perTipo: { chat: { file: 3, byte: 2048 } }, inRecupero: { file: 0, byte: 0 }, misuratoIl: '' }, proposte: [{ tipo: 'doppie', titolo: 'Copie doppie', breve: '1 chat salvate due volte', spiega: 'x', voci: [], byte: 1024 }], pulizie: [] } })
    for (const t of ['Trasloco di «Gestionale» su PC-ESEMPIO', 'Fermo: PORTATILE-ESEMPIO non risponde', 'Riprendo da solo', '✓ Raccolgo le copie — 1 copia salvata sul Drive', 'Riprendi', 'Spazio sul Drive', 'SierraDeck usa <b>2,0 KB</b>', 'Copie doppie', 'libera 1,0 KB', 'Pulisci…']) expect(h2).toContain(t)
  })
  it('«Progetti» è una destinazione propria della pagina (0.58.2)', () => {
    const html = paginaClient()
    expect(html).toContain('"id":"progetti"')
    expect(html).toContain('progetti: pannelloDriveHtml()')
  })
})
