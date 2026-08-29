import { describe, it, expect } from 'vitest'
import { scelteDiTerminale, tastiPerScegliere, GIU, SU } from '../../src/shared/scelte-terminale'

/**
 * Il difetto: dal telefono, quando la chat disegna un riquadro di scelta, non
 * c'e' niente da toccare. Il campo di testo manda parole, e un elenco non
 * aspetta parole: aspetta frecce e invio. Si vede la domanda, si sa la
 * risposta, e la chat resta ferma fino al ritorno al computer.
 */

const RIQUADRO = [
  '\u256d' + '\u2500'.repeat(40) + '\u256e',
  '\u2502 Vuoi riprendere la conversazione?      \u2502',
  '\u2502                                        \u2502',
  '\u2502 \u276f 1. Si, riprendi da dove eravamo     \u2502',
  '\u2502   2. No, comincia da capo               \u2502',
  '\u2570' + '\u2500'.repeat(40) + '\u256f'
].join('\n')

describe('riconoscere una scelta', () => {
  it('legge le opzioni dentro il riquadro, bordi esclusi', () => {
    const s = scelteDiTerminale(RIQUADRO)
    expect(s?.opzioni.map((o) => o.testo)).toEqual([
      'Si, riprendi da dove eravamo',
      'No, comincia da capo'
    ])
  })

  it('sa su quale riga e fermo il cursore', () => {
    expect(scelteDiTerminale(RIQUADRO)?.corrente).toBe(0)
  })

  it('il cursore piu in basso sposta il punto di partenza', () => {
    const s = scelteDiTerminale([
      '  1. Si',
      '\u276f 2. No',
      '  3. Chiedimelo ogni volta'
    ].join('\n'))
    expect(s?.corrente).toBe(1)
    expect(s?.opzioni[1]?.scelta).toBe(true)
  })

  it('un elenco che evidenzia in video inverso, senza glifo', () => {
    // Parecchi elenchi non disegnano nessuna freccia davanti alla riga
    // corrente: la girano e basta. Senza leggerlo, si contavano le frecce
    // dalla prima riga — cioe' si premeva invio su un'altra opzione.
    const schermo = '  1. Si\n\u001b[1;7;36m  2. No\u001b[0m\n  3. Chiedi ancora'
    expect(scelteDiTerminale(schermo)?.corrente).toBe(1)
  })

  it('un 7 dentro un altro numero non e video inverso', () => {
    // `ESC[17m` non evidenzia niente: prenderlo per un cursore sposterebbe il
    // conto delle frecce di una riga.
    const schermo = '  1. Si\n\u001b[17m  2. No\u001b[0m'
    expect(scelteDiTerminale(schermo)?.corrente).toBe(0)
  })

  it('i colori non contano', () => {
    const colorata = '\u001b[1m\u001b[36m\u276f 1. Si\u001b[0m\n\u001b[2m  2. No\u001b[0m'
    expect(scelteDiTerminale(colorata)?.opzioni).toHaveLength(2)
  })

  it('IL PUNTO: si legge l ultimo blocco, non il primo', () => {
    // Un terminale conserva anche le scelte gia' fatte piu' in alto. Prendere
    // quelle vorrebbe dire mostrare pulsanti per una domanda a cui si e' gia'
    // risposto, e premerne uno manderebbe frecce e invio dentro tutt'altro.
    const schermo = [
      '\u276f 1. Vecchia scelta A',
      '  2. Vecchia scelta B',
      '',
      'ho fatto la cosa.',
      '',
      '  1. Nuova scelta A',
      '\u276f 2. Nuova scelta B'
    ].join('\n')
    const s = scelteDiTerminale(schermo)
    expect(s?.opzioni[0]?.testo).toBe('Nuova scelta A')
    expect(s?.corrente).toBe(1)
  })
})

describe('quando NON e una scelta', () => {
  it('una riga numerata sola non lo e', () => {
    expect(scelteDiTerminale('1. una cosa sola')).toBeUndefined()
  })

  it('un elenco che non parte da uno nemmeno', () => {
    // Numeri sparsi dentro una risposta scritta: mostrarli come pulsanti
    // vorrebbe dire offrire di premere invio su del testo.
    expect(scelteDiTerminale('  3. terzo punto\n  4. quarto punto')).toBeUndefined()
  })

  it('un terminale che sta solo scrivendo non offre niente', () => {
    expect(scelteDiTerminale('costruisco...\nfatto in 3.2s\n')).toBeUndefined()
  })

  it('senza cursore si assume la prima, non si indovina', () => {
    const s = scelteDiTerminale('  1. Si\n  2. No')
    expect(s?.corrente).toBe(0)
  })
})

describe('i tasti da premere', () => {
  it('scendere e salire, tante volte quanto serve', () => {
    expect(tastiPerScegliere(0, 2)).toBe(GIU + GIU)
    expect(tastiPerScegliere(2, 0)).toBe(SU + SU)
  })

  it('gia sulla riga giusta: nessuna freccia, resta il solo invio', () => {
    // E' il caso normale — la prima opzione e' quasi sempre quella evidenziata
    // — quindi la sequenza vuota deve essere legittima, non un errore.
    expect(tastiPerScegliere(0, 0)).toBe('')
  })
})
