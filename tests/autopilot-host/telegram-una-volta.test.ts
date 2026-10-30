import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { diciTelegramAssente, dimenticaTelegramAssente, RIGA_TELEGRAM_ASSENTE } from '../../src/autopilot-host/index'

/**
 * Audit M7 (0.86.2): «nessuna configurazione Telegram» stava 72 volte nel
 * registro. La riga partiva a ogni avvio del servizio, anche dei doppioni che
 * escono subito perché la porta è già presa.
 */
describe('Telegram assente: detto una volta', () => {
  beforeEach(() => { dimenticaTelegramAssente() })

  it('72 richieste, una riga', () => {
    const righe: string[] = []
    for (let i = 0; i < 72; i += 1) diciTelegramAssente(undefined, (r) => { righe.push(r) })
    expect(righe).toEqual([RIGA_TELEGRAM_ASSENTE])
  })

  it('con la configurazione non dice niente', () => {
    const righe: string[] = []
    expect(diciTelegramAssente({ token: 'x', chat: 'y' }, (r) => { righe.push(r) })).toBe(false)
    expect(righe).toEqual([])
  })

  it('la dice il servizio in ascolto, non chi parte e trova la porta occupata', () => {
    const sorgente = readFileSync('src/autopilot-host/index.ts', 'utf8')
    const ascolto = sorgente.indexOf("server.listen(PORTA, '127.0.0.1', () => {")
    const chiamata = sorgente.indexOf('diciTelegramAssente(configurazione)')
    expect(ascolto).toBeGreaterThan(0)
    expect(chiamata).toBeGreaterThan(ascolto)
    expect(sorgente.match(/console\.warn\('\[autopilota\] nessuna configurazione Telegram/g)).toBeNull()
  })
})
