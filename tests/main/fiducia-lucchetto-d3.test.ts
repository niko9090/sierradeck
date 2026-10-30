import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prendiLucchetto, segnaFidata, LUCCHETTO_VECCHIO_MS } from '../../src/main/fiducia-cartella'

/**
 * D3: `~/.claude.json` si leggeva, si cambiava e si rinominava senza
 * lucchetto, mentre Claude Code lo riscrive: un aggiornamento suo poteva
 * sparire. Ora si prende il suo lucchetto (`<file>.lock`, una cartella, come
 * proper-lockfile), si riguarda il file prima della rinomina e si riprova.
 * Sempre su un file finto in una cartella temporanea.
 */
const W = 'win32' as const
const CWD = 'E:\\Lavori\\nuova'
const CHIAVE = 'E:/Lavori/nuova'

function fileFinto(dati: unknown): string {
  const f = join(mkdtempSync(join(tmpdir(), 'fiducia-d3-')), '.claude.json')
  writeFileSync(f, JSON.stringify(dati, null, 2), 'utf8')
  return f
}
const leggi = (f: string): { numStartups?: number; projects: Record<string, { hasTrustDialogAccepted?: boolean }> } =>
  JSON.parse(readFileSync(f, 'utf8')) as never

describe('il lucchetto di Claude Code', () => {
  it('si prende come una cartella <file>.lock e si lascia', () => {
    const f = fileFinto({ projects: {} })
    const lascia = prendiLucchetto(f)
    expect(lascia).toBeDefined()
    expect(existsSync(`${f}.lock`)).toBe(true)
    // Un secondo (Claude Code) non lo prende mentre lo tengo.
    expect(prendiLucchetto(f, { attese: [1, 1] })).toBeUndefined()
    lascia?.()
    expect(existsSync(`${f}.lock`)).toBe(false)
  })

  it('tenuto da Claude Code (fresco): non si scrive niente, e il file resta com era', () => {
    const f = fileFinto({ projects: {} })
    const prima = readFileSync(f, 'utf8')
    mkdirSync(`${f}.lock`)
    expect(segnaFidata(f, CWD, { piattaforma: W, atteseLucchetto: [1, 1, 1] })).toBe('occupato')
    expect(readFileSync(f, 'utf8')).toBe(prima)
    // Il suo lucchetto resta suo.
    expect(existsSync(`${f}.lock`)).toBe(true)
  })

  it('un lucchetto abbandonato da piu di 10 s si toglie, come fa proper-lockfile', () => {
    const f = fileFinto({ projects: {} })
    mkdirSync(`${f}.lock`)
    const vecchio = (Date.now() - LUCCHETTO_VECCHIO_MS - 5_000) / 1000
    utimesSync(`${f}.lock`, vecchio, vecchio)
    expect(segnaFidata(f, CWD, { piattaforma: W, atteseLucchetto: [1] })).toBe('scritta')
    expect(leggi(f).projects[CHIAVE]?.hasTrustDialogAccepted).toBe(true)
    expect(existsSync(`${f}.lock`)).toBe(false)
  })
})

describe('niente aggiornamenti persi', () => {
  it('uno scrittore entra fra la lettura e la rinomina: si rilegge, e il suo cambio resta', () => {
    const f = fileFinto({ numStartups: 1, projects: {} })
    const esito = segnaFidata(f, CWD, {
      piattaforma: W,
      dopoLettura: (t) => {
        // Al primo giro Claude Code (senza lucchetto) scrive il suo numStartups.
        if (t === 0) writeFileSync(f, JSON.stringify({ numStartups: 2, projects: {}, extra: 'suo' }, null, 2), 'utf8')
      }
    })
    expect(esito).toBe('scritta')
    const dopo = leggi(f) as ReturnType<typeof leggi> & { extra?: string }
    expect(dopo.numStartups).toBe(2)
    expect(dopo.extra).toBe('suo')
    expect(dopo.projects[CHIAVE]?.hasTrustDialogAccepted).toBe(true)
  })

  it('la cartella diventa fidata nel frattempo: non si scrive', () => {
    const f = fileFinto({ projects: {} })
    let scritture = 0
    const esito = segnaFidata(f, CWD, {
      piattaforma: W,
      scrivi: () => { scritture += 1; return true },
      dopoLettura: (t) => {
        if (t === 0) writeFileSync(f, JSON.stringify({ projects: { [CHIAVE]: { hasTrustDialogAccepted: true } }, altro: 1 }, null, 2), 'utf8')
      }
    })
    expect(esito).toBe('gia')
    expect(scritture).toBe(0)
  })

  it('il file cambia a ogni giro: dopo 3 tentativi si lascia stare', () => {
    const f = fileFinto({ projects: {} })
    let n = 0
    const esito = segnaFidata(f, CWD, {
      piattaforma: W,
      dopoLettura: () => { n += 1; writeFileSync(f, JSON.stringify({ projects: {}, giro: 'x'.repeat(n) }), 'utf8') }
    })
    expect(esito).toBe('non-scritta')
    expect(n).toBe(3)
    expect(leggi(f).projects[CHIAVE]).toBeUndefined()
    expect(existsSync(`${f}.lock`)).toBe(false)
  })
})
