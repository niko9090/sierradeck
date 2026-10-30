import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { aperteSulloStesso, argomentoDi, risoltaDalloStato, rispostaGiaData, stessoArgomento } from '../../src/autopilot-host/domande-doppie'
import { REGOLE_DOMANDA, sembraNonItaliano, validaDomanda } from '@shared/domanda-strutturata'

/**
 * Nessuna domanda ripetuta, sempre in italiano (0.81.0).
 *
 * Il caso vero, 20/10: «Installi tu la 0.80.0 su questo PC?» da una chat e
 * «Will you install the 0.80.0 on this PC?» da un'altra, aperte insieme,
 * quando sul PC girava già la 0.80.1. Nicholas ha risposto due volte.
 */

const IT = 'Installi tu la 0.80.0 su questo PC, così chiudo le chat finite c-7, c-10 e c-12?'
const EN = 'Will you install the 0.80.0 on this PC so finished chats close on their own?'

describe('l argomento di una domanda', () => {
  it('riconosce «installare la stessa versione» in due lingue', () => {
    expect(argomentoDi(IT)).toEqual({ installa: true, pubblica: false, versioni: ['0.80.0'] })
    expect(stessoArgomento(IT, EN)).toBe(true)
  })

  it('non confonde versioni diverse, né disinstallare con installare', () => {
    expect(stessoArgomento(IT, 'Installi la 0.81.0?')).toBe(false)
    expect(stessoArgomento(IT, 'Disinstallo la 0.80.0 dal portatile?')).toBe(false)
    expect(stessoArgomento('Pubblico la 0.80.0?', 'Pubblico la 0.80.0 adesso?')).toBe(false)
    // Le stesse versioni, non una in comune (Revisione 0.81.0).
    expect(stessoArgomento('Installi la 0.80.0 o la 0.80.1?', 'Installi la 0.80.1?')).toBe(false)
  })

  it('un numero di pacchetto non è una versione del programma', () => {
    expect(argomentoDi('Installo vitest 0.34.6 nel progetto?').versioni).toEqual([])
    expect(argomentoDi('Installi la v0.80.1 e poi SierraDeck 0.81.0?').versioni).toEqual(['0.80.1', '0.81.0'])
  })
})

describe('lo stato vero', () => {
  it('«installi la 0.80.0?» con la 0.80.1 già installata è già risolta', () => {
    expect(risoltaDalloStato(IT, { versioneInstallata: '0.80.1' })).toBe('su questo PC è già installata la 0.80.1')
    expect(risoltaDalloStato(EN, { versioneInstallata: '0.80.0' })).toBeDefined()
  })

  it('una versione più nuova di quella installata si chiede ancora', () => {
    expect(risoltaDalloStato('Installi la 0.81.0?', { versioneInstallata: '0.80.1' })).toBeUndefined()
    expect(risoltaDalloStato(IT, {})).toBeUndefined()
    expect(risoltaDalloStato('Uso npm o pnpm?', { versioneInstallata: '0.80.1' })).toBeUndefined()
    expect(risoltaDalloStato('Installo vitest 0.34.6 nel progetto?', { versioneInstallata: '0.80.1' })).toBeUndefined()
  })
})

describe('le risposte già date', () => {
  const adesso = Date.parse('2026-10-20T07:00:00Z')
  const risposte = [
    { domanda: IT, risposta: 'ho già installato la 0.80.1', quando: '2026-10-20T06:51:20Z', chat: 'c-10' },
    { domanda: 'Quale chiave SSH uso per il server di prova?', risposta: 'quella nuova', quando: '2026-10-20T06:00:00Z', chat: 'c-3' }
  ]

  it('vale per lo stesso argomento anche da un altra chat e in un altra lingua', () => {
    expect(rispostaGiaData(risposte, EN, 'c-12', adesso)).toMatchObject({ risposta: 'ho già installato la 0.80.1', perche: 'argomento' })
  })

  it('dalla stessa chat basta una domanda simile; da un altra no', () => {
    const simile = 'Quale chiave SSH uso adesso per il server di prova?'
    expect(rispostaGiaData(risposte, simile, 'c-3', adesso)).toMatchObject({ perche: 'stessa chat' })
    expect(rispostaGiaData(risposte, simile, 'c-4', adesso)).toBeUndefined()
  })

  it('una risposta per argomento vale poche ore: lo stato cambia', () => {
    expect(rispostaGiaData(risposte, EN, 'c-12', adesso + 7 * 3_600_000)).toBeUndefined()
  })

  it('un «no» o un «aspetta» non chiude l argomento', () => {
    const rinvii = [{ domanda: 'Installi la 0.81.0?', risposta: 'no, aspetta stasera', quando: '2026-10-20T06:51:20Z', chat: 'c-10' }]
    expect(rispostaGiaData(rinvii, 'Installi la 0.81.0 adesso?', 'c-10', adesso)).toBeUndefined()
  })

  it('la memoria ricorda quale chat aveva chiesto', () => {
    const m = apriMemoria(mkdtempSync(join(tmpdir(), 'ap-memoria-chat-')))
    m.ricordaRisposta('ap-1', IT, 'fatto', '2026-10-20T06:51:20Z', 'c-10')
    expect(m.risposte('ap-1')).toEqual([{ domanda: IT, risposta: 'fatto', quando: '2026-10-20T06:51:20Z', chat: 'c-10' }])
  })

  it('le domande aperte uguali si trovano per argomento', () => {
    const aperte = [{ id: 'd1', autopilotaId: 'ap', testo: IT }, { id: 'd2', autopilotaId: 'ap', testo: 'Uso npm o pnpm?' }]
    expect(aperteSulloStesso(aperte, 'ap', EN).map((d) => d.id)).toEqual(['d1'])
    expect(aperteSulloStesso(aperte, 'altro', EN)).toEqual([])
  })
})

describe('sempre in italiano', () => {
  it('riconosce una domanda in inglese, non una italiana con nomi tecnici', () => {
    expect(sembraNonItaliano(EN)).toBe(true)
    expect(sembraNonItaliano(IT)).toBe(false)
    expect(sembraNonItaliano('Unisco il ramo `feature/the-new-api` in main con `git merge --no-ff`?')).toBe(false)
  })

  it('una domanda in inglese torna da riscrivere, e le regole lo dicono', () => {
    const v = validaDomanda({
      staFacendo: 'The 0.80.0 is published and checked; c-12 has finished.',
      domanda: EN,
      perche: 'Closing chats whose branch is gone needs the new version.',
      scelte: [{ scelta: 'Yes', conseguenza: 'I close them now', consigliata: true }, { scelta: 'No', conseguenza: 'they stay open' }],
      seNonRispondi: 'I wait.'
    })
    expect(v.completa).toBe(false)
    expect(v.note.join(' ')).toContain('non è in italiano')
    expect(REGOLE_DOMANDA.join(' ')).toContain('Sempre in italiano')
  })
})

