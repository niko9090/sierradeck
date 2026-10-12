import { describe, it, expect } from 'vitest'
import {
  attendiQuiete, daInstallareDaSolo, leggiPausa, testoAttesa,
  ATTESA_DA_SOLO_MS, ATTESA_QUIETE_MS, AVVISO_LUNGO_MS, RIPROVA_DA_SOLO_MS,
  type ChatInVolo, type PausaSalvata
} from '../../src/main/pausa-aggiornamento'
import { serveCercareSubito } from '../../src/shared/versioni-altri-pc'
import { RICONTROLLA_MS } from '../../src/main/aggiornamenti'

/**
 * Gli aggiornamenti bloccati del 12/10 (0.67.1): tre PC su 0.66.1, 0.66.2 e
 * 0.66.3 con la 0.66.4 già uscita. Si installava solo con «Installa» o alla
 * chiusura, l'attesa della quiete si arrendeva dopo dieci minuti con gli
 * autopiloti sempre al lavoro, e si cercava ogni sei ore.
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

describe('aggiornamento pronto: si installa da solo alla quiete', () => {
  it('parte da solo appena c’è una versione pronta, se l’automatico è acceso', () => {
    expect(daInstallareDaSolo({ fase: 'pronto', acceso: true, avviata: false, adesso: 0 })).toBe(true)
    expect(daInstallareDaSolo({ fase: 'pronto', acceso: false, avviata: false, adesso: 0 })).toBe(false)
    expect(daInstallareDaSolo({ fase: 'scarico', acceso: true, avviata: false, adesso: 0 })).toBe(false)
    expect(daInstallareDaSolo({ fase: 'pronto', acceso: true, avviata: true, adesso: 0 })).toBe(false)
  })
  it('se la quiete non è arrivata riprova dopo mezz’ora, non subito', () => {
    expect(daInstallareDaSolo({ fase: 'pronto', acceso: true, avviata: false, ultimoTentativo: 0, adesso: RIPROVA_DA_SOLO_MS - 1 })).toBe(false)
    expect(daInstallareDaSolo({ fase: 'pronto', acceso: true, avviata: false, ultimoTentativo: 0, adesso: RIPROVA_DA_SOLO_MS })).toBe(true)
  })
})

describe('pausa dei turni nuovi', () => {
  it('prima la pausa degli autopiloti, poi l’avviso solo alle chat degli autopiloti', async () => {
    const b = banco([chat({ id: 'ap', governata: true }), chat({ id: 'mia', sessione: 's2' })], (t) => t >= 60_000 ? [] : undefined)
    await attendiQuiete({ ...b.deps, soloGovernate: true, tetto: ATTESA_DA_SOLO_MS })
    expect(b.fatti[0]).toBe('pausa')
    expect(b.fatti).toContain('scrivo:ap')
    // La chat di Nicholas si aspetta e basta: dentro non si scrive niente.
    expect(b.fatti).not.toContain('scrivo:mia')
  })
})

describe('installazione alla quiete, anche dopo i vecchi dieci minuti', () => {
  it('da solo aspetta oltre i dieci minuti, e installa quando tutte sono ferme', async () => {
    const libere = ATTESA_QUIETE_MS + 30 * 60_000
    const b = banco([chat({ id: 'ap', governata: true })], (t) => t >= libere ? [chat({ id: 'ap', governata: true, aspetta: true })] : undefined)
    await expect(attendiQuiete({ ...b.deps, soloGovernate: true, tetto: ATTESA_DA_SOLO_MS })).resolves.toBe(true)
    expect(b.orologio()).toBeGreaterThanOrEqual(libere)
    expect(b.fatti).not.toContain('disfa')
  })
  it('dopo il tetto delle due ore non installa e toglie la pausa', async () => {
    const b = banco([chat({ id: 'ap', governata: true })])
    await expect(attendiQuiete({ ...b.deps, soloGovernate: true, tetto: ATTESA_DA_SOLO_MS })).resolves.toBe(false)
    expect(b.fatti.at(-1)).toBe('disfa')
  })
})

describe('ripresa dopo il riavvio', () => {
  it('da solo: le chat degli autopiloti le riprende il servizio, a quelle di Nicholas non si scrive «ti eri fermato»', async () => {
    const b = banco([chat({ id: 'ap', sessione: 'sa', governata: true }), chat({ id: 'mia', sessione: 'sm' })], (t) => t >= 10_000 ? [] : undefined)
    await attendiQuiete({ ...b.deps, soloGovernate: true, tetto: ATTESA_DA_SOLO_MS })
    // Nessuna sessione da riprendere a mano: al ritorno non si scrive niente.
    expect(leggiPausa(b.pausa())).toBeUndefined()
  })
  it('con «Installa» premuto le chat di Nicholas a metà turno si riprendono al ritorno', async () => {
    const b = banco([chat({ id: 'mia', sessione: 'sm' })], (t) => t >= 10_000 ? [] : undefined)
    await attendiQuiete(b.deps)
    expect(leggiPausa(b.pausa())?.sessioni).toEqual(['sm'])
  })
})

describe('avviso dopo il tetto dei 20 minuti', () => {
  it('il testo dice quante chat e quali', () => {
    expect(testoAttesa([chat({ titolo: 'Fatture' })], 0)).toEqual({ testo: 'aggiorno appena finisce: 1 chat al lavoro («Fatture»)', lungo: false })
    expect(testoAttesa([chat({ titolo: 'A' }), chat({ titolo: 'B' })], 0).testo).toBe('aggiorno appena finiscono: 2 chat al lavoro («A», «B»)')
  })
  it('dopo 20 minuti con una chat non di un autopilota ancora al lavoro: si avvisa Nicholas', () => {
    const t = testoAttesa([chat({ titolo: 'Fatture' })], AVVISO_LUNGO_MS)
    expect(t.lungo).toBe(true)
    expect(t.testo).toBe('Aspetto da 20 minuti: aggiorno appena finisce: 1 chat al lavoro («Fatture»)')
    // Solo autopiloti: finiscono il turno da soli, niente avviso.
    expect(testoAttesa([chat({ titolo: 'X', governata: true })], AVVISO_LUNGO_MS).lungo).toBe(false)
  })
  it('durante l’attesa il testo arriva a ogni giro, e diventa «lungo» dopo 20 minuti', async () => {
    const b = banco([chat({ id: 'mia', titolo: 'Fatture' })], (t) => t >= AVVISO_LUNGO_MS + 10_000 ? [] : undefined)
    await attendiQuiete({ ...b.deps, soloGovernate: true, tetto: ATTESA_DA_SOLO_MS })
    expect(b.testi[0]?.lungo).toBe(false)
    expect(b.testi.some((x) => x.lungo)).toBe(true)
  })
})

describe('controllo degli aggiornamenti', () => {
  it('ogni dieci minuti', () => {
    expect(RICONTROLLA_MS).toBe(10 * 60_000)
  })
  it('subito quando il battito di un altro PC ha una versione più nuova', () => {
    expect(serveCercareSubito({ mia: '0.66.3', altre: ['0.66.2', '0.67.0'], fase: 'aggiornato', adesso: 0 })).toBe(true)
    expect(serveCercareSubito({ mia: '0.67.0', altre: ['0.66.2', '0.67.0'], fase: 'aggiornato', adesso: 0 })).toBe(false)
    // Mai mentre si scarica, si aspetta la quiete o si installa; e non più di una volta ogni cinque minuti.
    expect(serveCercareSubito({ mia: '0.66.3', altre: ['0.67.0'], fase: 'attendo', adesso: 0 })).toBe(false)
    expect(serveCercareSubito({ mia: '0.66.3', altre: ['0.67.0'], fase: 'aggiornato', ultima: 0, adesso: 60_000 })).toBe(false)
    expect(serveCercareSubito({ mia: '0.66.3', altre: ['0.67.0'], fase: 'errore', ultima: 0, adesso: 5 * 60_000 })).toBe(true)
  })
})
