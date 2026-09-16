import { describe, expect, it } from 'vitest'
import { attesaMassimaMs, descriviAttesaDrive, lavoroAutomatico, percheNonFinito } from '../../src/main/attesa-drive'
import type { LavoroInCorso } from '../../src/main/cassaforte/lavoro-in-corso'

const lavoro = (parte: Partial<LavoroInCorso>): LavoroInCorso => ({
  tipo: 'arrivo', avviato: '2026-09-16T15:26:17.000Z', fase: 'scarico', annullamento: false, ...parte
})

describe('lavoroAutomatico e attesaMassimaMs', () => {
  it('arrivo e salvataggio si rifanno da soli: si annullano e si aspetta poco', () => {
    expect(lavoroAutomatico('arrivo')).toBe(true)
    expect(lavoroAutomatico('salvataggio')).toBe(true)
    expect(attesaMassimaMs('arrivo')).toBe(90_000)
  })
  it('fusione e ripristino li ha chiesti qualcuno: si aspettano fino a dieci minuti', () => {
    expect(lavoroAutomatico('fusione')).toBe(false)
    expect(lavoroAutomatico('ripristino')).toBe(false)
    expect(attesaMassimaMs('fusione')).toBe(600_000)
  })
})

describe('descriviAttesaDrive', () => {
  it('dice il nome del lavoro, il conto dei file e che lo annulla', () => {
    expect(descriviAttesaDrive(lavoro({ fatto: 312, totale: 639, unita: 'file' })))
      .toBe('il lavoro con il Drive «Arrivo dal Drive» (312 di 639 file): lo annullo')
  })
  it('già annullato: dice che si ferma al prossimo file', () => {
    expect(descriviAttesaDrive(lavoro({ annullamento: true })))
      .toBe('il lavoro con il Drive «Arrivo dal Drive»: l’ho annullato, si ferma appena finisce il file in corso')
  })
  it('un lavoro voluto: indica il fumetto da cui annullarlo', () => {
    expect(descriviAttesaDrive(lavoro({ tipo: 'fusione', fatto: 10, totale: 40 })))
      .toBe('il lavoro con il Drive «Fondo con il Drive» (10 di 40 file): puoi annullarlo dal fumetto in basso a destra')
  })
  it('senza totale non inventa numeri', () => {
    expect(descriviAttesaDrive(lavoro({ tipo: 'salvataggio', fatto: 3 })))
      .toBe('il lavoro con il Drive «Salvo sul Drive»: lo annullo')
  })
})

describe('percheNonFinito', () => {
  it('dice il tetto giusto per il tipo di lavoro', () => {
    expect(percheNonFinito(lavoro({}))).toContain('un minuto e mezzo')
    expect(percheNonFinito(lavoro({ tipo: 'ripristino' }))).toContain('dieci minuti')
    expect(percheNonFinito(lavoro({}))).toContain('Annullalo dal fumetto')
  })
})
