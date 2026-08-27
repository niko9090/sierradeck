import { describe, it, expect } from 'vitest'
import {
  pianificaFlotta, chiatteAttive, dopoAvvioFallito, tentativiDi, TENTATIVI_AVVIO_MAX,
  type StatoChat
} from '../../src/autopilot-host/flotta'

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

describe('dopoAvvioFallito', () => {
  // Il difetto: `apriChatMancanti` toglie i compiti dalla coda e registra le
  // chat **prima** di avviare i processi (giusto: una chat viva e non registrata
  // resterebbe orfana per sempre). Se poi l'avvio falliva, il catch scriveva nel
  // log e basta — il compito era gia' uscito dalla coda e restava una chat in
  // «lavoro» che non girava. E siccome `chiatteAttive` conta proprio quelle, il
  // fantasma teneva un posto della flotta per sempre.
  const chat = (id: string, compito: string, stato: StatoChat['stato'] = 'lavoro'): StatoChat =>
    ({ id, compito, stato, cicli: 0 })

  it('chiude la chat fantasma, cosi il posto torna libero', () => {
    const prima = { chats: [chat('c-1', 'A'), chat('c-2', 'B')], compitiDaFare: ['C'] }
    const dopo = dopoAvvioFallito(prima, 'c-2')
    expect(dopo.chats.find((c) => c.id === 'c-2')?.stato).toBe('finita')
    // Il posto e' tornato libero: prima erano due attive, ora una.
    expect(chiatteAttive(dopo.chats)).toHaveLength(1)
    // E l'altra non e' stata toccata.
    expect(dopo.chats.find((c) => c.id === 'c-1')?.stato).toBe('lavoro')
  })

  it('rimette il compito in coda, in fondo', () => {
    // In fondo e non in testa: ritentarlo subito vorrebbe dire ritentarlo contro
    // la stessa causa che l'ha appena fatto fallire.
    const prima = { chats: [chat('c-1', 'A')], compitiDaFare: ['B', 'C'] }
    const dopo = dopoAvvioFallito(prima, 'c-1')
    expect(dopo.compitiDaFare).toEqual(['B', 'C', 'A'])
    expect(dopo.abbandonato).toBe(false)
  })

  it('dopo troppi tentativi lo lascia, invece di riprovare per sempre', () => {
    // Se la causa e' stabile — claude.exe che non parte, una cartella sparita —
    // rimettere il compito in coda all'infinito aprirebbe una chat al secondo,
    // per sempre, senza che niente lo dica.
    const storia = Array.from({ length: TENTATIVI_AVVIO_MAX }, (_, i) => chat(`c-${i + 1}`, 'A', 'finita'))
    const prima = { chats: [...storia, chat('c-x', 'A')], compitiDaFare: [] }
    const dopo = dopoAvvioFallito(prima, 'c-x')
    expect(dopo.abbandonato).toBe(true)
    expect(dopo.compitiDaFare).toEqual([])
    expect(dopo.chats.find((c) => c.id === 'c-x')?.stato).toBe('finita')
  })

  it('un id che non c e non cambia niente', () => {
    const prima = { chats: [chat('c-1', 'A')], compitiDaFare: ['B'] }
    const dopo = dopoAvvioFallito(prima, 'c-9')
    expect(dopo.chats).toBe(prima.chats)
    expect(dopo.compitiDaFare).toBe(prima.compitiDaFare)
  })

  it('i tentativi si contano dalla storia delle chat, senza campi nuovi su disco', () => {
    // Le chat non si tolgono mai dall'elenco: l'elenco **e'** la storia.
    const chats = [chat('c-1', 'A', 'finita'), chat('c-2', 'B'), chat('c-3', 'A')]
    expect(tentativiDi(chats, 'A')).toBe(2)
    expect(tentativiDi(chats, 'B')).toBe(1)
    expect(tentativiDi(chats, 'Z')).toBe(0)
  })
})
