import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriIdentitaPc, cartellaProgettiDellaProva } from '../../src/main/progetti/pc'
import { leggiElencoRecupero, spostaCartellaInRecupero, storieDiProvaInRecupero } from '../../src/main/rimozione-sicura'
import { pathToSlug } from '../../src/main/indexer/project-scanner'

/**
 * 0.75.2, le prove che restavano indietro (consegna c-26, Nicholas: «le chat
 * che hai usato per le prove vanno tolte!»). Due pezzi li lasciava il
 * programma da solo:
 * - la copia di prova creava i workspace nuovi fra i progetti veri;
 * - togliere un progetto di prova lasciava le sue conversazioni in
 *   ~/.claude/projects, e con loro sul Drive.
 * Solo cartelle temporanee.
 */
const tmp = (p: string): string => mkdtempSync(join(tmpdir(), p))

describe('la copia di prova tiene i suoi progetti dentro di sé', () => {
  it('con SIERRADECK_PROVA la cartella dei progetti è nella prova, anche se il pc.json copiato dice la home', () => {
    const prova = tmp('sd-prova-'); const dati = join(prova, 'SierraDeck'); const casa = tmp('sd-casa-')
    mkdirSync(dati, { recursive: true })
    mkdirSync(join(casa, 'Progetti SierraDeck'))
    writeFileSync(join(dati, 'pc.json'), JSON.stringify({ id: 'abc', nome: 'Torre', cartellaProgetti: join(casa, 'Progetti SierraDeck') }))
    const pc = apriIdentitaPc(dati, { nome: () => 'Torre', casa: () => casa, documenti: () => casa, prova })
    expect(pc.leggi().cartellaProgetti).toBe(join(prova, 'Progetti SierraDeck'))
  })

  it('una cartella scelta dentro la prova resta; fuori no', () => {
    const prova = tmp('sd-prova-')
    expect(cartellaProgettiDellaProva(prova, join(prova, 'altri'))).toBe(join(prova, 'altri'))
    expect(cartellaProgettiDellaProva(prova, join(prova, '..', 'fuori'))).toBe(join(prova, 'Progetti SierraDeck'))
    expect(cartellaProgettiDellaProva(prova, undefined)).toBe(join(prova, 'Progetti SierraDeck'))
  })

  it('senza la prova non cambia niente', () => {
    const dati = tmp('sd-dati-'); const casa = tmp('sd-casa-')
    writeFileSync(join(dati, 'pc.json'), JSON.stringify({ id: 'abc', nome: 'Torre', cartellaProgetti: join(casa, 'scelta') }))
    expect(apriIdentitaPc(dati, { nome: () => 'Torre', casa: () => casa }).leggi().cartellaProgetti).toBe(join(casa, 'scelta'))
  })
})

describe('togliere un progetto di prova porta nel recupero anche le sue conversazioni', () => {
  const scena = () => {
    const dati = tmp('sd-dati-'); const progetti = tmp('sd-progetti-'); const radice = tmp('sd-claude-')
    const cartella = join(progetti, 'SierraDeck-prova-c2')
    mkdirSync(cartella)
    const voce = (nome: string): string => { const p = join(radice, nome); mkdirSync(p); writeFileSync(join(p, 'sessione.jsonl'), '{}\n'); return p }
    return { dati, radice, cartella, voce }
  }

  it('la storia della cartella di qui e le copie arrivate da un altro PC vanno nel recupero; le altre restano', () => {
    const s = scena()
    const qui = s.voce(pathToSlug(s.cartella))
    const altroPc = s.voce('E--Documents-Progetti-SierraDeck-SierraDeck-prova-c2')
    const simile = s.voce('E--Documents-Progetti-SierraDeck-SierraDeck-prova-c20')
    const vera = s.voce('E--Documents-Progetti-SierraDeck-SierraDeck')
    const quando = '2026-10-16T08:00:00.000Z'
    expect(spostaCartellaInRecupero(s.dati, s.cartella, { progetto: 'p1', nome: 'SierraDeck-prova-c2', motivo: 'prova', quando }).ok).toBe(true)
    const e = storieDiProvaInRecupero(s.dati, s.radice, s.cartella, { progetto: 'p1', nome: 'SierraDeck-prova-c2', quando })
    expect(e.spostate.sort()).toEqual([pathToSlug(s.cartella), 'E--Documents-Progetti-SierraDeck-SierraDeck-prova-c2'].sort())
    expect(existsSync(qui)).toBe(false)
    expect(existsSync(altroPc)).toBe(false)
    expect(existsSync(simile)).toBe(true)
    expect(existsSync(vera)).toBe(true)
    const elenco = leggiElencoRecupero(s.dati)
    expect(elenco).toHaveLength(3)
    for (const c of elenco) expect(existsSync(join(c.dove, c.nome === 'SierraDeck-prova-c2' ? '' : 'sessione.jsonl'))).toBe(true)
    expect(elenco.every((c) => c.scadeIl > quando)).toBe(true)
  })

  it('per un progetto vero non tocca niente', () => {
    const s = scena()
    const vera = join(s.cartella, '..', 'Wdeck')
    mkdirSync(vera)
    const storia = s.voce(pathToSlug(vera))
    const e = storieDiProvaInRecupero(s.dati, s.radice, vera, { progetto: 'p2', nome: 'Wdeck', quando: '2026-10-16T08:00:00.000Z' })
    expect(e.spostate).toEqual([])
    expect(existsSync(storia)).toBe(true)
    expect(leggiElencoRecupero(s.dati)).toEqual([])
  })
})
