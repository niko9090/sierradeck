import { describe, it, expect } from 'vitest'
import { scriviMessaggio, TRATTIENE_ALL_AVVIO_MS, type Ponte } from '../../src/renderer/consegne-autopilota'
import { partitaDaSegnali } from '@shared/segnali-chat'

/**
 * 0.86.2 — «le risposte non arrivano alla chat quando sono fatte dal box
 * domande». La strada di `/api/scrivi` (Domande del PC, «Ti chiede», pagina,
 * app) scriveva il testo e premeva Invio a tempo, una volta sola: se Claude
 * Code leggeva in ritardo la risposta restava nel campo. Adesso passa dal
 * gesto delle consegne: Invio dopo l'eco, controllo che sia partita, nuovi
 * tentativi; e nei primi secondi della chat niente riscritture né Invio alla cieca.
 */

const INVIO = String.fromCharCode(13)
const ESC = String.fromCharCode(27)

type Stato = { nelCampo: boolean; partita?: boolean; perso?: boolean; natoDa?: number }

function banco(stato: Stato) {
  const scritti: string[] = []
  const rinviati: (() => void)[] = []
  const partite: (number | undefined)[] = []
  const ponte: Ponte = {
    riquadroDi: () => undefined,
    apri: () => '',
    scrivi: (_p, t) => { scritti.push(t) },
    prontoARicevere: () => true,
    nelCampo: () => stato.nelCampo,
    quieto: () => true,
    partita: (_p, _s, _prima, scrittaIl) => { partite.push(scrittaIl); return stato.partita },
    perso: () => stato.perso === true,
    lavora: () => false,
    natoDa: () => stato.natoDa
  }
  const dopo = (_ms: number, cosa: () => void): void => { rinviati.push(cosa) }
  const unGiro = (): void => { for (const f of rinviati.splice(0, rinviati.length)) f() }
  const giri = (n: number): void => { for (let i = 0; i < n && rinviati.length > 0; i += 1) unGiro() }
  return { ponte, scritti, dopo, unGiro, giri, partite, rinviati }
}

describe('un messaggio dalle Domande arriva come una consegna (0.86.2)', () => {
  it('Invio solo dopo che il testo si vede nel campo, non a tempo', () => {
    const s: Stato = { nelCampo: false, partita: true }
    const b = banco(s)
    scriviMessaggio('pty-1', 'Verde', b.ponte, b.dopo, 'p-1')
    expect(b.scritti).toEqual(['Verde'])
    // Claude Code non l'ha ancora mostrato: qualche giro, e niente Invio.
    b.giri(5)
    expect(b.scritti).toEqual(['Verde'])
    s.nelCampo = true
    b.unGiro()
    expect(b.scritti).toEqual(['Verde', INVIO])
  })

  it('più righe vanno fra i marcatori dell’incolla, altrimenti gli a capo lo mandano a pezzi', () => {
    const b = banco({ nelCampo: true, partita: true })
    scriviMessaggio('pty-1', 'prima riga\nseconda riga', b.ponte, b.dopo)
    expect(b.scritti[0]).toBe(`${ESC}[200~prima riga\nseconda riga${ESC}[201~`)
  })

  it('non partita: si ripreme Invio (prima la rotta diceva «fatto» e basta)', () => {
    const s: Stato = { nelCampo: true, partita: false }
    const b = banco(s)
    scriviMessaggio('pty-1', 'continua', b.ponte, b.dopo)
    b.giri(4)
    expect(b.scritti.filter((t) => t === INVIO).length).toBeGreaterThanOrEqual(2)
  })

  it('il controllo di partenza riceve il momento della scrittura, per i segnali', () => {
    const b = banco({ nelCampo: true, partita: true })
    const prima = Date.now()
    scriviMessaggio('pty-1', 'ok', b.ponte, b.dopo)
    b.giri(3)
    expect(b.partite[0]).toBeGreaterThanOrEqual(prima)
  })

  it('un testo vuoto resta il solo Invio (la scelta già evidenziata)', () => {
    const b = banco({ nelCampo: true })
    scriviMessaggio('pty-1', '', b.ponte, b.dopo)
    expect(b.scritti).toEqual([INVIO])
  })
})

describe('una chat appena nata trattiene il testo: niente doppioni (0.86.2)', () => {
  it('senza eco non preme Invio alla cieca finché la chat è giovane', () => {
    const s: Stato = { nelCampo: false, partita: true, natoDa: 3000 }
    const b = banco(s)
    scriviMessaggio('pty-1', 'compito', b.ponte, b.dopo)
    // Ben oltre le 30 attese di sempre: con una chat giovane si aspetta l'eco.
    b.giri(60)
    expect(b.scritti).toEqual(['compito'])
    // Passato il tempo in cui trattiene, si torna alle regole di sempre.
    s.natoDa = TRATTIENE_ALL_AVVIO_MS + 1
    b.unGiro()
    expect(b.scritti).toEqual(['compito', INVIO])
  })

  it('il campo vuoto nei primi secondi non vuol dire perso: non si riscrive', () => {
    const s: Stato = { nelCampo: true, partita: false, perso: true, natoDa: 5000 }
    const b = banco(s)
    scriviMessaggio('pty-1', 'compito', b.ponte, b.dopo)
    b.giri(3)
    expect(b.scritti.filter((t) => t === 'compito')).toHaveLength(1)
  })

  it('una chat vecchia con il testo davvero perso lo riscrive, come prima', () => {
    const s: Stato = { nelCampo: true, partita: false, perso: true, natoDa: 120_000 }
    const b = banco(s)
    scriviMessaggio('pty-1', 'compito', b.ponte, b.dopo)
    b.unGiro()
    expect(b.scritti).toEqual(['compito', INVIO])
    // Dopo l'Invio il testo non c'è da nessuna parte e la chat non lavora.
    s.nelCampo = false
    b.giri(2)
    expect(b.scritti.filter((t) => t === 'compito').length).toBeGreaterThanOrEqual(2)
  })
})

describe('la partenza dai segnali conta solo se il turno comincia dopo la scrittura (0.86.2)', () => {
  const adesso = Date.parse('2026-10-30T10:00:30.000Z')
  const T = (s: number): string => new Date(Date.parse('2026-10-30T10:00:00.000Z') + s * 1000).toISOString()
  const scrittaIl = Date.parse(T(20))
  it('un UserPromptSubmit dopo la scrittura: partita', () => {
    expect(partitaDaSegnali({ sessione: 's', fase: 'lavora', dal: T(22) }, adesso, scrittaIl)).toBe(true)
  })
  it('un turno cominciato prima non dice niente: decide lo schermo', () => {
    expect(partitaDaSegnali({ sessione: 's', fase: 'lavora', dal: T(5) }, adesso, scrittaIl)).toBeUndefined()
  })
  it('senza il momento della scrittura resta la regola di prima', () => {
    expect(partitaDaSegnali({ sessione: 's', fase: 'lavora', dal: T(5) }, adesso)).toBe(true)
  })
})
