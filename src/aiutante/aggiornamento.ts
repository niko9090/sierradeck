import { autoUpdater } from 'electron-updater'
import type { Registro } from '../main/registro'
import { CANALE_AIUTANTE, CERCA_AGGIORNAMENTI_MS, decidiInstallazione, FEED_AIUTANTE, installaAdesso, type FaseAggiornamento, type ProgressoScarico } from './regole'

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
 *
 * 1.0.3 (13/11): si vede. Lo scarico porta i numeri (`progresso`) per la barra
 * della finestra, del tooltip e della barra delle applicazioni; «Scarica» e
 * «Installa adesso» dalla finestra (questo anche con lavori in corso, dopo
 * una conferma: da quel momento niente lavori nuovi). Il primo controllo
 * all'avvio dopo 15 secondi (prima un minuto: chi riapriva l'Aiutante per
 * aggiornarlo non vedeva niente).
 */

export type StatoAggiornamento = { fase: FaseAggiornamento; versione?: string; prontoDa?: number; errore?: string; ultimaRicerca?: number; progresso?: ProgressoScarico; cercando?: boolean }

export type Aggiornamenti = {
  stato: () => StatoAggiornamento
  cerca: () => void
  /** Con gli automatici spenti: scarica la versione trovata. */
  scarica: () => void
  /** «Installa adesso»: `conferma` se ci sono lavori in corso e non è ancora confermato. */
  installaAdesso: (confermato: boolean) => ReturnType<typeof installaAdesso>
  ferma: () => void
}

export function avviaAggiornamenti(d: {
  registro: Registro
  automatici: () => boolean
  inCorso: () => number
  /** Prima di uscire per installare (chiude il collegamento, salva lo storico). */
  primaDiInstallare: () => void
  /** In sviluppo non si cerca niente. */
  attivo: boolean
  /** Ogni cambio di fase o di progresso (finestra davanti, barra delle applicazioni, tooltip). */
  suCambio?: (s: StatoAggiornamento) => void
  adesso?: () => number
}): Aggiornamenti {
  const adesso = d.adesso ?? Date.now
  const stato: StatoAggiornamento = { fase: 'niente' }
  const cambiato = (): void => { try { d.suCambio?.(stato) } catch { /* solo vista */ } }
  if (!d.attivo) {
    return {
      stato: () => stato, cerca: () => {}, scarica: () => {}, ferma: () => {},
      installaAdesso: () => ({ esito: 'no', motivo: 'In questa copia gli aggiornamenti sono spenti.' })
    }
  }
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
    stato.cercando = false
    delete stato.errore
    if (stato.fase === 'niente' || stato.fase === 'disponibile') stato.fase = autoUpdater.autoDownload ? 'scarico' : 'disponibile'
    d.registro.info(`[aggiornamenti] c'è la ${info.version}${autoUpdater.autoDownload ? ': la scarico' : ' (aggiornamenti automatici spenti: non la scarico)'}`)
    cambiato()
  })
  autoUpdater.on('update-not-available', () => { stato.cercando = false; delete stato.errore; cambiato() })
  let ultimoAvviso = 0
  autoUpdater.on('download-progress', (p: { percent?: number; transferred?: number; total?: number; bytesPerSecond?: number }) => {
    if (stato.fase !== 'scarico' && stato.fase !== 'disponibile') return
    stato.fase = 'scarico'
    stato.progresso = { percento: p.percent ?? 0, scaricati: p.transferred ?? 0, totale: p.total ?? 0, velocita: p.bytesPerSecond ?? 0 }
    // La finestra rilegge da sola; il tooltip e la barra delle applicazioni al massimo ogni mezzo secondo.
    if (adesso() - ultimoAvviso >= 500) { ultimoAvviso = adesso(); cambiato() }
  })
  autoUpdater.on('update-downloaded', (info) => {
    stato.fase = 'pronto'
    stato.versione = info.version
    stato.prontoDa = adesso()
    if (stato.progresso !== undefined) stato.progresso = { ...stato.progresso, percento: 100, scaricati: stato.progresso.totale }
    d.registro.info(`[aggiornamenti] ${info.version} pronta: niente lavori nuovi, installo appena finiscono quelli in corso`)
    cambiato()
  })
  autoUpdater.on('error', (err) => {
    const m = (err instanceof Error ? err.message : String(err)).replace(/\s+/gu, ' ').slice(0, 300)
    stato.errore = m
    stato.cercando = false
    if (stato.fase === 'scarico') { stato.fase = 'niente'; delete stato.progresso }
    cambiato()
    // Un blocco: nello storico degli errori, una volta per motivo.
    if (m !== ultimoErrore) { ultimoErrore = m; d.registro.errore(`[aggiornamenti] aggiornamento dell'Aiutante non riuscito: ${m}`) }
  })
  const cerca = (): void => {
    // Mentre scarica, è pronto o installa non si ricomincia.
    if (stato.fase === 'scarico' || stato.fase === 'pronto' || stato.fase === 'installo') return
    stato.ultimaRicerca = adesso()
    stato.cercando = true
    autoUpdater.autoDownload = d.automatici()
    cambiato()
    void autoUpdater.checkForUpdates().catch(() => { stato.cercando = false })
  }
  const scarica = (): void => {
    if (stato.fase !== 'disponibile') return
    stato.fase = 'scarico'
    cambiato()
    void autoUpdater.downloadUpdate().catch(() => undefined)
  }
  let installando = false
  const installa = (perche: string): void => {
    installando = true
    stato.fase = 'installo'
    cambiato()
    d.registro.info(`[aggiornamenti] installo la ${stato.versione ?? 'nuova versione'} (${perche}; ${d.inCorso()} lavori ancora in corso)`)
    // Un attimo per far vedere «Installo…» nella finestra, poi si chiude.
    setTimeout(() => {
      try { d.primaDiInstallare() } catch { /* si installa lo stesso */ }
      // In silenzio, e l'Aiutante riparte da solo a installazione finita.
      autoUpdater.quitAndInstall(true, true)
    }, 1500)
  }
  const controlla = (): void => {
    if (installando) return
    const scelta = decidiInstallazione({ fase: stato.fase, automatici: d.automatici(), inCorso: d.inCorso(), ...(stato.prontoDa !== undefined ? { prontoDa: stato.prontoDa } : {}), adesso: adesso() })
    if (scelta === 'installa') installa('da solo')
  }
  const adessoAMano = (confermato: boolean): ReturnType<typeof installaAdesso> => {
    const scelta = installaAdesso({ fase: installando ? 'installo' : stato.fase, inCorso: d.inCorso(), confermato })
    if (scelta.esito === 'installa') installa('chiesto dalla finestra')
    return scelta
  }
  const primo = setTimeout(cerca, 15_000)
  const ogniOra = setInterval(cerca, CERCA_AGGIORNAMENTI_MS)
  const ogniMinuto = setInterval(controlla, 60_000)
  return {
    stato: () => stato,
    cerca,
    scarica,
    installaAdesso: adessoAMano,
    ferma: () => { clearTimeout(primo); clearInterval(ogniOra); clearInterval(ogniMinuto) }
  }
}
