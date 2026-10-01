import { chiaveFermo, eFermo, type Autopilota } from '@shared/autopilota'
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
  /**
   * Gli altri gesti accanto al principale (0.37.0): per un autopilota fermo
   * «Riprendi» e «Archivia», sugli autopiloti di `ids`.
   */
  altre?: { azione: 'riprendiAutopiloti' | 'archiviaAutopiloti'; etichetta: string; titolo: string; ids: string[] }[]
  /**
   * Le chiavi che «Chiudi» ricorda (0.37.0). Presente solo per gli avvisi che
   * si possono chiudere: un fermo (id + momento + motivo) o una lista di
   * programmi mancanti. Chiuso, l'avviso non torna finche' non cambia la
   * chiave: un fermo nuovo, una lista diversa.
   */
  chiavi?: string[]
}

/** Quante chiavi chiuse si ricordano: le piu' vecchie si dimenticano. */
export const AVVISI_CHIUSI_MAX = 200

/** La chiave dell'avviso dei programmi mancanti: cambia quando cambia la lista. */
export function chiavePreparazione(mancanti: string[]): string {
  return `preparazione|${[...mancanti].sort().join('|')}`
}

/** Aggiunge le chiavi chiuse, senza doppioni e senza crescere per sempre. */
export function ricordaChiusi(chiusi: string[], nuove: string[]): string[] {
  const tutte = [...chiusi.filter((c) => !nuove.includes(c)), ...nuove]
  return tutte.slice(-AVVISI_CHIUSI_MAX)
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
  /** Le chiavi degli avvisi chiusi con «Chiudi» (dalle preferenze, sopravvive al riavvio). */
  chiusi?: string[]
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

  // **Aspettare e prepararsi non sono la stessa cosa**, e contarli insieme
  // faceva dire alla banda «aspetta una tua risposta» a chi non aveva ancora
  // niente da chiedere: si premeva «Rispondi» e si trovava scritto «si sta
  // preparando». Un avviso che manda dove non c'è niente da fare insegna a non
  // fidarsi di quelli veri.
  const inAttesa = fonti.autopiloti.filter((a) => a.stato === 'attesa')
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

  // La preparazione **non** compare qui. È lavoro che procede da solo, e si
  // guarda nel pannello dell'autopilota, che è il posto dove uno va quando
  // vuole sapere a che punto è. La banda in cima ha un solo mestiere: dire che
  // serve te. Riempirla di cose che vanno avanti per conto loro la trasforma in
  // arredamento, e il giorno che chiede davvero qualcosa nessuno la legge.

  if (!fonti.servizioRaggiungibile) {
    avvisi.push({
      id: 'servizio',
      gravita: 'attenzione',
      testo: 'Il servizio degli autopiloti non risponde: quelli in corso non stanno lavorando.',
      azione: 'riavviaServizio',
      etichettaAzione: 'Riavvia'
    })
  }

  // Gli autopiloti fermi: senza gli archiviati (messi da parte da te) e senza
  // i fermi gia' chiusi con «Chiudi». Un fermo nuovo ha una chiave nuova, e
  // torna (0.37.0: prima la banda restava finche' l'autopilota era fermo, e uno
  // che non doveva ripartire te lo portavi dietro per sempre).
  const chiusi = new Set(fonti.chiusi ?? [])
  const fermi = fonti.autopiloti.filter((a) => eFermo(a) && a.archiviato !== true && !chiusi.has(chiaveFermo(a)))
  if (fermi.length > 0) {
    const uno = fermi[0]
    const ids = fermi.map((a) => a.id)
    avvisi.push({
      id: 'fermi',
      gravita: 'attenzione',
      testo: fermi.length === 1
        ? `L’autopilota «${uno?.nome ?? ''}» si è fermato: ${accorcia(uno?.motivoSospensione ?? 'senza motivo riferito')}`
        : `${fermi.length} autopiloti si sono fermati.`,
      azione: 'apriAutopiloti',
      etichettaAzione: 'Vedi',
      altre: [
        {
          azione: 'riprendiAutopiloti',
          etichetta: fermi.length === 1 ? 'Riprendi' : 'Riprendili',
          titolo: fermi.length === 1
            ? 'Lo fa ripartire da dove era, con la stessa conversazione'
            : `Fa ripartire tutti e ${fermi.length} da dove erano`,
          ids
        },
        {
          azione: 'archiviaAutopiloti',
          etichetta: fermi.length === 1 ? 'Archivia' : 'Archiviali',
          titolo: 'Lo mette da parte: resta nel pannello Autopiloti fra gli archiviati, non compare più qui e non manda notifiche. «Riprendi» lo rimette in pista',
          ids
        }
      ],
      chiavi: fermi.map(chiaveFermo)
    })
  }

  // In fondo, e in una riga sola: Node.js e Git non impediscono di lavorare,
  // e dirlo una volta per ciascuno trasformerebbe la banda in arredamento.
  const mancanti = fonti.preparazione?.avvisi ?? []
  if (mancanti.length > 0 && !chiusi.has(chiavePreparazione(mancanti))) {
    avvisi.push({
      id: 'preparazione',
      gravita: 'attenzione',
      testo: mancanti.length === 1
        ? accorcia(mancanti[0] ?? '')
        : `${mancanti.length} programmi di sistema non risultano installati: alcune cose non funzioneranno.`,
      azione: 'apriPreparazione',
      etichettaAzione: 'Vedi',
      chiavi: [chiavePreparazione(mancanti)]
    })
  }

  return avvisi
}
