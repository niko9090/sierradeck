import { describe, it, expect } from 'vitest'
import { riassuntoDaUltimo, passaggiDopo, type DatiRiassuntoAutopilota } from '@shared/riassunto-autopilota'
import type { Decisione, ScambioDialogo } from '@shared/autopilota'

const ORA = Date.parse('2026-11-22T15:00:00Z')
const fa = (min: number): string => new Date(ORA - min * 60_000).toISOString()
const av = (min: number, nota: string): Decisione => ({ quando: fa(min), cosa: 'riga tecnica', traguardo: { chat: 'x', esito: 'avanzamento', nota } })

const dati = (dialogo: ScambioDialogo[], decisioni: Decisione[]): DatiRiassuntoAutopilota => ({
  autopilota: { dialogo, decisioni, chats: [] },
  adesso: ORA
})

const dialogo: ScambioDialogo[] = [
  { quando: fa(300), da: 'tu', testo: 'vecchio' },
  { quando: fa(60), da: 'tu', testo: 'sistema la voce' },
  { quando: fa(50), da: 'lui', testo: 'Va bene, ci lavoro.' }
]
const decisioni: Decisione[] = [
  av(200, 'Al lavoro: Lo sviluppatore — una cosa vecchia.'),
  av(40, 'Al lavoro: Lo sviluppatore — la voce che legge.'),
  av(10, 'Unito il lavoro su «la voce che legge»: le prove passano.'),
  av(5, 'Il verificatore non è riuscito dopo 25 min: prova della voce.')
]

describe('riassunto a passaggi', () => {
  it('parte dall’ultimo messaggio di Nicholas', () => {
    const r = riassuntoDaUltimo(dati(dialogo, decisioni))
    const testo = (r.passaggi ?? []).join('\n')
    expect(testo).toContain('la voce che legge')
    expect(testo).not.toContain('una cosa vecchia')
    expect(r.titolo).toContain('ultimo messaggio')
  })

  it('ha le due sezioni, in ordine, senza sigle', () => {
    const r = riassuntoDaUltimo(dati(dialogo, decisioni))
    expect(r.passaggi?.[0]).toMatch(/^Partito/u)
    expect(r.passaggi?.[1]).toMatch(/^Unito/u)
    expect(r.passaggi?.length).toBeGreaterThanOrEqual(3)
    expect(r.daSapere?.some((x) => x.startsWith('Problema aperto'))).toBe(true)
    expect(r.parlato).toContain('Passaggi.')
    expect(r.parlato).toContain('Da sapere.')
    expect([...(r.passaggi ?? []), ...(r.daSapere ?? [])].join(' ')).not.toMatch(/\b[kr]-\d+/u)
  })

  it('senza modello si costruisce dagli eventi, anche senza niente da dire', () => {
    const vuoto = riassuntoDaUltimo(dati(dialogo.slice(0, 2), []))
    expect(vuoto.passaggi).toEqual(['Da allora nessun passo fatto.'])
    expect(vuoto.daSapere).toEqual(['Niente che richieda te.'])
    const molti = Array.from({ length: 12 }, (_, i) => av(50 - i, `Al lavoro: Lo sviluppatore — passo ${i}.`))
    const p = passaggiDopo({ dialogo, decisioni: molti, chats: [] }, ORA - 60 * 60_000)
    expect(p).toHaveLength(9)
    expect(p[0]).toMatch(/^Prima/u)
  })
})
