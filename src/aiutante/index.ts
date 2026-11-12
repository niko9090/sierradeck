import { app, BrowserWindow, ipcMain, Menu, nativeImage, safeStorage, shell, Tray } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { aggiungiRuntimeAlPath } from '@shared/runtime-noti'
import { ambientePulito } from '@shared/ambiente-figli'
import { radiceLavoroAiuto } from '@shared/disco-prove'
import { nomeDaMostrare, nomeSceltoValido } from '@shared/nome-pc'
import { apriRegistro } from '../main/registro'
import { gitPerLeChat } from '../main/git-nel-path'
import { creaMisuratore } from '../autopilot-host/misura-pc'
import { avviaProcessoReale, claudeCmd } from '../autopilot-host/processo-claude'
import versioneJson from './versione.json'
import { avviaAggiornamenti } from './aggiornamento'
import { creaInvioErrori, registroConStorico } from './errori-aiutante'
import { creaNucleo } from './nucleo'
import { apriPreferenzeAiutante } from './preferenze-aiutante'
import { blocchiRete, inScarico, requisitiPersi, valutaRequisiti, type StatoRete, type VoceRequisito } from './regole'
import { misuraRequisiti } from './requisiti'
import { colleghiRete, erroreConRisposta, nomeDi, type ReteAiutante } from './rete'

/**
 * **SierraDeck Aiutante** (12/11): il processo principale.
 *
 * Un PC che fa solo «Aiuta la rete»: niente chat, autopiloti, workspace,
 * nessuna interfaccia grande. Un'icona vicino all'orologio e una finestra
 * piccola con lo stato e le impostazioni. Vive accanto al programma completo
 * senza toccarlo: dati suoi (`%APPDATA%\SierraDeck Aiutante`), porta sua
 * (47641), appId suo, aggiornamenti dalla sua pubblicazione.
 *
 * Con `SIERRADECK_PROVA` (la copia di prova) i dati stanno dentro quella
 * cartella: una prova non tocca mai l'Aiutante vero.
 */

const VERSIONE = (versioneJson as { versione: string }).versione
const APP_ID = 'it.ferrariconsulenze.sierradeck.aiutante'
const prova = process.env.SIERRADECK_PROVA
// In sviluppo (`npm run dev-aiutante`) senza SIERRADECK_PROVA: una cartella nella Temp, mai i dati dell'Aiutante installato.
const dati = prova !== undefined && prova.trim() !== ''
  ? join(prova, 'aiutante')
  : app.isPackaged ? join(app.getPath('appData'), 'SierraDeck Aiutante') : join(app.getPath('temp'), 'sierradeck-aiutante-sviluppo')
app.setPath('userData', dati)
app.setAppUserModelId(APP_ID)

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  avvia()
}

function avvia(): void {
  let finestra: BrowserWindow | undefined
  let tray: Tray | undefined
  let staUscendo = false
  const apriFinestra = (): void => {
    if (finestra !== undefined && !finestra.isDestroyed()) { finestra.show(); finestra.focus(); return }
    finestra = new BrowserWindow({
      width: 560, height: 720, title: 'SierraDeck Aiutante', autoHideMenuBar: true, show: true,
      webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, sandbox: false }
    })
    // Chiudere la finestra non spegne l'Aiutante: resta vicino all'orologio a lavorare per gli altri PC.
    finestra.on('close', (e) => { if (!staUscendo) { e.preventDefault(); finestra?.hide() } })
    if (process.env.ELECTRON_RENDERER_URL !== undefined) void finestra.loadURL(`${process.env.ELECTRON_RENDERER_URL}/index.html`)
    else void finestra.loadFile(join(__dirname, '../renderer/index.html'))
  }
  app.on('second-instance', () => apriFinestra())
  app.on('window-all-closed', () => { /* resta acceso nell'area di notifica */ })

  void app.whenReady().then(() => {
    const base = apriRegistro(dati, VERSIONE)
    let rete: ReteAiutante | undefined
    const { registro, storico } = registroConStorico({ dati, versione: VERSIONE, registro: base, nomePc: () => rete?.identita.leggi().nome })
    registro.info(`SierraDeck Aiutante ${VERSIONE} avviato${prova !== undefined ? ' (copia di prova)' : ''}`)
    app.on('will-quit', () => { storico.scriviOra() })
    for (const c of aggiungiRuntimeAlPath(process.env, existsSync)) registro.info(`[requisiti] nel PATH: ${c}`)

    const preferenze = apriPreferenzeAiutante(dati)
    const misura = creaMisuratore()
    const cartellaAiuto = join(dati, 'aiuto')
    let requisiti: { pronto: boolean; voci: VoceRequisito[] } | undefined
    const reale = avviaProcessoReale(claudeCmd())
    let aggiornamenti: ReturnType<typeof avviaAggiornamenti> | undefined
    const automatici = (): boolean => preferenze.leggi().base.scaricaAggiornamentiAutomatico
    const nucleo = creaNucleo({
      cartella: cartellaAiuto,
      lavoro: radiceLavoroAiuto(cartellaAiuto),
      // Lo stesso ambiente pulito delle chat del programma completo, con git nel PATH.
      avvia: (p) => reale({ ...p, env: { ...ambientePulito(p.env), ...gitPerLeChat() } }),
      misura,
      regolazione: () => { const b = preferenze.leggi().base; return { ...(b.postiChat !== undefined ? { postiChat: b.postiChat } : {}), ...(b.postiScelti !== undefined ? { postiScelti: b.postiScelti } : {}) } },
      pronto: () => requisiti?.pronto === true,
      inScarico: () => inScarico({ fase: aggiornamenti?.stato().fase ?? 'niente', automatici: automatici() }),
      log: (r) => registro.info(r),
      errore: (r) => registro.errore(r)
    })

    const controllaRequisiti = async (): Promise<void> => {
      for (const c of aggiungiRuntimeAlPath(process.env, existsSync)) registro.info(`[requisiti] nel PATH: ${c}`)
      const nuovi = valutaRequisiti(await misuraRequisiti({ claude: claudeCmd(), cartellaLavoro: radiceLavoroAiuto(cartellaAiuto) }))
      // Un requisito che manca è un blocco: nello storico degli errori, una volta (non a ogni controllo).
      for (const v of requisitiPersi(requisiti?.voci, nuovi.voci)) registro.errore(`[requisiti] all'Aiutante manca: ${v.nome} (${v.dettaglio}); niente lavori finché non c'è`)
      if (requisiti !== undefined && !requisiti.pronto && nuovi.pronto) registro.info('[requisiti] adesso c\'è tutto: l\'Aiutante prende lavori')
      requisiti = nuovi
    }
    void controllaRequisiti()
    setInterval(() => { void controllaRequisiti() }, 10 * 60_000).unref?.()

    rete = colleghiRete({
      dati,
      versione: VERSIONE,
      registro,
      portachiaviToken: {
        disponibile: () => safeStorage.isEncryptionAvailable(),
        cifra: (chiaro) => safeStorage.encryptString(chiaro).toString('base64'),
        decifra: (cifrato) => safeStorage.decryptString(Buffer.from(cifrato, 'base64'))
      },
      portachiaviMaestra: {
        disponibile: () => safeStorage.isEncryptionAvailable(),
        cifra: (chiaro) => safeStorage.encryptString(chiaro.toString('base64')).toString('base64'),
        decifra: (cifrato) => Buffer.from(safeStorage.decryptString(Buffer.from(cifrato, 'base64')), 'base64')
      },
      porta: () => preferenze.leggi().base.portaClient,
      oltreLaRete: () => preferenze.leggi().base.clientOltreLaRete,
      aiuto: {
        modo: () => (preferenze.leggi().inPausa ? 'no' : 'dedicato'),
        servizio: (percorso, corpo) => nucleo.servizio(percorso, corpo),
        nomePc: (pcId) => (rete !== undefined ? nomeDi(rete.postino, pcId) : undefined),
        programma: 'aiutante'
      }
    })
    const r = rete

    // Errori e blocchi verso il PC di sviluppo, da soli (come il programma completo).
    const invio = creaInvioErrori({
      dati, versione: VERSIONE, registro, storico,
      io: () => { const i = r.identita.leggi(); return { id: i.id, nome: nomeDaMostrare(i) } },
      pcScelto: () => preferenze.leggi().base.pcSviluppo,
      progetti: () => r.registroProgetti.leggi().progetti,
      nomeDi: (pc) => nomeDi(r.postino, pc),
      chiama: (pc, percorso, corpo) => r.remoto.chiama(pc, percorso, corpo),
      perPosta: async (pc, inv, err) => {
        if (erroreConRisposta(err)) return false
        return await r.postino.aggiungi(pc, { comando: { tipo: 'errori', invio: inv }, cwd: '', testo: `${inv.voci.length} errori da ${inv.da}` }) !== undefined
      }
    })
    setInterval(() => { void invio.giro() }, 30_000).unref?.()

    // I blocchi del collegamento (Drive scollegato, cassaforte chiusa, porta occupata), al cambio.
    // I primi due minuti non contano: il portachiavi e il token del Drive possono essere ancora da rileggere.
    let statoRetePrima: StatoRete | undefined
    let giri = 0
    const giaCollegato = r.contoDrive.stato().connesso || r.contoDrive.stato().portachiaviNonPronto === true
    setInterval(() => {
      giri += 1
      if (giri < 3) return
      const s = r.stato()
      // La porta occupata la scrive già il collegamento (`rete.ts`): qui solo Drive e cassaforte.
      const adesso: StatoRete = { driveConnesso: s.driveConnesso, cassaforteAperta: s.cassaforteAperta, inAscolto: true }
      for (const riga of blocchiRete(statoRetePrima, adesso, giaCollegato)) registro.errore(riga)
      statoRetePrima = adesso
    }, 60_000).unref?.()

    aggiornamenti = avviaAggiornamenti({
      registro,
      automatici,
      inCorso: () => nucleo.lavoratore.inCorso(),
      primaDiInstallare: () => { staUscendo = true; storico.scriviOra(); r.ferma() },
      attivo: app.isPackaged && prova === undefined
    })

    // Partire all'accensione (di serie sì): è un PC dedicato agli altri.
    const allineaAvvio = (): void => {
      if (!app.isPackaged) return
      try { app.setLoginItemSettings({ openAtLogin: preferenze.leggi().avvioAlLogin, args: ['--nascosto'] }) } catch (err) { registro.info(`[avvio] non impostato: ${String(err)}`) }
    }
    allineaAvvio()

    // ── La finestra: stato e impostazioni ──
    const statoCompleto = (): unknown => {
      const s = r.stato()
      const p = preferenze.leggi()
      const i = r.identita.leggi()
      return {
        versione: VERSIONE,
        nome: i.nome,
        host: i.host,
        rete: { driveConnesso: s.driveConnesso, driveConfigurato: s.driveConfigurato, email: s.email, cassaforteAperta: s.cassaforteAperta, inAscolto: s.inAscolto, errorePorta: s.errorePorta, porta: s.porta },
        altri: s.altri.map((b) => ({ pcId: b.pcId, nome: nomeDaMostrare(b), aiutante: b.aiutante === true, battito: b.battito })),
        posti: nucleo.posti(),
        limiteFino: nucleo.limiteFino(),
        lavori: nucleo.ospitati(),
        requisiti: requisiti?.voci ?? [],
        aggiornamento: aggiornamenti?.stato(),
        preferenze: {
          postiChat: p.base.postiChat ?? 0,
          postiScelti: p.base.postiScelti ?? null,
          scaricaAggiornamentiAutomatico: p.base.scaricaAggiornamentiAutomatico,
          avvioAlLogin: p.avvioAlLogin,
          inPausa: p.inPausa,
          portaClient: p.base.portaClient,
          pcSviluppo: p.base.pcSviluppo ?? null
        }
      }
    }
    ipcMain.handle('aiutante:stato', () => statoCompleto())
    ipcMain.handle('aiutante:cambia', (_e, cambio: unknown) => {
      const c = (typeof cambio === 'object' && cambio !== null ? cambio : {}) as Record<string, unknown>
      if (typeof c.nome === 'string') r.identita.impostaNome(nomeSceltoValido(c.nome))
      const prima = preferenze.leggi()
      const dopo = preferenze.cambia(c)
      if (dopo.avvioAlLogin !== prima.avvioAlLogin) allineaAvvio()
      if (dopo.base.portaClient !== prima.base.portaClient) r.riascolta(dopo.base.portaClient)
      if (dopo.inPausa !== prima.inPausa) registro.info(`[aiuto] ${dopo.inPausa ? 'in pausa: niente lavori nuovi' : 'di nuovo al lavoro per gli altri PC'}`)
      return statoCompleto()
    })
    ipcMain.handle('aiutante:collegaDrive', async () => {
      try {
        const esito = await r.contoDrive.connetti((url) => { void shell.openExternal(url) })
        registro.info(`[drive] collegato ${esito.email ?? ''}`)
        // Se la chiave della cassaforte è già nel portachiavi (un Drive già usato qui) si riapre da sola.
        try { r.sincronia.riapriDalPortachiavi() } catch { /* serve la passphrase */ }
        return { ok: true, cassaforteSulDrive: esito.cassaforteSulDrive }
      } catch (err) {
        return { ok: false, messaggio: err instanceof Error ? err.message : String(err) }
      }
    })
    ipcMain.handle('aiutante:sblocca', async (_e, passphrase: unknown) => {
      if (typeof passphrase !== 'string' || passphrase === '') return { ok: false, messaggio: 'Scrivi la passphrase.' }
      const e = await r.sincronia.sblocca(passphrase).catch((err: unknown) => ({ ok: false, messaggio: String(err) }))
      if (e.ok) { registro.info('[cassaforte] aperta: l\'Aiutante entra nella rete'); void r.postino.giro().catch(() => undefined) }
      return e
    })
    ipcMain.handle('aiutante:mandaErrori', () => invio.giro(true))
    ipcMain.handle('aiutante:cercaAggiornamenti', () => { aggiornamenti?.cerca(); return true })
    ipcMain.handle('aiutante:apriRegistro', () => shell.openPath(registro.cartella()))

    // ── L'icona vicino all'orologio ──
    const icona = join(app.getAppPath(), 'build', 'icon.png')
    try {
      tray = new Tray(existsSync(icona) ? nativeImage.createFromPath(icona) : nativeImage.createEmpty())
      tray.setToolTip('SierraDeck Aiutante')
      const menu = (): Menu => Menu.buildFromTemplate([
        { label: 'Apri SierraDeck Aiutante', click: () => apriFinestra() },
        { label: preferenze.leggi().inPausa ? 'Riprendi i lavori' : 'Metti in pausa', click: () => { preferenze.cambia({ inPausa: !preferenze.leggi().inPausa }); tray?.setContextMenu(menu()) } },
        { type: 'separator' },
        { label: 'Esci', click: () => { staUscendo = true; r.ferma(); app.quit() } }
      ])
      tray.setContextMenu(menu())
      tray.on('click', () => apriFinestra())
      setInterval(() => {
        const p = nucleo.posti()
        tray?.setToolTip(`SierraDeck Aiutante — ${nucleo.lavoratore.inCorso()} lavori, ${p.liberi} posti liberi`)
      }, 15_000).unref?.()
    } catch (err) { registro.info(`[icona] non creata: ${String(err)}`) }

    // All'accensione parte nascosto; aperto a mano, mostra la finestra.
    if (!process.argv.includes('--nascosto')) apriFinestra()
    app.on('before-quit', () => { staUscendo = true; aggiornamenti?.ferma(); r.ferma() })
  })
}
