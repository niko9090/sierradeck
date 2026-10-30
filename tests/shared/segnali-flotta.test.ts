import { describe, it, expect } from 'vitest'
import { chiHaGia, codaSenzaDoppioni, leggiSegnaleChat, parolaSegnale, quadroFlotta, rigaDoppione, rigaSegnale, segnaleDiFineTurno, segnaleNuovo, senzaRigaSegnale } from '@shared/segnali-flotta'
import { domandaInFondo } from '@shared/domande-telefono'
import { nuovoAutopilota, parseAutopilota } from '@shared/autopilota'

/** 0.84.0: controllo e coordinazione dell'autopilota. */
describe('i segnali delle chat (0.84.0)', () => {
  const sorelle = ['c-1', 'c-2', 'c-12']
  const quando = '2026-10-21T18:00:00.000Z'

  it('legge la riga SEGNALE in tutte le forme, anche con il grassetto', () => {
    expect(rigaSegnale('Ho finito.\n\nSEGNALE: fatto — test verdi e commit fatto', sorelle, 'c-2')).toEqual({ tipo: 'fatto', dichiarato: true, motivo: 'test verdi e commit fatto' })
    expect(rigaSegnale('**SEGNALE: bloccata: manca la chiave**', sorelle, 'c-2')).toEqual({ tipo: 'bloccata', dichiarato: true, motivo: 'manca la chiave' })
    expect(rigaSegnale('SEGNALE: bloccata', sorelle, 'c-2')).toMatchObject({ tipo: 'bloccata', motivo: 'non ha detto il motivo' })
    expect(rigaSegnale('SEGNALE: aspetto c-12', sorelle, 'c-2')).toEqual({ tipo: 'aspetto', dichiarato: true, di: 'c-12' })
    expect(rigaSegnale('SEGNALE: aspetto — la risposta di Nicholas sul nome', sorelle, 'c-2')).toEqual({ tipo: 'aspetto', dichiarato: true, cosa: 'la risposta di Nicholas sul nome' })
    expect(rigaSegnale('SEGNALE: avanti — adesso i test della pagina', sorelle, 'c-2')).toEqual({ tipo: 'avanti', dichiarato: true, motivo: 'adesso i test della pagina' })
    expect(rigaSegnale('segnale: parto', sorelle, 'c-2')).toMatchObject({ tipo: 'parto' })
  })

  it('una chat che aspetta sé stessa o una chat che non c’è aspetta «qualcosa», non una sorella', () => {
    expect(rigaSegnale('SEGNALE: aspetto c-2', sorelle, 'c-2')).toMatchObject({ tipo: 'aspetto', cosa: 'c-2' })
    expect(rigaSegnale('SEGNALE: aspetto c-99', sorelle, 'c-2')?.di).toBeUndefined()
  })

  it('senza la riga: «aspetto c-1» detto a parole vale, se no la chat va avanti', () => {
    expect(segnaleDiFineTurno('Resto in attesa di c-1.', { sorelle, me: 'c-2', quando, aspettaDi: 'c-1' })).toEqual({ tipo: 'aspetto', di: 'c-1', quando, dichiarato: false })
    expect(segnaleDiFineTurno('Ho scritto i test.', { sorelle, me: 'c-2', quando })).toEqual({ tipo: 'avanti', quando, dichiarato: false })
    // La riga vince sulla deduzione.
    expect(segnaleDiFineTurno('Aspettavo c-1, ma ho fatto lo stesso.\nSEGNALE: fatto', { sorelle, me: 'c-2', quando, aspettaDi: 'c-1' }).tipo).toBe('fatto')
  })

  it('una riga SEGNALE in mezzo al testo, lontana dalla fine, non conta', () => {
    const lungo = ['SEGNALE: fatto', ...Array.from({ length: 10 }, (_, i) => `riga ${i}`)].join('\n')
    expect(rigaSegnale(lungo, sorelle, 'c-2')).toBeUndefined()
  })

  it('la domanda prima della riga SEGNALE resta la domanda in fondo', () => {
    const msg = 'Ho preparato due strade.\n\nQuale preferisci, la A o la B?\n\nSEGNALE: aspetto — la tua scelta'
    expect(domandaInFondo(msg)).toBe('Quale preferisci, la A o la B?')
    expect(senzaRigaSegnale('niente segnale qui')).toBe('niente segnale qui')
  })

  it('si annota solo quando cambia', () => {
    const b = { tipo: 'bloccata' as const, motivo: 'x', quando, dichiarato: true }
    expect(segnaleNuovo(undefined, b)).toBe(true)
    expect(segnaleNuovo(b, { ...b, quando: '2026-10-21T19:00:00.000Z' })).toBe(false)
    expect(segnaleNuovo(b, { ...b, motivo: 'y' })).toBe(true)
  })

  it('il segnale si conserva su disco, una forma sbagliata no', () => {
    const base = nuovoAutopilota({ id: 'ap-1', nome: 'Prova', obiettivo: 'o', cwd: 'C:\\p', iniziatoIl: quando })
    const { autopilota } = parseAutopilota(JSON.parse(JSON.stringify({
      ...base,
      versione: 1,
      chats: [
        { id: 'c-1', compito: 'a', stato: 'lavoro', cicli: 1, segnale: { tipo: 'bloccata', quando, motivo: 'manca la chiave', dichiarato: true } },
        { id: 'c-2', compito: 'b', stato: 'lavoro', cicli: 1, segnale: { tipo: 'boh', quando } }
      ]
    })))
    expect(autopilota?.chats[0]?.segnale).toEqual({ tipo: 'bloccata', quando, motivo: 'manca la chiave', dichiarato: true })
    expect(autopilota?.chats[1]?.segnale).toBeUndefined()
    expect(leggiSegnaleChat({ tipo: 'fatto' })).toBeUndefined()
  })
})

describe('il quadro unico della flotta (0.84.0)', () => {
  const adesso = Date.parse('2026-10-21T18:10:00.000Z')
  const chats = [
    { id: 'c-1', compito: 'scrivi i test', stato: 'lavoro', cicli: 3, segnale: { tipo: 'avanti' as const, quando: '2026-10-21T18:09:30.000Z', dichiarato: true } },
    { id: 'c-2', compito: 'aggiorna i documenti', stato: 'lavoro', cicli: 2, segnale: { tipo: 'bloccata' as const, motivo: 'manca la chiave', quando: '2026-10-21T18:00:00.000Z', dichiarato: true } },
    { id: 'c-3', compito: 'la pagina', stato: 'lavoro', cicli: 0 },
    { id: 'c-4', compito: 'vecchio', stato: 'finita', cicli: 5 }
  ]

  it('tutte le chat aperte in un punto, chi chiede una decisione per prima, le chiuse contate', () => {
    const q = quadroFlotta(chats, adesso, 'c-1')
    expect(q[0]).toContain('in un punto solo')
    expect(q[1]).toContain('c-2')
    expect(q[1]).toContain('bloccata: manca la chiave (10 min fa)')
    expect(q.join('\n')).toContain('c-1 (questa)')
    expect(q.join('\n')).toContain('c-3, al lavoro, 0 giri: nessun segnale ancora')
    expect(q.join('\n')).toContain('Chiuse: 1.')
    expect(q.join('\n')).toContain('Decidi tu')
    expect(q.join('\n')).not.toContain('vecchio')
  })

  it('le parole dei segnali', () => {
    expect(parolaSegnale({ tipo: 'aspetto', di: 'c-1', quando: '', dichiarato: false })).toBe('aspetta la chat c-1')
    expect(parolaSegnale({ tipo: 'parto', quando: '', dichiarato: false })).toBe('partita')
    expect(quadroFlotta([], adesso)).toEqual([])
  })
})

describe('nessun lavoro dato due volte (0.84.0)', () => {
  const chats = [
    { id: 'c-1', compito: 'Scrivi i test', stato: 'lavoro', cicli: 1 },
    { id: 'c-2', compito: 'il manuale', stato: 'finita', cicli: 4, ruolo: 'sviluppo' },
    { id: 'c-3', compito: 'mai partita', stato: 'finita', cicli: 0 },
    { id: 'c-4', compito: 'Rivedi il ramo x della chat c-2 («il manuale»)', stato: 'finita', cicli: 1, ruolo: 'revisione' }
  ]

  it('una chat aperta o che ci ha già lavorato ha il compito; maiuscole e punteggiatura non contano', () => {
    expect(chiHaGia('scrivi i test.', chats)).toBe('c-1')
    expect(chiHaGia('Il manuale', chats)).toBe('c-2')
    expect(chiHaGia('un compito nuovo', chats)).toBeUndefined()
  })

  it('un avvio fallito si ritenta e una Revisione chiusa si riusa: non sono doppioni', () => {
    expect(chiHaGia('mai partita', chats)).toBeUndefined()
    expect(chiHaGia('Rivedi il ramo x della chat c-2 («il manuale»)', chats)).toBeUndefined()
  })

  it('la coda perde i compiti già dati e quelli scritti due volte', () => {
    const r = codaSenzaDoppioni(['scrivi i test', 'nuovo', 'Nuovo!', 'altro'], chats)
    expect(r.compiti).toEqual(['nuovo', 'altro'])
    expect(r.tolti).toEqual([{ compito: 'scrivi i test', chi: 'c-1' }, { compito: 'Nuovo!', chi: 'coda' }])
    expect(rigaDoppione(r.tolti[0]!)).toContain('ce l\'ha già la chat c-1')
    expect(rigaDoppione(r.tolti[1]!)).toContain('è già in coda')
  })
})

describe('29/10: lo stesso compito con altre parole, o il lavoro di una chat già conclusa', () => {
  const finita = { stato: 'finita', cicli: 12 }
  it('riscritto (Jaccard ≥ 0.6 sulle parole di 4+ lettere): è un doppione', () => {
    const chats = [{ id: 'c-157', compito: 'Correggere la coda delle consegne quando il servizio riparte', ...finita, conclusa: { come: 'unito' } }]
    expect(chiHaGia('Correggi la coda delle consegne quando il servizio riparte da capo', chats)).toBe('c-157')
    // Simile solo in parte: non è lo stesso compito.
    expect(chiHaGia('Scrivere il manuale delle consegne per Nicholas', chats)).toBeUndefined()
    // Parole troppo poche per dirlo.
    expect(chiHaGia('coda servizio', chats)).toBeUndefined()
  })

  it('cita una chat conclusa per riprenderne il lavoro: è già fatto; se la chat non è conclusa, no', () => {
    const chats = [
      { id: 'c-157', compito: 'Correggere la coda delle consegne', ...finita, conclusa: { come: 'unito' } },
      { id: 'c-158', compito: 'Scrivere il manuale', ...finita }
    ]
    expect(chiHaGia('Riprendi il lavoro di c-157 e portalo a termine', chats)).toBe('c-157')
    expect(chiHaGia('Riprendi il lavoro di c-158', chats)).toBeUndefined()
    // Cita c-157 per altro (un difetto nuovo): non è un doppione.
    expect(chiHaGia('Il test della pagina rotto dopo c-157: sistemalo', chats)).toBeUndefined()
  })

  it('le Revisioni non si confondono fra loro: cambiano solo nel numero della chat', () => {
    const chats = [{ id: 'c-9', compito: 'Rivedi il ramo ap/x/c-5 della chat c-5 («la coda»)', stato: 'lavoro', cicli: 1, ruolo: 'revisione' }]
    expect(chiHaGia('Rivedi il ramo ap/x/c-7 della chat c-7 («la coda»)', chats)).toBeUndefined()
    const r = codaSenzaDoppioni(['Rivedi il ramo ap/x/c-5 della chat c-5 («la coda»)', 'Rivedi il ramo ap/x/c-7 della chat c-7 («la coda»)'], [])
    expect(r.tolti).toEqual([])
  })

  it('in coda, lo stesso compito scritto due volte con parole diverse resta una volta', () => {
    const r = codaSenzaDoppioni(['Aggiungere il controllo dei rami cancellati prima della Revisione', 'Aggiungi il controllo dei rami cancellati prima della Revisione finale'], [])
    expect(r.compiti).toHaveLength(1)
    expect(r.tolti[0]?.chi).toBe('coda')
  })
})
