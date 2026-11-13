import { autoUpdater } from 'electron-updater'
import type { Registro } from '../main/registro'
import { CANALE_AIUTANTE, CERCA_AGGIORNAMENTI_MS, decidiInstallazione, FEED_AIUTANTE, type FaseAggiornamento } from './regole'

/**
 * **Gli aggiornamenti dell'Aiutante** (12/11). Nicholas: «con l'abilitazione
 * agli aggiornamenti automatici».
 *
 * Da dove (13/11): l'ultima pubblicazione del programma completo, a cui
 * `npm run pubblica` allega sempre l'Aiutante (`FEED_AIUTANTE`), leggendo il
 * suo file `aiutante.yml` (canale `CANALE_AIUTANTE`), mai `latest.yml`, che è
 * del programma completo: i due non si pestano.
 *
 * Come, senza perdere lavoro (la regola di Nicholas: l'aggiornamento non deve
 * interrompere niente): si cerca all'avvio e ogni ora; si scarica in
 * sottofondo; a file pronto l'Aiutante smette di prendere lavori nuovi (0
 * posti) e installa appena non ne gira nessuno, o al più dopo il lavoro più
 * lungo ammesso più un quarto d'ora. Con gli aggiornamenti automatici spenti
 * non scarica né installa da solo.
 */

export type StatoAggiornamento = { fase: FaseAggiornamento; versione?: string; prontoDa?: number; errore?: string; ultimaRicerca?: number }

export function avviaAggiornamenti(d: {
  registro: Registro
  automatici: () => boolean
  inCorso: () => number
  /** Prima di uscire per installare (chiude il collegamento, salva lo storico). */
  primaDiInstallare: () => void
  /** In sviluppo non si cerca niente. */
  attivo: boolean
  adesso?: () => number
}): { stato: () => StatoAggiornamento; cerca: () => void; ferma: () => void } {
  const adesso = d.adesso ?? Date.now
  const stato: StatoAggiornamento = { fase: 'niente' }
  if (!d.attivo) return { stato: () => stato, cerca: () => {}, ferma: () => {} }
  // Il canale nella configurazione, non `autoUpdater.channel = …`: quello accenderebbe anche allowDowngrade.
  // Un pezzo per richiesta (come feedAlternativo del programma completo): a più pezzi insieme
  // releases/latest/download di GitHub risponde «501 Unsupported client range».
  autoUpdater.setFeedURL({ provider: 'generic', url: FEED_AIUTANTE, channel: CANALE_AIUTANTE, useMultipleRangeRequest: false })
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.logger = {
    info: (m: unknown) => d.registro.info(`[aggiornamenti] ${String(m)}`),
    warn: (m: unknown) => d.registro.info(`[aggiornamenti] avviso: ${String(m)}`),
    error: (m: unknown) => d.registro.info(`[aggiornamenti] ${String(m).slice(0, 300)}`),
    debug: () => {}
  }
  let ultimoErrore: string | undefined
  autoUpdater.on('update-available', (info) => {
    stato.versione = info.version
    if (stato.fase === 'niente') stato.fase = 'scarico'
    d.registro.info(`[aggiornamenti] c'è la ${info.version}${d.automatici() ? ': la scarico' : ' (aggiornamenti automatici spenti: non la scarico)'}`)
  })
  autoUpdater.on('update-downloaded', (info) => {
    stato.fase = 'pronto'
    stato.versione = info.version
    stato.prontoDa = adesso()
    d.registro.info(`[aggiornamenti] ${info.version} pronta: niente lavori nuovi, installo appena finiscono quelli in corso`)
  })
  autoUpdater.on('error', (err) => {
    const m = (err instanceof Error ? err.message : String(err)).replace(/\s+/gu, ' ').slice(0, 300)
    stato.errore = m
    if (stato.fase === 'scarico') stato.fase = 'niente'
    // Un blocco: nello storico degli errori, una volta per motivo.
    if (m !== ultimoErrore) { ultimoErrore = m; d.registro.errore(`[aggiornamenti] aggiornamento dell'Aiutante non riuscito: ${m}`) }
  })
  const cerca = (): void => {
    stato.ultimaRicerca = adesso()
    autoUpdater.autoDownload = d.automatici()
    void autoUpdater.checkForUpdates().catch(() => undefined)
  }
  let installando = false
  const controlla = (): void => {
    if (installando) return
    const scelta = decidiInstallazione({ fase: stato.fase, automatici: d.automatici(), inCorso: d.inCorso(), ...(stato.prontoDa !== undefined ? { prontoDa: stato.prontoDa } : {}), adesso: adesso() })
    if (scelta !== 'installa') return
    installando = true
    d.registro.info(`[aggiornamenti] installo la ${stato.versione ?? 'nuova versione'} (${d.inCorso()} lavori ancora in corso)`)
    try { d.primaDiInstallare() } catch { /* si installa lo stesso */ }
    // In silenzio, e l'Aiutante riparte da solo a installazione finita.
    setImmediate(() => autoUpdater.quitAndInstall(true, true))
  }
  const primo = setTimeout(cerca, 60_000)
  const ogniOra = setInterval(cerca, CERCA_AGGIORNAMENTI_MS)
  const ogniMinuto = setInterval(controlla, 60_000)
  return {
    stato: () => stato,
    cerca,
    ferma: () => { clearTimeout(primo); clearInterval(ogniOra); clearInterval(ogniMinuto) }
  }
}
