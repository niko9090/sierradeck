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

export type OpzioneScelta = { numero: number; testo: string; scelta: boolean }

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
    }

/** Quante righe di contesto si portano al telefono: uno sguardo, non una pagina. */
const RIGHE_DI_CONTESTO = 8

const NUMERATA = /^\s*(\d{1,2})[.)]\s+\S/

/**
 * Le righe che stanno sopra l'elenco delle scelte: e' la domanda.
 *
 * Si parte dalla riga dell'opzione «1» andando all'indietro e si tengono le
 * ultime righe non vuote, tolte le cornici e gli spazi ai bordi. Se l'opzione
 * non si trova (lo schermo e' cambiato nel frattempo) si tengono le ultime
 * righe e basta.
 */
export function contestoScelta(righePulite: string[], primaOpzione: string): string[] {
  const nude = righePulite.map(pulisci)
  let taglio = nude.length
  for (let i = nude.length - 1; i >= 0; i -= 1) {
    const r = nude[i] ?? ''
    if (NUMERATA.test(r) && r.replace(NUMERATA, '').trim() !== '' && r.includes(primaOpzione)) { taglio = i; break }
  }
  // Sopra la «1» possono stare altre righe numerate? No: la 1 e' la prima.
  // Ma sopra puo' esserci la riga vuota che le separa dalla domanda.
  const sopra = nude.slice(0, taglio).filter((r) => r !== '')
  return sopra.slice(-RIGHE_DI_CONTESTO)
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
}

export type AutopilotaPerDomande = { id: string; nome: string; obiettivo: string; stato: string }

export type DomandaPerDomande = { id: string; autopilotaId: string; testo: string; apertaIl?: number; scadeIl?: number }

export function raccogliDomande(p: {
  domande: DomandaPerDomande[]
  autopiloti: AutopilotaPerDomande[]
  chat: ChatPerDomande[]
  /** Le scelte vive di una chat (gia' senza quelle appena mandate), o niente. */
  scelteDi: (chatId: string, righeVestite: string[]) => { opzioni: OpzioneScelta[]; corrente: number } | undefined
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
      autopilota: a === undefined ? 'Un autopilota' : (a.nome !== '' ? a.nome : a.obiettivo),
      origine: a?.stato === 'intervista' ? 'intervista' : 'lavoro',
      testo: d.testo,
      ...(d.apertaIl !== undefined ? { apertaIl: d.apertaIl } : {}),
      ...(d.scadeIl !== undefined ? { scadeIl: d.scadeIl } : {})
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
    if (c.aspetta === true && c.governata !== true) {
      ferme.push({ tipo: 'chat', chat: c.id, titolo: c.titolo, cwd: c.cwd, righe: ultimeRighe(c.coda ?? []) })
    }
  }
  return [...fuori, ...ferme]
}

/** Quante cose chiedono davvero (domande e scelte): e' il numero sul pallino. Le chat ferme no. */
export function quanteChiedono(voci: VoceDomanda[]): number {
  return voci.filter((v) => v.tipo !== 'chat').length
}
