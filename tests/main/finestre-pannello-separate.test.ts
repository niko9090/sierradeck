import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Le finestre pannello (0.38.0) non sono finestre di chat. Il main tratta ogni
 * BrowserWindow come una finestra di chat (slot, layout, tray, conteggio,
 * consegne): chi enumera le finestre deve usare `finestreDiChat()`, che esclude
 * le finestre pannello.
 */
const index = readFileSync('src/main/index.ts', 'utf8')
const ipc = readFileSync('src/main/ipc.ts', 'utf8')
const pannelli = readFileSync('src/main/finestre-pannello.ts', 'utf8')
const ingresso = readFileSync('src/renderer/main.tsx', 'utf8')

describe('le finestre pannello sono separate dalle finestre di chat', () => {
  it('nessuno nel main enumera le finestre senza escludere i pannelli', () => {
    expect(index).not.toContain('BrowserWindow.getAllWindows()')
    expect(ipc).not.toContain('BrowserWindow.getAllWindows()')
    expect(index).toContain('finestreDiChat()')
    // E nemmeno le finestre di servizio (0.40.0: il ponte WebRTC, nascosto).
    expect(pannelli).toContain('BrowserWindow.getAllWindows().filter((w) => !aperte.has(w.id) && !diServizio.has(w.id))')
  })
  it('stesse difese delle altre finestre, e nessun aggancio da chat', () => {
    expect(pannelli).toMatch(/contextIsolation: true/)
    expect(pannelli).toMatch(/nodeIntegration: false/)
    expect(pannelli).toContain('preload,')
    expect(pannelli).not.toContain('collegaFinestra')
    expect(pannelli).not.toContain('riservaSlot')
  })
  it('chiusa lei, la linguetta torna al suo posto; chiusa l app, resta da riaprire', () => {
    expect(pannelli).toContain("if (!uscendo) {")
    expect(pannelli).toContain("app.on('before-quit', () => { uscendo = true })")
    expect(index).toContain('riapriPannelli(tutti.map((a) => a.id))')
    expect(index).toContain('chiudiPannelliConLApp()')
  })
  it('il renderer di una finestra pannello mostra solo la linguetta', () => {
    expect(ingresso).toContain('<FinestraPannello autopilotaId={autopilotaPannello} linguetta={pannello} />')
  })
})
