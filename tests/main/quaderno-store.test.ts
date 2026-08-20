import { describe, it, expect, beforeEach } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriQuaderno } from '../../src/main/quaderno-store'
import { CARTELLA_QUADERNO, SOTTOCARTELLA } from '../../src/shared/quaderno'

let cwd: string
const ADESSO = '2026-08-12T11:00:00.000Z'
const quaderno = (): ReturnType<typeof apriQuaderno> => apriQuaderno(() => ADESSO)

beforeEach(() => { cwd = mkdtempSync(join(tmpdir(), 'sd-quaderno-')) })

describe('dove vive il quaderno', () => {
  it('dentro la cartella di lavoro, non nei dati del programma', () => {
    // Le schede raccontano quel progetto e devono seguirlo: si copiano con lui
    // e si mettono in git accanto al codice che descrivono.
    expect(quaderno().cartella(cwd)).toBe(join(cwd, CARTELLA_QUADERNO, SOTTOCARTELLA))
  })

  it('la cartella nasce alla prima scheda, non prima', () => {
    const q = quaderno()
    expect(existsSync(q.cartella(cwd))).toBe(false)
    q.scrivi(cwd, { titolo: 'Prima nota', corpo: 'contenuto' })
    expect(existsSync(q.cartella(cwd))).toBe(true)
  })
})

describe('scrivere e rileggere', () => {
  it('una scheda scritta si ritrova nell elenco', () => {
    const q = quaderno()
    q.scrivi(cwd, { titolo: 'Il parser dei criteri', corpo: 'Legge il JSON.', tag: ['note'] })
    const [s] = q.elenca(cwd)
    expect(s?.titolo).toBe('Il parser dei criteri')
    expect(s?.tag).toEqual(['note'])
  })

  it('si rilegge anche con un editor qualunque', () => {
    const q = quaderno()
    const s = q.scrivi(cwd, { titolo: 'Nota', corpo: 'Testo leggibile.' })
    const grezzo = readFileSync(join(q.cartella(cwd), s.file), 'utf8')
    expect(grezzo).toContain('Testo leggibile.')
    expect(grezzo.startsWith('---')).toBe(true)
  })

  it('riscrivere lo stesso file aggiorna la scheda invece di duplicarla', () => {
    const q = quaderno()
    const prima = q.scrivi(cwd, { titolo: 'Nota', corpo: 'versione uno' })
    q.scrivi(cwd, { titolo: 'Nota', corpo: 'versione due', file: prima.file })
    const schede = q.elenca(cwd)
    expect(schede).toHaveLength(1)
    expect(schede[0]?.corpo).toBe('versione due')
  })

  it('legge una scheda per nome', () => {
    const q = quaderno()
    const s = q.scrivi(cwd, { titolo: 'Nota', corpo: 'corpo' })
    expect(q.leggi(cwd, s.file)?.corpo).toBe('corpo')
    expect(q.leggi(cwd, '2026-01-01-inesistente.md')).toBeUndefined()
  })
})

describe('eliminare una scheda', () => {
  it('cancella il file e la toglie dall elenco', () => {
    const q = quaderno()
    const s = q.scrivi(cwd, { titolo: 'Da buttare', corpo: 'non serve piu' })
    expect(existsSync(join(q.cartella(cwd), s.file))).toBe(true)
    expect(q.elimina(cwd, s.file)).toBe(true)
    expect(existsSync(join(q.cartella(cwd), s.file))).toBe(false)
    expect(q.elenca(cwd)).toHaveLength(0)
  })

  it('eliminare una scheda che non c e restituisce false, senza errori', () => {
    expect(quaderno().elimina(cwd, '2026-01-01-mai-esistita.md')).toBe(false)
  })

  it('un nome che risale le cartelle viene rifiutato anche per eliminare', () => {
    // È l'operazione dove la cintura anti-traversal conta di più.
    expect(() => quaderno().elimina(cwd, '..\\..\\importante.md')).toThrow()
  })
})

describe('note messe lì a mano', () => {
  it('un file scritto a mano entra nell elenco come le altre', () => {
    const q = quaderno()
    mkdirSync(q.cartella(cwd), { recursive: true })
    writeFileSync(join(q.cartella(cwd), 'a-mano.md'), 'due righe scritte da me', 'utf8')
    expect(q.elenca(cwd).map((s) => s.file)).toContain('a-mano.md')
  })

  it('i file che non sono schede vengono ignorati', () => {
    const q = quaderno()
    mkdirSync(q.cartella(cwd), { recursive: true })
    writeFileSync(join(q.cartella(cwd), 'immagine.png'), 'non e testo', 'utf8')
    expect(q.elenca(cwd)).toHaveLength(0)
  })

  it('una cartella senza quaderno non e un errore', () => {
    expect(quaderno().elenca(cwd)).toEqual([])
  })
})

describe('nomi che non devono passare', () => {
  it('un nome che risale le cartelle viene rifiutato', () => {
    // Il nome arriva dall'interfaccia: deve restare un nome, non diventare un
    // percorso verso qualunque punto del disco.
    const q = quaderno()
    expect(() => q.leggi(cwd, '../../fuori.md')).toThrow()
    expect(() => q.scrivi(cwd, { titolo: 'x', corpo: 'y', file: '..\\fuga.md' })).toThrow()
  })

  it('un nome senza estensione md viene rifiutato', () => {
    expect(() => quaderno().leggi(cwd, 'passwords.txt')).toThrow()
  })
})
