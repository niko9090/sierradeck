// Trasforma build/icona.svg nel PNG che electron-builder userà per l'eseguibile
// e per l'installer. Lo disegna Electron stesso: è già qui, e un convertitore
// in più sarebbe una dipendenza per una cosa che si fa una volta ogni tanto.
import { app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const radice = join(dirname(fileURLToPath(import.meta.url)), '..')
const LATO = 512

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const svg = readFileSync(join(radice, 'build', 'icona.svg'), 'utf8')
  // Da file e non da `data:`: un URL lungo qualche kilobyte viene troncato da
  // alcuni percorsi di Chromium, e il risultato è una finestra vuota.
  const pagina = join(tmpdir(), 'icona-gestore.html')
  writeFileSync(pagina, [
    '<!doctype html><html><head><style>',
    // Niente barre di scorrimento nella fotografia: il disegno riempie
    // esattamente la finestra, e un pixel di troppo le farebbe comparire.
    'html,body{margin:0;padding:0;overflow:hidden;background:transparent}',
    'svg{display:block;width:100vw;height:100vh}',
    '</style></head><body>', svg, '</body></html>'
  ].join(''), 'utf8')

  const win = new BrowserWindow({
    width: LATO,
    height: LATO,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    useContentSize: true
  })

  await win.loadFile(pagina)
  // Un istante perché il rasterizzatore finisca: senza, capita di fotografare
  // una finestra ancora vuota.
  await new Promise((r) => setTimeout(r, 800))

  const immagine = await win.webContents.capturePage()
  const png = immagine.toPNG()
  writeFileSync(join(radice, 'build', 'icon.png'), png)
  console.log(`icona scritta: build/icon.png (${png.length} byte)`)

  win.destroy()
  // Uscita netta: uno script di build non deve restare appeso in attesa di un
  // evento della finestra che ha appena distrutto.
  app.exit(0)
}).catch((err) => {
  console.error('icona non generata:', err)
  app.exit(1)
})
