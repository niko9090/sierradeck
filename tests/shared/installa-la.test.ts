import { describe, it, expect } from 'vitest'
import { inCorso, passoInstallaLa, PREPARAZIONE_ENTRO_MS, RITORNO_ENTRO_MS, type Memoria } from '@shared/installa-la'

/** 0.46.0, «Installa là»: il giro intero, passo per passo, come lo vede chi dirige. */
const T0 = Date.parse('2026-10-02T16:00:00.000Z')
const nuova = (x: Partial<Memoria> = {}): Memoria => ({ cercato: false, scaricato: false, installato: false, iniziato: T0, ...x })

describe('il giro che va bene', () => {
  it('cerca, scarica, installa, aspetta la quiete, riparte con la versione nuova', () => {
    const m = nuova()
    let p = passoInstallaLa('LAPTOP', '0.38.2', { versione: '0.38.2', stato: { fase: 'fermo' } }, m, T0)
    expect(p).toMatchObject({ fase: 'cerco', chiedi: 'cerca' })
    m.cercato = true
    p = passoInstallaLa('LAPTOP', '0.38.2', { versione: '0.38.2', stato: { fase: 'cerco' } }, m, T0 + 2000)
    expect(p.chiedi).toBeUndefined()
    p = passoInstallaLa('LAPTOP', '0.38.2', { versione: '0.38.2', stato: { fase: 'disponibile', versione: '0.46.0' } }, m, T0 + 4000)
    expect(p).toMatchObject({ fase: 'scarico', chiedi: 'scarica', a: '0.46.0' })
    m.scaricato = true
    p = passoInstallaLa('LAPTOP', '0.38.2', { versione: '0.38.2', stato: { fase: 'scarico', versione: '0.46.0', percento: 41.6 } }, m, T0 + 6000)
    expect(p.messaggio).toContain('42%')
    p = passoInstallaLa('LAPTOP', '0.38.2', { versione: '0.38.2', stato: { fase: 'pronto', versione: '0.46.0' } }, m, T0 + 8000)
    expect(p).toMatchObject({ fase: 'attendo', chiedi: 'installa' })
    m.installato = true
    p = passoInstallaLa('LAPTOP', '0.38.2', { versione: '0.38.2', stato: { fase: 'attendo', chatOccupate: 2 } }, m, T0 + 10000)
    expect(p.messaggio).toContain('2 chat stanno finendo il turno')
    p = passoInstallaLa('LAPTOP', '0.38.2', undefined, { ...m, mutoDal: T0 + 12000 }, T0 + 40000)
    expect(p).toMatchObject({ fase: 'riparte' })
    expect(p.finito).toBeUndefined()
    p = passoInstallaLa('LAPTOP', '0.38.2', { versione: '0.46.0', stato: { fase: 'aggiornato' } }, { ...m, mutoDal: T0 + 12000 }, T0 + 90000)
    expect(p).toMatchObject({ fase: 'fatto', finito: true, a: '0.46.0' })
  })
})

describe('quando va male, si dice', () => {
  it('tornato con la versione di prima e il segno del tentativo: fallito, con il motivo e la pagina', () => {
    const p = passoInstallaLa('LAPTOP', '0.38.2', {
      versione: '0.38.2',
      stato: { fase: 'fermo', tentativoFallito: { titolo: 'Ho provato a installare la 0.46.0 alle 18:01, ma sei ancora sulla 0.38.2.', motivo: 'Probabilmente Smart App Control.', strade: ['Scaricala a mano.'], pagina: 'https://github.com/niko9090/sierradeck/releases/tag/v0.46.0' } }
    }, nuova({ cercato: true, scaricato: true, installato: true, mutoDal: T0 }), T0 + 60000)
    expect(p).toMatchObject({ fase: 'fallito', finito: true, cosaFare: 'Scaricala a mano.', pagina: 'https://github.com/niko9090/sierradeck/releases/tag/v0.46.0' })
    expect(p.messaggio).toContain('Smart App Control')
  })
  it('tornato con la versione di prima senza segno: fallito lo stesso', () => {
    const p = passoInstallaLa('LAPTOP', '0.38.2', { versione: '0.38.2', stato: { fase: 'pronto', versione: '0.46.0' } }, nuova({ installato: true, mutoDal: T0 }), T0 + 60000)
    expect(p).toMatchObject({ fase: 'fallito', finito: true })
  })
  it('non torna dopo «Installa»: dopo l’attesa massima, fallito con cosa guardare', () => {
    const m = nuova({ installato: true, mutoDal: T0 })
    expect(passoInstallaLa('LAPTOP', '0.38.2', undefined, m, T0 + RITORNO_ENTRO_MS - 1000).fase).toBe('riparte')
    expect(passoInstallaLa('LAPTOP', '0.38.2', undefined, m, T0 + RITORNO_ENTRO_MS + 1000)).toMatchObject({ fase: 'fallito', finito: true })
  })
  it('l’errore di quel PC nello scaricare si riporta; «già aggiornato» dopo la ricerca pure', () => {
    expect(passoInstallaLa('LAPTOP', '0.38.2', { versione: '0.38.2', stato: { fase: 'errore', errore: 'net::ERR_INTERNET_DISCONNECTED' } }, nuova({ cercato: true }), T0)).toMatchObject({ fase: 'errore', finito: true })
    expect(passoInstallaLa('LAPTOP', '0.38.2', { versione: '0.38.2', stato: { fase: 'aggiornato' } }, nuova({ cercato: true }), T0).fase).toBe('errore')
    // Prima della ricerca, «aggiornato» e «errore» sono vecchi: si cerca.
    expect(passoInstallaLa('LAPTOP', '0.38.2', { versione: '0.38.2', stato: { fase: 'aggiornato' } }, nuova(), T0).chiedi).toBe('cerca')
  })
  it('la preparazione che non finisce mai si ferma con un messaggio', () => {
    expect(passoInstallaLa('LAPTOP', '0.38.2', { versione: '0.38.2', stato: { fase: 'scarico', percento: 3 } }, nuova({ cercato: true, scaricato: true }), T0 + PREPARAZIONE_ENTRO_MS + 1)).toMatchObject({ fase: 'errore', finito: true })
  })
  it('l’installazione già chiesta da lì si segue senza richiederla', () => {
    const p = passoInstallaLa('LAPTOP', '0.38.2', { versione: '0.38.2', stato: { fase: 'attendo' } }, nuova(), T0)
    expect(p).toMatchObject({ fase: 'attendo' })
    expect(p.chiedi).toBeUndefined()
  })
})

describe('in corso', () => {
  it('finché non è fatto, fallito o in errore', () => {
    const base = { pcId: 'l', nome: 'L', da: '0.38.2', messaggio: '', iniziato: '', aggiornato: '' }
    expect(inCorso({ ...base, fase: 'scarico' })).toBe(true)
    expect(inCorso({ ...base, fase: 'fallito' })).toBe(false)
    expect(inCorso(undefined)).toBe(false)
  })
})
