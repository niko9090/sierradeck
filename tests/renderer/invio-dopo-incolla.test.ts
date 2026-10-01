import { describe, it, expect } from 'vitest'
import { eseguiConsegna, premiInvio, TENTATIVI_INVIO, type Ponte, type InvioMancato, type Consegna } from '../../src/renderer/consegne-autopilota'
import { consegnaPartita, prontoPerInvio } from '../../src/renderer/ultime-righe'
import { preparaConsegna, rigaCorta, serveFile, fileConsegna, SOGLIA_RIGA } from '@shared/consegna-breve'

/**
 * L'autopilota consegna da solo, senza mai chiedere a Nicholas di premere
 * Invio (0.38.1). Le righe di schermo qui sotto vengono da una prova con un
 * Claude Code vero (2.1.287) in un pty, passato da un xterm.
 */
const INVIO = String.fromCharCode(13)

// Lo schermo vero, dopo un invio andato: il messaggio mandato sta sopra (anche
// come «[Pasted text #1 …]»), il campo di adesso e' vuoto, la riga d'attivita'
// dice «(2s · thinking)» e «esc to interrupt» non c'e'.
const PARTITA_DOPO_INCOLLA = [
  '❯ [Pasted text #1 +42 lines]',
  '* Schlepping… (2s · thinking)',
  '                                                                    ◐ medium · /effort',
  '────────────────────────────────────────',
  '❯',
  '────────────────────────────────────────',
  '  ⏵⏵ bypass permissions on (shift+tab to cycle)'
]
const PARTITA_FINITA = [
  '❯ Leggi ed esegui le istruzioni in .sierradeck/consegne/c-1.md (dal tuo supervisore).',
  '● Fatto.',
  '✻ Cooked for 1s · done 23:41',
  '────────────────────────────────────────',
  '❯',
  '────────────────────────────────────────',
  '  ⏵⏵ bypass permissions on (shift+tab to cycle)'
]
const RIGA = rigaCorta(fileConsegna('c-1'))
const FERMA_NEL_CAMPO = [
  '────────────────────────────────────────',
  `❯ ${RIGA}`,
  '────────────────────────────────────────',
  '  ⏵⏵ bypass permissions on (shift+tab to cycle)'
]

describe('consegna lunga: un file e una riga corta', () => {
  it('produce il file con le istruzioni e nella chat va solo la riga, senza a capo', () => {
    const scritti: Record<string, string> = {}
    const lunga = 'Fai questo.\n'.repeat(80)
    const c = preparaConsegna({ id: 'c-1', cosa: 'scrivi', testo: lunga, titolo: 'NexoraOS' }, (rel, t) => { scritti[rel] = t; return true })
    expect(c.testo).toBe('Leggi ed esegui le istruzioni in .sierradeck/consegne/c-1.md (dal tuo supervisore).')
    expect(c.testo.length).toBeLessThanOrEqual(SOGLIA_RIGA)
    expect(c.testo).not.toMatch(/[\r\n]/)
    expect(scritti['.sierradeck/consegne/c-1.md']).toContain(lunga.trim())
  })
  it('un testo breve va diretto; se il file non si scrive si resta al testo intero', () => {
    expect(serveFile('continua da dove eri')).toBe(false)
    expect(preparaConsegna({ id: 'c', cosa: 'scrivi', testo: 'continua', titolo: 't' }, () => true).testo).toBe('continua')
    const lunga = 'x'.repeat(SOGLIA_RIGA + 1)
    expect(preparaConsegna({ id: 'c', cosa: 'scrivi', testo: lunga, titolo: 't' }, () => false).testo).toBe(lunga)
    expect(fileConsegna('../../x')).toBe('.sierradeck/consegne/x.md')
  })
})

describe('la partenza si legge dal campo di adesso, non dallo scrollback', () => {
  it('«[Pasted text» nel messaggio già mandato non fa scattare il falso allarme', () => {
    expect(consegnaPartita(PARTITA_DOPO_INCOLLA, RIGA)).toBe(true)
    expect(consegnaPartita(PARTITA_FINITA, RIGA)).toBe(true)
  })
  it('la riga ancora nel campo: non partita', () => {
    expect(consegnaPartita(FERMA_NEL_CAMPO, RIGA)).toBe(false)
    expect(consegnaPartita(['❯ [Pasted text #2 +10 lines]'], RIGA)).toBe(false)
    expect(consegnaPartita([], RIGA)).toBeUndefined()
  })
  it('pronta per l invio: campo disegnato e flusso quieto', () => {
    const ora = Date.parse('2026-10-01T16:00:00Z')
    expect(prontoPerInvio({ prontoVisto: true, ultimoDato: ora - 800 }, FERMA_NEL_CAMPO, ora)).toBe(true)
    expect(prontoPerInvio({ prontoVisto: true, ultimoDato: ora - 100 }, FERMA_NEL_CAMPO, ora)).toBe(false)
  })
})

/** Un ponte finto con uno schermo che risponde come quello vero. */
function banco(p: { prontoDopo: number; parte: (invii: number) => boolean }) {
  const scritti: string[] = []
  const segnali: InvioMancato[] = []
  let attese = 0
  let invii = 0
  let campo = ''
  const coda: (() => void)[] = []
  const partitaOra = (): boolean => invii > 0 && p.parte(invii)
  const ponte: Ponte = {
    riquadroDi: () => ({ paneId: 'p', ptyId: 'pty-1' }),
    apri: () => 'p',
    scrivi: (_id, t) => {
      scritti.push(t)
      if (t === INVIO) { invii++; if (p.parte(invii)) campo = '' } else campo += t
    },
    prontoARicevere: () => { attese += 1; return !partitaOra() && attese > p.prontoDopo },
    partita: (_id, scritto) => consegnaPartita(partitaOra() ? PARTITA_DOPO_INCOLLA : [`❯ ${campo}`], scritto),
    segnala: (s) => { segnali.push(s) }
  }
  const dopo = (_ms: number, f: () => void): void => { coda.push(f) }
  const corri = (): void => { for (let i = 0; i < 2000 && coda.length > 0; i++) (coda.shift() as () => void)() }
  return { ponte, dopo, corri, scritti, segnali }
}
const consegna: Consegna = { id: 'c-1', autopilotaId: 'ap-1', chatId: 'ch-1', cwd: 'C:/p', sessionId: 's', titolo: 'NexoraOS', cosa: 'scrivi', testo: RIGA }

describe('la riga corta, con il ponte finto', () => {
  it('parte al primo invio: digitata senza marcatori, un solo Invio, nessun segnale', () => {
    const b = banco({ prontoDopo: 0, parte: () => true })
    eseguiConsegna(consegna, b.ponte, b.dopo)
    b.corri()
    expect(b.scritti).toEqual([RIGA, INVIO])
    expect(b.segnali).toEqual([])
  })
  it('prontezza lenta: un solo invio', () => {
    const b = banco({ prontoDopo: 20, parte: () => true })
    premiInvio('pty-1', b.ponte, b.dopo, 0, 0, consegna)
    b.corri()
    expect(b.scritti.filter((t) => t === INVIO)).toHaveLength(1)
  })
  it('non parte ai primi invii: riprova da solo in un secondo modo, e lì parte', () => {
    const b = banco({ prontoDopo: 0, parte: (n) => n > TENTATIVI_INVIO + 1 })
    eseguiConsegna(consegna, b.ponte, b.dopo)
    b.corri()
    expect(b.scritti.filter((t) => t === INVIO)).toHaveLength(TENTATIVI_INVIO + 2)
    expect(b.segnali).toEqual([])
  })
  it('non parte mai: guasto del programma nel diario, nessuna domanda per Nicholas', () => {
    const b = banco({ prontoDopo: 0, parte: () => false })
    eseguiConsegna(consegna, b.ponte, b.dopo)
    b.corri()
    expect(b.scritti.filter((t) => t === INVIO)).toHaveLength(2 * (TENTATIVI_INVIO + 1))
    expect(b.segnali).toHaveLength(1)
    expect(b.segnali[0]?.motivo).toContain('guasto del programma')
  })
})

describe('nessuna richiesta «Premi Invio» per Nicholas (0.38.1)', () => {
  it('la banda non c è più; il guasto va nel diario; il tasto resta solo, facoltativo, nella scheda', async () => {
    const { readFileSync } = await import('node:fs')
    const app = readFileSync('src/renderer/App.tsx', 'utf8')
    expect(app).not.toContain('inviiMancati')
    expect(app).not.toContain('Premi Invio')
    expect(app).toContain('guasto del programma')
    const scheda = readFileSync('src/renderer/components/DiarioAutopilota.tsx', 'utf8')
    expect(scheda).toContain("'sierradeck:invio-mancato'")
  })
})
