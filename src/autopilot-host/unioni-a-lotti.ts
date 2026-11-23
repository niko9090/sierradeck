/**
 * **Le unioni a lotti** (k-178g, 22/11). Con 10 rami in fila le unioni una alla volta
 * costavano ore: ognuna provava, univa e misurava da sola nella cartella principale.
 * Qui i rami indipendenti (file diversi, nessun «dopo» uno sull'altro) si uniscono
 * insieme in una prova sola. Verde: entrano tutti. Rosso o conflitto: il lotto si
 * divide a metà e si riprova ogni metà, fino al ramo colpevole.
 *
 * Questo file non sa niente di git né del servizio: forma i lotti e cerca il
 * colpevole con una `prova` che gli dà chi lo usa.
 */

export type VoceLotto = {
  /** Il compito (o ciò che identifica l'unione in fila). */
  id: string
  ramo: string
  /** I file che il ramo cambia rispetto al principale. */
  file: string[]
  /** I compiti che devono essere uniti prima di questo, anche in modo indiretto. */
  dopo: string[]
}

/** Quanti rami al più in un lotto: oltre, un lotto rosso costa troppe bisezioni. */
export const LOTTO_MAX_RAMI = 8

const chiaveFile = (f: string): string => f.trim().replace(/\\/g, '/').toLowerCase()

/** `id` dipende (direttamente o no) da un altro compito, o un altro da lui: mai nello stesso lotto. */
export function dipendenti(a: VoceLotto, b: VoceLotto): boolean {
  return a.dopo.includes(b.id) || b.dopo.includes(a.id)
}

/** I «dopo» di ogni compito con le dipendenze indirette: da `piano` (id → dopo). */
export function dopoTransitivi(piano: ReadonlyMap<string, readonly string[]>, id: string): string[] {
  const visti = new Set<string>()
  const pila = [...(piano.get(id) ?? [])]
  while (pila.length > 0) {
    const x = pila.pop()!
    if (visti.has(x) || x === id) continue
    visti.add(x)
    pila.push(...(piano.get(x) ?? []))
  }
  return [...visti]
}

/**
 * Il lotto che parte dalla prima voce: le altre entrano se i loro file non toccano
 * quelli di nessuna già dentro, e se non c'è un «dopo» fra loro. Chi non entra resta
 * per il lotto dopo (o per l'unione singola). Una voce senza file noti (diff non
 * riuscito) non entra mai in un lotto con altri.
 */
export function formaLotto(voci: readonly VoceLotto[], max: number = LOTTO_MAX_RAMI): VoceLotto[] {
  const prima = voci[0]
  if (prima === undefined) return []
  const lotto = [prima]
  if (prima.file.length === 0) return lotto
  const usati = new Set(prima.file.map(chiaveFile))
  for (const v of voci.slice(1)) {
    if (lotto.length >= max) break
    if (v.file.length === 0 || lotto.some((l) => l.ramo === v.ramo || dipendenti(l, v))) continue
    const mie = v.file.map(chiaveFile)
    if (mie.some((f) => usati.has(f))) continue
    for (const f of mie) usati.add(f)
    lotto.push(v)
  }
  return lotto
}

/** L'esito di una prova di un gruppo di rami, come lo dà il servizio. */
export type EsitoProvaLotto = { unito: true } | { unito: false; motivo: string; ritenta?: 'sporca' | 'scaduta'; file?: string[] }

export type EsitoRamoLotto =
  | { esito: 'entrato' }
  /** Rosso o conflitto proprio di questo ramo: esce, con il motivo della prova. */
  | { esito: 'colpevole'; motivo: string }
  /** Non provato (tempo del lotto finito, o la prova chiede di riprovare più tardi): resta all'unione singola. */
  | { esito: 'non-provato'; perche: string }

export type RisultatoLotto = { esiti: Map<string, EsitoRamoLotto>; prove: number }

/**
 * Prova il lotto e, se è rosso, lo divide a metà fino a trovare i colpevoli. Le metà si
 * provano una dopo l'altra: la seconda sopra la prima già entrata, così un conflitto fra
 * le due metà esce da sé. Se una metà è verde e il gruppo era rosso, l'altra è già
 * nota come rossa e non si riprova intera.
 *
 * Il tempo: `maxMs` per ramo, quindi al più `maxMs × rami` per tutto il lotto. Finito il
 * tempo, o con una prova che chiede di riprovare (cartella sporca, scaduta), i rami non
 * ancora decisi tornano `non-provato`: li unisce la fila come oggi, uno alla volta.
 */
export async function unisciALotti(
  rami: readonly string[],
  prova: (rami: string[]) => Promise<EsitoProvaLotto>,
  opz: { maxMs: number; ora?: () => number } = { maxMs: 25 * 60_000 }
): Promise<RisultatoLotto> {
  const ora = opz.ora ?? (() => Date.now())
  const scade = ora() + Math.max(1, opz.maxMs) * Math.max(1, rami.length)
  const esiti = new Map<string, EsitoRamoLotto>()
  let prove = 0
  let fermo: string | undefined

  const segna = (gruppo: readonly string[], e: EsitoRamoLotto): void => { for (const r of gruppo) esiti.set(r, e) }

  const risolvi = async (gruppo: readonly string[], giaRosso?: string): Promise<void> => {
    if (fermo !== undefined) { segna(gruppo, { esito: 'non-provato', perche: fermo }); return }
    // Un gruppo già noto rosso e di un ramo solo non si riprova: è lui.
    if (giaRosso !== undefined && gruppo.length === 1) { segna(gruppo, { esito: 'colpevole', motivo: giaRosso }); return }
    if (ora() >= scade) { fermo = 'tempo del lotto finito'; segna(gruppo, { esito: 'non-provato', perche: fermo }); return }
    let r: EsitoProvaLotto
    if (giaRosso !== undefined) r = { unito: false, motivo: giaRosso }
    else {
      prove += 1
      try { r = await prova([...gruppo]) } catch (err) {
        fermo = `prova non riuscita (${err instanceof Error ? err.message : String(err)})`
        segna(gruppo, { esito: 'non-provato', perche: fermo })
        return
      }
    }
    if (r.unito) { segna(gruppo, { esito: 'entrato' }); return }
    if (r.ritenta !== undefined) { fermo = `${r.motivo} (da riprovare più tardi)`; segna(gruppo, { esito: 'non-provato', perche: fermo }); return }
    if (gruppo.length === 1) { segna(gruppo, { esito: 'colpevole', motivo: r.motivo }); return }
    const meta = Math.ceil(gruppo.length / 2)
    const sinistra = gruppo.slice(0, meta)
    const destra = gruppo.slice(meta)
    await risolvi(sinistra)
    // Sinistra verde: il rosso sta a destra. Sinistra con colpevoli: la destra va provata sopra quel che è entrato.
    const sinistraTuttaVerde = sinistra.every((x) => esiti.get(x)?.esito === 'entrato')
    await risolvi(destra, sinistraTuttaVerde ? r.motivo : undefined)
  }

  if (rami.length > 0) await risolvi(rami)
  return { esiti, prove }
}
