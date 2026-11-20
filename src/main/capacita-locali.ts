import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { CAPACITA_VALIDA_MS, ricavaCapacita, type CapacitaPc } from '@shared/capacita-pc'

/**
 * Le capacità di questo PC (k-166n1), con memoria: il PATH si guarda al più ogni
 * 10 minuti, non a ogni battito. Il telefono (adb) si chiede in sottofondo, solo
 * se `adb` c'è: il risultato arriva al giro dopo.
 */
export function creaCapacitaLocali(d: { aiutante: boolean; rete?: () => string[]; path?: () => string; esiste?: (p: string) => boolean; adesso?: () => number }): () => CapacitaPc {
  const adesso = d.adesso ?? ((): number => Date.now())
  const esiste = d.esiste ?? existsSync
  let memoria: { il: number; c: CapacitaPc } | undefined
  let telefono = false
  let controllando = false
  const guardaTelefono = (): void => {
    if (controllando) return
    controllando = true
    try {
      execFile('adb', ['devices'], { timeout: 4000, windowsHide: true }, (err, out) => {
        controllando = false
        if (err) { telefono = false; return }
        telefono = out.split(/\r?\n/u).slice(1).some((r) => /\tdevice\b/u.test(r))
      })
    } catch { controllando = false }
  }
  return () => {
    if (memoria !== undefined && adesso() - memoria.il < CAPACITA_VALIDA_MS) return memoria.c
    const c = ricavaCapacita(d.path?.() ?? process.env.PATH ?? process.env.Path ?? '', esiste, {
      telefono, aiutante: d.aiutante, adesso: adesso(), ...(d.rete !== undefined ? { rete: d.rete() } : {})
    })
    if (c.programmi.includes('adb')) guardaTelefono()
    memoria = { il: adesso(), c }
    return c
  }
}
