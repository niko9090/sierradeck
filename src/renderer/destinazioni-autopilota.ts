import type { SessionSummary } from '@shared/types'
import type { PaneData } from './state/layout'

export type Destinazione = {
  /** La cartella su cui l'autopilota lavorerà. */
  cwd: string
  /** Il nome con cui l'utente chiama quel lavoro: l'ultima parte del percorso. */
  etichetta: string
  /** Il titolo della chat aperta, oppure quante chat ha quel progetto. */
  dettaglio: string
  /** Vero se è una chat aperta adesso nel mosaico. */
  aperta: boolean
}

/** Oltre questo numero la tendina si scorre invece di scegliersi. */
export const RECENTI_MAX = 8

function nomeDi(percorso: string): string {
  const parti = percorso.split(/[\\/]/).filter((x) => x.trim() !== '')
  return parti[parti.length - 1] ?? percorso
}

function quando(s: SessionSummary): number {
  const t = Date.parse(s.lastTimestamp ?? '')
  return Number.isNaN(t) ? 0 : t
}

/**
 * Le cartelle fra cui scegliere quando si avvia un autopilota.
 *
 * Scrivere un percorso a mano era il punto in cui il modulo chiedeva all'utente
 * proprio ciò che la macchina sa già: quali chat sono aperte adesso e su quali
 * progetti si è lavorato. Un percorso battuto a mano, oltretutto, si sbaglia —
 * ed è un errore che si scopre soltanto quando l'autopilota è già partito.
 *
 * L'ordine dice quanto è probabile che sia quella giusta:
 *
 * 1. **Le chat aperte adesso.** Chi preme «nuovo autopilota» ha davanti una
 *    conversazione e sta pensando a quella.
 * 2. **I progetti toccati di recente**, dall'ultimo, presi dall'indice.
 *
 * Le cartelle si contano una volta sola: due riquadri sullo stesso progetto
 * sono una destinazione sola, perché l'autopilota governa una cartella.
 */
export function destinazioni(riquadri: PaneData[], sessioni: SessionSummary[]): Destinazione[] {
  const risultato: Destinazione[] = []
  const viste = new Set<string>()

  for (const r of riquadri) {
    if (viste.has(r.cwd)) continue
    viste.add(r.cwd)
    risultato.push({ cwd: r.cwd, etichetta: nomeDi(r.cwd), dettaglio: r.title, aperta: true })
  }

  // Un progetto per cartella, con la data della sua sessione più recente e il
  // numero di chat: è ciò che serve per riconoscerlo in una riga sola.
  const progetti = new Map<string, { ultima: number; chat: Set<string> }>()
  for (const s of sessioni) {
    const cartella = s.cwd ?? s.projectPath
    const prima = progetti.get(cartella)
    const chiaveChat = s.aiTitle ?? s.uuid
    if (prima === undefined) progetti.set(cartella, { ultima: quando(s), chat: new Set([chiaveChat]) })
    else {
      prima.ultima = Math.max(prima.ultima, quando(s))
      prima.chat.add(chiaveChat)
    }
  }

  const recenti = [...progetti.entries()]
    .filter(([cartella]) => !viste.has(cartella))
    .sort((a, b) => b[1].ultima - a[1].ultima)
    .slice(0, RECENTI_MAX)

  for (const [cartella, dati] of recenti) {
    risultato.push({
      cwd: cartella,
      etichetta: nomeDi(cartella),
      dettaglio: `${dati.chat.size} chat`,
      aperta: false
    })
  }

  return risultato
}
