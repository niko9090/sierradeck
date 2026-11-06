import { describe, it, expect } from 'vitest'
import {
  PRENOTAZIONE_MS, SVEGLIE_MAX, assegna, attesaVuota, cambiaPriorita, chiaveRichiesta, compitoDi, inFila, ordinate, passo, rivedi, scadute, togliVoce,
  type RichiestaSpecialista, type StatoAttesa
} from '@shared/attesa-specialisti'

/**
 * k-48: la lista d'attesa degli specialisti, pura. Il tempo è un numero che
 * si sposta a mano: niente orologio vero.
 */

const T0 = Date.UTC(2026, 10, 6, 9, 0)
const min = (n: number): number => T0 + n * 60_000

const rich = (descrizione: string, extra: Partial<RichiestaSpecialista> = {}): RichiestaSpecialista => ({ workspace: 'Lavoro', autopilota: 'ap-1', tipo: 'sviluppatore', descrizione, ...extra })

let n = 0
const id = (): string => { n += 1; return `v-${n}` }

/** Una richiesta davanti alla guardia con `liberi` posti. */
function arriva(s: StatoAttesa, r: RichiestaSpecialista, liberi: number, adesso: number): { s: StatoAttesa; p: ReturnType<typeof passo> } {
  const p = passo(s, r, { liberi, adesso, id })
  return { s: p.mossa.stato, p }
}

/** Il compito di ogni voce, in ordine di fila. */
const fila = (s: StatoAttesa, adesso = T0): Array<string | undefined> => inFila(s, adesso).map((v) => v.compito)

describe('lista d’attesa degli specialisti (k-48)', () => {
  it('riconosce il compito dalla descrizione, e non scambia una parola qualunque per un compito', () => {
    expect(compitoDi('k-48: la lista')).toBe('k-48')
    expect(compitoDi('[k-7] il menu')).toBe('k-7')
    expect(compitoDi('Sistema: il menu')).toBeUndefined()
    expect(compitoDi('il menu')).toBeUndefined()
  })

  it('con i posti pieni la richiesta va in fila invece del rifiuto secco, col suo posto', () => {
    const a = arriva(attesaVuota(), rich('k-1: prima'), 0, T0)
    expect(a.p).toMatchObject({ passa: false, posizione: 1, davanti: 0, nuova: true })
    const b = arriva(a.s, rich('k-2: seconda'), 0, min(1))
    expect(b.p).toMatchObject({ passa: false, posizione: 2, davanti: 1, nuova: true })
    expect(fila(b.s)).toEqual(['k-1', 'k-2'])
    const v = b.s.voci[0]!
    expect(v).toMatchObject({ workspace: 'Lavoro', autopilota: 'ap-1', compito: 'k-1', tipo: 'sviluppatore', priorita: 0, sveglie: 0 })
    expect(v.dal).toBe(new Date(T0).toISOString())
  })

  it('con un posto libero e nessuno in fila passa senza entrare in lista', () => {
    const a = arriva(attesaVuota(), rich('k-1: prima'), 1, T0)
    expect(a.p.passa).toBe(true)
    expect(a.s.voci).toEqual([])
  })

  it('la stessa richiesta ripetuta non si duplica: resta la stessa voce, con lo stesso posto', () => {
    let s = arriva(attesaVuota(), rich('k-1: prima'), 0, T0).s
    s = arriva(s, rich('k-2: seconda'), 0, min(1)).s
    const ripetuta = arriva(s, rich('k-1: prima  ma con parole diverse'), 0, min(2))
    expect(ripetuta.p).toMatchObject({ passa: false, posizione: 1, nuova: false })
    expect(ripetuta.s.voci).toHaveLength(2)
    // Senza id di compito vale il testo, a meno di spazi e maiuscole.
    let t = arriva(attesaVuota(), rich('sistema   il Menu'), 0, T0).s
    t = arriva(t, rich('Sistema il menu'), 0, min(1)).s
    expect(t.voci).toHaveLength(1)
    // Un altro workspace con lo stesso compito è un'altra richiesta.
    expect(chiaveRichiesta(rich('k-1: x'))).not.toBe(chiaveRichiesta(rich('k-1: x', { workspace: 'Altro' })))
  })

  it('l’ordine è la priorità, poi l’arrivo', () => {
    let s = arriva(attesaVuota(), rich('k-1: a'), 0, T0).s
    s = arriva(s, rich('k-2: b'), 0, min(1)).s
    s = arriva(s, rich('k-3: c'), 0, min(2)).s
    expect(fila(s)).toEqual(['k-1', 'k-2', 'k-3'])
    s = { ...s, voci: s.voci.map((v) => (v.compito === 'k-3' ? { ...v, priorita: 2 } : v.compito === 'k-2' ? { ...v, priorita: 1 } : v)) }
    expect(ordinate(s.voci).map((v) => v.compito)).toEqual(['k-3', 'k-2', 'k-1'])
  })

  it('quando un posto si libera il primo in fila lo prenota e va svegliato, solo lui', () => {
    let s = arriva(attesaVuota(), rich('k-1: a'), 0, T0).s
    s = arriva(s, rich('k-2: b'), 0, min(1)).s
    const m = assegna(s, 1, min(3))
    expect(m.svegli.map((v) => v.compito)).toEqual(['k-1'])
    expect(m.svegli[0]!.prenotataFino).toBe(new Date(min(3) + PRENOTAZIONE_MS).toISOString())
    // Un secondo giro non risveglia nessuno: il posto è già prenotato.
    expect(assegna(m.stato, 1, min(4)).svegli).toEqual([])
    // Due posti liberi: due prenotazioni.
    expect(assegna(s, 2, min(3)).svegli.map((v) => v.compito)).toEqual(['k-1', 'k-2'])
    // Nessun posto libero: nessuna sveglia.
    expect(assegna(s, 0, min(3)).svegli).toEqual([])
  })

  it('chi ha il posto prenotato passa, e la voce esce dalla lista', () => {
    let s = arriva(attesaVuota(), rich('k-1: a'), 0, T0).s
    s = arriva(s, rich('k-2: b'), 0, min(1)).s
    s = assegna(s, 1, min(3)).stato
    const a = arriva(s, rich('k-1: a'), 1, min(4))
    expect(a.p.passa).toBe(true)
    expect(fila(a.s)).toEqual(['k-2'])
  })

  it('un altro che prova a passare davanti, col posto prenotato o con uno in fila di priorità pari o più alta, va in fila anche lui', () => {
    let s = arriva(attesaVuota(), rich('k-1: a'), 0, T0).s
    s = assegna(s, 1, min(1)).stato
    // Il posto libero è prenotato per k-1: k-9 non passa.
    const intruso = arriva(s, rich('k-9: altro', { workspace: 'Altro', autopilota: 'ap-2' }), 1, min(2))
    expect(intruso.p).toMatchObject({ passa: false, posizione: 2, nuova: true })
    expect(fila(intruso.s)).toEqual(['k-1', 'k-9'])
    // Il posto libero è di chi è in fila anche se ha una priorità più bassa: il posto prenotato non si ruba.
    const basso: StatoAttesa = { voci: [{ ...s.voci[0]!, prenotataFino: undefined, priorita: -1 }], prossimo: s.prossimo }
    const dopo = arriva(basso, rich('k-7: urgente'), 1, min(2))
    expect(dopo.p).toMatchObject({ passa: false, posizione: 2 })
    expect(dopo.p.mossa.svegli.map((v) => v.compito)).toEqual(['k-1'])
    // Ma coi posti pieni la priorità conta: chi arriva con 0 sta davanti a chi è a -1.
    const pieni = arriva({ voci: [{ ...s.voci[0]!, prenotataFino: undefined, priorita: -1 }], prossimo: s.prossimo }, rich('k-7: urgente'), 0, min(2))
    expect(fila(pieni.s)).toEqual(['k-7', 'k-1'])
  })

  it('la prenotazione non usata scade: passa al successivo, e chi l’ha persa va in fondo alla sua priorità', () => {
    let s = arriva(attesaVuota(), rich('k-1: a'), 0, T0).s
    s = arriva(s, rich('k-2: b'), 0, min(1)).s
    s = assegna(s, 1, min(3)).stato
    // Prima della scadenza non cambia niente.
    expect(rivedi(s, 1, min(7)).svegli).toEqual([])
    // Cinque minuti dopo: k-1 ha perso il posto, tocca a k-2.
    const m = rivedi(s, 1, min(9))
    expect(m.svegli.map((v) => v.compito)).toEqual(['k-2'])
    expect(m.cadute).toEqual([])
    expect(fila(m.stato, min(9))).toEqual(['k-2', 'k-1'])
    // La voce persa resta in lista, senza prenotazione.
    expect(m.stato.voci.find((v) => v.compito === 'k-1')!.prenotataFino).toBeUndefined()
  })

  it('dopo troppe sveglie a vuoto la voce cade e se ne dà notizia', () => {
    let s = arriva(attesaVuota(), rich('k-1: a'), 0, T0).s
    let t = 1
    for (let i = 0; i < SVEGLIE_MAX; i += 1) {
      s = rivedi(s, 1, min(t)).stato
      t += 6
    }
    expect(s.voci[0]!.sveglie).toBe(SVEGLIE_MAX)
    const m = scadute(s, min(t))
    expect(m.cadute.map((v) => v.compito)).toEqual(['k-1'])
    expect(m.stato.voci).toEqual([])
  })

  it('cambio di priorità: su e giù di un posto, in cima', () => {
    let s = arriva(attesaVuota(), rich('k-1: a'), 0, T0).s
    s = arriva(s, rich('k-2: b'), 0, min(1)).s
    s = arriva(s, rich('k-3: c'), 0, min(2)).s
    const vid = (k: string): string => s.voci.find((v) => v.compito === k)!.id
    s = cambiaPriorita(s, vid('k-3'), 'su')!
    expect(fila(s)).toEqual(['k-1', 'k-3', 'k-2'])
    s = cambiaPriorita(s, vid('k-3'), 'cima')!
    expect(fila(s)).toEqual(['k-3', 'k-1', 'k-2'])
    s = cambiaPriorita(s, vid('k-3'), 'giu')!
    expect(fila(s)).toEqual(['k-1', 'k-3', 'k-2'])
    // In cima e sopra l'ultimo, giù dall'ultimo: niente da fare, nessun errore.
    s = cambiaPriorita(s, vid('k-2'), 'giu')!
    expect(fila(s)).toEqual(['k-1', 'k-3', 'k-2'])
    s = cambiaPriorita(s, vid('k-1'), 'su')!
    expect(fila(s)).toEqual(['k-1', 'k-3', 'k-2'])
    expect(cambiaPriorita(s, 'non-c-e', 'su')).toBeUndefined()
    // Una voce messa in cima passa davanti anche a chi ha priorità più alta.
    const alta: StatoAttesa = { ...s, voci: s.voci.map((v) => (v.compito === 'k-1' ? { ...v, priorita: 5 } : v)) }
    const cima = cambiaPriorita(alta, alta.voci.find((v) => v.compito === 'k-2')!.id, 'cima')!
    expect(fila(cima)).toEqual(['k-2', 'k-1', 'k-3'])
    expect(cima.voci.find((v) => v.compito === 'k-2')!.priorita).toBe(5)
    // Una sola «su» attraverso un salto di priorità la porta a quella di chi la precede.
    const salto: StatoAttesa = { ...s, voci: s.voci.map((v) => (v.compito === 'k-1' ? { ...v, priorita: 3 } : v)) }
    expect(fila(salto)).toEqual(['k-1', 'k-3', 'k-2'])
    const su = cambiaPriorita(salto, salto.voci.find((v) => v.compito === 'k-3')!.id, 'su')!
    expect(fila(su)).toEqual(['k-3', 'k-1', 'k-2'])
    expect(su.voci.find((v) => v.compito === 'k-3')!.priorita).toBe(3)
  })

  it('togliere una voce la toglie dalla fila e le altre scalano', () => {
    let s = arriva(attesaVuota(), rich('k-1: a'), 0, T0).s
    s = arriva(s, rich('k-2: b'), 0, min(1)).s
    const t = togliVoce(s, s.voci[0]!.id)!
    expect(t.voce.compito).toBe('k-1')
    expect(inFila(t.stato, T0)[0]).toMatchObject({ compito: 'k-2', posizione: 1 })
    expect(togliVoce(s, 'non-c-e')).toBeUndefined()
  })
})
