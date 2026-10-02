import { app, BrowserWindow, ipcMain, type IpcMainEvent } from 'electron'
import type { EventoPonte, PonteRtc } from './collegamento-rtc'

/**
 * Il ponte verso il WebRTC di Chromium (0.40.0): una finestra **nascosta**,
 * senza pagina, con il preload `ponte-rtc.js` che apre gli
 * `RTCPeerConnection`. Si crea al primo collegamento diretto (in uscita o in
 * entrata), non all'avvio: chi non lo usa non la paga.
 *
 * Non è una finestra di chat: `escludi` la toglie da `finestreDiChat()`. E non
 * deve tenere vivo il programma: quando si chiude l'ultima altra finestra si
 * chiude anche lei, così `window-all-closed` arriva come prima.
 */

const ATTESA_COMANDO_MS = 30_000
/** Tutte le finestre dei ponti: restano solo loro, e si chiudono. */
const finestrePonte = new Set<BrowserWindow>()

export function creaPonteRtc(p: { preload: string; escludi: (w: BrowserWindow) => void; log?: (m: string) => void }): {
  ponte: () => Promise<PonteRtc | undefined>
  distruggi: () => void
} {
  const log = p.log ?? ((): void => {})
  let finestra: BrowserWindow | undefined
  let pronta: Promise<BrowserWindow | undefined> | undefined
  let n = 0
  const attese = new Map<number, { ok: (v: unknown) => void; ko: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  const ascoltatori: ((e: EventoPonte) => void)[] = []
  /** Gli id dei collegamenti vivi: se la finestra cade, si chiudono tutti. */
  const vivi = new Set<string>()

  const suEsito = (e: IpcMainEvent, r: { n?: unknown; ok?: unknown; valore?: unknown; errore?: unknown }): void => {
    if (finestra === undefined || e.sender !== finestra.webContents || typeof r.n !== 'number') return
    const a = attese.get(r.n)
    if (a === undefined) return
    attese.delete(r.n)
    clearTimeout(a.timer)
    if (r.ok === true) a.ok(r.valore)
    else a.ko(new Error(typeof r.errore === 'string' ? r.errore : 'errore del WebRTC'))
  }
  const suEvento = (e: IpcMainEvent, ev: EventoPonte): void => {
    if (finestra === undefined || e.sender !== finestra.webContents || typeof ev?.id !== 'string') return
    if (ev.tipo === 'chiuso') vivi.delete(ev.id)
    for (const a of ascoltatori) a(ev)
  }
  ipcMain.on('ponte-rtc:esito', suEsito)
  ipcMain.on('ponte-rtc:evento', suEvento)

  const caduta = (perche: string): void => {
    if (finestra === undefined && pronta === undefined) return
    log(`[webrtc] ponte chiuso (${perche})`)
    finestra = undefined
    pronta = undefined
    for (const [, a] of attese) { clearTimeout(a.timer); a.ko(new Error('il ponte WebRTC si è chiuso')) }
    attese.clear()
    for (const id of [...vivi]) { vivi.delete(id); for (const a of ascoltatori) a({ id, tipo: 'chiuso' }) }
  }

  const crea = (): Promise<BrowserWindow | undefined> => new Promise((ok) => {
    const w = new BrowserWindow({
      show: false, width: 200, height: 200, skipTaskbar: true, focusable: false, title: 'SierraDeck · WebRTC',
      webPreferences: { preload: p.preload, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
    })
    p.escludi(w)
    finestra = w
    finestrePonte.add(w)
    w.once('closed', () => finestrePonte.delete(w))
    const pronto = (e: IpcMainEvent): void => {
      if (e.sender !== w.webContents) return
      ipcMain.removeListener('ponte-rtc:pronto', pronto)
      clearTimeout(t)
      ok(w)
    }
    const t = setTimeout(() => { ipcMain.removeListener('ponte-rtc:pronto', pronto); log('[webrtc] il ponte non si è avviato'); ok(undefined) }, 15_000)
    ipcMain.on('ponte-rtc:pronto', pronto)
    w.on('closed', () => caduta('finestra chiusa'))
    w.webContents.on('render-process-gone', (_e, d) => { caduta(`processo terminato: ${d.reason}`); if (!w.isDestroyed()) w.destroy() })
    // Non tiene vivo il programma: chiusa l'ultima altra finestra, si chiude anche lei.
    const guarda = (): void => {
      setImmediate(() => {
        if (w.isDestroyed()) return
        if (BrowserWindow.getAllWindows().every((x) => finestrePonte.has(x))) w.destroy()
      })
    }
    for (const x of BrowserWindow.getAllWindows()) if (!finestrePonte.has(x)) x.once('closed', guarda)
    const nuova = (_e: unknown, x: BrowserWindow): void => { setImmediate(() => { if (!finestrePonte.has(x)) x.once('closed', guarda) }) }
    app.on('browser-window-created', nuova)
    w.once('closed', () => app.removeListener('browser-window-created', nuova))
    void w.loadURL('data:text/html;charset=utf-8,<!doctype html><title>SierraDeck WebRTC</title>').catch(() => undefined)
  })

  const comanda = async (cmd: string, id: string, extra: Record<string, unknown> = {}): Promise<unknown> => {
    pronta ??= crea()
    const w = await pronta
    if (w === undefined || w.isDestroyed()) { pronta = undefined; throw new Error('il ponte WebRTC non è disponibile') }
    n += 1
    const mio = n
    return new Promise((ok, ko) => {
      const timer = setTimeout(() => { attese.delete(mio); ko(new Error(`il WebRTC non ha risposto (${cmd})`)) }, ATTESA_COMANDO_MS)
      attese.set(mio, { ok, ko, timer })
      w.webContents.send('ponte-rtc:comando', { n: mio, cmd, id, ...extra })
    })
  }

  const ponte: PonteRtc = {
    async offri(id, stun) { vivi.add(id); return String(await comanda('offri', id, { stun: [...stun] })) },
    async rispondi(id, offerta, stun) { vivi.add(id); return String(await comanda('rispondi', id, { sdp: offerta, stun: [...stun] })) },
    async completa(id, risposta) { await comanda('completa', id, { sdp: risposta }) },
    manda(id, testo) { void comanda('manda', id, { testo }).catch((err: unknown) => log(`[webrtc] invio non riuscito: ${String(err)}`)) },
    chiudi(id) { vivi.delete(id); if (finestra !== undefined) void comanda('chiudi', id).catch(() => undefined) },
    ascolta(cb) { ascoltatori.push(cb) }
  }

  return {
    async ponte() {
      pronta ??= crea()
      const w = await pronta
      return w === undefined ? undefined : ponte
    },
    distruggi() {
      const w = finestra
      caduta('programma in chiusura')
      if (w !== undefined && !w.isDestroyed()) w.destroy()
    }
  }
}
