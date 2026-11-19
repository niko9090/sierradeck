import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { COMANDI_CHAT_WORKSPACE, righeAltriPc, fraseStatoAltroPc } from '../../src/shared/chat-workspace'
import { FUNZIONI } from '../../src/shared/menu-principale'
import { TESTO_IN_AGGIORNAMENTO } from '../../src/shared/aggiornamento-remoto'
import type { StatoSottofondo } from '../../src/shared/sottofondo'
import { ElencoChatAltriPc } from '../../src/renderer/components/PannelloChat'

const ADESSO = Date.parse('2026-11-20T12:00:00Z')
const chat = (o: Partial<StatoSottofondo>): StatoSottofondo => ({
  sessione: 's1', chat: 'sf-s1', fase: 'lavora', messaggio: '', inCoda: 0, consegnati: [],
  perChi: { id: 'pc-b', nome: 'PC-B' }, titolo: 'Chat prova', cwd: 'C:/p', dal: '', ...o
})

describe('Chat e workspace: comandi una volta sola', () => {
  it('ogni comando compare una volta e ha il suo «?»', () => {
    const ids = COMANDI_CHAT_WORKSPACE.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const c of COMANDI_CHAT_WORKSPACE) expect(c.spiega.length).toBeGreaterThan(10)
  })

  it('ci sono tutti i comandi richiesti', () => {
    const e = COMANDI_CHAT_WORKSPACE.map((c) => c.etichetta).join('|')
    for (const t of ['Nuova chat', 'Riprendi', 'Spazio delle chat', 'Crea, rinomina, elimina', 'Nuova finestra', 'Negozio']) expect(e).toContain(t)
  })

  it('le funzioni «chat» di FUNZIONI restano tutte a casa nella pagina chat', () => {
    expect(FUNZIONI.filter((f) => f.dove === 'chat').length).toBeGreaterThanOrEqual(6)
    expect(FUNZIONI.some((f) => f.funzione === 'Usate da altri PC' && f.dove === 'chat')).toBe(true)
  })

  it('la fascia in alto non ripete i comandi della pagina', () => {
    const c = readFileSync('src/renderer/components/Console.tsx', 'utf8')
    for (const t of ['↺ Riprendi', '>Spazio delle chat<', '>Nuova finestra<', 'Negozio…']) expect(c).not.toContain(t)
  })
})

describe('chat degli altri PC con lo stato del PC', () => {
  it('PC acceso', () => {
    const r = righeAltriPc([chat({})], [{ pcId: 'pc-b', nome: 'PC-B', battito: new Date(ADESSO - 60_000).toISOString() }], ADESSO)
    expect(r).toHaveLength(1)
    expect(fraseStatoAltroPc(r[0]!)).toBe('acceso')
  })

  it('PC in aggiornamento: «Computer in aggiornamento, attendere»', () => {
    const r = righeAltriPc([chat({})], [{ pcId: 'pc-b', nome: 'PC-B', battito: new Date(ADESSO - 3_600_000).toISOString(), inAggiornamento: { versione: '1.2.3' } }], ADESSO)
    expect(fraseStatoAltroPc(r[0]!)).toBe(TESTO_IN_AGGIORNAMENTO)
  })

  it('PC spento, e chat chiuse escluse', () => {
    const r = righeAltriPc([chat({}), chat({ sessione: 's2', fase: 'chiusa' })], [{ pcId: 'pc-b', nome: 'PC-B', battito: new Date(ADESSO - 3_600_000).toISOString() }], ADESSO)
    expect(r).toHaveLength(1)
    expect(fraseStatoAltroPc(r[0]!)).toContain('spento')
  })

  it('l’elenco si disegna, anche vuoto', () => {
    const r = righeAltriPc([chat({})], [], ADESSO)
    const html = renderToStaticMarkup(<ElencoChatAltriPc righe={r} onMostra={() => undefined} onChiudiChat={() => undefined} />)
    expect(html).toContain('Chat prova')
    expect(html).toContain('Mostra qui')
    expect(renderToStaticMarkup(<ElencoChatAltriPc righe={[]} onMostra={() => undefined} onChiudiChat={() => undefined} />)).toContain('Nessuna chat')
  })
})
