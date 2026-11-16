import { describe, it, expect } from 'vitest'
import { sorgenteUpdater, FILE_NOTE_UPDATER } from '../../src/main/updater/sorgente'
import { rigaRettangolo } from '../../src/main/updater/compila'
import { scriptFinestraAggiornamento } from '../../src/main/finestra-aggiornamento'
import { righeNotePerUpdater, type NotaResa } from '../../src/shared/note-aggiornamento'

/**
 * 16/11, Nicholas: «voglio che tutto l'aggiornamento venga fatto e visualizzato
 * nella finestra a destra… senza far apparire nel centro dello schermo nulla».
 */
describe('SierraDeck Update nella finestra a destra', () => {
  const sorgente = sorgenteUpdater()

  it('non nasce mai al centro dello schermo', () => {
    expect(sorgente).not.toContain('CenterScreen')
    expect(sorgente).toContain('FormStartPosition.Manual')
    expect(scriptFinestraAggiornamento()).not.toContain('CenterScreen')
  })

  it('legge nome, rettangolo e versione di partenza dai parametri', () => {
    for (const indice of ['args[6]', 'args[7]', 'args[8]', 'args[9]']) expect(sorgente).toContain(indice)
  })

  it('mostra le novità dal file accanto, e comincia col BOM per gli accenti', () => {
    expect(sorgente).toContain(FILE_NOTE_UPDATER)
    expect(sorgente.charCodeAt(0)).toBe(0xfeff)
    expect(sorgente).toContain('COSA CAMBIA')
  })

  it('si toglie quando il programma riaperto ha di nuovo una finestra', () => {
    expect(sorgente).toContain('FinestraNuova()')
    expect(sorgente).toContain('IsWindowVisible')
  })

  it('senza porta (l Aiutante) non accende la spia', () => {
    expect(sorgente).toContain('if (porta > 0) AvviaSpia(porta)')
  })
})

describe('rigaRettangolo', () => {
  it('scrive x,y,w,h interi', () => {
    expect(rigaRettangolo({ x: 1388.4, y: 428, width: 520, height: 639.6 })).toBe('1388,428,520,640')
  })
  it('vuoto se manca o non è un numero', () => {
    expect(rigaRettangolo(undefined)).toBe('')
    expect(rigaRettangolo({ x: Number.NaN, y: 0, width: 1, height: 1 })).toBe('')
  })
})

describe('righeNotePerUpdater', () => {
  const note: NotaResa[] = [
    {
      versione: '0.108.0',
      blocchi: [
        { tipo: 'elenco', voci: [[{ testo: 'Accesso a Claude ' }, { testo: 'per un anno', grassetto: true }], [{ testo: '   ' }]] },
        { tipo: 'titolo', pezzi: [{ testo: 'SierraDeck Aiutante 1.1.0' }] },
        { tipo: 'paragrafo', pezzi: [{ testo: 'Allegato anche l’installer.' }] },
        { tipo: 'codice', testo: 'npm run pubblica' }
      ]
    },
    { versione: '0.107.4', blocchi: [{ tipo: 'elenco', voci: [[{ testo: 'Correzione' }]] }] }
  ]

  it('una riga per voce, senza stili e senza righe vuote o codice', () => {
    expect(righeNotePerUpdater(note)).toEqual([
      '# 0.108.0',
      '- Accesso a Claude per un anno',
      '## SierraDeck Aiutante 1.1.0',
      'Allegato anche l’installer.',
      '# 0.107.4',
      '- Correzione'
    ])
  })

  it('rispetta i limiti di versioni e righe', () => {
    expect(righeNotePerUpdater(note, { versioni: 1 })).not.toContain('# 0.107.4')
    expect(righeNotePerUpdater(note, { righe: 2 })).toHaveLength(2)
  })
})
