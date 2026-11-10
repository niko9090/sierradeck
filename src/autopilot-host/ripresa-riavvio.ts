import type { Coda } from '@shared/coda-richieste'
import type { Piano } from '@shared/piano-orchestratore'
import { lavoroFermo } from './lavoro-fermo'

/**
 * **La ripresa dell'autopilota dopo un riavvio del servizio.**
 *
 * Un aggiornamento chiude il servizio insieme al programma: l'installer
 * sostituisce i file e il processo `claude` dell'autopilota, con i suoi
 * specialisti, muore. Il disco ricorda il piano, la coda e il dialogo; la
 * memoria no — e in memoria stavano il messaggio di Nicholas che il turno
 * stava ancora leggendo e la lista di chi lavorava.
 *
 * Fino alla 0.97.3 al ritorno non succedeva niente, a meno di un nuovo
 * messaggio o del controllo del «lavoro fermo», che arriva dopo tre minuti,
 * non vede un messaggio perso e smette dopo due spinte: l'update del 07/11
 * (07:09 → 07:13) l'ha dimostrato. Qui si decide **subito** cosa dire
 * all'autopilota, solo dal disco.
 */

/** Un messaggio di Nicholas senza risposta da più di così non si rimanda: sarà una chiusa muta. */
export const MESSAGGIO_RECENTE_MS = 2 * 60 * 60_000

export type RigaDialogoRipresa = { quando: string; da: 'tu' | 'lui' | 'evento'; testo: string }

export type RipresaRiavvio = {
  /** Il testo dell'evento per l'autopilota. */
  testo: string
  /** La firma del lavoro fermo, per non spingerlo di nuovo subito dopo. */
  firma?: string
  /** Cosa si riprende, per il registro. */
  interrotti: number
  messaggioPerso: boolean
}

const corto = (t: string, n: number): string => {
  const x = t.replace(/\s+/gu, ' ').trim()
  return x.length > n ? `${x.slice(0, n - 1)}…` : x
}

/**
 * Il messaggio di Nicholas rimasto senza risposta: l'ultima battuta del
 * dialogo (gli eventi del programma non contano) è sua, ed è recente.
 */
export function messaggioSenzaRisposta(dialogo: readonly RigaDialogoRipresa[], adesso: number): RigaDialogoRipresa | undefined {
  const ultima = [...dialogo].reverse().find((r) => r.da !== 'evento')
  if (ultima === undefined || ultima.da !== 'tu') return undefined
  const quando = Date.parse(ultima.quando)
  if (Number.isNaN(quando) || adesso - quando > MESSAGGIO_RECENTE_MS || adesso < quando) return undefined
  return ultima
}

/**
 * Cosa dire all'autopilota di un workspace appena il servizio è ripartito.
 * `undefined` quando non c'è niente da riprendere: nessun compito a metà,
 * nessuna richiesta senza piano, nessun messaggio perso.
 *
 * Al riavvio **nessuno specialista è vivo**: ogni compito «in corso» è
 * interrotto, e `lavoroFermo` lo dice con un insieme di vivi vuoto.
 */
export function ripresaDopoRiavvio(p: {
  coda: Coda
  piano: Piano
  dialogo: readonly RigaDialogoRipresa[]
  adesso: number
  /** I compiti la cui unione il programma ha già rimesso in marcia: non sono fermi. */
  inUnione?: ReadonlySet<string>
}): RipresaRiavvio | undefined {
  const fermo = lavoroFermo({ coda: p.coda, piano: p.piano, alLavoro: new Set(), ...(p.inUnione !== undefined ? { inUnione: p.inUnione } : {}) })
  const perso = messaggioSenzaRisposta(p.dialogo, p.adesso)
  if (fermo === undefined && perso === undefined) return undefined
  const interrotti = p.piano.compiti.filter((c) => c.stato === 'in-corso').length
  const righe = [
    'Il programma si è riavviato (aggiornamento o riavvio del servizio): tutto quello che girava si è fermato, specialisti compresi.',
    'Le loro copie di lavoro, i rami e il piano sono sul disco: riprendi da dove eri, senza rifare quello che risulta già fatto.'
  ]
  if (perso !== undefined) {
    righe.push(
      `L'ultimo messaggio di Nicholas non ha ricevuto risposta prima dell'interruzione: «${corto(perso.testo, 400)}». Se l'hai già trattato ignora questa riga, altrimenti rispondigli.`
    )
  }
  if (fermo !== undefined) {
    righe.push('Quello che aspetta di muoversi:', ...fermo.righe)
    righe.push('Rilancia adesso gli specialisti interrotti (stesso compito, stesso ramo) e porta avanti il resto, nello stesso turno.')
  }
  if (p.inUnione !== undefined && p.inUnione.size > 0) {
    righe.push(`Le unioni di ${[...p.inUnione].join(', ')} le ho rimesse in marcia io: non rifarle. Se non trovano il ramo te lo dico subito e allora lo unisci tu, dando il ramo (git worktree list). Un compito che viene dopo parte appena sono unite, e ti avviso io.`)
  }
  return {
    testo: righe.join('\n'),
    ...(fermo !== undefined ? { firma: fermo.firma } : {}),
    interrotti,
    messaggioPerso: perso !== undefined
  }
}

/**
 * La ripresa «dopo l'aggiornamento» scatta **solo se c'è stato un aggiornamento**.
 *
 * Il servizio riparte anche all'accensione del PC e dopo un crash: lì un lavoro
 * lasciato fermo apposta deve restare fermo. Il segno di un aggiornamento vero è
 * uno di due, scritti dalla versione di prima e mai da un riavvio qualunque: gli
 * autopiloti segnati «fermati per l'aggiornamento» (su disco, letti prima di
 * toglierli) oppure il riepilogo dell'aggiornamento che il programma porta al
 * ritorno (`aggiornamento-in-corso.json`, fresco).
 */
export function serveRipresaDopoAggiornamento(p: {
  servizioAppenaPartito: boolean
  avevaFermatiPerAggiornamento: boolean
  riepilogoAggiornamento: boolean
}): boolean {
  return p.servizioAppenaPartito && (p.avevaFermatiPerAggiornamento || p.riepilogoAggiornamento)
}

/**
 * Uno specialista che ha già il compito in mano non si lancia una seconda volta.
 *
 * Dopo un aggiornamento più strade dicono all'autopilota di rilanciare lo
 * stesso specialista (la ripresa, il controllo del lavoro fermo, il posto che
 * si libera): due rilanci facevano lavorare due specialisti sullo stesso
 * compito, ognuno con la sua copia. Vale per lo stesso compito e lo stesso
 * ruolo. Torna il motivo del rifiuto, o `undefined` se si può lanciare.
 */
export function motivoSpecialistaDoppio(
  richiesta: { descrizione: string; tipo: string },
  alLavoro: ReadonlyArray<{ compito?: string; ruolo: string; descrizione: string }>,
  compitoDi: (descrizione: string) => string | undefined
): string | undefined {
  const compito = compitoDi(richiesta.descrizione)
  if (compito === undefined) return undefined
  const gia = alLavoro.find((s) => s.compito === compito && s.ruolo === richiesta.tipo)
  if (gia === undefined) return undefined
  return `${compito} ha già uno specialista al lavoro («${gia.descrizione.slice(0, 80)}»): non lo rilanciare, è già ripartito. Aspetta il suo rapporto.`
}
