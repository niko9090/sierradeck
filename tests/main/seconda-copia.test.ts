import { describe, expect, it } from 'vitest'
import { decidiSecondaCopia, flagDi, rigaSecondaCopia, SECONDI_DI_GRAZIA, type SecondaCopia } from '../../src/main/seconda-copia'

const base: SecondaCopia = {
  argv: ['C:\\Programmi\\App\\App.exe'],
  secondiDaAvvio: 600,
  avvioFinito: true,
  finestre: 1,
  nonAVista: 0
}

describe('decidiSecondaCopia', () => {
  it('finestra nascosta nell area di notifica: la mostra, non ne apre un altra', () => {
    expect(decidiSecondaCopia({ ...base, nonAVista: 1 }).azione).toBe('mostra')
  })

  it('durante l avvio non aggiunge finestre', () => {
    expect(decidiSecondaCopia({ ...base, avvioFinito: false, finestre: 0, secondiDaAvvio: 2 }).azione).toBe('niente')
  })

  it('a ridosso dell avvio (doppio clic) mostra', () => {
    expect(decidiSecondaCopia({ ...base, secondiDaAvvio: SECONDI_DI_GRAZIA - 1 }).azione).toBe('mostra')
  })

  it.each(['--updated', '--riavvio', '--aggiornato'])('un rilancio con %s mostra', (segno) => {
    expect(decidiSecondaCopia({ ...base, argv: [...base.argv, segno] }).azione).toBe('mostra')
  })

  it('nessuna finestra aperta: ne apre una', () => {
    expect(decidiSecondaCopia({ ...base, finestre: 0 }).azione).toBe('nuova')
  })

  it('tutte a schermo, programma in piedi da un po, lancio a mano: nuova finestra', () => {
    expect(decidiSecondaCopia(base).azione).toBe('nuova')
  })
})

describe('rigaSecondaCopia', () => {
  it('scrive solo i flag, senza percorsi né valori', () => {
    const p = { ...base, argv: ['C:\\Utenti\\qualcuno\\App.exe', '--updated', '--original-process-start-time=1234', 'D:\\file.txt'], secondiDaAvvio: 12.4 }
    const riga = rigaSecondaCopia(p, decidiSecondaCopia(p))
    expect(riga).toContain('[finestre] seconda copia lanciata (argv: --updated --original-process-start-time, da avvio 12 s')
    expect(riga).not.toMatch(/[A-Z]:\\/)
    expect(riga).not.toContain('1234')
  })

  it('senza flag lo dice', () => {
    expect(flagDi(base.argv)).toEqual([])
    expect(rigaSecondaCopia(base, decidiSecondaCopia(base))).toContain('argv: nessun flag')
  })
})
