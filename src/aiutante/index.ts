import { app, BrowserWindow, ipcMain, Menu, nativeImage, safeStorage, shell, Tray } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { linkAmmesso, type NoteAggiornamento } from '@shared/note-aggiornamento'
import { tavolozza } from '@shared/preferenze'
import { aggiungiRuntimeAlPath } from '@shared/runtime-noti'
import { ambientePulito } from '@shared/ambiente-figli'
import { radiceLavoroAiuto } from '@shared/disco-prove'
import { nomeDaMostrare, nomeSceltoValido } from '@shared/nome-pc'
import { apriRegistro } from '../main/registro'
import { gitPerLeChat } from '../main/git-nel-path'
import { creaMisuratore } from '../autopilot-host/misura-pc'
import { avviaProcessoReale, claudeCmd } from '../autopilot-host/processo-claude'
import versioneJson from './versione.json'
import { avviaAggiornamenti, type StatoAggiornamento } from './aggiornamento'
import {
  bloccoDaClaude, comandoAccesso, CONTROLLO_CLAUDE_MS, controllaClaude, esitoDaLavoro, serveProvaPiena, testoStatoClaude, type EsitoClaude
} from './controllo-claude'
import { creaFinestraAggiornamenti } from './finestra-aggiornamenti'
import { NOVITA_AIUTANTE_URL, noteAiutante } from './novita-aiutante'
import { creaInvioErrori, registroConStorico } from './errori-aiutante'
import { creaNucleo } from './nucleo'
import { apriPreferenzeAiutante } from './preferenze-aiutante'
import { blocchiRete, inScarico, perLaFinestra, requisitiPersi, rigaAggiornamento, tooltipIcona, valutaRequisiti, type StatoRete, type VoceRequisito } from './regole'
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

/**
 * Il simbolo dell'Aiutante (1.0.3: prima la finestra mostrava quello di
 * Electron). Nel pacchetto `build/` sta dentro app.asar (`files` in
 * electron-builder-aiutante.yml): Electron legge i file dall'asar anche per
 * icone e nativeImage. Su Windows l'.ico (più grandezze), altrove il .png.
 */
const ICONA_FINESTRA = join(app.getAppPath(), 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
const ICONA_VASSOIO = join(app.getAppPath(), 'build', 'icon.png')

function avvia(): void {
  let finestra: BrowserWindow | undefined
  let tray: Tray | undefined
  let staUscendo = false
  const apriFinestra = (): void => {
    if (finestra !== undefined && !finestra.isDestroyed()) { finestra.show(); finestra.focus(); return }
    finestra = new BrowserWindow({
      width: 560, height: 760, title: 'SierraDeck Aiutante', autoHideMenuBar: true, show: true,
      ...(existsSync(ICONA_FINESTRA) ? { icon: ICONA_FINESTRA } : {}),
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
    // 1.0.3: Claude Code provato davvero (non solo il file delle credenziali). Finché non è `ok`: 0 posti.
    let claude: EsitoClaude = { stato: 'controllo' }
    let claudeInControllo = false
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
      claudeBloccato: () => (claude.stato === 'ok' ? undefined : testoStatoClaude(claude.stato)),
      suFallito: (f) => {
        const e = esitoDaLavoro(f.causa, f.motivo, Date.now())
        if (e === undefined) return
        if (claude.stato === 'ok') registro.errore(`[claude] un lavoro non è riuscito per ${testoStatoClaude(e.stato).toLowerCase()}: niente lavori nuovi finché la prova di Claude non torna buona`)
        claude = e
        // Si riprova subito con la prova piena: se era un caso, i posti tornano; se no, resta rosso.
        setTimeout(() => { void ricontrollaClaude(true) }, 5_000).unref?.()
      },
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

    // La prova di Claude: con lo stesso `claude` e lo stesso ambiente dei lavori, in una cartella sua.
    const cartellaProva = join(dati, 'prova-claude')
    const ricontrollaClaude = async (forzata: boolean): Promise<void> => {
      if (claudeInControllo) return
      claudeInControllo = true
      try {
        mkdirSync(cartellaProva, { recursive: true })
        const prima = claude.stato === 'controllo' ? undefined : claude
        const piena = serveProvaPiena({ prima, forzata, inCorso: nucleo.lavoratore.inCorso(), tetto: nucleo.posti().tetto })
        const nuovo = await controllaClaude({
          claude: claudeCmd(),
          env: { ...ambientePulito(process.env), ...gitPerLeChat() },
          cartella: cartellaProva,
          prima,
          piena,
          adesso: Date.now
        })
        if (nuovo.stato !== 'ok' && nuovo.stato !== 'controllo' && (prima === undefined || prima.stato === 'ok' || prima.stato !== nuovo.stato)) {
          registro.errore(`[claude] ${testoStatoClaude(nuovo.stato)} su questo Aiutante: niente lavori finché non si sistema dalla sua finestra («Collega Claude»)${nuovo.estratto !== undefined ? ` (${nuovo.estratto})` : ''}`)
        }
        if (nuovo.stato === 'ok' && prima !== undefined && prima.stato !== 'ok') registro.info('[claude] Claude di nuovo collegato: l\'Aiutante riprende i lavori')
        if (nuovo.stato === 'ok' && prima === undefined) registro.info(`[claude] Claude collegato (${piena ? 'prova piena' : 'stato'})`)
        claude = nuovo
      } catch (err) {
        registro.info(`[claude] controllo non riuscito: ${String(err)}`)
      } finally {
        claudeInControllo = false
      }
    }
    void ricontrollaClaude(true)
    setInterval(() => { void ricontrollaClaude(false) }, CONTROLLO_CLAUDE_MS).unref?.()

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
      },
      blocco: () => bloccoDaClaude(claude)
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

    // ── La finestra degli aggiornamenti (1.0.3): la stessa del programma completo ──
    const finestraAgg = creaFinestraAggiornamenti({
      dati,
      preload: join(__dirname, '../preload/aggiornamenti.js'),
      ...(existsSync(ICONA_FINESTRA) ? { icona: ICONA_FINESTRA } : {}),
      renderer: () => (process.env.ELECTRON_RENDERER_URL !== undefined
        ? { url: `${process.env.ELECTRON_RENDERER_URL}/aggiornamenti.html`, file: '' }
        : { file: join(__dirname, '../renderer/aggiornamenti.html') })
    })
    const statoAgg = (): StatoAggiornamento => aggiornamenti?.stato() ?? { fase: 'niente' }
    const rispostaAgg = (): unknown => ({
      agg: perLaFinestra(statoAgg()),
      versione: VERSIONE,
      scaricaAuto: automatici(),
      inCorso: nucleo.lavoratore.inCorso(),
      tavolozza: tavolozza(preferenze.leggi().base)
    })
    let aggiornaIcona = (): void => {}
    const suCambioAgg = (s: StatoAggiornamento): void => {
      finestraAgg.suStato(perLaFinestra(s))
      finestraAgg.manda('aiutante-agg:stato', rispostaAgg())
      // La barra nella barra delle applicazioni: lo scarico, poi via; «installo» senza misura.
      const barra = s.fase === 'scarico' ? Math.max(0, Math.min(1, (s.progresso?.percento ?? 0) / 100)) : s.fase === 'installo' ? 2 : -1
      finestraAgg.progresso(barra)
      if (finestra !== undefined && !finestra.isDestroyed()) finestra.setProgressBar(barra)
      aggiornaIcona()
    }
    aggiornamenti = avviaAggiornamenti({
      registro,
      automatici,
      inCorso: () => nucleo.lavoratore.inCorso(),
      primaDiInstallare: () => { staUscendo = true; storico.scriviOra(); finestraAgg.chiudi(); r.ferma() },
      attivo: app.isPackaged && prova === undefined,
      suCambio: suCambioAgg
    })
    // Aperta, la finestra rilegge ogni pochi secondi (i lavori in corso cambiano la frase di «pronta»).
    setInterval(() => { if (finestraAgg.stato().aperta) finestraAgg.manda('aiutante-agg:stato', rispostaAgg()) }, 3000).unref?.()
    let noteInCache: { per: string; note: NoteAggiornamento } | undefined
    ipcMain.handle('aiutante-agg:stato', () => rispostaAgg())
    ipcMain.handle('aiutante-agg:note', async () => {
      const nuova = statoAgg().versione
      if (nuova === undefined) return undefined
      if (noteInCache?.per === nuova) return noteInCache.note
      let sorgente: string | undefined
      try {
        const risposta = await fetch(NOVITA_AIUTANTE_URL, { signal: AbortSignal.timeout(8000) })
        if (risposta.ok) sorgente = await risposta.text()
      } catch { /* senza rete: l'avviso dice dove leggerle */ }
      const note = noteAiutante({ sorgente, installata: VERSIONE, nuova })
      if (sorgente !== undefined) noteInCache = { per: nuova, note }
      return note
    })
    ipcMain.handle('aiutante-agg:installa', (_e, confermato: unknown) => {
      const e = aggiornamenti?.installaAdesso(confermato === true) ?? { esito: 'no' as const, motivo: 'Aggiornamenti non attivi.' }
      if (e.esito === 'installa') registro.info(`[aggiornamenti] «Installa adesso» premuto (${nucleo.lavoratore.inCorso()} lavori in corso)`)
      return e
    })
    ipcMain.handle('aiutante-agg:scarica', () => { aggiornamenti?.scarica(); return true })
    ipcMain.handle('aiutante-agg:cerca', () => { aggiornamenti?.cerca(); return true })
    ipcMain.handle('aiutante-agg:nascondi', () => { finestraAgg.nascondi() })
    ipcMain.handle('aiutante-agg:letto', () => { finestraAgg.letto() })
    ipcMain.handle('aiutante-agg:apriPagina', (_e, url: unknown) => {
      const ok = typeof url === 'string' ? linkAmmesso(url) : undefined
      if (ok !== undefined) void shell.openExternal(ok)
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
        claude: { ...claude, testo: testoStatoClaude(claude.stato), inControllo: claudeInControllo },
        ultimoFallito: nucleo.ultimoFallito(),
        aggiornamento: { riga: rigaAggiornamento(statoAgg()), nonLetto: finestraAgg.stato().nonLetto, errore: statoAgg().errore },
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
    ipcMain.handle('aiutante:cercaAggiornamenti', () => { aggiornamenti?.cerca(); finestraAgg.apri(true); return true })
    ipcMain.handle('aiutante:apriAggiornamenti', () => { finestraAgg.apri(true); return true })
    ipcMain.handle('aiutante:ricontrollaClaude', async () => { await ricontrollaClaude(true); return statoCompleto() })
    // «Collega Claude»: una finestra di PowerShell visibile con `claude auth login`; chiusa, si ricontrolla da soli.
    ipcMain.handle('aiutante:collegaClaude', () => {
      try {
        const c = comandoAccesso(claudeCmd())
        const figlio = spawn(c.comando, c.args, { detached: true, stdio: 'ignore', windowsHide: false, env: ambientePulito(process.env), cwd: cartellaProva })
        figlio.on('error', (err) => registro.info(`[claude] terminale per l'accesso non aperto: ${String(err)}`))
        figlio.on('exit', () => { void ricontrollaClaude(true) })
        registro.info('[claude] aperto il terminale per rifare l\'accesso a Claude')
        return { ok: true }
      } catch (err) {
        return { ok: false, messaggio: err instanceof Error ? err.message : String(err) }
      }
    })
    ipcMain.handle('aiutante:apriRegistro', () => shell.openPath(registro.cartella()))

    // ── L'icona vicino all'orologio ──
    try {
      tray = new Tray(existsSync(ICONA_VASSOIO) ? nativeImage.createFromPath(ICONA_VASSOIO) : nativeImage.createEmpty())
      tray.setToolTip('SierraDeck Aiutante')
      const menu = (): Menu => Menu.buildFromTemplate([
        { label: 'Apri SierraDeck Aiutante', click: () => apriFinestra() },
        { label: finestraAgg.stato().nonLetto ? 'Aggiornamenti… (novità)' : 'Aggiornamenti…', click: () => finestraAgg.apri(true) },
        { label: preferenze.leggi().inPausa ? 'Riprendi i lavori' : 'Metti in pausa', click: () => { preferenze.cambia({ inPausa: !preferenze.leggi().inPausa }); tray?.setContextMenu(menu()) } },
        { type: 'separator' },
        { label: 'Esci', click: () => { staUscendo = true; r.ferma(); app.quit() } }
      ])
      tray.setContextMenu(menu())
      tray.on('click', () => apriFinestra())
      let nonLettoPrima = false
      aggiornaIcona = (): void => {
        const p = nucleo.posti()
        const a = statoAgg()
        tray?.setToolTip(tooltipIcona({
          lavori: nucleo.lavoratore.inCorso(), liberi: p.liberi,
          ...(claude.stato !== 'ok' && claude.stato !== 'controllo' ? { claude: testoStatoClaude(claude.stato) } : {}),
          aggiornamento: { fase: a.fase, ...(a.versione !== undefined ? { versione: a.versione } : {}), ...(a.progresso !== undefined ? { percento: a.progresso.percento } : {}) }
        }))
        // Il menu cambia solo quando cambia il pallino.
        const nonLetto = finestraAgg.stato().nonLetto
        if (nonLetto !== nonLettoPrima) { nonLettoPrima = nonLetto; tray?.setContextMenu(menu()) }
      }
      setInterval(() => aggiornaIcona(), 15_000).unref?.()
    } catch (err) { registro.info(`[icona] non creata: ${String(err)}`) }

    // All'accensione parte nascosto; aperto a mano, mostra la finestra.
    if (!process.argv.includes('--nascosto')) apriFinestra()
    app.on('before-quit', () => { staUscendo = true; aggiornamenti?.ferma(); finestraAgg.chiudi(); r.ferma() })
  })
}
