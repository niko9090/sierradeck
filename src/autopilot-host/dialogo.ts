import { righeQuadroChat } from '@shared/rapporti-chat'
import type { Autopilota, ChatGovernata, MessaggioPerLaChat } from '@shared/autopilota'
import type { CambioChiesto } from './supervisore'
import { campoTestoTollerante, ultimoOggettoCon } from '@shared/json-tollerante'
import { righePromptAdottate } from '@shared/adozione'
import { leggiRichiesteProposte, type RichiestaProposta } from './richieste'
import { leggiPromesseProposte, parolaFatto, promesseAperte, REGOLA_PROMESSE, type PromessaProposta } from '@shared/promesse'

/**
 * Il dialogo con l'autopilota, fuori dalla chat.
 *
 * Nicholas (2026-09-14): «quando uso gli autopiloti devo poter dialogare con
 * loro, non nella chat, perché è lui che deve portare a termine il compito».
 * Fino alla 0.26.0 la casella della scheda serviva a una cosa sola: tradurre
 * una frase in un cambio di obiettivo o criteri (`chiediCambio`). Non
 * rispondeva, non spiegava dove fosse, e un «fermati» scritto lì dentro
 * veniva letto come un cambio di criteri.
 *
 * Qui l'autopilota **risponde con parole sue** — è il supervisore a scriverle,
 * con davanti obiettivo, criteri, diario, ultima cosa detta dalla chat — e,
 * se quello che gli hai scritto è un'istruzione, la applica: un cambio di
 * obiettivo o criteri, un compito in più, «fermati», «riprendi», e un
 * messaggio per la chat governata, che le arriva **quando la chat aspetta**,
 * non mentre lavora (vedi `prendiMessaggiPer` e `suStop` nel server).
 *
 * Tutto puro: il server mette insieme i pezzi, i test provano i pezzi.
 */

export type EsitoDialogo = {
  /** Cosa risponde a te, in italiano, scritto per essere letto nella scheda. */
  risposta: string
  /** Un cambio a obiettivo, criteri o compiti, se l'hai chiesto. */
  cambio?: CambioChiesto
  /** Un messaggio per la chat governata, se serve che la chat sappia qualcosa. */
  perLaChat?: string
  /** Un ordine sullo stato dell'autopilota, se l'hai dato. */
  comando?: 'ferma' | 'riprendi' | 'rispondi'
  /** Letta solo la `risposta`: il resto non si capiva e non si è applicato niente. */
  restoIlleggibile?: true
  /** I messaggi per le chat adottate (0.78.0), grezzi: li legge `messaggiPerAdottate`. */
  perLeChat?: unknown
  /**
   * Le richieste che il supervisore ha visto nel messaggio (0.85.0): ognuna
   * diventa un obiettivo con criterio e compiti (`registraRichieste`).
   */
  richieste?: RichiestaProposta[]
  /**
   * Le promesse di avvisare scritte nella risposta (0.85.1), ognuna legata a
   * un fatto che il programma vede (`promesseDallaRisposta`).
   */
  promesse?: PromessaProposta[]
}

/** Quanto del dialogo passato entra nel prompt. */
const BATTUTE_NEL_PROMPT = 12
/** Quanto dell'ultimo messaggio della chat entra nel prompt. */
const DETTO_MAX = 3000

/** La chiave con cui una chat riceve i messaggi: la sua, o l'autopilota per la chat singola. */
export function chiaveChatDi(a: Autopilota, chat?: ChatGovernata): string {
  return chat?.id ?? a.id
}

/** Le chiavi di tutte le chat che possono ancora ricevere qualcosa. */
export function chiaviChatVive(a: Autopilota): string[] {
  if (a.chats.length === 0) return [a.id]
  const vive = a.chats.filter((c) => c.stato !== 'finita').map((c) => c.id)
  return vive.length > 0 ? vive : a.chats.map((c) => c.id)
}

export function componiPromptDialogo(
  a: Autopilota,
  testo: string,
  contesto: {
    /** L'ultima cosa detta dalla chat governata, letta dalla trascrizione. */
    ultimoDetto?: string
    /** Se c'è una domanda aperta a cui la persona non ha ancora risposto. */
    domandaAperta?: string
    /**
     * Il quadro per chat (0.85.1, `righeQuadroChat`): compito, ultimo passo,
     * ultimo segnale vero e motivo se è ferma. Assente: si calcola qui, senza
     * i segnali veri.
     */
    quadro?: string[]
  } = {}
): string {
  const criteri = a.criteri.map(
    (c) => `- ${c.descrizione}${c.soddisfatto ? ' [soddisfatto]' : ''}${c.comando !== undefined ? ` (si misura con: ${c.comando})` : ' (lo giudichi tu)'}`
  )
  const dialogo = a.dialogo
    .slice(-BATTUTE_NEL_PROMPT)
    .map((s) => `${s.da === 'tu' ? 'Lui/lei' : 'Tu'}: ${s.testo.slice(0, 600)}`)
  const decisioni = a.decisioni.slice(-6).map((d) => `- ${d.quando}: ${d.cosa.slice(0, 200)}`)
  const inAttesa = a.daConsegnare.map((m) => `- ${m.testo.slice(0, 200)}`)

  return [
    'Sei l\'autopilota che sta portando avanti questo lavoro. Chi te lo ha affidato ti',
    'scrive dalla tua scheda, **non** dalla chat che governi: vuole parlare con te, e tu',
    'rispondi con parole tue, in italiano, come parleresti a chi ti ha dato il compito.',
    '',
    `## Il lavoro`,
    `Obiettivo: ${a.obiettivo}`,
    `Cartella: ${a.cwd}`,
    `Stato adesso: ${a.stato}${a.motivoSospensione !== undefined ? ` (${a.motivoSospensione.slice(0, 300)})` : ''}`,
    `Giri fatti: ${a.cicli}`,
    'Finisce quando:',
    ...criteri,
    ...(a.compitiDaFare.length > 0 ? ['Compiti ancora in coda:', ...a.compitiDaFare.map((c) => `- ${c}`)] : []),
    ...(contesto.quadro ?? righeQuadroChat(a, Date.now())),
    // 0.85.1: le promesse già fatte e non ancora mantenute: non si ripetono, si tengono.
    ...(promesseAperte(a).length > 0 ? ['', '## Le tue promesse ancora aperte (le mantiene il programma)', ...promesseAperte(a).map((p) => `- «${p.frase.slice(0, 200)}» → ${parolaFatto(p.fatto, a)}, entro ${p.scadenza}`)] : []),
    ...(decisioni.length > 0 ? ['', '## Le ultime mosse', ...decisioni] : []),
    ...(contesto.ultimoDetto !== undefined && contesto.ultimoDetto.trim() !== ''
      ? ['', '## L\'ultima cosa che ha scritto la chat che governi', contesto.ultimoDetto.slice(0, DETTO_MAX)]
      : []),
    ...(contesto.domandaAperta !== undefined
      ? ['', '## C\'è una tua domanda aperta a cui aspetti risposta', contesto.domandaAperta.slice(0, 600)]
      : []),
    ...(inAttesa.length > 0 ? ['', '## Messaggi suoi che la chat riceverà a fine turno', ...inAttesa] : []),
    ...(dialogo.length > 0 ? ['', '## Il dialogo finora', ...dialogo] : []),
    ...righePromptAdottate(a),
    '',
    '## Ti scrive adesso',
    testo.slice(0, 2000),
    '',
    'Puoi guardare il progetto (file, diff, comandi) prima di rispondere, se serve a dire',
    'dove sei davvero. Non fidarti di quello che la chat dice di aver fatto: verificalo.',
    '',
    'Rispondi **solo** con questo JSON, senza altro testo intorno:',
    '{',
    '  "risposta": "cosa rispondi, in italiano, per chi legge dalla scheda o dal telefono",',
    '  "perLaChat": "un messaggio per la chat che governi, solo se serve che lo sappia",',
    '  "cambio": {"obiettivo": "...", "criteri": [{"descrizione": "...", "comando": "..."}], "compitiDaFare": ["..."]},',
    '  "comando": "ferma|riprendi|rispondi",',
    '  "richieste": [{"titolo": "...", "criterio": {"descrizione": "...", "comando": "..."}, "compiti": ["..."]}],',
    '  "promesse": [{"frase": "la frase della risposta che promette", "fatto": "release|unito|richiesta|bloccata|criterio|finito", "di": "...", "entroOre": 3}]',
    '}',
    '',
    'Regole:',
    '- `risposta` c\'è sempre: anche a una domanda («dove sei?») si risponde qui, con quello',
    '  che sai dal contesto e da quello che hai guardato.',
    '- `perLaChat` solo se la chat deve saperlo per lavorare (un vincolo nuovo, una cosa da',
    '  fare in più, una correzione di rotta). Non le arriva subito: le arriva alla fine del',
    '  turno che ha in mano, insieme alle tue istruzioni. Scrivilo **alla chat**, come glielo',
    '  scriveresti tu.',
    '- `cambio` solo per quello che cambia davvero; ometti i campi che restano. Gli elenchi',
    '  vanno scritti interi. Un criterio senza `comando` lo giudichi tu. I comandi girano su',
    '  Windows dentro `bash` (Git Bash), una riga, escono con 0 quando il criterio vale.',
    '  Non lasciare mai i criteri vuoti.',
    '- `comando`: "ferma" se ti chiede di fermarti, "riprendi" se ti chiede di ripartire,',
    '  "rispondi" se il suo messaggio è la risposta alla domanda aperta (e allora metti la',
    '  risposta in `perLaChat`). Altrimenti ometti il campo.',
    '- `richieste`: ogni cosa che ti **chiede di fare** (correggere, aggiungere, cambiare,',
    '  pubblicare, controllare…) è una richiesta, e diventa da sola un obiettivo: il programma',
    '  la registra con data e testo, aggiunge il criterio ai criteri e i compiti alla coda.',
    '  Per ognuna: `titolo` in poche parole, `criterio` (mai vuoto: come si vede che è fatta,',
    '  con un `comando` solo se lo puoi misurare con una riga di bash), `compiti` da mettere',
    '  in coda (scritti per una chat, interi). Non ripetere quei compiti in `cambio`.',
    '  Se dice «sì» a una cosa che gli hai proposto tu, la richiesta è quella proposta.',
    '  Una domanda («a che punto siamo?»), un saluto, «fermati» o la risposta a una tua',
    '  domanda non sono richieste: allora `"richieste": []`.',
    ...REGOLA_PROMESSE,
    '- Se non hai capito cosa vuole, dillo in `risposta` e non cambiare niente.',
    '- Dentro i testi, per citare usa «…», non le virgolette dritte; se ti servono, scrivile \\".'
  ].join('\n')
}

function testoDi(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
}

/**
 * Legge la risposta dell'autopilota. Prende l'**ultimo** oggetto JSON
 * bilanciato: il supervisore può ragionare prima di rispondere.
 *
 * `undefined` vale «illeggibile», e allora non si tocca niente e lo si dice.
 */
export function leggiEsitoDialogo(testo: string): EsitoDialogo | undefined {
  // 0.72.1: tollera virgolette non protette, `\` sbagliate e a capo crudi
  // (vedi `json-tollerante.ts`): due risposte giuste si erano perse così.
  const grezzo = ultimoOggettoCon(testo, 'risposta')
  if (grezzo === undefined) {
    // Neanche riparato si legge l'oggetto: la risposta a te arriva lo stesso,
    // e il resto (cambio, messaggio per la chat, comando) non si applica.
    const sola = campoTestoTollerante(testo, 'risposta')?.trim()
    return sola !== undefined && sola !== '' ? { risposta: sola, restoIlleggibile: true } : undefined
  }
  const risposta = testoDi(grezzo.risposta)
  if (risposta === undefined) return undefined

  const comando = grezzo.comando === 'ferma' || grezzo.comando === 'riprendi' || grezzo.comando === 'rispondi'
    ? grezzo.comando
    : undefined
  const perLaChat = testoDi(grezzo.perLaChat)
  const cambio = leggiCambioDialogo(grezzo.cambio, risposta)
  return {
    risposta,
    ...(cambio !== undefined ? { cambio } : {}),
    ...(perLaChat !== undefined ? { perLaChat } : {}),
    ...(comando !== undefined ? { comando } : {}),
    ...(Array.isArray(grezzo.perLeChat) ? { perLeChat: grezzo.perLeChat } : {}),
    ...(leggiRichiesteProposte(grezzo.richieste).length > 0 ? { richieste: leggiRichiesteProposte(grezzo.richieste) } : {}),
    ...(leggiPromesseProposte(grezzo.promesse).length > 0 ? { promesse: leggiPromesseProposte(grezzo.promesse) } : {})
  }
}

function leggiCambioDialogo(raw: unknown, capito: string): CambioChiesto | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const o = raw as Record<string, unknown>
  const obiettivo = testoDi(o.obiettivo)
  let criteri: { descrizione: string; comando?: string }[] | undefined
  if (Array.isArray(o.criteri)) {
    criteri = []
    for (const c of o.criteri) {
      if (typeof c !== 'object' || c === null) continue
      const cc = c as Record<string, unknown>
      const descrizione = testoDi(cc.descrizione)
      if (descrizione === undefined) continue
      const comando = testoDi(cc.comando)
      // Un comando su più righe è il difetto da cui veniamo: non entra.
      if (comando !== undefined && comando.includes('\n')) continue
      criteri.push({ descrizione, ...(comando !== undefined ? { comando } : {}) })
    }
    // Un elenco che si svuota per strada non è un cambio: è una perdita.
    if (criteri.length === 0) criteri = undefined
  }
  const compitiDaFare = Array.isArray(o.compitiDaFare)
    ? o.compitiDaFare.filter((c): c is string => typeof c === 'string' && c.trim() !== '').map((c) => c.trim())
    : undefined
  if (obiettivo === undefined && criteri === undefined && compitiDaFare === undefined) return undefined
  return {
    capito,
    ...(obiettivo !== undefined ? { obiettivo } : {}),
    ...(criteri !== undefined ? { criteri } : {}),
    ...(compitiDaFare !== undefined ? { compitiDaFare } : {})
  }
}

/**
 * Mette in coda un messaggio per le chat indicate. Con un tetto: chi scrive
 * dieci volte prima di un turno non vuole dieci messaggi, vuole gli ultimi.
 */
const DA_CONSEGNARE_MAX = 20

export function conMessaggioPerLaChat(
  a: Autopilota,
  testo: string,
  quando: string,
  chats: string[],
  id: string
): Autopilota {
  if (chats.length === 0) return a
  return {
    ...a,
    daConsegnare: [...a.daConsegnare, { id, quando, testo, chats }].slice(-DA_CONSEGNARE_MAX)
  }
}

/**
 * Prende i messaggi che spettano a **questa** chat e li toglie dalla coda.
 *
 * Con una flotta ogni chat riceve il messaggio alla **sua** fermata: la
 * chiave della chat si toglie dall'elenco, e il messaggio sparisce quando
 * nessuna deve più riceverlo.
 */
export function prendiMessaggiPer(
  a: Autopilota,
  chiave: string
): { autopilota: Autopilota; testi: string[]; presi: MessaggioPerLaChat[] } {
  const testi: string[] = []
  const presi: MessaggioPerLaChat[] = []
  const restanti: MessaggioPerLaChat[] = []
  for (const m of a.daConsegnare) {
    if (!m.chats.includes(chiave)) {
      restanti.push(m)
      continue
    }
    testi.push(m.testo)
    presi.push({ ...m, chats: [chiave] })
    const chats = m.chats.filter((c) => c !== chiave)
    if (chats.length > 0) restanti.push({ ...m, chats })
  }
  if (testi.length === 0) return { autopilota: a, testi, presi }
  return { autopilota: { ...a, daConsegnare: restanti }, testi, presi }
}

/**
 * Rimette in coda i messaggi di una consegna che non è partita (0.56.4), in
 * testa e senza doppioni: un messaggio ancora in coda per un'altra chat
 * riprende anche questa.
 */
export function rimettiInCoda(a: Autopilota, messaggi: MessaggioPerLaChat[]): Autopilota {
  let coda = [...a.daConsegnare]
  const davanti: MessaggioPerLaChat[] = []
  for (const m of messaggi) {
    const gia = coda.find((x) => x.id === m.id)
    if (gia !== undefined) {
      coda = coda.map((x) => (x.id === m.id ? { ...x, chats: [...new Set([...x.chats, ...m.chats])] } : x))
    } else {
      const doppio = davanti.find((x) => x.id === m.id)
      if (doppio !== undefined) doppio.chats = [...new Set([...doppio.chats, ...m.chats])]
      else davanti.push({ ...m })
    }
  }
  return { ...a, daConsegnare: [...davanti, ...coda].slice(-DA_CONSEGNARE_MAX) }
}

/**
 * Il preambolo con cui i tuoi messaggi entrano nella chat, davanti alle
 * istruzioni del turno.
 *
 * Detto per quello che è — parole di chi ha affidato il lavoro — perché la
 * chat le pesi più delle istruzioni del supervisore, come dice il primo
 * compito: «quello che aggiunge vale più delle istruzioni qui sopra».
 */
export function preambolo(testi: string[]): string {
  if (testi.length === 0) return ''
  const righe = testi.length === 1
    ? [`Chi ti ha dato il compito ti scrive: «${testi[0]}»`]
    : ['Chi ti ha dato il compito ti scrive:', ...testi.map((t) => `- «${t}»`)]
  return [
    ...righe,
    '',
    'Tienine conto prima di tutto il resto: vale più delle istruzioni che seguono.'
  ].join('\n')
}

/** Le istruzioni del turno, con davanti i tuoi messaggi quando ce ne sono. */
export function conPreambolo(testi: string[], istruzioni: string): string {
  const p = preambolo(testi)
  return p === '' ? istruzioni : `${p}\n\n${istruzioni}`
}

/**
 * Cosa fa il servizio dopo una risposta del dialogo che promette lavoro
 * (0.75.4). Fino alla 0.75.3 ripartiva solo con `comando: "riprendi"`: il
 * 15/10 alle 21:50 l'autopilota era «finito», Nicholas ha scritto, la risposta
 * ha applicato un cambio («quasi tutto, ma non tutto») e la chat è rimasta
 * ferma finché lui non ha riscritto «vai». Adesso un messaggio per la chat o
 * un cambio applicato fanno ripartire da soli un autopilota fermo:
 * - `riprendi`: era finito, sospeso o fallito;
 * - `rispondi-domanda`: era in attesa della risposta a una sua domanda, e
 *   quello che gli hai scritto (o il messaggio per la chat) è la risposta;
 * - `forza-giro`: lavora, ma la chat è ferma: il giro parte a dialogo finito;
 * - niente: «ferma», nessuna promessa, o già al lavoro davvero.
 */
export type Ripartenza = 'riprendi' | 'rispondi-domanda' | 'forza-giro' | undefined

export function ripartenzaDopoDialogo(p: {
  stato: Autopilota['stato']
  perLaChat: boolean
  cambioApplicato: boolean
  comando?: EsitoDialogo['comando']
  domandaAperta: boolean
  chatFerme: number
}): Ripartenza {
  if (p.comando === 'ferma' || p.comando === 'riprendi' || p.comando === 'rispondi') return undefined
  if (!p.perLaChat && !p.cambioApplicato) return undefined
  if (p.stato === 'finito' || p.stato === 'sospeso' || p.stato === 'fallito') return 'riprendi'
  if (p.stato === 'attesa') return p.domandaAperta ? 'rispondi-domanda' : 'riprendi'
  if (p.stato === 'lavoro' && p.perLaChat && p.chatFerme > 0) return 'forza-giro'
  return undefined
}
