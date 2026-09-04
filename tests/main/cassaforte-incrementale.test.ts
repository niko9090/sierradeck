import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { archivioInMemoria } from '../../src/main/cassaforte/archivio'
import { salvaIncrementale, ripristinaIncrementale, manifestoVuoto } from '../../src/main/cassaforte/incrementale'
import type { Progresso } from '../../src/main/cassaforte/motore'

/**
 * La sincronizzazione incrementale conta i **file**, non i byte: un file alla
 * volta, cifrato e caricato. Il pannello deve saperlo, o divide per un milione
 * e scrive «0,0 MB / 0,0 MB» con la barra che avanza — visto sul campo
 * ripristinando dal Drive.
 */
describe('il progresso della sincronizzazione incrementale', () => {
  const maestra = randomBytes(32)

  function cartellaCon(nomi: string[]): string {
    const dir = mkdtempSync(join(tmpdir(), 'sd-incr-'))
    for (const n of nomi) {
      mkdirSync(join(dir, 'p'), { recursive: true })
      writeFileSync(join(dir, 'p', n), `contenuto di ${n}`)
    }
    return dir
  }

  it('salvataggio e ripristino contano i file e lo dicono', async () => {
    const archivio = archivioInMemoria()
    const sorgente = cartellaCon(['a.jsonl', 'b.jsonl', 'c.jsonl'])
    const eventi: Progresso[] = []

    const esito = await salvaIncrementale({
      radici: [{ prefisso: 'claude', cartella: sorgente }],
      maestra, archivio, manifestoPrec: manifestoVuoto(),
      adesso: '2026-09-04T12:00:00.000Z',
      onProgresso: (p) => { eventi.push(p) }
    })
    expect(esito.caricati).toBe(3)
    const carichi = eventi.filter((e) => e.fase === 'carico')
    expect(carichi.length).toBe(3)
    expect(carichi.at(-1)).toEqual({ fase: 'carico', fatto: 3, totale: 3, unita: 'file' })

    eventi.length = 0
    const destinazione = mkdtempSync(join(tmpdir(), 'sd-incr-dest-'))
    const r = await ripristinaIncrementale({
      radici: [{ prefisso: 'claude', cartella: destinazione }],
      maestra, archivio,
      onProgresso: (p) => { eventi.push(p) }
    })
    expect(r.trovato).toBe(true)
    expect(r.scritti).toBe(3)
    const scarichi = eventi.filter((e) => e.fase === 'scarico')
    expect(scarichi.at(-1)).toEqual({ fase: 'scarico', fatto: 3, totale: 3, unita: 'file' })
    expect(existsSync(join(destinazione, 'p', 'b.jsonl'))).toBe(true)
    expect(readFileSync(join(destinazione, 'p', 'b.jsonl'), 'utf8')).toBe('contenuto di b.jsonl')
  })
})
