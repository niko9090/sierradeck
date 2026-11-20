import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { MENU_PRINCIPALE, MENU_TELEFONO, FUNZIONI, voceMenu } from '../../src/shared/menu-principale'
import { dividiCorrezioni, eRichiestaErrori } from '../../src/shared/correzioni'
import type { Richiesta } from '../../src/shared/coda-richieste'

/** k-166m2: la voce «Correzioni» nel menu unico, e Salute che rimanda invece di duplicare. */
const leggi = (p: string): string => readFileSync(p, 'utf8')

const richiesta = (id: string, titolo: string, stato: Richiesta['stato'], extra: Partial<Richiesta> = {}): Richiesta => ({
  id, creata: '2026-11-01T10:00:00Z', titolo, testo: titolo, originali: [], punti: [], unioni: [], stato, compiti: [], ...extra
})

describe('voce Correzioni', () => {
  it('è nel menu del PC, una volta sola, con la sua casa; non va su telefono e app', () => {
    const v = voceMenu('correzioni')
    expect(v.nome).toBe('Correzioni')
    expect(MENU_PRINCIPALE.filter((x) => x.id === 'correzioni')).toHaveLength(1)
    expect(v.soloPc).toBe(true)
    expect(FUNZIONI.some((f) => f.dove === 'correzioni')).toBe(true)
    expect(MENU_TELEFONO.flatMap((t) => t.contiene)).not.toContain('correzioni')
    expect(leggi('android/app/src/main/assets/menu.json')).not.toContain('"id": "correzioni"')
  })

  it('la fascia la apre, App disegna la pagina', () => {
    const c = leggi('src/renderer/components/Console.tsx')
    expect(c).toMatch(/PannelloAperto = [^\n]*'correzioni'/)
    expect(c).toContain("quale === 'correzioni'")
    expect(leggi('src/renderer/App.tsx')).toContain("aperto === 'correzioni'")
  })

  it('la pagina mostra errori arrivati, lavoro in corso e correzioni fatte, con la spiegazione dietro «?»', () => {
    const p = leggi('src/renderer/components/PannelloCorrezioni.tsx')
    for (const t of ['Errori arrivati', 'Lavoro in corso', 'Correzioni fatte', '<Aiuto', 'errori.correzioni()', 'dividiCorrezioni']) expect(p, t).toContain(t)
  })

  it('Salute non duplica più gli errori: ha solo il rimando', () => {
    const s = leggi('src/renderer/components/PannelloSalute.tsx')
    expect(s).toContain('Vedi Correzioni')
    expect(s).toContain("g.id !== 'errori'")
    expect(s).toContain("v.gruppo !== 'errori'")
  })

  it('separa le richieste «Errori arrivati»: aperte e fatte, le altre restano fuori', () => {
    const r = [
      richiesta('r-1', 'Errori arrivati: 3 gruppi di errori', 'in-corso'),
      richiesta('r-2', 'Errori arrivati: 1 gruppo', 'fatta', { fattaIl: '2026-11-05T10:00:00Z', versione: '0.1.0' }),
      richiesta('r-3', 'Errori arrivati: 2 gruppi', 'fatta', { fattaIl: '2026-11-09T10:00:00Z' }),
      richiesta('r-4', 'Cambia il colore del tasto', 'in-corso'),
      richiesta('r-5', 'Altro', 'in-coda', { testo: '  Errori arrivati: lotto', titolo: 'Lotto' })
    ]
    expect(eRichiestaErrori(r[3]!)).toBe(false)
    const { inCorso, fatte } = dividiCorrezioni(r)
    expect(inCorso.map((x) => x.id)).toEqual(['r-1', 'r-5'])
    expect(fatte.map((x) => x.id)).toEqual(['r-3', 'r-2'])
  })
})
