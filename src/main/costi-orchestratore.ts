import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { CostoOrchestratore } from '@shared/consumi'

/**
 * I costi dell'orchestratore di ogni workspace, letti dal disco per il
 * pannello dei consumi.
 *
 * Il servizio degli autopiloti scrive una riga per turno in
 * `orchestratori/<cartella del workspace>/costi.jsonl` (`quando` ISO, `usd`, i
 * token): qui si leggono **soltanto**, e si sommano per oggi, sette giorni e
 * da sempre come la spesa delle chat (`costoPerPeriodo`). Sono dollari di
 * listino: con l'abbonamento dicono quanto vale il lavoro, non cosa si paga.
 */

/**
 * Il nome della cartella di un workspace: la stessa regola di
 * `cartellaWorkspace` del servizio (il test le confronta). Serve a ridare a
 * ogni cartella il nome vero del workspace, che nella cartella è ridotto.
 */
export function cartellaDelWorkspace(workspace: string): string {
  const leggibile = workspace.normalize('NFC').replace(/[^\p{L}\p{N} _.-]+/gu, '_').replace(/[. ]+$/u, '').trim().slice(0, 60) || 'ws'
  const impronta = createHash('sha1').update(workspace).digest('hex').slice(0, 8)
  return `${leggibile}-${impronta}`
}

type Turno = { quando: number; usd: number }

/** Le righe di un `costi.jsonl`: quelle senza data o senza importo si saltano. */
export function leggiTurni(testo: string): Turno[] {
  const turni: Turno[] = []
  for (const riga of testo.split('\n')) {
    if (riga.trim() === '') continue
    try {
      const o = JSON.parse(riga) as { quando?: unknown; usd?: unknown }
      const quando = typeof o.quando === 'string' ? Date.parse(o.quando) : NaN
      if (Number.isNaN(quando) || typeof o.usd !== 'number' || !Number.isFinite(o.usd)) continue
      turni.push({ quando, usd: o.usd })
    } catch { /* una riga a metà (scritta mentre si legge) non ferma le altre */ }
  }
  return turni
}

/** Somma i turni per periodo: oggi (dalla mezzanotte locale), ultimi 7 giorni, da sempre. */
export function sommaTurni(workspace: string, turni: Turno[], adesso: number): CostoOrchestratore {
  const inizioOggi = new Date(adesso); inizioOggi.setHours(0, 0, 0, 0)
  const settimanaFa = adesso - 7 * 24 * 60 * 60 * 1000
  const c: CostoOrchestratore = { workspace, oggi: 0, settimana: 0, totale: 0, turni: turni.length }
  for (const t of turni) {
    c.totale += t.usd
    if (t.quando >= settimanaFa) c.settimana += t.usd
    if (t.quando >= inizioOggi.getTime()) c.oggi += t.usd
    if (c.ultimo === undefined || t.quando > c.ultimo) c.ultimo = t.quando
  }
  return c
}

/**
 * Il lettore, con una memoria per file: il pannello rilegge ogni mezzo minuto,
 * e un file che non è cambiato (stessa data e stessa dimensione) non si rilegge.
 */
export function creaLettoreCosti(cartella: string): (nomiNoti: readonly string[], adesso: number) => CostoOrchestratore[] {
  const memoria = new Map<string, { mtimeMs: number; size: number; turni: Turno[] }>()
  return (nomiNoti, adesso) => {
    if (cartella === '' || !existsSync(cartella)) return []
    const perCartella = new Map(nomiNoti.map((n) => [cartellaDelWorkspace(n), n]))
    const esito: CostoOrchestratore[] = []
    let voci: string[]
    try { voci = readdirSync(cartella) } catch { return [] }
    for (const voce of voci) {
      const file = join(cartella, voce, 'costi.jsonl')
      let st
      try { st = statSync(file) } catch { continue }
      let gia = memoria.get(file)
      if (gia === undefined || gia.mtimeMs !== st.mtimeMs || gia.size !== st.size) {
        let testo: string
        try { testo = readFileSync(file, 'utf8') } catch { continue }
        gia = { mtimeMs: st.mtimeMs, size: st.size, turni: leggiTurni(testo) }
        memoria.set(file, gia)
      }
      if (gia.turni.length === 0) continue
      // Un workspace che non c'è più (o di un nome mai visto qui) resta con il
      // nome della cartella, senza l'impronta in coda.
      const nome = perCartella.get(voce) ?? voce.replace(/-[0-9a-f]{8}$/, '')
      esito.push(sommaTurni(nome, gia.turni, adesso))
    }
    return esito.sort((a, b) => b.settimana - a.settimana || b.totale - a.totale)
  }
}
