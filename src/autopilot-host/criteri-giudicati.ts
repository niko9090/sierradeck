import type { Autopilota, Criterio } from '@shared/autopilota'
import { nomeCompito } from '@shared/domanda-chiara'
import type { EsitoVerifica } from './decisione'

/**
 * **Lo giudico io** (0.84.3).
 *
 * Il 22/10 l'autopilota di un progetto di Nicholas aveva un criterio che non
 * si lasciava misurare: il supervisore ne correggeva il comando e il programma
 * rifiutava la correzione («quel comando misura, e boccia»), «finito» veniva
 * rifiutato per lo stesso criterio, e alla fine la domanda è arrivata a
 * Nicholas: «Chiudi tu a mano l'autopilota del gestionale…?». Nicholas:
 * «togli i vincoli», mai un gesto a mano.
 *
 * Adesso un criterio il cui comando viene rifiutato ha **un altro tentativo**,
 * con il motivo del rifiuto davanti. Al secondo rifiuto il criterio lo giudica
 * l'autopilota: non blocca più la chiusura e Nicholas lo legge in una riga,
 * senza una domanda. Il comando resta e si misura ancora, per chi guarda.
 */

/** Quanti rifiuti di fila prima che il criterio lo giudichi l'autopilota. */
export const RIFIUTI_PRIMA_DEL_GIUDIZIO = 2

/** Le righe della storia che dicono «correzione rifiutata» per questo criterio. */
function eRifiuto(cosa: string, descrizione: string): boolean {
  return cosa.includes(`correzione rifiutata per «${descrizione}»`) ||
    cosa.includes(`Il comando del criterio «${descrizione}» non va bene e non l'ho preso`)
}

/**
 * Quante correzioni del comando sono state rifiutate, contate dalla storia:
 * così vale anche per gli autopiloti nati prima della 0.84.3, che i loro
 * rifiuti li hanno già scritti. Una correzione accettata azzera il conto.
 */
export function rifiutiDi(a: Pick<Autopilota, 'decisioni'>, descrizione: string): number {
  let n = 0
  for (const d of a.decisioni) {
    if (d.cosa.startsWith(`criterio corretto — «${descrizione}»`)) n = 0
    else if (eRifiuto(d.cosa, descrizione)) n += 1
  }
  return n
}

/** Il criterio è già giudicato dall'autopilota. */
export function giudicato(c: Pick<Criterio, 'giudicato'> | undefined): boolean {
  return c?.giudicato !== undefined
}

/**
 * Gli esiti che decidono: senza i criteri giudicati dall'autopilota. Un
 * criterio giudicato si misura ancora (lo si vede accanto al criterio), ma non
 * boccia più la chiusura e non manda più la chat a girare.
 */
export function esitiCheDecidono(esiti: EsitoVerifica[], criteri: Criterio[]): EsitoVerifica[] {
  return esiti.filter((e) => !giudicato(criteri.find((c) => c.descrizione === e.descrizione)))
}

export type DopoRifiuto = {
  criteri: Criterio[]
  /** `true` se con questo rifiuto il criterio passa al giudizio dell'autopilota. */
  giudicato: boolean
  /** La riga per la storia: per il supervisore se ha ancora un tentativo, per Nicholas se è giudicato. */
  riga: string
  /** Cosa dire alla chat o al supervisore nel giro dopo. */
  istruzioni: string
}

/**
 * Un rifiuto in più per il comando di `descrizione`. `rifiutiPrima` sono quelli
 * già nella storia (`rifiutiDi`), senza questo.
 */
export function dopoRifiuto(p: {
  criteri: Criterio[]
  descrizione: string
  motivo: string
  rifiutiPrima: number
  /** Il perché del supervisore, se l'ha dato: entra nel giudizio. */
  perche?: string
  adesso: string
}): DopoRifiuto {
  const n = p.rifiutiPrima + 1
  const nome = nomeCompito(p.descrizione, 90)
  if (n < RIFIUTI_PRIMA_DEL_GIUDIZIO) {
    return {
      criteri: p.criteri,
      giudicato: false,
      riga: `correzione rifiutata per «${p.descrizione}» (${n} di ${RIFIUTI_PRIMA_DEL_GIUDIZIO}): ${p.motivo}`,
      istruzioni:
        `La correzione del comando del criterio «${nome}» è stata rifiutata: ${p.motivo}\n` +
        'Hai un altro tentativo: se il comando è davvero sbagliato, scrivine uno che misuri la stessa cosa e tenga conto del motivo del rifiuto. ' +
        'Se invece è il lavoro a non soddisfarlo, correggi il lavoro. Al prossimo rifiuto il criterio lo giudica l’autopilota, senza chiedere niente a Nicholas.'
    }
  }
  const perche = (p.perche ?? '').replace(/\s+/g, ' ').trim()
  const motivo = p.motivo.replace(/\s+/g, ' ').trim()
  const giudizio = `il comando non si lascia correggere (${motivo.slice(0, 200)})${perche !== '' ? `; ${perche.slice(0, 200)}` : ''}`
  return {
    criteri: p.criteri.map((c) => (c.descrizione === p.descrizione ? { ...c, giudicato: { il: p.adesso, perche: giudizio } } : c)),
    giudicato: true,
    riga: `Il criterio «${nome}» lo giudico io: ${giudizio}. Non blocca più la chiusura; il suo comando si misura ancora e lo vedi accanto al criterio.`,
    istruzioni:
      `Il comando del criterio «${nome}» è stato rifiutato ${n} volte: da adesso quel criterio lo giudica l’autopilota e non blocca più la chiusura. ` +
      'Non chiedere niente a Nicholas su questo. Prosegui con il resto; quando tutto il resto è fatto, dillo in poche righe e il lavoro si chiude.'
  }
}

/** Un criterio che a fine lavoro non si è potuto misurare: quale e perché. */
export type SenzaMisura = { descrizione: string; perche: string }

/** I criteri non misurati, per la riga di chiusura. */
export function senzaMisura(esiti: EsitoVerifica[]): SenzaMisura[] {
  return esiti.filter((e) => e.misurato === false).map((e) => {
    const uscita = e.uscita.replace(/\s+/g, ' ').trim()
    return { descrizione: e.descrizione, perche: `il comando di verifica non parte${uscita !== '' ? ` («${uscita.slice(0, 160)}»)` : ''}` }
  })
}

/**
 * La riga per Nicholas quando il lavoro si chiude con criteri che non si sono
 * potuti misurare: quali e perché, e come riaprirlo. Niente domanda.
 */
export function rigaChiusoSenzaMisura(criteri: SenzaMisura[]): string {
  const quali = criteri.map((c) => `«${nomeCompito(c.descrizione, 90)}»: ${c.perche}`).join('; ')
  return `Lavoro chiuso da solo anche se ${criteri.length === 1 ? 'un criterio non si è potuto misurare' : `${criteri.length} criteri non si sono potuti misurare`} — ${quali}. ` +
    'Il resto è verificato. Le chat vanno nel recupero per 30 giorni; se serve, lo riapri con «Riprendi».'
}
