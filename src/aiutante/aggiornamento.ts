import { app, powerMonitor } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { Registro } from '../main/registro'
import { eErroreDiRete } from '../shared/errori-rete'
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

const RITENTA_RETE_MS = 2 * 60_000
const TENTATIVI_RETE_MAX = 5
const RISVEGLIO_MS = 10_000

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
  /**
   * 16/11: l'installazione nella stessa finestra degli aggiornamenti. Lancia
   * SierraDeck Update con l'installer scaricato e dice se si è fatto vivo:
   * allora l'Aiutante esce e installa lui, mostrando le fasi in basso a destra.
   * Assente o false: l'installazione silenziosa di sempre.
   */
  conUpdater?: (p: { installer: string; versione: string }) => Promise<boolean>
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
  /** Il file scaricato da electron-updater: lo esegue SierraDeck Update. */
  let installerScaricato: string | undefined
  let tentativiRete = 0
  let ritento: ReturnType<typeof setTimeout> | undefined
  /** La versione già pronta, messa da parte mentre se ne scarica una più nuova. */
  let primaPronta: { versione: string | undefined; prontoDa: number | undefined; installer: string | undefined } | undefined
  const piuNuova = (a: string, b: string): boolean => {
    const pa = a.split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0)
    const pb = b.split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0)
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const dif = (pa[i] ?? 0) - (pb[i] ?? 0)
      if (dif !== 0) return dif > 0
    }
    return false
  }
  /** Una ricerca che non porta niente di nuovo o va male: torna la versione pronta di prima. */
  const tornaPronta = (): void => {
    if (primaPronta === undefined) return
    stato.fase = 'pronto'
    if (primaPronta.versione !== undefined) stato.versione = primaPronta.versione
    if (primaPronta.prontoDa !== undefined) stato.prontoDa = primaPronta.prontoDa
    installerScaricato = primaPronta.installer
    delete stato.progresso
    primaPronta = undefined
  }
  autoUpdater.on('update-available', (info) => {
    tentativiRete = 0
    stato.cercando = false
    delete stato.errore
    if (stato.fase === 'pronto') {
      // Già pronta: la stessa non cambia niente; una più nuova si scarica e prende il posto.
      if (stato.versione !== undefined && !piuNuova(info.version, stato.versione)) { cambiato(); return }
      primaPronta = { versione: stato.versione, prontoDa: stato.prontoDa, installer: installerScaricato }
      stato.fase = 'niente'
      delete stato.prontoDa
    }
    stato.versione = info.version
    if (stato.fase === 'niente' || stato.fase === 'disponibile') stato.fase = autoUpdater.autoDownload ? 'scarico' : 'disponibile'
    d.registro.info(`[aggiornamenti] c'è la ${info.version}${autoUpdater.autoDownload ? ': la scarico' : ' (aggiornamenti automatici spenti: non la scarico)'}`)
    cambiato()
  })
  autoUpdater.on('update-not-available', () => { tentativiRete = 0; stato.cercando = false; delete stato.errore; cambiato() })
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
    primaPronta = undefined
    stato.versione = info.version
    stato.prontoDa = adesso()
    installerScaricato = (info as { downloadedFile?: string }).downloadedFile
    if (stato.progresso !== undefined) stato.progresso = { ...stato.progresso, percento: 100, scaricati: stato.progresso.totale }
    d.registro.info(`[aggiornamenti] ${info.version} pronta: niente lavori nuovi, installo appena finiscono quelli in corso`)
    cambiato()
  })
  autoUpdater.on('error', (err) => {
    const m = (err instanceof Error ? err.message : String(err)).replace(/\s+/gu, ' ').slice(0, 300)
    stato.cercando = false
    if (stato.fase === 'scarico' || stato.fase === 'disponibile') {
      if (primaPronta !== undefined) tornaPronta()
      else if (stato.fase === 'scarico') { stato.fase = 'niente'; delete stato.progresso }
    }
    if (eErroreDiRete(m)) {
      // Rete caduta o PC in sospensione: non è un guasto, nessun errore nella finestra né nello storico; si riprova.
      delete stato.errore
      d.registro.info('[aggiornamenti] avviso: rete interrotta, riprovo')
      cambiato()
      if (tentativiRete < TENTATIVI_RETE_MAX && !ritento) {
        tentativiRete++
        ritento = setTimeout(() => { ritento = undefined; cerca() }, RITENTA_RETE_MS)
      }
      return
    }
    stato.errore = m
    cambiato()
    // Un blocco: nello storico degli errori, una volta per motivo.
    if (m !== ultimoErrore) { ultimoErrore = m; d.registro.errore(`[aggiornamenti] aggiornamento dell'Aiutante non riuscito: ${m}`) }
  })
  const cerca = (): void => {
    // Mentre scarica o installa non si ricomincia; con una versione pronta si cerca in silenzio.
    if (stato.fase === 'scarico' || stato.fase === 'installo' || installando) return
    const silenzio = stato.fase === 'pronto'
    stato.ultimaRicerca = adesso()
    if (!silenzio) stato.cercando = true
    autoUpdater.autoDownload = d.automatici()
    if (!silenzio) cambiato()
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
      void (async () => {
        // Prima la finestra: SierraDeck Update nasce dove sta quella degli
        // aggiornamenti e mostra chiusura, installazione e riapertura.
        let conFinestra = false
        const installer = installerScaricato
        if (installer !== undefined && d.conUpdater !== undefined) {
          try { conFinestra = await d.conUpdater({ installer, versione: stato.versione ?? '' }) } catch { conFinestra = false }
        }
        try { d.primaDiInstallare() } catch { /* si installa lo stesso */ }
        if (conFinestra) {
          d.registro.info('[aggiornamenti] SierraDeck Update è vivo: esco, installa lui nella finestra in basso a destra')
          app.quit()
          return
        }
        // Ripiego: in silenzio, e l'Aiutante riparte da solo a installazione finita.
        autoUpdater.quitAndInstall(true, true)
      })()
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
  // Al risveglio dalla sospensione la rete ci mette qualche secondo a tornare.
  let alRisveglio: ReturnType<typeof setTimeout> | undefined
  const suRisveglio = (): void => {
    if (alRisveglio) clearTimeout(alRisveglio)
    alRisveglio = setTimeout(() => { alRisveglio = undefined; tentativiRete = 0; cerca() }, RISVEGLIO_MS)
  }
  try { powerMonitor.on('resume', suRisveglio) } catch { /* senza powerMonitor resta il controllo orario */ }
  return {
    stato: () => stato,
    cerca,
    scarica,
    installaAdesso: adessoAMano,
    ferma: () => {
      clearTimeout(primo); clearInterval(ogniOra); clearInterval(ogniMinuto)
      if (ritento) clearTimeout(ritento)
      if (alRisveglio) clearTimeout(alRisveglio)
      try { powerMonitor.removeListener('resume', suRisveglio) } catch { /* niente */ }
    }
  }
}
