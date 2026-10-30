import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * L'elenco degli autopiloti è leggero (0.85.2): chi mostra la storia intera
 * (la conversazione, «Ha deciso», il Punto) la chiede da sé, e le riletture a
 * tempo sono più rade con la finestra nascosta.
 */
const leggi = (p: string): string => readFileSync(p, 'utf8')

describe('chi mostra la storia chiede l’autopilota intero', () => {
  it('la conversazione passa da `useAutopilotaIntero`', () => {
    expect(leggi('src/renderer/components/ChatAutopilota.tsx')).toContain('const autopilota = useAutopilotaIntero(dellElenco)')
  })
  it('il preload e il main hanno il dettaglio, con la versione per non rimandarlo uguale', () => {
    expect(leggi('src/preload/index.ts')).toContain("ipcRenderer.invoke('autopilota:dettaglio', id, versione)")
    expect(leggi('src/main/ipc.ts')).toContain("ipcMain.handle('autopilota:dettaglio'")
  })
})

describe('le riletture della finestra', () => {
  const app = leggi('src/renderer/App.tsx')
  it('chi lavora si guarda ogni secondo, con lo schermo riletto solo se è cambiato', () => {
    expect(app).toContain('const PASSO_PENSANO_MS = 1000')
    expect(app).toContain('righeDiPtyRecenti(p.ptyId, RIGHE_PER_IL_TELEFONO)?.pulite')
    expect(app).toContain('segnaDatiPty(msg.id)')
  })
  it('le chat partono al Core solo se cambiate, o comunque ogni dieci secondi', () => {
    expect(app).toContain('const ANNUNCIO_COMUNQUE_MS = 10_000')
    expect(app).toContain('if (firma === ultimoAnnuncio.current.firma && ora - ultimoAnnuncio.current.il < ANNUNCIO_COMUNQUE_MS) return')
  })
  it('gli autopiloti si rileggono più di rado con la finestra nascosta', () => {
    expect(app).toContain('return ogni(ricaricaAutopiloti, RICARICA_AUTOPILOTI_MS)')
  })
})
