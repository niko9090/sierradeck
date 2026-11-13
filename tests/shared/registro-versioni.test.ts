import { describe, it, expect } from 'vitest'
import {
  aperteAllInizio, dataBreve, megabyte, registroAggiornamento, registroInstallata, riassuntoRegistro, tempoRimasto, testoScaricamento,
  tipoVersione, voceDaPezzi, vociDaBlocchi
} from '../../src/shared/registro-versioni'
import { analizzaMarkdown, analizzaRiga, daRilasciGithub, raccogliNote, type NotaResa } from '../../src/shared/note-aggiornamento'

/** Il registro delle versioni nella finestra degli aggiornamenti (13/11). */
const nota = (versione: string, md: string, data?: string): NotaResa & { data?: string } => ({ versione, blocchi: analizzaMarkdown(md), ...(data !== undefined ? { data } : {}) })

describe('tipoVersione', () => {
  it('patch = correzioni, minor = novità, major = grande', () => {
    expect(tipoVersione('0.106.1')).toBe('correzioni')
    expect(tipoVersione('0.106.0')).toBe('novita')
    expect(tipoVersione('1.0.0')).toBe('grande')
    expect(tipoVersione('0.0.0')).toBe('novita')
    expect(tipoVersione('non-versione')).toBe('novita')
  })
})

describe('le righe «**Titolo:** testo»', () => {
  it('titolo in grassetto e testo separati', () => {
    expect(voceDaPezzi(analizzaRiga('**Si apre di nuovo:** la 0.106.0 si fermava.'))).toEqual({ titolo: 'Si apre di nuovo', testo: [{ testo: 'La 0.106.0 si fermava.' }] })
  })
  it('anche con i due punti fuori dal grassetto', () => {
    expect(voceDaPezzi(analizzaRiga('**Invio manda**: va a capo con Maiusc.'))).toEqual({ titolo: 'Invio manda', testo: [{ testo: 'Va a capo con Maiusc.' }] })
  })
  it('una riga senza titolo resta tutta testo; un grassetto in mezzo non è un titolo', () => {
    expect(voceDaPezzi(analizzaRiga('Testo semplice.'))).toEqual({ testo: [{ testo: 'Testo semplice.' }] })
    const v = voceDaPezzi(analizzaRiga('**Importante** senza due punti'))
    expect(v.titolo).toBeUndefined()
  })
  it('il resto della riga tiene stili e link ammessi', () => {
    const v = voceDaPezzi(analizzaRiga('**Pagina:** vedi [qui](https://github.com/esempio/esempio) e `codice`.'))
    expect(v.titolo).toBe('Pagina')
    expect(v.testo.some((p) => p.link === 'https://github.com/esempio/esempio')).toBe(true)
    expect(v.testo.some((p) => p.codice === true)).toBe(true)
  })
  it('dai blocchi: elenchi e paragrafi diventano voci, le intestazioni generiche si saltano', () => {
    const voci = vociDaBlocchi(analizzaMarkdown('## Novità\n\n- **A:** uno\n\n- **B:** due\n\nUn paragrafo.\n\n## Per chi sviluppa'))
    expect(voci.map((v) => v.titolo ?? v.testo.map((p) => p.testo).join(''))).toEqual(['A', 'B', 'Un paragrafo.', 'Per chi sviluppa'])
  })
  it('il corpo di una release com’è scritto: il titolo col numero si salta, la parte dell’Aiutante non entra', () => {
    const corpo = [
      '## SierraDeck 0.106.1', '',
      '- **Si apre di nuovo:** la finestra restava vuota.', '',
      '<!-- aiutante -->', '### SierraDeck Aiutante 1.0.1', '',
      'Allegato anche l’installer.', '', '- Si aggiorna da solo.'
    ].join('\n')
    const voci = vociDaBlocchi(analizzaMarkdown(corpo))
    expect(voci).toEqual([{ titolo: 'Si apre di nuovo', testo: [{ testo: 'La finestra restava vuota.' }] }])
  })
})

describe('registroAggiornamento: la nuova e tutte le saltate', () => {
  const note = [
    nota('0.106.2', '- **C:** tre', '2026-11-14T09:00:00Z'),
    nota('0.106.1', '- **B:** due'),
    nota('0.106.0', '- **A:** uno'),
    nota('0.105.2', '- **Vecchia:** già installata'),
    nota('0.107.0', '- **Futura:** dopo la nuova'),
    nota('0.106.1', '- **Doppione:** non entra')
  ]
  it('solo dopo la installata e fino alla nuova, dalla più recente, senza doppioni', () => {
    const r = registroAggiornamento(note, '0.105.2', '0.106.2')
    expect(r.map((v) => v.versione)).toEqual(['0.106.2', '0.106.1', '0.106.0'])
    expect(r.map((v) => v.ruolo)).toEqual(['nuova', 'saltata', 'saltata'])
    expect(r.map((v) => v.tipo)).toEqual(['correzioni', 'correzioni', 'novita'])
    expect(r[1]!.voci[0]!.titolo).toBe('B')
  })
  it('la data c’è solo dove si sa', () => {
    const r = registroAggiornamento(note, '0.105.2', '0.106.2')
    expect(r[0]!.data).toBe('2026-11-14T09:00:00Z')
    expect('data' in r[1]!).toBe(false)
  })
  it('in ordine anche se le note arrivano in disordine', () => {
    const r = registroAggiornamento([nota('0.106.0', 'x'), nota('0.106.2', 'y'), nota('0.106.1', 'z')], '0.105.9', '0.106.2')
    expect(r.map((v) => v.versione)).toEqual(['0.106.2', '0.106.1', '0.106.0'])
  })
  it('aperte all’inizio: tutte se sono fino a 3, altrimenti la nuova e quelle con novità', () => {
    expect([...aperteAllInizio(registroAggiornamento(note, '0.105.2', '0.106.2'))]).toEqual(['0.106.2', '0.106.1', '0.106.0'])
    const tante = registroAggiornamento([nota('0.106.3', 'a'), ...note], '0.105.2', '0.106.3')
    expect([...aperteAllInizio(tante)]).toEqual(['0.106.3', '0.106.0'])
  })
  it('il riassunto conta novità e correzioni', () => {
    expect(riassuntoRegistro(registroAggiornamento(note, '0.105.2', '0.106.2'), '0.105.2')).toBe('3 versioni dopo la 0.105.2: 1 con novità, 2 di correzioni')
    expect(riassuntoRegistro(registroAggiornamento(note, '0.106.1', '0.106.2'), '0.106.1')).toBe('1 versione dopo la 0.106.1: 1 di correzioni')
  })
})

describe('registroInstallata: «Sei aggiornato»', () => {
  const novita = [
    { versione: '0.106.2', righe: ['**Futura:** non ancora installata'] },
    { versione: '0.106.1', righe: ['**Si apre:** corretto'] },
    { versione: '0.106.0', righe: ['**Altri PC:** sezione', '**Gestione:** progetti'] },
    { versione: '0.105.2', righe: ['**Git:** locale'] }
  ]
  it('la installata in cima, poi le prima; mai quelle dopo', () => {
    const r = registroInstallata(novita, '0.106.1', analizzaRiga, 2)
    expect(r.map((v) => [v.versione, v.ruolo])).toEqual([['0.106.1', 'installata'], ['0.106.0', 'precedente']])
    expect(r[1]!.voci.map((v) => v.titolo)).toEqual(['Altri PC', 'Gestione'])
    expect([...aperteAllInizio(r)]).toEqual(['0.106.1'])
    expect(riassuntoRegistro(r, '0.106.1')).toBe('La versione installata e le 1 prima')
  })
})

describe('le date', () => {
  it('daRilasciGithub prende published_at; raccogliNote la porta fino alla nota, e usa releaseDate per la nuova', async () => {
    const json = [
      { tag_name: 'v1.2.0', body: '- **A:** uno', published_at: '2026-11-13T08:00:00Z' },
      { tag_name: 'v1.1.0', body: '- **B:** due', published_at: 'non una data' }
    ]
    const g = daRilasciGithub(json)
    expect(g[0]!.data).toBe('2026-11-13T08:00:00.000Z')
    expect(g[1]!.data).toBeUndefined()
    const n = await raccogliNote({ installata: '1.0.0', nuova: '1.2.0', rilasci: async () => json })
    expect(n.note.map((x) => x.data)).toEqual(['2026-11-13T08:00:00.000Z', undefined])
    const solo = await raccogliNote({ installata: '1.0.0', nuova: '1.2.0', releaseNotes: '<ul><li>uno</li></ul>', dataNuova: '2026-11-12T00:00:00Z' })
    expect(solo.note[0]!.data).toBe('2026-11-12T00:00:00.000Z')
  })
  it('dataBreve in italiano, senza Intl', () => {
    expect(dataBreve('2026-11-13T12:00:00Z')).toBe('13 nov 2026')
    expect(dataBreve(undefined)).toBeUndefined()
    expect(dataBreve('boh')).toBeUndefined()
  })
})

describe('le misure dello scaricamento', () => {
  const mb = 1024 * 1024
  it('megabyte con la virgola', () => {
    expect(megabyte(1.5 * mb)).toBe('1,5 MB')
    expect(megabyte(150 * mb)).toBe('150 MB')
  })
  it('tempo che manca a parole', () => {
    expect(tempoRimasto(4)).toBe('meno di 10 s')
    expect(tempoRimasto(42)).toBe('circa 40 s')
    expect(tempoRimasto(185)).toBe('circa 3 min')
    expect(tempoRimasto(3900)).toBe('circa 1 h 5 min')
    expect(tempoRimasto(Number.NaN)).toBe('')
  })
  it('la riga intera, e solo le parti che si sanno', () => {
    expect(testoScaricamento({ scaricati: 32 * mb, totale: 72 * mb, velocita: 2 * mb })).toBe('32,0 di 72,0 MB · 2,0 MB/s · ancora circa 20 s')
    expect(testoScaricamento({ scaricati: 32 * mb, totale: 72 * mb })).toBe('32,0 di 72,0 MB')
    expect(testoScaricamento({})).toBe('')
  })
})
