import { describe, it, expect } from 'vitest'
import { APP_NAME, APP_DATA_DIR_NAME, APP_DATA_DIR_PRECEDENTE } from '@shared/version'

describe('costanti applicazione', () => {
  it('espone il nome applicazione', () => {
    expect(APP_NAME).toBe('SierraDeck')
  })

  it('espone il nome della cartella dati senza spazi', () => {
    expect(APP_DATA_DIR_NAME).toBe('SierraDeck')
    expect(APP_DATA_DIR_NAME).not.toMatch(/\s/)
  })

  it('ricorda come si chiamava la cartella prima', () => {
    // Serve a `cartellaDati` per portarsi dietro autopiloti, salvataggi e nomi
    // delle chat quando il programma cambia nome. Toglierla non farebbe
    // fallire niente: farebbe sparire i dati di chi aggiorna, in silenzio.
    expect(APP_DATA_DIR_PRECEDENTE).toBe('GestoreSessioni')
    expect(APP_DATA_DIR_PRECEDENTE).not.toBe(APP_DATA_DIR_NAME)
  })
})
