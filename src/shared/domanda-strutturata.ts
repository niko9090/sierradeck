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

import { NOME_INTERNO, nomeCompito, noteDiChiarezza, partiSenzaSigle, testiDi, type ChatConCompito } from './domanda-chiara'

export type SceltaDomanda = {
  scelta: string
  conseguenza: string
  /** La scelta che consiglia chi chiede (0.71.0): al massimo una, segnata su PC, pagina e app. */
  consigliata?: boolean
  /**
   * Una risposta da scrivere (0.84.3, Revisione): il tasto apre il campo di
   * testo e non manda la frase come risposta. «Ti scrivo io cosa provare».
   */
  libera?: true
}

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

/** Oltre questa lunghezza «la domanda» non è più una frase (0.71.0: era 400). */
export const DOMANDA_MAX = 200
/** Una conseguenza è una riga: corta (0.71.0). */
export const CONSEGUENZA_MAX = 160
/** Parole che non dicono niente a chi legge da lontano (0.71.0). */
export const PAROLE_VAGHE = /\b(qualcosa|eccetera|ecc\.?|varie cose|cose varie|come prima|come sopra|quella cosa|questa cosa|il solito|la solita|quello di prima)\b/i
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
    scelte.push({ scelta, conseguenza: testo(q.conseguenza ?? q.effetto ?? q.cosaSuccede), ...(q.consigliata === true ? { consigliata: true } : {}) })
  }
  // Una sola consigliata: vale la prima.
  const prima = scelte.findIndex((s) => s.consigliata === true)
  for (let i = 0; i < scelte.length; i += 1) if (i !== prima && scelte[i]?.consigliata === true) scelte[i] = { scelta: scelte[i]?.scelta ?? '', conseguenza: scelte[i]?.conseguenza ?? '' }
  return {
    staFacendo: testo(o.staFacendo ?? o.contesto ?? o.adesso),
    domanda: testo(o.domanda),
    perche: testo(o.perche ?? o.perché ?? o.motivo),
    scelte: scelte.slice(0, SCELTE_MAX).map((s) => ({ ...s, scelta: s.scelta.slice(0, SCELTA_MAX) })),
    seNonRispondi: testo(o.seNonRispondi ?? o.senzaRisposta)
  }
}

/** Parole che dicono la lingua: brevi, frequenti, e diverse fra le due. */
const PAROLE_EN = new Set(['the', 'will', 'you', 'your', 'is', 'are', 'this', 'that', 'should', 'would', 'can', 'could', 'do', 'does', 'it', 'be', 'with', 'for', 'have', 'has', 'what', 'which', 'on', 'of', 'and', 'or', 'so', 'to', 'if', 'we', 'i', 'want', 'now', 'their', 'own', 'its'])
const PAROLE_IT = new Set(['il', 'lo', 'la', 'gli', 'le', 'di', 'che', 'è', 'e', 'un', 'una', 'per', 'con', 'non', 'si', 'questo', 'questa', 'sono', 'ho', 'hai', 'vuoi', 'come', 'cosa', 'perché', 'del', 'della', 'dei', 'delle', 'nel', 'nella', 'su', 'così', 'già', 'tu', 'io', 'mi', 'ti', 'ci', 'oppure', 'adesso', 'ora', 'quale', 'quali', 'se'])

/**
 * Una domanda scritta in un'altra lingua (in pratica: in inglese; 0.81.0, Nicholas
 * se l'è vista arrivare in inglese il 20/10). Conta le
 * parole tipiche delle due lingue; i nomi di file, rami e comandi non pesano.
 */
export function sembraNonItaliano(testo: string): boolean {
  const parole = testo.toLowerCase().replace(/`[^`]*`/g, ' ').split(/[^\p{L}]+/u).filter((p) => p !== '')
  let en = 0
  let it = 0
  for (const p of parole) {
    if (PAROLE_EN.has(p)) en += 1
    if (PAROLE_IT.has(p)) it += 1
  }
  return en >= 3 && en > it * 2
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
  else if ((p.domanda.match(/\?/g) ?? []).length > 1) { mancano.push('domanda'); note.push('ci sono più domande in una: fanne una sola, la più importante') }
  else if (PAROLE_VAGHE.test(p.domanda)) { mancano.push('domanda'); note.push(`la domanda è vaga («${PAROLE_VAGHE.exec(p.domanda)?.[0] ?? ''}»): di' esattamente di cosa si tratta, chi legge non ha seguito il lavoro`) }
  else if ([p.domanda, p.scelte.map((s) => `${s.scelta} ${s.conseguenza}`).join(' '), testiDi(p).join(' ')].some(sembraNonItaliano)) { mancano.push('domanda'); note.push('la domanda non è in italiano: riscrivila tutta in italiano (domanda, cosa stai facendo, perché, scelte)') }
  // 0.84.0: si capisce da sola, senza sigle di chat né «quel pezzo».
  const chiarezza = noteDiChiarezza(p)
  // Collaudo 0.84.0: «fai quella cosa» come scelta è vago quanto nella domanda.
  const sceltaVaga = p.scelte.map((s) => s.scelta).find((t) => PAROLE_VAGHE.test(t))
  if (sceltaVaga !== undefined && chiarezza.length === 0) chiarezza.push(`la scelta «${sceltaVaga}» è vaga: di' esattamente cosa farai`)
  if (chiarezza.length > 0) {
    if (!mancano.includes('domanda')) mancano.push('domanda')
    note.push(...chiarezza)
  }
  if (p.perche.length < 10) mancano.push('perche')
  const buone = p.scelte.filter((s) => s.scelta !== '' && s.conseguenza.length >= 5)
  if (buone.length < 2) {
    mancano.push('scelte')
    if (p.scelte.length >= 2) note.push('ogni scelta deve dire cosa succede se la scegli')
  } else if (p.scelte.some((s) => s.conseguenza.length < 5)) {
    // 0.84.0: **ogni** scelta, non due su tre.
    mancano.push('scelte')
    note.push(`ogni scelta deve dire cosa succede se la scegli: manca per ${p.scelte.filter((s) => s.conseguenza.length < 5).map((s) => `«${s.scelta}»`).join(', ')}`)
  } else if (p.scelte.some((s) => s.conseguenza.length > CONSEGUENZA_MAX)) {
    mancano.push('scelte')
    note.push(`le conseguenze vanno dette in breve (al massimo ${CONSEGUENZA_MAX} caratteri l’una)`)
  } else if (!p.scelte.some((s) => s.consigliata === true)) {
    mancano.push('scelte')
    note.push('segna con "consigliata": true la scelta che consigli (una sola): chi legge decide più in fretta')
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
  '"perche": "perché ti serve la risposta adesso", "scelte": [{"scelta": "testo breve del tasto", "conseguenza": "cosa fai se sceglie questa, in breve", "consigliata": true}, ' +
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
  'Segna con `"consigliata": true` la scelta che consigli (una sola). Una domanda sola, al massimo 200 caratteri,',
  'in parole semplici e senza parole vaghe («qualcosa», «come prima», «quella cosa», «quel pezzo», «l’altra chat»): di’ esattamente di cosa si tratta.',
  'Mai sigle di chat («c-12»), nomi di rami o nomi interni («gruppo 3», «D2»): nomina il lavoro con il suo compito, a parole («la chat che rifà la schermata Adesso»).',
  'Mai chiedere a Nicholas un gesto a mano (chiudere, spostare, cancellare, correggere, lanciare): lo fa il programma o lo fai tu, e una domanda così non gli arriva.',
  'Un criterio che non si riesce a misurare o il cui comando non si lascia correggere non è una domanda: lo giudica l’autopilota e lo scrive in una riga.',
  'Non chiedere cose già successe (una versione già pubblicata, un ramo già unito, una chat già chiusa): controlla prima.',
  'Sempre in italiano, anche se il lavoro è in inglese.',
  'Le conseguenze in breve. Non chiedere di nuovo una cosa a cui ha già risposto: le sue risposte sono nel quadro.',
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
    for (const s of p.scelte) righe.push(`• ${s.scelta}${s.consigliata === true ? ' (consigliata)' : ''}${s.conseguenza !== '' ? ` → ${s.conseguenza}` : ''}`)
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
  leggiRisposta: (testo: string) => PartiDomanda | undefined,
  /**
   * Le chat dell'autopilota (0.84.0): le sigle («c-12») diventano il loro
   * compito prima del controllo e dopo la riscrittura. Senza, le sigle restano
   * un difetto da far riscrivere.
   */
  chat?: ChatConCompito[]
): Promise<DomandaPronta & { riscritta: boolean }> {
  const pulisci = (x: PartiDomanda): PartiDomanda => (chat === undefined ? x : partiSenzaSigle(x, chat))
  let p = pulisci(prima)
  let v = validaDomanda(p)
  let riscritta = false
  if (!v.completa && riscrivi !== undefined) {
    const t = await riscrivi(richiestaRiscrittura(p, v)).catch(() => undefined)
    const letta = t === undefined ? undefined : leggiRisposta(t)
    const seconda = letta === undefined ? undefined : pulisci(letta)
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

/**
 * Il controllo senza riscrittura, subito (collaudo 0.84.0): per le domande che
 * scrive il programma con dentro testi di altri (il «perché» della Revisione)
 * e per quelle che tornano dopo un riavvio. Le sigle conosciute diventano il
 * compito; il resto, se non va, passa con l'avvertenza.
 */
export function domandaControllataSubito(chi: string, prima: PartiDomanda, chat?: ChatConCompito[]): DomandaPronta {
  const p = chat === undefined ? prima : partiSenzaSigle(prima, chat)
  const v = validaDomanda(p)
  const avvertenza = v.completa ? undefined : avvertenzaIncompleta(v)
  return { testo: testoDomanda(chi, p, avvertenza), opzioni: p.scelte.map((x) => x.scelta), parti: p, ...(avvertenza !== undefined ? { avvertenza } : {}) }
}

/** Le intestazioni delle parti nel testo di `testoDomanda`. */
const INTESTAZIONI: Array<[RegExp, 'staFacendo' | 'perche' | 'scelte' | 'seNonRispondi' | 'avvertenza']> = [
  [/^Cosa sta facendo: /, 'staFacendo'],
  [/^Perché gli serve: /, 'perche'],
  [/^Le scelte:$/, 'scelte'],
  [/^Se non rispondi: /, 'seNonRispondi'],
  [/^⚠ /, 'avvertenza']
]

/**
 * Le parti rilette dal testo scritto da `testoDomanda` (collaudo 0.84.0): la
 * domanda della preparazione resta nell'autopilota solo come testo, e dopo un
 * riavvio tornava senza parti e senza controllo. Un testo di altro formato
 * diventa tutto la domanda.
 */
export function partiDaTesto(testo: string): PartiDomanda {
  const righe = testo.split(/\r?\n/)
  if (!/^«.*» ti chiede:$/.test(righe[0] ?? '')) return leggiParti(testo)
  const parti: Record<'domanda' | 'staFacendo' | 'perche' | 'seNonRispondi' | 'avvertenza', string[]> = { domanda: [], staFacendo: [], perche: [], seNonRispondi: [], avvertenza: [] }
  const scelte: SceltaDomanda[] = []
  let dove: keyof typeof parti | 'scelte' = 'domanda'
  for (let i = 2; i < righe.length; i += 1) {
    const r = righe[i] ?? ''
    const nuova = (righe[i - 1] ?? '') === '' ? INTESTAZIONI.find(([re]) => re.test(r)) : undefined
    if (nuova !== undefined) {
      dove = nuova[1]
      if (dove !== 'scelte') parti[dove].push(r.replace(nuova[0], ''))
      continue
    }
    if (dove === 'scelte') {
      const m = /^• (.+?)( \(consigliata\))?(?: → (.*))?$/.exec(r)
      if (m !== null) scelte.push({ scelta: m[1] ?? '', conseguenza: m[3] ?? '', ...(m[2] !== undefined ? { consigliata: true } : {}) })
      continue
    }
    parti[dove].push(r)
  }
  const unisci = (x: string[]): string => x.join('\n').trim()
  const domanda = unisci(parti.domanda)
  return {
    staFacendo: unisci(parti.staFacendo),
    domanda: domanda === '(la domanda non è stata scritta)' ? '' : domanda,
    perche: unisci(parti.perche),
    scelte,
    seNonRispondi: unisci(parti.seNonRispondi)
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

/**
 * **«Sono bloccato», detto in parole semplici** (0.84.3).
 *
 * Il 22/10 Nicholas si è visto chiedere «Come vuoi che proceda?» con le
 * scelte «rivedi i criteri / ti dico io la strada / fermati»: non diceva di
 * quale lavoro, né cosa non andava, e «rivedi i criteri» gli chiedeva un
 * lavoro a mano. Adesso la frase in vista dice il lavoro e il controllo che
 * non passa; sotto ogni scelta c'è cosa succede, e ogni scelta il programma
 * la esegue da solo (`server.ts`, `rispostaBloccato`).
 */
export const SCELTA_LASCIA_STARE = 'Lascia stare quel controllo e vai avanti'
export const SCELTA_DICO_IO = 'Ti scrivo io cosa provare'
export const SCELTA_SOSPENDI = 'Sospendi l’autopilota'

/** Un criterio che non passa, come lo racconta la domanda. */
export type FallitoBloccato = { descrizione: string; misurato?: boolean }

/** Il nome di un criterio per Nicholas: senza sigle, senza nomi interni («D1», «gruppo 3»), corto. */
export function nomeControllo(descrizione: string, max = 70): string {
  // «i difetti D1 e D2 del collaudo» → «i difetti del collaudo»: l'elenco di nomi va via tutto insieme.
  const nome = NOME_INTERNO.source
  const senza = descrizione
    .replace(new RegExp(`${nome}(?:\\s*(?:,|e|ed)\\s*${nome})*`, 'gu'), '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+([,.;:)])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
  return nomeCompito(senza, max)
}

/** Cosa non va, in una frase: «il controllo «X» non passa». */
export function cosaFallisce(falliti: FallitoBloccato[]): string {
  const primo = falliti[0]
  if (primo === undefined) return 'i controlli di fine lavoro non passano'
  const come = (f: FallitoBloccato): string => (f.misurato === false ? 'non riesce nemmeno a partire' : 'non passa')
  if (falliti.length === 1) return `il controllo «${nomeControllo(primo.descrizione)}» ${come(primo)}`
  return `${falliti.length} controlli non passano, fra cui «${nomeControllo(primo.descrizione, 60)}»`
}

export function partiBloccato(p: {
  /** Il nome del lavoro (l'autopilota), come lo conosce Nicholas. */
  lavoro: string
  /** Il compito della chat ferma, se è una flotta. */
  compito?: string
  falliti: FallitoBloccato[]
  tentativi: number
  strade: string[]
  errori: string
  /** Una chat nuova ha già riletto gli errori da capo, senza riuscire. */
  ultimaStrada: boolean
  /** Mentre aspetta, la chat continua con il resto (non resta ferma). */
  continua: boolean
}): PartiDomanda {
  const lavoro = nomeControllo(p.lavoro, 50)
  const cosa = cosaFallisce(p.falliti)
  const compito = p.compito !== undefined && p.compito.trim() !== '' ? ` La chat lavorava a «${nomeControllo(p.compito, 120)}».` : ''
  const nomi = p.falliti.map((f) => `«${nomeControllo(f.descrizione, 120)}»`).join(', ')
  return {
    staFacendo: `Il lavoro «${lavoro}» è fermo perché ${cosa}.${compito}`,
    domanda: `«${lavoro}»: ${cosa}. Come vado avanti?`,
    perche: `Ho provato ${p.tentativi} volte, con strade diverse (${p.strade.join(', ')})` +
      `${p.ultimaStrada ? ', e una chat nuova ha riletto gli errori da capo' : ''}: l’esito non cambia. ` +
      `${p.falliti.length > 1 ? `I controlli che non passano: ${nomi}. ` : ''}` +
      `Cosa dice l’errore: ${breve(p.errori.replace(/\s+/g, ' ').trim(), 400)}`,
    scelte: [
      {
        scelta: SCELTA_LASCIA_STARE,
        conseguenza: `${p.falliti.length > 1 ? 'quei controlli li giudico io' : 'quel controllo lo giudico io'}: non conta più per finire il lavoro, lo scrivo in una riga nella conversazione e le chat proseguono con il resto`,
        consigliata: true
      },
      { scelta: SCELTA_DICO_IO, conseguenza: 'scrivi qui sotto cosa provare: lo passo alla chat così com’è e lei riparte da lì', libera: true },
      { scelta: SCELTA_SOSPENDI, conseguenza: `fermo tutte le chat di «${lavoro}»; il lavoro fatto resta salvato e lo riprendi con «Riprendi»` }
    ],
    seNonRispondi: p.continua
      ? 'intanto la chat continua con il resto del lavoro; il controllo resta da fare finché non rispondi'
      : 'la chat aspetta la tua risposta; le altre chat continuano'
  }
}

/** La scelta riconosciuta in una risposta a «sono bloccato», o `undefined` (testo libero). */
export function rispostaBloccato(risposta: string): 'lascia' | 'sospendi' | undefined {
  const r = risposta.trim().toLowerCase()
  if (r.startsWith(SCELTA_LASCIA_STARE.toLowerCase())) return 'lascia'
  if (r.startsWith(SCELTA_SOSPENDI.toLowerCase())) return 'sospendi'
  return undefined
}

/* I criteri non misurati a fine lavoro non sono più una domanda (0.84.3): il
 * lavoro si chiude da solo con una riga (`criteri-giudicati.ts`). */

/** «Pubblico adesso?» con la regola «stabile». */
export function partiPubblica(nome: string, giaMandato: boolean): PartiDomanda {
  return {
    staFacendo: `Il lavoro «${nome}» è finito e verificato${giaMandato ? ', ed è già stato mandato sul ramo principale' : ''}.`,
    domanda: 'Pubblico adesso?',
    perche: 'Questo progetto ha la regola «chiedi prima di pubblicare»: una pubblicazione arriva a chi usa il programma, quindi la decidi tu.',
    scelte: [
      { scelta: 'sì, pubblica', conseguenza: 'faccio pubblicare la versione adesso, con le note, e verifico che sia uscita', consigliata: true },
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

/* Quando il supervisore non ha risposto: `partiDaChatFerma` in `domanda-chiara.ts` (0.84.0). */

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
