import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizzaPreferenze, portaValida, type Preferenze } from '@shared/preferenze'
import { leggiPostiScelti, leggiRegolazione } from '@shared/posti-chat'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import { PORTA_AIUTANTE } from './regole'

/**
 * **Le impostazioni dell'Aiutante** (12/11). Nicholas: «il mini programma ha
 * le stesse impostazioni del programma principale». Si usa lo stesso modello
 * (`@shared/preferenze`: posti «più/meno», numero scelto a mano, aggiornamenti
 * automatici, PC di sviluppo, porta, accetta da fuori la rete), con due voci
 * sue: partire all'accensione e la pausa (niente lavori nuovi).
 *
 * Il nome del PC non sta qui: è l'identità (`pc.json`), come nel programma completo.
 */

export type PreferenzeAiutante = {
  base: Preferenze
  /** Parte da solo all'accensione del PC (di serie sì: è un PC dedicato). */
  avvioAlLogin: boolean
  /** In pausa: non prende lavori nuovi (quelli in corso finiscono). */
  inPausa: boolean
}

export const FILE_PREFERENZE_AIUTANTE = 'preferenze.json'

/** Da un file (anche storto o di una versione vecchia): sempre un insieme valido. */
export function leggiPreferenzeAiutante(raw: unknown): PreferenzeAiutante {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const base = normalizzaPreferenze(o)
  // La porta di serie dell'Aiutante è un'altra (47641): così sta accanto al programma completo sullo stesso PC.
  if (!portaValida(o.portaClient)) base.portaClient = PORTA_AIUTANTE
  // Un Aiutante presta sempre i suoi posti come un PC dedicato: «Aiuta la rete» è tutto quello che fa.
  base.aiutoRete = 'dedicato'
  return { base, avvioAlLogin: o.avvioAlLogin !== false, inPausa: o.inPausa === true }
}

/** Il file come si scrive: le preferenze del modello comune più le due dell'Aiutante. */
export function perIlFile(p: PreferenzeAiutante): Record<string, unknown> {
  return { ...p.base, avvioAlLogin: p.avvioAlLogin, inPausa: p.inPausa }
}

/**
 * Un cambio dalla finestra: solo le voci che la finestra mostra, ognuna
 * controllata. `postiScelti: null` = si torna ad «Automatico».
 */
export function applicaCambio(prima: PreferenzeAiutante, cambio: unknown): PreferenzeAiutante {
  if (typeof cambio !== 'object' || cambio === null) return prima
  const c = cambio as Record<string, unknown>
  const base: Preferenze = { ...prima.base }
  if ('postiChat' in c) {
    const r = leggiRegolazione(c.postiChat)
    if (r === 0) delete base.postiChat
    else base.postiChat = r
  }
  if ('postiScelti' in c) {
    const n = leggiPostiScelti(c.postiScelti)
    if (n === undefined) delete base.postiScelti
    else base.postiScelti = n
  }
  if (typeof c.scaricaAggiornamentiAutomatico === 'boolean') base.scaricaAggiornamentiAutomatico = c.scaricaAggiornamentiAutomatico
  if (portaValida(c.portaClient)) base.portaClient = c.portaClient as number
  if ('pcSviluppo' in c) {
    if (typeof c.pcSviluppo === 'string' && c.pcSviluppo.trim() !== '' && c.pcSviluppo.length <= 120) base.pcSviluppo = c.pcSviluppo.trim()
    else delete base.pcSviluppo
  }
  return {
    base,
    avvioAlLogin: typeof c.avvioAlLogin === 'boolean' ? c.avvioAlLogin : prima.avvioAlLogin,
    inPausa: typeof c.inPausa === 'boolean' ? c.inPausa : prima.inPausa
  }
}

export function apriPreferenzeAiutante(dati: string): { leggi: () => PreferenzeAiutante; cambia: (cambio: unknown) => PreferenzeAiutante } {
  const file = join(dati, FILE_PREFERENZE_AIUTANTE)
  let attuali: PreferenzeAiutante
  try { attuali = leggiPreferenzeAiutante(JSON.parse(readFileSync(file, 'utf8')) as unknown) } catch { attuali = leggiPreferenzeAiutante(undefined) }
  return {
    leggi: () => attuali,
    cambia: (cambio) => {
      attuali = applicaCambio(attuali, cambio)
      scriviJsonAtomico(file, perIlFile(attuali), 'preferenze-aiutante')
      return attuali
    }
  }
}
