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

describe('0.76.0: una cartella di chat nel recupero non torna dal Drive', () => {
  it('le cartelle in ~/.claude/projects nel recupero, tranne quelle rimesse a posto; le altre cartelle no', async () => {
    const { slugChatInRecupero, ripristinaDaRecupero } = await import('../../src/main/rimozione-sicura')
    const dati = tmp('sd-dati-'); const radice = tmp('sd-claude-'); const progetti = tmp('sd-progetti-')
    const storia = join(radice, 'C--p-SierraDeck-prova-c2'); mkdirSync(storia); writeFileSync(join(storia, 's.jsonl'), '{}\n')
    const altra = join(radice, 'C--p-SierraDeck-prova-c3'); mkdirSync(altra); writeFileSync(join(altra, 's.jsonl'), '{}\n')
    const cartella = join(progetti, 'SierraDeck-prova-c2'); mkdirSync(cartella)
    expect(spostaCartellaInRecupero(dati, storia, { progetto: '', nome: 'C--p-SierraDeck-prova-c2', motivo: 'prova', quando: '2026-10-16T08:00:00.000Z' }).ok).toBe(true)
    const e3 = spostaCartellaInRecupero(dati, altra, { progetto: '', nome: 'C--p-SierraDeck-prova-c3', motivo: 'prova', quando: '2026-10-16T08:00:01.000Z' })
    expect(spostaCartellaInRecupero(dati, cartella, { progetto: 'p', nome: 'SierraDeck-prova-c2', motivo: 'prova', quando: '2026-10-16T08:00:02.000Z' }).ok).toBe(true)
    expect([...slugChatInRecupero(dati, radice)].sort()).toEqual(['C--p-SierraDeck-prova-c2', 'C--p-SierraDeck-prova-c3'])
    // Rimessa a posto: torna a poter arrivare dal Drive.
    if (e3.ok) expect(ripristinaDaRecupero(dati, e3.id, '2026-10-16T09:00:00.000Z').ok).toBe(true)
    expect([...slugChatInRecupero(dati, radice)]).toEqual(['C--p-SierraDeck-prova-c2'])
  })

  it('l’arrivo dal Drive salta quelle chat e lo dice', async () => {
    const { readFileSync } = await import('node:fs')
    const s = readFileSync('src/main/cassaforte/sincronia.ts', 'utf8')
    expect(s).toContain("if (inRecupero.has(p.split('/')[1] ?? '')) { nelRecupero += 1; return false }")
  })
})
