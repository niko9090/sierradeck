import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { applicaRiga, flussoVuoto, specialistiAlLavoro, type EffettoFlusso, type StatoFlusso } from '@shared/flusso-orchestratore'

/**
 * Il flusso **vero** di un orchestratore (CLI 2.1.314, haiku, 30/10/2026),
 * registrato dalla prova dal vivo e ripulito dei percorsi privati: un
 * messaggio, `stato`, una Write negata dalla guardia, `chiedi_utente`,
 * `quaderno_annota`, `piano_scrivi`, due sviluppatori in sottofondo (k-1,
 * k-2) nel loro worktree, i risvegli dopo ogni `task_notification`, due
 * `unisci`.
 */
const righe = readFileSync(join(__dirname, '..', 'fixtures', 'claude-2.1.314-orchestratore', 'flusso.jsonl'), 'utf8').trim().split('\n')

function rileggi(fino = righe.length): { stato: StatoFlusso; effetti: EffettoFlusso[]; inTurnoDopo: boolean[] } {
  let st = flussoVuoto()
  const effetti: EffettoFlusso[] = []
  const inTurnoDopo: boolean[] = []
  righe.slice(0, fino).forEach((r, i) => {
    const e = applicaRiga(st, r, new Date(Date.UTC(2026, 9, 30, 13, 48, i)).toISOString())
    st = e.stato
    effetti.push(...e.effetti)
    inTurnoDopo.push(st.inTurno)
  })
  return { stato: st, effetti, inTurnoDopo }
}

describe('flusso vero dell’orchestratore (fixture 2.1.314)', () => {
  it('gli specialisti: ruolo, compito, id dell’agente (= task_id), finiti con il riepilogo', () => {
    const { stato } = rileggi()
    expect(stato.specialisti).toHaveLength(2)
    for (const [i, k] of ['k-1', 'k-2'].entries()) {
      const s = stato.specialisti[i]!
      expect(s).toMatchObject({ ruolo: 'sviluppatore', compito: k, stato: 'finito' })
      expect(s.task).toMatch(/^a[0-9a-f]{16}$/u)
      // Il worktree della CLI è .claude/worktrees/agent-<id>, il ramo worktree-agent-<id>.
      expect(s.agente).toBe(s.task)
      expect(s.riepilogo?.length).toBeGreaterThan(20)
      expect(Date.parse(s.fine!)).toBeGreaterThan(Date.parse(s.inizio))
    }
    expect(specialistiAlLavoro(stato)).toHaveLength(0)
  })

  it('l’attività viene dai task_progress («Running …», «Writing …»), non dal nome dello strumento', () => {
    const i = righe.findIndex((r) => r.includes('"subtype":"task_progress"'))
    const { stato } = rileggi(i + 1)
    const att = stato.specialisti[0]!.attivita ?? ''
    expect(att).toMatch(/^(Running|Writing|Reading|Editing) /u)
  })

  it('il contesto è quello dell’ultima chiamata, non la somma del turno (che supera gli 80k)', () => {
    const { stato } = rileggi()
    const sommati = righe.map((r) => JSON.parse(r) as { type: string; usage?: Record<string, number> })
      .filter((o) => o.type === 'result')
      .map((o) => (o.usage!.input_tokens ?? 0) + (o.usage!.cache_read_input_tokens ?? 0) + (o.usage!.cache_creation_input_tokens ?? 0))
    expect(Math.max(...sommati)).toBeGreaterThan(80_000)
    expect(stato.costi.length).toBe(sommati.length)
    for (const c of stato.costi) expect(c.contesto).toBeLessThan(60_000)
    expect(stato.costi.every((c) => c.contesto > 30_000)).toBe(true)
  })

  it('dopo ogni task_notification il turno è aperto fino al result del risveglio', () => {
    const { inTurnoDopo, stato } = rileggi()
    const notifiche = righe.map((r, i) => (r.includes('"subtype":"task_notification"') ? i : -1)).filter((i) => i >= 0)
    expect(notifiche).toHaveLength(2)
    for (const n of notifiche) {
      const fine = righe.findIndex((r, i) => i > n && r.startsWith('{') && (JSON.parse(r) as { type: string }).type === 'result')
      expect(fine).toBeGreaterThan(n)
      for (let i = n; i < fine; i++) expect(inTurnoDopo[i]).toBe(true)
      expect(inTurnoDopo[fine]).toBe(false)
    }
    expect(stato.inTurno).toBe(false)
  })

  it('effetti: sessione una volta, due partenze e due fini, una risposta per result', () => {
    const { effetti } = rileggi()
    expect(effetti.filter((e) => e.tipo === 'sessione')).toHaveLength(1)
    expect(effetti.filter((e) => e.tipo === 'specialista-partito')).toHaveLength(2)
    expect(effetti.filter((e) => e.tipo === 'specialista-finito')).toHaveLength(2)
    expect(effetti.filter((e) => e.tipo === 'risposta').length).toBe(righe.filter((r) => r.includes('"type":"result"')).length)
  })
})
