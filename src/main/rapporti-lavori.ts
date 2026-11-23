import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { dopoFallimento, quantoAspettare, type AttesaInvio } from '@shared/attesa-invio'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import { cartellaMittente } from '@shared/storico-errori'
import { BYTE_RAPPORTO, contaLavori, eVuoto, idRapporto, rapportoPerLInvio, type RapportoLavori } from '@shared/rapporto-lavori'

/**
 * I rapporti dei lavori verso il PC di riferimento (k-193a). Stesso canale e
 * stesse garanzie dell'invio degli errori (`errori-invio-automatico.ts`,
 * `errori-arrivati.ts`): lo stesso PC di riferimento (`pcSviluppoDi`), la
 * posta del Drive se è spento, l'attesa crescente dopo un fallimento, il tetto
 * di peso, la ripresa da dove si era arrivati e mai due volte lo stesso rapporto.
 *
 * Sul PC di riferimento i rapporti stanno in
 * `<cartella di SierraDeck>/.sierradeck/rapporti-lavori-arrivati/<mittente>/<giorno>.json`,
 * accanto a `errori-arrivati`, e `leggiRapportiArrivati` li dà al compito che li analizza.
 */

export const CARTELLA_RAPPORTI = join('.sierradeck', 'rapporti-lavori-arrivati')
/** Un rapporto al più ogni mezz'ora (lo stesso rapporto cumula tutto quello che è successo nel frattempo). */
export const INTERVALLO_RAPPORTO_MS = 30 * 60_000
export const GIRO_RAPPORTO_MS = 60_000

export type StatoRapporto = {
  /** Fino a questa riga di registro (ISO, inclusa) i lavori sono già stati mandati. */
  fino?: string
  /** Quando è partito l'ultimo rapporto riuscito. */
  il?: string
}

type FileGiorno = { da: string; giorno: string; rapporti: RapportoLavori[] }

/** Sul PC di riferimento: aggiunge il rapporto al file del suo mittente e giorno; lo stesso rapporto due volte non si somma. */
export function salvaRapportoArrivato(radice: string, rapporto: RapportoLavori): { ok: true; file: string; doppio: boolean } | { ok: false; errore: string } {
  const cartella = join(radice, CARTELLA_RAPPORTI, cartellaMittente(rapporto.da))
  const file = join(cartella, `${rapporto.giorno}.json`)
  try {
    mkdirSync(cartella, { recursive: true })
    let dentro: FileGiorno = { da: rapporto.da, giorno: rapporto.giorno, rapporti: [] }
    if (existsSync(file)) {
      try {
        const letto = JSON.parse(readFileSync(file, 'utf8')) as Partial<FileGiorno>
        if (Array.isArray(letto.rapporti)) dentro = { da: rapporto.da, giorno: rapporto.giorno, rapporti: letto.rapporti }
      } catch { /* file rotto: si riparte da uno nuovo */ }
    }
    if (dentro.rapporti.some((r) => idRapporto(r) === idRapporto(rapporto))) return { ok: true, file, doppio: true }
    dentro.rapporti = [...dentro.rapporti, rapporto].sort((a, b) => (a.al < b.al ? -1 : a.al > b.al ? 1 : 0))
    scriviJsonAtomico(file, dentro, 'rapporti-lavori')
    return { ok: true, file, doppio: false }
  } catch (err) {
    return { ok: false, errore: `Non riesco a salvare il rapporto dei lavori: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/** Per il compito che analizza: i rapporti arrivati (di un PC e/o di un giorno), dal più vecchio. */
export function leggiRapportiArrivati(radice: string, filtro: { da?: string; giorno?: string } = {}): RapportoLavori[] {
  const base = join(radice, CARTELLA_RAPPORTI)
  const fuori: RapportoLavori[] = []
  let mittenti: string[] = []
  try { mittenti = readdirSync(base) } catch { return [] }
  for (const m of mittenti) {
    if (filtro.da !== undefined && m !== cartellaMittente(filtro.da)) continue
    let giorni: string[] = []
    try { giorni = readdirSync(join(base, m)) } catch { continue }
    for (const g of giorni.sort()) {
      if (!g.endsWith('.json') || (filtro.giorno !== undefined && g !== `${filtro.giorno}.json`)) continue
      try {
        const letto = JSON.parse(readFileSync(join(base, m, g), 'utf8')) as Partial<FileGiorno>
        if (Array.isArray(letto.rapporti)) fuori.push(...letto.rapporti)
      } catch { /* file rotto: si salta */ }
    }
  }
  return fuori.sort((a, b) => (a.al < b.al ? -1 : a.al > b.al ? 1 : 0))
}

/** Dal lato di chi manda: al PC di riferimento, o nella posta del Drive se non risponde, o qui se è questo. */
export async function mandaRapporto(p: {
  pcRiferimento: string | undefined
  io: { id: string; nome: string }
  rapporto: RapportoLavori
  nomeDi: (pcId: string) => string | undefined
  chiama: (pcId: string, percorso: string, corpo: RapportoLavori) => Promise<unknown>
  salvaQui: (r: RapportoLavori) => { ok: true; file: string } | { ok: false; errore: string }
  perPosta?: (pcId: string, r: RapportoLavori, err: unknown) => Promise<boolean>
  log: (riga: string) => void
}): Promise<{ ok: boolean; messaggio: string }> {
  if (p.pcRiferimento === undefined) return { ok: false, messaggio: 'Prima scegli il PC di sviluppo.' }
  const rapporto = rapportoPerLInvio(p.rapporto, BYTE_RAPPORTO)
  if (p.pcRiferimento === p.io.id) {
    const e = p.salvaQui(rapporto)
    return e.ok ? { ok: true, messaggio: 'Rapporto dei lavori salvato su questo PC.' } : { ok: false, messaggio: e.errore }
  }
  const chiamato = p.nomeDi(p.pcRiferimento) ?? 'il PC di riferimento'
  try {
    await p.chiama(p.pcRiferimento, '/api/rapporti/arrivati', rapporto)
    p.log(`[rapporti] rapporto dei lavori mandato a ${chiamato}`)
    return { ok: true, messaggio: `Rapporto dei lavori mandato a ${chiamato}.` }
  } catch (err) {
    const perche = err instanceof Error ? err.message : String(err)
    if (p.perPosta !== undefined && await p.perPosta(p.pcRiferimento, rapporto, err).catch(() => false)) {
      p.log(`[rapporti] ${chiamato} non risponde (${perche}): rapporto lasciato sul Drive`)
      return { ok: true, messaggio: `${chiamato} adesso non risponde: rapporto lasciato sul Drive, arriva appena si accende.` }
    }
    return { ok: false, messaggio: `Rapporto non mandato a ${chiamato}: ${perche}` }
  }
}

/**
 * Un giro: legge le righe dei registri dopo l'ultimo invio, le conta, manda,
 * segna. Il primo giro parte da adesso meno un giorno. Se non è successo niente
 * non manda niente; se l'invio non riesce non segna e riprova (stesse righe)
 * con l'attesa crescente. `forza` salta le attese.
 */
export async function giroRapportoLavori(d: {
  /** Le righe dei registri dal giorno dato (AAAA-MM-GG) in poi. */
  righe: (dalGiorno: string) => string[]
  stato: { leggi: () => StatoRapporto | undefined; scrivi: (s: StatoRapporto) => void }
  pcRiferimento: () => string | undefined
  adesso: () => number
  da: () => string
  versione: string
  manda: (r: RapportoLavori) => Promise<{ ok: boolean; messaggio: string }>
  log: (riga: string) => void
  fallimento?: { leggi: () => string | undefined; scrivi: (motivo: string | undefined) => void }
  attesa?: { leggi: () => AttesaInvio | undefined; scrivi: (a: AttesaInvio | undefined) => void }
  forza?: boolean
}): Promise<{ ok: boolean; messaggio: string }> {
  const adesso = d.adesso()
  if (d.pcRiferimento() === undefined) return { ok: false, messaggio: 'Prima scegli il PC di sviluppo.' }
  let stato = d.stato.leggi()
  if (stato === undefined) {
    stato = { fino: new Date(adesso - 86_400_000).toISOString() }
    d.stato.scrivi(stato)
  }
  if (d.forza !== true) {
    if (quantoAspettare(d.attesa?.leggi(), adesso) > 0) return { ok: true, messaggio: 'Dopo un invio fallito aspetto un po’ prima di riprovare.' }
    if (stato.il !== undefined && adesso - Date.parse(stato.il) < INTERVALLO_RAPPORTO_MS) return { ok: true, messaggio: 'L’ultimo rapporto è troppo recente.' }
  }
  const dalGiorno = (stato.fino ?? new Date(adesso - 86_400_000).toISOString()).slice(0, 10)
  const c = contaLavori(d.righe(dalGiorno), stato.fino)
  if (c.ultima === undefined || c.righe === 0 || Object.values(c.workspace).every(eVuoto)) {
    // Righe nuove ma nessuna che conta: si va avanti da lì, senza mandare niente.
    if (c.ultima !== undefined) d.stato.scrivi({ ...stato, fino: c.ultima })
    return { ok: false, messaggio: 'Non c’è niente di nuovo da riferire.' }
  }
  const rapporto: RapportoLavori = {
    da: d.da(),
    versione: d.versione,
    giorno: c.ultima.slice(0, 10),
    dal: stato.fino ?? new Date(adesso - 86_400_000).toISOString(),
    al: c.ultima,
    workspace: c.workspace
  }
  const e = await d.manda(rapporto)
  if (!e.ok) {
    d.attesa?.scrivi(dopoFallimento(d.attesa.leggi(), e.messaggio, adesso))
    if (d.fallimento === undefined || d.fallimento.leggi() !== e.messaggio) {
      d.fallimento?.scrivi(e.messaggio)
      d.log(`[rapporti] invio del rapporto dei lavori non riuscito, riprovo (non lo ripeto finche' il motivo e' lo stesso): ${e.messaggio}`)
    }
    return { ok: false, messaggio: e.messaggio }
  }
  if (d.attesa?.leggi() !== undefined) d.attesa.scrivi(undefined)
  if (d.fallimento?.leggi() !== undefined) { d.fallimento.scrivi(undefined); d.log('[rapporti] invio dei rapporti ripreso') }
  d.stato.scrivi({ fino: c.ultima, il: new Date(adesso).toISOString() })
  d.log(`[rapporti] rapporto dei lavori: ${e.messaggio}`)
  return { ok: true, messaggio: e.messaggio }
}

/** Le righe dei registri (`sierradeck-AAAA-MM-GG.log`) dal giorno dato in poi. */
export function righeDeiRegistri(cartella: string, dalGiorno: string): string[] {
  let nomi: string[] = []
  try { nomi = readdirSync(cartella) } catch { return [] }
  const fuori: string[] = []
  for (const n of nomi.sort()) {
    const m = /^sierradeck-(\d{4}-\d{2}-\d{2})\.log$/.exec(n)
    if (m?.[1] === undefined || m[1] < dalGiorno) continue
    try { fuori.push(...readFileSync(join(cartella, n), 'utf8').split('\n')) } catch { /* illeggibile: si salta */ }
  }
  return fuori
}
