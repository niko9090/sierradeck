import type { ChatGovernata } from '@shared/autopilota'

/**
 * **Una chat che aspetta un'altra chat** (0.82.1).
 *
 * Il 20-21/10 più chat della stessa flotta hanno chiuso giro dopo giro con
 * «aspetto che c-12 finisca» o «resto in attesa di c-48»: nessuno le
 * sbloccava, e l'autopilota le contava come al lavoro. Adesso, se lo dice per
 * più di un giro di fila, interviene l'autopilota:
 * - **sblocca**: la chat attesa ha finito (o non c'è più), il suo lavoro è nel
 *   ramo principale: si riallinea e prosegue;
 * - **sposta**: la chat attesa lavora ancora: si va avanti con la parte del
 *   compito che non dipende da lei;
 * - **chiude**: aspetta ancora dopo lo «sposta»: la chat si chiude e il suo
 *   compito torna in coda, dopo quello della chat attesa.
 */

export type Attesa = { di: string; giri: number }

/** Da quanti giri di fila si interviene: «più di un giro». */
export const GIRI_ATTESA = 2

/**
 * L'id della chat sorella che il messaggio di fine turno dice di aspettare.
 * Solo una sorella vera (non sé stessa), e solo con un verbo di attesa vicino.
 */
export function chatAttesa(messaggio: string, sorelle: string[], me: string | undefined): string | undefined {
  const re = /\b(aspett\w*|attend\w*|in attesa|finch[eé]\s+non|dipend\w*\s+da|bloccat\w*\s+da)\b[^.\n]{0,100}?\b(c-\d+[a-z0-9-]*)/gi
  for (const m of messaggio.matchAll(re)) {
    const id = m[2]?.toLowerCase()
    if (id !== undefined && id !== me && sorelle.includes(id)) return id
  }
  return undefined
}

/** L'attesa aggiornata dopo questo giro: un giro in più se è la stessa chat, da capo se cambia, nessuna se non aspetta. */
export function prossimaAttesa(prima: Attesa | undefined, di: string | undefined): Attesa | undefined {
  if (di === undefined) return undefined
  return prima?.di === di ? { di, giri: prima.giri + 1 } : { di, giri: 1 }
}

export type Intervento =
  | { tipo: 'sblocca' | 'sposta'; istruzioni: string; nota: string }
  | { tipo: 'chiudi'; nota: string; compitoDopo: string }

/** Cosa fa l'autopilota per una chat che aspetta da `attesa.giri` giri. */
export function interventoAttesa(p: {
  chat: Pick<ChatGovernata, 'id' | 'compito'>
  attesa: Attesa
  aspettata: Pick<ChatGovernata, 'id' | 'compito' | 'stato' | 'approvata'> | undefined
  ramoBase: string | undefined
}): Intervento | undefined {
  const { chat, attesa } = p
  if (attesa.giri < GIRI_ATTESA) return undefined
  const lei = p.aspettata
  const base = p.ramoBase ?? 'principale'
  if (lei === undefined || lei.stato === 'finita' || lei.approvata === true) {
    return {
      tipo: 'sblocca',
      istruzioni: `Non c’è più niente da aspettare: la chat ${attesa.di} ${lei === undefined ? 'non c’è più' : 'ha finito'} e il suo lavoro è nel ramo ${base}. ` +
        `Nella tua cartella fai git merge ${base}, poi prosegui il tuo compito senza aspettare nessuno.`,
      nota: `${chat.id} aspettava ${attesa.di} da ${attesa.giri} giri, ma ${attesa.di} ${lei === undefined ? 'non c’è più' : 'ha finito'}: la sblocco`
    }
  }
  if (attesa.giri === GIRI_ATTESA) {
    return {
      tipo: 'sposta',
      istruzioni: `Non aspettare la chat ${attesa.di}: lavora ancora a «${lei.compito.slice(0, 120)}» e può metterci molto. ` +
        'Fai adesso le parti del tuo compito che non dipendono da lei. Se non ce ne sono, chiudi il turno dicendolo in una riga: ' +
        'ti chiudo io e il tuo compito riparte quando lei ha finito.',
      nota: `${chat.id} aspetta ${attesa.di} da ${attesa.giri} giri: le dico di fare intanto il resto del suo compito`
    }
  }
  return {
    tipo: 'chiudi',
    nota: `${chat.id} aspetta ${attesa.di} da ${attesa.giri} giri: la chiudo, il suo compito riparte dopo quello di ${attesa.di}`,
    compitoDopo: lei.compito
  }
}

/** Il compito che torna in coda dopo una chiusura per attesa: diverso dall'originale, così non risulta già fatto. */
export function compitoRipreso(compito: string, dopo: string): string {
  return `${compito}\n\n(Ripreso dopo «${dopo.slice(0, 80)}»: prima fai git merge del ramo principale.)`
}
