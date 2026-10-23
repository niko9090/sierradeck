import { describe, it, expect } from 'vitest'
import { dovEOpzione } from '../../src/main/client-rotte'
import { tagliaIntero, TAGLIO_OPZIONE_BATTITO } from '@shared/posta'
import type { Scelta } from '@shared/scelte-terminale'

/**
 * Caso limite del ricollaudo c-94 (23/10, `collaudo-domande-risposte-0-84-1.md`):
 * un'opzione più lunga di 200 caratteri con un emoji nelle posizioni 199-200.
 * Il taglio del battito a 200 unità UTF-16 lasciava mezzo emoji; dall'app il
 * mezzo carattere diventava «?» e ogni tocco tornava 409.
 */
const emoji = '\u{1F680}' // fuori dal piano base: due unità UTF-16
const lunga = `${'a'.repeat(TAGLIO_OPZIONE_BATTITO - 1)}${emoji} e poi il resto dell’opzione, oltre il taglio`
const scelta = (testi: string[]): Scelta => ({ opzioni: testi.map((testo, i) => ({ numero: i + 1, testo })) } as unknown as Scelta)

/** Come viaggia un testo dall'app: UTF-8, dove una surrogata sola diventa un altro carattere. */
const inUtf8 = (t: string): string => Buffer.from(t, 'utf8').toString('utf8')

describe('opzione con un emoji tagliato al 200° carattere', () => {
  it('il taglio non spezza un carattere: niente surrogate sole, e resta l’inizio dell’opzione', () => {
    const t = tagliaIntero(lunga, TAGLIO_OPZIONE_BATTITO)
    expect(t.length).toBe(TAGLIO_OPZIONE_BATTITO - 1)
    expect(lunga.startsWith(t)).toBe(true)
    expect(inUtf8(t)).toBe(t)
  })

  it('un taglio che non cade in mezzo a un emoji resta a 200, e i testi corti non cambiano', () => {
    const t = tagliaIntero(`${'b'.repeat(250)}`, TAGLIO_OPZIONE_BATTITO)
    expect(t.length).toBe(TAGLIO_OPZIONE_BATTITO)
    expect(tagliaIntero(`ok ${emoji}`, TAGLIO_OPZIONE_BATTITO)).toBe(`ok ${emoji}`)
  })

  it('il tocco dall’app, passato in UTF-8, trova l’opzione sul PC della chat', () => {
    const s = scelta(['Sì', lunga, 'No'])
    expect(dovEOpzione(s, inUtf8(tagliaIntero(lunga, TAGLIO_OPZIONE_BATTITO)))).toBe(1)
  })

  it('199 caratteri che non sono un taglio a metà emoji non scelgono a caso', () => {
    const s = scelta([`${'c'.repeat(199)}d e altro`, 'No'])
    expect(dovEOpzione(s, 'c'.repeat(199))).toBe(-1)
  })
})
