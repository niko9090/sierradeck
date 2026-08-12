import type { Autopilota } from '@shared/autopilota'
import { STRATEGIE, strategiaPer, strategieFinite } from './strategie'

export type EsitoVerifica = {
  descrizione: string
  comando: string
  passato: boolean
  /**
   * `false` quando il comando non si è potuto eseguire — sintassi rotta, shell
   * che non lo capisce, eseguibile che non c'è. Non dice niente sul criterio, e
   * confonderlo con «non soddisfatto» manda a cercare nel codice un difetto che
   * sta nel comando. Assente vuol dire misurato, che è il caso normale.
   */
  misurato?: boolean
  /** Ciò che il comando ha stampato, già troncato da chi lo ha eseguito. */
  uscita: string
}

export type EventoStop = {
  sessionId: string
  /** `true` se il turno appena finito era già stato indotto dall'autopilota. */
  stopHookActive: boolean
  ultimoMessaggio: string
  /** Il momento dell'evento, in ISO. Passato invece di letto: la funzione resta pura. */
  adesso: string
}

export type Giudizio = {
  finito: boolean
  istruzioni: string
  /**
   * La domanda da girare all'utente, quando manca qualcosa che nessuno tranne
   * lui può sapere. È il caso raro per costruzione: se comparisse spesso,
   * l'autopilota smetterebbe di far risparmiare tempo e comincerebbe a chiederlo.
   */
  domandaUtente?: string
}

export type Decisione =
  /**
   * `strategia` compare solo quando il proseguimento è un tentativo di uscire
   * da un cerchio: serve a chi guarda da fuori — il log, il pannello, l'avviso
   * — per distinguere «sta lavorando» da «sta cercando un'altra strada».
   */
  | { tipo: 'prosegui'; istruzioni: string; strategia?: string }
  | { tipo: 'finito' }
  | { tipo: 'sospendi'; motivo: string }
  /** Il comando di un criterio va sostituito: misurava la cosa sbagliata. */
  | { tipo: 'correggiCriterio'; descrizione: string; comando: string }
  | { tipo: 'serveGiudizio' }
  | { tipo: 'chiediUtente'; domanda: string }

/** Quanto di un'uscita finisce nel prompt della chat. */
const USCITA_MAX = 1200
/** Quanto di un'uscita entra nella riga di storia su cui si riconosce lo stallo. */
const TRACCIA_MAX = 200

export function riassuntoFallimenti(esiti: EsitoVerifica[]): string {
  return esiti
    .filter((e) => !e.passato)
    .map((e) => {
      const uscita = e.uscita.length > USCITA_MAX
        ? `${e.uscita.slice(0, USCITA_MAX)}\n[…troncato]`
        : e.uscita
      // Un comando che non parte va raccontato per quello che è, o la chat
      // passa i turni a correggere codice sano.
      const testa = e.misurato === false
        ? `- «${e.descrizione}» **non si è potuto verificare**: \`${e.comando}\` non è nemmeno partito.`
        : `- «${e.descrizione}» non è soddisfatto: \`${e.comando}\` è fallito.`
      return `${testa}\n${uscita}`
    })
    .join('\n\n')
}

/** I criteri che nessuno ha potuto misurare: il comando è rotto, non il lavoro. */
export function nonMisurati(esiti: EsitoVerifica[]): EsitoVerifica[] {
  return esiti.filter((e) => e.misurato === false)
}

/**
 * La riga con cui una decisione di proseguimento entra nella storia.
 *
 * È anche ciò su cui si riconosce lo stallo, e per questo include un tratto
 * dell'uscita: due giri con lo stesso criterio fallito ma errori diversi sono
 * lavoro che procede, non uno stallo.
 */
export function traccia(esiti: EsitoVerifica[]): string {
  const falliti = esiti.filter((e) => !e.passato)
  return `proseguito: ${falliti
    .map((e) => `${e.descrizione} — ${e.uscita.slice(0, TRACCIA_MAX)}`)
    .join(' | ')}`
}

/**
 * Da quanti giri di fila l'esito è identico a questo.
 *
 * Si guarda solo la coda: un esito che si era già visto dieci giri fa, con del
 * lavoro vero in mezzo, non è un cerchio — è un problema tornato a galla, e va
 * affrontato con la testa sgombra come la prima volta.
 */
export function ripetizioniFinali(decisioni: { cosa: string }[], riga: string): number {
  // Si contano solo le tracce, saltando tutto il resto che finisce nella storia
  // — le note del supervisore, le risposte dell'utente, i criteri corretti.
  // Senza questo filtro bastava una riga in mezzo per spezzare la sequenza, e
  // un cerchio perfetto non veniva più riconosciuto: l'autopilota tornava a
  // girare a vuoto senza che nessuna strategia scattasse mai.
  const tracce = decisioni.filter((d) => d.cosa.startsWith('proseguito: '))
  let n = 0
  for (let i = tracce.length - 1; i >= 0; i -= 1) {
    if (tracce[i]?.cosa !== riga) break
    n += 1
  }
  return n
}

function minutiTrascorsi(a: Autopilota, adesso: string): number {
  const da = Date.parse(a.iniziatoIl)
  const fino = Date.parse(adesso)
  if (Number.isNaN(da) || Number.isNaN(fino)) return 0
  return (fino - da) / 60_000
}

/**
 * Decide cosa rispondere all'hook `Stop` di una chat governata.
 *
 * L'ordine dei controlli è vincolante, e i test lo pinnano:
 *
 * 1. **Lo stato** — un autopilota sospeso o finito non comanda più niente. La
 *    sua chat, se ancora viva, deve potersi fermare.
 * 2. **I tetti** — prima di qualunque altra cosa, *quando ci sono*. A zero non
 *    valgono, ed è il caso normale: fermare al minuto 360 un lavoro che sta
 *    procedendo è un guasto, non una protezione. Chi vuole un limite se lo
 *    imposta, e allora vince su tutto il resto.
 * 3. **Lo stallo** — lo stesso criterio che fallisce allo stesso modo giro dopo
 *    giro. Un'uscita che cambia non è stallo: qualcosa si muove. E stallo non
 *    vuol dire fermarsi: vuol dire cambiare strada, una strategia per volta,
 *    e chiedere all'utente solo quando le strade sono davvero finite.
 * 4. **I criteri verificabili** — se uno fallisce, la risposta è già scritta e
 *    non serve consultare nessun modello.
 * 5. **Il resto** — tutto verde, o niente da eseguire: serve un giudizio.
 */
export function decidi(a: Autopilota, evento: EventoStop, esiti: EsitoVerifica[]): Decisione {
  if (a.stato !== 'lavoro') return { tipo: 'finito' }

  if (a.limiti.cicliMax > 0 && a.cicli >= a.limiti.cicliMax) {
    return { tipo: 'sospendi', motivo: `raggiunto il tetto di cicli (${a.limiti.cicliMax})` }
  }
  if (a.limiti.minutiMax > 0 && minutiTrascorsi(a, evento.adesso) >= a.limiti.minutiMax) {
    return { tipo: 'sospendi', motivo: `raggiunto il tetto di tempo (${a.limiti.minutiMax} minuti)` }
  }

  const falliti = esiti.filter((e) => !e.passato)
  if (falliti.length > 0) {
    const riga = traccia(esiti)
    const ripetute = ripetizioniFinali(a.decisioni, riga)
    const strategia = strategiaPer(ripetute, a.limiti.stalloMax)

    // Le strade finite non sono una sconfitta da archiviare in silenzio: è il
    // momento in cui l'utente vale più di un altro tentativo. Chiedere lo tiene
    // vivo — sospendere lo spegnerebbe, e al risveglio non saprebbe nemmeno che
    // gli era stato chiesto qualcosa.
    if (strategia === undefined && strategieFinite(ripetute, a.limiti.stalloMax)) {
      return {
        tipo: 'chiediUtente',
        domanda:
          `Sono bloccato su «${a.obiettivo}».\n\n${riassuntoFallimenti(esiti)}\n\n` +
          `Ho provato ${ripetute} volte e ho esaurito le strade che conosco: ` +
          `${STRATEGIE.map((s) => s.nome).join(', ')}. L'esito non cambia di una virgola.\n` +
          'Come vuoi che proceda? Se il criterio o il comando di verifica sono da ' +
          'rivedere, dimmelo e li cambio.'
      }
    }

    const testa = `Il lavoro non è concluso.\n\n${riassuntoFallimenti(esiti)}\n\n`
    const coda = `Obiettivo: ${a.obiettivo}`
    if (strategia === undefined) {
      return {
        tipo: 'prosegui',
        istruzioni:
          `${testa}${coda}\nCorreggi e riprova; non fermarti finché il criterio non è soddisfatto.`
      }
    }
    return {
      tipo: 'prosegui',
      strategia: strategia.nome,
      istruzioni:
        `${testa}Sono ${ripetute} giri che l'esito è identico: quello che stai facendo ` +
        `non funziona.\n\n${strategia.istruzioni}\n\n${coda}\nNon fermarti: cambia mossa.`
    }
  }

  return { tipo: 'serveGiudizio' }
}

/**
 * Traduce in decisione il giudizio del supervisore.
 *
 * «Non finito» senza istruzioni diventa una sospensione, non un proseguimento:
 * rimandare la chat a lavorare senza dirle cosa fare produce un giro identico al
 * precedente, cioè uno stallo travestito da attività.
 */
export function decidiConGiudizio(a: Autopilota, giudizio: Giudizio): Decisione {
  if (giudizio.finito) return { tipo: 'finito' }

  // La domanda vince sulle istruzioni: se il supervisore dice sia «fai X» sia
  // «chiedi Y», mandare la chat a fare X la farebbe indovinare proprio sul punto
  // in cui ha dichiarato di non poter decidere.
  const domanda = giudizio.domandaUtente?.trim() ?? ''
  if (domanda !== '') return { tipo: 'chiediUtente', domanda }

  const istruzioni = giudizio.istruzioni.trim()
  if (istruzioni === '') {
    return { tipo: 'sospendi', motivo: 'il giudizio dice che manca qualcosa ma non dice cosa' }
  }
  return {
    tipo: 'prosegui',
    istruzioni: `Il lavoro non è concluso.\n\n${istruzioni}\n\nObiettivo: ${a.obiettivo}`
  }
}
