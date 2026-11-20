import { TIPI_CREDENZIALE, VALORE_CREDENZIALE_MAX, eNomeCredenziale, type TipoCredenziale, type VoceCredenziale } from '@shared/aiuto-credenziali'

/**
 * La schermata «Credenziali di rete» (k-166n8), senza grafica: il valore entra dal campo,
 * va al computer e non torna mai. Qui si elencano solo i nomi (VoceCredenziale non ha il valore).
 */

export type ApiCredenziali = {
  elenca: () => Promise<{ aperta: boolean; voci: VoceCredenziale[] }>
  aggiungi: (c: { nome: string; tipo: string; valore: string; serveA: string[] }) => Promise<{ ok: boolean; messaggio?: string }>
  togli: (nome: string) => Promise<boolean>
}

export type Bozza = { nome: string; tipo: TipoCredenziale; valore: string; serveA: string }
export const BOZZA_VUOTA: Bozza = { nome: '', tipo: 'token-servizio', valore: '', serveA: '' }

export const NOME_TIPO: Record<TipoCredenziale, string> = { 'accesso-pc': 'Accesso a un PC', 'chiave-ssh': 'Chiave SSH', 'token-servizio': 'Token di un servizio' }
export const tipiCredenziale = (): readonly TipoCredenziale[] => TIPI_CREDENZIALE

/** Cosa manca prima di salvare, in parole semplici; undefined = si può salvare. */
export function controllaBozza(b: Bozza): string | undefined {
  if (!eNomeCredenziale(b.nome.trim())) return 'Il nome vale lettere, numeri, punto, trattino (al massimo 64), senza spazi.'
  if (b.valore === '') return 'Manca il valore.'
  if (b.valore.length > VALORE_CREDENZIALE_MAX) return 'Il valore è troppo lungo.'
  return undefined
}

export type Vista = { aperta: boolean; voci: VoceCredenziale[] }

/** Ricopia solo i campi senza valore: anche se qualcosa in più arrivasse, qui si ferma. */
export const soloNomi = (voci: readonly VoceCredenziale[]): VoceCredenziale[] => voci.map((v) => ({ nome: v.nome, tipo: v.tipo, serveA: [...v.serveA] }))

export async function carica(api: ApiCredenziali): Promise<Vista> {
  const r = await api.elenca()
  return { aperta: r.aperta, voci: soloNomi(r.voci) }
}

/** Salva e rilegge l'elenco. Il valore della bozza non finisce né nell'esito né nell'elenco. */
export async function aggiungi(api: ApiCredenziali, b: Bozza): Promise<{ ok: boolean; messaggio?: string; vista?: Vista }> {
  const manca = controllaBozza(b)
  if (manca !== undefined) return { ok: false, messaggio: manca }
  const r = await api.aggiungi({
    nome: b.nome.trim(),
    tipo: b.tipo,
    valore: b.valore,
    serveA: b.serveA.split(',').map((s) => s.trim()).filter((s) => s !== '')
  })
  if (!r.ok) return { ok: false, messaggio: r.messaggio ?? 'Non l’ho salvata.' }
  return { ok: true, vista: await carica(api) }
}

export async function togli(api: ApiCredenziali, nome: string): Promise<{ ok: boolean; vista: Vista }> {
  const ok = await api.togli(nome)
  return { ok, vista: await carica(api) }
}
