/**
 * La pagina del Client, guardata a misura di telefono.
 *
 * Non un browser: Electron, cioe' lo stesso Chromium che la mostrera' dentro
 * l'app. Con uno stato finto ma completo — un autopilota che si prepara, uno
 * che lavora, una domanda in attesa — perche' e' cosi' che si vede se la
 * pagina dice quello che deve.
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const { writeFileSync } = require('node:fs')
const { join } = require('node:path')

const FUORI = process.argv[2] ?? join(__dirname, '..', 'client.png')

app.whenReady().then(async () => {
  const { paginaClient } = require('../out/main/client-pagina.cjs')
  const html = paginaClient()
  const file = join(require('node:os').tmpdir(), 'sierradeck-client.html')
  writeFileSync(file, html)

  const win = new BrowserWindow({ width: 412, height: 915, show: false })
  await win.loadFile(file)
  // Lo stato finto: la pagina crede di essere collegata e disegna tutto.
  await win.webContents.executeJavaScript(`
    localStorage.setItem('sierradeck.chiave', 'finta')
    chiave = 'finta'
    ultimoStato = {
      chat: [{ id: 'p-1', titolo: 'Revisione VERTIGO', cwd: 'C:\\Users\\nikof\\Documents\\Game_ascensore', ultimaRiga: 'npm test — 106 verdi' }],
      autopiloti: [
        { id: 'ap-1', nome: 'Revisione VERTIGO', stato: 'lavoro', cicli: 3, fatti: 2, criteri: 6 },
        { id: 'ap-2', nome: 'Audit del gioco', stato: 'attesa', cicli: 1, fatti: 0, criteri: 4 }
      ],
      domande: [{ id: 'd-1', autopilotaId: 'ap-2', testo: 'Tengo la fisica attuale o la rifaccio da capo?' }],
      workspace: { nomi: ['casa', 'lavoro', 'giochi'], attivo: 'giochi' }
    }
    dentroAp = 'ap-1'
    apDettaglio = {
      passaggi: [
        { nome: 'Prepara', stato: 'fatto' },
        { nome: 'Lavora', stato: 'corrente', nota: '3 interventi' },
        { nome: 'Fine', stato: 'davanti' }
      ],
      misura: { percento: 33, dettaglio: '2 di 6', di: 'criteri', tono: 'lavoro' },
      criteri: [
        { descrizione: 'La suite resta verde', soddisfatto: true },
        { descrizione: 'Il documento proposte contiene 4 proposte', soddisfatto: true },
        { descrizione: 'Ogni difetto ha uno script di riproduzione', soddisfatto: false }
      ],
      decisioni: [
        { quando: '2026-08-13T15:20:00.000Z', cosa: 'configurato da se: la suite resta verde' },
        { quando: '2026-08-13T15:44:00.000Z', cosa: 'ripreso dopo una domanda' }
      ]
    }
    pannello(ultimoStato)
    'fatto'
  `)
  await new Promise((r) => setTimeout(r, 600))
  const img = await win.webContents.capturePage()
  writeFileSync(FUORI, img.toPNG())
  console.log('salvato', FUORI)
  app.quit()
})
