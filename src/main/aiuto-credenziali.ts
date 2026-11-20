import { createCipheriv, createDecipheriv, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes, type KeyObject } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { scriviAtomico } from '@shared/scrittura-atomica'
import { cifra, decifra } from './cassaforte/cifratura'
import { CREDENZIALI_PER_LAVORO_MAX, credenzialeValida, eNomeCredenziale, type CredenzialeRete, type VoceCredenziale } from '@shared/aiuto-credenziali'

/**
 * **Le credenziali di rete, dentro la cassaforte** (20/11, k-166n4).
 *
 * 1. `creaDepositoCredenziali`: un file cifrato con la chiave-maestra della cassaforte
 *    (la stessa che apre la cassaforte sul Drive: ogni PC di Nicholas con la stessa
 *    passphrase lo apre). Niente in chiaro su disco; `elenco()` non porta mai i valori.
 * 2. `sigilla` / `apriSigillo`: il passaggio da un PC all'altro. Chiave effimera ECDH
 *    (P-256) per ogni richiesta + AES-256-GCM legato al lavoro: il collegamento fra i PC è
 *    già autenticato (HMAC per PC), qui in più il valore non viaggia in chiaro e non si
 *    può riusare per un altro lavoro.
 * 3. `servi`: chi ha affidato il lavoro risponde solo al PC a cui l'ha affidato, solo per
 *    i nomi che quel lavoro dichiara.
 * 4. `chiedi`: chi aiuta le chiede (prima nella cassaforte aperta di qui, poi al PC
 *    che ha affidato il lavoro).
 */

export type Deposito = {
  /** La cassaforte è aperta (la maestra è in memoria)? Chiusa non si legge e non si scrive. */
  aperto: () => boolean
  /** Le voci, SENZA valore. */
  elenco: () => Promise<VoceCredenziale[]>
  /** Aggiunge o sostituisce (per nome) una voce. Il punto dove aggancia la schermata «Credenziali di rete». */
  aggiungi: (c: unknown) => Promise<{ ok: boolean; messaggio?: string }>
  togli: (nome: string) => Promise<boolean>
  /** I valori dei nomi chiesti che esistono: solo per `servi` e per il lavoratore, mai per log o schermo. */
  valori: (nomi: readonly string[]) => Promise<Record<string, string>>
}

export function creaDepositoCredenziali(x: { file: string; maestra: () => Buffer | undefined }): Deposito {
  const leggi = async (): Promise<CredenzialeRete[] | undefined> => {
    const m = x.maestra()
    if (m === undefined) return undefined
    if (!existsSync(x.file)) return []
    const chiaro = await decifra(m, Buffer.from(readFileSync(x.file, 'utf8'), 'base64'))
    if (chiaro === undefined) return undefined
    try {
      const j = JSON.parse(chiaro.toString('utf8')) as unknown
      return (Array.isArray(j) ? j : []).map(credenzialeValida).filter((c): c is CredenzialeRete => c !== undefined)
    } catch { return undefined }
  }
  const scrivi = async (voci: CredenzialeRete[]): Promise<boolean> => {
    const m = x.maestra()
    if (m === undefined) return false
    mkdirSync(dirname(x.file), { recursive: true })
    return scriviAtomico(x.file, (await cifra(m, Buffer.from(JSON.stringify(voci), 'utf8'))).toString('base64'), 'credenziali-rete')
  }
  const senzaValore = ({ valore: _v, ...resto }: CredenzialeRete): VoceCredenziale => resto
  return {
    aperto: () => x.maestra() !== undefined,
    async elenco() { return (await leggi() ?? []).map(senzaValore) },
    async aggiungi(c) {
      const v = credenzialeValida(c)
      if (v === undefined) return { ok: false, messaggio: 'credenziale non valida (nome, tipo e valore)' }
      const voci = await leggi()
      if (voci === undefined) return { ok: false, messaggio: 'la cassaforte è chiusa: sbloccala con la passphrase' }
      return await scrivi([...voci.filter((o) => o.nome !== v.nome), v]) ? { ok: true } : { ok: false, messaggio: 'la cassaforte è chiusa' }
    },
    async togli(nome) {
      const voci = await leggi()
      if (voci === undefined || !voci.some((o) => o.nome === nome)) return false
      return scrivi(voci.filter((o) => o.nome !== nome))
    },
    async valori(nomi) {
      const voci = await leggi() ?? []
      const fuori: Record<string, string> = {}
      for (const n of nomi) { const v = voci.find((o) => o.nome === n); if (v !== undefined) fuori[n] = v.valore }
      return fuori
    }
  }
}

// ---------------------------------------------------------------------------------------------
// In transito

export type Sigillo = { chiave: string; iv: string; tag: string; dati: string }
export type RichiestaCredenziali = { lavoro: string; nomi: string[]; chiave: string }

const INFO = Buffer.from('sierradeck-credenziali-v1')
const chiaveDa = (segreto: Buffer, lavoro: string): Buffer => Buffer.from(hkdfSync('sha256', segreto, Buffer.from(lavoro, 'utf8'), INFO, 32))
const pubDaBase64 = (b: string): KeyObject => createPublicKey({ key: Buffer.from(b, 'base64'), format: 'der', type: 'spki' })

/** Chi chiede: una coppia effimera; la pubblica va nella richiesta, la privata resta qui. */
export function preparaRichiesta(lavoro: string, nomi: readonly string[]): { richiesta: RichiestaCredenziali; apri: (s: unknown) => Record<string, string> | undefined } {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const richiesta: RichiestaCredenziali = { lavoro, nomi: [...nomi], chiave: publicKey.export({ format: 'der', type: 'spki' }).toString('base64') }
  return { richiesta, apri: (s) => apriSigillo(s, privateKey, lavoro) }
}

/** Chi risponde: cifra i valori per la chiave pubblica di chi ha chiesto, legandoli a quel lavoro. */
export function sigilla(valori: Record<string, string>, chiaveRichiedente: string, lavoro: string): Sigillo {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const segreto = diffieHellman({ privateKey, publicKey: pubDaBase64(chiaveRichiedente) })
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', chiaveDa(segreto, lavoro), iv)
  c.setAAD(Buffer.from(lavoro, 'utf8'))
  const dati = Buffer.concat([c.update(JSON.stringify(valori), 'utf8'), c.final()])
  return { chiave: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), dati: dati.toString('base64') }
}

function apriSigillo(s: unknown, privata: KeyObject, lavoro: string): Record<string, string> | undefined {
  try {
    const o = s as Partial<Sigillo>
    if (typeof o?.chiave !== 'string' || typeof o.iv !== 'string' || typeof o.tag !== 'string' || typeof o.dati !== 'string') return undefined
    const segreto = diffieHellman({ privateKey: privata, publicKey: pubDaBase64(o.chiave) })
    const d = createDecipheriv('aes-256-gcm', chiaveDa(segreto, lavoro), Buffer.from(o.iv, 'base64'))
    d.setAAD(Buffer.from(lavoro, 'utf8'))
    d.setAuthTag(Buffer.from(o.tag, 'base64'))
    const chiaro = Buffer.concat([d.update(Buffer.from(o.dati, 'base64')), d.final()]).toString('utf8')
    const j = JSON.parse(chiaro) as Record<string, unknown>
    const fuori: Record<string, string> = {}
    for (const [k, v] of Object.entries(j)) if (eNomeCredenziale(k) && typeof v === 'string') fuori[k] = v
    return fuori
  } catch { return undefined }
}

// ---------------------------------------------------------------------------------------------
// Il PC che ha affidato il lavoro

export type DatiServi = {
  /** Chi chiede: l'id del PC dalla richiesta firmata (mai dal corpo). `undefined` = non autenticato. */
  pcId: string | undefined
  corpo: unknown
  deposito: Deposito
  /** Le credenziali che quel lavoro dichiara e il PC a cui è stato affidato; `undefined` se questo PC non l'ha affidato. */
  dichiarate: (lavoro: string) => { pcId: string; nomi: readonly string[] } | undefined
}

/** Lancia un errore col motivo (italiano, senza valori) se la richiesta non va servita. */
export async function servi(d: DatiServi): Promise<Sigillo> {
  if (d.pcId === undefined || d.pcId === '') throw new Error('richiesta non autenticata: le credenziali si danno solo a un PC riconosciuto')
  const c = (typeof d.corpo === 'object' && d.corpo !== null ? d.corpo : {}) as Record<string, unknown>
  if (typeof c.lavoro !== 'string' || typeof c.chiave !== 'string' || !Array.isArray(c.nomi)) throw new Error('richiesta di credenziali non valida')
  const nomi = c.nomi.filter(eNomeCredenziale)
  if (nomi.length === 0 || nomi.length !== c.nomi.length || nomi.length > CREDENZIALI_PER_LAVORO_MAX) throw new Error('richiesta di credenziali non valida')
  const lavoro = d.dichiarate(c.lavoro)
  if (lavoro === undefined) throw new Error('questo PC non ha affidato quel lavoro')
  if (lavoro.pcId !== d.pcId) throw new Error('quel lavoro non è stato affidato a questo PC')
  const fuori = nomi.filter((n) => !lavoro.nomi.includes(n))
  if (fuori.length > 0) throw new Error(`il lavoro non dichiara queste credenziali: ${fuori.join(', ')}`)
  if (!d.deposito.aperto()) throw new Error('la cassaforte di questo PC è chiusa: sbloccala per dare le credenziali')
  try { pubDaBase64(c.chiave) } catch { throw new Error('richiesta di credenziali non valida') }
  return sigilla(await d.deposito.valori(nomi), c.chiave, c.lavoro)
}

// ---------------------------------------------------------------------------------------------
// Il PC che aiuta

export type DatiChiedi = {
  lavoro: string
  nomi: readonly string[]
  /** La cassaforte di questo PC, se è un PC di Nicholas e la tiene aperta. */
  deposito?: Deposito
  /** Chiede al PC che ha affidato il lavoro, sul collegamento già autenticato. */
  alPcCheAffido?: (richiesta: RichiestaCredenziali) => Promise<unknown>
}

/** I valori che si riescono ad avere, per nome; quelli che mancano non compaiono (poi il lavoro fallisce per «risorsa»). */
export async function chiedi(d: DatiChiedi): Promise<Record<string, string>> {
  const nomi = d.nomi.filter(eNomeCredenziale).slice(0, CREDENZIALI_PER_LAVORO_MAX)
  const avute: Record<string, string> = d.deposito?.aperto() === true ? await d.deposito.valori(nomi).catch(() => ({})) : {}
  const mancano = nomi.filter((n) => avute[n] === undefined)
  if (mancano.length === 0 || d.alPcCheAffido === undefined) return avute
  const { richiesta, apri } = preparaRichiesta(d.lavoro, mancano)
  const dal = apri(await d.alPcCheAffido(richiesta).catch(() => undefined)) ?? {}
  for (const n of mancano) if (dal[n] !== undefined) avute[n] = dal[n]
  return avute
}
