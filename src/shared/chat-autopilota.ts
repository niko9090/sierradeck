import type { Autopilota } from './autopilota'
import { vociDecisioni } from './diario-autopilota'

/**
 * Una riga della chat con l'autopilota.
 *
 * `tu` e `lui` sono le battute vere — quello che gli hai scritto, quello che
 * ti ha risposto o chiesto. `nota` è la sua voce di lavoro: ha deciso, ha
 * corretto, si è configurato. Le note stanno nello stesso flusso perché è così
 * che una chat si legge — in ordine, senza cercare in due posti — ma sono
 * disegnate più quiete, per non coprire le domande e le risposte.
 */
export type Battuta = {
  quando: string
  da: 'tu' | 'lui' | 'nota'
  testo: string
  /** Cosa ne ha fatto (dialogo), o il resto di una nota. */
  dettaglio?: string
  /**
   * Il colore della riga. `domanda` è una sua domanda ancora aperta, `fine` e
   * `fermo` chiudono la conversazione; gli altri sono i tipi del diario.
   */
  tono?: 'domanda' | 'decisione' | 'correzione' | 'preparazione' | 'lavoro' | 'pronto' | 'fine' | 'fermo'
  /** Quante volte di fila la stessa nota: dieci riprese uguali sono una riga. */
  volte?: number
}

/**
 * La chat con l'autopilota, dal principio a oggi, nell'ordine in cui è successa.
 *
 * Nicholas (18/09): «io posso dialogare con lui e lui con me attraverso la
 * chat, così rimangono ben visibili domande e risposte». Prima le sue domande
 * stavano in un riquadro ambra, le tue risposte nel diario, il dialogo in fondo
 * alla scheda: tre posti per una conversazione sola. Qui è una: quello che gli
 * hai chiesto all'inizio, le domande dell'intervista con le tue risposte, le
 * sue decisioni come note, il dialogo, la domanda che ha aperta adesso.
 *
 * Pura: si prova senza servizio.
 */
export function conversazione(a: Autopilota): Battuta[] {
  const righe: { b: Battuta; ordine: number }[] = []
  let n = 0
  const metti = (b: Battuta): void => { righe.push({ b, ordine: n++ }) }

  // La prima battuta è la tua: quello che gli hai chiesto, con le tue parole.
  // Per gli autopiloti nati prima di `obiettivoTuo` c'è solo l'obiettivo.
  metti({ quando: a.iniziatoIl, da: 'tu', testo: a.obiettivoTuo ?? a.obiettivo })

  // L'intervista: le sue domande e le tue risposte. Non hanno un orario: stanno
  // subito dopo la richiesta, nell'ordine in cui le ha fatte.
  for (const s of a.intervista) {
    metti({ quando: a.iniziatoIl, da: 'lui', testo: s.domanda, tono: 'domanda' })
    metti({ quando: a.iniziatoIl, da: 'tu', testo: s.risposta })
  }

  // Le domande e risposte della linguetta «Domande» (0.38.0) stanno nel
  // dialogo come traccia: la risposta scritta anche nel diario non va ripetuta.
  const tracce = a.dialogo.filter((s) => s.traccia === true && s.da === 'tu').map((s) => s.testo.replace(/\s+/g, ' ').trim().slice(0, 60))
  for (const v of vociDecisioni(a)) {
    // La domanda del supervisore non sta nella chat (0.38.0): sta nella
    // linguetta «Domande», e dopo la risposta entra qui come traccia.
    if (/^Ha deciso: chiedi(Utente)?$/.test(v.titolo)) continue
    if (v.tipo === 'tu' && tracce.some((t) => t !== '' && (v.dettaglio ?? v.titolo).replace(/\s+/g, ' ').trim().startsWith(t.slice(0, 50)))) continue
    if (v.tipo === 'tu') {
      // Una tua risposta arrivata a una sua domanda: è una battuta tua.
      metti({ quando: v.quando, da: 'tu', testo: v.dettaglio ?? v.titolo })
      continue
    }
    metti({
      quando: v.quando,
      da: 'nota',
      testo: v.titolo,
      ...(v.dettaglio !== undefined ? { dettaglio: v.dettaglio } : {}),
      ...(v.tipo !== undefined ? { tono: v.tipo } : {})
    })
  }

  for (const s of a.dialogo) {
    metti({
      quando: s.quando,
      da: s.da,
      testo: s.testo,
      ...(s.da === 'lui' && s.esito !== undefined && s.esito !== 'nessun cambio' ? { dettaglio: s.esito } : {})
    })
  }

  // La domanda aperta e il via **non** stanno nella chat (0.38.0, Nicholas):
  // stanno nella linguetta «Domande», una per volta. Qui resta una nota
  // quieta che dice dove andare; dopo la risposta, domanda e risposta entrano
  // nella chat come traccia (dal dialogo).
  const chiede = a.stato === 'attesa' || (a.stato === 'intervista' && a.motivoSospensione !== undefined)
  if (chiede || a.stato === 'pronto') {
    metti({
      quando: a.ultimoEvento,
      da: 'nota',
      testo: a.stato === 'pronto' ? 'Aspetta il tuo via: è nella linguetta «Domande» qui sotto.' : 'Ti ha fatto una domanda: è nella linguetta «Domande» qui sotto.'
    })
  } else if (a.stato === 'finito') {
    metti({ quando: a.ultimoEvento, da: 'nota', testo: 'Ha finito.', tono: 'fine' })
  } else if (a.stato === 'sospeso') {
    metti({
      quando: a.ultimoEvento,
      da: 'nota',
      testo: 'Si è fermato.',
      ...(a.motivoSospensione !== undefined ? { dettaglio: a.motivoSospensione } : {}),
      tono: 'fermo'
    })
  }

  // In ordine di tempo; a parità, nell'ordine in cui sono state messe — è così
  // che l'intervista resta domanda-risposta-domanda-risposta.
  righe.sort((x, y) => x.b.quando.localeCompare(y.b.quando) || x.ordine - y.ordine)
  return comprimiNote(righe.map((r) => r.b))
}

/**
 * Le note consecutive identiche diventano una sola con il numero delle volte.
 *
 * Le battute vere non si comprimono mai: due «sì» tuoi di fila sono due
 * risposte, non una ripetizione.
 */
export function comprimiNote(battute: Battuta[]): Battuta[] {
  const uscita: Battuta[] = []
  for (const b of battute) {
    const ultima = uscita[uscita.length - 1]
    if (
      ultima !== undefined && ultima.da === 'nota' && b.da === 'nota' &&
      ultima.testo === b.testo && ultima.dettaglio === b.dettaglio
    ) {
      ultima.volte = (ultima.volte ?? 1) + 1
      ultima.quando = b.quando
      continue
    }
    uscita.push({ ...b })
  }
  return uscita
}

/** Sta ancora pensando alla tua ultima battuta: l'ultima cosa detta è tua. */
export function staPensando(a: Autopilota): boolean {
  const ultima = a.dialogo[a.dialogo.length - 1]
  return ultima?.da === 'tu' && ultima.traccia !== true
}

/** C'è una sua domanda aperta: quello che scrivi adesso è la risposta. */
export function haDomandaAperta(a: Autopilota): boolean {
  return a.stato === 'attesa' || (a.stato === 'intervista' && a.motivoSospensione !== undefined)
}
