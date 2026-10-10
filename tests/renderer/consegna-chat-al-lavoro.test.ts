import { describe, it, expect } from 'vitest'
import { eseguiConsegna, ATTESA_TURNO_MAX_MS, TETTO_PRONTEZZA_MS, type Consegna, type Ponte } from '../../src/renderer/consegne-autopilota'
import { lavoraSulloSchermo } from '../../src/renderer/ultime-righe'
import { avviaRitiro, chiaveConsegna } from '../../src/main/autopilota-consegne'

// I casi del 10/10 (0.57.0 sul PC, log dalle 15:39 alle 15:43 UTC):
// - dopo l'aggiornamento il terminale della chat era sopravvissuto e la chat
//   STAVA LAVORANDO: dopo 8 s il testo è stato scritto sopra il turno in corso,
//   è rimasto nel campo («non partita, ancora in ascolto») e alla fine «non
//   consegnata»;
// - due istruzioni (c-3 alle 15:08, c-4 alle 15:12) non hanno lasciato nessuna
//   riga: il servizio era ripartito da c-1, e il Gestore le ha prese per la
//   c-3 e la c-4 di prima, già scritte. Confermate senza scriverle.

const INVIO = String.fromCharCode(13)
const TESTO = 'Leggi ed esegui le istruzioni in .sierradeck/consegne/c-2.md (dal tuo supervisore).'
const consegna = (over: Partial<Consegna> = {}): Consegna => ({
  id: 'c-2', autopilotaId: 'ap-1', chatId: 'ap-1', cwd: 'C:\\Progetti\\Esempio', sessionId: 'sess-1',
  titolo: 'Esempio', cosa: 'scrivi', testo: TESTO, ...over
})

function orologio() {
  let ora = 0
  const coda: Array<{ quando: number; cosa: () => void }> = []
  const dopo = (ms: number, cosa: () => void): void => { coda.push({ quando: ora + ms, cosa }) }
  const corri = (fino = 2 * 60 * 60_000): void => {
    for (let i = 0; i < 200_000 && coda.length > 0; i += 1) {
      coda.sort((a, b) => a.quando - b.quando)
      const p = coda.shift()!
      if (p.quando > fino) { coda.unshift(p); return }
      ora = p.quando
      p.cosa()
    }
  }
  return { dopo, corri, adesso: () => ora }
}

describe('una chat che sta lavorando non si scrive sopra (0.57.1)', () => {
  it('aspetta la fine del turno (qui 3 minuti), niente tetto di 8 s, poi scrive', () => {
    const t = orologio()
    const scritti: Array<{ a: number; testo: string }> = []
    const passi: string[] = []
    const fineTurno = 3 * 60_000
    const ponte: Ponte = {
      riquadroDi: () => ({ paneId: 'p-1', ptyId: 'pty-1' }),
      apri: () => 'p-1',
      scrivi: (_p, testo) => { scritti.push({ a: t.adesso(), testo }) },
      prontoARicevere: () => t.adesso() >= fineTurno && !scritti.some((s) => s.testo === INVIO),
      lavora: () => t.adesso() < fineTurno,
      natoDa: () => 10 * 60_000,
      partita: () => scritti.some((s) => s.testo === INVIO) ? true : undefined,
      registra: (p) => { passi.push(p) }
    }
    eseguiConsegna(consegna(), ponte, t.dopo)
    t.corri()
    const primo = scritti.find((s) => s.testo === TESTO)
    expect(primo?.a).toBeGreaterThanOrEqual(fineTurno)
    expect(passi.some((p) => p.includes('sta lavorando, aspetto'))).toBe(true)
    expect(passi.some((p) => p.includes('tetto'))).toBe(false)
    expect(passi.some((p) => p.includes('partita'))).toBe(true)
  })

  it('un turno che non finisce mai: dopo il massimo si torna alle regole di sempre, mai muti', () => {
    const t = orologio()
    const scritti: Array<{ a: number; testo: string }> = []
    const passi: string[] = []
    const ponte: Ponte = {
      riquadroDi: () => ({ paneId: 'p-1', ptyId: 'pty-1' }),
      apri: () => 'p-1',
      scrivi: (_p, testo) => { scritti.push({ a: t.adesso(), testo }) },
      prontoARicevere: () => false,
      lavora: () => true,
      registra: (p) => { passi.push(p) }
    }
    eseguiConsegna(consegna(), ponte, t.dopo)
    t.corri()
    const primo = scritti.find((s) => s.testo === TESTO)
    expect(primo?.a).toBeGreaterThanOrEqual(ATTESA_TURNO_MAX_MS)
    expect(primo?.a).toBeLessThanOrEqual(ATTESA_TURNO_MAX_MS + TETTO_PRONTEZZA_MS + 2000)
    expect(passi.some((p) => p.includes('torno alle regole di sempre'))).toBe(true)
  })

  it('un terminale di cui questa finestra non ha ancora visto niente si tratta come giovane (45 s, non 8)', () => {
    const t = orologio()
    const scritti: Array<{ a: number; testo: string }> = []
    const passi: string[] = []
    const ponte: Ponte = {
      riquadroDi: () => ({ paneId: 'p-1', ptyId: 'pty-1' }),
      apri: () => 'p-1',
      scrivi: (_p, testo) => { scritti.push({ a: t.adesso(), testo }) },
      prontoARicevere: () => t.adesso() >= 30_000 && !scritti.some((s) => s.testo === INVIO),
      natoDa: () => undefined,
      registra: (p) => { passi.push(p) }
    }
    eseguiConsegna(consegna(), ponte, t.dopo)
    t.corri()
    expect(scritti.find((s) => s.testo === TESTO)?.a).toBeGreaterThanOrEqual(30_000)
    expect(passi.some((p) => p.includes('tetto'))).toBe(false)
  })

  it('lo schermo dice «lavora» anche con la riga d’attività di un comando lungo (minuti)', () => {
    expect(lavoraSulloSchermo(['', '✻ Compiling… (1m 23s · ↓ 2.1k tokens)', '', '❯ ', ''])).toBe(true)
    expect(lavoraSulloSchermo(['● fatto', '', '❯ ', '  ⏵⏵ bypass permissions on'])).toBe(false)
  })
})

describe('il Gestore non scambia una consegna nuova per una già scritta (0.57.1)', () => {
  it('stesso id dopo un riavvio del servizio, testo diverso: si scrive', async () => {
    const scritte: string[] = []
    const confermate: string[] = []
    const giri: unknown[] = [
      { consegne: [consegna({ id: 'c-3', testo: 'la c-3 di stamattina' })] },
      // Il servizio riparte da capo: una c-3 diversa.
      { consegne: [consegna({ id: 'c-3', testo: 'le istruzioni sul portatile' })] }
    ]
    let i = 0
    const ferma = avviaRitiro({
      chiedi: async () => giri[i++] ?? {},
      consegna: (c) => { scritte.push(c.testo) },
      conferma: async (ids) => { confermate.push(...ids) },
      attesaMs: 1, attesaMaxMs: 1
    })
    await new Promise((r) => setTimeout(r, 60))
    ferma()
    expect(scritte).toEqual(['la c-3 di stamattina', 'le istruzioni sul portatile'])
    expect(confermate).toEqual(['c-3', 'c-3'])
  })

  it('la stessa consegna riproposta (conferma persa): non si riscrive', () => {
    const a = consegna({ id: 'c-3', testo: 'uguale' })
    expect(chiaveConsegna(a)).toBe(chiaveConsegna({ ...a }))
    expect(chiaveConsegna(a)).not.toBe(chiaveConsegna({ ...a, testo: 'diverso' }))
    expect(chiaveConsegna(a)).not.toBe(chiaveConsegna({ ...a, sessionId: 'altra' }))
  })
})
