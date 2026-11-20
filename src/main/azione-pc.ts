import { execFile } from 'node:child_process'
import { createConnection } from 'node:net'
import { haCapacita, type CapacitaPc } from '@shared/capacita-pc'
import {
  capacitaRichiesta, motivoSenzaCapacita, risultatoValido, ROTTA_AZIONE, validaAzione,
  type RisultatoAzione, type ValoreMandaFile, type ValoreRaggiungibile, type ValoreVersioneProgramma
} from '@shared/azione-pc'
import { ErroreRemoto, type ClientPcRemoto } from './pc-remoto'

/**
 * Le azioni singole fra PC (k-166n3), sul canale che c'è già (`/api/azione` sulle
 * rotte del Client, con la firma e la chiave di casa di `pc-remoto.ts`): niente
 * porte nuove, niente shell. Qui l'esecutore di chi riceve e la funzione di chi chiede.
 */

/** Cosa sa fare davvero questo PC; ogni voce è iniettabile (i test non lanciano niente). */
export type EsecutoriAzione = {
  versioneProgramma: (programma: string) => Promise<RisultatoAzione<ValoreVersioneProgramma>>
  raggiungibile: (host: string, porta: number) => Promise<RisultatoAzione<ValoreRaggiungibile>>
  /** Mette il file in coda verso il telefono (sempre con la conferma di chi sta a questo PC). */
  mandaFileTelefono?: (percorso: string) => Promise<RisultatoAzione<ValoreMandaFile>>
}

export type DipendenzeEsecutore = {
  /** Le capacità di questo PC: senza, un'azione che le richiede si rifiuta. */
  capacita: () => CapacitaPc | undefined
  esecutori: EsecutoriAzione
}

/** Esegue l'azione se è valida e se questo PC ha la capacità; mai un'eccezione. */
export async function eseguiAzionePc(x: unknown, d: DipendenzeEsecutore): Promise<RisultatoAzione> {
  const v = validaAzione(x)
  if (!v.ok) return { ok: false, motivo: v.motivo }
  const a = v.azione
  let cap: CapacitaPc | undefined
  try { cap = d.capacita() } catch { cap = undefined }
  if (a.tipo === 'stato-programma') {
    if (cap === undefined) return { ok: false, motivo: 'Questo PC non sa ancora dire cosa ha installato: riprova fra poco.' }
    return { ok: true, valore: { installato: haCapacita(cap, a.programma) === 'si' } }
  }
  const richiesta = capacitaRichiesta(a)
  if (richiesta !== undefined) {
    const h = haCapacita(cap, richiesta)
    if (h === 'sconosciuto') return { ok: false, motivo: 'Questo PC non sa ancora dire cosa sa fare: riprova fra poco.' }
    if (h === 'no') return { ok: false, motivo: motivoSenzaCapacita(a, richiesta) }
  }
  try {
    switch (a.tipo) {
      case 'versione-programma': return await d.esecutori.versioneProgramma(a.programma)
      case 'raggiungibile': return await d.esecutori.raggiungibile(a.host, a.porta)
      case 'manda-file-telefono':
        return d.esecutori.mandaFileTelefono === undefined
          ? { ok: false, motivo: 'Questo PC non può ancora mandare file al telefono su richiesta di un altro PC.' }
          : await d.esecutori.mandaFileTelefono(a.percorso)
    }
  } catch (err) {
    return { ok: false, motivo: `L’azione è fallita: ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}` }
  }
}

/** La rotta di chi riceve: `undefined` se non è `/api/azione`. */
export async function rispondiAzione(
  r: { metodo: string; percorso: string; corpo: unknown }, d: DipendenzeEsecutore | undefined
): Promise<{ stato: number; corpo: unknown } | undefined> {
  if (r.percorso !== ROTTA_AZIONE) return undefined
  if (r.metodo !== 'POST') return { stato: 405, corpo: { errore: 'solo POST' } }
  if (d === undefined) return { stato: 404, corpo: { errore: 'questo PC non esegue azioni per gli altri' } }
  return { stato: 200, corpo: await eseguiAzionePc(r.corpo, d) }
}

export const SCADENZA_AZIONE_PREDEFINITA_MS = 20_000

export type OpzioniChiedi = {
  /** Dopo quanto si rinuncia. */
  scadenzaMs?: number
  /** Le capacità che quel PC ha detto nel battito: se dice «no» non si disturba nemmeno. */
  capacitaDi?: CapacitaPc | undefined
}

/**
 * Chiede a un altro PC UNA azione e aspetta il risultato, con una scadenza.
 * Mai un'eccezione: `{ ok, valore } | { ok: false, motivo }`.
 */
export async function chiediAzionePc(
  client: Pick<ClientPcRemoto, 'chiama'>, pcId: string, azione: unknown, opz: OpzioniChiedi = {}
): Promise<RisultatoAzione> {
  const v = validaAzione(azione)
  if (!v.ok) return { ok: false, motivo: v.motivo }
  const richiesta = capacitaRichiesta(v.azione)
  if (richiesta !== undefined && opz.capacitaDi !== undefined && haCapacita(opz.capacitaDi, richiesta) === 'no') {
    return { ok: false, motivo: motivoSenzaCapacita(v.azione, richiesta) }
  }
  const scadenzaMs = opz.scadenzaMs ?? SCADENZA_AZIONE_PREDEFINITA_MS
  let timer: ReturnType<typeof setTimeout> | undefined
  const scaduta = new Promise<RisultatoAzione>((ris) => {
    timer = setTimeout(() => ris({ ok: false, motivo: `Quel PC non ha risposto entro ${Math.max(1, Math.round(scadenzaMs / 1000))} secondi: l’azione potrebbe non essere stata eseguita.` }), scadenzaMs)
  })
  const chiamata = client.chiama(pcId, ROTTA_AZIONE, v.azione).then(risultatoValido, (err: unknown): RisultatoAzione => ({
    ok: false, motivo: err instanceof ErroreRemoto ? err.message : `Non sono riuscito a parlare con quel PC: ${err instanceof Error ? err.message : String(err)}`
  }))
  try { return await Promise.race([chiamata, scaduta]) } finally { if (timer !== undefined) clearTimeout(timer) }
}

/** Il parametro che fa stampare la versione, per programma (default `--version`). */
const OPZIONE_VERSIONE: Readonly<Record<string, string>> = { java: '-version', adb: 'version' }

type LanciaFn = (file: string, args: string[], opz: { timeout: number; windowsHide: boolean }, cb: (err: Error | null, out: string, errOut: string) => void) => void

/** Gli esecutori veri: un programma dell'elenco con UN argomento fisso (niente shell), e una connessione TCP. */
export function creaEsecutoriLocali(d: { lancia?: LanciaFn; connetti?: typeof createConnection; adesso?: () => number; scadenzaMs?: number } = {}): Pick<EsecutoriAzione, 'versioneProgramma' | 'raggiungibile'> {
  const lancia: LanciaFn = d.lancia ?? ((f, a, o, cb) => { execFile(f, a, o, (e, so, se) => cb(e, String(so), String(se))) })
  const connetti = d.connetti ?? createConnection
  const adesso = d.adesso ?? ((): number => Date.now())
  const scadenza = d.scadenzaMs ?? 4000
  return {
    versioneProgramma: (programma) => new Promise((ris) => {
      lancia(programma, [OPZIONE_VERSIONE[programma] ?? '--version'], { timeout: scadenza, windowsHide: true }, (err, out, errOut) => {
        const riga = `${out}\n${errOut}`.split(/\r?\n/u).map((r) => r.trim()).find((r) => r !== '')
        if (err !== null && riga === undefined) return ris({ ok: false, motivo: `Non sono riuscito a lanciare «${programma}» per chiedergli la versione.` })
        ris(riga === undefined ? { ok: false, motivo: `«${programma}» non ha detto la sua versione.` } : { ok: true, valore: { versione: riga.slice(0, 200) } })
      })
    }),
    raggiungibile: (host, porta) => new Promise((ris) => {
      const da = adesso()
      let fatto = false
      const s = connetti({ host, port: porta })
      const fine = (raggiungibile: boolean): void => {
        if (fatto) return
        fatto = true
        s.destroy()
        ris({ ok: true, valore: { raggiungibile, ms: adesso() - da } })
      }
      s.setTimeout(scadenza, () => fine(false))
      s.once('connect', () => fine(true))
      s.once('error', () => fine(false))
    })
  }
}
