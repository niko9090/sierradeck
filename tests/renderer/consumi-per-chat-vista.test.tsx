import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ConsumiPerChatVista, grandeDaRimasto } from '../../src/renderer/components/ConsumiPerChat'
import type { ConsumiPerChat, Rimasto } from '../../src/shared/consumi-chat'

/** k-con2: in alto quanto resta (letto, mai calcolato), sotto le chat dalla più alta. */
const ADESSO = new Date(2026, 10, 24, 12, 0, 0).getTime()
const NOTO: Rimasto = { noto: true, percentoUsato: 30, percentoRimasto: 70, azzeraIl: new Date(2026, 10, 24, 14, 20).getTime() }
const IGNOTO: Rimasto = { noto: false, motivo: 'non ancora letto' }

const dati = (x: Partial<ConsumiPerChat['rimasto']> = {}, chat: ConsumiPerChat['chat'] = []): ConsumiPerChat => ({
  versione: 1, aggiornatoIl: ADESSO, giorno: '2026-11-24', settimanaDal: '2026-11-23', pc: 'PC-prova',
  chat,
  complessivo: { oggi: chat.reduce((n, c) => n + c.oggi, 0), settimana: chat.reduce((n, c) => n + c.settimana, 0), chatOggi: chat.length, chatSettimana: chat.length },
  rimasto: { giornata: { noto: false, motivo: 'nessun limite' }, cinqueOre: NOTO, settimana: IGNOTO, ...x }
})

describe('consumi per chat: i numeri in alto', () => {
  it('il rimasto noto è la percentuale letta, con l’ora di azzeramento', () => {
    const g = grandeDaRimasto(NOTO, ADESSO)
    expect(g.valore).toBe('70%')
    expect(g.sotto).toBe('si azzera 14:20')
    expect(g.livello).toBe('')
  })

  it('un dato che manca è «non noto», senza numeri', () => {
    expect(grandeDaRimasto(IGNOTO, ADESSO)).toEqual({ valore: 'non noto', sotto: '', livello: '' })
  })

  it('poco rimasto si colora, la lettura vecchia è detta', () => {
    const g = grandeDaRimasto({ noto: true, percentoUsato: 96, percentoRimasto: 4, vecchia: true }, ADESSO)
    expect(g.valore).toBe('4%')
    expect(g.livello).toBe('rosso')
    expect(g.sotto).toContain('lettura vecchia')
    expect(g.sotto).toContain('azzeramento non noto')
  })

  it('mostra le tre voci: 5 ore, settimana e «Oggi» sempre non noto, con il suo «?»', () => {
    const html = renderToStaticMarkup(<ConsumiPerChatVista dati={dati()} adesso={ADESSO} />)
    expect(html).toContain('Resta nelle 5 ore')
    expect(html).toContain('Resta questa settimana')
    expect(html).toContain('70%')
    expect((html.match(/non noto/g) ?? []).length).toBe(2)
    expect(html).toContain('Oggi')
    expect((html.match(/aiuto__tasto/g) ?? []).length).toBeGreaterThanOrEqual(4)
  })

  it('senza dati tutto è «non noto»', () => {
    const html = renderToStaticMarkup(<ConsumiPerChatVista dati={undefined} adesso={ADESSO} />)
    expect((html.match(/non noto/g) ?? []).length).toBe(3)
    expect(html).toContain('Leggo i consumi')
  })
})

describe('consumi per chat: l’elenco', () => {
  const chat: ConsumiPerChat['chat'] = [
    { chiave: 'a', chat: 'Chat alta', workspace: 'ws-uno', pc: 'PC-prova', oggi: 12_000, settimana: 50_000 },
    { chiave: 'b', chat: 'Chat bassa', workspace: 'ws-due', pc: 'PC-prova', oggi: 300, settimana: 900 }
  ]

  it('mostra nome, workspace, PC, oggi e settimana, nell’ordine ricevuto', () => {
    const html = renderToStaticMarkup(<ConsumiPerChatVista dati={dati({}, chat)} adesso={ADESSO} />)
    expect(html.indexOf('Chat alta')).toBeGreaterThan(-1)
    expect(html.indexOf('Chat alta')).toBeLessThan(html.indexOf('Chat bassa'))
    expect(html).toContain('ws-uno · PC-prova')
    expect(html).toContain('Totale · 2 chat')
  })

  it('senza consumi lo dice', () => {
    const html = renderToStaticMarkup(<ConsumiPerChatVista dati={dati()} adesso={ADESSO} />)
    expect(html).toContain('Nessuna chat ha consumato')
  })
})
