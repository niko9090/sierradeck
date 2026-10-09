import { describe, it, expect } from 'vitest'
import {
  eseguiConsegna, INSISTENZA_MS, TETTO_PRONTEZZA_MS, TETTO_RIPRESA_MS, type Consegna, type Ponte
} from '../../src/renderer/consegne-autopilota'
import { consegnaPartita, contaMandati, testoPerso } from '../../src/renderer/ultime-righe'

// Il difetto del 09/10, alle 12:17, dopo l'aggiornamento alla 0.56.3: il
// riquadro era appena rinato e Claude Code riprendeva una conversazione
// lunga. Dopo 8 s senza «pronta» il testo è stato scritto lo stesso, mentre
// caricava, ed è andato perso; poi 4 + 4 invii su un campo vuoto («la chat è
// ancora in ascolto»), e la resa. Il testo non veniva riscritto perché la
// conversazione ripresa mostrava lo STESSO messaggio di una consegna
// precedente, e lo si prendeva per quello appena mandato.

const INVIO = String.fromCharCode(13)
const TESTO = 'Leggi ed esegui le istruzioni in .sierradeck/consegne/c-5.md (dal tuo supervisore).'

const consegna = (over: Partial<Consegna> = {}): Consegna => ({
  id: 'c-2', autopilotaId: 'ap-1', chatId: 'ap-1', cwd: 'C:\\Progetti\\Esempio', sessionId: 'sess-1',
  titolo: 'Esempio', cosa: 'scrivi', testo: TESTO, ...over
})

/** Un tempo finto: `dopo` mette in fila, `corri` fa passare il tempo davvero. */
function orologio() {
  let ora = 0
  const coda: Array<{ quando: number; cosa: () => void }> = []
  const dopo = (ms: number, cosa: () => void): void => { coda.push({ quando: ora + ms, cosa }) }
  const corri = (fino = 10 * 60_000): void => {
    for (let i = 0; i < 100_000 && coda.length > 0; i += 1) {
      coda.sort((a, b) => a.quando - b.quando)
      const p = coda.shift()!
      if (p.quando > fino) { coda.unshift(p); return }
      ora = p.quando
      p.cosa()
    }
  }
  return { dopo, corri, adesso: () => ora }
}

describe('dopo un riavvio la consegna aspetta che la chat che riprende sia pronta (0.56.4)', () => {
  it('terminale appena nato: niente scrittura a 8 s, si aspetta il prompt (qui a 20 s)', () => {
    const t = orologio()
    const scritti: Array<{ a: number; testo: string }> = []
    const passi: string[] = []
    const ponte: Ponte = {
      riquadroDi: () => ({ paneId: 'p-1', ptyId: 'pty-1' }),
      apri: () => 'p-1',
      scrivi: (_p, testo) => { scritti.push({ a: t.adesso(), testo }) },
      prontoARicevere: () => t.adesso() >= 20_000 && !scritti.some((s) => s.testo === INVIO),
      natoDa: () => 2_000,
      registra: (p) => { passi.push(p) }
    }
    eseguiConsegna(consegna(), ponte, t.dopo)
    t.corri()
    const primo = scritti.find((s) => s.testo === TESTO)
    expect(primo?.a).toBeGreaterThanOrEqual(20_000)
    expect(passi.some((p) => p.includes('pronta dopo'))).toBe(true)
    expect(passi.some((p) => p.includes('tetto'))).toBe(false)
  })

  it('terminale appena nato che non si fa riconoscere: tetto lungo, non 8 s', () => {
    const t = orologio()
    const scritti: number[] = []
    const passi: string[] = []
    const ponte: Ponte = {
      riquadroDi: () => ({ paneId: 'p-1', ptyId: 'pty-1' }),
      apri: () => 'p-1',
      scrivi: (_p, testo) => { if (testo === TESTO) scritti.push(t.adesso()) },
      prontoARicevere: () => false,
      partita: () => true,
      natoDa: () => 1_000,
      registra: (p) => { passi.push(p) }
    }
    eseguiConsegna(consegna(), ponte, t.dopo)
    t.corri()
    expect(scritti[0]).toBeGreaterThanOrEqual(TETTO_RIPRESA_MS)
    expect(passi.some((p) => p.includes('chat che riprende'))).toBe(true)
  })

  it('terminale vecchio: il tetto resta 8 s', () => {
    const t = orologio()
    const scritti: number[] = []
    const ponte: Ponte = {
      riquadroDi: () => ({ paneId: 'p-1', ptyId: 'pty-1' }),
      apri: () => 'p-1',
      scrivi: (_p, testo) => { if (testo === TESTO) scritti.push(t.adesso()) },
      prontoARicevere: () => false,
      partita: () => true,
      natoDa: () => 10 * 60_000
    }
    eseguiConsegna(consegna(), ponte, t.dopo)
    t.corri()
    expect(scritti[0]).toBeGreaterThanOrEqual(TETTO_PRONTEZZA_MS)
    expect(scritti[0]).toBeLessThan(TETTO_RIPRESA_MS)
  })

  it('il testo perso si riscrive anche se lo stesso messaggio è nella storia, e alla fine parte', () => {
    const t = orologio()
    // Lo schermo: la conversazione ripresa con la consegna di prima, e il campo vuoto.
    const schermo = ['❯ ' + TESTO, '', '● Fatto.', '', '────', '❯ ', '────', '  ⏵⏵ bypass permissions on']
    let nelCampo = ''
    let partita = false
    let riscritture = 0
    const passi: string[] = []
    const ponte: Ponte = {
      riquadroDi: () => ({ paneId: 'p-1', ptyId: 'pty-1' }),
      apri: () => 'p-1',
      scrivi: (_p, testo) => {
        if (testo === INVIO) { if (nelCampo !== '') partita = true; return }
        // La prima scrittura si perde (Claude Code stava caricando).
        if (riscritture++ > 0) nelCampo = testo
      },
      prontoARicevere: () => !partita,
      mandati: (_p, s) => contaMandati(schermo, s),
      partita: (_p, s, prima) => (partita ? true : consegnaPartita(schermo, s, prima)),
      perso: (_p, s, prima) => nelCampo === '' && testoPerso(schermo, s ?? '', prima),
      natoDa: () => 60 * 60_000,
      registra: (p) => { passi.push(p) }
    }
    eseguiConsegna(consegna(), ponte, t.dopo)
    t.corri()
    expect(passi.join('\n')).toContain('lo riscrivo')
    expect(passi.at(-1)).toContain('partita')
    expect(partita).toBe(true)
  })

  it('se non parte mai: insiste a intervalli crescenti, poi «non consegnata» (il servizio rimette in coda)', () => {
    const t = orologio()
    const passi: string[] = []
    const invii: number[] = []
    const ponte: Ponte = {
      riquadroDi: () => ({ paneId: 'p-1', ptyId: 'pty-1' }),
      apri: () => 'p-1',
      scrivi: (_p, testo) => { if (testo === INVIO) invii.push(t.adesso()) },
      prontoARicevere: () => true,
      natoDa: () => 60 * 60_000,
      registra: (p) => { passi.push(p) },
      segnala: () => undefined
    }
    eseguiConsegna(consegna(), ponte, t.dopo)
    t.corri()
    expect(passi.some((p) => p.includes('insisto a intervalli crescenti'))).toBe(true)
    expect(passi.at(-1)).toBe('consegna c-2: non consegnata')
    // Gli ultimi intervalli crescono: l'ultimo giro è almeno un minuto dopo il penultimo.
    const ultimi = invii.slice(-2)
    expect((ultimi[1] ?? 0) - (ultimi[0] ?? 0)).toBeGreaterThanOrEqual(INSISTENZA_MS.at(-1) ?? 0)
  })
})

describe('il conto dei messaggi già mandati (puro)', () => {
  const storia = ['❯ ' + TESTO, '● ok', '❯ altro', '────', '❯ ', '────']
  it('conta le righe uguali fra i messaggi mandati, non il campo', () => {
    expect(contaMandati(storia, TESTO)).toBe(1)
    expect(contaMandati(['────', '❯ ' + TESTO, '────'], TESTO)).toBe(0)
  })
  it('con il conto di prima, una riga uguale già in storia non vuol dire «partita»', () => {
    expect(consegnaPartita(storia, TESTO, 1)).toBeUndefined()
    expect(testoPerso(storia, TESTO, 1)).toBe(true)
    // Una in più: partita davvero.
    const dopo = ['❯ ' + TESTO, '● ok', '❯ ' + TESTO, '────', '❯ ', '────']
    expect(consegnaPartita(dopo, TESTO, 1)).toBe(true)
    expect(testoPerso(dopo, TESTO, 1)).toBe(false)
  })
})
