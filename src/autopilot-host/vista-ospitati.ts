import type { LavoroOspitato } from '@shared/aiuto-rete'

/**
 * Solo un avanzamento vero (0-95); senza, nessun campo: le viste non disegnano
 * una barra finta e mostrano lo stato e da quanto lavora. Mai una stima
 * inventata dai minuti trascorsi (un lavoro bloccato da ore non sale a 90%).
 */
export function percentualeVera(p: number | undefined): { percentuale?: number } {
  return typeof p === 'number' && Number.isFinite(p) ? { percentuale: Math.max(0, Math.min(95, Math.round(p))) } : {}
}

/** La voce «al lavoro» di un lavoro di un altro PC che gira qui (Aiuta la rete). */
export function voceOspitata(o: LavoroOspitato, posto: number, cosaFa: string, titolo: string, peso: 1 | 2 | 3): {
  posto: number; id: string; workspace: string; descrizione: string; tipo: string; dal: string
  workspaceNome: string; titolo: string; cosaFa?: string; percentuale?: number; peso: 1 | 2 | 3; perPc: string
} {
  return {
    posto, id: o.id, workspace: '', descrizione: o.descrizione, tipo: o.ruolo, dal: o.inizio,
    workspaceNome: `per ${o.perPc}`, titolo,
    ...(cosaFa !== '' ? { cosaFa } : {}),
    ...percentualeVera(o.percentuale), peso,
    perPc: o.perPc
  }
}
