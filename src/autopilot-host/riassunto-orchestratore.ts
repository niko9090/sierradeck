import type { Autopilota } from '@shared/autopilota'
import { PAROLA_STATO_CODA, type Coda, type MisuraCompito } from '@shared/coda-richieste'
import { avanzamentoRichiesta } from '@shared/coda-richieste'
import type { PercentoWs, Piano } from '@shared/piano-orchestratore'
import { RUOLI } from '@shared/ruoli-agenti'
import type { EventoOrchestratore } from './orchestratore'

/**
 * **Lo stato in breve** per l'orchestratore unico (P3): nel prompt di ogni
 * chiamata e nello strumento `stato`. Scritto dal programma, compatto (al più
 * ~12.000 caratteri, 2-4k token): le richieste aperte con i loro punti, il
 * piano, gli specialisti, la percentuale, gli eventi recenti e i tetti.
 */

export const RIASSUNTO_MAX = 12_000

export type DatiRiassunto = {
  ws: string
  coda: Coda
  piano: Piano
  unico: Autopilota | undefined
  misura: MisuraCompito
  percento?: PercentoWs
  eventi: EventoOrchestratore[]
  tetti: { ws: number; pc: number; alLavoroPc: number }
  domandeAperte: number
  adesso: number
}

const minuti = (da: string | undefined, ora: number): string => {
  const t = da === undefined ? NaN : Date.parse(da)
  if (Number.isNaN(t)) return ''
  const m = Math.max(0, Math.round((ora - t) / 60_000))
  return m < 60 ? `${m} min` : `${Math.round(m / 60)} h`
}

const corto = (t: string, n: number): string => {
  const x = t.replace(/\s+/gu, ' ').trim()
  return x.length > n ? `${x.slice(0, n - 1)}…` : x
}

export function riassuntoOrchestratore(d: DatiRiassunto): string {
  const righe: string[] = []
  const aperte = d.coda.richieste.filter((r) => r.stato !== 'fatta')
  const fatte = d.coda.richieste.filter((r) => r.stato === 'fatta')
  righe.push(`Workspace: ${d.ws}${d.unico !== undefined ? ` — cartella ${d.unico.cwd}${d.unico.ramoBase !== undefined ? `, ramo principale ${d.unico.ramoBase}` : ''}` : ''}`)
  const p = d.percento
  righe.push(`Avanzamento: ${p?.valore !== undefined ? `${p.valore}%` : '—'}${p?.calo !== undefined ? ` (sceso da ${p.calo.da}%: ${p.calo.perche})` : ''}. Richieste aperte ${aperte.length}, fatte ${fatte.length}.`)
  righe.push('', 'CODA (richieste aperte):')
  if (aperte.length === 0) righe.push('- niente in coda')
  for (const r of aperte) {
    righe.push(`- ${r.id} [${PAROLA_STATO_CODA[r.stato]}, ${avanzamentoRichiesta(r, d.misura)}%] ${corto(r.titolo, 140)}${r.segue !== undefined ? ` (segue ${r.segue})` : ''}${(r.candidati ?? []).length > 0 ? ` — forse la stessa di ${r.candidati!.join(', ')}` : ''}`)
    if (r.testo !== r.titolo) righe.push(`  testo: ${corto(r.testo, 400)}`)
    for (const q of r.punti) righe.push(`  ${q.id} ${q.stato === 'fatto' ? '[fatto] ' : q.stato === 'superato' ? '[superato] ' : ''}${corto(q.testo, 200)}`)
    if (r.compiti.length > 0) righe.push(`  compiti: ${r.compiti.map((k) => corto(k, 40)).join(', ')}`)
  }
  if (fatte.length > 0) righe.push(`Fatte di recente: ${fatte.slice(-5).map((r) => `${r.id} ${corto(r.titolo, 60)}${r.versione !== undefined ? ` (${r.versione})` : ''}`).join('; ')}`)

  righe.push('', 'PIANO:')
  const vivi = d.piano.compiti.filter((c) => c.stato !== 'unito' || c.criterioVerde !== true)
  if (d.piano.compiti.length === 0) righe.push('- nessun compito ancora')
  for (const c of vivi) {
    righe.push(`- ${c.id} (${c.richiesta}, peso ${c.peso}) [${c.stato}${c.stato === 'unito' && c.criterioVerde !== true ? ', criterio rosso' : ''}${c.chat !== undefined ? `, ${c.chat}` : ''}] ${corto(c.titolo, 120)} — criterio: ${corto(c.criterio, 160)}${c.dopo.length > 0 ? ` — dopo ${c.dopo.join(', ')}` : ''}${c.esito !== undefined ? ` — ultimo esito: ${corto(c.esito, 160)}` : ''}`)
  }
  const chiusi = d.piano.compiti.length - vivi.length
  if (chiusi > 0) righe.push(`(${chiusi} compiti uniti con il criterio verde)`)

  righe.push('', 'SPECIALISTI:')
  const chats = (d.unico?.chats ?? []).filter((c) => c.fine === undefined)
  if (chats.length === 0) righe.push('- nessuno')
  for (const c of chats) {
    const ruolo = c.ruolo !== undefined ? RUOLI[c.ruolo].nome : 'Chat'
    righe.push(`- ${c.id} ${ruolo} [${c.stato}${c.dal !== undefined ? ` da ${minuti(c.dal, d.adesso)}` : ''}]${c.compitoId !== undefined ? ` compito ${c.compitoId}` : ''}${c.ramo !== undefined ? ` ramo ${c.ramo}` : ''}${c.origine !== undefined ? ` (adottata da ${c.origine.autopilota})` : ''}: ${corto(c.compito, 100)}`)
    const ultimo = c.rapporto !== undefined ? `${c.rapporto.tipo}: ${c.rapporto.testo}` : c.ultimaAzione
    if (ultimo !== undefined && ultimo !== '') righe.push(`  ultimo: ${corto(ultimo, 200)}`)
  }
  const adottate = d.unico?.adottate ?? []
  if (adottate.length > 0) righe.push(`Chat adottate di Nicholas: ${adottate.map((x) => `${corto(x.titolo || x.sessionId.slice(0, 8), 40)}${x.soloMia === true ? ' (solo sua: non scriverle)' : ''}`).join('; ')}`)

  righe.push('', `TETTI: specialisti in questo workspace ${chats.filter((c) => c.stato !== 'finita').length}/${d.tetti.ws}; chat al lavoro sul PC ${d.tetti.alLavoroPc}/${d.tetti.pc}. Domande aperte a Nicholas: ${d.domandeAperte}.`)

  if (d.eventi.length > 0) {
    righe.push('', 'EVENTI RECENTI:')
    for (const e of d.eventi.slice(-12)) righe.push(`- ${minuti(e.quando, d.adesso)} fa ${e.chat ?? ''} ${e.tipo}: ${corto(e.testo, 200)}`)
  }
  let testo = righe.join('\n')
  if (testo.length > RIASSUNTO_MAX) testo = `${testo.slice(0, RIASSUNTO_MAX - 60)}\n… (stato tagliato: usa lo strumento stato per il resto)`
  return testo
}
