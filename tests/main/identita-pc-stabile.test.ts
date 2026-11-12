import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync, unlinkSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriIdentitaPc } from '../../src/main/progetti/pc'

/**
 * 0.102.0: l'identità di un PC non cambia mai da sola. Un id nuovo faceva
 * sembrare tutti i progetti di questo PC «di un PC sconosciuto» e partivano
 * proposte di spostamento, rifiuti e archiviazioni.
 */
const temp: string[] = []
afterEach(() => { for (const t of temp.splice(0)) rmSync(t, { recursive: true, force: true }) })
const cartella = (): string => { const c = mkdtempSync(join(tmpdir(), 'sd-idpc-')); temp.push(c); return c }
const apri = (dati: string, casa: string) => apriIdentitaPc(dati, { nome: () => 'Torre', casa: () => casa })
const tocca = (f: string): void => { const t = new Date(Date.now() + 5000); utimesSync(f, t, t) }

describe('identità del PC stabile', () => {
  it('pc.json a zeri: si riprende dalla riserva, il rovinato si mette da parte', () => {
    const dati = cartella(); const casa = cartella()
    const id = apri(dati, casa).leggi().id
    writeFileSync(join(dati, 'pc.json'), Buffer.alloc(120))
    tocca(join(dati, 'pc.json'))
    const pc = apri(dati, casa)
    expect(pc.leggi().id).toBe(id)
    expect(JSON.parse(readFileSync(join(dati, 'pc.json'), 'utf8')).id).toBe(id)
    expect(readdirSync(dati).some((f) => f.startsWith('pc.json.rovinato-'))).toBe(true)
  })

  it('pc.json sparito: si rimette dalla riserva', () => {
    const dati = cartella(); const casa = cartella()
    const id = apri(dati, casa).leggi().id
    unlinkSync(join(dati, 'pc.json'))
    expect(apri(dati, casa).leggi().id).toBe(id)
  })

  it('nella stessa sessione l id resta quello anche se il file si rovina e la riserva manca', () => {
    const dati = cartella(); const casa = cartella()
    const pc = apri(dati, casa)
    const id = pc.leggi().id
    unlinkSync(join(dati, 'pc.json.riserva'))
    writeFileSync(join(dati, 'pc.json'), '{rotto')
    tocca(join(dati, 'pc.json'))
    expect(pc.leggi().id).toBe(id)
    expect(JSON.parse(readFileSync(join(dati, 'pc.json'), 'utf8')).id).toBe(id)
  })

  it('una installazione vecchia senza riserva se la crea', () => {
    const dati = cartella(); const casa = cartella()
    writeFileSync(join(dati, 'pc.json'), JSON.stringify({ id: 'abc123', nome: 'Torre', cartellaProgetti: casa }))
    expect(apri(dati, casa).leggi().id).toBe('abc123')
    expect(JSON.parse(readFileSync(join(dati, 'pc.json.riserva'), 'utf8')).id).toBe('abc123')
  })
})
