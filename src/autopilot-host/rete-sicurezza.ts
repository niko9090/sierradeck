import type { Autopilota } from '@shared/autopilota'
import type { Decisione, EsitoVerifica } from './decisione'
import { riassuntoFallimenti } from './decisione'
import type { DecisioneSupervisore } from './decisione-supervisore'
import { strategiaPer, strategieFinite, STRATEGIE } from './strategie'

/**
 * Quello che il supervisore non può scavalcare.
 *
 * Dare la testa a Claude non vuol dire dargli anche le chiavi: un modello che
 * sbaglia deve poter sbagliare **poco**. Qui sotto restano le tre cose che
 * valgono più di qualunque opinione:
 *
 * 1. **I fatti.** Un criterio verificabile che fallisce batte un «finito»
 *    convinto. Il comando è stato eseguito davvero; il giudizio è un parere.
 * 2. **I limiti.** Se l'utente ha messo un tetto, quello vale — nessuna
 *    decisione può portare il lavoro oltre.
 * 3. **Il cerchio.** «Prosegui» senza istruzioni, o dopo giri identici, non è
 *    una decisione: è il modo di girare a vuoto con l'aria di lavorare.
 *
 * Non è sfiducia verso il supervisore: è la stessa ragione per cui esistono i
 * test anche quando il codice sembra giusto.
 */

export type Contesto = {
  a: Autopilota
  esiti: EsitoVerifica[]
  /** Da quanti giri l'esito è identico. */
  inCerchioDa: number
}

/** I criteri che un comando ha davvero misurato e bocciato. */
export function fallitiDavvero(esiti: EsitoVerifica[]): EsitoVerifica[] {
  return esiti.filter((e) => !e.passato && e.misurato !== false)
}

/**
 * Traduce la decisione del supervisore in una mossa, o la corregge.
 *
 * Restituisce anche `nota`: cosa è stato cambiato e perché. Finisce nella
 * storia, ed è l'unico modo per accorgersi che il supervisore sta prendendo
 * decisioni che vengono sistematicamente riscritte.
 */
export function applicaRete(
  ctx: Contesto,
  decisione: DecisioneSupervisore | undefined
): { mossa: Decisione; nota?: string } {
  const { a, esiti, inCerchioDa } = ctx
  const bocciati = fallitiDavvero(esiti)

  // Senza decisione si torna alle regole: è il caso del supervisore che non
  // risponde, e non deve mai bloccare il lavoro.
  if (decisione === undefined) {
    return { mossa: dalleRegole(ctx), nota: 'il supervisore non ha risposto: decidono le regole' }
  }

  if (decisione.azione === 'finito') {
    if (bocciati.length > 0) {
      // Il caso peggiore che questo sistema possa produrre è chiudere da solo un
      // lavoro incompleto: qui si ferma. Si torna alle regole invece di
      // scrivere una risposta a mano, così restano il riconoscimento del
      // cerchio e la strategia che ne fa uscire.
      return {
        mossa: dalleRegole(ctx),
        nota: `«finito» rifiutato: ${bocciati.length} criteri verificabili falliscono ancora`
      }
    }
    return { mossa: { tipo: 'finito' } }
  }

  if (decisione.azione === 'chiedi') {
    const domanda = decisione.domanda ?? ''
    if (domanda === '') {
      return { mossa: dalleRegole(ctx), nota: '«chiedi» senza domanda: decidono le regole' }
    }
    return { mossa: { tipo: 'chiediUtente', domanda } }
  }

  if (decisione.azione === 'correggiCriterio') {
    const criterio = decisione.criterio
    // Un criterio che il comando misura e boccia non si «corregge»: sarebbe il
    // modo più elegante di far sparire un problema invece di risolverlo.
    const misuratoEBocciato = bocciati.some((e) => e.descrizione === criterio?.descrizione)
    if (criterio === undefined || misuratoEBocciato) {
      return {
        mossa: dalleRegole(ctx),
        nota: criterio === undefined
          ? '«correggiCriterio» senza comando: decidono le regole'
          : `correzione rifiutata per «${criterio.descrizione}»: quel comando misura, e boccia`
      }
    }
    return {
      mossa: { tipo: 'correggiCriterio', descrizione: criterio.descrizione, comando: criterio.comando },
      ...(decisione.perche !== undefined ? { nota: decisione.perche } : {})
    }
  }

  // Prosegui: le istruzioni sono la sostanza. Senza, il giro dopo sarebbe
  // identico a questo — cioè uno stallo travestito da attività.
  const istruzioni = decisione.istruzioni ?? ''
  if (istruzioni === '') {
    return { mossa: dalleRegole(ctx), nota: '«prosegui» senza istruzioni: decidono le regole' }
  }
  // Anche con istruzioni buone, dopo troppi giri identici la strategia si
  // aggiunge: il supervisore vede la sua storia, ma un promemoria di come si
  // esce da un cerchio non ha mai fatto male a nessuno.
  const strategia = strategiaPer(inCerchioDa, a.limiti.stalloMax)
  const coda = strategia === undefined
    ? ''
    : `\n\nSono ${inCerchioDa} giri che l'esito non cambia. ${strategia.istruzioni}`
  return {
    mossa: {
      tipo: 'prosegui',
      ...(strategia !== undefined ? { strategia: strategia.nome } : {}),
      istruzioni: `${istruzioni}${coda}\n\nObiettivo: ${a.obiettivo}`
    }
  }
}

/**
 * La decisione di prima, quando il supervisore non c'è o non serve.
 *
 * È il motore a regole che ha retto fin qui: nessuno lo butta via, perché è
 * l'unica cosa che continua a funzionare quando il modello non risponde.
 */
function dalleRegole(ctx: Contesto): Decisione {
  const { a, esiti, inCerchioDa } = ctx
  const bocciati = fallitiDavvero(esiti)
  const nonMisurabili = esiti.filter((e) => e.misurato === false)

  if (bocciati.length === 0 && nonMisurabili.length === 0) {
    // Tutto verde, ma le regole da sole **non chiudono**: i comandi dicono che
    // non c'è niente di rotto, non che il lavoro è finito. A dirlo deve essere
    // qualcuno che l'ha guardato, e se quel qualcuno non ha risposto ci si ferma
    // e lo si scrive — chiudere da soli un lavoro incompleto è il fallimento
    // silenzioso peggiore che questo sistema possa produrre.
    return {
      tipo: 'sospendi',
      motivo: 'i comandi passano tutti, ma il supervisore non ha detto se il lavoro e concluso'
    }
  }

  if (strategieFinite(inCerchioDa, a.limiti.stalloMax)) {
    return {
      tipo: 'chiediUtente',
      domanda:
        `Sono bloccato su «${a.obiettivo}».\n\n${riassuntoFallimenti(esiti)}\n\n` +
        `Ho provato ${inCerchioDa} volte e ho esaurito le strade che conosco: ` +
        `${STRATEGIE.map((s) => s.nome).join(', ')}.\nCome vuoi che proceda?`
    }
  }

  const strategia = strategiaPer(inCerchioDa, a.limiti.stalloMax)
  const testa = `Il lavoro non è concluso.\n\n${riassuntoFallimenti(esiti)}\n\n`
  if (strategia === undefined) {
    return {
      tipo: 'prosegui',
      istruzioni: `${testa}Obiettivo: ${a.obiettivo}\nCorreggi e riprova.`
    }
  }
  return {
    tipo: 'prosegui',
    strategia: strategia.nome,
    istruzioni:
      `${testa}Sono ${inCerchioDa} giri che l'esito è identico.\n\n${strategia.istruzioni}\n\n` +
      `Obiettivo: ${a.obiettivo}`
  }
}
