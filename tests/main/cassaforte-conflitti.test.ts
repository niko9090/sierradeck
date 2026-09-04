import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, utimesSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { archivioInMemoria } from '../../src/main/cassaforte/archivio'
import {
  salvaIncrementale, ripristinaIncrementale, manifestoVuoto, nomeCopiaConflitto, stessaFirma, type Manifesto
} from '../../src/main/cassaforte/incrementale'

/**
 * Due PC sullo stesso file, ognuno senza vedere l'altro. La regola: vince il
 * piu' recente; nei progetti l'altro resta accanto come copia. E un
 * ripristino non butta mai via il lavoro non ancora salvato.
 */
describe('i conflitti', () => {
  const maestra = randomBytes(32)
  const T = (s: number): number => Date.parse('2026-09-04T20:00:00.000Z') + s * 1000

  function cartella(): string { return mkdtempSync(join(tmpdir(), 'sd-confl-')) }
  function scrivi(dir: string, rel: string, testo: string, mtime: number): void {
    const p = join(dir, ...rel.split('/'))
    mkdirSync(join(p, '..'), { recursive: true })
    writeFileSync(p, testo)
    utimesSync(p, mtime / 1000, mtime / 1000)
  }
  const leggi = (dir: string, rel: string): string => readFileSync(join(dir, ...rel.split('/')), 'utf8')
  const copie = (dir: string, sotto = 'src'): string[] =>
    readdirSync(join(dir, sotto)).filter((n) => n.includes('.conflitto-')).sort()

  async function dueP() {
    const archivio = archivioInMemoria()
    const a = cartella(); const b = cartella()
    scrivi(a, 'src/x.ts', 'v1', T(0))
    const mA = await salvaIncrementale({
      radici: [{ prefisso: 'progetto-p', cartella: a }], maestra, archivio,
      manifestoPrec: manifestoVuoto(), adesso: '2026-09-04T20:00:01.000Z', pcNome: 'Torre'
    })
    const rB = await ripristinaIncrementale({ radici: [{ prefisso: 'progetto-p', cartella: b }], maestra, archivio })
    expect(rB.scritti).toBe(1)
    return { archivio, a, b, mA: mA.manifesto, mB: rB.manifesto as Manifesto }
  }

  it('un file ripristinato ha la firma del manifesto: non risale sul Drive per niente', async () => {
    const { archivio, b, mB } = await dueP()
    const di = await salvaIncrementale({
      radici: [{ prefisso: 'progetto-p', cartella: b }], maestra, archivio, manifestoPrec: mB, adesso: 'x', pcNome: 'Portatile'
    })
    expect(di.caricati).toBe(0)
    expect(stessaFirma({ size: 2, mtime: T(0) }, { size: 2, mtime: T(0) + 1 })).toBe(true)
    expect(stessaFirma({ size: 2, mtime: T(0) }, { size: 2, mtime: T(0) + 3 })).toBe(false)
  })

  it('al salvataggio, se ho scritto io per ultimo vinco e la versione del Drive resta accanto', async () => {
    const { archivio, a, b, mA, mB } = await dueP()
    scrivi(a, 'src/x.ts', 'di-A', T(10))
    await salvaIncrementale({ radici: [{ prefisso: 'progetto-p', cartella: a }], maestra, archivio, manifestoPrec: mA, adesso: '2026-09-04T20:00:11.000Z', pcNome: 'Torre' })
    scrivi(b, 'src/x.ts', 'di-B', T(20))
    const esito = await salvaIncrementale({
      radici: [{ prefisso: 'progetto-p', cartella: b }], maestra, archivio, manifestoPrec: mB, adesso: '2026-09-04T20:00:21.000Z', pcNome: 'Portatile'
    })
    expect(esito.conflitti).toHaveLength(1)
    expect(esito.conflitti[0]).toMatchObject({ percorso: 'progetto-p/src/x.ts', vinto: 'mio' })
    const copia = esito.conflitti[0]?.copia as string
    expect(copia).toBe('progetto-p/src/x.conflitto-drive-20260904-200021.ts')
    expect(leggi(b, 'src/x.ts')).toBe('di-B')
    expect(leggi(b, copia.slice('progetto-p/'.length))).toBe('di-A')
    // Sul Drive: x.ts e' quello di B, e la copia c'e' anche la'.
    expect(esito.manifesto.file[copia]).toBeDefined()
    const c = cartella()
    await ripristinaIncrementale({ radici: [{ prefisso: 'progetto-p', cartella: c }], maestra, archivio })
    expect(leggi(c, 'src/x.ts')).toBe('di-B')
    expect(copie(c)).toEqual(['x.conflitto-drive-20260904-200021.ts'])
  })

  it('al salvataggio, se il Drive e piu recente vince lui e la mia versione resta accanto col nome del mio PC', async () => {
    const { archivio, a, b, mA, mB } = await dueP()
    scrivi(b, 'src/x.ts', 'di-B', T(10))
    scrivi(a, 'src/x.ts', 'di-A', T(20))
    await salvaIncrementale({ radici: [{ prefisso: 'progetto-p', cartella: a }], maestra, archivio, manifestoPrec: mA, adesso: '2026-09-04T20:00:21.000Z', pcNome: 'Torre' })
    const esito = await salvaIncrementale({
      radici: [{ prefisso: 'progetto-p', cartella: b }], maestra, archivio, manifestoPrec: mB, adesso: '2026-09-04T20:00:31.000Z', pcNome: 'Portatile'
    })
    expect(esito.conflitti[0]).toMatchObject({ vinto: 'drive', copia: 'progetto-p/src/x.conflitto-portatile-20260904-200031.ts' })
    expect(leggi(b, 'src/x.ts')).toBe('di-A')
    expect(copie(b)).toEqual(['x.conflitto-portatile-20260904-200031.ts'])
    expect(leggi(b, 'src/x.conflitto-portatile-20260904-200031.ts')).toBe('di-B')
    // Il manifesto tiene la voce del Drive per x.ts, e la copia in piu'.
    expect(esito.manifesto.file['progetto-p/src/x.ts']?.mtime).toBe(T(20))
    expect(esito.manifesto.file['progetto-p/src/x.conflitto-portatile-20260904-200031.ts']).toBeDefined()
  })

  it('fuori dai progetti niente copie: vince il piu recente e basta', async () => {
    const archivio = archivioInMemoria()
    const a = cartella(); const b = cartella()
    scrivi(a, 'workspaces.json', '{"a":1}', T(0))
    const mA = await salvaIncrementale({ radici: [{ prefisso: 'sierradeck', cartella: a }], maestra, archivio, manifestoPrec: manifestoVuoto(), adesso: 'x' })
    await ripristinaIncrementale({ radici: [{ prefisso: 'sierradeck', cartella: b }], maestra, archivio })
    scrivi(a, 'workspaces.json', '{"a":2}', T(20))
    await salvaIncrementale({ radici: [{ prefisso: 'sierradeck', cartella: a }], maestra, archivio, manifestoPrec: mA.manifesto, adesso: 'y' })
    scrivi(b, 'workspaces.json', '{"b":1}', T(10))
    const esito = await salvaIncrementale({ radici: [{ prefisso: 'sierradeck', cartella: b }], maestra, archivio, manifestoPrec: mA.manifesto, adesso: 'z' })
    expect(esito.conflitti).toEqual([{ percorso: 'sierradeck/workspaces.json', vinto: 'drive' }])
    expect(readdirSync(b).filter((n) => n.includes('conflitto'))).toEqual([])
    expect(esito.manifesto.file['sierradeck/workspaces.json']?.mtime).toBe(T(20))
  })

  it('il salvataggio parte dal manifesto del Drive: due PC non si cancellano a vicenda', async () => {
    const { archivio, a, b, mA, mB } = await dueP()
    scrivi(a, 'src/a.ts', 'A', T(5))
    await salvaIncrementale({ radici: [{ prefisso: 'progetto-p', cartella: a }], maestra, archivio, manifestoPrec: mA, adesso: 'x', pcNome: 'Torre' })
    scrivi(b, 'src/b.ts', 'B', T(6))
    const esito = await salvaIncrementale({ radici: [{ prefisso: 'progetto-p', cartella: b }], maestra, archivio, manifestoPrec: mB, adesso: 'y', pcNome: 'Portatile' })
    expect(Object.keys(esito.manifesto.file).sort()).toEqual(['progetto-p/src/a.ts', 'progetto-p/src/b.ts', 'progetto-p/src/x.ts'])
    expect(esito.conflitti).toEqual([])
  })

  it('una modifica altrui vince sulla mia cancellazione; una cancellazione altrui toglie anche qui il file non toccato', async () => {
    const { archivio, a, b, mA, mB } = await dueP()
    scrivi(a, 'src/y.ts', 'Y', T(1))
    const mA2 = (await salvaIncrementale({ radici: [{ prefisso: 'progetto-p', cartella: a }], maestra, archivio, manifestoPrec: mA, adesso: 'x', pcNome: 'Torre' })).manifesto
    const rB = await ripristinaIncrementale({ radici: [{ prefisso: 'progetto-p', cartella: b }], maestra, archivio, manifestoPrec: mB })
    const mB2 = rB.manifesto as Manifesto
    // A modifica x.ts e cancella y.ts; B cancella x.ts.
    scrivi(a, 'src/x.ts', 'x-nuovo', T(30))
    const { unlinkSync } = await import('node:fs')
    unlinkSync(join(a, 'src', 'y.ts'))
    await salvaIncrementale({ radici: [{ prefisso: 'progetto-p', cartella: a }], maestra, archivio, manifestoPrec: mA2, adesso: 'y', pcNome: 'Torre' })
    unlinkSync(join(b, 'src', 'x.ts'))
    const esito = await salvaIncrementale({ radici: [{ prefisso: 'progetto-p', cartella: b }], maestra, archivio, manifestoPrec: mB2, adesso: 'z', pcNome: 'Portatile' })
    // x.ts resta sul Drive (A l'ha cambiato); y.ts sparisce anche da B.
    expect(esito.manifesto.file['progetto-p/src/x.ts']?.mtime).toBe(T(30))
    expect(esito.manifesto.file['progetto-p/src/y.ts']).toBeUndefined()
    expect(existsSync(join(b, 'src', 'y.ts'))).toBe(false)
    expect(esito.cancellati).toBe(0)
  })

  it('un ripristino tiene il lavoro non ancora salvato, e nel conflitto vince il piu recente', async () => {
    const { archivio, a, b, mA, mB } = await dueP()
    // B lavora su x.ts senza salvare; il Drive non e' cambiato: si tiene.
    scrivi(b, 'src/x.ts', 'lavoro-di-B', T(10))
    const r1 = await ripristinaIncrementale({ radici: [{ prefisso: 'progetto-p', cartella: b }], maestra, archivio, manifestoPrec: mB, pcNome: 'Portatile' })
    expect(r1.tenuti).toBe(1)
    expect(r1.scritti).toBe(0)
    expect(leggi(b, 'src/x.ts')).toBe('lavoro-di-B')
    // Poi A salva una versione piu' recente: conflitto, vince A, il lavoro di B resta accanto.
    scrivi(a, 'src/x.ts', 'di-A', T(20))
    await salvaIncrementale({ radici: [{ prefisso: 'progetto-p', cartella: a }], maestra, archivio, manifestoPrec: mA, adesso: 'x', pcNome: 'Torre' })
    const r2 = await ripristinaIncrementale({
      radici: [{ prefisso: 'progetto-p', cartella: b }], maestra, archivio, manifestoPrec: mB,
      pcNome: 'Portatile', adesso: '2026-09-04T20:00:40.000Z'
    })
    expect(r2.conflitti).toEqual([{ percorso: 'progetto-p/src/x.ts', vinto: 'drive', copia: 'progetto-p/src/x.conflitto-portatile-20260904-200040.ts' }])
    expect(leggi(b, 'src/x.ts')).toBe('di-A')
    expect(leggi(b, 'src/x.conflitto-portatile-20260904-200040.ts')).toBe('lavoro-di-B')
    // E se invece B fosse piu' recente, resterebbe il suo e la versione del Drive andrebbe accanto.
    const c = cartella()
    await ripristinaIncrementale({ radici: [{ prefisso: 'progetto-p', cartella: c }], maestra, archivio })
    scrivi(c, 'src/x.ts', 'di-C', T(50))
    const mC = r2.manifesto as Manifesto
    scrivi(a, 'src/x.ts', 'di-A-2', T(45))
    await salvaIncrementale({ radici: [{ prefisso: 'progetto-p', cartella: a }], maestra, archivio, manifestoPrec: r2.manifesto as Manifesto, adesso: 'x', pcNome: 'Torre' })
    const r3 = await ripristinaIncrementale({
      radici: [{ prefisso: 'progetto-p', cartella: c }], maestra, archivio, manifestoPrec: mC, pcNome: 'Terzo', adesso: '2026-09-04T20:01:00.000Z'
    })
    expect(r3.conflitti[0]).toMatchObject({ vinto: 'mio', copia: 'progetto-p/src/x.conflitto-drive-20260904-200100.ts' })
    expect(leggi(c, 'src/x.ts')).toBe('di-C')
    expect(leggi(c, 'src/x.conflitto-drive-20260904-200100.ts')).toBe('di-A-2')
  })

  it('elimina non tocca un file cambiato qui dopo l ultimo salvataggio', async () => {
    const { archivio, a, b, mA, mB } = await dueP()
    const { unlinkSync } = await import('node:fs')
    unlinkSync(join(a, 'src', 'x.ts'))
    await salvaIncrementale({ radici: [{ prefisso: 'progetto-p', cartella: a }], maestra, archivio, manifestoPrec: mA, adesso: 'x', pcNome: 'Torre' })
    scrivi(b, 'src/x.ts', 'ci-lavoro', T(10))
    const r = await ripristinaIncrementale({ radici: [{ prefisso: 'progetto-p', cartella: b }], maestra, archivio, manifestoPrec: mB, elimina: true })
    expect(r.eliminati).toBe(0)
    expect(r.tenuti).toBe(1)
    expect(leggi(b, 'src/x.ts')).toBe('ci-lavoro')
  })

  it('il nome della copia', () => {
    expect(nomeCopiaConflitto('progetto-p/src/main.ts', 'Torre di Nico', '2026-09-04T21:30:05.123Z'))
      .toBe('progetto-p/src/main.conflitto-torre-di-nico-20260904-213005.ts')
    expect(nomeCopiaConflitto('progetto-p/Makefile', 'drive', '2026-09-04T21:30:05Z'))
      .toBe('progetto-p/Makefile.conflitto-drive-20260904-213005')
    expect(nomeCopiaConflitto('progetto-p/.gitignore', '', '2026-09-04T21:30:05Z'))
      .toBe('progetto-p/.gitignore.conflitto-altro-pc-20260904-213005')
  })
})
