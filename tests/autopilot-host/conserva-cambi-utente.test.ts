import { describe, it, expect } from 'vitest'
import { conservaCambiUtente } from '../../src/autopilot-host/server'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'

/**
 * Due chat della stessa flotta si fermano insieme, e i loro due `suStop` si
 * sovrappongono: ognuno legge l'autopilota, lavora per minuti — criteri e
 * supervisore — e alla fine salva. Chi salva per ultimo riscriverebbe con la
 * fotografia presa **prima**, cancellando quello che l'altro ha fatto nel
 * frattempo.
 *
 * `conservaCambiUtente` e la rete: rilegge lo stato di adesso e vi rimette
 * sopra soltanto cio che appartiene a questo turno. La sezione
 * rilettura→merge→salva di `suStop` e sincrona, quindi atomica.
 */
function base(): Autopilota {
  return {
    ...nuovoAutopilota({
      id: 'ap-1',
      nome: 'prova',
      obiettivo: 'fare',
      cwd: 'C:\p',
      criteri: [{ descrizione: 'i test passano', soddisfatto: false }],
      iniziatoIl: '2026-08-27T09:00:00.000Z'
    }),
    stato: 'lavoro',
    cicli: 5,
    chats: [
      { id: 'c-1', compito: 'A', stato: 'lavoro', cicli: 2 },
      { id: 'c-2', compito: 'B', stato: 'lavoro', cicli: 3 }
    ],
    decisioni: [{ quando: '2026-08-27T10:00:00.000Z', cosa: 'partenza' }]
  }
}

describe('conservaCambiUtente — il conto dei giri', () => {
  it('prende il conto dal disco, cosi non torna indietro di quanto ha contato la sorella', () => {
    const letto = base()
    // Questo turno ha letto 5 e calcolato 6.
    const calcolato: Autopilota = { ...letto, cicli: 6 }
    // Ma intanto la sorella si e fermata due volte: sul disco sono 8.
    const fresco: Autopilota = { ...letto, cicli: 8 }

    const dopo = conservaCambiUtente(calcolato, fresco, 'c-1', letto.decisioni.length)

    // Scrivere 6 farebbe arretrare il conto — e i giri non contano solo per la
    // vetrina: `cicliMax` e uno dei freni dell'utente.
    expect(dopo.cicli).toBe(8)
  })
})

describe('conservaCambiUtente — il registro delle decisioni', () => {
  it('tiene quelle della sorella e ci rimette sopra le proprie', () => {
    const letto = base()
    const calcolato: Autopilota = {
      ...letto,
      decisioni: [...letto.decisioni, { quando: '2026-08-27T10:05:00.000Z', cosa: 'supervisore → continua' }]
    }
    const fresco: Autopilota = {
      ...letto,
      decisioni: [...letto.decisioni, { quando: '2026-08-27T10:03:00.000Z', cosa: 'sorella → prosegue' }]
    }

    const dopo = conservaCambiUtente(calcolato, fresco, 'c-1', letto.decisioni.length)

    expect(dopo.decisioni.map((d) => d.cosa)).toEqual([
      'partenza',
      'sorella → prosegue',
      'supervisore → continua'
    ])
  })

  it('non duplica una decisione che questo turno aveva gia salvato per strada', () => {
    // `suStop` salva anche a meta strada — quando ripara il comando di un
    // criterio — quindi alcune delle proprie decisioni sono gia sul disco.
    // Rimetterle in coda le farebbe comparire due volte nel diario.
    const letto = base()
    const riparazione = { quando: '2026-08-27T10:02:00.000Z', cosa: 'comando riparato' }
    const calcolato: Autopilota = { ...letto, decisioni: [...letto.decisioni, riparazione] }
    const fresco: Autopilota = { ...letto, decisioni: [...letto.decisioni, riparazione] }

    const dopo = conservaCambiUtente(calcolato, fresco, 'c-1', letto.decisioni.length)

    expect(dopo.decisioni).toHaveLength(2)
  })
})

describe('conservaCambiUtente — quello che gia faceva, e deve continuare a fare', () => {
  it('riporta i campi dell utente dalla versione fresca', () => {
    const letto = base()
    const calcolato: Autopilota = { ...letto, obiettivo: 'fare' }
    const fresco: Autopilota = { ...letto, obiettivo: 'fare un altra cosa', compitiDaFare: ['nuovo'] }

    const dopo = conservaCambiUtente(calcolato, fresco, 'c-1', letto.decisioni.length)

    expect(dopo.obiettivo).toBe('fare un altra cosa')
    expect(dopo.compitiDaFare).toEqual(['nuovo'])
  })

  it('applica solo la propria chat sulle chat fresche', () => {
    const letto = base()
    const calcolato: Autopilota = {
      ...letto,
      chats: [{ ...letto.chats[0]!, cicli: 3 }, letto.chats[1]!]
    }
    // La sorella nel frattempo ha fatto il suo giro.
    const fresco: Autopilota = {
      ...letto,
      chats: [letto.chats[0]!, { ...letto.chats[1]!, cicli: 4, sessionId: 'sess-2' }]
    }

    const dopo = conservaCambiUtente(calcolato, fresco, 'c-1', letto.decisioni.length)

    expect(dopo.chats.find((c) => c.id === 'c-1')?.cicli).toBe(3)
    expect(dopo.chats.find((c) => c.id === 'c-2')?.cicli).toBe(4)
    expect(dopo.chats.find((c) => c.id === 'c-2')?.sessionId).toBe('sess-2')
  })
})

describe('conservaCambiUtente — gli interruttori toccati da fuori durante il turno', () => {
  it('la pausa per aggiornamento arrivata a meta turno non viene cancellata dal salvataggio', () => {
    // Premi Installa mentre un turno lungo e in corso: `POST /pausa-aggiornamento`
    // scrive il segno sul disco, ma il turno ha in mano la fotografia di prima
    // e la riscriveva senza — proprio la chat a cui la pausa serviva riceveva il
    // compito dopo, e l'installazione la uccideva a meta azione.
    const letto = base()
    const calcolato: Autopilota = { ...letto }
    const fresco: Autopilota = { ...letto, fermatoPerAggiornamento: true }
    const dopo = conservaCambiUtente(calcolato, fresco, 'c-1', letto.decisioni.length)
    expect(dopo.fermatoPerAggiornamento).toBe(true)
  })

  it('e cosi «riparti al riavvio», il tetto delle chat e i limiti', () => {
    const letto = base()
    const calcolato: Autopilota = { ...letto }
    const fresco: Autopilota = {
      ...letto, riprendiAlRiavvio: false, tettoChat: 3, limiti: { ...letto.limiti, cicliMax: 42 }
    }
    const dopo = conservaCambiUtente(calcolato, fresco, 'c-1', letto.decisioni.length)
    expect(dopo.riprendiAlRiavvio).toBe(false)
    expect(dopo.tettoChat).toBe(3)
    expect(dopo.limiti.cicliMax).toBe(42)
  })
})
