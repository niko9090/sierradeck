import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { causaDaAutopilota, decidiCambioSchermo, leggiCausa, type CausaCambio } from '../../src/shared/cambio-schermo'
import { comePortare } from '../../src/renderer/consegna-visibile'
// In cima, non dentro il test: `window` lo leggono solo quando si chiamano, e
// l'import a freddo dentro il test (con `resetModules`) costava fino a 8 s col
// PC carico, contro i 0,3 s degli altri (20/10).
import { impostaWorkspaceCorrente } from '../../src/renderer/workspace-corrente'
import { cambiaSchermo } from '../../src/renderer/cambio-schermo'

/**
 * Nicholas, 19/10 (0.80.0): «il workspace sullo schermo cambia da solo». Ogni
 * cambio passa da un punto unico, va nel registro con la causa, e una causa
 * che viene da un autopilota è rifiutata. Un test per ogni strada.
 */
const app = readFileSync('src/renderer/App.tsx', 'utf8')
const blocco = (inizio: string, lunghezza = 1600): string => {
  const i = app.indexOf(inizio)
  expect(i, inizio).toBeGreaterThan(0)
  return app.slice(i, i + lunghezza)
}

describe('la regola', () => {
  it('le cause di Nicholas cambiano lo schermo, quelle di un autopilota no', () => {
    for (const causa of ['nicholas', 'telefono', 'ripresa', 'eliminato'] as CausaCambio[]) {
      expect(decidiCambioSchermo({ davanti: 'A', voluto: 'B', causa }).cambia, causa).toBe(true)
    }
    for (const causa of ['autopilota', 'consegna', 'adozione'] as CausaCambio[]) {
      const d = decidiCambioSchermo({ davanti: 'A', voluto: 'B', causa })
      expect(d.cambia, causa).toBe(false)
      expect(d.riga).toContain('rifiutato')
      expect(causaDaAutopilota(causa)).toBe(true)
    }
  })

  it('ogni decisione ha la sua riga di registro, con il prima, il dopo e la causa', () => {
    const d = decidiCambioSchermo({ davanti: 'A', voluto: 'B', causa: 'telefono', dettaglio: 'prova' })
    expect(d.riga).toBe('[schermo] «A» → «B» (scelto da te dal telefono: prova)')
    expect(decidiCambioSchermo({ davanti: 'B', voluto: 'B', causa: 'nicholas' })).toMatchObject({ cambia: false })
  })

  it('una causa sconosciuta che arriva da fuori vale il ripiego scelto da chi la legge', () => {
    expect(leggiCausa('autopilota', 'ripresa')).toBe('autopilota')
    expect(leggiCausa('qualcosa', 'ripresa')).toBe('ripresa')
    expect(leggiCausa(undefined, 'ripresa')).toBe('ripresa')
  })
})

describe('il punto unico', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('scrive nel registro e, per un autopilota, non cambia', async () => {
    const righe: string[] = []
    vi.stubGlobal('window', { gestore: { log: { info: (r: string) => { righe.push(r); return Promise.resolve() } } } })
    impostaWorkspaceCorrente('A')
    const cambiati: string[] = []
    const azioni = { cambia: async (n: string): Promise<void> => { cambiati.push(n) } }
    expect(await cambiaSchermo('B', 'consegna', 'consegna c-1', azioni)).toBe(false)
    expect(await cambiaSchermo('B', 'nicholas', 'dalla barra', azioni)).toBe(true)
    expect(cambiati).toEqual(['B'])
    expect(righe[0]).toContain('rifiutato')
    expect(righe[1]).toContain('«A» → «B» (scelto da te sul PC: dalla barra)')
  })

  it('nel renderer nessun altro cambia il workspace a schermo', () => {
    const file = (d: string): string[] => readdirSync(d).flatMap((x) => { const p = join(d, x); return statSync(p).isDirectory() ? file(p) : /\.tsx?$/.test(x) ? [p] : [] })
    const fuori = file('src/renderer')
      .filter((p) => !/cambio-schermo\.ts$|workspace-azioni\.ts$|azioni-finestra\.ts$/.test(p))
      .filter((p) => /\.cambia\(/.test(readFileSync(p, 'utf8')))
    expect(fuori).toEqual([])
  })
})

describe('le strade', () => {
  it('ripresa (finestraPerRipresa → client:apri): passa dal punto unico con la causa; rifiutata, la chat va nel suo workspace senza cambiare lo schermo', () => {
    const b = blocco('window.gestore.client.suApertura(', 4000)
    expect(b).toContain("cambiaSchermo(workspace, leggiCausa(causa, 'ripresa')")
    expect(b).toContain('window.gestore.workspace.spostaChat(workspace,')
  })

  it('client:chiudiChat dal telefono: chiude il riquadro e basta, senza cambiare workspace', () => {
    const b = blocco('window.gestore.client.suChiusura(', 700)
    expect(b.slice(0, b.indexOf('}), [])'))).not.toMatch(/cambia|cambiaSchermo/)
  })

  it('consegne: un workspace che non è davanti va in sottofondo, anche a tastiera ferma; il ponte rifiuta di tornarci', () => {
    expect(comePortare({ workspace: 'B' }, 'A', undefined, 1_000_000)).toBe('sottofondo')
    expect(blocco('tornaNelSuoWorkspace: (c', 400)).toContain("cambiaSchermo(c.workspace, 'consegna'")
    expect(app).toContain('eseguiConsegna({ ...c, sottofondo: true }')
    // Solo «Guarda» (Nicholas) porta la finestra là.
    expect(app).toContain("cambiaSchermo(c.workspace as string, subito ? 'nicholas' : 'consegna'")
  })

  it('adozione: le chat adottate ricevono i messaggi per consegna e il motore non apre né cambia workspace', () => {
    const adozione = readFileSync('src/main/adozione-chat.ts', 'utf8')
    expect(adozione).not.toMatch(/client:apri|client:workspace|\.cambia\(/)
    expect(decidiCambioSchermo({ davanti: 'A', voluto: 'B', causa: 'adozione' }).cambia).toBe(false)
  })

  it('seguire un’altra finestra resta, e va nel registro', () => {
    expect(blocco('window.gestore.workspace.onCambiato((s)', 400)).toContain('segue un cambio fatto in un’altra finestra')
  })
})
