import { describe, it, expect, beforeEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriQuaderno } from '../../src/main/quaderno-store'
import { anteprimaRiordino, riordinaQuaderno } from '../../src/main/quaderno-lezioni-store'
import { CARTELLA_QUADERNO, SOTTOCARTELLA } from '@shared/quaderno'
import { annotaVoci, componiFileQuaderno, fileVuoto, leggiFileQuaderno, VOCI_MAX, type Voce } from '@shared/quaderno-lezioni'
import { distilla, fraseRiordino } from '@shared/quaderno-riordino'

/**
 * D4: «Riordina il quaderno» lasciava fuori in silenzio le voci oltre il tetto
 * (200 voci o 32 KB). Ora l'anteprima le elenca, il riordino le salva nel
 * recupero con lezioni.md e decisioni.md di prima, e si spostano solo le note
 * viste nell'anteprima. Tutto in cartelle temporanee.
 */
const ADESSO = '2026-10-30T10:00:00.000Z'
let cwd: string
let dati: string
const dir = (): string => join(cwd, CARTELLA_QUADERNO, SOTTOCARTELLA)

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'sd-d4-'))
  dati = mkdtempSync(join(tmpdir(), 'sd-d4-dati-'))
})

/** Un lezioni.md gia' pieno: `n` voci confermate due volte, tutte diverse. */
function lezioniPiene(n = VOCI_MAX): void {
  const voci: Voce[] = Array.from({ length: n }, (_, i) => ({ tag: 'vecchie', testo: `voce antica numero ${i} zeta${i}`, volte: 1, ultima: `2026-09-${String((i % 28) + 1).padStart(2, '0')}` }))
  mkdirSync(dir(), { recursive: true })
  writeFileSync(join(dir(), 'lezioni.md'), componiFileQuaderno('lezioni', { voci, regole: [] }), 'utf8')
}
const scrivi = (titolo: string, corpo: string, file: string): void => {
  apriQuaderno(() => ADESSO).scrivi(cwd, { titolo, corpo, tag: ['build'], file })
}

describe('le voci che il tetto lascia fuori', () => {
  it('annotaVoci dice quali voci sono uscite', () => {
    const molte = Array.from({ length: VOCI_MAX + 3 }, (_, i) => ({ testo: `alfa${i} beta${i} gamma${i}` }))
    const r = annotaVoci(fileVuoto(), molte, '2026-10-30')
    expect(r.file.voci).toHaveLength(VOCI_MAX)
    expect(r.tolte).toHaveLength(3)
    for (const t of r.tolte) expect(r.file.voci.some((v) => v.testo === t.testo)).toBe(false)
  })

  it('distilla le elenca, una volta sola, e non quelle rientrate dopo', () => {
    const gia = { lezioni: { voci: Array.from({ length: VOCI_MAX }, (_, i): Voce => ({ tag: 'x', testo: `voce antica ${i} kappa${i}`, volte: 1, ultima: '2026-09-01' })), regole: [] }, decisioni: fileVuoto() }
    const schede = [
      { file: 'a.md', titolo: 'Build Android', corpo: 'Il build di Android vuole Java 17 e non la 21.', tag: ['android'], quando: '2026-10-01' },
      { file: 'b.md', titolo: 'Cache Gradle', corpo: 'La cache di Gradle va pulita dopo ogni cambio di versione.', tag: ['gradle'], quando: '2026-10-02' }
    ]
    const e = distilla(schede as never, gia, ADESSO)
    expect(e.lezioni.voci).toHaveLength(VOCI_MAX)
    expect(e.tolte).toHaveLength(2)
    expect(new Set(e.tolte.map((t) => t.testo)).size).toBe(2)
    expect(e.tolte.every((t) => t.file === 'lezioni.md')).toBe(true)
    expect(fraseRiordino(e)).toContain('2 voci restano fuori per il tetto')
  })

  it('l’anteprima le mostra (e le note che si sposterebbero) senza toccare niente', () => {
    lezioniPiene()
    scrivi('Build Android', 'Il build di Android vuole Java 17 e non la 21.', 'build-android.md')
    const prima = readdirSync(dir()).sort()
    const a = anteprimaRiordino(cwd, ADESSO)
    expect(a.tolte.length).toBeGreaterThan(0)
    expect(a.file).toEqual(['build-android.md'])
    expect(a.frase).toMatch(/rest(a|ano) fuori per il tetto/)
    expect(readdirSync(dir()).sort()).toEqual(prima)
    expect(existsSync(join(dati, 'recupero-quaderno'))).toBe(false)
  })

  it('il riordino le salva nel recupero, con lezioni.md di prima', () => {
    lezioniPiene()
    const lezioniPrima = readFileSync(join(dir(), 'lezioni.md'), 'utf8')
    scrivi('Build Android', 'Il build di Android vuole Java 17 e non la 21.', 'build-android.md')
    const a = anteprimaRiordino(cwd, ADESSO)
    const e = riordinaQuaderno(cwd, dati, () => ADESSO, a.file)
    expect(e.ok).toBe(true)
    expect(e.tolte.map((t) => t.testo)).toEqual(a.tolte.map((t) => t.testo))
    const rec = e.recupero as string
    expect(readFileSync(join(rec, 'prima', 'lezioni.md'), 'utf8')).toBe(lezioniPrima)
    const fuori = readFileSync(join(rec, 'prima', 'voci-rimaste-fuori.md'), 'utf8')
    for (const t of e.tolte) expect(fuori).toContain(t.testo)
    // Ogni voce di prima e' o nel nuovo lezioni.md o nell'elenco del recupero: nessuna persa.
    const dopo = leggiFileQuaderno(readFileSync(join(dir(), 'lezioni.md'), 'utf8')).voci.map((v) => v.testo)
    for (const v of leggiFileQuaderno(lezioniPrima).voci) expect(dopo.includes(v.testo) || fuori.includes(v.testo), v.testo).toBe(true)
    expect(e.messaggio).toContain('voci-rimaste-fuori.md')
    expect(existsSync(join(rec, 'build-android.md'))).toBe(true)
  })

  it('una nota arrivata dopo l’anteprima (es. dal Drive) non si sposta', () => {
    scrivi('Build Android', 'Il build di Android vuole Java 17 e non la 21.', 'build-android.md')
    const a = anteprimaRiordino(cwd, ADESSO)
    scrivi('Arrivata dopo', 'Una nota scritta da un altro PC mentre guardavo l’anteprima.', 'arrivata-dopo.md')
    const e = riordinaQuaderno(cwd, dati, () => ADESSO, a.file)
    expect(e.spostate).toBe(1)
    expect(existsSync(join(dir(), 'arrivata-dopo.md'))).toBe(true)
    expect(existsSync(join(dir(), 'build-android.md'))).toBe(false)
  })
})
