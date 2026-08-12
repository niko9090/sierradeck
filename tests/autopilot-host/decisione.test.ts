import { describe, it, expect } from 'vitest'
import {
  decidi, decidiConGiudizio, riassuntoFallimenti, ripetizioniFinali,
  type EsitoVerifica, type EventoStop
} from '../../src/autopilot-host/decisione'
import { STRATEGIE } from '../../src/autopilot-host/strategie'
import { limitiPredefiniti, nuovoAutopilota, type Autopilota } from '@shared/autopilota'

const INIZIO = '2026-08-09T10:00:00.000Z'

function ap(over: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({
      id: 'ap-1', nome: 'Test verdi', obiettivo: 'Fai passare la suite', cwd: 'C:\\p',
      criteri: [{ descrizione: 'i test passano', comando: 'npm test', soddisfatto: false }],
      iniziatoIl: INIZIO
    }),
    ...over
  }
}

function evento(over: Partial<EventoStop> = {}): EventoStop {
  return {
    sessionId: 's-1',
    stopHookActive: false,
    ultimoMessaggio: 'Ho finito.',
    adesso: '2026-08-09T10:05:00.000Z',
    ...over
  }
}

const PASSATO: EsitoVerifica = {
  descrizione: 'i test passano', comando: 'npm test', passato: true, uscita: 'ok'
}
const FALLITO: EsitoVerifica = {
  descrizione: 'i test passano', comando: 'npm test', passato: false, uscita: '2 test rossi'
}

const LIMITI = limitiPredefiniti()
/** La riga di storia che `FALLITO` produce: ripeterla e' il cerchio. */
const CERCHIO = 'proseguito: i test passano — 2 test rossi'

/** Un autopilota che ha gia' fatto `n` giri con lo stesso identico esito. */
function inCerchio(n: number): Autopilota {
  return ap({
    decisioni: Array.from({ length: n }, (_, i) => ({ quando: String(i), cosa: CERCHIO })),
    cicli: n
  })
}

describe('decidi', () => {
  it('fa proseguire quando un criterio verificabile fallisce', () => {
    const d = decidi(ap(), evento(), [FALLITO])
    expect(d.tipo).toBe('prosegui')
    if (d.tipo === 'prosegui') {
      expect(d.istruzioni).toContain('i test passano')
      expect(d.istruzioni).toContain('2 test rossi')
    }
  })

  it('non consulta il giudizio quando un comando fallisce', () => {
    // Far ragionare un modello per scoprire che i test sono rossi sarebbe
    // pagare un giudizio per un fatto gia' certo.
    expect(decidi(ap(), evento(), [FALLITO]).tipo).toBe('prosegui')
  })

  it('chiede il giudizio quando tutti i comandi passano', () => {
    expect(decidi(ap(), evento(), [PASSATO]).tipo).toBe('serveGiudizio')
  })

  it('chiede il giudizio quando non ci sono comandi da eseguire', () => {
    const senzaComandi = ap({
      criteri: [{ descrizione: 'la documentazione e aggiornata', soddisfatto: false }]
    })
    expect(decidi(senzaComandi, evento(), []).tipo).toBe('serveGiudizio')
  })

  it('senza tetti impostati non si ferma ne per cicli ne per tempo', () => {
    // I tetti predefiniti sono a zero, cioe' assenti: un lavoro che procede non
    // deve morire allo scadere di un numero deciso da qualcun altro.
    const tardi = evento({ adesso: '2026-08-11T16:01:00.000Z' })
    expect(decidi(ap({ cicli: 9999 }), tardi, [FALLITO]).tipo).toBe('prosegui')
  })

  it('sospende al superamento del tetto di cicli, se qualcuno lo ha messo', () => {
    const d = decidi(ap({ cicli: 50, limiti: { ...LIMITI, cicliMax: 50 } }), evento(), [FALLITO])
    expect(d.tipo).toBe('sospendi')
    if (d.tipo === 'sospendi') expect(d.motivo).toContain('cicli')
  })

  it('sospende al superamento del tetto di tempo, se qualcuno lo ha messo', () => {
    const conTetto = ap({ limiti: { ...LIMITI, minutiMax: 360 } })
    const d = decidi(conTetto, evento({ adesso: '2026-08-09T16:01:00.000Z' }), [FALLITO])
    expect(d.tipo).toBe('sospendi')
    if (d.tipo === 'sospendi') expect(d.motivo).toContain('tempo')
  })

  it('un tetto impostato vince sul proseguimento, non il contrario', () => {
    // Chi si mette un limite lo vuole valido anche mentre il lavoro sembra
    // avere fretta: se l'ordine si invertisse, il limite non esisterebbe.
    const conTetto = ap({ cicli: 999, limiti: { ...LIMITI, cicliMax: 50 } })
    expect(decidi(conTetto, evento(), [FALLITO]).tipo).toBe('sospendi')
  })

  it('allo stallo cambia strategia invece di fermarsi', () => {
    const d = decidi(inCerchio(3), evento(), [FALLITO])
    expect(d.tipo).toBe('prosegui')
    if (d.tipo === 'prosegui') {
      expect(d.istruzioni).toContain(STRATEGIE[0].istruzioni)
      // Deve sapere di essere in un cerchio: e' l'unica cosa che il modello,
      // che ricomincia a ogni turno, non puo' scoprire da solo.
      expect(d.istruzioni).toContain('3 giri')
    }
  })

  it('a ogni giro fermo cambia mossa, senza mai ripetere la precedente', () => {
    const dette = [3, 4, 5, 6].map((n) => {
      const d = decidi(inCerchio(n), evento(), [FALLITO])
      return d.tipo === 'prosegui' ? d.istruzioni : d.tipo
    })
    expect(new Set(dette).size).toBe(dette.length)
    for (const [i, s] of STRATEGIE.entries()) expect(dette[i] ?? '').toContain(s.istruzioni)
  })

  it('finite le strade chiede all utente invece di spegnersi', () => {
    // Sospendere lo spegnerebbe in silenzio, e al risveglio non saprebbe
    // nemmeno di aver avuto bisogno di aiuto.
    const d = decidi(inCerchio(3 + STRATEGIE.length), evento(), [FALLITO])
    expect(d.tipo).toBe('chiediUtente')
    if (d.tipo === 'chiediUtente') {
      expect(d.domanda).toContain('2 test rossi')
      expect(d.domanda).toContain('Fai passare la suite')
    }
  })

  it('un esito uguale ma non consecutivo non conta come cerchio', () => {
    // Un problema tornato a galla dopo del lavoro vero va affrontato con la
    // testa sgombra, non con la strategia di emergenza.
    const storia = ap({
      decisioni: [
        { quando: '1', cosa: CERCHIO },
        { quando: '2', cosa: CERCHIO },
        { quando: '3', cosa: 'proseguito: i test passano — 7 test rossi' },
        { quando: '4', cosa: CERCHIO }
      ]
    })
    const d = decidi(storia, evento(), [FALLITO])
    expect(d.tipo).toBe('prosegui')
    if (d.tipo === 'prosegui') expect(d.istruzioni).not.toContain(STRATEGIE[0].istruzioni)
  })

  it('non e stallo se l uscita del comando cambia', () => {
    // Un errore diverso significa che qualcosa si sta muovendo.
    const storia = ap({
      decisioni: [
        { quando: '1', cosa: 'proseguito: i test passano — 5 test rossi' },
        { quando: '2', cosa: 'proseguito: i test passano — 4 test rossi' },
        { quando: '3', cosa: 'proseguito: i test passano — 3 test rossi' }
      ],
      cicli: 3
    })
    expect(decidi(storia, evento(), [FALLITO]).tipo).toBe('prosegui')
  })

  it('non decide niente per un autopilota che non e al lavoro', () => {
    for (const stato of ['sospeso', 'finito', 'fallito', 'attesa'] as const) {
      expect(decidi(ap({ stato }), evento(), [FALLITO]).tipo).toBe('finito')
    }
  })
})

describe('decidiConGiudizio', () => {
  it('dichiara finito quando il giudizio dice che e finito', () => {
    expect(decidiConGiudizio(ap(), { finito: true, istruzioni: '' }).tipo).toBe('finito')
  })

  it('prosegue con le istruzioni del giudizio', () => {
    const d = decidiConGiudizio(ap(), { finito: false, istruzioni: 'Manca il caso limite X' })
    expect(d.tipo).toBe('prosegui')
    if (d.tipo === 'prosegui') expect(d.istruzioni).toContain('caso limite X')
  })

  it('sospende se il giudizio dice non finito ma non dice cosa fare', () => {
    // Proseguire con istruzioni vuote manderebbe la chat a indovinare, e il
    // giro dopo si ripeterebbe identico: e' uno stallo travestito.
    expect(decidiConGiudizio(ap(), { finito: false, istruzioni: '   ' }).tipo).toBe('sospendi')
  })
})

describe('riassuntoFallimenti', () => {
  it('nomina il criterio e riporta l uscita', () => {
    const testo = riassuntoFallimenti([FALLITO])
    expect(testo).toContain('npm test')
    expect(testo).toContain('2 test rossi')
  })

  it('tronca un uscita sterminata', () => {
    const lungo: EsitoVerifica = { ...FALLITO, uscita: 'x'.repeat(10_000) }
    // Il testo finisce dentro il prompt della chat: senza un tetto, un log di
    // build da 10 MB si mangerebbe la finestra di contesto.
    expect(riassuntoFallimenti([lungo]).length).toBeLessThan(3000)
  })
})

describe('decidiConGiudizio — quando serve l utente', () => {
  it('chiede all utente se il giudizio pone una domanda indispensabile', () => {
    const d = decidiConGiudizio(ap(), {
      finito: false, istruzioni: '', domandaUtente: 'Quale chiave API devo usare?'
    })
    expect(d.tipo).toBe('chiediUtente')
    if (d.tipo === 'chiediUtente') expect(d.domanda).toContain('chiave API')
  })

  it('la domanda vince sulle istruzioni quando ci sono entrambe', () => {
    // Se il supervisore dice sia «fai X» sia «chiedi Y», mandare la chat a fare
    // X significherebbe farle indovinare proprio il punto su cui ha dichiarato
    // di non poter decidere.
    const d = decidiConGiudizio(ap(), {
      finito: false, istruzioni: 'prova a indovinare', domandaUtente: 'Quale ambiente?'
    })
    expect(d.tipo).toBe('chiediUtente')
  })

  it('una domanda vuota non conta come domanda', () => {
    const d = decidiConGiudizio(ap(), { finito: false, istruzioni: 'fai X', domandaUtente: '   ' })
    expect(d.tipo).toBe('prosegui')
  })

  it('finito vince su tutto: un lavoro concluso non fa domande', () => {
    const d = decidiConGiudizio(ap(), { finito: true, istruzioni: '', domandaUtente: 'e questo?' })
    expect(d.tipo).toBe('finito')
  })
})

describe('ripetizioniFinali', () => {
  it('conta le tracce anche con altre righe in mezzo', () => {
    // La storia raccoglie anche le note del supervisore e le risposte
    // dell'utente: se una riga qualunque spezzasse la sequenza, un cerchio
    // perfetto non verrebbe piu' riconosciuto e nessuna strategia scatterebbe.
    const storia = [
      { cosa: CERCHIO },
      { cosa: 'supervisore -> prosegui: ho guardato il diff' },
      { cosa: CERCHIO },
      { cosa: 'risposta dell utente: vai avanti' },
      { cosa: CERCHIO }
    ]
    expect(ripetizioniFinali(storia, CERCHIO)).toBe(3)
  })

  it('una traccia diversa azzera il conto', () => {
    const storia = [
      { cosa: CERCHIO },
      { cosa: 'proseguito: i test passano - 7 test rossi' },
      { cosa: CERCHIO }
    ]
    expect(ripetizioniFinali(storia, CERCHIO)).toBe(1)
  })
})
