import { describe, it, expect } from 'vitest'
import { premiInvio, ATTESE_PRONTEZZA, TENTATIVI_INVIO, type Ponte, type InvioMancato } from '../../src/renderer/consegne-autopilota'
import { consegnaPartita, prontoPerInvio } from '../../src/renderer/ultime-righe'

/**
 * L'invio dopo l'incollaggio non deve mai mancare in silenzio (0.37.5).
 *
 * Il difetto: le istruzioni dell'autopilota sono state incollate nella chat e
 * l'invio non e' partito; Nicholas ha visto il testo fermo nella casella e ha
 * premuto Invio a mano. In `premiInvio`, se la prontezza non tornava entro
 * TENTATIVI_INVIO*10 attese, c'era un `return` muto.
 */
const INVIO = String.fromCharCode(13)
const chi = { chatId: 'ch-1', autopilotaId: 'ap-1', titolo: 'Notte' }

function banco(p: { prontoDopo: number; parte: boolean }) {
  const scritti: string[] = []
  const segnali: InvioMancato[] = []
  let attese = 0
  let partita = false
  const coda: (() => void)[] = []
  const ponte: Ponte = {
    riquadroDi: () => undefined,
    apri: () => 'p',
    scrivi: (_id, t) => { scritti.push(t); if (t === INVIO && p.parte) partita = true },
    // Pronta solo dopo `prontoDopo` controlli (Infinity = mai), e mai mentre lavora.
    prontoARicevere: () => { attese += 1; return !partita && attese > p.prontoDopo },
    // Lo schermo: lavora dopo un invio andato, altrimenti il testo e' ancora nel campo.
    partita: () => (partita ? true : false),
    segnala: (s) => { segnali.push(s) }
  }
  const dopo = (_ms: number, f: () => void): void => { coda.push(f) }
  const corri = (): void => { for (let i = 0; i < 1000 && coda.length > 0; i++) (coda.shift() as () => void)() }
  return { ponte, dopo, corri, scritti, segnali }
}

describe('premiInvio dopo un incollaggio (0.37.5)', () => {
  it('la prontezza non torna mai: invio premuto comunque, e se non parte il segnale si alza', () => {
    const b = banco({ prontoDopo: Infinity, parte: false })
    premiInvio('pty-1', b.ponte, b.dopo, 0, 0, chi)
    b.corri()
    // Non piu' zero invii: oltre il tetto si preme, e si riprova fino ai tentativi.
    expect(b.scritti.filter((t) => t === INVIO)).toHaveLength(TENTATIVI_INVIO + 1)
    expect(b.segnali).toHaveLength(1)
    expect(b.segnali[0]).toMatchObject({ ptyId: 'pty-1', chatId: 'ch-1', autopilotaId: 'ap-1', titolo: 'Notte' })
  })

  it('la prontezza non torna mai ma l invio forzato fa partire la chat: un invio, nessun segnale', () => {
    const b = banco({ prontoDopo: Infinity, parte: true })
    premiInvio('pty-1', b.ponte, b.dopo, 0, 0, chi)
    b.corri()
    expect(b.scritti.filter((t) => t === INVIO)).toHaveLength(1)
    expect(b.segnali).toEqual([])
  })

  it('la prontezza arriva lenta (entro il tetto): un solo invio', () => {
    const b = banco({ prontoDopo: ATTESE_PRONTEZZA - 3, parte: true })
    premiInvio('pty-1', b.ponte, b.dopo, 0, 0, chi)
    b.corri()
    expect(b.scritti.filter((t) => t === INVIO)).toHaveLength(1)
    expect(b.segnali).toEqual([])
  })

  it('la chat parte al primo invio: nessun secondo invio', () => {
    const b = banco({ prontoDopo: 0, parte: true })
    premiInvio('pty-1', b.ponte, b.dopo, 0, 0, chi)
    b.corri()
    expect(b.scritti).toEqual([INVIO])
    expect(b.segnali).toEqual([])
  })
})

describe('la prontezza dopo un incolla lungo, con lo schermo vero di Claude Code', () => {
  // Come lo disegna Claude Code dopo un incolla di decine di righe.
  const dopoIncolla = [
    '╭──────────────────────────────────────────────────────────╮',
    '│ > [Pasted text #1 +42 lines]                             │',
    '╰──────────────────────────────────────────────────────────╯',
    '  ⏵⏵ bypass permissions on (shift+tab to cycle)'
  ]
  const alLavoro = [
    '> [Pasted text #1 +42 lines]',
    '',
    '✻ Thinking… (12s · ↓ 340 tokens · esc to interrupt)'
  ]
  const ora = Date.parse('2026-10-01T16:00:00Z')

  it('il testo incollato ancora nel campo: la chat non e partita; al lavoro: partita', () => {
    expect(consegnaPartita(dopoIncolla)).toBe(false)
    expect(consegnaPartita(alLavoro)).toBe(true)
    expect(consegnaPartita([])).toBeUndefined()
  })

  it('pronta per l invio appena il campo e disegnato e il flusso tace, senza i 4 s degli annunci', () => {
    expect(prontoPerInvio({ prontoVisto: true, ultimoDato: ora - 800 }, dopoIncolla, ora)).toBe(true)
    // Mentre ridisegna il campo, no.
    expect(prontoPerInvio({ prontoVisto: true, ultimoDato: ora - 100 }, dopoIncolla, ora)).toBe(false)
    // Un terminale che non ha mai mostrato il prompt nel flusso: decide lo schermo.
    expect(prontoPerInvio({ prontoVisto: false, ultimoDato: ora - 5000 }, dopoIncolla, ora)).toBe(true)
    // Al lavoro, mai.
    expect(prontoPerInvio({ prontoVisto: true, ultimoDato: ora - 5000 }, alLavoro, ora)).toBe(false)
  })
})
