import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { sorgenteRemota, SORGENTE_LOCALE } from '../../src/renderer/sorgente-autopilota'

/**
 * 0.102.0 (Nicholas, 12/11: «la grafica sia IDENTICA a quello che vedrebbe su
 * quel PC»): le schermate dell'autopilota sono le stesse per qui e per un
 * altro PC; cambia solo la sorgente. Quella remota chiama le rotte del PC dove
 * vive il workspace.
 */
type Chiamata = { pc: string; percorso: string; corpo: Record<string, unknown> }
let chiamate: Chiamata[] = []
let risposte: Record<string, unknown> = {}

beforeEach(() => {
  chiamate = []
  risposte = {}
  ;(globalThis as unknown as { window: unknown }).window = {
    gestore: {
      autopilotiAltri: {
        azione: vi.fn(async (pc: string, percorso: string, corpo: Record<string, unknown>) => {
          chiamate.push({ pc, percorso, corpo })
          if (percorso in risposte) return { ok: true, stato: 200, dati: risposte[percorso] }
          return { ok: false, stato: 502, messaggio: 'Portatile non risponde' }
        })
      }
    }
  }
})

describe('la sorgente di un altro PC', () => {
  it('orchestratore e coda arrivano da una chiamata sola all’avanzamento di quel PC', async () => {
    risposte['/api/autopilota/avanzamento'] = { orchestratore: { percento: 40, specialisti: [] }, coda: { richieste: [] } }
    const s = sorgenteRemota('pc-la', 'Portatile')
    const [o, c] = await Promise.all([s.orchestratore('SierraDeck'), s.coda('SierraDeck')])
    expect(o?.percento).toBe(40)
    expect(c).toEqual({ richieste: [], compattate: [] })
    expect(chiamate).toEqual([{ pc: 'pc-la', percorso: '/api/autopilota/avanzamento', corpo: { workspace: 'SierraDeck' } }])
  })

  it('scrivere, rispondere, gli specialisti e la lista d’attesa vanno a quel PC', async () => {
    risposte['/api/autopilota/dialogo'] = { fatto: true }
    risposte['/api/rispondi'] = { fatto: true }
    risposte['/api/autopilota/specialista'] = { id: 'c-1', righe: [{ tipo: 'testo', testo: 'ciao' }] }
    risposte['/api/specialisti/attesa'] = { posti: { usati: 1, tetto: 4 }, alLavoro: [], inFila: [] }
    const s = sorgenteRemota('pc-la2', 'Portatile')
    await s.dialoga('ap-1', 'come va?')
    await s.rispondi('d-1', 'sì')
    expect((await s.specialista('Ws', 'c-1'))?.righe).toHaveLength(1)
    expect((await s.attesa())?.posti.tetto).toBe(4)
    expect(chiamate.map((x) => x.percorso)).toEqual(['/api/autopilota/dialogo', '/api/rispondi', '/api/autopilota/specialista', '/api/specialisti/attesa'])
    expect(chiamate[0]!.corpo).toEqual({ autopilota: 'ap-1', testo: 'come va?' })
    expect(chiamate.every((x) => x.pc === 'pc-la2')).toBe(true)
  })

  it('se quel PC non risponde il messaggio non si perde in silenzio: errore con il suo perché', async () => {
    const s = sorgenteRemota('pc-giu', 'Fisso')
    await expect(s.dialoga('ap-1', 'ciao')).rejects.toThrow('Portatile non risponde')
  })

  it('niente spinte a evento né impostazioni da qui: si cambiano sul PC dove gira', () => {
    const s = sorgenteRemota('pc-x', 'X')
    expect(s.suSpecialistiCambiati(() => undefined)).toBeUndefined()
    expect(s.impostaOrchestratore).toBeUndefined()
    expect(s.codaSepara).toBeUndefined()
    expect(s.chiave).not.toBe(SORGENTE_LOCALE.chiave)
  })
})

describe('le schermate sono le stesse', () => {
  const app = readFileSync('src/renderer/App.tsx', 'utf8')
  it('il workspace di un altro PC usa ChatAutopilota e ChatSpecialisti, non più componenti suoi', () => {
    expect(app).not.toContain('<AutopilotaRemoto')
    expect(app).toContain('<FornisciSorgente value={sorgente}>')
    expect(app).toMatch(/<FornisciSorgente value=\{sorgente\}><ChatSpecialisti/)
    expect(app).toContain('Workspace remoto · su {pcNome}')
  })
  it('i componenti leggono dalla sorgente, non da window.gestore', () => {
    for (const f of ['TestaOrchestratore', 'ChatSpecialisti', 'CodaWorkspace', 'MenuSpecialisti']) {
      const src = readFileSync(`src/renderer/components/${f}.tsx`, 'utf8')
      expect(src, f).toContain('useSorgente()')
      expect(src, f).not.toMatch(/window\.gestore\.autopilota\.(orchestratore|coda|specialista|attesaSpecialisti|prioritaAttesa|suSpecialistiCambiati)\(/)
    }
  })
})
