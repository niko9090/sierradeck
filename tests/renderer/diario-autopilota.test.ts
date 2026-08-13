import { describe, it, expect } from 'vitest'
import { diario, completamento, autopilotaDi, diarioDelRiquadro } from '../../src/renderer/diario-autopilota'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'

function ap(over: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({
      id: 'ap-1',
      nome: 'Lettore',
      obiettivo: 'Sistema il lettore',
      cwd: 'C:\\lavoro\\gestore',
      criteri: [
        { descrizione: 'i test passano', comando: 'npm test', soddisfatto: false },
        { descrizione: 'niente errori di tipo', comando: 'npm run typecheck', soddisfatto: false }
      ],
      iniziatoIl: '2026-08-10T10:00:00.000Z'
    }),
    ...over
  }
}

describe('completamento', () => {
  it('conta i criteri raggiunti sul totale', () => {
    const a = ap({
      criteri: [
        { descrizione: 'a', soddisfatto: true },
        { descrizione: 'b', soddisfatto: false },
        { descrizione: 'c', soddisfatto: true },
        { descrizione: 'd', soddisfatto: false }
      ]
    })
    expect(completamento(a)).toMatchObject({ percento: 50, fatti: 2, totali: 4 })
  })

  it('finito e cento per cento, anche se un criterio non risulta segnato', () => {
    // L'autopilota si ferma quando **lui** considera raggiunto l'obiettivo: se
    // la riga dicesse 66% accanto a «finito», si crederebbe a un errore.
    const a = ap({ stato: 'finito', criteri: [{ descrizione: 'a', soddisfatto: true }, { descrizione: 'b', soddisfatto: false }] })
    expect(completamento(a).percento).toBe(100)
  })

  it('in preparazione non c e ancora niente da misurare', () => {
    const a = ap({ stato: 'intervista', criteri: [] })
    expect(completamento(a)).toMatchObject({ percento: 0, totali: 0 })
  })

  it('non divide per zero quando i criteri mancano', () => {
    expect(completamento(ap({ criteri: [] })).percento).toBe(0)
  })
})

describe('diario', () => {
  it('legge una verifica proseguita come cio che manca ancora', () => {
    const a = ap({
      decisioni: [{
        quando: '2026-08-10T10:05:00.000Z',
        cosa: 'proseguito: i test passano — FAIL tests/parser.test.ts | niente errori — TS2345'
      }]
    })
    const v = diario(a)[0]
    expect(v?.titolo).toBe('Ha ripreso il lavoro')
    expect(v?.dettaglio).toContain('i test passano')
  })

  it('riconosce la configurazione che si e dato da solo', () => {
    const a = ap({
      decisioni: [{ quando: '2026-08-10T10:01:00.000Z', cosa: 'configurato da sé: i test passano · niente errori' }]
    })
    expect(diario(a)[0]?.titolo).toBe('Si è configurato')
    expect(diario(a)[0]?.dettaglio).toContain('i test passano')
  })

  it('riconosce una risposta arrivata dall utente', () => {
    const a = ap({
      decisioni: [
        { quando: '2026-08-10T10:02:00.000Z', cosa: 'risposta dell utente (telegram): usa YAML' },
        { quando: '2026-08-10T10:03:00.000Z', cosa: 'risposta tardiva: va bene cosi' }
      ]
    })
    expect(diario(a).map((v) => v.titolo)).toEqual(['Ha ricevuto una tua risposta', 'Ha ricevuto una tua risposta'])
  })

  it('mette per prima la cosa piu recente', () => {
    const a = ap({
      decisioni: [
        { quando: '2026-08-10T10:01:00.000Z', cosa: 'configurato da sé: x' },
        { quando: '2026-08-10T10:09:00.000Z', cosa: 'proseguito: y — z' }
      ]
    })
    expect(diario(a)[0]?.quando).toBe('2026-08-10T10:09:00.000Z')
  })

  it('una decisione che non riconosce la riporta com e, invece di perderla', () => {
    const a = ap({ decisioni: [{ quando: '2026-08-10T10:01:00.000Z', cosa: 'qualcosa di nuovo' }] })
    expect(diario(a)[0]?.titolo).toBe('qualcosa di nuovo')
  })

  it('senza decisioni non inventa niente', () => {
    expect(diario(ap({ decisioni: [] }))).toEqual([])
  })
})

describe('autopilotaDi', () => {
  it('trova l autopilota che lavora in quella cartella', () => {
    const a = ap()
    expect(autopilotaDi([a], 'C:\\lavoro\\gestore')?.id).toBe('ap-1')
  })

  it('non bada a maiuscole ne alla barra finale', () => {
    // La cartella del riquadro e quella dell'autopilota arrivano da due strade
    // diverse: pretenderle identiche carattere per carattere significherebbe
    // non mostrare mai il pannello.
    const a = ap({ cwd: 'C:/lavoro/Gestore/' })
    expect(autopilotaDi([a], 'C:\\lavoro\\gestore')?.id).toBe('ap-1')
  })

  it('preferisce quello che sta lavorando a uno finito', () => {
    const finito = ap({ id: 'ap-vecchio', stato: 'finito' })
    const vivo = ap({ id: 'ap-vivo', stato: 'lavoro' })
    expect(autopilotaDi([finito, vivo], 'C:\\lavoro\\gestore')?.id).toBe('ap-vivo')
  })

  it('su una cartella senza autopiloti non restituisce niente', () => {
    expect(autopilotaDi([ap()], 'C:\\altro')).toBeUndefined()
  })
})

describe('il diario riordinato', () => {
  const conStoria = (cose: string[]): Autopilota => ap({
    decisioni: cose.map((cosa, i) => ({ quando: `2026-08-12T10:0${i}:00.000Z`, cosa }))
  })

  it('mette in chiaro il ragionamento del supervisore', () => {
    // E' la voce piu' preziosa: l'unica che dice *perche'* invece di cosa.
    const v = diario(conStoria(['supervisore → prosegui: il test X non copre il caso limite']))
    expect(v[0]?.titolo).toContain('Ha deciso')
    expect(v[0]?.dettaglio).toContain('caso limite')
    expect(v[0]?.tipo).toBe('decisione')
  })

  it('riconosce una verifica corretta', () => {
    const v = diario(conStoria(['criterio corretto — «i test passano»: npx vitest run']))
    expect(v[0]?.titolo).toContain('corretto una verifica')
    expect(v[0]?.tipo).toBe('correzione')
  })

  it('unisce i tentativi identici invece di ripeterli', () => {
    // Dieci righe uguali per dieci tentativi sullo stesso errore facevano
    // sparire dentro il rumore la riga che contava.
    const v = diario(conStoria([
      'proseguito: i test passano — 2 rossi',
      'proseguito: i test passano — 2 rossi',
      'proseguito: i test passano — 2 rossi'
    ]))
    expect(v).toHaveLength(1)
    expect(v[0]?.volte).toBe(3)
  })

  it('non unisce due tentativi diversi', () => {
    const v = diario(conStoria([
      'proseguito: i test passano — 2 rossi',
      'proseguito: i test passano — 7 rossi'
    ]))
    expect(v).toHaveLength(2)
    expect(v[0]?.volte).toBeUndefined()
  })

  it('la preparazione si vede come tale', () => {
    const v = diario(conStoria(['configurato da sé: quattro criteri']))
    expect(v[0]?.tipo).toBe('preparazione')
  })
})

describe('un diario solo, anche quando le chat sono tante', () => {
  const suo = (over: Partial<Autopilota> = {}): Autopilota => ({
    ...nuovoAutopilota({
      id: 'ap-1', nome: 'Revisione', obiettivo: 'o', cwd: 'C:\gioco',
      criteri: [{ descrizione: 'x', soddisfatto: false }],
      iniziatoIl: '2026-08-13T10:00:00.000Z'
    }),
    stato: 'lavoro' as const,
    ...over
  })

  it('lo mostra nel primo riquadro, e in nessun altro', () => {
    // Una flotta apre piu' chat nella stessa cartella: il pannello e' uno solo
    // e le raccontava tutte, quindi comparve tre volte identico, tre volte la
    // stessa percentuale. Chi guarda pensa che siano tre autopiloti.
    const riquadri = [
      { id: 'p-1', cwd: 'C:\gioco' },
      { id: 'p-2', cwd: 'C:\gioco' },
      { id: 'p-3', cwd: 'C:\gioco' }
    ]
    expect(diarioDelRiquadro([suo()], riquadri, riquadri[0]!)?.id).toBe('ap-1')
    expect(diarioDelRiquadro([suo()], riquadri, riquadri[1]!)).toBeUndefined()
    expect(diarioDelRiquadro([suo()], riquadri, riquadri[2]!)).toBeUndefined()
  })

  it('due autopiloti in due cartelle hanno ognuno il suo', () => {
    const altro = suo({ id: 'ap-2', cwd: 'C:\altro' })
    const riquadri = [{ id: 'p-1', cwd: 'C:\gioco' }, { id: 'p-2', cwd: 'C:\altro' }]
    expect(diarioDelRiquadro([suo(), altro], riquadri, riquadri[0]!)?.id).toBe('ap-1')
    expect(diarioDelRiquadro([suo(), altro], riquadri, riquadri[1]!)?.id).toBe('ap-2')
  })

  it('un riquadro senza autopilota non mostra niente', () => {
    const riquadri = [{ id: 'p-1', cwd: 'C:\altrove' }]
    expect(diarioDelRiquadro([suo()], riquadri, riquadri[0]!)).toBeUndefined()
  })

  it('chiuso il primo riquadro, il diario passa al successivo', () => {
    // Altrimenti sparirebbe proprio mentre l'autopilota lavora.
    const rimasti = [{ id: 'p-2', cwd: 'C:\gioco' }, { id: 'p-3', cwd: 'C:\gioco' }]
    expect(diarioDelRiquadro([suo()], rimasti, rimasti[0]!)?.id).toBe('ap-1')
  })
})
