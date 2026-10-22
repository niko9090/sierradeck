import { describe, it, expect } from 'vitest'
import { attendiQuiete, ATTESA_INSTALLA_MS, AVVISO_PAUSA, leggiPausa, type ChatInVolo, type PausaSalvata } from '../../src/main/pausa-aggiornamento'

/**
 * Aggiornamento senza tempi morti (0.84.3). Il caso vero del 22/10: «Installa»
 * premuto alle 15:28:51 UTC con 4 chat al lavoro, tre che non finivano mai il
 * turno («App Android: analisi, correzioni e allineamento» due volte e
 * «ServerDSM»), e alle 17:28:51 «non installo: 3 chat hanno ancora qualcosa in
 * mano». Due ore ferme e niente installato. Adesso: al massimo 5 minuti, poi il
 * lavoro delle chat si salva con un commit sul loro ramo e si installa.
 */
const INSTALLA = Date.parse('2026-10-22T15:28:51.000Z')

const chat = (id: string, titolo: string, over: Partial<ChatInVolo> = {}): ChatInVolo => ({ id, titolo, sessione: `s-${id}`, viva: true, aspetta: false, ...over })

function banco(chats: () => ChatInVolo[]) {
  const fatti: string[] = []
  let orologio = INSTALLA
  let pausa: PausaSalvata | undefined
  let chiusa: { come: string; interrotte: number } | undefined
  const deps = {
    chat: chats,
    pausaAutopiloti: async (attiva: boolean) => { fatti.push(attiva ? 'pausa' : 'disfa'); return 2 },
    scriviInChat: (id: string, testo: string) => { fatti.push(`scrivo:${id}:${testo === AVVISO_PAUSA ? 'avviso' : 'altro'}`) },
    annota: (p: PausaSalvata) => { pausa = p },
    avvisa: () => {},
    salvaSubito: async () => { fatti.push(`salvo@${new Date(orologio).toISOString()}`) },
    chiusa: (e: { come: string; interrotte: number }) => { chiusa = e },
    adesso: () => orologio,
    aspetta: (ms: number) => { orologio += ms; return Promise.resolve() },
    tetto: ATTESA_INSTALLA_MS,
    alloScadere: 'installa' as const
  }
  return { deps, fatti, ora: () => orologio, pausa: () => pausa, chiusa: () => chiusa }
}

describe('dopo «Installa»: chat salvate e ferme entro 5 minuti, poi si installa', () => {
  it('il caso vero del 22/10: tre chat che non finiscono mai il turno non tengono fermo l’aggiornamento due ore', async () => {
    const tre = [
      chat('a1', 'App Android: analisi, correzioni e allineamento', { governata: true }),
      chat('a2', 'App Android: analisi, correzioni e allineamento', { governata: true }),
      chat('dsm', 'ServerDSM')
    ]
    const b = banco(() => tre)
    await expect(attendiQuiete(b.deps)).resolves.toBe(true)
    // Entro 5 minuti (più un giro di controllo), mai due ore.
    expect(b.ora() - INSTALLA).toBeLessThanOrEqual(5 * 60_000 + 2000)
    expect(b.ora() - INSTALLA).toBeGreaterThanOrEqual(5 * 60_000)
    // Prima la pausa degli autopiloti, poi l'avviso a ognuna, poi il salvataggio: mai «disfa».
    expect(b.fatti[0]).toBe('pausa')
    expect(b.fatti.filter((f) => f.endsWith(':avviso'))).toHaveLength(3)
    expect(b.fatti.some((f) => f.startsWith('salvo@2026-10-22T15:33:5'))).toBe(true)
    expect(b.fatti).not.toContain('disfa')
    expect(b.chiusa()).toEqual({ come: 'scadenza', interrotte: 3 })
    // La chat di Nicholas si riprende al ritorno (quelle governate le riprende il servizio).
    expect(leggiPausa(b.pausa())?.sessioni).toEqual(['s-dsm'])
  })

  it('se le chat finiscono prima, si installa subito, e il lavoro si salva lo stesso', async () => {
    let ferme = false
    const b = banco(() => [chat('a1', 'Fatture', { governata: true, aspetta: ferme })])
    const aspetta = b.deps.aspetta
    b.deps.aspetta = (ms: number) => { const r = aspetta(ms); if (b.ora() - INSTALLA >= 60_000) ferme = true; return r }
    await expect(attendiQuiete(b.deps)).resolves.toBe(true)
    expect(b.ora() - INSTALLA).toBeLessThan(2 * 60_000)
    expect(b.fatti.some((f) => f.startsWith('salvo@'))).toBe(true)
    expect(b.chiusa()).toEqual({ come: 'quiete', interrotte: 0 })
  })

  it('un salvataggio che non riesce non blocca l’installazione', async () => {
    const b = banco(() => [chat('a1', 'Fatture', { governata: true })])
    await expect(attendiQuiete({ ...b.deps, salvaSubito: async () => { throw new Error('servizio spento') } })).resolves.toBe(true)
  })

  it('l’avviso dentro le chat dice dei 5 minuti e del commit sul ramo', () => {
    expect(AVVISO_PAUSA).toContain('5 minuti')
    expect(AVVISO_PAUSA).toContain('commit sul tuo')
  })
})
