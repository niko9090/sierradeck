import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { VistaAggiornamenti, SchedaVersione, type AzioniAggiornamenti } from '../../src/renderer/components/FinestraAggiornamenti'
import type { StatoAggiornamento } from '../../src/main/aggiornamenti'
import type { NoteAggiornamento } from '../../src/shared/note-aggiornamento'
import { analizzaMarkdown } from '../../src/shared/note-aggiornamento'
import type { VistaNovita } from '../../src/shared/finestra-novita'

/**
 * La finestra degli aggiornamenti in basso a destra (13/11, rifatta): testa con
 * la frase dello stato, barra con MB/s, registro delle versioni sempre visibile,
 * e «Installa e riavvia» solo come tasto da premere.
 */
const azioni: AzioniAggiornamenti = { chiudi: () => undefined, installa: () => undefined, aggiornaAdesso: () => undefined, scarica: () => undefined, cerca: () => undefined, apri: () => undefined }

const note: NoteAggiornamento = {
  versione: '1.1.1',
  installata: '1.0.0',
  fonte: 'github',
  dove: 'https://github.com/esempio/esempio/releases',
  note: [
    { versione: '1.1.1', data: '2026-11-13T10:00:00Z', blocchi: analizzaMarkdown('- **Si apre:** corretto l’avvio.') },
    { versione: '1.1.0', data: '2026-11-12T10:00:00Z', blocchi: analizzaMarkdown('- **Funzione nuova:** fa una cosa.\n- **Altra:** un’altra.') }
  ]
}

const vista = (agg: StatoAggiornamento, p: { scaricaAuto?: boolean; note?: NoteAggiornamento; v?: VistaNovita } = {}): string =>
  renderToStaticMarkup(
    <VistaAggiornamenti agg={agg} vista={p.v ?? { tipo: 'aggiornamento' }} versione="1.0.0" scaricaAuto={p.scaricaAuto ?? true} note={p.note} azioni={azioni} />
  )

describe('la finestra degli aggiornamenti, stato per stato', () => {
  it('pronta: testa «Nuova versione … pronta», da → a, «Installa e riavvia» e «Più tardi»', () => {
    const h = vista({ fase: 'pronto', versione: '1.1.1' }, { note })
    expect(h).toContain('Nuova versione 1.1.1 pronta')
    expect(h).toContain('da 1.0.0 → a 1.1.1')
    expect(h).toContain('>Installa e riavvia<')
    expect(h).toContain('>Più tardi<')
    expect(h).toContain('Si installa solo quando premi')
  })
  it('pronta: il registro mostra la nuova e la saltata, con tipo, data e titoli in grassetto', () => {
    const h = vista({ fase: 'pronto', versione: '1.1.1' }, { note })
    expect(h).toContain('1.1.1')
    expect(h).toContain('Correzioni')
    expect(h).toContain('Novità')
    expect(h).toContain('saltata')
    expect(h).toContain('13 nov 2026')
    expect(h).toContain('<span class="fnov-voce__titolo">Funzione nuova</span>')
    expect(h).toContain('2 versioni dopo la 1.0.0: 1 con novità, 1 di correzioni')
  })
  it('scarico: barra, MB/s e tempo che manca; nessun tasto che installa', () => {
    const mb = 1024 * 1024
    const h = vista({ fase: 'scarico', versione: '1.1.1', percento: 45, scaricati: 45 * mb, totale: 100 * mb, velocita: 5 * mb }, { note })
    expect(h).toContain('Sto scaricando… 45%')
    expect(h).toContain('width:45%')
    expect(h).toContain('5,0 MB/s')
    expect(h).toContain('ancora circa 10 s')
    expect(h).not.toContain('Installa e riavvia')
  })
  it('disponibile: «Scarica» solo se lo scaricamento automatico è spento', () => {
    expect(vista({ fase: 'disponibile', versione: '1.1.1' }, { scaricaAuto: false })).toContain('>Scarica<')
    expect(vista({ fase: 'disponibile', versione: '1.1.1' }, { scaricaAuto: true })).not.toContain('>Scarica<')
  })
  it('mentre si leggono le note lo dice, non resta vuota', () => {
    expect(vista({ fase: 'pronto', versione: '1.1.1' })).toContain('Leggo le note delle versioni')
  })
  it('sei aggiornato: registro della versione installata (da novita.ts), «Cerca aggiornamenti» e «Tutte le versioni»', () => {
    const h = renderToStaticMarkup(
      <VistaAggiornamenti agg={{ fase: 'aggiornato' }} vista={{ tipo: 'aggiornamento' }} versione="0.106.1" scaricaAuto note={undefined} azioni={azioni} />
    )
    expect(h).toContain('Sei aggiornato')
    expect(h).toContain('versione 0.106.1')
    expect(h).toContain('Si apre di nuovo')
    expect(h).toContain('installata')
    expect(h).toContain('Cerca aggiornamenti')
    expect(h).toContain('Tutte le versioni')
    expect(h).not.toContain('Installa e riavvia')
  })
  it('attendo: «Aggiorna adesso», con la spiegazione dietro il «?»', () => {
    const h = vista({ fase: 'attendo', versione: '1.1.1', chatOccupate: 2 }, { note })
    expect(h).toContain('2 chat finiscano')
    expect(h).toContain('Aggiorna adesso')
  })
  it('errore e installazione non riuscita', () => {
    const e = vista({ fase: 'errore', errore: 'rete giù' })
    expect(e).toContain('Aggiornamento non riuscito')
    expect(e).toContain('rete giù')
    expect(e).toContain('>Riprova<')
    const h = vista({ fase: 'pronto', versione: '1.1.1', tentativoFallito: { titolo: 'Non si è installata.', motivo: 'Motivo.', strade: ['Riprova'], pagina: 'https://example.invalid' } as StatoAggiornamento['tentativoFallito'] }, { note })
    expect(h).toContain('Non si è installata.')
    expect(h).toContain('Scarica a mano')
    expect(h).toContain('Riprova a installare')
  })
  it('una scheda chiusa mostra quante voci ha, aperta le voci', () => {
    const v = { versione: '1.1.0', tipo: 'novita' as const, ruolo: 'saltata' as const, voci: [{ titolo: 'A', testo: [{ testo: 'uno' }] }, { testo: [{ testo: 'due' }] }] }
    const chiusa = renderToStaticMarkup(<SchedaVersione v={v} aperta={false} onCambia={() => undefined} />)
    expect(chiusa).toContain('2 voci')
    expect(chiusa).toContain('aria-expanded="false"')
    expect(chiusa).not.toContain('uno')
    const aperta = renderToStaticMarkup(<SchedaVersione v={v} aperta onCambia={() => undefined} />)
    expect(aperta).toContain('aria-expanded="true"')
    expect(aperta).toContain('uno')
    expect(aperta).not.toContain('<time')
  })
})

describe('fuori dalla faccia del programma', () => {
  const app = readFileSync('src/renderer/App.tsx', 'utf8')
  it('App non disegna più le strisce né le finestre delle note', () => {
    expect(app).not.toContain('avviso--aggiornamento')
    expect(app).not.toContain('<ModaleNote')
    expect(app).toContain("finestraNovita?.apri({ tipo: 'installa', versione })")
  })
  it('la finestra non è una finestra di chat, non installa da sola, si allarga e ricorda la grandezza', () => {
    const main = readFileSync('src/main/finestra-novita.ts', 'utf8')
    expect(main).toContain('segnaFinestraAccessoria(w)')
    expect(main).toContain('showInactive()')
    expect(main).not.toMatch(/aggiornamenti\.installa|installa\(\)/)
    expect(main).toContain('resizable: true')
    expect(main).toContain("w.on('resized'")
    const pannelli = readFileSync('src/main/finestre-pannello.ts', 'utf8')
    expect(pannelli).toContain('!accessorie.has(w.id)')
  })
  it('l’ingresso del renderer sceglie la finestra con ?finestra=aggiornamenti', () => {
    expect(readFileSync('src/renderer/main.tsx', 'utf8')).toContain("finestra === 'aggiornamenti' ? <FinestraAggiornamenti />")
  })
})
