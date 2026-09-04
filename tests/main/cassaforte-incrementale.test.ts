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

  it('il ripristino in due tempi: prima l assetto, poi i progetti', async () => {
    const archivio = archivioInMemoria()
    const sorgente = cartellaCon(['a.jsonl'])
    const progetto = cartellaCon(['main.ts'])
    await salvaIncrementale({
      radici: [{ prefisso: 'chat', cartella: sorgente }, { prefisso: 'progetto-p1', cartella: progetto }],
      maestra, archivio, manifestoPrec: manifestoVuoto(), adesso: '2026-09-04T12:00:00.000Z'
    })
    const destChat = mkdtempSync(join(tmpdir(), 'sd-incr-dest-'))
    const primo = await ripristinaIncrementale({
      radici: [{ prefisso: 'chat', cartella: destChat }], maestra, archivio,
      soloPrefissi: (p) => !p.startsWith('progetto-')
    })
    expect(primo.scritti).toBe(1)
    expect(existsSync(join(destChat, 'p', 'a.jsonl'))).toBe(true)
    const destProgetto = mkdtempSync(join(tmpdir(), 'sd-incr-prog-'))
    const secondo = await ripristinaIncrementale({
      radici: [{ prefisso: 'progetto-p1', cartella: destProgetto }], maestra, archivio,
      soloPrefissi: (p) => p.startsWith('progetto-')
    })
    expect(secondo.scritti).toBe(1)
    expect(existsSync(join(destProgetto, 'p', 'main.ts'))).toBe(true)
  })

  it('un PC senza il progetto di un altro non lo cancella dal Drive', async () => {
    // Il caso pericoloso: PC B salva senza avere mai ripristinato il progetto
    // di PC A. Per B quei file «non ci sono» — ma non sono suoi, e non sono
    // spariti: non si toccano.
    const archivio = archivioInMemoria()
    const progettoA = cartellaCon(['main.ts'])
    const chatA = cartellaCon(['a.jsonl'])
    const m1 = await salvaIncrementale({
      radici: [{ prefisso: 'chat', cartella: chatA }, { prefisso: 'progetto-p1', cartella: progettoA }],
      maestra, archivio, manifestoPrec: manifestoVuoto(), adesso: '2026-09-04T12:00:00.000Z'
    })
    // PC B: ha solo le sue chat (una nuova), niente progetti.
    const chatB = cartellaCon(['a.jsonl', 'b.jsonl'])
    const m2 = await salvaIncrementale({
      radici: [{ prefisso: 'chat', cartella: chatB }],
      maestra, archivio, manifestoPrec: m1.manifesto, adesso: '2026-09-04T13:00:00.000Z'
    })
    expect(m2.cancellati).toBe(0)
    expect(Object.keys(m2.manifesto.file).sort()).toEqual(['chat/p/a.jsonl', 'chat/p/b.jsonl', 'progetto-p1/p/main.ts'])
    // Mentre un file davvero tolto da una radice **sua** si cancella.
    const chatB2 = cartellaCon(['b.jsonl'])
    const m3 = await salvaIncrementale({
      radici: [{ prefisso: 'chat', cartella: chatB2 }],
      maestra, archivio, manifestoPrec: m2.manifesto, adesso: '2026-09-04T14:00:00.000Z'
    })
    expect(m3.cancellati).toBe(1)
    expect(m3.manifesto.file['progetto-p1/p/main.ts']).toBeDefined()
  })
})
