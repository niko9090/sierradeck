import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { archivioInMemoria } from '../../src/main/cassaforte/archivio'
import { salvaIncrementale, ripristinaIncrementale, manifestoVuoto, nomeDi } from '../../src/main/cassaforte/incrementale'
import { compressioneAccesa, daComprimere, impacchetta, spacchetta } from '../../src/main/cassaforte/compressione'
import { decifra } from '../../src/main/cassaforte/cifratura'
import { elencaFileProgetto } from '../../src/main/progetti/file'
import { FILE_GRANDE_BYTE, misura, pulizieDaSole, type Proposta } from '@shared/spazio-drive'

/**
 * «Perché occupiamo così tanto sul Drive? ottimizziamo, capiamo cosa mettere e
 * cosa no» (Nicholas, 12/10). Le regole di cosa si salva (0.69.0).
 */
describe('le chat si comprimono, e si leggono nelle due forme', () => {
  it('compressa e poi letta torna uguale; un contenuto di prima resta com’è', () => {
    const chat = Buffer.from('{"tipo":"utente","testo":"ciao"}\n'.repeat(500))
    const z = impacchetta(chat)
    expect(z.length).toBeLessThan(chat.length / 10)
    expect(spacchetta(z).equals(chat)).toBe(true)
    expect(spacchetta(chat).equals(chat)).toBe(true)
  })
  it('solo le trascrizioni delle chat', () => {
    expect(daComprimere('chat/progetto-x/abc.jsonl')).toBe(true)
    expect(daComprimere('progetto-1/src/main.ts')).toBe(false)
  })
  it('solo quando tutti i PC visti sanno leggere: un PC vecchio rovinerebbe la chat', () => {
    expect(compressioneAccesa(['0.69.0', '0.70.1'])).toBe(true)
    expect(compressioneAccesa(['0.69.0', '0.68.0'])).toBe(false)
    expect(compressioneAccesa([])).toBe(true)
  })
  it('salvata compressa sul Drive, ripristinata uguale', async () => {
    const maestra = randomBytes(32)
    const archivio = archivioInMemoria()
    const sorgente = mkdtempSync(join(tmpdir(), 'sd-z-'))
    mkdirSync(join(sorgente, 'p'), { recursive: true })
    const testo = '{"r":"una riga di chat che si ripete"}\n'.repeat(2000)
    writeFileSync(join(sorgente, 'p', 'a.jsonl'), testo)
    await salvaIncrementale({ radici: [{ prefisso: 'chat', cartella: sorgente }], maestra, archivio, manifestoPrec: manifestoVuoto(), adesso: '2026-10-12T20:00:00.000Z', comprimi: daComprimere })
    const blob = await archivio.scarica(nomeDi('chat/p/a.jsonl'))
    const chiaro = await decifra(maestra, blob as Buffer)
    expect((chiaro as Buffer).length).toBeLessThan(testo.length / 10)
    const dest = mkdtempSync(join(tmpdir(), 'sd-z-dest-'))
    await ripristinaIncrementale({ radici: [{ prefisso: 'chat', cartella: dest }], maestra, archivio })
    expect(readFileSync(join(dest, 'p', 'a.jsonl'), 'utf8')).toBe(testo)
  })
})

describe('cosa non sale con un progetto', () => {
  it('le uscite delle build e i recuperati di SierraDeck restano a casa; un binario oltre 50 MB pure', async () => {
    const d = mkdtempSync(join(tmpdir(), 'sd-prog-'))
    for (const c of ['src', 'dist', 'out', 'coverage', '.sierradeck/recuperati', '.sierradeck/quaderno']) mkdirSync(join(d, c), { recursive: true })
    writeFileSync(join(d, 'src', 'main.ts'), 'x')
    writeFileSync(join(d, 'dist', 'app.js'), 'x')
    writeFileSync(join(d, 'out', 'a.bin'), 'x')
    writeFileSync(join(d, 'coverage', 'c.json'), 'x')
    writeFileSync(join(d, '.sierradeck', 'recuperati', 'vecchio.ts'), 'x')
    writeFileSync(join(d, '.sierradeck', 'quaderno', 'scheda.md'), 'x')
    writeFileSync(join(d, 'grande.apk'), Buffer.alloc(51 * 1024 * 1024))
    const e = await elencaFileProgetto(d)
    expect(e.file.sort()).toEqual(['.sierradeck/quaderno/scheda.md', 'src/main.ts'])
    expect(e.troppoGrandi).toEqual(['grande.apk'])
  })
})

describe('il recupero scaduto va nel recupero da solo; le doppie no', () => {
  const pr = (tipo: Proposta['tipo']): Proposta => ({ tipo, titolo: tipo, breve: '', spiega: '', voci: [{ nome: 'f_1', byte: 10 }], byte: 10 })
  it('solo «recupero scaduto»', () => {
    expect(pulizieDaSole([pr('doppie'), pr('recupero-scaduto'), pr('vecchie')]).map((p) => p.tipo)).toEqual(['recupero-scaduto'])
  })
})

describe('lo spazio per progetto e l’inventario', () => {
  it('ogni progetto con i suoi byte e i file grandi; i più grandi con il perché', () => {
    const m = misura({
      file: [{ nome: 'f_a', byte: FILE_GRANDE_BYTE + 1 }, { nome: 'f_b', byte: 100 }, { nome: 'f_c', byte: 5000 }, { nome: 'f_orfano', byte: 3000 }],
      indice: {
        'progetto-p1/video.mp4': { nome: 'f_a', size: FILE_GRANDE_BYTE + 1, mtime: 0 },
        'progetto-p1/src/a.ts': { nome: 'f_b', size: 100, mtime: 0 },
        'chat/x/s.jsonl': { nome: 'f_c', size: 5000, mtime: 0 }
      },
      adesso: Date.parse('2026-10-12T20:00:00Z')
    })
    expect(m.perProgetto?.p1).toEqual({ file: 2, byte: FILE_GRANDE_BYTE + 101, grandi: [{ percorso: 'video.mp4', byte: FILE_GRANDE_BYTE + 1 }] })
    expect(m.piuGrandi?.map((x) => x.tipo)).toEqual(['progetti', 'chat', 'orfani', 'progetti'])
    expect(m.piuGrandi?.[2]?.perche).toContain('senza voce')
  })
})
