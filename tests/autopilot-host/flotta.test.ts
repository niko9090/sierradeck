import { describe, it, expect } from 'vitest'
import { pianificaFlotta, chiatteAttive, type StatoChat } from '../../src/autopilot-host/flotta'

function chat(over: Partial<StatoChat> = {}): StatoChat {
  return { id: 'c-1', compito: 'compito', stato: 'lavoro', cicli: 0, ...over }
}

describe('chiatteAttive', () => {
  it('conta solo le chat che stanno lavorando', () => {
    const chats = [chat({ id: 'a' }), chat({ id: 'b', stato: 'finita' }), chat({ id: 'c' })]
    expect(chiatteAttive(chats).map((c) => c.id)).toEqual(['a', 'c'])
  })
})

describe('pianificaFlotta', () => {
  it('apre la prima chat quando non ce n e nessuna', () => {
    const piano = pianificaFlotta({ chats: [], compitiDaFare: ['scrivi i test'], tetto: 3 })
    expect(piano.daAprire).toEqual(['scrivi i test'])
  })

  it('non supera il tetto di chat contemporanee', () => {
    // Il tetto non e' prudenza generica: ogni chat e' un claude.exe che consuma,
    // e sei chat sulla stessa cartella si pestano i piedi sui file.
    const piano = pianificaFlotta({
      chats: [chat({ id: 'a' }), chat({ id: 'b' })],
      compitiDaFare: ['uno', 'due', 'tre'],
      tetto: 3
    })
    expect(piano.daAprire).toEqual(['uno'])
  })

  it('non apre niente quando il tetto e gia raggiunto', () => {
    const piano = pianificaFlotta({
      chats: [chat({ id: 'a' }), chat({ id: 'b' }), chat({ id: 'c' })],
      compitiDaFare: ['uno'],
      tetto: 3
    })
    expect(piano.daAprire).toEqual([])
  })

  it('le chat finite liberano posto per quelle nuove', () => {
    const piano = pianificaFlotta({
      chats: [chat({ id: 'a', stato: 'finita' }), chat({ id: 'b' })],
      compitiDaFare: ['uno', 'due'],
      tetto: 2
    })
    expect(piano.daAprire).toEqual(['uno'])
  })

  it('chiude le chat che hanno finito il proprio compito', () => {
    const piano = pianificaFlotta({
      chats: [chat({ id: 'a', stato: 'finita' }), chat({ id: 'b' })],
      compitiDaFare: [],
      tetto: 3
    })
    expect(piano.daChiudere).toEqual(['a'])
  })

  it('dice che il lavoro e concluso quando non resta niente da fare ne da aspettare', () => {
    const piano = pianificaFlotta({ chats: [chat({ id: 'a', stato: 'finita' })], compitiDaFare: [], tetto: 3 })
    expect(piano.concluso).toBe(true)
  })

  it('non e concluso finche una chat lavora', () => {
    const piano = pianificaFlotta({ chats: [chat({ id: 'a' })], compitiDaFare: [], tetto: 3 })
    expect(piano.concluso).toBe(false)
  })

  it('non e concluso finche restano compiti da assegnare', () => {
    // Anche se in questo giro non c'e' posto per aprirli.
    const piano = pianificaFlotta({
      chats: [chat({ id: 'a' })], compitiDaFare: ['ancora uno'], tetto: 1
    })
    expect(piano.concluso).toBe(false)
  })

  it('una chat bloccata non tiene in ostaggio il lavoro', () => {
    // Una chat che aspetta una risposta non conta come attiva: il posto va
    // liberato per gli altri compiti, altrimenti un solo bivio fermerebbe tutto.
    const piano = pianificaFlotta({
      chats: [chat({ id: 'a', stato: 'bloccata' })], compitiDaFare: ['uno'], tetto: 1
    })
    expect(piano.daAprire).toEqual(['uno'])
    expect(piano.concluso).toBe(false)
  })
})
