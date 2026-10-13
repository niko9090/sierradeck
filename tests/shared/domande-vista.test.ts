import { describe, it, expect } from 'vitest'
import type { Conversazione } from '@shared/domande-conversazioni'
import { aspettaTe, messaggiInVista, ordinaDomande, prossimaDomanda, tipoDomanda } from '@shared/domande-vista'

/** Le Domande riprogettate (0.70.0): un tipo in una parola, «Aspettano te» di partenza. */
const conv = (x: Partial<Conversazione> & { chiave: string }): Conversazione => ({
  tipo: 'chat', titolo: x.chiave, sotto: '', chiede: false, messaggi: [], risposta: { via: 'scrivi', chat: x.chiave }, segnaposto: '', ...x
})
const scelta = { chat: 'c', opzioni: [] }

describe('il tipo di una domanda', () => {
  it('permesso, scelta, domanda, autopilota, ha finito', () => {
    expect(tipoDomanda(conv({ chiave: 'a', chiede: true, scelte: scelta, messaggi: [{ da: 'lui', testo: 'Do you want to make this edit to leggimi.md?' }] }))).toMatchObject({ id: 'permesso', colore: 'rosso' })
    expect(tipoDomanda(conv({ chiave: 'b', chiede: true, scelte: scelta, messaggi: [{ da: 'lui', testo: 'Quale colore preferisci?' }] }))).toMatchObject({ id: 'scelta', colore: 'ambra' })
    expect(tipoDomanda(conv({ chiave: 'c', chiede: true })).id).toBe('domanda')
    expect(tipoDomanda(conv({ chiave: 'd', tipo: 'autopilota', chiede: true })).id).toBe('autopilota')
    expect(tipoDomanda(conv({ chiave: 'e' }))).toMatchObject({ id: 'finito', parola: 'ha finito' })
    expect(aspettaTe(conv({ chiave: 'e' }))).toBe(false)
  })
  it('la fiducia nella cartella e la modalità senza permessi sono permessi', () => {
    expect(tipoDomanda(conv({ chiave: 'a', scelte: scelta, messaggi: [{ da: 'lui', testo: 'Quick safety check: Is this a project you trust? Yes, I trust this folder' }] })).id).toBe('permesso')
    expect(tipoDomanda(conv({ chiave: 'a', scelte: scelta, messaggi: [{ da: 'lui', testo: 'WARNING: Claude Code running in Bypass Permissions mode' }] })).id).toBe('permesso')
  })
})

describe('ordine e prossima', () => {
  const c = [conv({ chiave: 'finita' }), conv({ chiave: 'ap', tipo: 'autopilota', chiede: true }), conv({ chiave: 'dom', chiede: true }), conv({ chiave: 'perm', scelte: scelta, messaggi: [{ da: 'lui', testo: 'Allow this?' }] })]
  it('prima i permessi, le finite in fondo', () => {
    expect(ordinaDomande(c).map((x) => x.chiave)).toEqual(['perm', 'dom', 'ap', 'finita'])
  })
  it('dopo una risposta si passa alla prossima che aspetta te', () => {
    expect(prossimaDomanda(c, 'perm')).toBe('dom')
    expect(prossimaDomanda([conv({ chiave: 'x', chiede: true }), conv({ chiave: 'f' })], 'x')).toBeUndefined()
  })
  it('i messaggi vecchi restano chiusi', () => {
    expect(messaggiInVista([1, 2, 3, 4, 5, 6], false)).toEqual({ vista: [3, 4, 5, 6], nascosti: 2 })
    expect(messaggiInVista([1, 2], false).nascosti).toBe(0)
    expect(messaggiInVista([1, 2, 3, 4, 5, 6], true).nascosti).toBe(0)
  })
})
