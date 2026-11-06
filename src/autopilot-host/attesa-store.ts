import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import { attesaVuota, type StatoAttesa, type VoceAttesa } from '@shared/attesa-specialisti'

/**
 * La lista d'attesa degli specialisti, in `autopiloti/servizio/attesa-specialisti.json`:
 * sopravvive al riavvio del servizio (k-48). Una per tutto il PC.
 */

export type ArchivioAttesa = {
  leggi: () => StatoAttesa
  scrivi: (s: StatoAttesa) => void
}

const testo = (x: unknown): x is string => typeof x === 'string' && x !== ''
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

function voceValida(v: unknown): VoceAttesa | undefined {
  if (typeof v !== 'object' || v === null) return undefined
  const o = v as Record<string, unknown>
  if (!testo(o.id) || !testo(o.workspace) || !testo(o.descrizione) || !testo(o.dal)) return undefined
  return {
    id: o.id, workspace: o.workspace, descrizione: o.descrizione, dal: o.dal,
    tipo: testo(o.tipo) ? o.tipo : 'general-purpose',
    ...(testo(o.autopilota) ? { autopilota: o.autopilota } : {}),
    ...(testo(o.compito) ? { compito: o.compito } : {}),
    priorita: num(o.priorita) ? o.priorita : 0,
    ordine: num(o.ordine) ? o.ordine : 0,
    ...(testo(o.prenotataFino) ? { prenotataFino: o.prenotataFino } : {}),
    sveglie: num(o.sveglie) ? o.sveglie : 0,
    ...(o.parcheggiata === true ? { parcheggiata: true as const } : {}),
    ...(testo(o.ramo) ? { ramo: o.ramo } : {})
  }
}

export function apriAttesa(file: string): ArchivioAttesa {
  let stato: StatoAttesa | undefined
  return {
    leggi() {
      if (stato !== undefined) return stato
      try {
        const o = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as { voci?: unknown; prossimo?: unknown; precedenze?: unknown } : {}
        const voci = Array.isArray(o.voci) ? o.voci.map(voceValida).filter((v): v is VoceAttesa => v !== undefined) : []
        const max = voci.reduce((m, v) => Math.max(m, v.ordine), 0)
        const prec = typeof o.precedenze === 'object' && o.precedenze !== null && !Array.isArray(o.precedenze)
          ? Object.fromEntries(Object.entries(o.precedenze as Record<string, unknown>).filter((e): e is [string, number] => num(e[1]) && e[1] !== 0))
          : {}
        stato = { voci, prossimo: Math.max(num(o.prossimo) ? o.prossimo : 1, Math.floor(max) + 1), ...(Object.keys(prec).length > 0 ? { precedenze: prec } : {}) }
      } catch (err) {
        console.error(`[attesa] ${file} illeggibile:`, err)
        stato = attesaVuota()
      }
      return stato
    },
    scrivi(s) {
      stato = s
      try { mkdirSync(dirname(file), { recursive: true }) } catch { /* lo dice la scrittura */ }
      scriviJsonAtomico(file, { versione: 1, ...s }, 'attesa')
    }
  }
}
