import { describe, it, expect, beforeEach } from 'vitest'
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriQuaderno } from '../../src/main/quaderno-store'
import { anteprimaRiordino, apriQuadernoLezioni, riordinaQuaderno, svuotaRecuperoQuaderno, GIORNI_RECUPERO_QUADERNO } from '../../src/main/quaderno-lezioni-store'
import { CARTELLA_QUADERNO, SOTTOCARTELLA } from '@shared/quaderno'
import { TITOLO_REGOLE } from '@shared/quaderno-lezioni'

/** P2 (30/10): lezioni.md e decisioni.md sul disco, e «Riordina il quaderno». Tutto in cartelle temporanee. */

const ADESSO = '2026-10-30T10:00:00.000Z'
let cwd: string
let dati: string
const dir = (): string => join(cwd, CARTELLA_QUADERNO, SOTTOCARTELLA)

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'sd-lezioni-'))
  dati = mkdtempSync(join(tmpdir(), 'sd-lezioni-dati-'))
})

describe('lezioni e decisioni', () => {
  it('le lezioni si annotano senza doppioni, in un file solo', () => {
    const q = apriQuadernoLezioni(() => ADESSO)
    expect(q.annota(cwd, [{ tag: 'build', testo: 'il build di Android vuole Java 17 e non la 21' }])).toEqual({ nuove: 1, confermate: 0 })
    expect(q.annota(cwd, [{ tag: 'build', testo: 'Il build di Android vuole Java 17, e non la 21' }], '2026-11-02T10:00:00.000Z')).toEqual({ nuove: 0, confermate: 1 })
    expect(readdirSync(dir())).toEqual(['lezioni.md'])
    expect(readFileSync(join(dir(), 'lezioni.md'), 'utf8')).toContain('confermata 2×, ultima 2026-11-02')
  })

  it('le decisioni di Nicholas vanno in decisioni.md, dalla meno recente', () => {
    const q = apriQuadernoLezioni(() => ADESSO)
    q.decidi(cwd, 'la coda resta sempre visibile in alto', '2026-10-02T10:00:00.000Z')
    q.decidi(cwd, 'il tema scuro è quello di serie', '2026-10-01T10:00:00.000Z')
    expect(q.decisioni(cwd).map((d) => d.testo)).toEqual(['il tema scuro è quello di serie', 'la coda resta sempre visibile in alto'])
    expect(q.indice(cwd)).toContain('la coda resta sempre visibile')
  })
})

describe('«Riordina il quaderno»', () => {
  const scrivi = (titolo: string, corpo: string, tag: string[] = [], file?: string): void => { apriQuaderno(() => ADESSO).scrivi(cwd, { titolo, corpo, tag, ...(file !== undefined ? { file } : {}) }) }

  it('l’anteprima non tocca niente', () => {
    scrivi('Build Android', 'Il build di Android vuole Java 17 e non la 21.', ['android'], 'build-android-1.md')
    scrivi('Build Android', 'Il build di Android vuole Java 17 e non la 21!', ['android'], 'build-android-2.md')
    const prima = readdirSync(dir()).sort()
    const a = anteprimaRiordino(cwd, ADESSO)
    expect(a).toMatchObject({ note: 2, voci: 1, regole: 0 })
    expect(a.frase).toBe('2 note diventano 1 voce.')
    expect(readdirSync(dir()).sort()).toEqual(prima)
    expect(existsSync(join(dati, 'recupero-quaderno'))).toBe(false)
  })

  it('scrive i due file, sposta gli originali nel recupero per 30 giorni, le regole di Nicholas parola per parola', () => {
    const regola = 'Prima la verifica completa, poi il tag.\n\n«Mai più una release rotta» — parole sue.'
    scrivi('Pubblicare una release — regola di Nicholas', regola, ['release'])
    scrivi('Build Android', 'Il build di Android vuole Java 17 e non la 21.', ['android'], 'build-android-1.md')
    scrivi('Build Android', 'Il build di Android vuole Java 17 e non la 21!', ['android'], 'build-android-2.md')
    apriQuaderno(() => ADESSO).scrivi(cwd, { titolo: 'Lista lavori', corpo: '- [ ] una cosa', file: 'lista-lavori.md' })
    const e = riordinaQuaderno(cwd, dati, () => ADESSO)
    expect(e).toMatchObject({ ok: true, note: 3, spostate: 3, regole: 1 })
    expect(readdirSync(dir()).sort()).toEqual(['decisioni.md', 'lezioni.md', 'lista-lavori.md'])
    const decisioni = readFileSync(join(dir(), 'decisioni.md'), 'utf8')
    expect(decisioni).toContain(`## ${TITOLO_REGOLE}`)
    expect(decisioni).toContain(regola)
    // Gli originali, interi, nel recupero.
    expect(e.recupero).toBeDefined()
    expect(readdirSync(e.recupero as string).filter((n) => n.endsWith('.md'))).toHaveLength(3)
    const registro = JSON.parse(readFileSync(join(dati, 'recupero-quaderno.json'), 'utf8')) as { voci: { scadeIl: string; file: string[] }[] }
    expect(registro.voci[0]?.scadeIl.slice(0, 10)).toBe('2026-11-29')
    expect(e.messaggio).toMatch(/recupero fino al 2026-11-29/)
    // Rifatto: niente da riordinare, e i file non si perdono.
    const ancora = riordinaQuaderno(cwd, dati, () => ADESSO)
    expect(ancora.note).toBe(0)
    expect(readFileSync(join(dir(), 'decisioni.md'), 'utf8')).toContain(regola)
  })

  it('il recupero si svuota solo dopo 30 giorni, e solo dentro la sua cartella', () => {
    scrivi('Una nota', 'Una cosa da ricordare per il futuro del progetto.')
    const e = riordinaQuaderno(cwd, dati, () => ADESSO)
    const ora = Date.parse(ADESSO)
    expect(svuotaRecuperoQuaderno(dati, ora + (GIORNI_RECUPERO_QUADERNO - 1) * 86_400_000)).toBe(0)
    expect(existsSync(e.recupero as string)).toBe(true)
    expect(svuotaRecuperoQuaderno(dati, ora + (GIORNI_RECUPERO_QUADERNO + 1) * 86_400_000)).toBe(1)
    expect(existsSync(e.recupero as string)).toBe(false)
    // Il quaderno distillato resta.
    expect(existsSync(join(dir(), 'lezioni.md'))).toBe(true)
    expect(svuotaRecuperoQuaderno(dati, ora + 90 * 86_400_000)).toBe(0)
  })
})
