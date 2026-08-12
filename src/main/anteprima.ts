import { open, stat } from 'node:fs/promises'
import { parseLine } from './indexer/jsonl-parser'

export type Scambio = {
  ruolo: 'utente' | 'assistente'
  testo: string
  quando?: string
}

export type Anteprima = {
  /** Gli ultimi scambi, dal più vecchio al più recente. */
  scambi: Scambio[]
  /** Le ultime cose che la chat ha fatto: gli strumenti che ha usato. */
  azioni: string[]
  /** Quando ha scritto l'ultima volta: dice se sta ancora lavorando. */
  ultimaAttivita?: string
  /** Presente solo se la trascrizione non si è potuta leggere. */
  errore?: string
}

/** Quanti scambi mostrare: un'anteprima è un assaggio, non la conversazione. */
const SCAMBI_MAX = 8
/** Quante azioni recenti: bastano a capire dove sta lavorando. */
const AZIONI_MAX = 5
/** Oltre questo, un messaggio non è più un'anteprima ma un muro di testo. */
const TESTO_MAX = 400
/**
 * Quanta coda del file leggere.
 *
 * Le trascrizioni arrivano a decine di megabyte — su questa macchina la più
 * grande è di 666 KB, ma il progetto ne ha da 40 — e leggerle intere per
 * mostrare quattro righe bloccherebbe il processo che serve l'interfaccia.
 * Mezzo megabyte di coda contiene sempre gli ultimi scambi.
 */
const CODA_BYTE = 512 * 1024

function accorcia(testo: string): string {
  const pulito = testo.replace(/\s+/g, ' ').trim()
  return pulito.length <= TESTO_MAX ? pulito : `${pulito.slice(0, TESTO_MAX - 1).trimEnd()}…`
}

/** Il testo di un messaggio dell'assistente, che arriva in blocchi. */
function testoAssistente(message: Record<string, unknown> | undefined): string | undefined {
  if (message === undefined) return undefined
  const content = message.content
  if (typeof content === 'string') return content === '' ? undefined : content
  if (!Array.isArray(content)) return undefined
  for (const b of content) {
    if (typeof b !== 'object' || b === null) continue
    const blocco = b as Record<string, unknown>
    if (blocco.type === 'text' && typeof blocco.text === 'string' && blocco.text.trim() !== '') {
      return blocco.text
    }
  }
  return undefined
}

/** Che cosa ha appena fatto: nome dello strumento e su cosa. */
function azioneDi(message: Record<string, unknown> | undefined): string | undefined {
  if (message === undefined || !Array.isArray(message.content)) return undefined
  for (const b of message.content) {
    if (typeof b !== 'object' || b === null) continue
    const blocco = b as Record<string, unknown>
    if (blocco.type !== 'tool_use') continue
    const nome = typeof blocco.name === 'string' ? blocco.name : 'strumento'
    const input = (typeof blocco.input === 'object' && blocco.input !== null)
      ? (blocco.input as Record<string, unknown>)
      : {}
    // Il primo campo che dice *su cosa*: il comando, il file, il testo cercato.
    const dettaglio = [input.command, input.file_path, input.path, input.pattern, input.prompt]
      .find((x) => typeof x === 'string' && x !== '')
    return dettaglio === undefined ? nome : `${nome}: ${accorcia(String(dettaglio))}`
  }
  return undefined
}

/**
 * Un assaggio di una conversazione, senza aprirla.
 *
 * Serve a due domande diverse che hanno la stessa risposta: «di cosa parlava
 * questa chat?», guardando l'elenco delle sessioni, e «cosa sta facendo
 * adesso?», guardando una chat governata da un autopilota — che gira in un
 * processo staccato e non ha un terminale da guardare.
 *
 * Non solleva mai: un'anteprima che non si può leggere è un'informazione in
 * meno, non un errore che deve fermare l'interfaccia.
 */
export async function leggiAnteprima(
  jsonlPath: string,
  opzioni: { scambiMax?: number } = {}
): Promise<Anteprima> {
  const scambiMax = opzioni.scambiMax ?? SCAMBI_MAX

  let testo: string
  try {
    const { size } = await stat(jsonlPath)
    const fd = await open(jsonlPath, 'r')
    try {
      const da = Math.max(0, size - CODA_BYTE)
      const quanti = size - da
      const buffer = Buffer.alloc(quanti)
      await fd.read(buffer, 0, quanti, da)
      testo = buffer.toString('utf8')
      // La prima riga può essere tagliata a metà: si butta invece di provare a
      // interpretarla, altrimenti conterebbe come riga illeggibile.
      if (da > 0) testo = testo.slice(testo.indexOf('\n') + 1)
    } finally {
      await fd.close()
    }
  } catch (err) {
    return { scambi: [], azioni: [], errore: `trascrizione non leggibile: ${String(err)}` }
  }

  const scambi: Scambio[] = []
  const azioni: string[] = []
  let ultimaAttivita: string | undefined

  for (const riga of testo.split('\n')) {
    const p = parseLine(riga)
    if (p === undefined) continue
    if (p.timestamp !== undefined) ultimaAttivita = p.timestamp

    if (p.type === 'user' && !p.diServizio && p.testoUtente !== undefined) {
      scambi.push({ ruolo: 'utente', testo: accorcia(p.testoUtente), ...(p.timestamp !== undefined ? { quando: p.timestamp } : {}) })
      continue
    }
    if (p.type !== 'assistant' || p.diServizio) continue

    let grezzo: unknown
    try {
      grezzo = JSON.parse(riga)
    } catch {
      continue
    }
    const message = (typeof grezzo === 'object' && grezzo !== null)
      ? ((grezzo as Record<string, unknown>).message as Record<string, unknown> | undefined)
      : undefined

    const risposta = testoAssistente(message)
    if (risposta !== undefined) {
      scambi.push({ ruolo: 'assistente', testo: accorcia(risposta), ...(p.timestamp !== undefined ? { quando: p.timestamp } : {}) })
    }
    const azione = azioneDi(message)
    if (azione !== undefined) azioni.push(azione)
  }

  return {
    scambi: scambi.slice(-scambiMax),
    azioni: azioni.slice(-AZIONI_MAX),
    ...(ultimaAttivita !== undefined ? { ultimaAttivita } : {})
  }
}
