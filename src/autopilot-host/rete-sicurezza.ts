import type { Autopilota } from '@shared/autopilota'
import { esitiCheDecidono, giudicato, senzaMisura } from './criteri-giudicati'
import type { Decisione, EsitoVerifica } from './decisione'
import { chiediBloccato, riassuntoFallimenti, rigaCompito } from './decisione'
import type { DecisioneSupervisore } from './decisione-supervisore'
import { strategiaPer, strategieFinite } from './strategie'

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
  /**
   * Il compito della chat che si è fermata (29/10): le istruzioni ricordano
   * questo, mai l'obiettivo intero. Assente: la chat singola, il cui compito è
   * l'obiettivo.
   */
  compito?: string
  /** La chat ha detto «fatto» anche al giro prima (29/10): nessuno le ha dato un verdetto. */
  fattoDiNuovo?: boolean
  /** Il lavoro è compiuto tutto (`lavoroCompiuto`, 29/10): le regole chiudono da sole. */
  compiuto?: boolean
}

/** I fatti che servono a `lavoroCompiuto` e che stanno fuori dall'autopilota (git, gh). */
export type FattiCompiuto = {
  /** I rami delle chat non ancora nel ramo principale. */
  ramiAperti: number
  /** La versione nel package.json del progetto, se c'è. */
  versione?: string
  /** Le release pubblicate (gh); assente o vuota: il progetto non pubblica release. */
  release?: string[]
  /** La chat singola (senza flotta) ha chiuso il turno con «SEGNALE: fatto». */
  chatSingolaFatto?: boolean
}

/**
 * **Il lavoro è compiuto** (29/10): lo si può dire senza nessun modello.
 *
 * Il 27/10 un autopilota con tutto verde, tutto unito e la versione già
 * pubblicata ha fatto 3.210 giri a vuoto: le regole «non chiudevano mai da
 * sole» e il supervisore non diceva «finito». Adesso sì, ma solo se:
 * - ogni criterio con un comando è misurato adesso e passa (quelli senza
 *   comando devono essere già segnati soddisfatti; i giudicati non contano);
 * - nessuna chat aperta senza il segnale «fatto» (la chat singola l'ha
 *   detto anche lei), niente in coda;
 * - nessun ramo di chat fuori dal principale;
 * - se il progetto pubblica release, la versione del package.json è uscita.
 */
export function lavoroCompiuto(a: Autopilota, esiti: EsitoVerifica[], fatti: FattiCompiuto): boolean {
  const contano = a.criteri.filter((c) => !giudicato(c))
  if (contano.length === 0) return false
  let misurati = 0
  for (const c of contano) {
    if (c.comando === undefined) {
      if (c.soddisfatto !== true) return false
      continue
    }
    const e = esiti.find((x) => x.descrizione === c.descrizione)
    if (e === undefined || !e.passato || e.misurato === false) return false
    misurati += 1
  }
  if (misurati === 0) return false
  if (a.compitiDaFare.length > 0) return false
  // Senza flotta l'unica chat è l'autopilota: deve averlo detto lei.
  if (a.chats.length === 0 && fatti.chatSingolaFatto !== true) return false
  if (a.chats.some((c) => (c.stato === 'lavoro' || c.stato === 'bloccata' || c.stato === 'pausa') && c.segnale?.tipo !== 'fatto')) return false
  if (fatti.ramiAperti > 0) return false
  if (fatti.release !== undefined && fatti.release.length > 0) {
    if (fatti.versione === undefined || !fatti.release.includes(fatti.versione.replace(/^v/, ''))) return false
  }
  return true
}

/** I criteri che un comando ha davvero misurato e bocciato. */
export function fallitiDavvero(esiti: EsitoVerifica[]): EsitoVerifica[] {
  return esiti.filter((e) => !e.passato && e.misurato !== false)
}

/**
 * I criteri che nessuno ha misurato: il comando non e' nemmeno partito.
 *
 * Non sono ne' passati ne' falliti — sono **ignoti**, ed e' una differenza che
 * conta in un punto solo: quando si sta per chiudere il lavoro. Un criterio non
 * misurato assomiglia a uno verde (non ha bocciato niente) e non lo e':
 * chiudere sopra a un comando rotto vuol dire dichiarare finito un lavoro di
 * cui una parte non e' stata controllata.
 */
export function nonMisurati(esiti: EsitoVerifica[]): EsitoVerifica[] {
  return esiti.filter((e) => e.misurato === false)
}

/**
 * Traduce la decisione del supervisore in una mossa, o la corregge.
 *
 * Restituisce anche `nota`: cosa è stato cambiato e perché. Finisce nella
 * storia, ed è l'unico modo per accorgersi che il supervisore sta prendendo
 * decisioni che vengono sistematicamente riscritte.
 */
export function applicaRete(
  dato: Contesto,
  decisione: DecisioneSupervisore | undefined
): { mossa: Decisione; nota?: string; rifiuto?: { descrizione: string; motivo: string } } {
  // I criteri che l'autopilota giudica da sé (0.84.3) non decidono più niente.
  const { a, inCerchioDa } = dato
  const esiti = esitiCheDecidono(dato.esiti, a.criteri)
  const ctx: Contesto = { ...dato, esiti }
  const bocciati = fallitiDavvero(esiti)

  // Senza decisione si torna alle regole: è il caso del supervisore che non
  // risponde, e non deve mai bloccare il lavoro.
  if (decisione === undefined) {
    return { mossa: dalleRegole(ctx, true), nota: 'il supervisore non ha risposto: decidono le regole' }
  }

  if (decisione.azione === 'finito') {
    // Un criterio che nessuno ha potuto misurare non e' un criterio verde:
    // `bocciati` da solo lo lasciava passare in silenzio. Adesso si chiude
    // dicendolo (0.84.3), mai in silenzio e mai con una domanda.
    const ignoti = nonMisurati(esiti)
    if (bocciati.length === 0 && ignoti.length > 0) {
      // **Si chiude da solo** (0.84.3, Nicholas il 22/10: «togli i vincoli»).
      // Fino alla 0.84.2 qui si chiedeva «chiudo lo stesso o correggi il
      // comando?»: una domanda che chiede a Nicholas di sistemare a mano un
      // comando di verifica. La riparazione automatica ha già provato in questo
      // giro; il resto è verde e il supervisore dice «finito». Il lavoro si
      // chiude, le chat vanno nel recupero di 30 giorni, e una riga dice quale
      // criterio non si è potuto misurare e perché.
      const quali = senzaMisura(ignoti)
      return {
        mossa: { tipo: 'finito', senzaMisura: quali },
        nota:
          `«finito» con ${ignoti.length} criteri non misurati ` +
          `(${ignoti.map((e) => e.descrizione).join(', ')}): chiudo lo stesso e lo scrivo, senza chiedere`
      }
    }
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
    return { mossa: { tipo: 'chiediUtente', domanda, ...(decisione.parti !== undefined ? { parti: decisione.parti } : {}) } }
  }

  if (decisione.azione === 'correggiCriterio') {
    const criterio = decisione.criterio
    // Un criterio che il comando misura e boccia non si «corregge»: sarebbe il
    // modo più elegante di far sparire un problema invece di risolverlo.
    const misuratoEBocciato = bocciati.some((e) => e.descrizione === criterio?.descrizione)
    if (criterio === undefined) {
      return { mossa: dalleRegole(ctx), nota: '«correggiCriterio» senza comando: decidono le regole' }
    }
    if (misuratoEBocciato) {
      // Il rifiuto si conta (0.84.3): al secondo il criterio lo giudica
      // l'autopilota (`criteri-giudicati.ts`), senza domanda a Nicholas.
      return {
        mossa: dalleRegole(ctx),
        nota: `correzione rifiutata per «${criterio.descrizione}»: quel comando misura, e boccia`,
        rifiuto: { descrizione: criterio.descrizione, motivo: 'quel comando misura il lavoro e lo boccia: un comando che boccia non si cambia per farlo passare' }
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
      istruzioni: `${istruzioni}${coda}\n\n${rigaCompito(dato.compito ?? a.obiettivo)}`
    }
  }
}

/**
 * Dopo quante risposte mancate di fila del supervisore lo si dice a Nicholas
 * (0.82.1). Da lì in poi lo si interroga un giro ogni `TETTO_SUPERVISORE_MANCATO`.
 */
export const TETTO_SUPERVISORE_MANCATO = 3

/**
 * Dopo quante interrogazioni mancate di fila l'autopilota si sospende (29/10),
 * con un avviso solo, invece di riprovare per sempre.
 */
export const SOSPENDI_DOPO_MANCATI = 5

/** Quante volte il supervisore è stato interrogato davvero nei giri `0…mancati`. */
export function interrogazioniMancate(mancati: number): number {
  let n = 0
  for (let k = 0; k <= mancati; k += 1) if (interrogaSupervisore(k)) n += 1
  return n
}

/** Se in questo giro si interroga il supervisore, dopo `mancati` risposte mancate di fila. */
export function interrogaSupervisore(mancati: number): boolean {
  return mancati < TETTO_SUPERVISORE_MANCATO || mancati % TETTO_SUPERVISORE_MANCATO === 0
}

/**
 * **Il supervisore scaduto non ferma la chat** (0.82.1).
 *
 * Il 21/10 il supervisore è scaduto 23 volte (5 minuti l'una) su un PC pieno
 * di suite di test. Si riprovava subito una seconda volta, altri 5 minuti con
 * la chat ferma nell'hook, e poi decidevano le regole, che con i criteri verdi
 * sanno dire solo «rileggi l'obiettivo». Adesso non si riprova subito: la chat
 * prosegue con l'**ultima istruzione valida** del supervisore, e lui viene
 * interrogato di nuovo al giro dopo. Al tetto arriva una riga a Nicholas, una
 * volta sola, e niente si sospende.
 *
 * `regole` è la mossa delle regole (`applicaRete` senza decisione): se chiede
 * qualcosa a Nicholas vince lei, perché le strade sono finite davvero.
 */
export function senzaSupervisore(p: {
  regole: Decisione
  ultimeIstruzioni: string | undefined
  /** Le risposte mancate di fila prima di questa. */
  mancati: number
}): { mossa: Decisione; mancati: number; avvisaNicholas: boolean; nota: string } {
  const mancati = p.mancati + 1
  const avvisaNicholas = mancati === TETTO_SUPERVISORE_MANCATO
  // Il conto sale a ogni giro, interrogato o no: il prossimo giro interrogato è il primo `k` con `interrogaSupervisore(mancati + k - 1)`.
  let fra = 1
  while (!interrogaSupervisore(mancati + fra - 1)) fra += 1
  const riprova = fra === 1 ? 'lo riprovo al prossimo giro' : `lo riprovo fra ${fra} giri`
  const ultime = p.ultimeIstruzioni?.trim() ?? ''
  // 29/10: dopo `SOSPENDI_DOPO_MANCATI` interrogazioni andate a vuoto non si
  // riprova all'infinito: ci si ferma, e l'avviso del sospeso è uno solo.
  if (interrogazioniMancate(p.mancati) >= SOSPENDI_DOPO_MANCATI && p.regole.tipo !== 'chiediUtente') {
    const motivo = `il supervisore non ha risposto ${SOSPENDI_DOPO_MANCATI} volte di fila: mi fermo invece di riprovare all’infinito. «Riprendi» quando vuoi.`
    return { mossa: { tipo: 'sospendi', motivo }, mancati, avvisaNicholas: false, nota: motivo }
  }
  // Una strategia nuova delle regole (cerchio riconosciuto) vale più dell'istruzione di prima.
  if (p.regole.tipo !== 'prosegui' || p.regole.strategia !== undefined || ultime === '') {
    return { mossa: p.regole, mancati, avvisaNicholas, nota: `il supervisore non ha risposto (${mancati} di fila): decidono le regole, ${riprova}` }
  }
  return {
    mossa: {
      tipo: 'prosegui',
      istruzioni: `Il supervisore non ha risposto in tempo (${riprova}): prosegui con l’ultima istruzione valida.\n\n${ultime}`
    },
    mancati,
    avvisaNicholas,
    nota: `il supervisore non ha risposto (${mancati} di fila): la chat prosegue con l’ultima istruzione valida, ${riprova}`
  }
}

/** La riga per Nicholas quando il supervisore ha mancato `TETTO_SUPERVISORE_MANCATO` volte di fila. */
export function rigaSupervisoreMancato(lavoro: string | undefined): string {
  const di = lavoro !== undefined && lavoro.trim() !== '' ? `del lavoro «${lavoro.trim().slice(0, 80)}» ` : ''
  return `Il supervisore ${di}non risponde da ${TETTO_SUPERVISORE_MANCATO} giri. La chat lavora lo stesso con l’ultima istruzione valida e niente è sospeso; lo riprovo ogni ${TETTO_SUPERVISORE_MANCATO} giri.`
}

/**
 * Il giro che si rifà quando i criteri passano ma il supervisore non ha deciso
 * (0.80.1): non si sospende, si chiede alla chat di dire in chiaro se ha finito.
 *
 * 29/10: con il **compito della chat**, mai l'obiettivo intero. A c-157 si
 * rimandava l'obiettivo di tutto l'autopilota, e la chat rifaceva da capo il
 * lavoro delle sorelle (531 volte in un giorno).
 */
export function istruzioniRiprova(compito: string): string {
  return 'I criteri passano tutti, ma il supervisore non ha detto se il tuo pezzo è concluso.\n\n' +
    'Se al tuo compito manca qualcosa, fallo. Se è fatto, scrivi in poche righe cosa hai fatto e chiudi con «SEGNALE: fatto»: non rifare il lavoro di altre chat.\n\n' +
    rigaCompito(compito)
}

/**
 * La decisione di prima, quando il supervisore non c'è o non serve.
 *
 * È il motore a regole che ha retto fin qui: nessuno lo butta via, perché è
 * l'unica cosa che continua a funzionare quando il modello non risponde.
 */
function dalleRegole(ctx: Contesto, senzaRisposta = false): Decisione {
  const { a, esiti, inCerchioDa } = ctx
  const compito = ctx.compito ?? a.obiettivo
  const bocciati = fallitiDavvero(esiti)
  const nonMisurabili = esiti.filter((e) => e.misurato === false)

  if (bocciati.length === 0 && nonMisurabili.length === 0) {
    // Tutto verde, ma le regole da sole **non chiudono**: i comandi dicono che
    // non c'è niente di rotto, non che il lavoro è finito. A dirlo deve essere
    // qualcuno che l'ha guardato — chiudere da soli un lavoro incompleto è il
    // fallimento silenzioso peggiore che questo sistema possa produrre.
    //
    // Fino alla 0.80.0 qui ci si sospendeva, e il 19/10 un autopilota è rimasto
    // fermo per una risposta mancata. Ora si rifà il giro (0.80.1): la chat
    // rilegge l'obiettivo e chiude il turno, e alla fermata dopo il supervisore
    // viene interrogato di nuovo. Il giro a vuoto lo ferma comunque l'antiloop.
    //
    // 29/10: il giro rifatto era il cerchio di c-157. Adesso, nell'ordine: il
    // lavoro compiuto si chiude; la chat che dice «fatto» per la seconda volta
    // senza verdetto si chiude; senza risposta del supervisore la chat si
    // lascia fermare (la sveglia «mai fermo» se resta qualcosa da fare).
    if (ctx.compiuto === true) return { tipo: 'finito' }
    if (ctx.fattoDiNuovo === true) {
      return { tipo: 'fermaChat', chiudi: true, motivo: 'ha detto «fatto» due giri di fila, i criteri passano e nessuno le ha dato un verdetto: il suo pezzo è chiuso' }
    }
    if (senzaRisposta) {
      return { tipo: 'fermaChat', chiudi: false, motivo: 'i criteri passano e il supervisore non ha risposto: lascio fermare la chat invece di rifare il giro' }
    }
    return { tipo: 'prosegui', istruzioni: istruzioniRiprova(compito) }
  }

  if (strategieFinite(inCerchioDa, a.limiti.stalloMax)) return chiediBloccato(a, inCerchioDa, esiti)

  const strategia = strategiaPer(inCerchioDa, a.limiti.stalloMax)
  const testa = `Il lavoro non è concluso.\n\n${riassuntoFallimenti(esiti)}\n\n`
  if (strategia === undefined) {
    return {
      tipo: 'prosegui',
      istruzioni: `${testa}${rigaCompito(compito)}\nCorreggi e riprova.`
    }
  }
  return {
    tipo: 'prosegui',
    strategia: strategia.nome,
    istruzioni:
      `${testa}Sono ${inCerchioDa} giri che l'esito è identico.\n\n${strategia.istruzioni}\n\n` +
      rigaCompito(compito)
  }
}
