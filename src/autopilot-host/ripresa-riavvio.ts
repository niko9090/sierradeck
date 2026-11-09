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
}): RipresaRiavvio | undefined {
  const fermo = lavoroFermo({ coda: p.coda, piano: p.piano, alLavoro: new Set() })
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
  return {
    testo: righe.join('\n'),
    ...(fermo !== undefined ? { firma: fermo.firma } : {}),
    interrotti,
    messaggioPerso: perso !== undefined
  }
}
