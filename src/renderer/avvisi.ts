import type { Autopilota } from '@shared/autopilota'
import type { StatoAccesso } from '../main/accesso'
import type { StatoPreparazione } from '../main/preparazione'

export type Avviso = {
  id: string
  gravita: 'blocco' | 'attenzione'
  testo: string
  /** Cosa può fare l'utente da qui, quando esiste una risposta a un clic. */
  azione?:
    | 'riavviaServizio'
    | 'apriDomanda'
    | 'apriAutopiloti'
    | 'apriAccesso'
    | 'apriPreparazione'
    | 'apriFinestra'
  etichettaAzione?: string
}

export type FontiAvvisi = {
  accesso: StatoAccesso
  servizioRaggiungibile: boolean
  autopiloti: Autopilota[]
  /**
   * Cosa il Core ha trovato sul computer. Assente vuol dire «non lo sappiamo
   * ancora»: arriva con un giro di IPC, e nell'istante prima che risponda non
   * si deve gridare che manca tutto.
   */
  preparazione?: StatoPreparazione
}

/**
 * Quanto può essere lungo un avviso.
 *
 * Un motivo di sospensione può portarsi dietro l'output di un comando: visto
 * dal vivo, otto righe di errori SSH in una banda rossa all'avvio sembravano
 * il programma esploso, mentre era solo un autopilota che si era fermato. Qui
 * ci sta una riga; il resto vive nel pannello, dietro «Vedi».
 */
const AVVISO_MAX = 110

function accorcia(testo: string): string {
  const pulito = testo.replace(/\s+/g, ' ').trim()
  if (pulito.length <= AVVISO_MAX) return pulito
  const tagliato = pulito.slice(0, AVVISO_MAX - 1)
  const spazio = tagliato.lastIndexOf(' ')
  return `${(spazio > AVVISO_MAX / 2 ? tagliato.slice(0, spazio) : tagliato).trimEnd()}…`
}

/**
 * Gli avvisi che meritano un posto in cima alla finestra.
 *
 * Tre regole, tutte contro il rumore:
 *
 * 1. **Quando va tutto bene non si dice niente.** Un avviso permanente smette
 *    di essere un avviso e diventa arredamento, e il giorno che conta davvero
 *    nessuno lo legge.
 * 2. **Un avviso per categoria, con un numero.** Tre autopiloti fermi sono una
 *    riga con scritto «3», non tre righe identiche.
 * 3. **Prima ciò che si risolve prima.** Una domanda si sblocca rispondendo in
 *    dieci secondi; una sospensione va capita. L'ordine è quello.
 */
export function componiAvvisi(fonti: FontiAvvisi): Avviso[] {
  const avvisi: Avviso[] = []

  // Prima di tutto, persino dell'accesso: non c'è niente in cui accedere
  // finché il programma non c'è. Era il caso di chi apriva SierraDeck senza
  // aver mai installato Claude Code — riquadri vuoti e nessuna spiegazione.
  if (fonti.preparazione !== undefined && fonti.preparazione.claude === undefined) {
    return [{
      id: 'claude-assente',
      gravita: 'blocco',
      testo: 'Claude Code non è installato su questo computer: senza, le chat si aprono vuote.',
      azione: 'apriPreparazione',
      etichettaAzione: 'Installalo'
    }]
  }

  // Senza accesso non parte nessuna chat: ogni altro guasto ne è una
  // conseguenza, e mostrarli insieme manderebbe a cercare la causa sbagliata.
  if (!fonti.accesso.autenticato) {
    return [{
      id: 'accesso',
      gravita: 'blocco',
      testo: fonti.accesso.motivo ?? 'Manca l’accesso a Claude Code.',
      azione: 'apriAccesso',
      etichettaAzione: 'Come si fa'
    }]
  }

  const inAttesa = fonti.autopiloti.filter((a) => a.stato === 'attesa' || a.stato === 'intervista')
  if (inAttesa.length > 0) {
    avvisi.push({
      id: 'domande',
      gravita: 'attenzione',
      testo: inAttesa.length === 1
        ? `${inAttesa[0]?.nome} aspetta una tua risposta.`
        : `${inAttesa.length} autopiloti aspettano una tua risposta.`,
      azione: 'apriDomanda',
      etichettaAzione: 'Rispondi'
    })
  }

  if (!fonti.servizioRaggiungibile) {
    avvisi.push({
      id: 'servizio',
      gravita: 'attenzione',
      testo: 'Il servizio degli autopiloti non risponde: quelli in corso non stanno lavorando.',
      azione: 'riavviaServizio',
      etichettaAzione: 'Riavvia'
    })
  }

  const fermi = fonti.autopiloti.filter((a) => a.stato === 'sospeso' || a.stato === 'fallito')
  if (fermi.length > 0) {
    const uno = fermi[0]
    avvisi.push({
      id: 'fermi',
      gravita: 'attenzione',
      testo: fermi.length === 1
        ? `L’autopilota «${uno?.nome ?? ''}» si è fermato: ${accorcia(uno?.motivoSospensione ?? 'senza motivo riferito')}`
        : `${fermi.length} autopiloti si sono fermati.`,
      azione: 'apriAutopiloti',
      etichettaAzione: 'Vedi'
    })
  }

  // In fondo, e in una riga sola: Node.js e Git non impediscono di lavorare,
  // e dirlo una volta per ciascuno trasformerebbe la banda in arredamento.
  const mancanti = fonti.preparazione?.avvisi ?? []
  if (mancanti.length > 0) {
    avvisi.push({
      id: 'preparazione',
      gravita: 'attenzione',
      testo: mancanti.length === 1
        ? accorcia(mancanti[0] ?? '')
        : `${mancanti.length} programmi di sistema non risultano installati: alcune cose non funzioneranno.`,
      azione: 'apriPreparazione',
      etichettaAzione: 'Vedi'
    })
  }

  return avvisi
}
