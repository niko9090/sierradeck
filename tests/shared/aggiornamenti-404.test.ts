import { describe, it, expect } from 'vitest'
import { eFileRilascioMancante, valutaFileRilascioMancante, SOGLIA_404_MS } from '../../src/shared/aggiornamenti-404'

const url = (f: string): string => `Cannot download "https://github.com/esempio/prova/releases/download/v9.9.9/${f}", status 404: Not Found`

describe('eFileRilascioMancante', () => {
  it('404 su installer e blockmap si, su altro no', () => {
    expect(eFileRilascioMancante(url('SierraDeck-Setup-9.9.9.exe'))).toBe(true)
    expect(eFileRilascioMancante(url('SierraDeck-Setup-9.9.9.exe.blockmap'))).toBe(true)
    expect(eFileRilascioMancante(url('SierraDeck-Setup-9.9.9.exe').replace('404', '500'))).toBe(false)
    expect(eFileRilascioMancante(url('altro.zip'))).toBe(false)
  })
})

describe('valutaFileRilascioMancante', () => {
  it('atteso entro la soglia (nota solo la prima volta), errore una volta sola oltre', () => {
    const t0 = 1_000_000
    const a = valutaFileRilascioMancante(undefined, t0)
    expect(a).toMatchObject({ esito: 'atteso', primo: true })
    const b = valutaFileRilascioMancante(a.episodio, t0 + 10 * 60_000)
    expect(b).toMatchObject({ esito: 'atteso', primo: false })
    const c = valutaFileRilascioMancante(b.episodio, t0 + SOGLIA_404_MS + 1)
    expect(c.esito).toBe('errore')
    const d = valutaFileRilascioMancante(c.episodio, t0 + SOGLIA_404_MS + 600_000)
    expect(d.esito).toBe('atteso')
  })
})
