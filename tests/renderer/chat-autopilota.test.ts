import { describe, it, expect } from 'vitest'
import { conversazione, comprimiNote, staPensando, haDomandaAperta } from '../../src/renderer/chat-autopilota'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'

function ap(over: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({
      id: 'ap-1',
      nome: 'Lettore',
      obiettivo: 'Sistema il lettore',
      cwd: 'C:\\lavoro\\gestore',
      criteri: [{ descrizione: 'i test passano', comando: 'npm test', soddisfatto: false }],
      iniziatoIl: '2026-09-18T08:00:00.000Z'
    }),
    ...over
  }
}

describe('conversazione', () => {
  it('comincia con quello che gli hai chiesto, con le tue parole', () => {
    const a = ap({ obiettivoTuo: 'sistemami il lettore', obiettivo: 'Correggere il parser del lettore' })
    const prima = conversazione(a)[0]
    expect(prima).toMatchObject({ da: 'tu', testo: 'sistemami il lettore' })
  })

  it('l intervista si legge domanda e risposta, nell ordine in cui e successa', () => {
    const a = ap({
      intervista: [
        { domanda: 'Quale suite di test?', risposta: 'vitest' },
        { domanda: 'Anche il typecheck?', risposta: 'sì' }
      ]
    })
    const b = conversazione(a).slice(1, 5)
    expect(b.map((x) => [x.da, x.testo])).toEqual([
      ['lui', 'Quale suite di test?'],
      ['tu', 'vitest'],
      ['lui', 'Anche il typecheck?'],
      ['tu', 'sì']
    ])
    expect(b[0]?.tono).toBe('domanda')
  })

  it('il dialogo, le sue decisioni e le tue risposte stanno in un flusso solo, in ordine di tempo', () => {
    // Prima erano tre posti: la scheda per il dialogo, il diario per le
    // decisioni, il riquadro ambra per la domanda. Qui si legge come una chat.
    const a = ap({
      decisioni: [
        { quando: '2026-09-18T08:10:00.000Z', cosa: 'supervisore → prosegui: manca il secondo test' },
        { quando: '2026-09-18T08:30:00.000Z', cosa: 'risposta tardiva: usa la cartella tests' }
      ],
      dialogo: [
        { quando: '2026-09-18T08:20:00.000Z', da: 'tu', testo: 'usa vitest, non jest' },
        { quando: '2026-09-18T08:22:00.000Z', da: 'lui', testo: 'Va bene, cambio il criterio.', esito: 'cambio applicato' }
      ]
    })
    const b = conversazione(a).slice(1)
    expect(b.map((x) => x.da)).toEqual(['nota', 'tu', 'lui', 'tu'])
    expect(b[0]).toMatchObject({ tono: 'decisione', testo: 'Ha deciso: prosegui' })
    expect(b[2]).toMatchObject({ testo: 'Va bene, cambio il criterio.', dettaglio: 'cambio applicato' })
    expect(b[3]).toMatchObject({ da: 'tu', testo: 'usa la cartella tests' })
  })

  it('«nessun cambio» non si legge accanto alla risposta: non dice niente', () => {
    const a = ap({ dialogo: [{ quando: '2026-09-18T08:22:00.000Z', da: 'lui', testo: 'Sono al secondo criterio.', esito: 'nessun cambio' }] })
    const ultima = conversazione(a).at(-1)
    expect(ultima?.dettaglio).toBeUndefined()
  })

  it('la domanda aperta e l ultima battuta, ed e sua', () => {
    const a = ap({ stato: 'attesa', motivoSospensione: 'Posso cancellare la cartella build?', ultimoEvento: '2026-09-18T09:00:00.000Z' })
    const ultima = conversazione(a).at(-1)
    expect(ultima).toMatchObject({ da: 'lui', tono: 'domanda', testo: 'Posso cancellare la cartella build?' })
    expect(haDomandaAperta(a)).toBe(true)
  })

  it('anche in preparazione una domanda e una domanda', () => {
    const a = ap({ stato: 'intervista', motivoSospensione: 'Quale branch?', criteri: [] })
    expect(conversazione(a).at(-1)).toMatchObject({ da: 'lui', tono: 'domanda', testo: 'Quale branch?' })
    expect(haDomandaAperta(a)).toBe(true)
    // Sta guardando il progetto: non chiede niente.
    expect(haDomandaAperta(ap({ stato: 'intervista', criteri: [] }))).toBe(false)
  })

  it('pronto, finito e fermo chiudono la chat con una riga che lo dice', () => {
    expect(conversazione(ap({ stato: 'pronto' })).at(-1)).toMatchObject({ da: 'lui', tono: 'pronto' })
    expect(conversazione(ap({ stato: 'finito' })).at(-1)).toMatchObject({ da: 'nota', tono: 'fine' })
    expect(conversazione(ap({ stato: 'sospeso', motivoSospensione: 'silenzio da 30 minuti' })).at(-1))
      .toMatchObject({ da: 'nota', tono: 'fermo', dettaglio: 'silenzio da 30 minuti' })
    // Al lavoro non si aggiunge niente: l'ultima riga è l'ultima cosa successa.
    expect(conversazione(ap({ stato: 'lavoro' })).length).toBe(1)
  })

  it('dieci riprese uguali sono una nota con il numero, ma due «sì» tuoi restano due', () => {
    const nota = { quando: '2026-09-18T08:10:00.000Z', da: 'nota' as const, testo: 'Ha ripreso il lavoro', dettaglio: 'manca: x' }
    const tu = { quando: '2026-09-18T08:11:00.000Z', da: 'tu' as const, testo: 'sì' }
    const uscita = comprimiNote([nota, { ...nota, quando: '2026-09-18T08:12:00.000Z' }, nota, tu, tu])
    expect(uscita.length).toBe(3)
    expect(uscita[0]).toMatchObject({ volte: 3, quando: '2026-09-18T08:10:00.000Z' })
    expect(uscita.slice(1).every((b) => b.volte === undefined)).toBe(true)
  })

  it('sta pensando quando l ultima battuta del dialogo e tua', () => {
    expect(staPensando(ap({ dialogo: [{ quando: '2026-09-18T08:20:00.000Z', da: 'tu', testo: 'ciao' }] }))).toBe(true)
    expect(staPensando(ap({ dialogo: [
      { quando: '2026-09-18T08:20:00.000Z', da: 'tu', testo: 'ciao' },
      { quando: '2026-09-18T08:21:00.000Z', da: 'lui', testo: 'ciao a te' }
    ] }))).toBe(false)
    expect(staPensando(ap())).toBe(false)
  })
})
