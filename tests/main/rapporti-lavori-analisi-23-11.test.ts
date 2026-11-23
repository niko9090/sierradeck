import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { contaLavori, lavoriVuoti, type RapportoLavori } from '../../src/shared/rapporto-lavori'
import { salvaRapportoArrivato, CARTELLA_RAPPORTI } from '../../src/main/rapporti-lavori'
import { giroAnalisiRapporti, leggiStatoAnalisi, QUIETE_RAPPORTI_MS, riassumi, testoRiassunto } from '../../src/main/rapporti-lavori-analisi'

const T0 = Date.parse('2026-11-23T10:00:00.000Z')
const T = (min: number): string => new Date(T0 + min * 60_000).toISOString()
const riga = (iso: string, t: string): string => `${iso} [info] [servizio] ${t}`

function rapporto(da: string, dalMin: number, alMin: number, righe: string[]): RapportoLavori {
  const c = contaLavori(righe)
  return { da, versione: '1.0.0', giorno: T(alMin).slice(0, 10), dal: T(dalMin), al: T(alMin), workspace: c.workspace }
}

const RIGHE_A = [
  riga(T(1), '[unione di prova] ramo-a: attesa del turno 120 s, prova 400 s'),
  riga(T(2), '[unione di prova] ramo-b: attesa del turno 10 s, prova 2700 s (scaduta mentre stava per misurare il criterio)'),
  riga(T(3), '[criterio] finito con 1 in 20 s: npm run typecheck'),
  riga(T(4), '[aiuto] ws-uno — sviluppatore affidato a pc-prova (Aiutante, 2 posti liberi là)'),
  riga(T(5), '[aiuto] ws-uno — revisore affidato a pc-prova (Aiutante, 1 posto libero là)'),
  riga(T(6), '[orchestratore] ws-uno — permesso negato dal programma: scrittura fuori dalla copia'),
  riga(T(7), '[servizio] fermo 12.5 s senza rispondere (3 volte oltre 5 s dall\'ultima riga)'),
  riga(T(8), '━━━ sessione avviata · SierraDeck v1 · win32 · Node 20 · Electron 30 ━━━'),
  riga(T(9), '[orchestratore] ws-uno — risponde: testo privato della chat da non riportare')
]
const RIGHE_B = [
  riga(T(11), '[criterio] finito con 0 in 50 s: npx vitest run un-file.test.ts'),
  riga(T(12), '[aiuto] ws-due — sviluppatore affidato a pc-prova (Aiutante, 2 posti liberi là)'),
  riga(T(13), '[orchestratore] ws-due — permesso negato dal programma: rete')
]

let radice: string
beforeEach(() => { radice = mkdtempSync(join(tmpdir(), 'rapporti-analisi-')) })
afterEach(() => { rmSync(radice, { recursive: true, force: true }) })

describe('riassumi', () => {
  it('niente rapporti: niente riassunto', () => {
    expect(riassumi([])).toBeUndefined()
  })

  it('per PC e per workspace, con somme e massimi', () => {
    const r = riassumi([rapporto('pc-uno', 0, 10, RIGHE_A), rapporto('pc-due', 10, 20, RIGHE_B), rapporto('pc-uno', 20, 30, RIGHE_B)])!
    expect(r.rapporti).toBe(3)
    expect(Object.keys(r.pc).sort()).toEqual(['pc-due', 'pc-uno'])
    expect(r.pc['pc-uno']!['ws-due']!.compiti.affidati).toBe(1)
    expect(r.pc['pc-uno']!['ws-uno']!.compiti.ruoli).toEqual({ sviluppatore: 1, revisore: 1 })
    expect(r.totale['ws-due']!.compiti.affidati).toBe(2)
    expect(r.totale['ws-due']!.compiti.rifiuti).toBe(2)
    const g = r.totale.generale!
    expect(g.unioni).toMatchObject({ prove: 2, scadute: 1, attesaMaxMs: 120_000, provaMaxMs: 2_700_000 })
    expect(g.criteri).toMatchObject({ finiti: 3, riusciti: 2, rossi: 1 })
    expect(g.fermate).toMatchObject({ fermo: 1, riavvii: 1, fermoMaxMs: 12_500 })
    expect(r.dal).toBe(T(0))
    expect(r.al).toBe(T(30))
  })

  it('solo i rapporti dopo il punto già riassunto', () => {
    const r = riassumi([rapporto('pc-uno', 0, 10, RIGHE_A), rapporto('pc-due', 10, 20, RIGHE_B)], T(10))!
    expect(r.rapporti).toBe(1)
    expect(Object.keys(r.pc)).toEqual(['pc-due'])
  })
})

describe('testoRiassunto', () => {
  const testo = testoRiassunto('x1', riassumi([rapporto('pc-uno', 0, 10, RIGHE_A), rapporto('pc-due', 10, 20, RIGHE_B)])!)

  it('dice unioni lente e scadute con il motivo, criteri rossi, ruoli, permessi, fermate e riavvii', () => {
    expect(testo).toContain('LENTE')
    expect(testo).toContain('scadute 1')
    expect(testo).toContain('scaduta: misurare il criterio ×1')
    expect(testo).toContain('1 ROSSI')
    expect(testo).toContain('per ruolo: sviluppatore ×1, revisore ×1')
    expect(testo).toContain('permessi negati dal programma: 1')
    expect(testo).toContain('fermate del programma: 1')
    expect(testo).toContain('riavvii: 1')
  })

  it('ha una sezione per PC e per workspace', () => {
    expect(testo).toContain('## PC pc-uno')
    expect(testo).toContain('## PC pc-due')
    expect(testo).toContain('### workspace ws-uno')
    expect(testo).toContain('### workspace ws-due')
  })

  it('privacy: niente testi di chat', () => {
    expect(testo).not.toContain('testo privato')
    expect(testo).not.toContain('chat da non riportare')
  })

  it('un workspace senza lavori non compare', () => {
    const r = riassumi([{ da: 'pc-uno', giorno: '2026-11-23', dal: T(0), al: T(1), workspace: { vuoto: lavoriVuoti() } }])!
    expect(testoRiassunto('x', r)).not.toContain('workspace vuoto')
  })
})

describe('giroAnalisiRapporti, con file veri', () => {
  const salva = (r: RapportoLavori): void => { expect(salvaRapportoArrivato(radice, r).ok).toBe(true) }
  const deps = (adesso: number, richieste: Array<{ testo: string; cwd: string }>, log: string[] = []) => ({
    radice: () => radice,
    adesso: () => adesso,
    affida: async (p: { testo: string; cwd: string }) => { richieste.push(p) },
    log: (r: string) => { log.push(r) },
    nuovoId: () => 'id1'
  })

  it('senza cartella dei rapporti non fa niente', async () => {
    const richieste: Array<{ testo: string; cwd: string }> = []
    expect(await giroAnalisiRapporti(deps(T0 + 3_600_000, richieste))).toBeUndefined()
    expect(richieste).toEqual([])
  })

  it('aspetta la quiete, poi scrive il riassunto, lo affida e segna lo stato', async () => {
    salva(rapporto('pc-uno', 0, 10, RIGHE_A))
    salva(rapporto('pc-due', 10, 20, RIGHE_B))
    const richieste: Array<{ testo: string; cwd: string }> = []
    const log: string[] = []
    // Troppo presto: l'ultimo rapporto è appena arrivato.
    expect(await giroAnalisiRapporti(deps(Date.parse(T(20)) + QUIETE_RAPPORTI_MS - 1, richieste, log))).toBeUndefined()
    expect(richieste).toEqual([])
    const file = await giroAnalisiRapporti(deps(Date.parse(T(20)) + QUIETE_RAPPORTI_MS, richieste, log))
    expect(file).toBe(join(radice, CARTELLA_RAPPORTI, 'riassunto-id1.md'))
    expect(existsSync(file!)).toBe(true)
    const md = readFileSync(file!, 'utf8')
    expect(md).toContain('## PC pc-uno')
    expect(md).toContain('LENTE')
    expect(richieste).toHaveLength(1)
    expect(richieste[0]!.cwd).toBe(radice)
    expect(richieste[0]!.testo).toContain('riassunto-id1.md')
    expect(richieste[0]!.testo).toContain('2 rapporti')
    expect(leggiStatoAnalisi(radice)).toMatchObject({ fino: T(20), riassunti: [{ id: 'id1', rapporti: 2 }] })
    expect(log.join('\n')).toContain('riassunto id1')
  })

  it('un secondo giro senza rapporti nuovi non rimanda niente; con uno nuovo riassume solo quello', async () => {
    salva(rapporto('pc-uno', 0, 10, RIGHE_A))
    const richieste: Array<{ testo: string; cwd: string }> = []
    const tardi = Date.parse(T(100))
    await giroAnalisiRapporti(deps(tardi, richieste))
    expect(await giroAnalisiRapporti(deps(tardi + 1000, richieste))).toBeUndefined()
    expect(richieste).toHaveLength(1)
    salva(rapporto('pc-due', 10, 60, RIGHE_B))
    let n = 0
    const file = await giroAnalisiRapporti({ ...deps(tardi + 2000, richieste), nuovoId: () => `id${++n + 1}` })
    expect(file).toBe(join(radice, CARTELLA_RAPPORTI, 'riassunto-id2.md'))
    const md = readFileSync(file!, 'utf8')
    expect(md).toContain('## PC pc-due')
    expect(md).not.toContain('## PC pc-uno')
    expect(richieste).toHaveLength(2)
    expect(leggiStatoAnalisi(radice).riassunti).toHaveLength(2)
  })

  it('se l’autopilota non prende la richiesta lo stato non avanza e si riprova', async () => {
    salva(rapporto('pc-uno', 0, 10, RIGHE_A))
    const log: string[] = []
    const rotto = { ...deps(Date.parse(T(100)), [], log), affida: async () => { throw new Error('autopilota spento') } }
    expect(await giroAnalisiRapporti(rotto)).toBeUndefined()
    expect(log.join('\n')).toContain('autopilota spento')
    expect(leggiStatoAnalisi(radice).fino).toBeUndefined()
    const richieste: Array<{ testo: string; cwd: string }> = []
    expect(await giroAnalisiRapporti(deps(Date.parse(T(100)), richieste))).toBeDefined()
    expect(richieste).toHaveLength(1)
  })

  it('i file del riassunto e dello stato non si leggono come rapporti', async () => {
    salva(rapporto('pc-uno', 0, 10, RIGHE_A))
    await giroAnalisiRapporti(deps(Date.parse(T(100)), []))
    expect(readdirSync(join(radice, CARTELLA_RAPPORTI)).sort()).toEqual(['.analisi.json', 'pc-uno', 'riassunto-id1.md'].sort())
    expect(await giroAnalisiRapporti(deps(Date.parse(T(200)), []))).toBeUndefined()
  })
})
