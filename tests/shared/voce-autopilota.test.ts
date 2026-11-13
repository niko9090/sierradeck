import { describe, it, expect } from 'vitest'
import {
  accoda, aPezzi, battuteDaDire, chiaveBattuta, comandoVocale, DETTO_MAX, FILA_MAX, FILA_VUOTA, fineAscolto, finita, fraseDiBattuta,
  inizioAscolto, prossima, ripeti, subito, testoDaDire, zitto, type FilaVoce
} from '@shared/voce-autopilota'
import type { Battuta } from '@shared/chat-autopilota'

describe('testo da dire', () => {
  it('toglie codice, link, percorsi, sigle e segni del markdown', () => {
    const t = testoDaDire('## Fatto\n- ho corretto `src/main/dettatura.ts` (k-12)\n```ts\nconst x = 1\n```\nVedi https://example.com/x e C:\\Users\\qualcuno\\file.txt, commit 76e83f72.')
    expect(t).not.toMatch(/```|https?:|C:\\|k-12|76e83f72|##|`/)
    expect(t).toContain('Fatto')
    expect(t).toContain('ho corretto')
    expect(t).toContain('un link')
    expect(t).toMatch(/codice: lo trovi nella chat/)
  })
  it('solo codice: una frase che lo dice', () => {
    expect(testoDaDire('```\nnpm run x\n```')).toBe('Ti ha scritto del codice: lo trovi nella chat.')
  })
  it('un testo lungo si taglia sulle frasi, e dice dove sta il resto', () => {
    const lungo = Array.from({ length: 30 }, (_, i) => `Questa è la frase numero ${i}.`).join(' ')
    const t = testoDaDire(lungo)
    expect(t.length).toBeLessThanOrEqual(DETTO_MAX + 30)
    expect(t).toMatch(/frase numero 0\./)
    expect(t).toMatch(/Il resto è nella chat\.$/)
  })
  it('un testo breve resta com’è', () => {
    expect(testoDaDire('Va bene, ci penso io.')).toBe('Va bene, ci penso io.')
  })
  it('a pezzi sulle frasi', () => {
    const p = aPezzi('Uno due tre. Quattro cinque. Sei.', 15)
    expect(p).toEqual(['Uno due tre.', 'Quattro cinque.', 'Sei.'])
    expect(aPezzi('corto')).toEqual(['corto'])
  })
})

describe('comandi detti', () => {
  it('riconosce i comandi brevi, anche con la punteggiatura della dettatura', () => {
    expect(comandoVocale('Riassunto.')).toBe('riassunto')
    expect(comandoVocale('fammi il riassunto per favore')).toBe('riassunto')
    expect(comandoVocale('Riassunto generale.')).toBe('generale')
    expect(comandoVocale('Basta')).toBe('zitto')
    expect(comandoVocale('ripeti')).toBe('ripeti')
  })
  it('una frase lunga o «fermati» sono messaggi all’autopilota', () => {
    expect(comandoVocale('fermati')).toBeUndefined()
    expect(comandoVocale('fai un riassunto delle modifiche nel file del progetto')).toBeUndefined()
    expect(comandoVocale('sì')).toBeUndefined()
  })
})

describe('battute nuove da dire', () => {
  const b = (quando: string, da: Battuta['da'], testo: string, extra: Partial<Battuta> = {}): Battuta => ({ quando, da, testo, ...extra })
  const storia = [b('2026-11-13T10:00:00Z', 'tu', 'ciao'), b('2026-11-13T10:01:00Z', 'lui', 'eccomi'), b('2026-11-13T10:02:00Z', 'nota', 'parte lo sviluppatore')]
  it('accendendo la voce la storia vecchia è già vista; poi solo le sue nuove', () => {
    const viste = new Set(storia.map(chiaveBattuta))
    expect(battuteDaDire(storia, viste)).toEqual([])
    const dopo = [...storia, b('2026-11-13T10:05:00Z', 'tu', 'e allora?'), b('2026-11-13T10:06:00Z', 'nota', 'unito'), b('2026-11-13T10:07:00Z', 'lui', 'Fatto.')]
    expect(battuteDaDire(dopo, viste).map((x) => x.testo)).toEqual(['Fatto.'])
  })
  it('una domanda si annuncia con le scelte', () => {
    const f = fraseDiBattuta(b('x', 'lui', 'Pubblico la 0.106.0?', { tono: 'domanda', domanda: { id: 'q', scelte: ['Sì', 'No, aspetta'] } }))
    expect(f).toBe('Ha una domanda per te. Pubblico la 0.106.0? Puoi rispondere: Sì, oppure No, aspetta.')
  })
})

describe('la fila della voce', () => {
  const f = (id: string): { id: string; testo: string } => ({ id, testo: `frase ${id}` })
  it('una alla volta, in ordine', () => {
    let s: FilaVoce = accoda(accoda(FILA_VUOTA, f('a')), f('b'))
    let p = prossima(s)
    expect(p.dire?.id).toBe('a')
    s = p.stato
    expect(prossima(s).dire).toBeUndefined()
    s = finita(s, 'a')
    p = prossima(s)
    expect(p.dire?.id).toBe('b')
  })
  it('non parla mentre parli tu; la frase interrotta torna in testa', () => {
    let s = prossima(accoda(accoda(FILA_VUOTA, f('a')), f('b'))).stato
    s = inizioAscolto(s)
    expect(s.parla).toBeUndefined()
    expect(prossima(s).dire).toBeUndefined()
    s = accoda(s, f('c'))
    expect(prossima(s).dire).toBeUndefined()
    s = fineAscolto(s)
    expect(s.fila.map((x) => x.id)).toEqual(['a', 'b', 'c'])
    expect(prossima(s).dire?.id).toBe('a')
  })
  it('la stessa frase non entra due volte', () => {
    const s = accoda(accoda(FILA_VUOTA, f('a')), f('a'))
    expect(s.fila).toHaveLength(1)
  })
  it('oltre il tetto le più vecchie diventano «altre novità»', () => {
    let s = FILA_VUOTA
    for (const id of ['1', '2', '3', '4', '5', '6']) s = accoda(s, f(id))
    expect(s.fila).toHaveLength(FILA_MAX)
    expect(s.fila[0]!.testo).toBe('Ci sono altre 3 novità: le trovi nella chat.')
    expect(s.fila.slice(1).map((x) => x.id)).toEqual(['4', '5', '6'])
    s = accoda(s, f('7'))
    expect(s.fila[0]!.testo).toBe('Ci sono altre 4 novità: le trovi nella chat.')
  })
  it('subito prende il posto di tutto; zitto svuota; ripeti ridice l’ultima', () => {
    let s = prossima(accoda(accoda(FILA_VUOTA, f('a')), f('b'))).stato
    s = subito(s, [f('r1'), f('r2')])
    expect(s.parla).toBeUndefined()
    expect(s.fila.map((x) => x.id)).toEqual(['r1', 'r2'])
    s = finita(prossima(s).stato, 'r1')
    s = zitto(s)
    expect(s.fila).toEqual([])
    s = ripeti(s)
    expect(s.fila[0]!.testo).toBe('frase r1')
    expect(s.fila[0]!.id).not.toBe('r1')
  })
})
