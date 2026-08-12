import { describe, it, expect } from 'vitest'
import { encodeMessage, decodeMessages } from '@shared/protocol'
import type { CoreToHost, CoreToHostPty } from '@shared/protocol'

describe('protocollo a righe', () => {
  it('codifica un messaggio come JSON terminato da newline', () => {
    expect(encodeMessage({ id: 'a', kind: 'kill' })).toBe('{"id":"a","kind":"kill"}\n')
  })

  it('decodifica più messaggi completi', () => {
    const buf = '{"id":"a"}\n{"id":"b"}\n'
    const { messages, rest } = decodeMessages(buf)
    expect(messages).toEqual([{ id: 'a' }, { id: 'b' }])
    expect(rest).toBe('')
  })

  it('conserva una riga parziale come resto', () => {
    const { messages, rest } = decodeMessages('{"id":"a"}\n{"id":"par')
    expect(messages).toEqual([{ id: 'a' }])
    expect(rest).toBe('{"id":"par')
  })

  it('salta una riga malformata senza sollevare eccezioni', () => {
    const { messages } = decodeMessages('non-json\n{"id":"b"}\n')
    expect(messages).toEqual([{ id: 'b' }])
  })

  it('riporta le righe scartate invece di farle sparire', () => {
    const { messages, dropped } = decodeMessages('non-json\n{"id":"b"}\n{ rotta\n')
    expect(messages).toEqual([{ id: 'b' }])
    expect(dropped).toEqual(['non-json', '{ rotta'])
  })

  it('non riporta scarti quando tutte le righe sono valide', () => {
    expect(decodeMessages('{"id":"a"}\n').dropped).toEqual([])
  })

  it('lo spegnimento viaggia senza destinatario', () => {
    const spegnimento: CoreToHost = { kind: 'shutdown' }
    expect(encodeMessage(spegnimento)).toBe('{"kind":"shutdown"}\n')

    // Non deve esistere un id convenzionale: se ce ne fosse uno, vivrebbe
    // nello stesso spazio dei nomi degli id veri e chi instrada per id lo
    // tratterebbe come un pty.
    const decodificato = decodeMessages('{"kind":"shutdown"}\n').messages[0]
    expect(decodificato).not.toHaveProperty('id')
  })

  it('CoreToHostPty esclude lo spegnimento e conserva le altre varianti', () => {
    // Il controllo vero e' a compilazione, e le due asserzioni qui sotto sono
    // scritte per fallire davvero. La versione precedente non lo faceva:
    // `const x: CoreToHostPty = { id: 'p1', kind: 'kill' }` e un array di
    // letterali scritti a mano continuano a compilare anche se `shutdown`
    // rientra nel tipo — il primo e' un'assegnazione a un tipo piu' largo, il
    // secondo un elenco non esaustivo. Catturavano la *rimozione* di una
    // variante, non l'*inclusione* dello spegnimento, che e' cio' che il nome
    // del test promette.
    //
    // `[X] extends [never]` e non `X extends never`: quest'ultimo distribuisce
    // sull'unione vuota e si risolve in `never` invece che in `true`.
    type Assert<T extends true> = T
    type Kind = 'spawn' | 'write' | 'resize' | 'kill' | 'attach'

    type _SpegnimentoEscluso = Assert<
      [Extract<CoreToHostPty, { kind: 'shutdown' }>] extends [never] ? true : false
    >
    // Doppia direzione: la sola inclusione lascerebbe passare un tipo piu'
    // largo, e quindi una variante nuova aggiunta senza aggiornare chi instrada.
    type _VariantiEsatte = Assert<
      [CoreToHostPty['kind']] extends [Kind]
        ? [Kind] extends [CoreToHostPty['kind']]
          ? true
          : false
        : false
    >

    // A tempo di esecuzione resta poco da dimostrare: che il tipo si usi.
    const versoUnPty: CoreToHostPty = { id: 'p1', kind: 'kill' }
    expect(versoUnPty.id).toBe('p1')
  })
})
