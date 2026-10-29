import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes, createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { archivioInMemoria } from '../../src/main/cassaforte/archivio'
import { salvaIncrementale, ripristinaIncrementale, manifestoVuoto, nomeDi, chatViva } from '../../src/main/cassaforte/incrementale'
import { leggiPerCaricare } from '../../src/main/cassaforte/raccolta'
import { daComprimere, spacchetta, SEGNO } from '../../src/main/cassaforte/compressione'
import { decifra } from '../../src/main/cassaforte/cifratura'

/**
 * Il salvataggio automatico e le chat vive: una trascrizione aperta cambia a
 * ogni messaggio e arriva a centinaia di MB, e ricaricarla intera ogni cinque
 * minuti macinava gigabyte. Si rimanda finche' tace, con un tetto di byte per
 * giro, e cio' che sale si legge a flusso — nel formato di sempre.
 */

const maestra = randomBytes(32)
const MINUTO = 60_000

function cartella(): string {
  return mkdtempSync(join(tmpdir(), 'sd-vive-'))
}

function scrivi(dir: string, rel: string, contenuto: string | Buffer, mtimeMs?: number): string {
  const f = join(dir, ...rel.split('/'))
  mkdirSync(join(f, '..'), { recursive: true })
  writeFileSync(f, contenuto)
  if (mtimeMs !== undefined) utimesSync(f, mtimeMs / 1000, mtimeMs / 1000)
  return f
}

describe('le chat vive nel salvataggio automatico', () => {
  it('una chat scritta da poco si rimanda, e sale quando tace', async () => {
    const archivio = archivioInMemoria()
    const chat = cartella()
    const assetto = cartella()
    const ora = Date.now()
    scrivi(chat, 'p/viva.jsonl', '{"type":"user"}\n', ora - 2 * MINUTO)
    scrivi(chat, 'p/ferma.jsonl', '{"type":"user","ferma":true}\n', ora - 30 * MINUTO)
    scrivi(assetto, 'impostazioni.json', '{"a":1}', ora - MINUTO)
    const radici = [{ prefisso: 'sierradeck', cartella: assetto }, { prefisso: 'chat', cartella: chat }]
    const regola = { quieteMs: 10 * MINUTO, ritardoMassimoMs: 60 * MINUTO }

    const primo = await salvaIncrementale({
      radici, maestra, archivio, manifestoPrec: manifestoVuoto(), adesso: '2026-10-29T10:00:00.000Z',
      rimandaVive: { ...regola, ora }
    })
    // L'assetto sale anche se appena scritto: si rimandano solo le chat.
    expect(primo.caricati).toBe(2)
    expect(primo.rimandati).toBe(1)
    expect(Object.keys(primo.manifesto.file).sort()).toEqual(['chat/p/ferma.jsonl', 'sierradeck/impostazioni.json'])

    // Undici minuti dopo la chat tace: sale, e solo lei.
    const secondo = await salvaIncrementale({
      radici, maestra, archivio, manifestoPrec: primo.manifesto, adesso: '2026-10-29T10:11:00.000Z',
      rimandaVive: { ...regola, ora: ora + 11 * MINUTO }
    })
    expect(secondo.caricati).toBe(1)
    expect(secondo.rimandati).toBe(0)
    expect(secondo.manifesto.file['chat/p/viva.jsonl']).toBeDefined()

    // E si ripristina come sempre.
    const dest = cartella()
    const r = await ripristinaIncrementale({ radici: [{ prefisso: 'chat', cartella: dest }], maestra, archivio, soloPrefissi: (p) => p === 'chat' })
    expect(r.scritti).toBe(2)
    expect(readFileSync(join(dest, 'p', 'viva.jsonl'), 'utf8')).toBe('{"type":"user"}\n')
  })

  it('una chat sempre viva sale lo stesso quando la copia sul Drive e\' troppo indietro', async () => {
    const archivio = archivioInMemoria()
    const chat = cartella()
    const ora = Date.now()
    scrivi(chat, 'p/lunga.jsonl', 'riga 1\n', ora - 90 * MINUTO)
    const radici = [{ prefisso: 'chat', cartella: chat }]
    const primo = await salvaIncrementale({ radici, maestra, archivio, manifestoPrec: manifestoVuoto(), adesso: '2026-10-29T10:00:00.000Z' })
    expect(primo.caricati).toBe(1)

    const f = join(chat, 'p', 'lunga.jsonl')
    appendFileSync(f, 'riga 2\n')
    utimesSync(f, (ora - MINUTO) / 1000, (ora - MINUTO) / 1000)
    const regola = { quieteMs: 10 * MINUTO, ora }
    // Senza ritardo massimo aspetterebbe; con un'ora, la copia (di 89 minuti
    // prima) e' troppo vecchia e sale.
    const attende = await salvaIncrementale({ radici, maestra, archivio, manifestoPrec: primo.manifesto, adesso: 'x', rimandaVive: regola })
    expect(attende.caricati).toBe(0)
    expect(attende.rimandati).toBe(1)
    const sale = await salvaIncrementale({ radici, maestra, archivio, manifestoPrec: primo.manifesto, adesso: 'x', rimandaVive: { ...regola, ritardoMassimoMs: 60 * MINUTO } })
    expect(sale.caricati).toBe(1)
  })

  it('chatViva: solo le chat, e una chat nuova mai salita conta dalla nascita', () => {
    const ora = 1_000_000_000
    const regola = { quieteMs: 10 * MINUTO, ritardoMassimoMs: 60 * MINUTO, ora }
    const f = { size: 1, mtime: ora - MINUTO, disco: 'x', nato: ora - 5 * MINUTO }
    expect(chatViva('chat/p/a.jsonl', f, undefined, regola)).toBe(true)
    expect(chatViva('progetto-x/a.ts', f, undefined, regola)).toBe(false)
    expect(chatViva('chat/p/a.jsonl', { ...f, nato: ora - 120 * MINUTO }, undefined, regola)).toBe(false)
    expect(chatViva('chat/p/a.jsonl', { ...f, mtime: ora - 11 * MINUTO }, undefined, regola)).toBe(false)
  })

  it('il tetto di byte per giro: il resto al giro dopo, il primo file passa sempre', async () => {
    const archivio = archivioInMemoria()
    const chat = cartella()
    const ora = Date.now()
    scrivi(chat, 'p/a.jsonl', 'a'.repeat(1000), ora - 50 * MINUTO)
    scrivi(chat, 'p/b.jsonl', 'b'.repeat(1000), ora - 40 * MINUTO)
    scrivi(chat, 'p/c.jsonl', 'c'.repeat(1000), ora - 30 * MINUTO)
    const radici = [{ prefisso: 'chat', cartella: chat }]

    const primo = await salvaIncrementale({ radici, maestra, archivio, manifestoPrec: manifestoVuoto(), adesso: 'x', budgetByte: 2500 })
    expect(primo.caricati).toBe(2)
    expect(primo.rimandati).toBe(1)
    // Dalla piu' vecchia: resta indietro la piu' recente.
    expect(Object.keys(primo.manifesto.file).sort()).toEqual(['chat/p/a.jsonl', 'chat/p/b.jsonl'])

    const secondo = await salvaIncrementale({ radici, maestra, archivio, manifestoPrec: primo.manifesto, adesso: 'x', budgetByte: 2500 })
    expect(secondo.caricati).toBe(1)
    expect(Object.keys(secondo.manifesto.file)).toHaveLength(3)

    // Un file piu' grande del tetto sale comunque, da solo.
    scrivi(chat, 'p/grande.jsonl', 'g'.repeat(5000), ora - 20 * MINUTO)
    const terzo = await salvaIncrementale({ radici, maestra, archivio, manifestoPrec: secondo.manifesto, adesso: 'x', budgetByte: 2500 })
    expect(terzo.caricati).toBe(1)
  })

  it('a flusso e compresso: stesso formato di prima, si ripristina e l\'impronta e\' quella del chiaro', async () => {
    const archivio = archivioInMemoria()
    const chat = cartella()
    const testo = Array.from({ length: 5000 }, (_, i) => JSON.stringify({ type: 'user', i, testo: 'x'.repeat(i % 50) })).join('\n') + '\n'
    scrivi(chat, 'p/z.jsonl', testo)
    const radici = [{ prefisso: 'chat', cartella: chat }]
    const esito = await salvaIncrementale({
      radici, maestra, archivio, manifestoPrec: manifestoVuoto(), adesso: 'x', comprimi: daComprimere,
      sostituto: () => Promise.resolve(undefined), sostituisce: (p) => p === 'sierradeck/workspaces.json'
    })
    const voce = esito.manifesto.file['chat/p/z.jsonl']
    expect(voce?.sha).toBe(createHash('sha256').update(testo).digest('hex'))
    expect(voce?.size).toBe(Buffer.byteLength(testo))
    // Il blob e' il formato di `impacchetta`: segno in testa e gzip.
    const blob = await archivio.scarica(nomeDi('chat/p/z.jsonl'))
    const chiaro = await decifra(maestra, blob as Buffer)
    expect(chiaro?.subarray(0, SEGNO.length).equals(SEGNO)).toBe(true)
    expect(gunzipSync((chiaro as Buffer).subarray(SEGNO.length)).toString('utf8')).toBe(testo)
    expect(spacchetta(chiaro)?.toString('utf8')).toBe(testo)

    const dest = cartella()
    await ripristinaIncrementale({ radici: [{ prefisso: 'chat', cartella: dest }], maestra, archivio })
    expect(readFileSync(join(dest, 'p', 'z.jsonl'), 'utf8')).toBe(testo)
  })

  it('leggiPerCaricare legge fino alla dimensione della firma, e un file accorciato e\' un rimando', async () => {
    const dir = cartella()
    const f = scrivi(dir, 'a.jsonl', 'riga 1\nriga 2\n')
    const size = 7
    const p = await leggiPerCaricare(f, size, false)
    expect(p?.corpo.toString('utf8')).toBe('riga 1\n')
    expect(p?.sha).toBe(createHash('sha256').update('riga 1\n').digest('hex'))
    expect(await leggiPerCaricare(f, 1000, false)).toBeUndefined()
    const vuoto = scrivi(dir, 'v.jsonl', '')
    expect((await leggiPerCaricare(vuoto, 0, true))?.corpo.subarray(0, SEGNO.length).equals(SEGNO)).toBe(true)
  })
})
