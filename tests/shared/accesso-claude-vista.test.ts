import { describe, it, expect } from 'vitest'
import type { StatoAccesso } from '@shared/accesso-claude'
import {
  avvisoAccesso, chiaveStatoAccesso, chiedeRinnovoAccesso, coloreStatoAccesso, dataCorta, testoScadenza, testoStatoAccesso
} from '@shared/accesso-claude-vista'

// A mezzogiorno UTC: la data è la stessa in ogni fuso europeo.
const SCADE = Date.parse('2027-11-16T12:00:00.000Z')
const CREATO = Date.parse('2026-11-16T12:00:00.000Z')
const con = (stato: 'valido' | 'in-scadenza' | 'scaduto' | 'rifiutato', giorniRimasti = 300): StatoAccesso =>
  ({ stato, creatoIl: CREATO, scadeIl: SCADE, giorniRimasti })

describe('accesso a Claude: le parole dello stato', () => {
  it('una riga corta per ogni stato', () => {
    expect(testoStatoAccesso(undefined)).toBe('Controllo…')
    expect(testoStatoAccesso({ stato: 'assente' })).toBe('Non impostato: le chat usano il login normale, che scade')
    expect(testoStatoAccesso({ stato: 'illeggibile', perche: 'x' })).toBe('Non si legge: rinnovalo')
    expect(testoStatoAccesso(con('valido'))).toBe('Vale fino al 16/11/2027')
    expect(testoStatoAccesso(con('in-scadenza', 9))).toBe('Scade fra 9 giorni')
    expect(testoStatoAccesso(con('scaduto', 0))).toBe('Scaduto: le chat usano il login normale')
    expect(testoStatoAccesso(con('rifiutato'))).toBe('Rifiutato da Claude')
  })

  it('oggi, domani, fra N giorni', () => {
    expect(testoScadenza(0)).toBe('Scade oggi')
    expect(testoScadenza(1)).toBe('Scade domani')
    expect(testoScadenza(2)).toBe('Scade fra 2 giorni')
    expect(dataCorta(Number.NaN)).toBe('—')
  })

  it('i colori: verde solo se vale, quieto se non c’è', () => {
    expect(coloreStatoAccesso(con('valido'))).toBe('verde')
    expect(coloreStatoAccesso(con('in-scadenza', 5))).toBe('ambra')
    expect(coloreStatoAccesso(con('scaduto', 0))).toBe('rosso')
    expect(coloreStatoAccesso(con('rifiutato'))).toBe('rosso')
    expect(coloreStatoAccesso({ stato: 'assente' })).toBe('quieto')
  })
})

describe('accesso a Claude: l’avviso in cima', () => {
  it('niente quando vale, non è impostato o non lo sappiamo', () => {
    expect(avvisoAccesso(undefined)).toBeUndefined()
    expect(avvisoAccesso({ stato: 'assente' })).toBeUndefined()
    expect(avvisoAccesso(con('valido'))).toBeUndefined()
  })

  it('scaduto e rifiutato bloccano e non si chiudono', () => {
    expect(avvisoAccesso(con('scaduto', 0))).toMatchObject({ gravita: 'blocco' })
    expect(avvisoAccesso(con('scaduto', 0))?.chiave).toBeUndefined()
    expect(avvisoAccesso(con('rifiutato'))).toMatchObject({ gravita: 'blocco' })
    expect(avvisoAccesso(con('rifiutato'))?.chiave).toBeUndefined()
  })

  it('sta per scadere: si chiude, e torna negli ultimi tre giorni', () => {
    const presto = avvisoAccesso(con('in-scadenza', 9))
    const ultimi = avvisoAccesso(con('in-scadenza', 3))
    expect(presto).toMatchObject({ gravita: 'attenzione' })
    expect(presto?.testo).toContain('scade fra 9 giorni')
    expect(presto?.chiave).toBeDefined()
    expect(ultimi?.chiave).toBeDefined()
    expect(ultimi?.chiave).not.toBe(presto?.chiave)
    expect(avvisoAccesso(con('in-scadenza', 8))?.chiave).toBe(presto?.chiave)
  })
})

describe('accesso a Claude: il resto', () => {
  it('la chiave cambia quando cambia lo stato o la scadenza', () => {
    expect(chiaveStatoAccesso(undefined)).toBe('?')
    expect(chiaveStatoAccesso({ stato: 'assente' })).not.toBe(chiaveStatoAccesso(con('valido')))
    expect(chiaveStatoAccesso(con('valido'))).toBe(chiaveStatoAccesso(con('valido', 12)))
    expect(chiaveStatoAccesso(con('scaduto', 0))).not.toBe(chiaveStatoAccesso(con('valido')))
  })

  it('riconosce la riga di chat che chiede il rinnovo', () => {
    expect(chiedeRinnovoAccesso('l’accesso a Claude è scaduto: rinnovalo con «Rinnova l’accesso a Claude» (vale un anno) o rifai il login.')).toBe(true)
    expect(chiedeRinnovoAccesso("Rinnova l'accesso a Claude")).toBe(true)
    expect(chiedeRinnovoAccesso('ho finito il lavoro')).toBe(false)
    expect(chiedeRinnovoAccesso(undefined)).toBe(false)
  })
})
