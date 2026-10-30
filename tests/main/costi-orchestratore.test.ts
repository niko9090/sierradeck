import { describe, it, expect, afterEach } from 'vitest'
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cartellaDelWorkspace, creaLettoreCosti, leggiTurni, sommaTurni } from '../../src/main/costi-orchestratore'
import { cartellaWorkspace } from '../../src/autopilot-host/coda-store'

/**
 * I costi dell'orchestratore nel pannello dei consumi: il main legge soltanto
 * i `costi.jsonl` che il servizio scrive, e li somma per periodo.
 */
const cartelle: string[] = []
afterEach(() => { for (const c of cartelle.splice(0)) rmSync(c, { recursive: true, force: true }) })
const nuova = (): string => { const c = mkdtempSync(join(tmpdir(), 'costi-orch-')); cartelle.push(c); return c }

const ora = new Date(2026, 9, 30, 15, 0, 0).getTime()
const riga = (quando: number, usd: number): string => `${JSON.stringify({ quando: new Date(quando).toISOString(), usd, input: 10, output: 5, cacheLettura: 0, cacheScrittura: 0, contesto: 1000 })}\n`

describe('il nome della cartella di un workspace', () => {
  it('è lo stesso del servizio', () => {
    for (const ws of ['Lavoro', 'Clienti: Rossi & figli', 'àèìòù', '', '...', 'x'.repeat(90)]) {
      expect(cartellaDelWorkspace(ws), ws).toBe(cartellaWorkspace(ws))
    }
  })
})

describe('leggiTurni e sommaTurni', () => {
  it('salta le righe rotte e somma oggi, sette giorni e da sempre', () => {
    const testo = riga(ora - 60_000, 0.5) + 'non json\n' + riga(ora - 3 * 86_400_000, 1.25) + riga(ora - 30 * 86_400_000, 2) + '{"quando":"x","usd":1}\n'
    const turni = leggiTurni(testo)
    expect(turni).toHaveLength(3)
    const c = sommaTurni('Lavoro', turni, ora)
    expect(c).toMatchObject({ workspace: 'Lavoro', turni: 3, ultimo: ora - 60_000 })
    expect(c.oggi).toBeCloseTo(0.5)
    expect(c.settimana).toBeCloseTo(1.75)
    expect(c.totale).toBeCloseTo(3.75)
  })
})

describe('creaLettoreCosti', () => {
  it('ridà il nome vero ai workspace noti, e tiene quello della cartella per gli altri', () => {
    const radice = nuova()
    const noto = join(radice, cartellaDelWorkspace('Lavoro'))
    mkdirSync(noto)
    writeFileSync(join(noto, 'costi.jsonl'), riga(ora - 1000, 0.2) + riga(ora - 2 * 86_400_000, 0.3))
    const altro = join(radice, cartellaDelWorkspace('Vecchio'))
    mkdirSync(altro)
    writeFileSync(join(altro, 'costi.jsonl'), riga(ora - 10 * 86_400_000, 4))
    // Una cartella senza costi non compare.
    mkdirSync(join(radice, cartellaDelWorkspace('Vuoto')))
    const leggi = creaLettoreCosti(radice)
    const esito = leggi(['Lavoro'], ora)
    expect(esito.map((c) => c.workspace)).toEqual(['Lavoro', 'Vecchio'])
    expect(esito[0]?.settimana).toBeCloseTo(0.5)
    // Una riga nuova si vede alla lettura dopo.
    appendFileSync(join(noto, 'costi.jsonl'), riga(ora - 500, 1))
    expect(leggi(['Lavoro'], ora)[0]?.oggi).toBeCloseTo(1.2)
  })

  it('senza la cartella non c è niente da mostrare', () => {
    expect(creaLettoreCosti(join(nuova(), 'non-c-e'))(['Lavoro'], ora)).toEqual([])
  })
})
