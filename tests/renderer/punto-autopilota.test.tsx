import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PuntoAutopilota } from '../../src/renderer/components/PuntoAutopilota'
import { nuovoAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'

/**
 * 0.84.3: il Punto in cima alla conversazione dell'autopilota sul PC, con il
 * segnale di ogni chat e senza sigle. Nella Panoramica le chat le dice già la
 * sua sezione «Adesso»: lì il Punto non le ripete.
 */
const ORA = Date.now()
const iso = (ms: number): string => new Date(ms).toISOString()
const chat = (id: string, x: Partial<ChatGovernata> = {}): ChatGovernata =>
  ({ id, compito: `Il compito di ${id}.`, stato: 'lavoro', cicli: 2, sessionId: `s-${id}`, dal: iso(ORA - 5 * 60_000), ...x })
const ap = {
  ...nuovoAutopilota({ id: 'ap-1', nome: 'Prova', obiettivo: 'x', cwd: 'C:\\p', criteri: [{ descrizione: 'a', soddisfatto: true }, { descrizione: 'b', soddisfatto: false }], iniziatoIl: iso(ORA - 60 * 60_000) }),
  stato: 'lavoro',
  segniDal: iso(ORA - 30 * 60_000),
  segniChat: { 'c-3': iso(ORA - 60_000) },
  chats: [
    chat('c-3', { ruolo: 'sviluppo', compito: 'Il menu nuovo (c-3).', segnale: { tipo: 'bloccata', quando: iso(ORA - 60_000), dichiarato: true, motivo: 'manca la chiave' } }),
    chat('c-5', { compito: 'Il motore', stato: 'finita' })
  ],
  compitiDaFare: ['Le notifiche']
} as Autopilota

describe('il Punto sul PC', () => {
  it('passo, chat col segnale, finito, dopo, da te', () => {
    const html = renderToStaticMarkup(<PuntoAutopilota autopilota={ap} />)
    expect(html).toContain('Punto')
    expect(html).toContain('Lavora: 1 di 2 criteri soddisfatti')
    expect(html).toContain('Sviluppo')
    expect(html).toContain('Il menu nuovo')
    expect(html).toContain('■ bloccata: manca la chiave')
    expect(html).toContain('var(--rosso')
    expect(html).toContain('Finito:')
    expect(html).toContain('Il motore')
    expect(html).toContain('Dopo:')
    expect(html).toContain('Le notifiche')
    expect(html).toContain('niente, va avanti da solo.')
    expect(html).not.toMatch(/\bc-\d/)
  })

  it('nella Panoramica senza le righe delle chat', () => {
    const html = renderToStaticMarkup(<PuntoAutopilota autopilota={ap} senzaChat />)
    expect(html).toContain('Lavora: 1 di 2 criteri soddisfatti')
    expect(html).not.toContain('manca la chiave')
  })
})
