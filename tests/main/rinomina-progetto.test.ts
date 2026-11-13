import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmdirSync, unlinkSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { annullaRinomina, rinominaCartellaProgetto, spostaPercorso, SUFFISSO_COPIE, type FsRinomina } from '../../src/main/progetti/rinomina-progetto'

/**
 * Rinominare la cartella di un progetto (13/11): la cartella, le copie degli
 * autopiloti accanto e le conversazioni di Claude Code; mai una sovrascrittura.
 */
let radice = ''
const slug = (p: string): string => p.replace(/[^A-Za-z0-9]/g, '-')

/** Toglie la cartella di prova un file alla volta (niente rimozioni ricorsive). */
function togli(p: string): void {
  if (!existsSync(p)) return
  if (statSync(p).isDirectory()) {
    for (const n of readdirSync(p)) togli(join(p, n))
    rmdirSync(p)
  } else unlinkSync(p)
}

beforeEach(() => { radice = mkdtempSync(join(tmpdir(), 'sd-rinomina-')) })
afterEach(() => togli(radice))

describe('rinominaCartellaProgetto', () => {
  it('sposta la cartella, le copie degli autopiloti e le conversazioni', () => {
    const progetti = join(radice, 'progetti')
    const chat = join(radice, 'chat')
    const vecchio = join(progetti, 'Sito')
    mkdirSync(join(vecchio, 'src'), { recursive: true })
    writeFileSync(join(vecchio, 'src', 'a.txt'), 'ciao')
    mkdirSync(join(`${vecchio}${SUFFISSO_COPIE}`, 'c-1'), { recursive: true })
    mkdirSync(join(chat, slug(vecchio)), { recursive: true })
    writeFileSync(join(chat, slug(vecchio), 's.jsonl'), '{}')
    const copia = join(`${vecchio}${SUFFISSO_COPIE}`, 'c-1')
    mkdirSync(join(chat, slug(copia)), { recursive: true })

    const e = rinominaCartellaProgetto({ percorso: vecchio, nuovoNome: 'Sito Web', radiceChat: chat, cwdSessioni: [copia, join(radice, 'altrove')], slug })
    expect(e.ok).toBe(true)
    if (!e.ok) return
    const nuovo = join(progetti, 'Sito Web')
    expect(e.nuovoPercorso).toBe(nuovo)
    expect(readFileSync(join(nuovo, 'src', 'a.txt'), 'utf8')).toBe('ciao')
    expect(existsSync(vecchio)).toBe(false)
    expect(existsSync(join(`${nuovo}${SUFFISSO_COPIE}`, 'c-1'))).toBe(true)
    expect(existsSync(join(chat, slug(nuovo), 's.jsonl'))).toBe(true)
    expect(existsSync(join(chat, slug(join(`${nuovo}${SUFFISSO_COPIE}`, 'c-1'))))).toBe(true)
    expect(e.chatSpostate).toBe(2)
    expect(e.avvisi).toEqual([])
    expect(e.mappa(join(vecchio, 'src'))).toBe(join(nuovo, 'src'))
    expect(e.mappa(copia)).toBe(join(`${nuovo}${SUFFISSO_COPIE}`, 'c-1'))
  })

  it('non sovrascrive mai: se la cartella nuova c’è già, rifiuta e non tocca niente', () => {
    const vecchio = join(radice, 'Sito')
    mkdirSync(vecchio)
    mkdirSync(join(radice, 'Altro'))
    const e = rinominaCartellaProgetto({ percorso: vecchio, nuovoNome: 'Altro', slug })
    expect(e.ok).toBe(false)
    expect(existsSync(vecchio)).toBe(true)
  })

  it('una conversazione già al posto nuovo resta dov’è, con un avviso', () => {
    const chat = join(radice, 'chat')
    const vecchio = join(radice, 'Sito')
    const nuovo = join(radice, 'Nuovo')
    mkdirSync(vecchio)
    mkdirSync(join(chat, slug(vecchio)), { recursive: true })
    mkdirSync(join(chat, slug(nuovo)), { recursive: true })
    const e = rinominaCartellaProgetto({ percorso: vecchio, nuovoNome: 'Nuovo', radiceChat: chat, slug })
    expect(e.ok).toBe(true)
    if (!e.ok) return
    expect(e.chatSpostate).toBe(0)
    expect(e.avvisi).toHaveLength(1)
    expect(existsSync(join(chat, slug(vecchio)))).toBe(true)
  })

  it('cartella che non c’è, o stesso nome: niente da fare', () => {
    expect(rinominaCartellaProgetto({ percorso: join(radice, 'Manca'), nuovoNome: 'X', slug }).ok).toBe(false)
    const e = rinominaCartellaProgetto({ percorso: join(radice, 'Manca'), nuovoNome: 'Manca', slug })
    expect(e).toMatchObject({ ok: true, chatSpostate: 0 })
  })

  it('una cartella occupata da un programma: un messaggio chiaro, la cartella resta', () => {
    const fs: FsRinomina = { esiste: (p) => p.endsWith('Sito'), rinomina: () => { throw Object.assign(new Error('busy'), { code: 'EBUSY' }) } }
    const e = rinominaCartellaProgetto({ percorso: 'C:\\P\\Sito', nuovoNome: 'Web', slug, fs })
    expect(e).toMatchObject({ ok: false })
    if (!e.ok) expect(e.messaggio).toContain('EBUSY')
  })

  it('solo maiuscole diverse: si può (la cartella «c’è già» perché è lei)', () => {
    const fatte: string[] = []
    const fs: FsRinomina = { esiste: (p) => p.toLowerCase().endsWith('sito'), rinomina: (da, a) => { fatte.push(`${da}>${a}`) } }
    const e = rinominaCartellaProgetto({ percorso: 'C:\\P\\sito', nuovoNome: 'Sito', slug, fs })
    expect(e.ok).toBe(true)
    expect(fatte).toEqual(['C:\\P\\sito>C:\\P\\Sito'])
  })
})

describe('annullaRinomina e spostaPercorso', () => {
  it('rimette la cartella al suo posto', () => {
    const da = join(radice, 'Sito')
    const a = join(radice, 'Web')
    mkdirSync(a)
    expect(annullaRinomina(da, a, { esiste: existsSync, rinomina: renameSync })).toBe(true)
    expect(existsSync(da)).toBe(true)
    expect(annullaRinomina(da, a)).toBe(false)
  })
  it('sposta solo i percorsi dentro la cartella', () => {
    expect(spostaPercorso('C:\\P\\Sito\\src', 'C:\\P\\Sito', 'C:\\P\\Web')).toBe('C:\\P\\Web\\src')
    expect(spostaPercorso('C:\\P\\Sito2', 'C:\\P\\Sito', 'C:\\P\\Web')).toBe('C:\\P\\Sito2')
    expect(spostaPercorso('c:/p/sito', 'C:\\P\\Sito', 'C:\\P\\Web')).toBe('C:\\P\\Web')
  })
})
