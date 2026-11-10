import type { Proposta, Pulizia, QuotaMisurata, RecuperoDrivePieno, StatoSpazio } from './spazio-drive'

/**
 * «Libera spazio sul Drive» (0.99): la procedura guidata, uguale sul PC e sulla
 * pagina del telefono. La logica sta qui, pura (niente rete, niente disco): i
 * passi, i loro stati, la percentuale, il caso «Drive pieno» e il caso «il
 * grosso è fuori da SierraDeck».
 *
 * Le funzioni **non usano niente fuori da se stesse** (né costanti né altre
 * funzioni del file): la pagina del telefono le riceve scritte come testo
 * (`.toString()`) e le fa girare così. Se ne aggiungi una, tienila uguale.
 */

export type IdPasso = 'versioni' | 'chat-non-usate' | 'doppie' | 'doppioni-nome' | 'recupero'
export type StatoPasso = 'da-fare' | 'in-corso' | 'fatto' | 'saltato' | 'errore'
/** `conta`/`togli` per le versioni; `pulisci` mette nel recupero (o cancella, a Drive pieno); `svuota` cancella il recupero. */
export type AzionePasso = 'conta' | 'togli' | 'pulisci' | 'svuota'

export type Passo = {
  id: IdPasso
  titolo: string
  /** Una riga corta. */
  breve: string
  /** Dietro il «?». */
  spiega: string
  /** Byte che libera, in stima. */
  stima: number
  /** La stima è approssimata (le versioni). */
  circa: boolean
  /** Libera spazio subito (se no, dopo «Svuota il recupero»). */
  liberaSubito: boolean
  /** Si può annullare dopo. */
  annullabile: boolean
  azione: AzionePasso
  /** Il tipo di pulizia per `pulisci`. */
  tipo?: string
  bottone: string
  /** La frase della conferma. */
  conferma: string
}

export type RigaPasso = Passo & { stato: StatoPasso; motivo?: string; prima?: number; dopo?: number; inSospeso?: boolean }

export type EsitoPasso = {
  stato: StatoPasso
  motivo?: string
  /** Byte di SierraDeck sul Drive prima e dopo il passo. */
  prima?: number
  dopo?: number
  inSospeso?: boolean
  /** Dopo «Conta»: le versioni sono state contate. */
  contate?: boolean
}

/** Quello che il PC e la pagina ricordano di un passo già toccato. */
export type EsitoMemoria = EsitoPasso & { passo: Passo }

/** Le pulizie annotate in locale e non ancora complete. */
export type InSospesoVista = { id: string; titolo: string; recupero: RecuperoDrivePieno; file: number; byte: number; fatto: { file: boolean; indice: boolean; registro: boolean } }

/** Quello che serve per muoversi: lo stesso sul PC (IPC) e sul telefono (rotte). */
export type ApiLiberaSpazio = {
  stato: (forza: boolean) => Promise<StatoSpazio | undefined>
  quota: (forza: boolean) => Promise<QuotaMisurata | undefined>
  azione: (corpo: { azione: string; tipo?: string; id?: string; recupero?: RecuperoDrivePieno }) => Promise<{ ok: boolean; messaggio: string; inSospeso?: boolean }>
}

export type OpzioniPassi = {
  /** Le versioni sono state contate in questa procedura. */
  contate: boolean
  /** Il Drive è pieno adesso. */
  drivePieno: boolean
  /** La scelta per le pulizie a Drive pieno (`RECUPERO_DRIVE_PIENO_DEFAULT`). */
  recupero: RecuperoDrivePieno
}

/** 0-100 con un decimale; `undefined` se il limite non si sa. */
export function percentualeDrive(q: QuotaMisurata | undefined): number | undefined {
  if (q === undefined) return undefined
  const p = q.percentuale ?? (q.limite !== undefined && q.limite > 0 ? Math.round((q.usato / q.limite) * 1000) / 10 : undefined)
  if (p === undefined) return undefined
  return Math.max(0, Math.min(100, p))
}

/** Il Drive è pieno: lo dice il programma (`segnalato`) o la quota. */
export function drivePienoDa(q: QuotaMisurata | undefined, segnalato?: boolean): boolean {
  if (segnalato === true) return true
  const p = percentualeDrive(q)
  return p !== undefined && p >= 99.5
}

/** Quanto è di SierraDeck e quanto è di tutto il resto (Gmail, Foto, file visibili). */
export function ripartizioneDrive(q: QuotaMisurata): {
  usato: number
  sierraDeck: number
  fuori: number
  percSierraDeck: number
  percFuori: number
  nelDrive?: number
  nelCestino?: number
} {
  const fuori = Math.max(0, q.usato - q.sierraDeck.byte)
  const base = Math.max(1, q.usato)
  const percSierraDeck = Math.min(100, Math.round((q.sierraDeck.byte / base) * 1000) / 10)
  return {
    usato: q.usato,
    sierraDeck: q.sierraDeck.byte,
    fuori,
    percSierraDeck,
    percFuori: Math.max(0, Math.round((100 - percSierraDeck) * 10) / 10),
    ...(q.usatoNelDrive !== undefined ? { nelDrive: q.usatoNelDrive } : {}),
    ...(q.nelCestino !== undefined ? { nelCestino: q.nelCestino } : {})
  }
}

/** Il grosso dello spazio è fuori da SierraDeck: le pulizie qui servirebbero a poco. */
export function grossoFuoriDaSierraDeck(q: QuotaMisurata | undefined): boolean {
  if (q === undefined || q.usato <= 0) return false
  return q.sierraDeck.byte * 2 < q.usato
}

export const FRASE_GROSSO_FUORI = 'Il grosso è fuori da SierraDeck: Gmail, Foto o altri file del tuo Drive. Da qui non si toccano.'

/** I passi di adesso, nell'ordine in cui conviene farli. Solo quelli che hanno qualcosa da fare. */
export function passiDa(stato: StatoSpazio | undefined, o: OpzioniPassi): Passo[] {
  if (stato === undefined) return []
  const proposta = (tipo: string): Proposta | undefined => stato.proposte.find((p) => p.tipo === tipo && p.voci.length > 0)
  // A Drive pieno con «salta» le pulizie cancellano subito dal Drive (libera spazio, non si annulla);
  // altrimenti vanno nel recupero per 30 giorni (si annullano, ma liberano solo quando il recupero si svuota).
  const subito = o.drivePieno && o.recupero === 'salta'
  const passi: Passo[] = []

  const ver = stato.proposte.find((p) => p.tipo === 'versioni')
  if (ver !== undefined) {
    passi.push({
      id: 'versioni', titolo: 'Versioni vecchie',
      breve: `${ver.versioni ?? 0} versioni vecchie dei file`,
      spiega: 'Google Drive tiene le versioni vecchie di ogni file e le conta nello spazio. Qui se ne tengono poche per file e le altre si cancellano. Si cancellano per sempre: non c’è recupero. Le versioni si rileggono file per file subito prima di cancellare.',
      stima: ver.byte, circa: true, liberaSubito: true, annullabile: false, azione: 'togli',
      bottone: 'Togli le versioni',
      conferma: 'Si cancellano per sempre. Non si può annullare.'
    })
  } else if (!o.contate) {
    passi.push({
      id: 'versioni', titolo: 'Versioni vecchie',
      breve: 'Prima si contano. Può durare qualche minuto.',
      spiega: 'Google Drive tiene le versioni vecchie di ogni file e le conta nello spazio. Per sapere quante sono serve una richiesta per file: per questo si contano solo adesso, a richiesta. Contare non cancella niente.',
      stima: 0, circa: true, liberaSubito: true, annullabile: false, azione: 'conta',
      bottone: 'Conta le versioni',
      conferma: 'Conta soltanto: non cancella niente.'
    })
  }

  const chat = stato.chatNonUsate
  if (chat !== undefined && chat.voci.length > 0) {
    passi.push({
      id: 'chat-non-usate', titolo: 'Chat non usate',
      breve: chat.breve,
      spiega: subito
        ? 'Chat ferme da più di 30 giorni, di cui un PC ha la copia intera. Qui si cancella la copia sul Drive; sul PC resta tutta. Se la chat torna a essere usata, risale da sola. A Drive pieno il recupero di 30 giorni non libera niente: la copia sul Drive si cancella subito e non si annulla.'
        : 'Chat ferme da più di 30 giorni, di cui un PC ha la copia intera. Qui si toglie la copia sul Drive; sul PC resta tutta. Vanno nel recupero per 30 giorni e «Annulla» le rimette; lo spazio si libera col passo «Svuota il recupero». Se la chat torna a essere usata, risale da sola.',
      stima: chat.byte, circa: false, liberaSubito: subito, annullabile: !subito, azione: 'pulisci', tipo: 'chat-non-usate',
      bottone: subito ? 'Togli dal Drive' : 'Metti nel recupero',
      conferma: subito ? 'Si cancellano dal Drive. Sul PC restano. Non si annulla.' : 'Vanno nel recupero per 30 giorni. Si annulla.'
    })
  }

  for (const tipo of ['doppie', 'doppioni-nome'] as const) {
    const p = proposta(tipo)
    if (p === undefined) continue
    passi.push({
      id: tipo, titolo: p.titolo, breve: p.breve,
      spiega: subito ? `${p.spiega} A Drive pieno si cancellano subito dal Drive e non si annullano.` : p.spiega,
      stima: p.byte, circa: false, liberaSubito: subito, annullabile: !subito, azione: 'pulisci', tipo,
      bottone: subito ? 'Cancella dal Drive' : 'Metti nel recupero',
      conferma: subito ? 'Si cancellano dal Drive. Non si annulla.' : 'Vanno nel recupero per 30 giorni. Si annulla.'
    })
  }

  const scaduto = proposta('recupero-scaduto')
  const nelRecupero = stato.misura?.inRecupero.byte ?? 0
  const totale = (scaduto?.byte ?? 0) + nelRecupero
  if (totale > 0) {
    passi.push({
      id: 'recupero', titolo: 'Svuota il recupero',
      breve: 'Cancella adesso quello che aspetta nel recupero.',
      spiega: 'Quello che hai tolto con le pulizie resta 30 giorni nel recupero, e in quei giorni occupa ancora spazio. Qui si cancella adesso, compresi i vecchi file di recupero e le copie di sicurezza scadute. Dopo non si annulla più.',
      stima: totale, circa: false, liberaSubito: true, annullabile: false, azione: 'svuota',
      bottone: 'Svuota adesso',
      conferma: 'Si cancella tutto il recupero. Non si annulla.'
    })
  }
  return passi
}

/**
 * Le righe da mostrare: i passi di adesso, più quelli già toccati (fatti,
 * saltati, in errore) anche se ormai non hanno più niente da fare. Nell'ordine dei passi.
 */
export function righeDa(passi: Passo[], memoria: Record<string, EsitoMemoria | undefined>): RigaPasso[] {
  const ordine = ['versioni', 'chat-non-usate', 'doppie', 'doppioni-nome', 'recupero']
  const righe: RigaPasso[] = []
  for (const id of ordine) {
    const attuale = passi.find((p) => p.id === id)
    const m = memoria[id]
    if (m !== undefined && m.stato !== 'da-fare') {
      const { passo, ...esito } = m
      // Un errore si può riprovare: il passo è quello di adesso, se c'è ancora.
      righe.push({ ...(m.stato === 'errore' && attuale !== undefined ? attuale : passo), ...esito })
    } else if (attuale !== undefined) righe.push({ ...attuale, stato: 'da-fare' })
  }
  return righe
}

/** La riga in fondo: da quanto a quanto, e se resta qualcosa in sospeso. */
export function riepilogoFinale(iniziale: QuotaMisurata | undefined, finale: QuotaMisurata | undefined, inSospeso: number): {
  prima?: number
  dopo?: number
  liberatiSierraDeck?: number
  inSospeso: number
  riprova: boolean
} {
  const prima = percentualeDrive(iniziale)
  const dopo = percentualeDrive(finale)
  return {
    ...(prima !== undefined ? { prima } : {}),
    ...(dopo !== undefined ? { dopo } : {}),
    ...(iniziale !== undefined && finale !== undefined ? { liberatiSierraDeck: Math.max(0, iniziale.sierraDeck.byte - finale.sierraDeck.byte) } : {}),
    inSospeso,
    riprova: inSospeso > 0
  }
}

/**
 * Esegue un passo e dice com'è andata. Mai un'eccezione: un errore diventa
 * `stato: 'errore'` con il motivo. `prima` e `dopo` sono i byte di SierraDeck
 * sul Drive, misurati di nuovo.
 */
export async function eseguiPasso(passo: Passo, api: ApiLiberaSpazio, opzioni: { recupero: RecuperoDrivePieno }): Promise<EsitoPasso> {
  // Il Drive che dice «non c'è più niente da fare» non è un errore: il passo è saltato.
  const NIENTE_DA_FARE = /niente da (pulire|togliere|svuotare)|non c.è niente/i
  const byteDi = (q: QuotaMisurata | undefined): number | undefined => (q === undefined ? undefined : q.sierraDeck.byte)
  const finale = (r: { ok: boolean; messaggio: string }): EsitoPasso | undefined => {
    if (r.ok) return undefined
    return NIENTE_DA_FARE.test(r.messaggio) ? { stato: 'saltato', motivo: r.messaggio } : { stato: 'errore', motivo: r.messaggio }
  }
  try {
    if (passo.azione === 'conta') {
      const r = await api.azione({ azione: 'spazio-versioni-conta' })
      if (!r.ok) return { stato: 'errore', motivo: r.messaggio }
      const st = await api.stato(true)
      const trovate = st?.proposte.find((p) => p.tipo === 'versioni')
      return trovate === undefined ? { stato: 'saltato', motivo: 'Niente da togliere.', contate: true } : { stato: 'da-fare', motivo: r.messaggio, contate: true }
    }
    const prima = byteDi(await api.quota(true))
    let inSospeso = false
    let messaggio = ''
    if (passo.azione === 'togli') {
      const r = await api.azione({ azione: 'spazio-versioni-libera' })
      const f = finale(r)
      if (f !== undefined) return f
      messaggio = r.messaggio
    } else if (passo.azione === 'pulisci') {
      const r = await api.azione({ azione: 'spazio-pulisci', ...(passo.tipo !== undefined ? { tipo: passo.tipo } : {}), recupero: opzioni.recupero })
      const f = finale(r)
      if (f !== undefined) return f
      inSospeso = r.inSospeso === true
      messaggio = r.messaggio
    } else {
      // Il recupero scaduto va prima nel recupero (o si cancella, a Drive pieno), poi si svuota tutto.
      const st = await api.stato(true)
      if (st?.proposte.some((p) => p.tipo === 'recupero-scaduto' && p.voci.length > 0) === true) {
        const r = await api.azione({ azione: 'spazio-pulisci', tipo: 'recupero-scaduto', recupero: opzioni.recupero })
        if (!r.ok && !NIENTE_DA_FARE.test(r.messaggio)) return { stato: 'errore', motivo: r.messaggio }
        inSospeso = r.inSospeso === true
      }
      const st2 = await api.stato(true)
      const attive = (st2?.pulizie ?? []).filter((p: Pulizia) => p.annullataIl === undefined && p.svuotataIl === undefined)
      const errori: string[] = []
      for (const p of attive) {
        const r = await api.azione({ azione: 'spazio-svuota', id: p.id })
        if (!r.ok) errori.push(r.messaggio)
      }
      if (errori.length > 0) return { stato: 'errore', motivo: errori[0] as string }
      messaggio = attive.length === 0 ? 'Niente da svuotare.' : `Svuotate ${attive.length} ${attive.length === 1 ? 'pulizia' : 'pulizie'}.`
    }
    const dopo = byteDi(await api.quota(true))
    return {
      stato: 'fatto', motivo: messaggio,
      ...(prima !== undefined ? { prima } : {}),
      ...(dopo !== undefined ? { dopo } : {}),
      ...(inSospeso ? { inSospeso: true } : {})
    }
  } catch (e) {
    return { stato: 'errore', motivo: e instanceof Error ? e.message : String(e) }
  }
}
