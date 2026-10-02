/**
 * Le domande dell'autopilota **con una struttura** (0.41.0).
 *
 * Nicholas (02/10): «le domande che fa l'autopilota spesso non si capisce cosa
 * stia chiedendo». Ogni domanda — del supervisore durante il lavoro, della
 * preparazione, «Pubblico adesso?» — ha cinque parti:
 *
 * 1. **cosa sta facendo adesso** (il punto del lavoro in cui si è fermato);
 * 2. **la domanda**, in una frase;
 * 3. **perché gli serve** la risposta;
 * 4. **le scelte**, ognuna con la sua conseguenza;
 * 5. **cosa fa se non rispondi**.
 *
 * Il programma le controlla (`validaDomanda`): se ne mancano, la domanda torna
 * al supervisore che la riscriva, **una volta sola**; se manca ancora qualcosa
 * passa lo stesso, con un'avvertenza che lo dice. Una domanda zoppa è meglio di
 * un lavoro fermo senza domanda.
 */

export type SceltaDomanda = { scelta: string; conseguenza: string }

export type PartiDomanda = {
  staFacendo: string
  domanda: string
  perche: string
  scelte: SceltaDomanda[]
  seNonRispondi: string
}

export type ParteDomanda = 'staFacendo' | 'domanda' | 'perche' | 'scelte' | 'seNonRispondi'

/** Il nome di ogni parte, come si dice a chi la deve riscrivere e a chi la legge. */
export const NOMI_PARTI: Record<ParteDomanda, string> = {
  staFacendo: 'cosa stai facendo adesso',
  domanda: 'la domanda in una frase',
  perche: 'perché ti serve la risposta',
  scelte: 'le scelte, ognuna con la sua conseguenza (almeno due)',
  seNonRispondi: 'cosa fai se non risponde'
}

/** Oltre questa lunghezza «la domanda» non è più una frase. */
export const DOMANDA_MAX = 400
/** Le scelte: quante al massimo (sono tasti da toccare sul telefono). */
export const SCELTE_MAX = 5
/** Una scelta è un tasto: corta. */
export const SCELTA_MAX = 120

const testo = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')

/**
 * Le parti da un oggetto arrivato dal modello. Accetta i nomi in italiano e
 * qualche variante prevedibile; quello che manca resta vuoto (lo dirà la
 * validazione). Una stringa sola diventa «la domanda», senza le altre parti.
 */
export function leggiParti(x: unknown): PartiDomanda {
  if (typeof x === 'string') return { staFacendo: '', domanda: x.trim(), perche: '', scelte: [], seNonRispondi: '' }
  if (typeof x !== 'object' || x === null) return { staFacendo: '', domanda: '', perche: '', scelte: [], seNonRispondi: '' }
  const o = x as Record<string, unknown>
  const grezze = Array.isArray(o.scelte) ? o.scelte : Array.isArray(o.opzioni) ? o.opzioni : []
  const scelte: SceltaDomanda[] = []
  for (const s of grezze) {
    if (typeof s === 'string' && s.trim() !== '') { scelte.push({ scelta: s.trim(), conseguenza: '' }); continue }
    if (typeof s !== 'object' || s === null) continue
    const q = s as Record<string, unknown>
    const scelta = testo(q.scelta ?? q.opzione ?? q.testo)
    if (scelta === '') continue
    scelte.push({ scelta, conseguenza: testo(q.conseguenza ?? q.effetto ?? q.cosaSuccede) })
  }
  return {
    staFacendo: testo(o.staFacendo ?? o.contesto ?? o.adesso),
    domanda: testo(o.domanda),
    perche: testo(o.perche ?? o.perché ?? o.motivo),
    scelte: scelte.slice(0, SCELTE_MAX).map((s) => ({ ...s, scelta: s.scelta.slice(0, SCELTA_MAX) })),
    seNonRispondi: testo(o.seNonRispondi ?? o.senzaRisposta)
  }
}

export type Validazione = { completa: boolean; mancano: ParteDomanda[]; note: string[] }

/** Le parti che mancano, o che non vanno. */
export function validaDomanda(p: PartiDomanda): Validazione {
  const mancano: ParteDomanda[] = []
  const note: string[] = []
  if (p.staFacendo.length < 10) mancano.push('staFacendo')
  if (p.domanda === '') mancano.push('domanda')
  else if (p.domanda.length > DOMANDA_MAX) { mancano.push('domanda'); note.push(`la domanda è lunga ${p.domanda.length} caratteri: va detta in una frase, il resto va nelle altre parti`) }
  else if (!p.domanda.includes('?')) { mancano.push('domanda'); note.push('la domanda non ha il punto interrogativo: non si capisce cosa chiedi') }
  if (p.perche.length < 10) mancano.push('perche')
  const buone = p.scelte.filter((s) => s.scelta !== '' && s.conseguenza.length >= 5)
  if (buone.length < 2) {
    mancano.push('scelte')
    if (p.scelte.length >= 2) note.push('ogni scelta deve dire cosa succede se la scegli')
  }
  if (p.seNonRispondi.length < 5) mancano.push('seNonRispondi')
  return { completa: mancano.length === 0, mancano, note }
}

/**
 * La richiesta di riscrivere una domanda incompleta: al supervisore, nella
 * sua sessione. Dice cosa manca e la forma esatta della risposta.
 */
export function richiestaRiscrittura(p: PartiDomanda, v: Validazione): string {
  return [
    'La domanda che vuoi fare a chi ha affidato il lavoro non si capisce abbastanza: chi la legge può essere',
    'lontano dal computer, con il telefono in mano, e non ha seguito niente.',
    '',
    `Mancano o non vanno: ${v.mancano.map((m) => NOMI_PARTI[m]).join('; ')}.`,
    ...v.note.map((n) => `- ${n}`),
    '',
    'La tua domanda com’era:',
    JSON.stringify(p),
    '',
    'Riscrivila completa. Rispondi con un solo oggetto JSON e nient’altro:',
    FORMA_DOMANDA
  ].join('\n')
}

/** La forma JSON di una domanda, uguale in tutti i prompt. */
export const FORMA_DOMANDA =
  '{"staFacendo": "cosa stai facendo adesso, in una o due frasi", "domanda": "la domanda in una frase, con il punto interrogativo", ' +
  '"perche": "perché ti serve la risposta adesso", "scelte": [{"scelta": "testo breve del tasto", "conseguenza": "cosa fai se sceglie questa"}, ' +
  '{"scelta": "…", "conseguenza": "…"}], "seNonRispondi": "cosa fai se non risponde"}'

/** Le righe da mettere nei prompt: come si scrive una domanda per Nicholas. */
export const REGOLE_DOMANDA = [
  'Una domanda per chi ha affidato il lavoro ha **sempre cinque parti**, perché chi la legge può essere',
  'lontano dal computer e non aver seguito niente:',
  '1. `staFacendo`: cosa stai facendo adesso, il punto del lavoro in cui sei;',
  '2. `domanda`: la domanda vera, **in una frase**, con il punto interrogativo;',
  '3. `perche`: perché ti serve la risposta, adesso;',
  '4. `scelte`: da due a cinque risposte possibili, ognuna con **la sua conseguenza** (cosa farai se sceglie quella);',
  '5. `seNonRispondi`: cosa fai se non risponde (aspetti, scegli tu una strada prudente, ti fermi…).',
  'Il programma controlla che ci siano tutte: una domanda incompleta ti torna indietro da riscrivere.'
]

/**
 * Il testo della domanda come lo legge Nicholas, nell'ordine in cui serve: chi
 * chiede, la domanda, poi cosa sta facendo, perché, le scelte con le
 * conseguenze, cosa succede senza risposta. Le stesse parti, nello stesso
 * ordine, su PC, pagina, app e Telegram.
 */
export function testoDomanda(chi: string, p: PartiDomanda, avvertenza?: string): string {
  const righe: string[] = [`«${chi}» ti chiede:`, '', p.domanda !== '' ? p.domanda : '(la domanda non è stata scritta)']
  if (p.staFacendo !== '') righe.push('', `Cosa sta facendo: ${p.staFacendo}`)
  if (p.perche !== '') righe.push('', `Perché gli serve: ${p.perche}`)
  if (p.scelte.length > 0) {
    righe.push('', 'Le scelte:')
    for (const s of p.scelte) righe.push(`• ${s.scelta}${s.conseguenza !== '' ? ` → ${s.conseguenza}` : ''}`)
  }
  if (p.seNonRispondi !== '') righe.push('', `Se non rispondi: ${p.seNonRispondi}`)
  if (avvertenza !== undefined && avvertenza !== '') righe.push('', `⚠ ${avvertenza}`)
  return righe.join('\n')
}

/** L'avvertenza per una domanda passata incompleta dopo la riscrittura. */
export function avvertenzaIncompleta(v: Validazione): string {
  return `Domanda incompleta anche dopo la riscrittura: mancano ${v.mancano.map((m) => NOMI_PARTI[m]).join(', ')}. Se non si capisce, rispondi chiedendogli di spiegarsi meglio.`
}

/**
 * Una domanda con le sue parti, come la usa il servizio: il testo da mostrare,
 * le scelte da toccare, le parti per chi le disegna una per una.
 */
export type DomandaPronta = { testo: string; opzioni: string[]; parti: PartiDomanda; avvertenza?: string }

/**
 * Valida e, se serve, fa riscrivere **una volta**. `riscrivi` chiede al
 * supervisore (o alla preparazione) di rifarla e torna il suo testo; se non
 * risponde o rifà una domanda peggiore, si tiene la migliore fra le due.
 */
export async function domandaControllata(
  chi: string,
  prima: PartiDomanda,
  riscrivi: ((richiesta: string) => Promise<string | undefined>) | undefined,
  leggiRisposta: (testo: string) => PartiDomanda | undefined
): Promise<DomandaPronta & { riscritta: boolean }> {
  let p = prima
  let v = validaDomanda(p)
  let riscritta = false
  if (!v.completa && riscrivi !== undefined) {
    const t = await riscrivi(richiestaRiscrittura(p, v)).catch(() => undefined)
    const seconda = t === undefined ? undefined : leggiRisposta(t)
    if (seconda !== undefined) {
      const v2 = validaDomanda(seconda)
      // La seconda vince se non è peggio della prima (e ha almeno la domanda).
      if (seconda.domanda !== '' && v2.mancano.length <= v.mancano.length) { p = seconda; v = v2; riscritta = true }
    }
  }
  const avvertenza = v.completa ? undefined : avvertenzaIncompleta(v)
  return {
    testo: testoDomanda(chi, p, avvertenza),
    opzioni: p.scelte.map((s) => s.scelta),
    parti: p,
    riscritta,
    ...(avvertenza !== undefined ? { avvertenza } : {})
  }
}

/** Il primo oggetto JSON in un testo (la risposta del modello), o `undefined`. */
export function primoJson(t: string): Record<string, unknown> | undefined {
  const i = t.indexOf('{')
  const f = t.lastIndexOf('}')
  if (i < 0 || f <= i) return undefined
  try {
    const o: unknown = JSON.parse(t.slice(i, f + 1))
    return typeof o === 'object' && o !== null ? o as Record<string, unknown> : undefined
  } catch { return undefined }
}

/** La riscrittura letta: l'oggetto può essere la domanda o contenerla in `domanda`. */
export function partiDaRisposta(t: string): PartiDomanda | undefined {
  const o = primoJson(t)
  if (o === undefined) return undefined
  const dentro = typeof o.domanda === 'object' && o.domanda !== null ? o.domanda : o
  const p = leggiParti(dentro)
  return p.domanda === '' ? undefined : p
}

/* ------------------------------------------------------------------ */
/* Le domande scritte dal programma: complete per costruzione.         */
/* ------------------------------------------------------------------ */

const breve = (t: string, n: number): string => (t.length > n ? `${t.slice(0, n)}…` : t)

/** «Sono bloccato»: le strade per uscire da un cerchio sono finite. */
export function partiBloccato(obiettivo: string, tentativi: number, strade: string[], errori: string): PartiDomanda {
  return {
    staFacendo: `Lavoro a «${breve(obiettivo.replace(/\s+/g, ' ').trim(), 160)}», ma le verifiche continuano a fallire nello stesso modo.`,
    domanda: 'Come vuoi che proceda?',
    perche: `Ho provato ${tentativi} volte e ho esaurito le strade che conosco (${strade.join(', ')}): l’esito non cambia. Gli errori: ${breve(errori.replace(/\s+/g, ' ').trim(), 400)}`,
    scelte: [
      { scelta: 'rivedi i criteri', conseguenza: 'mi dici quale criterio o comando di verifica è sbagliato e lo cambio, poi riprendo' },
      { scelta: 'ti dico io la strada', conseguenza: 'scrivi la strada da tentare e la passo alla chat così com’è' },
      { scelta: 'fermati', conseguenza: 'sospendo il lavoro; lo riprendi quando vuoi da «Riprendi»' }
    ],
    seNonRispondi: 'resto fermo ad aspettare: non ricomincio a girare a vuoto sugli stessi tentativi'
  }
}

/** I criteri non misurati a fine lavoro: il comando di verifica non parte. */
export function partiNonMisurati(criteri: { descrizione: string; comando: string }[]): PartiDomanda {
  return {
    staFacendo: 'Il lavoro sembra concluso e sto facendo le verifiche finali prima di chiuderlo.',
    domanda: 'Chiudo lo stesso il lavoro, o correggi prima il comando di verifica che non parte?',
    perche: `${criteri.length === 1 ? 'Un criterio non è stato misurato' : `${criteri.length} criteri non sono stati misurati`}: il comando non è nemmeno partito (${criteri.map((c) => `${c.descrizione}: ${c.comando}`).join('; ')}). Non chiudo da solo su una cosa che non ho controllato.`,
    scelte: [
      { scelta: 'chiudi lo stesso', conseguenza: 'considero finito il lavoro senza quella verifica' },
      { scelta: 'correggo il comando', conseguenza: 'mi scrivi il comando giusto, lo rimisuro e chiudo solo se passa' }
    ],
    seNonRispondi: 'resto fermo: il lavoro non viene chiuso finché non rispondi'
  }
}

/** «Pubblico adesso?» con la regola «stabile». */
export function partiPubblica(nome: string, giaMandato: boolean): PartiDomanda {
  return {
    staFacendo: `Il lavoro «${nome}» è finito e verificato${giaMandato ? ', ed è già stato mandato sul ramo principale' : ''}.`,
    domanda: 'Pubblico adesso?',
    perche: 'Questo progetto ha la regola «chiedi prima di pubblicare»: una pubblicazione arriva a chi usa il programma, quindi la decidi tu.',
    scelte: [
      { scelta: 'sì, pubblica', conseguenza: 'faccio pubblicare la versione adesso, con le note, e verifico che sia uscita' },
      { scelta: 'no, lascia così', conseguenza: 'il lavoro resta salvato ma non pubblicato; si può pubblicare più avanti' }
    ],
    seNonRispondi: 'non pubblico: il lavoro resta salvato e la domanda resta aperta'
  }
}

/** Chi chiede: il nome dell'autopilota, o l'inizio dell'obiettivo. */
export function nomeDi(a: { nome: string; obiettivo: string }): string {
  return a.nome !== '' ? a.nome : a.obiettivo.slice(0, 40)
}

/** Cosa passa al registro delle domande: le scelte da toccare, le parti, l'avvertenza. */
export function domandaPerRegistro(p: DomandaPronta): { opzioni?: string[]; parti: PartiDomanda; avvertenza?: string } {
  return {
    ...(p.opzioni.length > 0 ? { opzioni: p.opzioni } : {}),
    parti: p.parti,
    ...(p.avvertenza !== undefined ? { avvertenza: p.avvertenza } : {})
  }
}

/**
 * Quando il supervisore non ha risposto, resta la domanda della chat: le
 * parti che il programma conosce (cosa sta facendo), il resto vuoto. Passa
 * con l'avvertenza: meglio una domanda zoppa che un lavoro fermo in silenzio.
 */
export function partiDallaChat(a: { obiettivo: string }, grezza: string): PartiDomanda {
  return {
    staFacendo: `La chat lavora a: ${breve(a.obiettivo.replace(/\s+/g, ' ').trim(), 200)}`,
    domanda: grezza.trim(),
    perche: '',
    scelte: [],
    seNonRispondi: 'la chat resta ferma su questa domanda finché non rispondi'
  }
}

/**
 * Le sezioni da disegnare, in ordine (la linguetta «Domande» del PC): prima la
 * domanda, poi il contesto, il perché, le scelte con le conseguenze, cosa
 * succede senza risposta, l'avvertenza. Solo quelle che ci sono.
 */
export type SezioneDomanda =
  | { tipo: 'domanda'; testo: string }
  | { tipo: 'testo'; etichetta: string; testo: string }
  | { tipo: 'scelte'; etichetta: string; scelte: SceltaDomanda[] }
  | { tipo: 'avvertenza'; testo: string }

export function sezioniDomanda(p: PartiDomanda, avvertenza?: string): SezioneDomanda[] {
  const s: SezioneDomanda[] = []
  if (p.domanda !== '') s.push({ tipo: 'domanda', testo: p.domanda })
  if (p.staFacendo !== '') s.push({ tipo: 'testo', etichetta: 'Cosa sta facendo', testo: p.staFacendo })
  if (p.perche !== '') s.push({ tipo: 'testo', etichetta: 'Perché gli serve', testo: p.perche })
  if (p.scelte.length > 0) s.push({ tipo: 'scelte', etichetta: 'Le scelte, e cosa fa con ognuna', scelte: p.scelte })
  if (p.seNonRispondi !== '') s.push({ tipo: 'testo', etichetta: 'Se non rispondi', testo: p.seNonRispondi })
  if (avvertenza !== undefined && avvertenza !== '') s.push({ tipo: 'avvertenza', testo: avvertenza })
  return s
}
