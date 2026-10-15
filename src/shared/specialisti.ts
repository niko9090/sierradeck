import type { Autopilota, ChatGovernata } from './autopilota'
import { RUOLI, type Ruolo, type SchedaRuolo } from './ruoli-agenti'

/**
 * Gli specialisti di un autopilota, visibili (0.73.0).
 *
 * Nicholas, 15/10: ogni autopilota sceglie gli specialisti che gli servono e
 * li fa lavorare ognuno in una chat sua, visibile nel workspace del progetto,
 * con il ruolo nel nome (Sviluppo, Collaudo, Revisione…). La scheda mostra
 * l'elenco con stato, ultima azione e un tasto per vedere la chat; per un
 * lavoro piccolo una chat sola, e la scheda lo dice.
 *
 * Pure: le usa il servizio (titoli, riga dell'organizzazione), il PC, la
 * pagina e l'app (l'elenco arriva calcolato dal PC).
 */

export type Specialista = {
  /** La chiave della chat: la sua nella flotta, l'autopilota per la chat sola. */
  id: string
  /** «Sviluppo», «Collaudo», … o «Chat unica». */
  ruolo: string
  colore: SchedaRuolo['colore'] | 'quieto'
  compito: string
  /** In parole: «al lavoro», «aspetta una risposta», «in pausa», «finita». */
  stato: string
  attivo: boolean
  ultimaAzione: string
  /** Per «Guarda»: la sessione di Claude Code e il workspace dove sta il riquadro. */
  sessionId?: string
  workspace?: string
  /** Ha finito (0.74.0): la sua chat si è chiusa da sola, il lavoro sta nel diario. Niente «Guarda». */
  chiusa?: true
}

export type Specialisti = {
  /** Una riga: come è organizzato il lavoro. */
  riga: string
  elenco: Specialista[]
}

const PAROLE: Record<ChatGovernata['stato'], string> = {
  lavoro: 'al lavoro',
  bloccata: 'aspetta una risposta',
  pausa: 'in pausa per i limiti del piano',
  finita: 'finita'
}

/** L'ultima cosa detta da una chat in una riga: la prima riga che dice qualcosa, corta. */
export function rigaUltimaAzione(testo: string): string {
  const riga = testo
    .split(/\r?\n/)
    .map((r) => r.replace(/^[#>*\-\s•]+/, '').replace(/\*\*/g, '').trim())
    .find((r) => r.length > 3) ?? ''
  return riga.length > 140 ? `${riga.slice(0, 139).trimEnd()}…` : riga
}

/** Il nome del riquadro: il ruolo davanti, così si legge anche stretto («Sviluppo · Notte»). */
export function titoloChatSpecialista(nomeAutopilota: string, ruolo: Ruolo | undefined): string {
  return ruolo === undefined ? nomeAutopilota : `${RUOLI[ruolo].nome} · ${nomeAutopilota}`
}

/** La riga dell'organizzazione quando il lavoro si divide fra specialisti. */
export function rigaFlotta(ruoli: Ruolo[]): string {
  const nomi = [...new Set(ruoli)].map((r) => RUOLI[r].nome)
  // Senza il numero: le Revisioni sono una per ramo, e il conto sta nell'elenco sotto.
  return `Lavoro diviso fra specialisti, ognuno nella sua chat: ${nomi.join(', ')}`
}

/** La riga quando resta una chat sola, con il perché. */
export function rigaChatSola(perche: 'piccolo' | 'senza-git' | 'limiti' | 'illeggibile', dettaglio?: string): string {
  if (perche === 'illeggibile') return 'Una chat sola: la divisione in compiti non si è letta, quindi lavora una chat che fa tutto.'
  if (perche === 'senza-git') return 'Una chat sola: il progetto non usa git, e senza cartelle separate gli specialisti si pesterebbero i file.'
  if (perche === 'limiti') return `Una chat sola: ${dettaglio ?? 'i limiti del piano non permettono più chat insieme'}.`
  return 'Lavoro piccolo: una chat sola, che fa tutto.'
}

const ruoliDi = (a: Autopilota): Ruolo[] => a.chats.map((c) => c.ruolo).filter((r): r is Ruolo => r !== undefined)

export function specialistiDi(a: Autopilota): Specialisti {
  const nome = a.nome !== '' ? a.nome : a.obiettivo.slice(0, 40)
  if (a.chats.length > 0) {
    return {
      // La riga salvata con la divisione, se non è del formato vecchio con il numero (0.73.1):
      // «3 specialisti» sopra un elenco di 4, visto il 15/10. Allora si rifà dai ruoli delle chat.
      riga: a.organizzazione !== undefined && !/^\d+ specialisti/.test(a.organizzazione) ? a.organizzazione : rigaFlotta(ruoliDi(a)),
      elenco: a.chats.map((c) => ({
        id: c.id,
        ruolo: c.ruolo !== undefined ? RUOLI[c.ruolo].nome : 'Chat',
        colore: c.ruolo !== undefined ? RUOLI[c.ruolo].colore : 'quieto',
        compito: c.compito,
        stato: PAROLE[c.stato] ?? c.stato,
        attivo: c.stato === 'lavoro',
        ultimaAzione: c.ultimaAzione ?? '',
        ...(c.sessionId !== undefined ? { sessionId: c.sessionId } : {}),
        ...(a.workspace !== undefined ? { workspace: a.workspace } : {}),
        ...(c.stato === 'finita' || a.stato === 'finito' ? { chiusa: true as const } : {})
      }))
    }
  }
  if (a.sessionId === undefined || a.stato === 'intervista' || a.stato === 'pronto') {
    return { riga: 'Non è ancora partito: quando parte sceglie se dividere il lavoro fra specialisti.', elenco: [] }
  }
  return {
    riga: a.organizzazione ?? rigaChatSola('piccolo'),
    elenco: [{
      id: a.id,
      ruolo: 'Chat unica',
      colore: 'quieto',
      compito: nome,
      stato: a.stato === 'lavoro' ? 'al lavoro' : a.stato === 'attesa' ? 'aspetta te' : a.stato === 'finito' ? 'finita' : 'ferma',
      attivo: a.stato === 'lavoro',
      ultimaAzione: a.ultimaAzioneChat ?? '',
      sessionId: a.sessionId,
      ...(a.workspace !== undefined ? { workspace: a.workspace } : {}),
      ...(a.stato === 'finito' ? { chiusa: true as const } : {})
    }]
  }
}
