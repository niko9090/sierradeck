/**
 * **Le chat in sottofondo** (0.58.4): le parti pure, condivise fra il PC di
 * casa (che le fa girare), il PC che le usa da lontano, la pagina e i test.
 *
 * Una chat che vive su un PC e lì è chiusa si usa da un altro PC (o dal
 * telefono) senza aprirla a schermo: il PC di casa la avvia senza riquadro,
 * il testo scritto aspetta in coda e parte appena la chat è pronta.
 */

/** Chi la usa: un altro PC, il telefono, o questo PC stesso. */
export type ChiUsa = { id: string; nome: string }

export type TestoInCoda = {
  id: string; testo: string; quando: string
  /** Si scrive anche se la chat sta lavorando (0.68.1): Claude Code lo legge appena può. */
  ancheAlLavoro?: boolean
}

/** Una voce dell'elenco su disco (`sottofondo.json`). */
export type VoceSottofondo = {
  sessione: string
  cwd: string
  titolo: string
  perChi: ChiUsa
  dal: string
  coda: TestoInCoda[]
  /** Gli id dei testi già scritti (gli ultimi): un secondo invio uguale non si riscrive. */
  consegnati: string[]
  /** Il workspace del riquadro di chi la usa (0.59.0): per «Mostra qui». */
  workspace?: string
  /**
   * La chat di un autopilota (0.60.8): il suo workspace non era sullo schermo,
   * e la consegna l'ha avviata qui invece di cambiare il workspace. Con questo
   * il terminale nasce con gli hook dell'autopilota (fine turno, divieti),
   * anche dopo un riavvio.
   */
  autopilota?: { id: string; chat: string }
}

/**
 * - `avvio`: Claude Code sta nascendo;
 * - `pronta`: aspetta un messaggio;
 * - `consegna`: sta scrivendo un testo della coda;
 * - `lavora`: ha ricevuto e risponde;
 * - `aspetta`: ha finito, o un testo è rimasto nel campo;
 * - `scelta`: c'è una domanda con opzioni sullo schermo;
 * - `lenta`: non è diventata pronta nel tempo previsto;
 * - `chiusa`: uscita o chiusa da qui.
 */
export type FaseSottofondo = 'avvio' | 'pronta' | 'consegna' | 'lavora' | 'aspetta' | 'scelta' | 'lenta' | 'chiusa'

export type StatoSottofondo = {
  sessione: string
  /** L'id della chat in `/api/stato`, `/api/storia`, `/api/scrivi`. */
  chat: string
  fase: FaseSottofondo
  messaggio: string
  inCoda: number
  consegnati: string[]
  perChi: ChiUsa
  titolo: string
  cwd: string
  dal: string
  workspace?: string
}

/** Quanti id consegnati si ricordano per chat. */
export const CONSEGNATI_RICORDATI = 50

/** L'id di una chat in sottofondo: fisso per sessione, diverso dagli id dei riquadri. */
export function idChatSottofondo(sessione: string): string {
  return `sf-${sessione}`
}

export function giaConsegnato(v: VoceSottofondo, id: string): boolean {
  return v.consegnati.includes(id) || v.coda.some((t) => t.id === id)
}

/** Mette un testo in coda, una volta sola per id. */
export function accodaTesto(v: VoceSottofondo, t: TestoInCoda): VoceSottofondo {
  if (giaConsegnato(v, t.id)) return v
  return { ...v, coda: [...v.coda, t] }
}

export function prossimoTesto(v: VoceSottofondo): TestoInCoda | undefined {
  return v.coda[0]
}

export function segnaConsegnato(v: VoceSottofondo, id: string): VoceSottofondo {
  return {
    ...v,
    coda: v.coda.filter((t) => t.id !== id),
    consegnati: [...v.consegnati.filter((x) => x !== id), id].slice(-CONSEGNATI_RICORDATI)
  }
}

const ID_TESTO = /^[A-Za-z0-9_-]{1,80}$/

/** L'elenco letto da disco, con le voci storte scartate. */
export function leggiElencoSottofondo(grezzo: unknown): VoceSottofondo[] {
  const chat = (grezzo as { chat?: unknown } | null)?.chat
  if (!Array.isArray(chat)) return []
  const fuori: VoceSottofondo[] = []
  for (const c of chat) {
    if (typeof c !== 'object' || c === null) continue
    const o = c as Record<string, unknown>
    const per = o.perChi as Record<string, unknown> | undefined
    if (typeof o.sessione !== 'string' || typeof o.cwd !== 'string' || o.sessione === '' || o.cwd === '') continue
    const coda = Array.isArray(o.coda)
      ? (o.coda as unknown[]).filter((t): t is TestoInCoda => typeof t === 'object' && t !== null && typeof (t as TestoInCoda).id === 'string' && ID_TESTO.test((t as TestoInCoda).id) && typeof (t as TestoInCoda).testo === 'string')
          .map((t) => ({ id: t.id, testo: t.testo, quando: typeof t.quando === 'string' ? t.quando : '' }))
      : []
    fuori.push({
      sessione: o.sessione,
      cwd: o.cwd,
      titolo: typeof o.titolo === 'string' ? o.titolo : o.sessione.slice(0, 8),
      perChi: { id: typeof per?.id === 'string' ? per.id : '', nome: typeof per?.nome === 'string' ? per.nome : 'un altro PC' },
      dal: typeof o.dal === 'string' ? o.dal : '',
      coda,
      consegnati: Array.isArray(o.consegnati) ? (o.consegnati as unknown[]).filter((x): x is string => typeof x === 'string').slice(-CONSEGNATI_RICORDATI) : [],
      ...(typeof o.workspace === 'string' && o.workspace !== '' ? { workspace: o.workspace } : {}),
      ...(() => {
        const a = o.autopilota as Record<string, unknown> | undefined
        return a !== undefined && a !== null && typeof a.id === 'string' && a.id !== '' && typeof a.chat === 'string' && a.chat !== '' ? { autopilota: { id: a.id, chat: a.chat } } : {}
      })()
    })
  }
  return fuori
}

/** L'id di un testo mandato da lontano: lo stesso formato degli id dei messaggi (0.51.0). */
export function idTestoValido(id: string): boolean {
  return ID_TESTO.test(id)
}

/**
 * Il testo che il campo mostra mentre la chat parte là (PC, pagina, app: le
 * stesse parole). `pc` è il nome del PC di casa.
 */
export function testoAvvio(fase: FaseSottofondo | 'chiedo' | 'errore', pc: string, conTesto: boolean): string {
  const dopo = conTesto ? ' Il tuo messaggio parte appena è pronta.' : ''
  switch (fase) {
    case 'chiedo': return `Chiedo a ${pc} di avviare questa chat in sottofondo…${dopo}`
    case 'avvio': return `La sto avviando su ${pc}, in sottofondo (là non si apre nessuna finestra)…${dopo}`
    case 'lenta': return `Su ${pc} Claude Code ci sta mettendo più del solito a partire: aspetto ancora.${dopo}`
    case 'consegna': return `Chat pronta su ${pc}: sto scrivendo il tuo messaggio.`
    case 'pronta': return conTesto ? `Chat pronta su ${pc}: il tuo messaggio parte adesso.` : `Chat pronta su ${pc}, in sottofondo: scrivile qui.`
    case 'lavora': return `Messaggio consegnato: la chat lavora su ${pc}.`
    case 'aspetta': return `La chat su ${pc} ha finito e aspetta.`
    case 'scelta': return `La chat su ${pc} aspetta una scelta: le opzioni sono qui sotto.`
    case 'chiusa': return `La chat su ${pc} si è chiusa.`
    case 'errore': return `Non sono riuscito ad avviarla su ${pc}.`
  }
}

/** Il testo è arrivato? Dallo stato del PC di casa. */
export function testoConsegnato(s: Pick<StatoSottofondo, 'consegnati'> | undefined, id: string): boolean {
  return s !== undefined && s.consegnati.includes(id)
}
