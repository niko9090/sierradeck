import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import {
  mettiAlSicuroLoStato, daCopiare, copieDaPotare, leggiStampo, nomeCopia,
  NOME_STAMPO, CARTELLA_COPIE
} from '../../src/main/copie-di-versione'

function dati(): string {
  const d = mkdtempSync(join(tmpdir(), 'sd-copie-'))
  writeFileSync(join(d, 'workspaces.json'), '{"versione":1,"workspace":[]}')
  writeFileSync(join(d, 'istantanee.json'), '{"versione":2,"istantanee":[]}')
  writeFileSync(join(d, 'index.db'), 'non-un-json')
  mkdirSync(join(d, 'autopiloti'))
  writeFileSync(join(d, 'autopiloti', 'a1.json'), '{"id":"a1"}')
  mkdirSync(join(d, 'log'))
  writeFileSync(join(d, 'log', 'x.log'), 'riga')
  return d
}

/**
 * Al primo avvio di una versione nuova, una copia di tutto lo stato.
 *
 * È la rete sotto le migrazioni alla lettura: quando un campo cambia nome e il
 * lettore nuovo non lo trova, com'erano i file prima è ancora sul disco.
 */
describe('mettiAlSicuroLoStato', () => {
  it('copia i file di stato, non le cache, e scrive lo stampo', () => {
    const d = dati()
    const esito = mettiAlSicuroLoStato(d, '0.12.50', new Date('2026-09-03T10:00:00Z'))
    expect(esito.fatta).toBe(true)
    expect(esito.da).toBe('sconosciuta')
    expect(esito.file).toBe(3)
    expect(esito.errori).toEqual([])
    const cartella = join(d, CARTELLA_COPIE, esito.cartella ?? '')
    expect(existsSync(join(cartella, 'workspaces.json'))).toBe(true)
    expect(existsSync(join(cartella, 'autopiloti', 'a1.json'))).toBe(true)
    expect(existsSync(join(cartella, 'index.db'))).toBe(false)
    expect(existsSync(join(cartella, 'log'))).toBe(false)
    expect(leggiStampo(d)).toEqual({ versione: '0.12.50', quando: '2026-09-03T10:00:00.000Z' })
  })

  it('la seconda volta con la stessa versione non fa niente', () => {
    const d = dati()
    mettiAlSicuroLoStato(d, '0.12.50')
    const seconda = mettiAlSicuroLoStato(d, '0.12.50')
    expect(seconda.fatta).toBe(false)
    expect(readdirSync(join(d, CARTELLA_COPIE))).toHaveLength(1)
  })

  it('la copia porta il nome della versione da cui si viene', () => {
    const d = dati()
    mettiAlSicuroLoStato(d, '0.12.44', new Date('2026-08-30T08:00:00Z'))
    const esito = mettiAlSicuroLoStato(d, '0.12.49', new Date('2026-09-03T10:00:00Z'))
    expect(esito.da).toBe('0.12.44')
    expect(esito.cartella).toBe('0.12.44-20260903-100000')
    expect(leggiStampo(d)?.precedente).toBe('0.12.44')
  })

  it('la copia è quella di prima, non quella riscritta dopo', () => {
    // Il senso di tutto: la versione nuova può riscrivere `workspaces.json`
    // vuoto; la copia deve avere il contenuto della vecchia.
    const d = dati()
    writeFileSync(join(d, 'workspaces.json'), '{"versione":1,"workspace":[{"nome":"lavoro"}]}')
    const esito = mettiAlSicuroLoStato(d, '0.12.49')
    writeFileSync(join(d, 'workspaces.json'), '{"versione":1,"workspace":[]}')
    const copia = readFileSync(join(d, CARTELLA_COPIE, esito.cartella ?? '', 'workspaces.json'), 'utf8')
    expect(copia).toContain('lavoro')
  })

  it('tiene le copie più recenti e toglie le altre', () => {
    const d = dati()
    for (let i = 1; i <= 5; i += 1) {
      mettiAlSicuroLoStato(d, `0.12.4${i}`, new Date(`2026-08-31T0${i}:00:00Z`))
    }
    const rimaste = readdirSync(join(d, CARTELLA_COPIE)).sort()
    expect(rimaste).toHaveLength(3)
    expect(rimaste.some((n) => n.startsWith('sconosciuta-'))).toBe(false)
  })

  it('uno stampo illeggibile vale come «sconosciuta», e si rifà la copia', () => {
    const d = dati()
    writeFileSync(join(d, NOME_STAMPO), '{ rotto')
    const esito = mettiAlSicuroLoStato(d, '0.12.49')
    expect(esito.fatta).toBe(true)
    expect(esito.da).toBe('sconosciuta')
  })

  it('una cartella dati vuota non produce una copia vuota', () => {
    const d = mkdtempSync(join(tmpdir(), 'sd-copie-vuota-'))
    const esito = mettiAlSicuroLoStato(d, '0.12.49')
    expect(esito.fatta).toBe(true)
    expect(esito.file).toBe(0)
    expect(esito.cartella).toBeUndefined()
    expect(existsSync(join(d, NOME_STAMPO))).toBe(true)
  })
})

describe('daCopiare / copieDaPotare / nomeCopia', () => {
  it('sceglie i json in cima e gli autopiloti, mai lo stampo né le copie', () => {
    const d = dati()
    writeFileSync(join(d, NOME_STAMPO), '{"versione":"x"}')
    mkdirSync(join(d, CARTELLA_COPIE, 'vecchia'), { recursive: true })
    writeFileSync(join(d, CARTELLA_COPIE, 'vecchia', 'workspaces.json'), '{}')
    expect(daCopiare(d)).toEqual([`autopiloti${sep}a1.json`, 'istantanee.json', 'workspaces.json'])
  })

  it('pota per data, non per versione', () => {
    // «0.9.50» viene prima di «0.12.1» alfabeticamente ma dopo nel tempo: a
    // contare è la data in coda al nome.
    const nomi = ['0.12.1-20260801-100000', '0.9.50-20260901-100000', '0.12.48-20260902-100000', 'sconosciuta-20260701-100000']
    expect(copieDaPotare(nomi, 2)).toEqual(['sconosciuta-20260701-100000', '0.12.1-20260801-100000'])
    expect(copieDaPotare(nomi, 10)).toEqual([])
  })

  it('il nome della copia è leggibile e ordinabile', () => {
    expect(nomeCopia('0.12.44', new Date('2026-09-03T10:05:09.123Z'))).toBe('0.12.44-20260903-100509')
  })
})
