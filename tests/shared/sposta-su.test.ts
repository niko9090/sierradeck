import { describe, it, expect } from 'vitest'
import { comeSpostare, destinazioniSposta, riassuntoSposta, ACCESO_ENTRO_MS } from '../../src/shared/sposta-su'

const adesso = Date.parse('2026-10-13T12:00:00Z')
const io = { id: 'pc-c', nome: 'PC-C' }
const pc = [
  { id: 'pc-b', nome: 'PC-B', battito: new Date(adesso - 60_000).toISOString() },
  { id: 'pc-a', nome: 'PC-A', battito: new Date(adesso - ACCESO_ENTRO_MS - 1).toISOString() },
  { id: 'pc-c', nome: 'PC-C' }
]
const riga = { nome: 'prova', residente: { pc: 'pc-a', nome: 'PC-A', qui: false }, chat: 3, alLavoro: 1, spazioDrive: { byte: 10, file: 42, grandi: [] }, cartelle: [{ pc: 'pc-a', nome: 'PC-A', percorso: 'x' }, { pc: 'pc-c', nome: 'PC-C', percorso: 'y' }] }

describe('«Sposta su ▾»: da qualsiasi PC verso qualsiasi PC', () => {
  it('elenca questo PC per primo, poi gli altri per nome, acceso o spento, quello attuale segnato', () => {
    const d = destinazioniSposta(riga, io, pc, adesso)
    expect(d.map((x) => x.pc)).toEqual(['pc-c', 'pc-a', 'pc-b'])
    expect(d[0]).toMatchObject({ qui: true, acceso: true, attuale: false, testo: 'PC-C (questo PC) · acceso' })
    expect(d[1]).toMatchObject({ acceso: false, attuale: true, testo: 'PC-A · spento · dove vive adesso' })
    expect(d[2]).toMatchObject({ acceso: true, attuale: false })
  })

  it('da A verso B stando su C: la richiesta va per il ponte; verso C parte qui', () => {
    expect(comeSpostare('pc-b', io)).toBe('ponte')
    expect(comeSpostare('pc-c', io)).toBe('qui')
  })

  it('la conferma dice da dove, verso dove, quante chat e file, cosa succede alle chat aperte', () => {
    const verso = destinazioniSposta(riga, io, pc, adesso).find((x) => x.pc === 'pc-b')!
    const r = riassuntoSposta(riga, verso)
    expect(r.titolo).toBe('Sposta «prova» su PC-B?')
    expect(r.righe[0]).toBe('Da: PC-A')
    expect(r.righe[1]).toBe('Verso: PC-B')
    expect(r.righe[2]).toContain('3 chat e 42 file sul Drive')
    expect(r.righe[3]).toContain('1 sta lavorando')
    expect(r.righe[4]).toContain('PC-A, PC-C')
    expect(r.conferma).toBe('Conferma: sposta su PC-B')
    expect(r.avviso).toBeUndefined()
  })

  it('verso un PC spento lo dice prima di confermare', () => {
    const spento = { pc: 'pc-x', nome: 'PC-X', qui: false, acceso: false, attuale: false, testo: '' }
    expect(riassuntoSposta(riga, spento).avviso).toContain('PC-X adesso risulta spento')
  })
})
