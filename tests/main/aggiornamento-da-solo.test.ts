import { describe, it, expect } from 'vitest'
import {
  attendiQuiete, leggiPausa, testoAttesa,
  ATTESA_INSTALLA_MS, ATTESA_QUIETE_MS, AVVISO_LUNGO_MS,
  type ChatInVolo, type PausaSalvata
} from '../../src/main/pausa-aggiornamento'
import { serveCercareSubito } from '../../src/shared/versioni-altri-pc'
import { RICONTROLLA_MS } from '../../src/main/aggiornamenti'

/**
 * L'attesa della quiete dopo «Installa» premuto da Nicholas (0.67.1, poi 0.69.0:
 * l'installazione parte solo da lui — vedi `installa-solo-nicholas.test.ts`).
 * Il 12/10 l'attesa si arrendeva dopo dieci minuti con gli autopiloti sempre al
 * lavoro, e si cercava ogni sei ore.
 */
const chat = (over: Partial<ChatInVolo>): ChatInVolo => ({ id: 'p1', sessione: 's1', viva: true, aspetta: false, ...over })

function banco(chats: ChatInVolo[], ferme: (ms: number) => ChatInVolo[] | undefined = () => undefined) {
  const fatti: string[] = []
  const testi: { testo: string; lungo: boolean }[] = []
  let salvata: PausaSalvata | undefined
  let orologio = 0
  const deps = {
    chat: () => chats,
    pausaAutopiloti: async (attiva: boolean) => { fatti.push(attiva ? 'pausa' : 'disfa'); return 1 },
    scriviInChat: (id: string) => { fatti.push(`scrivo:${id}`) },
    annota: (p: PausaSalvata) => { salvata = p },
    avvisa: () => {},
    avvisaTesto: (testo: string, lungo: boolean) => { testi.push({ testo, lungo }) },
    adesso: () => orologio,
    aspetta: (ms: number) => {
      orologio += ms
      const nuove = ferme(orologio)
      if (nuove !== undefined) chats = nuove
      return Promise.resolve()
    }
  }
  return { deps, fatti, testi, pausa: () => salvata, orologio: () => orologio }
}

describe('dopo «Installa»: si aspetta la quiete fino a due ore', () => {
  it('prima la pausa degli autopiloti (a fine turno), poi l’avviso alle chat al lavoro', async () => {
    const b = banco([chat({ id: 'ap', governata: true }), chat({ id: 'mia', sessione: 's2' })], (t) => t >= 60_000 ? [] : undefined)
    await attendiQuiete({ ...b.deps, tetto: ATTESA_INSTALLA_MS })
    expect(b.fatti[0]).toBe('pausa')
    expect(b.fatti).toContain('scrivo:ap')
    expect(b.fatti).toContain('scrivo:mia')
  })
  it('oltre i vecchi dieci minuti, e installa quando tutte sono ferme', async () => {
    const libere = ATTESA_QUIETE_MS + 30 * 60_000
    const b = banco([chat({ id: 'ap', governata: true })], (t) => t >= libere ? [chat({ id: 'ap', governata: true, aspetta: true })] : undefined)
    await expect(attendiQuiete({ ...b.deps, tetto: ATTESA_INSTALLA_MS })).resolves.toBe(true)
    expect(b.orologio()).toBeGreaterThanOrEqual(libere)
  })
  it('dopo il tetto non installa e toglie la pausa', async () => {
    const b = banco([chat({ id: 'ap', governata: true })])
    await expect(attendiQuiete({ ...b.deps, tetto: ATTESA_INSTALLA_MS })).resolves.toBe(false)
    expect(b.fatti.at(-1)).toBe('disfa')
  })
  it('al ritorno si riprendono le chat che erano a metà turno', async () => {
    const b = banco([chat({ id: 'mia', sessione: 'sm' })], (t) => t >= 10_000 ? [] : undefined)
    await attendiQuiete(b.deps)
    expect(leggiPausa(b.pausa())?.sessioni).toEqual(['sm'])
  })
})

describe('il testo dell’attesa, e l’avviso dopo 20 minuti', () => {
  it('dice quante chat e quali', () => {
    expect(testoAttesa([chat({ titolo: 'Fatture' })], 0)).toEqual({ testo: 'aggiorno appena finisce: 1 chat al lavoro («Fatture»)', lungo: false })
    expect(testoAttesa([chat({ titolo: 'A' }), chat({ titolo: 'B' })], 0).testo).toBe('aggiorno appena finiscono: 2 chat al lavoro («A», «B»)')
  })
  it('dopo 20 minuti con una chat non di un autopilota ancora al lavoro: lo si dice', () => {
    const t = testoAttesa([chat({ titolo: 'Fatture' })], AVVISO_LUNGO_MS)
    expect(t.lungo).toBe(true)
    expect(t.testo).toBe('Aspetto da 20 minuti: aggiorno appena finisce: 1 chat al lavoro («Fatture»)')
    expect(testoAttesa([chat({ titolo: 'X', governata: true })], AVVISO_LUNGO_MS).lungo).toBe(false)
  })
})

describe('il controllo degli aggiornamenti (scarica e dice «pronta», non installa)', () => {
  it('ogni dieci minuti', () => {
    expect(RICONTROLLA_MS).toBe(10 * 60_000)
  })
  it('subito quando il battito di un altro PC ha una versione più nuova', () => {
    expect(serveCercareSubito({ mia: '0.66.3', altre: ['0.66.2', '0.67.0'], fase: 'aggiornato', adesso: 0 })).toBe(true)
    expect(serveCercareSubito({ mia: '0.67.0', altre: ['0.66.2', '0.67.0'], fase: 'aggiornato', adesso: 0 })).toBe(false)
    expect(serveCercareSubito({ mia: '0.66.3', altre: ['0.67.0'], fase: 'attendo', adesso: 0 })).toBe(false)
    expect(serveCercareSubito({ mia: '0.66.3', altre: ['0.67.0'], fase: 'aggiornato', ultima: 0, adesso: 60_000 })).toBe(false)
  })
})
