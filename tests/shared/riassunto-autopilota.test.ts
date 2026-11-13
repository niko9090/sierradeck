import { describe, it, expect } from 'vitest'
import { riassuntoDaUltimo, riassuntoGenerale, ultimoTuoMessaggio, gruppoDi, perLaVoce, SENZA_MESSAGGIO_MS, type DatiRiassuntoAutopilota } from '@shared/riassunto-autopilota'
import type { Decisione, ScambioDialogo } from '@shared/autopilota'
import type { VistaCoda } from '@shared/coda-richieste'
import type { VistaOrchestratore } from '@shared/piano-orchestratore'

const ORA = Date.parse('2026-11-13T15:00:00Z')
const fa = (min: number): string => new Date(ORA - min * 60_000).toISOString()
const av = (min: number, nota: string, chat = 'x'): Decisione => ({ quando: fa(min), cosa: 'riga tecnica', traguardo: { chat, esito: 'avanzamento', nota } })

const vista = (p: Partial<VistaOrchestratore> = {}): VistaOrchestratore => ({
  workspace: 'ws', modello: 'opus', tettoSpecialisti: 3, pensa: false, specialisti: [], vivo: true, registro: [],
  costo: { oggiUsd: 0, turniOggi: 0 }, piano: { totale: 4, uniti: 1 }, richieste: { aperte: 1, daPianificare: 0 }, domandeAperte: 0, percento: 40, ...p
})

const richiesta = (id: string, titolo: string, p: Record<string, unknown> = {}): VistaCoda['richieste'][number] =>
  ({ id, creata: fa(600), titolo, testo: titolo, originali: [], punti: [], unioni: [], stato: 'in-corso', compiti: [], percento: 0, ...p }) as VistaCoda['richieste'][number]

const dati = (p: { dialogo?: ScambioDialogo[]; decisioni?: Decisione[]; vista?: VistaOrchestratore; coda?: VistaCoda }): DatiRiassuntoAutopilota => ({
  autopilota: { dialogo: p.dialogo ?? [], decisioni: p.decisioni ?? [], chats: [] },
  ...(p.vista !== undefined ? { vista: p.vista } : {}),
  ...(p.coda !== undefined ? { coda: p.coda } : {}),
  adesso: ORA
})

describe('riassunto dal tuo ultimo messaggio', () => {
  const dialogo: ScambioDialogo[] = [
    { quando: fa(300), da: 'tu', testo: 'vecchio' },
    { quando: fa(60), da: 'tu', testo: 'fai la voce' },
    { quando: fa(50), da: 'lui', testo: 'Va bene, ci lavoro: metto in coda la voce.' }
  ]

  it('trova il tuo ultimo messaggio', () => {
    expect(ultimoTuoMessaggio({ dialogo })).toBe(ORA - 60 * 60_000)
    expect(ultimoTuoMessaggio({ dialogo: [] })).toBeUndefined()
  })

  it('conta solo quello che è successo dopo il tuo ultimo messaggio', () => {
    const r = riassuntoDaUltimo(dati({
      dialogo,
      decisioni: [
        av(200, 'Al lavoro: Lo sviluppatore — una cosa vecchia.'),
        av(40, 'Al lavoro: Lo sviluppatore — la voce che legge.'),
        av(30, 'Al lavoro: Il verificatore — prova della voce.'),
        av(20, 'Lo sviluppatore ha finito dopo 20 min: la voce che legge. Adesso provo il suo lavoro e, se le prove passano, lo unisco.'),
        av(10, 'Unito il lavoro su «la voce che legge»: le prove passano.'),
        av(5, 'Il verificatore non è riuscito dopo 25 min: prova della voce. L’autopilota lo rilancia o cambia strada.')
      ],
      vista: vista()
    }))
    expect(r.tipo).toBe('da-ultimo')
    expect(r.titolo).toMatch(/^Dal tuo ultimo messaggio \(alle \d\d:\d\d, un’ora fa\)$/)
    const testo = r.righe.join('\n')
    expect(testo).toContain('Partiti 2 lavori: «la voce che legge» e «prova della voce»')
    expect(testo).not.toContain('una cosa vecchia')
    expect(testo).toContain('finito 1 lavoro, unito 1 con le prove passate'.replace(/^f/, 'F'))
    expect(testo).toMatch(/Una cosa non è andata: Il verificatore non è riuscito/)
    expect(testo).toContain('Ti ha risposto: Va bene, ci lavoro')
    expect(r.righe[r.righe.length - 1]).toMatch(/^Adesso: /)
  })

  it('richieste nuove, fatte e versioni uscite dalla coda', () => {
    const coda: VistaCoda = {
      workspace: 'ws', compattate: [], richieste: [
        richiesta('r-1', 'Riassunto a voce', { creata: fa(30) }),
        richiesta('r-2', 'Invio manda', { stato: 'fatta', fattaIl: fa(10), versione: '0.106.0' }),
        richiesta('r-3', 'Fatta prima', { stato: 'fatta', fattaIl: fa(120), versione: '0.105.0' }),
        richiesta('r-4', 'Solo una domanda', { creata: fa(20), chiusa: { come: 'risposta', perche: '', il: fa(19) } })
      ]
    }
    const r = riassuntoDaUltimo(dati({ dialogo, coda }))
    const testo = r.righe.join('\n')
    expect(testo).toContain('Nuova richiesta in coda: «Riassunto a voce»')
    expect(testo).not.toContain('Solo una domanda')
    expect(testo).toContain('Richiesta fatta: «Invio manda»')
    expect(testo).toContain('Uscita la versione 0.106.0')
    expect(testo).not.toContain('0.105.0')
  })

  it('le domande aperte si dicono sempre', () => {
    const conDomanda: ScambioDialogo[] = [...dialogo, { quando: fa(5), da: 'lui', testo: 'Pubblico adesso?', domanda: { id: 'q1', scelte: ['Sì', 'No'] } }]
    const r = riassuntoDaUltimo(dati({ dialogo: conDomanda, vista: vista({ domandeAperte: 2 }) }))
    expect(r.righe.join('\n')).toContain('Aspetta 2 tue risposte: Pubblico adesso?')
  })

  it('niente di nuovo: lo dice', () => {
    const r = riassuntoDaUltimo(dati({ dialogo: [{ quando: fa(2), da: 'tu', testo: 'ciao' }] }))
    expect(r.righe[0]).toBe('Da allora niente di nuovo: nessun lavoro partito o finito.')
  })

  it('senza nessun tuo messaggio guarda le ultime 24 ore', () => {
    const r = riassuntoDaUltimo(dati({ decisioni: [av(SENZA_MESSAGGIO_MS / 60_000 + 10, 'Al lavoro: X — troppo vecchio.'), av(60, 'Al lavoro: X — di oggi.')] }))
    expect(r.titolo).toContain('ultime 24 ore')
    expect(r.righe.join('\n')).toContain('«di oggi»')
    expect(r.righe.join('\n')).not.toContain('troppo vecchio')
  })

  it('il parlato è senza virgolette basse e con frasi chiuse', () => {
    const r = riassuntoDaUltimo(dati({ dialogo, decisioni: [av(40, 'Al lavoro: Lo sviluppatore — la voce.')] }))
    expect(r.parlato).not.toMatch(/[«»]/)
    expect(perLaVoce('Titolo', ['una riga'])).toBe('Titolo. una riga.')
  })
})

describe('riassunto generale', () => {
  it('percentuale, richieste aperte, adesso e ultime fatte', () => {
    const coda: VistaCoda = {
      workspace: 'ws',
      compattate: [{ id: 'r-0', titolo: 'Antica', fattaIl: fa(5000), versione: '0.90.0' }],
      richieste: [
        richiesta('r-1', 'Riassunto a voce'),
        richiesta('r-2', 'Invio manda', { stato: 'fatta', fattaIl: fa(10), versione: '0.106.0' })
      ]
    }
    const r = riassuntoGenerale(dati({ coda, vista: vista({ specialisti: [{ id: 's1', ruolo: 'sviluppatore', compito: 'x', stato: 'lavoro' }] }) }))
    const testo = r.righe.join('\n')
    expect(r.tipo).toBe('generale')
    expect(testo).toContain('Lavoro aperto fatto al 40%: 1 compito unito su 4.')
    expect(testo).toContain('1 richiesta aperta: «Riassunto a voce»')
    expect(testo).toContain('Adesso: Al lavoro: sviluppatore')
    expect(testo).toContain('Ultime fatte: «Invio manda» (versione 0.106.0), «Antica» (versione 0.90.0)')
  })

  it('senza dati lo dice', () => {
    expect(riassuntoGenerale(dati({})).righe).toEqual(['Non ho ancora dati su questo workspace.'])
  })
})

describe('gruppi delle righe del diario', () => {
  it('riconosce le forme del servizio', () => {
    expect(gruppoDi(av(1, 'Al lavoro: Lo specialista del rilascio — pubblica.'))).toBe('partiti')
    expect(gruppoDi(av(1, 'Lo specialista del rilascio ha finito dopo 3 min: pubblicata la 0.106.0.'))).toBe('rilasci')
    expect(gruppoDi(av(1, 'Il lavoro su «x» non passa le prove: lo faccio correggere a uno specialista.'))).toBe('problemi')
    expect(gruppoDi(av(1, 'Fatta la richiesta «x»: tutto unito e verificato.'))).toBe('fatte')
    expect(gruppoDi({ quando: fa(1), cosa: 'x', traguardo: { chat: 'c-1', esito: 'bloccata' } })).toBe('problemi')
    expect(gruppoDi({ quando: fa(1), cosa: 'x' })).toBeUndefined()
  })
})
