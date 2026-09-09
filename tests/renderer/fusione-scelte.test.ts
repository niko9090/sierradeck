import { describe, it, expect } from 'vitest'
import { sceltePerTutte, gruppoInVigore, riassunto, riassuntoInParole, vociDaDecidere } from '../../src/renderer/fusione-scelte'
import type { VoceFusione } from '../../src/main/cassaforte/fusione'

/**
 * Il difetto: «ho provato a selezionare unisci tutto ma non si capisce che
 * selezione c'è attiva perché non cambia nulla». I tasti di gruppo cambiavano
 * righe nascoste e non dicevano se erano quelli in vigore.
 */

const voce = (percorso: string, dove: VoceFusione['dove'], diverse: boolean, predefinita: VoceFusione['predefinita']): VoceFusione =>
  ({ percorso, etichetta: percorso, dove, diverse, predefinita } as VoceFusione)

const VOCI = [
  voce('chat/a', 'pc', false, 'carica'),
  voce('chat/b', 'drive', false, 'scarica'),
  voce('chat/c', 'entrambi', true, 'carica'),
  voce('chat/d', 'entrambi', false, 'salta')
]

describe('un tasto di gruppo', () => {
  it('«solo dal PC al Drive» carica dove si puo e lascia il resto', () => {
    expect(sceltePerTutte(VOCI, false, 'carica', {})).toEqual({
      'chat/a': 'carica', 'chat/b': 'salta', 'chat/c': 'carica', 'chat/d': 'salta'
    })
  })
  it('«unisci» rimette le predefinite del piano', () => {
    expect(sceltePerTutte(VOCI, false, 'predefinite', { 'chat/a': 'salta' })).toEqual({
      'chat/a': 'carica', 'chat/b': 'scarica', 'chat/c': 'carica', 'chat/d': 'salta'
    })
  })
  it('«tieni tutte e due» tocca solo le diverse e non sposta le altre', () => {
    const attuali = { 'chat/a': 'salta' as const, 'chat/b': 'scarica' as const }
    expect(sceltePerTutte(VOCI, true, 'copia', attuali)).toEqual({
      'chat/a': 'salta', 'chat/b': 'scarica', 'chat/c': 'copia', 'chat/d': 'salta'
    })
  })
})

describe('IL PUNTO: si vede quale tasto e in vigore', () => {
  it('appena letto il piano, «unisci» e acceso', () => {
    const attuali = sceltePerTutte(VOCI, false, 'predefinite', {})
    expect(gruppoInVigore(VOCI, false, 'predefinite', attuali)).toBe(true)
    expect(gruppoInVigore(VOCI, false, 'salta', attuali)).toBe(false)
  })
  it('dopo «lascia tutto», e acceso quello', () => {
    const attuali = sceltePerTutte(VOCI, false, 'salta', {})
    expect(gruppoInVigore(VOCI, false, 'salta', attuali)).toBe(true)
    expect(gruppoInVigore(VOCI, false, 'predefinite', attuali)).toBe(false)
  })
  it('una riga cambiata a mano spegne il tasto di gruppo', () => {
    const attuali = { ...sceltePerTutte(VOCI, false, 'predefinite', {}), 'chat/c': 'scarica' as const }
    expect(gruppoInVigore(VOCI, false, 'predefinite', attuali)).toBe(false)
  })
  it('senza voci nessun tasto e acceso', () => {
    expect(gruppoInVigore([], false, 'predefinite', {})).toBe(false)
  })
})

describe('il conto accanto al titolo', () => {
  it('dice quante vanno dove, con le scelte di adesso', () => {
    const attuali = sceltePerTutte(VOCI, false, 'predefinite', {})
    expect(riassunto(VOCI, attuali)).toEqual({ carica: 2, scarica: 1, copia: 0, salta: 1 })
    expect(riassuntoInParole(riassunto(VOCI, attuali))).toBe('2 sul Drive · 1 qui · 1 come sono')
  })
  it('tutto lasciato: lo dice', () => {
    expect(riassuntoInParole(riassunto(VOCI, sceltePerTutte(VOCI, false, 'salta', {})))).toBe('4 come sono')
    expect(riassuntoInParole(riassunto([], {}))).toBe('niente')
  })
})

describe('IL PUNTO 2: dove non c e niente da decidere, nessun tasto e acceso', () => {
  // «Adesso è tutto selezionato ma perché?»: 778 chat uguali di qua e di la',
  // ogni tasto «non cambiava niente», e si accendevano tutti e quattro.
  const uguali = [voce('chat/x', 'entrambi', false, 'salta'), voce('chat/y', 'entrambi', false, 'salta')]
  it('un gruppo di sole uguali non ha voci da decidere', () => {
    expect(vociDaDecidere(uguali, false)).toEqual([])
    expect(vociDaDecidere(VOCI, false).map((v) => v.percorso)).toEqual(['chat/a', 'chat/b', 'chat/c'])
  })
  it('e nessun tasto risulta in vigore', () => {
    const attuali = sceltePerTutte(uguali, false, 'predefinite', {})
    for (const a of ['predefinite', 'carica', 'scarica', 'salta'] as const) {
      expect(gruppoInVigore(uguali, false, a, attuali)).toBe(false)
    }
  })
  it('le uguali non contano nel giudizio sulle altre', () => {
    const misto = [...uguali, voce('chat/a', 'pc', false, 'carica')]
    const attuali = sceltePerTutte(misto, false, 'predefinite', {})
    expect(gruppoInVigore(misto, false, 'predefinite', attuali)).toBe(true)
    expect(gruppoInVigore(misto, false, 'salta', attuali)).toBe(false)
  })
})
