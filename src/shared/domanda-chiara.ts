import type { PartiDomanda } from './domanda-strutturata'

/**
 * **Domande chiare per sempre** (0.84.0).
 *
 * Nicholas, dal 17/10 al 21/10, davanti a domande vere:
 * - «Come vado avanti con questo pezzo?» → «quale pezzo???», «devi essere più specifico, di che lavoro parli?»;
 * - «Chiudi tu a mano le chat c-7 e c-4…?»: le sigle non gli dicono niente;
 * - «Quell'autopilota con la tua richiesta su Nexora lo sposto…?»;
 * - «idle_prompt: Claude is waiting for your input»: la notifica in inglese al posto della domanda.
 *
 * Qui stanno le regole che si possono controllare senza un modello: niente
 * sigle di chat, niente riferimenti che chi legge non può risolvere, la
 * notifica di Claude Code tolta. Le sigle si sostituiscono da sole con il
 * compito della chat, quando il programma lo conosce.
 */

/**
 * Una sigla di chat («c-12»), il ramo che la contiene («ap/ap-f1e631f5/c-12»)
 * o l'id di un autopilota («ap-f1e631f5»): per Nicholas sono tutte sigle.
 * Non dentro una parola («abc-12»), un percorso o un nome di file («c-310.log»);
 * dopo la barra solo se prima c'è un'altra sigla («c-7/c-4», collaudo 0.84.0).
 */
export const SIGLA_CHAT = /(?:(?<![\p{L}\d_/.-])|(?<=(?<![\p{L}\d_/.-])c-\d+\/))(?:ap\/ap-[0-9a-f]+\/)?(c-\d+|ap-[0-9a-f]{8})(?![\d\p{L}]|\.\p{L})/giu

/** Riferimenti che chi legge da lontano non può risolvere (0.84.0). */
export const RIFERIMENTI_VAGHI = /(?<![\p{L}])(l['’]altra chat|l['’]altro autopilota|quell['’]altra|quell['’]autopilota|quel pezzo|questo pezzo|quel lavoro|questo lavoro|questo autopilota|quella cosa|questa cosa|quella chat|quella parte|come detto|di cui sopra|vedi sopra)(?![\p{L}])/iu

/** La riga che Claude Code mette nella notifica di attesa: non è una domanda e non è italiano. */
const NOTIFICA_CLAUDE = /^\s*(?:[a-z_]+:\s*)?Claude (?:is waiting for your input|needs your attention)\s*/i
/** La richiesta di permesso: si traduce, perché dice quale strumento (Revisione 0.84.0). */
const PERMESSO_CLAUDE = /^\s*(?:[a-z_]+:\s*)?Claude needs your permission to use ([^\n]+?)\s*$/im

/** Le sigle che compaiono in un testo, senza doppioni, in minuscolo. */
export function sigleIn(testo: string): string[] {
  return [...new Set([...testo.matchAll(SIGLA_CHAT)].map((m) => (m[1] ?? '').toLowerCase()))]
}

/** Il primo riferimento vago, o `undefined`. */
export function riferimentoVago(testo: string): string | undefined {
  return RIFERIMENTI_VAGHI.exec(testo)?.[0]
}

/** Tutti i testi di una domanda, per i controlli che valgono ovunque. */
export function testiDi(p: PartiDomanda): string[] {
  return [p.staFacendo, p.domanda, p.perche, p.seNonRispondi, ...p.scelte.flatMap((s) => [s.scelta, s.conseguenza])]
}

/** Le note di chiarezza su una domanda: vuoto se va bene. */
export function noteDiChiarezza(p: PartiDomanda): string[] {
  const note: string[] = []
  const sigle = [...new Set(testiDi(p).flatMap(sigleIn))]
  if (sigle.length > 0) note.push(`niente sigle di chat (${sigle.map((s) => `«${s}»`).join(', ')}): chi legge non sa cosa sono, di' a parole di quale lavoro si tratta`)
  const vago = riferimentoVago([p.domanda, ...p.scelte.map((s) => s.scelta)].join('\n'))
  if (vago !== undefined) note.push(`«${vago}» non si capisce da lontano: di' esattamente di quale lavoro o di quale chat parli, con il suo compito`)
  return note
}

/** Una chat come la conosce il programma: la sigla e il suo compito. */
export type ChatConCompito = { id: string; compito: string }

/** Il compito in poche parole: la prima frase, tagliata a una parola intera. */
export function compitoInBreve(compito: string, max = 50): string {
  const prima = compito.split(/\r?\n/).map((r) => r.trim()).find((r) => r !== '') ?? ''
  const frase = (/^(.+?[.!?;])(\s|$)/.exec(prima)?.[1] ?? prima).replace(/[.;]$/, '').trim()
  if (frase.length <= max) return frase
  const taglio = frase.slice(0, max - 1)
  const spazio = taglio.lastIndexOf(' ')
  return `${(spazio > max / 2 ? taglio.slice(0, spazio) : taglio).replace(/[\s,:;–-]+$/, '')}…`
}

/**
 * Il nome di una chat dal suo compito, **senza sigle** (Revisione 0.84.0): il
 * compito della Revisione è «Rivedi il ramo ap/…/c-12 della chat c-12 («…»)»,
 * e il suo inizio portava le sigle dentro la domanda appena pulita.
 */
export function nomeCompito(compito: string, max = 50): string {
  const rev = /^\s*Rivedi il ramo \S+ della chat c-\d+ \(«([\s\S]*)/.exec(compito)
  const base = rev !== null ? `Revisione di: ${(rev[1] ?? '').replace(/»\)?\s*$/, '')}` : compito
  return compitoInBreve(base.replace(SIGLA_CHAT, '').replace(/\(\s*\)/g, '').replace(/[ \t]{2,}/g, ' '), max)
}

/**
 * Le sigle sostituite con il compito della chat: «chiudo le chat c-7 e c-4?»
 * diventa «chiudo le chat «Collaudo della gestione…» e «Interfaccia…»?». Una
 * sigla che il programma non conosce **resta** (collaudo 0.84.0): prima
 * diventava «una chat precedente», che non dice quale lavoro, e la domanda
 * passava il controllo; così il controllo la fa riscrivere.
 */
export function senzaSigle(testo: string, chat: ChatConCompito[]): string {
  return testo.replace(SIGLA_CHAT, (tutto, id: string) => {
    const c = chat.find((x) => x.id.toLowerCase() === id.toLowerCase())
    const nome = c !== undefined ? nomeCompito(c.compito) : ''
    return nome !== '' ? `«${nome}»` : tutto
  })
}

/**
 * Per una domanda già risolta, che non si può più far riscrivere (collaudo
 * 0.84.0): le sigle conosciute diventano il compito, quelle che il programma
 * non conosce più si dicono a parole. Fra le risolte non resta nessuna sigla.
 */
export function senzaSigleMai(testo: string, chat: ChatConCompito[]): string {
  return senzaSigle(senzaNotificaClaude(testo) || testo, chat).replace(SIGLA_CHAT, (_t, id: string) => (id.toLowerCase().startsWith('ap-') ? 'un altro autopilota' : 'una chat che non c’è più'))
}

/** La stessa domanda con le sigle sostituite in ogni parte. */
export function partiSenzaSigle(p: PartiDomanda, chat: ChatConCompito[]): PartiDomanda {
  const s = (t: string): string => senzaSigle(t, chat)
  return {
    staFacendo: s(p.staFacendo),
    domanda: s(p.domanda),
    perche: s(p.perche),
    scelte: p.scelte.map((x) => ({ ...x, scelta: s(x.scelta), conseguenza: s(x.conseguenza) })),
    seNonRispondi: s(p.seNonRispondi)
  }
}

/** La notifica di Claude Code tolta dal testo («idle_prompt: Claude is waiting for your input»). */
export function senzaNotificaClaude(testo: string): string {
  return testo
    .replace(PERMESSO_CLAUDE, (_t, cosa: string) => `Chiede il tuo permesso per usare ${cosa}.`)
    .replace(NOTIFICA_CLAUDE, '')
    .replace(/^\s*La chat aveva appena detto:\s*/i, '')
    .trim()
}

/**
 * La domanda quando il supervisore non ha saputo scriverla (0.84.0). Prima
 * la «domanda» era la notifica inglese più il messaggio intero della chat, e
 * passava con «⚠ Domanda incompleta» (21/10, due volte). Adesso: la domanda
 * vera in fondo al messaggio se c'è, altrimenti una domanda scritta dal
 * programma che nomina il lavoro; il messaggio intero va nel perché.
 */
export function partiDaChatFerma(p: {
  compito: string
  obiettivo: string
  detto?: string
  domandaInFondo?: string
}): PartiDomanda {
  const lavoro = nomeCompito(p.compito !== '' ? p.compito : p.obiettivo, 80)
  const detto = senzaNotificaClaude(p.detto ?? '')
  const vera = p.domandaInFondo !== undefined ? senzaNotificaClaude(p.domandaInFondo) : ''
  return {
    staFacendo: `La chat che lavora a «${lavoro}» si è fermata e aspetta.`,
    domanda: vera !== '' ? vera : `Cosa deve fare adesso la chat che lavora a «${lavoro}»?`,
    perche: detto !== '' ? `Ha appena scritto:\n${detto}` : 'Si è fermata senza dire perché.',
    scelte: vera !== ''
      ? [
          { scelta: 'decidi tu', conseguenza: 'la chat sceglie da sola la strada più prudente e prosegue', consigliata: true },
          { scelta: 'fermati', conseguenza: 'la chat si ferma; il suo lavoro resta salvato sul suo ramo' }
        ]
      : [
          { scelta: 'prosegui da sola', conseguenza: 'le dico di andare avanti con il suo compito senza aspettarti', consigliata: true },
          { scelta: 'fermati', conseguenza: 'la chat si ferma; il suo lavoro resta salvato sul suo ramo' }
        ],
    seNonRispondi: 'la chat resta ferma finché non rispondi'
  }
}
