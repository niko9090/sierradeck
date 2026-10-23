import { gestoAMano, nomeInterno, sigleIn } from '@shared/domanda-chiara'
import type { PartiDomanda } from '@shared/domanda-strutturata'

/**
 * **Domande che non arrivano a Nicholas** (0.84.3).
 *
 * Il controllo delle domande chiare (`domanda-chiara.ts`) le fa riscrivere una
 * volta. Se anche riscritte chiedono a Nicholas un gesto a mano — chiudere,
 * spostare, cancellare, correggere, lanciare — o parlano con sigle e nomi che
 * esistono solo dentro il lavoro («gruppo 3», «c-12»), non gli arrivano: il
 * programma fa da solo. La chat riceve la strada senza Nicholas; se le serve
 * davvero una sua decisione la richiede in parole semplici. Mai una scelta
 * presa al suo posto: la consigliata può essere «Sì, installo», e quella è sua.
 *
 * Il caso vero del 22/10: «Chiudi tu a mano l'autopilota del gestionale, visto
 * che il programma non mi lascia né chiuderlo né correggere il controllo del
 * gruppo 3?» — «Sì, lo chiudo io» / «Correggo io il comando».
 */

/** Perché la domanda non va a Nicholas, o `undefined` se può andarci. */
export function difettoCheScarta(p: PartiDomanda): string | undefined {
  const gesto = gestoAMano(p)
  if (gesto !== undefined) return `chiedeva un gesto a mano («${gesto}»)`
  // Solo quello che si legge per primo: nel perché ci sono uscite di comandi, con percorsi e rami.
  const visibili = [p.domanda, ...p.scelte.map((s) => s.scelta)].join('\n')
  const sigle = sigleIn(visibili)
  if (sigle.length > 0) return `parlava con sigle che fuori dal lavoro non dicono niente (${sigle.map((x) => `«${x}»`).join(', ')})`
  const interno = nomeInterno(visibili)
  if (interno !== undefined) return `parlava con un nome che esiste solo dentro il lavoro («${interno}»)`
  return undefined
}

/**
 * La domanda «chiudo lo stesso o correggi il comando?» che il programma
 * scriveva fino alla 0.84.2 per i criteri non misurati: oggi il lavoro si
 * chiude da solo, e quelle ancora aperte sono superate.
 */
export function eDomandaNonMisurati(p: Pick<PartiDomanda, 'domanda'>): boolean {
  return /^Chiudo lo stesso il lavoro, o correggi prima il comando di verifica/i.test(p.domanda.trim())
}

/**
 * La vecchia «sono bloccato» (fino alla 0.84.2): «Come vuoi che proceda?» con
 * le scelte «rivedi i criteri / ti dico io la strada / fermati». Non diceva di
 * quale lavoro né cosa non passava, e «rivedi i criteri» chiedeva a Nicholas
 * un lavoro a mano. Si chiude come superata: la chat rilegge gli errori da
 * capo e, se resta bloccata, la domanda torna scritta in parole semplici.
 */
export function eVecchiaBloccato(p: Pick<PartiDomanda, 'domanda' | 'scelte'>): boolean {
  return /^Come vuoi che proceda\?$/i.test(p.domanda.trim()) && p.scelte.some((s) => /^rivedi i criteri$/i.test(s.scelta.trim()))
}

/** Cosa dire alla chat e cosa scrivere al posto della domanda scartata. */
export type Scartata = { perLaChat: string; riga: string; risposta: string }

/** Le istruzioni per fare da soli quello che la domanda chiedeva. */
export const FAI_DA_SOLO =
  'Nicholas non fa gesti a mano: chiudere, spostare, cancellare, correggere e lanciare lo fanno il programma o le chat. ' +
  'Se si tratta di un criterio che non si lascia misurare o correggere, non chiedere: lavora al resto e, quando tutto il resto è fatto, dillo in poche righe; ' +
  'il criterio lo giudica l’autopilota e il lavoro si chiude da solo, con una riga per Nicholas. ' +
  'Se si tratta di chiudere o spostare una chat o un autopilota, se ne occupa il programma. ' +
  'Se ti serve davvero una sua decisione, scrivila in parole semplici, senza sigle, e chiedigli solo di scegliere.'

/** La domanda scartata: `undefined` se può andare a Nicholas. */
export function scartaSeNonVa(p: PartiDomanda): Scartata | undefined {
  const difetto = difettoCheScarta(p)
  if (difetto === undefined) return undefined
  const breve = p.domanda.replace(/\s+/g, ' ').trim().slice(0, 120)
  return {
    risposta: `non chiesta: ${difetto}; ci pensa il programma`,
    riga: `«${breve}» non la chiedo a Nicholas: ${difetto}. Ci pensa il programma`,
    perLaChat: `Hai chiesto: «${p.domanda}»\n\nNon lo chiedo a Nicholas: ${difetto}.\n\n${FAI_DA_SOLO}`
  }
}

/**
 * Una domanda già aperta che oggi non si farebbe più (0.84.3): chiedeva un
 * gesto a mano o parlava con sigle, oppure è la vecchia «chiudo lo stesso o
 * correggi il comando?». Il motivo per chiuderla come superata e la strada
 * da dare alla chat al posto della risposta.
 */
export function domandaDaNonFare(p: PartiDomanda): { motivo: string; strada: string } | undefined {
  if (eDomandaNonMisurati(p)) {
    return {
      motivo: 'un lavoro con un criterio che non si può misurare adesso si chiude da solo, con una riga',
      strada: 'Non serve più chiederlo: se il resto è fatto, dillo in poche righe e il lavoro si chiude da solo; il criterio che non si misura lo scrive il programma in una riga per Nicholas.'
    }
  }
  if (eVecchiaBloccato(p)) {
    return {
      motivo: 'non diceva di quale lavoro né cosa non passava: se serve, la rifaccio in parole semplici',
      strada: 'Non serve più aspettare questa risposta. Rileggi gli errori da capo, riga per riga, senza dare per buone le idee di prima, e prova una strada diversa. ' +
        'Se resti bloccata, chiudi il turno dicendo cosa hai scoperto: se serve, la domanda a Nicholas la rifà l’autopilota, in parole semplici.'
    }
  }
  const difetto = difettoCheScarta(p)
  if (difetto === undefined) return undefined
  return { motivo: `${difetto}: ci pensa il programma`, strada: `Non serve più chiederlo a Nicholas: ${difetto}.\n\n${FAI_DA_SOLO}` }
}
