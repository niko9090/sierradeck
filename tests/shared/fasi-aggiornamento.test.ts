import { describe, it, expect } from 'vitest'
import {
  chiudiFasi, durataLeggibile, leggiAggiornamentoInCorso, leggiFasi, rigaRiepilogo, segnaPasso, testoFasi,
  SALVO_LE_CHAT_MS, type FaseAggiornamento
} from '../../src/shared/fasi-aggiornamento'

/**
 * Le fasi dell'aggiornamento con il tempo (0.84.3): scarico, salvo le chat,
 * installo, riparto. La riga è la stessa su PC, pagina e app; al ritorno una
 * riga di riepilogo va nella conversazione dell'autopilota.
 */
const t = (hhmmss: string): string => `2026-10-22T${hhmmss}.000Z`
const ms = (hhmmss: string): number => Date.parse(t(hhmmss))

describe('le fasi, una dopo l’altra', () => {
  it('aprire una fase chiude quella di prima', () => {
    let f: FaseAggiornamento[] = segnaPasso([], 'scarico', t('15:00:00'))
    f = chiudiFasi(f, t('15:00:40'))
    f = segnaPasso(f, 'salvo', t('15:28:51'))
    f = segnaPasso(f, 'installo', t('15:31:00'))
    expect(f).toEqual([
      { passo: 'scarico', dal: t('15:00:00'), fino: t('15:00:40') },
      { passo: 'salvo', dal: t('15:28:51'), fino: t('15:31:00') },
      { passo: 'installo', dal: t('15:31:00') }
    ])
  })

  it('la riga dice cosa è fatto, cosa succede da quanto, e cosa viene dopo', () => {
    const f: FaseAggiornamento[] = [
      { passo: 'scarico', dal: t('15:00:00'), fino: t('15:00:40') },
      { passo: 'salvo', dal: t('15:28:51') }
    ]
    expect(testoFasi(f, ms('15:30:51'))).toBe('Scaricato in 40 s · salvo le chat da 2 min (al massimo 5 min) · poi installo e riparto')
  })

  it('durante l’installazione', () => {
    const f: FaseAggiornamento[] = [
      { passo: 'scarico', dal: t('15:00:00'), fino: t('15:00:40') },
      { passo: 'salvo', dal: t('15:28:51'), fino: t('15:33:51') },
      { passo: 'installo', dal: t('15:33:51') }
    ]
    expect(testoFasi(f, ms('15:33:51'))).toBe('Scaricato in 40 s · chat salvate in 5 min · installo · poi riparto')
  })

  it('durate leggibili', () => {
    expect(durataLeggibile(40_000)).toBe('40 s')
    expect(durataLeggibile(5 * 60_000)).toBe('5 min')
    expect(durataLeggibile(2 * 60 * 60_000)).toBe('2 h')
    expect(durataLeggibile(65 * 60_000)).toBe('1 h 5 min')
  })

  it('le chat hanno al massimo 5 minuti', () => {
    expect(SALVO_LE_CHAT_MS).toBe(5 * 60_000)
  })

  it('da JSON di un’altra versione non solleva mai', () => {
    expect(leggiFasi('niente')).toEqual([])
    expect(leggiFasi([{ passo: 'boh', dal: t('15:00:00') }, { passo: 'salvo', dal: 'ieri' }, { passo: 'installo', dal: t('15:00:00') }])).toEqual([{ passo: 'installo', dal: t('15:00:00') }])
    expect(leggiAggiornamentoInCorso(null)).toBeUndefined()
    expect(leggiAggiornamentoInCorso({ daVersione: '0.84.2' })).toBeUndefined()
  })
})

describe('la riga di riepilogo nella conversazione dopo la ripresa', () => {
  it('con le fasi, il tempo totale, le chat salvate e quelle interrotte', () => {
    const riga = rigaRiepilogo({
      daVersione: '0.84.2',
      aVersione: '0.84.3',
      fasi: [
        { passo: 'scarico', dal: t('15:00:00'), fino: t('15:00:40') },
        { passo: 'salvo', dal: t('15:28:51'), fino: t('15:33:51') },
        { passo: 'installo', dal: t('15:33:51'), fino: t('15:35:00') },
        { passo: 'riparto', dal: t('15:35:00'), fino: t('15:35:30') }
      ],
      salvate: 3,
      provate: 3,
      interrotte: 1
    }, 1)
    expect(riga).toBe(
      'Aggiornato dalla 0.84.2 alla 0.84.3 in 7 min (scaricato prima, chat salvate in 5 min, installato in 1 min, ripartito in 30 s).' +
      ' Lavoro di 3 chat salvato sul loro ramo.' +
      ' 1 chat non aveva finito il turno in 5 minuti: riparte dal suo ultimo salvataggio.' +
      ' Riprendo il lavoro da dove eravamo.'
    )
  })
})
