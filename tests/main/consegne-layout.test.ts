import { describe, it, expect } from 'vitest'
import { creaFreno, creaRegistroConsegne, primoSlotLibero } from '../../src/main/consegne-layout'

/**
 * La regola che mancava da quattro giri di correzioni: **un salvataggio è la
 * risposta a una consegna, non una dettatura.**
 *
 * Le tre perdite di lavoro hanno tutte la stessa forma — una finestra scrive sul
 * disco uno stato che non discende da niente — e nessuna delle correzioni
 * precedenti poteva vederla, perché guardavano *cosa* veniva scritto e mai *da
 * cosa*.
 */

describe('lo slot di una finestra', () => {
  it('e il piu basso libero, non il successivo', () => {
    // Chiudendo la seconda finestra e riaprendone una, quella nuova deve
    // ritrovare la disposizione della vecchia. Prendendo sempre il numero dopo,
    // inaugurerebbe una terza casella che nessuno chiederà mai più — cioè lavoro
    // che c'è nel file e non si vede: il guasto che gli slot esistono per
    // chiudere.
    expect(primoSlotLibero([])).toBe('1')
    expect(primoSlotLibero(['1'])).toBe('2')
    expect(primoSlotLibero(['1', '3'])).toBe('2')
    expect(primoSlotLibero(['2'])).toBe('1')
  })

  it('non cambia piu, una volta assegnato', () => {
    // Era il difetto della chiave-geometria: la finestra veniva posizionata,
    // ingrandita, messa a schermo intero, e cominciava a chiedere una casella
    // diversa da quella in cui aveva scritto.
    const r = creaRegistroConsegne()
    expect(r.slotDi(7, [7])).toBe('1')
    expect(r.slotDi(7, [7, 9, 11])).toBe('1')
  })

  it('due finestre vive non condividono lo stesso slot', () => {
    const r = creaRegistroConsegne()
    expect(r.slotDi(7, [7, 9])).toBe('1')
    expect(r.slotDi(9, [7, 9])).toBe('2')
  })

  it('una finestra chiusa restituisce il suo slot alla prossima', () => {
    // Gli id delle finestre si riciclano, e senza la pulizia una finestra nuova
    // erediterebbe la disposizione di una morta.
    const r = creaRegistroConsegne()
    r.slotDi(7, [7])
    r.slotDi(9, [7, 9])
    r.dimentica(9)
    expect(r.slotDi(21, [7, 21])).toBe('2')
  })
})

describe('il freno sulle rispinte', () => {
  it('per la stessa finestra non piu di una volta nell intervallo', () => {
    // Rispingere la verita' a ogni rifiuto faceva un giro senza fine con una
    // finestra che rispondeva con un altro salvataggio sbagliato: nove ore,
    // sette gigabyte di registro.
    const puo = creaFreno(1000)
    expect(puo(2, 10_000)).toBe(true)
    expect(puo(2, 10_500)).toBe(false)
    // Un'altra finestra ha il suo conto.
    expect(puo(3, 10_500)).toBe(true)
    // Passato l'intervallo, di nuovo.
    expect(puo(2, 11_000)).toBe(true)
  })
})

describe('lo scontrino', () => {
  it('chi non ha mai ricevuto un layout non puo salvare', () => {
    // È la classe intera dei salvataggi «basati sul nulla»: una finestra in
    // avvio ha lo schermo vuoto e nessuna idea di cosa ci fosse prima di lei.
    // Obbedirle vuol dire azzerare il workspace.
    const r = creaRegistroConsegne()
    expect(r.verifica(7, 1)).toBeUndefined()
    expect(r.verifica(7, undefined)).toBeUndefined()
    expect(r.verifica(7, 0)).toBeUndefined()
  })

  it('una consegna valida dice sotto quale workspace scrivere', () => {
    // Il nome non lo dichiara più la finestra: lo ricorda il Core. Era l'ultima
    // cosa che il renderer affermava e che poteva essere sbagliata.
    const r = creaRegistroConsegne()
    const s = r.consegna(7, 'SierraDeck', [7])
    expect(r.verifica(7, s)).toEqual({ numero: s, workspace: 'SierraDeck', slot: '1' })
  })

  it('uno scontrino vecchio non vale piu', () => {
    // La finestra ha in mano il workspace di prima — un ripristino o un cambio
    // le ha consegnato altro nel frattempo — e quello che ha a schermo non
    // descrive più il mondo. Scriverlo significa disfare il cambio appena fatto.
    const r = creaRegistroConsegne()
    const vecchio = r.consegna(7, 'Uno', [7])
    r.consegna(7, 'Due', [7])
    expect(r.verifica(7, vecchio)).toBeUndefined()
  })

  it('lo scontrino di un altra finestra non vale per questa', () => {
    // Due finestre che salvano nello stesso istante: senza questo, la seconda
    // potrebbe passare per la prima e scrivere il proprio schermo sotto il
    // workspace dell'altra.
    const r = creaRegistroConsegne()
    const suo = r.consegna(7, 'Uno', [7, 9])
    r.consegna(9, 'Due', [7, 9])
    expect(r.verifica(9, suo)).toBeUndefined()
  })

  it('i numeri non si ripetono fra finestre diverse', () => {
    // Un progressivo per finestra si ripeterebbe, e allora lo scontrino di una
    // varrebbe per l'altra proprio nel caso che conta.
    const r = creaRegistroConsegne()
    const a = r.consegna(7, 'Uno', [7, 9])
    const b = r.consegna(9, 'Due', [7, 9])
    expect(a).not.toBe(b)
  })

  it('dopo la chiusura la ricevuta non c e piu', () => {
    const r = creaRegistroConsegne()
    const s = r.consegna(7, 'Uno', [7])
    r.dimentica(7)
    expect(r.verifica(7, s)).toBeUndefined()
    expect(r.ricevuta(7)).toBeUndefined()
  })

  it('una ricevuta scaduta resta leggibile: serve a rimandare la verita', () => {
    // Un rifiuto non è un vicolo cieco. Alla finestra si ridà quello che c'è
    // davvero, e per farlo bisogna sapere quale workspace stava guardando.
    const r = creaRegistroConsegne()
    const vecchio = r.consegna(7, 'Uno', [7])
    r.consegna(7, 'Due', [7])
    expect(r.verifica(7, vecchio)).toBeUndefined()
    expect(r.ricevuta(7)?.workspace).toBe('Due')
  })
})
