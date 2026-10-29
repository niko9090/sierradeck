import type { Autopilota, Criterio } from '@shared/autopilota'
import { vagliaCriteri } from '@shared/controllo-comandi'
import { chiaveCompito } from '@shared/segnali-flotta'
import { giornoDi, RICHIESTE_MAX, statoRichiesta, TESTO_MAX, type RichiestaNicholas } from '@shared/richieste-nicholas'

/**
 * La registrazione delle richieste di Nicholas dal dialogo (0.85.0).
 *
 * Il supervisore, nella risposta del dialogo, dice quali richieste ci sono
 * nel messaggio (`richieste`: titolo, criterio, compiti). Il programma non si
 * fida della sua memoria: se il supervisore non ne dice nessuna ma il
 * messaggio **chiede** qualcosa (una frase che non è una domanda, con un verbo
 * che chiede: «correggi», «controlla», «devi», «voglio»…), la richiesta si
 * registra lo stesso, con un criterio scritto dalle sue parole. Così non resta
 * più fuori dalla coda come il 23/10 alle 07:25.
 *
 * Una domanda («a che punto siamo?»), un «sì», un «fermati» o la risposta a
 * una domanda aperta non diventano obiettivi.
 *
 * Tutto puro: il server mette insieme i pezzi.
 */

/** Quello che il supervisore propone per una richiesta, già letto. */
export type RichiestaProposta = {
  titolo: string
  criterio: { descrizione: string; comando?: string }
  compiti: string[]
}

/**
 * I verbi con cui Nicholas chiede. Radici: prendono anche «saltala»,
 * «correggilo», «toglili», «trovare».
 */
const CHIEDE = /(?:^|[^\p{L}])(correggi|controlla|verifica|sistema|togli|aggiungi|fai\b|rifai|pubblica|metti|cambia|sposta|crea|scrivi|prepara|unisci|rendi|mostra|trova|salta|aggiorna|ricorda|lascia|chiudi|riapri|elimina|cancella|blocca|evita|impedisci|separa|dividi|devi\b|dovete|dobbiamo|deve\b|devono|voglio|vorrei|bisogna|occorre|serve che|non (?:voglio|devi|deve) pi[uù]|mai pi[uù])/iu

/** Le parole che da sole sono una risposta, non una richiesta. */
const SOLO_RISPOSTA = /^(s[iì]|no|ok|okay|va bene|vai|certo|d'accordo|perfetto|grazie|esatto|giusto)[\s.!]*$/iu

/**
 * Il messaggio chiede qualcosa? Si guardano solo le frasi che **non** finiscono
 * con «?»: «hai sistemato anche gli obiettivi?» è una domanda, «controlla anche
 * questo» una richiesta.
 */
export function sembraRichiesta(testo: string): boolean {
  const t = testo.replace(/^\s*Hai risposto:\s*/iu, '').trim()
  if (t === '' || SOLO_RISPOSTA.test(t)) return false
  const frasi = t.split(/(?<=[.!?\n])\s+|\n+/u).map((f) => f.trim()).filter((f) => f !== '')
  return frasi.some((f) => !/\?\s*$/u.test(f) && CHIEDE.test(f))
}

function testo(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
}

/** Le richieste dal JSON del dialogo. Una senza titolo o senza criterio non entra. */
export function leggiRichiesteProposte(raw: unknown): RichiestaProposta[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((v: unknown): RichiestaProposta[] => {
    if (typeof v !== 'object' || v === null) return []
    const o = v as Record<string, unknown>
    const titolo = testo(o.titolo)
    const c = typeof o.criterio === 'object' && o.criterio !== null ? (o.criterio as Record<string, unknown>) : undefined
    const descrizione = testo(c?.descrizione) ?? testo(o.criterio)
    if (titolo === undefined || descrizione === undefined) return []
    const comando = testo(c?.comando)
    const compiti = Array.isArray(o.compiti) ? o.compiti.flatMap((x) => (testo(x) !== undefined ? [testo(x) as string] : [])) : []
    return [{
      titolo,
      criterio: { descrizione, ...(comando !== undefined && !comando.includes('\n') ? { comando } : {}) },
      compiti
    }]
  })
}

/** Le sue parole in una riga, senza il «Hai risposto: …» davanti. */
function paroleSue(t: string): string {
  return t.replace(/^\s*Hai risposto:\s*/iu, '').replace(/\s+/gu, ' ').trim()
}

/**
 * La richiesta scritta dal programma quando il supervisore non l'ha detta:
 * il criterio lo giudica il supervisore (senza comando), con le sue parole.
 */
export function richiestaDalleParole(t: string, quando: string): RichiestaProposta {
  const parole = paroleSue(t)
  const titolo = parole.length <= 120 ? parole : `${parole.slice(0, 119).replace(/\s+\S*$/u, '')}…`
  const giorno = giornoDi(quando)
  return {
    titolo,
    // 29/10: niente «scrivi nel quaderno»: le note in un file erano 121
    // commit su 300 il 27/10. Cosa è cambiato lo dice la chat nel testo.
    criterio: { descrizione: `Richiesta di Nicholas del ${giorno}: «${titolo}» — fatta e verificata` },
    compiti: [`Richiesta di Nicholas del ${giorno}: «${parole.slice(0, TESTO_MAX)}». Falla e verificala con un test; cosa è cambiato dillo in una riga nel tuo messaggio, non in un file.`]
  }
}

/** Uguali per Nicholas: stesse parole, spazi e maiuscole a parte. */
function stesse(a: string, b: string): boolean {
  const n = (s: string): string => paroleSue(s).toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '')
  return n(a) === n(b)
}

/** Una richiesta ripetuta entro questo tempo è la stessa (il 22/10 «togli i vincoli» due volte dopo un guasto). */
const RIPETUTA_MS = 24 * 3_600_000

export type EsitoRegistrazione = {
  autopilota: Autopilota
  /** Le richieste nuove, per la riga nella conversazione e nel registro. */
  nuove: RichiestaNicholas[]
  /** I comandi dei criteri tolti perché non potevano funzionare: il criterio resta, lo giudica il supervisore. */
  comandiScartati: string[]
}

/**
 * Registra le richieste di un messaggio di Nicholas.
 *
 * - `proposte`: quelle dette dal supervisore; vuote, e il messaggio chiede
 *   qualcosa, ne scrive una il programma dalle sue parole;
 * - `compitiNuovi`: i compiti che lo stesso dialogo ha già aggiunto con un
 *   cambio: la richiesta si lega a quelli invece di metterne un doppione;
 * - `nonRichiesta`: un «fermati», «riprendi» o la risposta a una domanda
 *   aperta: niente obiettivo.
 *
 * Ogni richiesta porta un criterio nei criteri (mai vuoto) e almeno un
 * compito in coda. Una richiesta uguale a una aperta da meno di un giorno non
 * si registra due volte.
 */
export function registraRichieste(
  a: Autopilota,
  p: {
    testo: string
    quando: string
    proposte: RichiestaProposta[]
    compitiNuovi?: string[]
    /** I criteri che lo stesso dialogo ha già aggiunto con un cambio (le descrizioni). */
    criteriNuovi?: string[]
    nonRichiesta?: boolean
    esiste?: (percorso: string) => boolean
  }
): EsitoRegistrazione {
  const nulla: EsitoRegistrazione = { autopilota: a, nuove: [], comandiScartati: [] }
  if (p.nonRichiesta === true && p.proposte.length === 0) return nulla
  // Senza proposte del supervisore: dalle sue parole, ma se il cambio ha già
  // messo un criterio quello è il suo, senza un doppione.
  const dalCambio = (): RichiestaProposta => {
    const r = richiestaDalleParole(p.testo, p.quando)
    const criterio = p.criteriNuovi?.[0]
    return criterio !== undefined ? { ...r, criterio: { descrizione: criterio }, ...((p.compitiNuovi ?? []).length > 0 ? { compiti: [] } : {}) } : (p.compitiNuovi ?? []).length > 0 ? { ...r, compiti: [] } : r
  }
  const proposte = p.proposte.length > 0 ? p.proposte : sembraRichiesta(p.testo) ? [dalCambio()] : []
  if (proposte.length === 0) return nulla

  const esistenti = a.richieste ?? []
  const ora = Date.parse(p.quando)
  const ripetuta = esistenti.some((r) => stesse(r.testo, p.testo) && statoRichiesta(r, a) !== 'fatta' && Math.abs(ora - Date.parse(r.quando)) < RIPETUTA_MS)
  if (ripetuta) return nulla

  let numero = esistenti.reduce((m, r) => Math.max(m, Number(/^r-(\d+)$/.exec(r.id)?.[1] ?? 0)), 0)
  const criteri: Criterio[] = [...a.criteri]
  const compitiDaFare = [...a.compitiDaFare]
  const nuove: RichiestaNicholas[] = []
  const comandiScartati: string[] = []
  const nuoviDaLegare = [...(p.compitiNuovi ?? [])]

  for (const [i, prop] of proposte.entries()) {
    // Il criterio: un comando che non può funzionare non entra, il criterio sì.
    let criterio: { descrizione: string; comando?: string } = prop.criterio
    if (criterio.comando !== undefined && !a.criteri.some((c) => c.comando === criterio.comando)) {
      const v = vagliaCriteri([criterio], p.esiste)
      if (v.scartati.length > 0) {
        comandiScartati.push(criterio.comando)
        criterio = { descrizione: criterio.descrizione }
      }
    }
    if (!criteri.some((c) => c.descrizione === criterio.descrizione)) {
      criteri.push({ ...criterio, soddisfatto: false })
    }

    // I compiti: quelli suoi, o quelli che il cambio ha già messo; mai nessuno.
    let compiti = prop.compiti
    if (compiti.length === 0 && nuoviDaLegare.length > 0) {
      // L'ultima proposta prende tutti quelli rimasti: nessuno resta senza richiesta.
      compiti = i === proposte.length - 1 ? nuoviDaLegare.splice(0) : nuoviDaLegare.splice(0, 1)
    }
    if (compiti.length === 0) compiti = [`${prop.titolo} (richiesta di Nicholas del ${giornoDi(p.quando)}). Criterio: ${criterio.descrizione}`]
    for (const c of compiti) {
      const preso = a.chats.some((x) => x.compito === c && x.stato !== 'finita')
      if (!preso && !compitiDaFare.includes(c)) compitiDaFare.push(c)
    }

    numero += 1
    nuove.push({
      id: `r-${numero}`,
      quando: p.quando,
      testo: paroleSue(p.testo).slice(0, TESTO_MAX) || p.testo.slice(0, TESTO_MAX),
      titolo: prop.titolo,
      criterio: criterio.descrizione,
      compiti,
      da: p.proposte.length > 0 ? 'supervisore' : 'programma'
    })
  }

  return {
    autopilota: { ...a, criteri, compitiDaFare, richieste: [...esistenti, ...nuove].slice(-RICHIESTE_MAX) },
    nuove,
    comandiScartati
  }
}

/**
 * Le richieste aperte non si perdono per strada: ad ogni salvataggio il loro
 * criterio torna nei criteri se un cambio l'ha tolto, e un compito che non è
 * più in coda né in mano a nessuna chat torna in coda. Una richiesta il cui
 * criterio è soddisfatto prende la data (`fattaIl`).
 *
 * Torna lo stesso oggetto se non cambia niente.
 */
export function tieniRichieste(a: Autopilota, adesso: string): Autopilota {
  const richieste = a.richieste
  if (richieste === undefined || richieste.length === 0) return a
  let cambiato = false
  const criteri = [...a.criteri]
  const compitiDaFare = [...a.compitiDaFare]
  const nuove = richieste.map((r) => {
    if (r.fattaIl !== undefined) return r
    const c = criteri.find((x) => x.descrizione === r.criterio)
    if (c?.soddisfatto === true) {
      cambiato = true
      return { ...r, fattaIl: c.raggiuntoIl ?? adesso }
    }
    if (c === undefined) {
      criteri.push({ descrizione: r.criterio, soddisfatto: false })
      cambiato = true
    }
    for (const k of r.compiti) {
      // 29/10: un compito che una chat ha già avuto (in qualunque stato, anche
      // con le parole un po' diverse) non torna in coda: si rifaceva da capo.
      const chiave = chiaveCompito(k)
      if (!compitiDaFare.includes(k) && !a.chats.some((x) => x.compito === k || chiaveCompito(x.compito) === chiave)) {
        compitiDaFare.push(k)
        cambiato = true
      }
    }
    return r
  })
  return cambiato ? { ...a, criteri, compitiDaFare, richieste: nuove } : a
}

/**
 * La versione che contiene ogni richiesta fatta: la prima release pubblicata
 * dopo che è stata fatta. `release`: nome (`v0.85.0` o `0.85.0`) e data.
 */
export function conVersioni(a: Autopilota, release: Array<{ nome: string; il: string }>): Autopilota {
  const richieste = a.richieste
  if (richieste === undefined || !richieste.some((r) => r.fattaIl !== undefined && r.versione === undefined)) return a
  const ordinate = release
    .map((x) => ({ versione: x.nome.replace(/^v/u, ''), il: Date.parse(x.il) }))
    .filter((x) => /^\d+\.\d+\.\d+$/u.test(x.versione) && !Number.isNaN(x.il))
    .sort((x, y) => x.il - y.il)
  let cambiato = false
  const nuove = richieste.map((r) => {
    if (r.fattaIl === undefined || r.versione !== undefined) return r
    const fatta = Date.parse(r.fattaIl)
    const prima = ordinate.find((x) => x.il >= fatta)
    if (prima === undefined) return r
    cambiato = true
    return { ...r, versione: prima.versione }
  })
  return cambiato ? { ...a, richieste: nuove } : a
}

/** La riga nella conversazione per le richieste registrate. */
export function rigaRegistrate(nuove: RichiestaNicholas[]): string | undefined {
  if (nuove.length === 0) return undefined
  if (nuove.length === 1) return `richiesta registrata come obiettivo: «${nuove[0]!.titolo}»`
  return `${nuove.length} richieste registrate come obiettivi: ${nuove.map((r) => `«${r.titolo}»`).join(', ')}`
}
