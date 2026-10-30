import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync, utimesSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { archivioInMemoria, type Archivio } from '../../src/main/cassaforte/archivio'
import {
  salvaIncrementale, ripristinaIncrementale, manifestoVuoto, nomeDi, togliBlob, NOME_LAPIDI, type Manifesto
} from '../../src/main/cassaforte/incrementale'

/**
 * D1: la lapide toglieva da qui un file deciso all'inizio del giro, anche se
 * nel frattempo (durante i caricamenti) lo stavi modificando.
 * D5: il blob di un file tolto si cancellava per nome, anche se un altro PC
 * l'aveva appena ricaricato.
 */
const maestra = randomBytes(32)
const T = (s: number): number => Date.parse('2026-10-30T10:00:00.000Z') + s * 1000
const cartella = (): string => mkdtempSync(join(tmpdir(), 'sd-lapidi-'))
function scrivi(dir: string, rel: string, testo: string, mtime: number): void {
  const p = join(dir, rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, testo)
  utimesSync(p, mtime / 1000, mtime / 1000)
}

type Pc = { id: string; dir: string; archivio: Archivio; prec: Manifesto }
async function salva(p: Pc, archivio: Archivio = p.archivio): Promise<Awaited<ReturnType<typeof salvaIncrementale>>> {
  const esito = await salvaIncrementale({
    radici: [{ prefisso: 'progetto-p', cartella: p.dir }], maestra, archivio,
    manifestoPrec: p.prec, adesso: new Date(T(100)).toISOString(), pcNome: p.id, proprietario: p.id
  })
  const file: Manifesto['file'] = {}
  for (const [k, v] of Object.entries(esito.manifestoLocale.file)) if (existsSync(join(p.dir, k.slice('progetto-p/'.length)))) file[k] = v
  p.prec = { ...esito.manifestoLocale, file }
  return esito
}

/** A toglie x.ts (lapide); B ce l'ha uguale, e in questo giro carica anche y.ts. */
async function preparaLapide(): Promise<{ archivio: Archivio; b: Pc }> {
  const archivio = archivioInMemoria()
  const a: Pc = { id: 'torre', dir: cartella(), archivio, prec: manifestoVuoto() }
  scrivi(a.dir, 'src/x.ts', 'XXXX', T(1))
  await salva(a)
  const b: Pc = { id: 'portatile', dir: cartella(), archivio, prec: manifestoVuoto() }
  const r = await ripristinaIncrementale({ radici: [{ prefisso: 'progetto-p', cartella: b.dir }], maestra, archivio })
  b.prec = r.manifesto as Manifesto
  unlinkSync(join(a.dir, 'src', 'x.ts'))
  expect((await salva(a)).cancellati).toBe(1)
  scrivi(b.dir, 'src/y.ts', 'Y', T(5))
  return { archivio, b }
}

/** Un archivio che, al primo caricamento di un blob, esegue `durante`. */
function conGancio(dentro: Archivio, durante: () => void): Archivio {
  let fatto = false
  return {
    ...dentro,
    carica: async (nome, blocco, p) => {
      if (!fatto) { fatto = true; durante() }
      await dentro.carica(nome, blocco, p)
    }
  }
}

describe('D1: la lapide non toglie un file cambiato durante il salvataggio', () => {
  it('senza modifiche il file si toglie come prima', async () => {
    const { b } = await preparaLapide()
    const eb = await salva(b)
    expect(eb.toltiQui).toEqual(['progetto-p/src/x.ts'])
    expect(existsSync(join(b.dir, 'src', 'x.ts'))).toBe(false)
  })

  it('modificato (dimensione e data) mentre salivano gli altri file: resta, e il salto si scrive', async () => {
    const { archivio, b } = await preparaLapide()
    const avviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const eb = await salva(b, conGancio(archivio, () => scrivi(b.dir, 'src/x.ts', 'XXXX con la modifica', T(60))))
    expect(eb.toltiQui).toEqual([])
    expect(readFileSync(join(b.dir, 'src', 'x.ts'), 'utf8')).toBe('XXXX con la modifica')
    expect(avviso.mock.calls.some((c) => String(c[0]).includes('progetto-p/src/x.ts') && String(c[0]).includes('lapide'))).toBe(true)
    avviso.mockRestore()
    // Al giro dopo la modifica risale: vince sulla lapide.
    const eb2 = await salva(b)
    expect(eb2.caricati).toBe(1)
    expect(existsSync(join(b.dir, 'src', 'x.ts'))).toBe(true)
  })

  it('stessa dimensione e stessa data ma contenuto diverso: l impronta lo trattiene', async () => {
    const { archivio, b } = await preparaLapide()
    const disco = join(b.dir, 'src', 'x.ts')
    const prima = statSync(disco).mtimeMs
    const avviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const eb = await salva(b, conGancio(archivio, () => {
      writeFileSync(disco, 'ABCD')
      utimesSync(disco, prima / 1000, prima / 1000)
    }))
    avviso.mockRestore()
    expect(eb.toltiQui).toEqual([])
    expect(readFileSync(disco, 'utf8')).toBe('ABCD')
  })
})

describe('D5: il blob si toglie per id e versione, non per nome', () => {
  it('un altro PC ricarica lo stesso percorso dopo il manifesto: il suo blob resta', async () => {
    const archivio = archivioInMemoria()
    const a: Pc = { id: 'torre', dir: cartella(), archivio, prec: manifestoVuoto() }
    scrivi(a.dir, 'src/x.ts', 'X', T(1))
    await salva(a)
    unlinkSync(join(a.dir, 'src', 'x.ts'))
    const nome = nomeDi('progetto-p/src/x.ts')
    let armato = true
    const conAltroPc: Archivio = {
      ...archivio,
      caricaSe: async (n, blocco, attesa) => {
        const info = await (archivio.caricaSe as NonNullable<Archivio['caricaSe']>)(n, blocco, attesa)
        // Subito dopo il manifesto, l'altro PC ricarica x.ts.
        if (armato && n !== NOME_LAPIDI) { armato = false; await archivio.carica(nome, Buffer.from('suo')) }
        return info
      }
    }
    const avviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const ea = await salva(a, conAltroPc)
    avviso.mockRestore()
    expect(ea.cancellati).toBe(1)
    expect(armato).toBe(false)
    expect((await archivio.scarica(nome))?.toString()).toBe('suo')
  })

  it('senza nessuno in mezzo il blob si toglie, per id quando l archivio lo sa fare', async () => {
    const archivio = archivioInMemoria()
    await archivio.carica('b1', Buffer.from('x'))
    const vista = await archivio.info?.('b1')
    const perId = vi.fn(async (id: string) => { await archivio.cancella(id) })
    expect(await togliBlob({ ...archivio, cancellaId: perId }, 'b1', vista, 'p')).toBe(true)
    expect(perId).toHaveBeenCalledWith(vista?.id)
    expect(await archivio.scarica('b1')).toBeUndefined()
  })

  it('se prima del manifesto non si e potuto vedere il blob, si lascia orfano', async () => {
    const archivio = archivioInMemoria()
    await archivio.carica('b1', Buffer.from('x'))
    const avviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(await togliBlob(archivio, 'b1', null, 'p')).toBe(false)
    avviso.mockRestore()
    expect(await archivio.scarica('b1')).toBeDefined()
  })
})
