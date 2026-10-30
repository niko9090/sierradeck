import { describe, it, expect } from 'vitest'
import {
  daQuanto, gruppoStabile, LARGHEZZA_FISSA, LARGHEZZA_LINGUETTA, linguetteVisibili, ordinaSchede, riassuntoAutopilota, righeDalVivo,
  type SchedaChat
} from '@shared/panoramica'
import { nuovoAutopilota } from '@shared/autopilota'

/** 0.77.0: la Panoramica del workspace dell'autopilota (decisione di Nicholas del 16/10). */
const s = (id: string, stato: SchedaChat['stato'], nataIl: number, ruolo?: SchedaChat['ruolo']): SchedaChat => ({ id, titolo: id, stato, nataIl, ...(ruolo !== undefined ? { ruolo } : {}) })

describe('ordinaSchede', () => {
  it('gruppi aspettano te → al lavoro → ferme → finite; dentro, per ruolo e poi per nascita', () => {
    const g = ordinaSchede([
      s('rev', 'lavora', 5, 'revisione'), s('norm', 'ferma', 1), s('svil2', 'lavora', 3, 'sviluppo'),
      s('svil1', 'lavora', 2, 'sviluppo'), s('coll', 'chiede', 9, 'collaudo'), s('fine', 'finita', 0, 'sviluppo')
    ])
    expect(g.map((x) => x.gruppo)).toEqual(['chiede', 'lavora', 'ferma', 'finita'])
    expect(g.map((x) => x.schede.map((y) => y.id))).toEqual([['coll'], ['svil1', 'svil2', 'rev'], ['norm'], ['fine']])
    expect(g[0]?.nome).toBe('Aspettano te')
  })
  it('mai salti: lo stesso insieme in qualunque ordine d’arrivo dà lo stesso ordine; si muove solo chi cambia gruppo', () => {
    const base = [s('a', 'lavora', 1, 'sviluppo'), s('b', 'lavora', 2, 'sviluppo'), s('c', 'ferma', 3), s('d', 'lavora', 4, 'collaudo')]
    const piatto = (x: SchedaChat[]) => ordinaSchede(x).flatMap((g) => g.schede.map((y) => y.id))
    expect(piatto([...base].reverse())).toEqual(piatto(base))
    // «b» finisce il turno: va fra le ferme; «a» e «d» restano dove erano, l'una dopo l'altra.
    const dopo = piatto(base.map((x) => (x.id === 'b' ? { ...x, stato: 'ferma' as const } : x)))
    expect(dopo).toEqual(['a', 'd', 'b', 'c'])
  })
})

describe('linguetteVisibili', () => {
  const tante = Array.from({ length: 10 }, (_, i) => s(`c${i}`, 'ferma', i))
  // n linguette di chat, più la Panoramica.
  const larghezzaPer = (n: number): number => LARGHEZZA_FISSA + (n + 1) * LARGHEZZA_LINGUETTA
  it('se ci stanno tutte, niente «Altre»', () => {
    const r = linguetteVisibili(larghezzaPer(3), tante.slice(0, 3))
    expect(r.altre).toEqual([])
    expect(r.visibili.map((x) => x.id)).toEqual(['c0', 'c1', 'c2'])
  })
  it('le altre vanno in «Altre ▾», in ordine fisso', () => {
    const r = linguetteVisibili(larghezzaPer(4), tante)
    expect(r.visibili.map((x) => x.id)).toEqual(['c0', 'c1', 'c2', 'c3'])
    expect(r.altre.map((x) => x.id)).toEqual(['c4', 'c5', 'c6', 'c7', 'c8', 'c9'])
  })
  it('chi lavora, chi aspetta te e la chat aperta restano sempre visibili, anche oltre i posti', () => {
    const conStati = tante.map((x) => (x.id === 'c8' ? { ...x, stato: 'chiede' as const } : x.id === 'c9' ? { ...x, stato: 'lavora' as const } : x))
    const r = linguetteVisibili(larghezzaPer(3), conStati, 'c7')
    expect(r.visibili.map((x) => x.id)).toEqual(['c7', 'c8', 'c9'])
    // Più obbligate dei posti (anche sotto il minimo di 4 linguette): si vedono lo stesso tutte.
    const strette = linguetteVisibili(200, conStati, 'c7')
    expect(strette.visibili.map((x) => x.id)).toEqual(['c7', 'c8', 'c9'])
    // Le visibili restano in ordine fisso, non per stato.
    const r2 = linguetteVisibili(larghezzaPer(4), conStati)
    expect(r2.visibili.map((x) => x.id)).toEqual(['c0', 'c1', 'c8', 'c9'])
  })
})

describe('riassuntoAutopilota', () => {
  it('obiettivo in una riga, stato in una parola con il colore, criteri fatti su totali', () => {
    const a = {
      ...nuovoAutopilota({ id: 'ap-1', nome: 'N', obiettivo: '\nFai passare la suite\nsecondo paragrafo', cwd: 'C:\\p', iniziatoIl: '2026-10-16T08:00:00.000Z' }),
      stato: 'lavoro' as const
    }
    const r = riassuntoAutopilota(a, Date.parse('2026-10-16T08:01:00.000Z'))
    expect(r.obiettivo).toBe('Fai passare la suite')
    expect(r.stato.parola).toBe('al lavoro')
    expect(r.stato.colore).toBe('verde')
    expect(r.criteri).toMatchObject({ fatti: 0, totali: 0, testo: '—' })
  })
})

describe('righeDalVivo', () => {
  it('le ultime righe pulite: niente ANSI, cornici, campo vuoto, suggerimenti e barra dei permessi', () => {
    const schermo = [
      '\u001b[32m● Leggo src/somma.js\u001b[0m',
      '  ⎿  Read 12 lines',
      '● Scrivo il test',
      '✻ Brewing… (12s · esc to interrupt)',
      '────────────────────────────',
      '❯ ',
      '❯ Try "refactor <filepath>"',
      '────────────────────────────',
      '  ⏵⏵ bypass permissions on (shift+tab to cycle)',
      '  ? for shortcuts'
    ]
    expect(righeDalVivo(schermo, 3)).toEqual(['  ⎿  Read 12 lines', '● Scrivo il test', '✻ Brewing… (12s · esc to interrupt)'])
    expect(righeDalVivo(schermo)).toHaveLength(4)
    expect(righeDalVivo([])).toEqual([])
  })
})

describe('daQuanto', () => {
  it('in parole corte', () => {
    const ora = Date.parse('2026-10-16T10:00:00Z')
    expect(daQuanto(ora - 20_000, ora)).toBe('adesso')
    expect(daQuanto(ora - 3 * 60_000, ora)).toBe('da 3 min')
    expect(daQuanto(ora - 2 * 3600_000, ora)).toBe('da 2 h')
    expect(daQuanto(undefined, ora)).toBe('')
  })
})

describe('0.77.0, dalla revisione UI/UX', () => {
  it('fra 4 e 10 linguette in tutto, Panoramica compresa', () => {
    const tante = Array.from({ length: 20 }, (_, i) => s(`c${i}`, 'ferma', i))
    expect(linguetteVisibili(100, tante).visibili).toHaveLength(3)
    expect(linguetteVisibili(10_000, tante).visibili).toHaveLength(9)
  })
  it('con 12 chat e 5 al lavoro, nessuna delle 5 finisce in «Altre»', () => {
    const chat = Array.from({ length: 12 }, (_, i) => s(`c${i}`, i >= 7 ? 'lavora' : 'ferma', i))
    const r = linguetteVisibili(LARGHEZZA_FISSA + 5 * LARGHEZZA_LINGUETTA, chat)
    expect(r.altre.some((x) => x.stato === 'lavora')).toBe(false)
  })
  it('gruppo stabile: «aspetta te» subito; lavora→ferma per 3 s non sposta la scheda, dopo 8 s sì', () => {
    expect(gruppoStabile('chiede', 'lavora', 1000, 1000)).toBe('chiede')
    expect(gruppoStabile('ferma', 'lavora', 1000, 4000)).toBe('lavora')
    expect(gruppoStabile('ferma', 'lavora', 1000, 9000)).toBe('ferma')
    expect(gruppoStabile('lavora', undefined, 0, 0)).toBe('lavora')
  })
})

describe('0.77.0, dalla prova con la copia: niente rumore nelle schede', () => {
  it('via la riga di stato, i pezzi di codici colore e lo spinner ripetuto', async () => {
    const { righeDalVivo, ultimaAzioneDalVivo } = await import('@shared/panoramica')
    const schermo = [
      '⎿ $ git add src/somma.js',
      ';2;153;153m⎿ $ node --test',
      '✻ Pouncing… (20s · ↓ 231 tokens)',
      'Pouncing…Pouncing…Pouncing…',
      'Opus 5.5 · contesto 5% · 5 ore 1% (azzera 17:00)'
    ]
    expect(righeDalVivo(schermo)).toEqual(['⎿ $ git add src/somma.js', '⎿ $ node --test', '✻ Pouncing… (20s · ↓ 231 tokens)', 'Pouncing…Pouncing…Pouncing…'])
    expect(ultimaAzioneDalVivo(schermo)).toBe('⎿ $ node --test')
  })
})

describe('0.77.0: la cornice tagliata con «…» non è una riga dal vivo', () => {
  it('«────…» e «───_» spariscono', async () => {
    const { righeDalVivo } = await import('@shared/panoramica')
    expect(righeDalVivo(['● fatto', '──────────────…', '─────────────_'])).toEqual(['● fatto'])
  })
})
