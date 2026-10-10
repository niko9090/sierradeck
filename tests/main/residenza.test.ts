import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaResidenza, type ChatDiCartella, type GruppoPerResidenza } from '../../src/main/residenza'
import { apriRegistroProgetti } from '../../src/main/progetti/registro'
import { leggiElencoRecupero } from '../../src/main/rimozione-sicura'
import type { Archivio } from '../../src/shared/workspace'
import type { Manifesto } from '../../src/main/cassaforte/incrementale'

/**
 * «Rendi residente» con analisi e unione (0.60.0), giro intero su cartelle
 * temporanee: due copie di qui con lo stesso nome, una copia sul «Drive» di
 * un altro PC, chat, workspace doppi, registro. Analisi senza toccare niente,
 * conferma, unione, annullamento. Mai una cancellazione.
 */
let radice: string
const sha = (s: string): string => createHash('sha256').update(Buffer.from(s)).digest('hex')
const scrivi = (p: string, s: string): void => { mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, s) }

beforeEach(() => { radice = mkdtempSync(join(tmpdir(), 'residenza-')) })
afterEach(() => { rmSync(radice, { recursive: true, force: true }) })

function prepara() {
  const dati = join(radice, 'dati')
  const vera = join(radice, 'Documenti', 'Sito')
  const doppia = join(radice, 'Progetti', 'sito (2)')
  const claude = join(radice, 'claude', 'projects')
  mkdirSync(dati, { recursive: true })
  scrivi(join(vera, 'index.html'), 'v1')
  scrivi(join(vera, 'stile.css'), 'vecchio')
  scrivi(join(vera, '.sierradeck', 'quaderno', 'scheda.md'), 'qui')
  scrivi(join(doppia, 'index.html'), 'v1')
  scrivi(join(doppia, 'solo-doppia.txt'), 'utile')
  scrivi(join(doppia, '.sierradeck', 'quaderno', 'scheda.md'), 'là')
  // La scheda della copia doppia è più vecchia: resta quella di qui, l'altra nei recuperati.
  utimesSync(join(doppia, '.sierradeck', 'quaderno', 'scheda.md'), new Date('2026-01-01'), new Date('2026-01-01'))
  // La trascrizione di una chat della copia doppia.
  const slug = (cwd: string): string => join(claude, cwd.replace(/[^A-Za-z0-9]/g, '-'))
  const jsonlDoppia = join(slug(doppia), 'sess-d.jsonl')
  scrivi(jsonlDoppia, '{"x":1}\n')
  const chat: ChatDiCartella[] = [
    { sessione: 'sess-v', jsonl: join(slug(vera), 'sess-v.jsonl'), cwd: vera, mtime: Date.parse('2026-10-10T20:00:00Z') },
    { sessione: 'sess-d', jsonl: jsonlDoppia, cwd: doppia, mtime: Date.parse('2026-10-01T10:00:00Z') }
  ]
  scrivi(chat[0]!.jsonl, '{"y":1}\n')
  // Il «Drive»: la copia salvata dal portatile sotto un altro id.
  const fileDrive: Record<string, string> = { 'progetto-p-port/stile.css': 'nuovissimo', 'progetto-p-port/dal-portatile.md': 'portatile' }
  const manifesto: Manifesto = {
    versione: 1, creatoIl: '2026-10-10T00:00:00Z',
    file: Object.fromEntries(Object.entries(fileDrive).map(([p, s]) => [p, { nome: `f_${sha(p)}`, size: s.length, mtime: Date.parse('2026-10-11T00:00:00Z'), sha: sha(s) }]))
  }
  const registro = apriRegistroProgetti(dati)
  registro.scrivi({ versione: 1, progetti: [
    { id: 'p-qui', nome: 'Sito', percorsi: { 'pc-qui': doppia }, aggiuntoIl: '2026-09-01T00:00:00Z' },
    { id: 'p-port', nome: 'sito', percorsi: { 'pc-port': 'D:\\Lavoro\\Sito' }, aggiuntoIl: '2026-09-02T00:00:00Z' }
  ] })
  let archivio: Archivio = { versione: 1, attivo: 'Altro', workspace: [
    { nome: 'Sito', perSlot: { '1': { root: { type: 'pane', id: 'a' }, panes: [{ id: 'a', sessionUuid: 'sess-v', cwd: vera, title: 'Vera' }] } } },
    { nome: 'sito (2)', perSlot: { '1': { root: { type: 'pane', id: 'b' }, panes: [{ id: 'b', sessionUuid: 'sess-d', cwd: doppia, title: 'Doppia' }] } } },
    { nome: 'Altro', perSlot: {} }
  ] } as Archivio
  const scelte: string[][] = []
  const gruppo: GruppoPerResidenza = {
    id: 'p-qui', nome: 'Sito', chiave: 'sito', ids: ['p-qui', 'p-port'],
    candidati: [{ percorso: doppia, registrata: true }, { percorso: vera, registrata: false }],
    nuova: join(radice, 'Progetti', 'Sito'),
    drive: [{ id: 'p-port', etichetta: 'sul Drive, salvata da PORTATILE-ESEMPIO' }]
  }
  const log: string[] = []
  const r = creaResidenza({
    dati,
    io: () => ({ id: 'pc-qui', nome: 'PC-ESEMPIO' }),
    gruppo: (id) => (id === 'p-qui' || id === 'p-port' ? gruppo : undefined),
    manifesto: async () => manifesto,
    leggiFileDrive: async (p) => (fileDrive[p] !== undefined ? Buffer.from(fileDrive[p] as string) : undefined),
    chatDi: (cartella) => chat.filter((c) => existsSync(c.jsonl) && c.cwd.toLowerCase().startsWith(cartella.toLowerCase())),
    chatDelProgetto: () => ({ tutte: ['sess-v', 'sess-d', 'sess-altrove'], altrove: 1 }),
    cartellaTrascrizioni: slug,
    workspace: { leggi: () => archivio, scrivi: (a) => { archivio = a; return true }, aperti: () => [] },
    inUso: () => undefined,
    scegliCasa: async (s) => { scelte.push(s); return { ok: true, messaggio: 'ok' } },
    registro,
    log: (m) => log.push(m),
    adesso: () => Date.parse('2026-10-11T08:00:00Z')
  })
  return { r, dati, vera, doppia, registro, archivio: () => archivio, scelte, log, slug, jsonlDoppia }
}

describe('«Rendi residente» con analisi e unione', () => {
  it('l’analisi non tocca niente e prepara il riassunto', async () => {
    const t = prepara()
    const st = await t.r.avvia('p-port')
    expect(st.fase).toBe('attesa-conferma')
    const ra = st.riassunto!
    // Resta la cartella dove si è lavorato più di recente (la chat più nuova), anche se non registrata.
    expect(ra.destinazione).toBe(t.vera)
    expect(ra.copie.map((c) => c.tipo)).toEqual(['cartella', 'drive'])
    expect(ra.file.aggiunti).toBe(2)
    expect(ra.file.sostituiti).toBe(1)
    expect(ra.workspace).toEqual({ tiene: 'Sito', uniti: ['sito (2)'], aperti: [] })
    expect(ra.recupero).toEqual([t.doppia])
    // Niente toccato.
    expect(existsSync(join(t.vera, 'solo-doppia.txt'))).toBe(false)
    expect(existsSync(t.doppia)).toBe(true)
    expect(t.archivio().workspace).toHaveLength(3)
    expect(t.scelte).toEqual([])
    expect(t.log.join('\n')).toContain('[residente] «Sito»: resta')
  })

  it('la conferma unisce: file, recuperati, chat, workspace, registro, casa, doppione in recupero; «Annulla l’unione» rimette tutto', async () => {
    const t = prepara()
    await t.r.avvia('p-qui')
    const st = await t.r.conferma('p-qui')
    expect(st.fase).toBe('fatta')
    // File: l'utile della doppia e quello del portatile entrano; il più recente sostituisce, il vecchio nei recuperati.
    expect(readFileSync(join(t.vera, 'solo-doppia.txt'), 'utf8')).toBe('utile')
    expect(readFileSync(join(t.vera, 'dal-portatile.md'), 'utf8')).toBe('portatile')
    expect(readFileSync(join(t.vera, 'stile.css'), 'utf8')).toBe('nuovissimo')
    expect(readFileSync(join(t.vera, '.sierradeck', 'quaderno', 'scheda.md'), 'utf8')).toBe('qui')
    const rec = join(t.vera, ...st.messaggio.match(/versioni in ([^ ]+)\./)![1]!.split('/'))
    expect(existsSync(rec)).toBe(true)
    // La doppia è nella cartella di recupero (30 giorni), non cancellata.
    expect(existsSync(t.doppia)).toBe(false)
    const inRec = leggiElencoRecupero(t.dati)
    expect(inRec).toHaveLength(1)
    expect(existsSync(inRec[0]!.dove)).toBe(true)
    // La chat della doppia: trascrizione sotto la cartella che resta, la vecchia dentro la doppia (in recupero).
    expect(existsSync(join(t.slug(t.vera), 'sess-d.jsonl'))).toBe(true)
    expect(existsSync(t.jsonlDoppia)).toBe(false)
    // Un workspace solo, con tutte e due le chat, che puntano alla cartella che resta.
    const ws = t.archivio().workspace
    expect(ws.map((w) => w.nome)).toEqual(['Sito', 'Altro'])
    expect(ws[0]!.perSlot['1']!.panes.map((p) => [p.sessionUuid, p.cwd])).toEqual([['sess-v', t.vera], ['sess-d', t.vera]])
    // Registro: un progetto solo, con la cartella che resta; il doppione unito.
    const reg = t.registro.leggi().progetti
    expect(reg.find((p) => p.id === 'p-qui')?.percorsi['pc-qui']).toBe(t.vera)
    expect(reg.find((p) => p.id === 'p-port')?.unitoIn).toBe('p-qui')
    // Casa: tutte le chat e il progetto su questo PC.
    expect(t.scelte[0]).toEqual(['sess-v', 'sess-d', 'sess-altrove', 'progetto:p-qui', 'progetto:p-port'])
    expect(t.r.unioni()).toHaveLength(1)

    const a = await t.r.annullaUnione(st.unione!)
    expect(a.ok).toBe(true)
    expect(readFileSync(join(t.vera, 'stile.css'), 'utf8')).toBe('vecchio')
    expect(existsSync(join(t.vera, 'solo-doppia.txt'))).toBe(false)
    expect(readFileSync(join(t.doppia, 'solo-doppia.txt'), 'utf8')).toBe('utile')
    expect(existsSync(t.jsonlDoppia)).toBe(true)
    expect(t.archivio().workspace.map((w) => w.nome).sort()).toEqual(['Altro', 'Sito', 'sito (2)'])
    const dopo = t.registro.leggi().progetti
    expect(dopo.find((p) => p.id === 'p-qui')?.percorsi['pc-qui']).toBe(t.doppia)
    expect(dopo.find((p) => p.id === 'p-port')?.unitoIn).toBe('')
    expect(t.r.unioni()).toHaveLength(0)
    expect(t.r.stati().find((s) => s.progetto === 'p-qui')?.fase).toBe('annullata')
  })

  it('«Annulla» lascia tutto com’è; la conferma senza analisi non fa niente', async () => {
    const t = prepara()
    expect((await t.r.conferma('p-qui')).fase).toBe('errore')
    await t.r.avvia('p-qui')
    expect(t.r.annulla('p-qui').fase).toBe('annullata')
    expect((await t.r.conferma('p-qui')).fase).not.toBe('fatta')
    expect(existsSync(t.doppia)).toBe(true)
  })

  it('un contenuto cambiato dopo l’analisi non entra: lo dice, e non scrive sopra niente', async () => {
    const t = prepara()
    await t.r.avvia('p-qui')
    writeFileSync(join(t.doppia, 'solo-doppia.txt'), 'cambiato')
    const st = await t.r.conferma('p-qui')
    expect(st.messaggio).toContain('solo-doppia.txt')
    expect(existsSync(join(t.vera, 'solo-doppia.txt'))).toBe(false)
  })
})

describe('le cartelle di qui con lo stesso nome (trovato nella prova dal vero)', () => {
  it('anche accanto a una cartella registrata: «Rendi residente qui» le vede tutte', async () => {
    const { cartelleTrovateQui, primaTrovata } = await import('../../src/main/pannello-drive-dati')
    const { raggruppaProgetti } = await import('../../src/shared/progetti-unificati')
    const gruppi = raggruppaProgetti([{ id: 'a', nome: 'sito (2)', percorsi: { 'pc-qui': 'E:\\Altro\\sito (2)' } }])
    const locali = [{ cwd: 'E:\\Progetti\\Sito', mtime: 2 }, { cwd: 'E:\\Progetti\\Sito\\src', mtime: 5 }, { cwd: 'E:\\Altro\\sito (2)', mtime: 1 }]
    // Il pannello: il progetto qui ha già una cartella registrata, la trovata non si mostra al suo posto.
    expect(cartelleTrovateQui(gruppi, 'pc-qui', locali)).toEqual({})
    // L'unione: la cartella con lo stesso nome c'è, una volta sola, e non è quella registrata.
    expect(cartelleTrovateQui(gruppi, 'pc-qui', locali, undefined, true)).toEqual({ a: ['E:\\Progetti\\Sito'] })
    expect(primaTrovata({ a: ['X', 'Y'], b: [] })).toEqual({ a: 'X' })
  })
})
