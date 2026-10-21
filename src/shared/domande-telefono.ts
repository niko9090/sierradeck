import type { PartiDomanda } from './domanda-strutturata'
import { senzaRigaSegnale } from './segnali-flotta'

/**
 * Tutto quello che aspetta una risposta da chi guarda il telefono, in un
 * elenco solo.
 *
 * Nicholas (22/09/2026): «sul cellulare non riesco a vedere e a rispondere
 * bene alle domande, sia della chat che quelle iniziali. Voglio che ci sia
 * una sezione a parte, non bloccante». Fin qui le domande stavano in tre
 * posti diversi e parziali: la prima domanda degli autopiloti in una banda
 * in cima (una sola, con una finestra che bloccava), le scelte del terminale
 * solo dentro la chat aperta, le chat ferme solo nelle notifiche.
 *
 * Tre famiglie, nell'ordine in cui vanno lette:
 * 1. `autopilota` — una domanda aperta di un autopilota: la sua intervista
 *    prima di partire («quelle iniziali»), una decisione durante il lavoro, o
 *    uno stallo. Si risponde con parole (`/api/rispondi`).
 * 2. `scelta` — una chat che ha disegnato un elenco numerato e aspetta una
 *    freccia e un invio: «vuoi procedere? 1. Sì 2. Sì e non chiedere più
 *    3. No», un riquadro di permesso, una conversazione da riprendere. Si
 *    risponde toccando un'opzione (`/api/scegli`) o scrivendo (`/api/scrivi`).
 * 3. `chat` — una chat che ha finito di scrivere e aspetta te, senza un
 *    elenco: si legge cosa ha scritto per ultimo e le si scrive.
 *
 * Puro: chi chiama porta le tre liste e la funzione che riconosce le scelte.
 */

export type OpzioneScelta = {
  numero: number
  testo: string
  scelta: boolean
  /** La spiegazione sotto l'opzione, nelle domande di Claude Code (0.52.5). */
  descrizione?: string
  /** «Type something.»: si risponde scrivendo, non toccando. */
  libera?: boolean
  /** Scelta multipla: la casella è spuntata. */
  spuntata?: boolean
  /** Scelta multipla: «Submit», manda le caselle spuntate. */
  invio?: boolean
}

export type VoceDomanda =
  | {
      tipo: 'autopilota'
      /** L'id della domanda: e' quello che si rimanda a `/api/rispondi`. */
      id: string
      autopilotaId: string
      /** Il nome dell'autopilota, o il suo obiettivo se non ha un nome. */
      autopilota: string
      /** `intervista`: prima di partire; `lavoro`: mentre lavora. */
      origine: 'intervista' | 'lavoro'
      testo: string
      apertaIl?: number
      scadeIl?: number
      /** Le risposte da toccare, quando l'autopilota le propone. */
      opzioni?: string[]
      /** La riga sotto il titolo, per una domanda che non è di un autopilota (0.54.0). */
      sotto?: string
      /** Le cinque parti (0.41.0): la scheda (0.72.1) mostra la frase e mette il resto nel «?». */
      parti?: PartiDomanda
      avvertenza?: string
    }
  | {
      tipo: 'scelta'
      chat: string
      titolo: string
      cwd: string
      /** Le righe di schermo sopra l'elenco, gia' pulite: la domanda com'e' scritta. */
      righe: string[]
      opzioni: OpzioneScelta[]
      corrente: number
    }
  | {
      tipo: 'chat'
      chat: string
      titolo: string
      cwd: string
      /** Le ultime righe di schermo, pulite: quello che ha scritto per ultimo. */
      righe: string[]
      /** La chat e' su un altro PC (0.39.3): il suo nome, per il segno «SU <PC>». */
      pcNome?: string
      /** E la strada per arrivarci (0.40.0): «rete di casa», «Tailscale», «WebRTC», «Drive, lento». */
      viaPc?: string
      /**
       * Ferma su una **domanda** (0.71.1), non solo a fine turno: una domanda
       * scritta in fondo al suo ultimo messaggio, o un dialogo di Claude Code
       * che lo schermo non ha saputo leggere. `righe` è la domanda.
       */
      chiede?: boolean
    }
  | {
      /**
       * Una domanda di una chat governata a cui ha risposto l'autopilota da
       * solo (0.71.1): resta visibile, con la risposta. Non aspetta te.
       */
      tipo: 'risolta'
      autopilotaId: string
      autopilota: string
      chatTitolo?: string
      domanda: string
      risposta: string
      quando: string
    }

/**
 * Quante righe si portano per una chat che ha **solo finito** il turno: uno
 * sguardo, non una pagina. Per una chat ferma su una **domanda** (le scelte)
 * non c'e' limite: si porta tutta la domanda (`contestoScelta`, 0.39.1).
 */
const RIGHE_DI_CONTESTO = 20

/** Una riga che e' solo cornice (almeno dieci tratti): il bordo di sopra del riquadro della domanda. */
const BORDO = /^[\s─━═╌╍┄┈╭╮╰╯┌┐└┘┏┓┗┛╔╗╚╝]*[─━═╌╍┄┈]{10,}[\s─━═╌╍┄┈╭╮╰╯┌┐└┘┏┓┗┛╔╗╚╝]*$/

const NUMERATA = /^\s*(\d{1,2})[.)]\s+\S/

/**
 * Le righe che stanno sopra l'elenco delle scelte: e' la domanda.
 *
 * Si parte dalla riga dell'opzione «1» andando all'indietro fino al bordo di
 * sopra del suo riquadro (una riga di sola cornice), e si tengono **tutte** le
 * righe non vuote, tolte le cornici e gli spazi ai bordi. Se l'opzione non si
 * trova (lo schermo e' cambiato nel frattempo) si tengono le ultime righe.
 *
 * Fino alla 0.39.0 se ne tenevano al massimo otto: una domanda piu' lunga
 * arrivava senza l'inizio (Nicholas, 02/10: «le domande sono tutte tagliate»).
 */
export function contestoScelta(righePulite: string[], primaOpzione: string): string[] {
  const nude = righePulite.map(pulisci)
  let taglio = nude.length
  for (let i = nude.length - 1; i >= 0; i -= 1) {
    const r = nude[i] ?? ''
    if (NUMERATA.test(r) && r.replace(NUMERATA, '').trim() !== '' && r.includes(primaOpzione)) { taglio = i; break }
  }
  if (taglio === nude.length) return ultimeRighe(righePulite)
  // Sopra la «1» possono stare altre righe numerate? No: la 1 e' la prima.
  // Ma sopra puo' esserci la riga vuota che le separa dalla domanda.
  let inizio = 0
  for (let i = taglio - 1; i >= 0; i -= 1) {
    if (BORDO.test(righePulite[i] ?? '')) { inizio = i + 1; break }
  }
  return nude.slice(inizio, taglio).filter((r) => r !== '')
}

/** Le ultime righe non vuote di uno schermo, pulite. */
export function ultimeRighe(righePulite: string[]): string[] {
  return righePulite.map(pulisci).filter((r) => r !== '').slice(-RIGHE_DI_CONTESTO)
}

const CORNICE = /^[\s─│┌┐└┘├┤┬┴┼╭╮╰╯━┃┏┓┗┛┣┫┳┻╋═║╔╗╚╝╠╣╦╩╬┄┈╌╍▏▕▁▔]+|[\s─│┌┐└┘├┤┬┴┼╭╮╰╯━┃┏┓┗┛┣┫┳┻╋═║╔╗╚╝╠╣╦╩╬┄┈╌╍▏▕▁▔]+$/g

function pulisci(r: string): string {
  return r.replace(CORNICE, '').trim()
}

export type ChatPerDomande = {
  id: string
  titolo: string
  cwd: string
  aspetta?: boolean
  governata?: boolean
  /** Le righe pulite dello schermo. */
  coda?: string[]
  /** Le righe vestite: sono quelle su cui si riconoscono le scelte (il video inverso). */
  codaGrezza?: string[]
  /** I segnali di Claude Code dicono che chiede (un permesso, un dialogo): 0.71.1. */
  chiedeSegnale?: boolean
  /** La domanda in fondo al suo ultimo messaggio (dal segnale `Stop`), se ce n'è una: 0.71.1. */
  domanda?: string
}

/** Una domanda di una chat a cui l'autopilota ha risposto da solo (0.71.1). */
export type DomandaRisolta = { autopilotaId: string; chatId?: string; chatTitolo?: string; domanda: string; risposta: string; quando: string }

/**
 * L'inizio della «risposta» di una domanda chiusa perché superata (0.84.0):
 * nessuno ha risposto, e così va mostrata (collaudo 0.84.1).
 */
export const SUPERATA = 'Superata, non serve più: '

/** Una domanda chiusa perché superata, non una risposta dell'autopilota. */
export function eSuperata(r: Pick<DomandaRisolta, 'risposta'>): boolean {
  return r.risposta.startsWith(SUPERATA)
}

/** Quanto resta visibile una domanda a cui ha risposto l'autopilota. */
export const RISOLTE_PER_ORE = 12

/**
 * La domanda in fondo a un messaggio (0.71.1), o `undefined`.
 *
 * Nicholas (13/10, sulla 0.71.0): «le domande spariscono e rimangono solo nella
 * chat». Una chat che finisce il turno chiedendo qualcosa in testo («Procedo
 * con la B?») per le Domande era una chat che «ha finito», e dalla 0.70.0 il
 * filtro «Aspettano te» le nasconde. È una domanda se l'ultimo paragrafo finisce
 * con «?», oppure se è un elenco di scelte sotto un paragrafo che finisce con «?».
 */
export function domandaInFondo(testo: string | undefined): string | undefined {
  if (testo === undefined) return undefined
  // 0.84.0: la riga «SEGNALE: …» per l'autopilota non nasconde la domanda.
  const paragrafi = senzaRigaSegnale(testo).replace(/\r/g, '').split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p !== '')
  const finisceConDomanda = (p: string): boolean => /\?[\s*_`)»"'”]*$/.test(p)
  const elenco = (p: string): boolean => p.split('\n').every((r) => /^\s*(\d{1,2}[.)]|[-*•]|[A-Za-z][.)])\s+\S/.test(r))
  const ultimo = paragrafi[paragrafi.length - 1]
  if (ultimo === undefined) return undefined
  if (finisceConDomanda(ultimo)) return ultimo.slice(-1200)
  const prima = paragrafi[paragrafi.length - 2]
  if (prima !== undefined && elenco(ultimo) && finisceConDomanda(prima)) return `${prima}\n${ultimo}`.slice(-1200)
  return undefined
}

export type AutopilotaPerDomande = { id: string; nome: string; obiettivo: string; stato: string }

/**
 * `da` e `sotto` (0.54.0): una domanda che non viene da un autopilota — la
 * conferma di un file che una chat vuole mandare al telefono — dice da sola
 * chi chiede e di cosa si tratta.
 */
export type DomandaPerDomande = { id: string; autopilotaId: string; testo: string; apertaIl?: number; scadeIl?: number; opzioni?: string[]; da?: string; sotto?: string; parti?: PartiDomanda; avvertenza?: string }

/** Le chat degli altri PC, dal loro battito sul Drive: solo quelle che aspettano contano. */
export type AltroPcPerDomande = {
  pcId: string
  nome: string
  vivo: boolean
  chat: { sessione?: string; titolo: string; cwd: string; aspetta: boolean; domanda?: string; scelte?:{ numero: number; testo: string; libera?: boolean; spuntata?: boolean; invio?: boolean }[] }[]
  /** La strada con cui questo computer arriva a quel PC (0.40.0), in due parole: la mostrano la pagina e l'app. */
  strada?: string
}

/** La chat di un altro PC nelle Domande: `pc:<pcId>:<sessione>`, che `/api/scrivi` sa mandare la'. */
export function idChatAltroPc(pcId: string, sessione: string): string {
  return `pc:${pcId}:${sessione}`
}
export function leggiIdChatAltroPc(id: string): { pcId: string; sessione: string } | undefined {
  const m = /^pc:([^:]+):(.+)$/.exec(id)
  return m === null ? undefined : { pcId: m[1] as string, sessione: m[2] as string }
}

export function raccogliDomande(p: {
  domande: DomandaPerDomande[]
  autopiloti: AutopilotaPerDomande[]
  chat: ChatPerDomande[]
  /**
   * Le chat degli altri PC accesi che hanno finito e aspettano te (0.37.2):
   * prima non arrivavano nelle Domande. Si risponde da qui: il testo va alla
   * chat sul suo PC.
   */
  altriPc?: AltroPcPerDomande[]
  /** Le scelte vive di una chat (gia' senza quelle appena mandate), o niente. */
  scelteDi: (chatId: string, righeVestite: string[]) => { opzioni: OpzioneScelta[]; corrente: number } | undefined
  /** Le domande a cui l'autopilota ha risposto da solo (0.71.1): restano visibili. */
  risolte?: DomandaRisolta[]
}): VoceDomanda[] {
  const fuori: VoceDomanda[] = []
  const perId = new Map(p.autopiloti.map((a) => [a.id, a]))
  const domande = [...p.domande].sort((a, b) => (a.apertaIl ?? 0) - (b.apertaIl ?? 0))
  for (const d of domande) {
    const a = perId.get(d.autopilotaId)
    fuori.push({
      tipo: 'autopilota',
      id: d.id,
      autopilotaId: d.autopilotaId,
      autopilota: a === undefined ? (d.da ?? 'Un autopilota') : (a.nome !== '' ? a.nome : a.obiettivo),
      origine: a?.stato === 'intervista' ? 'intervista' : 'lavoro',
      testo: d.testo,
      ...(d.apertaIl !== undefined ? { apertaIl: d.apertaIl } : {}),
      ...(d.scadeIl !== undefined ? { scadeIl: d.scadeIl } : {}),
      ...(d.opzioni !== undefined && d.opzioni.length > 0 ? { opzioni: d.opzioni } : {}),
      ...(a === undefined && d.sotto !== undefined ? { sotto: d.sotto } : {}),
      ...(d.parti !== undefined && typeof d.parti === 'object' ? { parti: d.parti } : {}),
      ...(typeof d.avvertenza === 'string' && d.avvertenza !== '' ? { avvertenza: d.avvertenza } : {})
    })
  }
  const ferme: VoceDomanda[] = []
  for (const c of p.chat) {
    const vestite = c.codaGrezza ?? c.coda ?? []
    const s = p.scelteDi(c.id, vestite)
    if (s !== undefined && s.opzioni.length > 0) {
      fuori.push({
        tipo: 'scelta',
        chat: c.id, titolo: c.titolo, cwd: c.cwd,
        righe: contestoScelta(c.coda ?? [], s.opzioni[0]?.testo ?? ''),
        opzioni: s.opzioni, corrente: s.corrente
      })
      continue
    }
    // Ferma su una domanda (0.71.1): un dialogo che i segnali vedono e lo
    // schermo no, anche in una chat governata (la domanda è sua, non
    // dell'autopilota); una domanda scritta in fondo al turno, solo se nessun
    // autopilota la governa (lì risponde lui, e la risposta resta visibile).
    if (c.chiedeSegnale === true) {
      fuori.push({ tipo: 'chat', chat: c.id, titolo: c.titolo, cwd: c.cwd, righe: c.domanda !== undefined ? c.domanda.split('\n') : ultimeRighe(c.coda ?? []), chiede: true })
      continue
    }
    if (c.aspetta === true && c.governata !== true && c.domanda !== undefined) {
      fuori.push({ tipo: 'chat', chat: c.id, titolo: c.titolo, cwd: c.cwd, righe: c.domanda.split('\n'), chiede: true })
      continue
    }
    if (c.aspetta === true && c.governata !== true) {
      ferme.push({ tipo: 'chat', chat: c.id, titolo: c.titolo, cwd: c.cwd, righe: ultimeRighe(c.coda ?? []) })
    }
  }
  for (const pc of p.altriPc ?? []) {
    if (!pc.vivo) continue
    for (const c of pc.chat) {
      if (c.sessione === undefined || c.sessione === '') continue
      // Ferma su una domanda (0.52.6): le opzioni dal suo battito, da toccare
      // qui. La scelta passa dal ponte e quel PC la ricontrolla prima di premere.
      if (c.scelte !== undefined && c.scelte.length >= 2) {
        fuori.push({
          tipo: 'scelta',
          chat: idChatAltroPc(pc.pcId, c.sessione),
          titolo: `${c.titolo || c.cwd} · su ${pc.nome}`,
          cwd: c.cwd,
          righe: [`Su ${pc.nome}: la chat aspetta che tu scelga. Tocca un'opzione: la premo là, dopo aver ricontrollato che la domanda sia ancora quella.`],
          opzioni: c.scelte.map((o) => ({ numero: o.numero, testo: o.testo, scelta: false, ...(o.libera === true ? { libera: true } : {}), ...(o.spuntata !== undefined ? { spuntata: o.spuntata } : {}), ...(o.invio === true ? { invio: true } : {}) })),
          corrente: 0
        })
        continue
      }
      if (!c.aspetta) continue
      // Ferma su una domanda scritta (0.71.1): il suo PC la mette nel battito.
      if (c.domanda !== undefined && c.domanda !== '') {
        fuori.push({
          tipo: 'chat',
          chat: idChatAltroPc(pc.pcId, c.sessione),
          titolo: `${c.titolo || c.cwd} · su ${pc.nome}`,
          pcNome: pc.nome,
          ...(pc.strada !== undefined ? { viaPc: pc.strada } : {}),
          cwd: c.cwd,
          righe: c.domanda.split('\n'),
          chiede: true
        })
        continue
      }
      ferme.push({
        tipo: 'chat',
        chat: idChatAltroPc(pc.pcId, c.sessione),
        titolo: `${c.titolo || c.cwd} · su ${pc.nome}`,
        pcNome: pc.nome,
        ...(pc.strada !== undefined ? { viaPc: pc.strada } : {}),
        cwd: c.cwd,
        righe: [`Su ${pc.nome}: ha finito il turno e aspetta la tua prossima istruzione. Quello che scrivi qui arriva a questa chat, sul suo PC.`]
      })
    }
  }
  // Le risposte date dall'autopilota (0.71.1), le più recenti, in fondo.
  const risolte: VoceDomanda[] = (p.risolte ?? []).map((r) => {
    const a = perId.get(r.autopilotaId)
    return {
      tipo: 'risolta' as const,
      autopilotaId: r.autopilotaId,
      autopilota: a === undefined ? 'Un autopilota' : (a.nome !== '' ? a.nome : a.obiettivo),
      ...(r.chatTitolo !== undefined ? { chatTitolo: r.chatTitolo } : {}),
      domanda: r.domanda,
      risposta: r.risposta,
      quando: r.quando
    }
  })
  return [...fuori, ...ferme, ...risolte]
}

/** Quante cose chiedono davvero (domande e scelte): e' il numero sul pallino. Le chat ferme no. */
export function quanteChiedono(voci: VoceDomanda[]): number {
  return voci.filter((v) => (v.tipo !== 'chat' && v.tipo !== 'risolta') || (v.tipo === 'chat' && v.chiede === true)).length
}


/**
 * Le voci come le leggono le app (0.43.0): le `opzioni` sempre come oggetti
 * `{ numero, testo, scelta }`, anche quelle di un autopilota, che qui sono
 * stringhe. Un'app (2.39 e successive) che incontrava una stringa al posto
 * dell'oggetto non leggeva piu' niente della scheda Domande.
 */
export function vociPerLeApp(voci: VoceDomanda[]): unknown[] {
  // Le risolte (0.71.1) le leggono solo le conversazioni: un'app vecchia non conosce il tipo.
  return voci.filter((v) => v.tipo !== 'risolta').map((v) => {
    if (v.tipo !== 'autopilota') return v
    // Le parti (0.72.1) servono alla scheda delle conversazioni, non alle app vecchie.
    const { parti: _p, avvertenza: _a, ...resto } = v
    if (resto.opzioni === undefined) return resto
    return { ...resto, opzioni: resto.opzioni.map((testo, i) => ({ numero: i + 1, testo, scelta: false })) }
  })
}
