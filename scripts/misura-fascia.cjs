/**
 * La fascia, misurata nel motore vero: Electron, cioe' Chromium, cioe' quello
 * che disegna SierraDeck. Si stringe la finestra e si guarda quanto deborda.
 */
const { app, BrowserWindow } = require('electron')
const { join } = require('node:path')

const PAGINA = join(
  'C:', 'Users', 'nikof', 'AppData', 'Local', 'Temp', 'claude',
  'C--Users-nikof-Documents-Gestore-sessioni-ClaudeCode',
  process.argv[2] ?? 'fascia.html'
)

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1600, height: 300, show: false })
  await win.loadFile(PAGINA)
  const stili = await win.webContents.executeJavaScript(`(() => {
    const ws = document.querySelector('.sezione--cede')
    const c = getComputedStyle(ws)
    const dentro = ws.querySelector('.ws')
    return {
      classi: ws.className,
      flex: c.flex, minWidth: c.minWidth, overflowX: c.overflowX,
      dentroFlex: dentro ? getComputedStyle(dentro).flex : '(nessun .ws)',
      dentroWrap: dentro ? getComputedStyle(dentro).flexWrap : '-'
    }
  })()`)
  console.log('STILI', JSON.stringify(stili))
  for (const larghezza of [1920, 1400, 1100, 900, 700, 520]) {
    win.setSize(larghezza, 300)
    await new Promise((r) => setTimeout(r, 250))
    const m = await win.webContents.executeJavaScript(`(() => {
      const c = document.querySelector('.console')
      const tasti = [...c.querySelectorAll('.tasto, .campo')]
      const bordo = document.documentElement.clientWidth
      const fuori = tasti.filter((b) => b.getBoundingClientRect().right > bordo + 0.5)
      const r = c.getBoundingClientRect()
      return {
        finestra: bordo,
        // Quanto occupa davvero la fascia: se supera la finestra, sconfina.
        larghezzaFascia: Math.round(r.width),
        sconfina: Math.round(Math.max(0, r.right - bordo)),
        // Il contenuto e' piu' largo, ma va bene: si raggiunge scorrendo.
        contenuto: c.scrollWidth,
        scorrevole: c.scrollWidth > c.clientWidth,
        wsLarghezza: Math.round(document.querySelector('.sezione--cede')?.getBoundingClientRect().width ?? 0),
        comandiFuoriFinestra: fuori.length
      }
    })()`)
    console.log(JSON.stringify(m))
  }
  app.quit()
})
