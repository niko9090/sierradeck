import { describe, it, expect } from 'vitest'
import {
  attendiQuiete, inVolo, leggiPausa, pausaAncoraValida, pausaDaSalvare, siPuoInstallare,
  PAUSA_SCADUTA_MS, type ChatInVolo, type PausaSalvata
} from '../../src/main/pausa-aggiornamento'

/**
 * Un aggiornamento non è una chiusura per fine lavori.
 *
 * Fino a ieri premere «Installa» chiudeva il PTY host e con lui ogni
 * `claude.exe` dovunque fosse arrivato: a metà di una risposta, di una
 * compilazione, di una pubblicazione. Il testo si riprende dal disco; l'azione
 * lasciata a metà nel mondo no.
 */
function chat(over: Partial<ChatInVolo> = {}): ChatInVolo {
  return { id: 'p1', sessione: 's1', viva: true, aspetta: false, ...over }
}

describe('chi ha qualcosa in mano', () => {
  it('sta lavorando: terminale acceso e non sta aspettando te', () => {
    expect(inVolo([chat()])).toHaveLength(1)
    expect(siPuoInstallare([chat()])).toBe(false)
  })

  it('ha chiuso il turno: aspetta te, quindi non ha niente a metà', () => {
    expect(inVolo([chat({ aspetta: true })])).toEqual([])
    expect(siPuoInstallare([chat({ aspetta: true })])).toBe(true)
  })

  it('un riquadro senza terminale non si aspetta: non ha mai cominciato', () => {
    // È la differenza fra «non aspetta te» e «sta lavorando», e senza di essa
    // ogni installazione resterebbe appesa a un riquadro ibernato — che non
    // aspetta nessuno e non finirà mai niente, perché non ha un processo.
    expect(inVolo([chat({ viva: false })])).toEqual([])
    expect(inVolo([chat({ viva: undefined })])).toEqual([])
  })

  it('senza chat aperte si installa e basta', () => {
    expect(siPuoInstallare([])).toBe(true)
  })
})

describe('chi va rimesso in moto al ritorno', () => {
  it('le chat che erano a metà, per sessione', () => {
    const salvata = pausaDaSalvare(
      [chat({ id: 'p1', sessione: 's1' }), chat({ id: 'p2', sessione: 's2', aspetta: true })],
      '0.12.42',
      '2026-08-30T20:00:00.000Z'
    )
    expect(salvata.sessioni).toEqual(['s1'])
    expect(salvata.versione).toBe('0.12.42')
  })

  it('non le governate: quelle le riprende il servizio, che sa cosa facevano', () => {
    // Scriverci dentro anche noi vorrebbe dire due messaggi per lo stesso
    // ritorno, dentro la stessa conversazione.
    const salvata = pausaDaSalvare([chat({ governata: true })])
    expect(salvata.sessioni).toEqual([])
  })

  it('non quelle senza una sessione: non ci sarebbe niente da riaprire', () => {
    expect(pausaDaSalvare([chat({ sessione: undefined })]).sessioni).toEqual([])
  })
})

describe('l elenco riletto dopo il riavvio', () => {
  it('lo rilegge un programma diverso: niente lo fa cadere', () => {
    // Lo scrive la versione vecchia e lo legge quella nuova. Un file
    // malformato non deve impedire l'avvio: sarebbe un aggiornamento che
    // rompe il programma nell'istante in cui doveva ripararlo.
    expect(leggiPausa(undefined)).toBeUndefined()
    expect(leggiPausa('niente')).toBeUndefined()
    expect(leggiPausa({})).toBeUndefined()
    expect(leggiPausa({ sessioni: 'boh' })).toBeUndefined()
    expect(leggiPausa({ sessioni: [] })).toBeUndefined()
    expect(leggiPausa({ sessioni: ['s1', 42, ''] })?.sessioni).toEqual(['s1'])
  })

  it('scaduto non si usa: nel frattempo quelle chat hanno fatto altro', () => {
    const adesso = Date.parse('2026-08-30T20:00:00.000Z')
    const fresco = { quando: '2026-08-30T19:59:00.000Z', sessioni: ['s1'] }
    const vecchio = { quando: '2026-08-27T20:00:00.000Z', sessioni: ['s1'] }
    expect(pausaAncoraValida(fresco, adesso)).toBe(true)
    expect(pausaAncoraValida(vecchio, adesso)).toBe(false)
    // Un'installazione mai riuscita lascia il file lì: il limite è ciò che
    // impedisce di scrivere «riprendi da dove eri» tre giorni dopo.
    expect(PAUSA_SCADUTA_MS).toBeLessThan(24 * 60 * 60_000)
  })

  it('una data illeggibile vale scaduto, non valido', () => {
    expect(pausaAncoraValida({ quando: '', sessioni: ['s1'] })).toBe(false)
  })
})

describe('aspettare prima di installare', () => {
  function banco(chats: ChatInVolo[], liberaDopo = Number.POSITIVE_INFINITY) {
    const fatti: string[] = []
    const scritte: string[] = []
    let salvata: PausaSalvata | undefined
    let orologio = 0
    let attese = 0
    const deps = {
      chat: () => chats,
      pausaAutopiloti: async (attiva: boolean) => { fatti.push(attiva ? 'pausa' : 'disfa'); return 1 },
      scriviInChat: (id: string, _t: string) => { fatti.push(`scrivo:${id}`); scritte.push(id) },
      annota: (p: PausaSalvata) => { salvata = p },
      avvisa: () => {},
      adesso: () => orologio,
      // L'attesa finta e' anche l'orologio: dopo `liberaDopo` giri le chat
      // hanno finito. Deterministico - un `setTimeout` vero non verrebbe mai
      // eseguito, perche' questo giro non cede mai al ciclo degli eventi.
      aspetta: (ms: number) => {
        attese += 1
        orologio += ms
        if (attese >= liberaDopo) chats = chats.map((c) => ({ ...c, aspetta: true }))
        return Promise.resolve()
      }
    }
    return {
      deps,
      fatti,
      scritte,
      pausa: (): PausaSalvata | undefined => salvata,
      attese: (): number => attese
    }
  }

  it('senza niente in volo installa subito', async () => {
    const b = banco([chat({ aspetta: true })])
    await expect(attendiQuiete(b.deps)).resolves.toBe(true)
    expect(b.scritte).toEqual([])
    expect(b.attese()).toBe(0)
  })

  it('prima mette in pausa gli autopiloti, poi avvisa le chat', async () => {
    // L'ordine non è cosmetico: avvisando prima, una chat finirebbe il turno e
    // l'autopilota le darebbe subito il compito successivo — e si
    // ricomincerebbe ad aspettare da capo, all'infinito.
    const b = banco([chat({ id: 'p1' })], 1)
    await attendiQuiete(b.deps)
    expect(b.fatti.slice(0, 2)).toEqual(['pausa', 'scrivo:p1'])
  })

  it('avvisa una volta sola, non a ogni giro', async () => {
    // Ripeterlo ogni due secondi sarebbe assillare qualcuno che sta già
    // facendo quello che gli hai chiesto.
    const b = banco([chat({ id: 'p1' })], 5)
    await attendiQuiete(b.deps)
    expect(b.scritte.filter((s) => s === 'p1')).toHaveLength(1)
  })

  it('quando si sono fermate annota chi era a meta, e installa', async () => {
    const b = banco([chat({ id: 'p1', sessione: 's1' })], 3)
    await expect(attendiQuiete(b.deps)).resolves.toBe(true)
    // Le chat annotate sono quelle di **prima** dell'attesa: adesso sono ferme
    // tutte, e guardarle ora vorrebbe dire non annotarne nessuna.
    expect(b.pausa()?.sessioni).toEqual(['s1'])
  })

  it('se la quiete non arriva non installa, e disfa la pausa', async () => {
    // Lasciare gli autopiloti fermi ad aspettare un riavvio che non arriva
    // sarebbe il peggiore dei due errori.
    const b = banco([chat({ id: 'p1' })])
    await expect(attendiQuiete(b.deps)).resolves.toBe(false)
    expect(b.fatti.at(-1)).toBe('disfa')
    expect(b.pausa()).toBeUndefined()
  })

  it('un servizio che non risponde non impedisce di aspettare le chat', async () => {
    // Senza autopiloti da mettere in pausa resta comunque la parte che conta:
    // non uccidere una chat dentro un'azione.
    const b = banco([chat({ aspetta: true })])
    const rotto = { ...b.deps, pausaAutopiloti: () => Promise.reject(new Error('servizio giu')) }
    await expect(attendiQuiete(rotto)).resolves.toBe(true)
  })
})
