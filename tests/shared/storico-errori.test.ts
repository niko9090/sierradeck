import { describe, it, expect } from 'vitest'
import {
  aggiungiErrore,
  cartellaMittente,
  leggiInvioErrori,
  nomeFileArrivo,
  storicoPerLInvio,
  chiaveErrore,
  leggiStorico,
  puntoDelCodice,
  testoDaCopiare,
  togliSegreti,
  unisciStorici,
  voceDaTesto,
  type StoricoErrori
} from '@shared/storico-errori'

// Valori finti, costruiti qui: nessun segreto o dato vero nei test.
const finto = (prefisso: string, n: number): string => prefisso + 'Ab1'.repeat(Math.ceil(n / 3)).slice(0, n)

describe('togliSegreti', () => {
  it('toglie gettoni con prefisso noto, intestazioni e JWT', () => {
    const testo = [
      `gh ${finto('ghp_', 36)}`,
      `chiave ${finto('sk-ant-', 30)}`,
      `Authorization: Bearer ${finto('', 30)}`,
      `jwt eyJ${finto('', 12)}.${finto('', 12)}.${finto('', 12)}`,
      `google ${finto('ya29.', 30)}`
    ].join('\n')
    const t = togliSegreti(testo)
    expect(t).not.toContain('ghp_')
    expect(t).not.toContain('sk-ant-')
    expect(t).not.toContain('eyJ')
    expect(t).not.toContain('ya29.')
    expect(t).toContain('‹tolto›')
  })

  it('toglie i valori di password, gettone, pin anche in JSON e negli indirizzi', () => {
    const t = togliSegreti('password=segretissima {"token":"abc123def"} /api/x?gettone=zz99&a=1 pin: 4321')
    expect(t).not.toMatch(/segretissima|abc123def|zz99|4321/)
    expect(t).toContain('&a=1')
  })

  it('copre i percorsi con il nome dell utente, email e IP, ma non 127.0.0.1', () => {
    const t = togliSegreti('C:\\Users\\mario\\AppData\\x /c/Users/mario/Documents /home/mario/x scrivi a mario@esempio.it da 192.168.1.20 e 127.0.0.1')
    expect(t).not.toContain('mario')
    expect(t).toContain('C:\\Users\\…\\AppData')
    expect(t).toContain('‹email›')
    expect(t).toContain('‹ip›')
    expect(t).toContain('127.0.0.1')
  })

  it('copre i nomi passati da chi chiama (PC e utente), senza toccare le parole che li contengono', () => {
    expect(togliSegreti('PC-PROVA-1 non risponde; pcprova-1x resta', ['pc-prova-1'])).toBe('‹nome› non risponde; pcprova-1x resta')
  })

  it('lascia le frasi normali come sono', () => {
    const frase = 'il gettone di casa è scaduto: rinnovo tra 30 s (chiave nuova al prossimo giro)'
    expect(togliSegreti(frase)).toBe(frase)
  })
})

describe('puntoDelCodice', () => {
  it('prende il primo punto del nostro codice, saltando node_modules e node:', () => {
    const stack = [
      'Error: no',
      '    at Object.leggi (node:fs:123:4)',
      '    at x (E:\\prog\\node_modules\\pkg\\a.js:1:1)',
      '    at salvaWorkspace (E:\\prog\\out\\main\\index.js:4567:12)',
      '    at E:\\prog\\out\\main\\index.js:9:1'
    ].join('\n')
    expect(puntoDelCodice(stack)).toBe('out/main/index.js:4567 (salvaWorkspace)')
  })

  it('senza stack non inventa niente', () => {
    expect(puntoDelCodice('solo un messaggio')).toBeUndefined()
  })
})

describe('voceDaTesto e aggiungiErrore', () => {
  const quando = '2026-10-19T15:00:00.000Z'

  it('messaggio dalla prima riga, dettagli dal resto, segreti tolti prima di salvare', () => {
    const v = voceDaTesto({ testo: `[main] salvataggio fallito password=xyz987\n    at salva (/app/src/main/x.ts:12:3)`, dove: 'pc', quando, cosa: '[drive] carico C:\\Users\\mario\\a', versione: '0.81.0' })
    expect(v.messaggio).toBe('[main] salvataggio fallito password=‹tolto›')
    expect(v.punto).toBe('src/main/x.ts:12 (salva)')
    expect(v.cosa).toBe('[drive] carico C:\\Users\\…\\a')
    expect(v.volte).toBe(1)
    expect(JSON.stringify(v)).not.toMatch(/xyz987|mario/)
  })

  it('gli errori uguali a meno di numeri e id diventano una voce sola con il conteggio', () => {
    let s: StoricoErrori = { voci: [] }
    s = aggiungiErrore(s, voceDaTesto({ testo: 'criterio c-12 finito con 1 in 601 s', dove: 'servizio', quando }))
    s = aggiungiErrore(s, voceDaTesto({ testo: 'criterio c-7 finito con 1 in 602 s', dove: 'servizio', quando: '2026-10-19T15:10:00.000Z' }))
    s = aggiungiErrore(s, voceDaTesto({ testo: 'altro errore', dove: 'servizio', quando: '2026-10-19T15:05:00.000Z' }))
    expect(s.voci).toHaveLength(2)
    expect(s.voci[0]?.volte).toBe(2)
    expect(s.voci[0]?.quando).toBe(quando)
    expect(s.voci[0]?.ultima).toBe('2026-10-19T15:10:00.000Z')
  })

  it('lo stesso messaggio in posti diversi resta separato', () => {
    const a = voceDaTesto({ testo: 'boom', dove: 'pc', quando })
    const b = voceDaTesto({ testo: 'boom', dove: 'servizio', quando })
    expect(chiaveErrore(a)).not.toBe(chiaveErrore(b))
  })

  it('tiene al massimo il limite di voci, togliendo le meno recenti', () => {
    let s: StoricoErrori = { voci: [] }
    for (let i = 0; i < 5; i += 1) s = aggiungiErrore(s, voceDaTesto({ testo: `errore ${'x'.repeat(i)}`, dove: 'pc', quando: `2026-10-19T15:0${i}:00.000Z` }), 3)
    expect(s.voci.map((v) => v.messaggio)).toEqual(['errore xxxx', 'errore xxx', 'errore xx'])
  })

  it('unisce gli storici del PC e del servizio', () => {
    const pc = aggiungiErrore({ voci: [] }, voceDaTesto({ testo: 'a', dove: 'pc', quando }))
    const sv = aggiungiErrore({ voci: [] }, voceDaTesto({ testo: 'b', dove: 'servizio', quando: '2026-10-19T16:00:00.000Z' }))
    expect(unisciStorici(pc, sv).voci.map((v) => v.dove)).toEqual(['servizio', 'pc'])
  })
})

describe('leggiStorico', () => {
  it('scarta le voci rotte e tiene le buone', () => {
    const s = leggiStorico({ voci: [null, { messaggio: 'senza ora' }, { quando: 'q', messaggio: 'ok', dove: 'strano', volte: -3 }] })
    expect(s.voci).toEqual([{ quando: 'q', ultima: 'q', dove: 'pc', volte: 1, messaggio: 'ok' }])
    expect(leggiStorico('rotto').voci).toEqual([])
  })
})

describe('testoDaCopiare', () => {
  it('dice quanti errori, e per ognuno quando, dove, cosa si faceva e il punto', () => {
    let s: StoricoErrori = { voci: [] }
    s = aggiungiErrore(s, voceDaTesto({ testo: 'boom\n    at f (/x/src/main/a.ts:3:1)', dove: 'servizio', quando: '2026-10-19T15:00:00.000Z', cosa: 'giro dei criteri', versione: '0.81.0' }))
    s = aggiungiErrore(s, voceDaTesto({ testo: 'boom\n    at f (/x/src/main/a.ts:3:1)', dove: 'servizio', quando: '2026-10-19T15:30:00.000Z' }))
    const t = testoDaCopiare(s, { versione: '0.81.0' })
    expect(t).toContain('Errori di SierraDeck v0.81.0: 1 errore, 2 volte in tutto.')
    expect(t).toContain('1) boom')
    expect(t).toContain('2 volte')
    expect(t).toContain('Dove: servizio degli autopiloti (v0.81.0)')
    expect(t).toContain('Cosa si faceva: giro dei criteri')
    expect(t).toContain('Punto del codice: src/main/a.ts:3 (f)')
  })

  it('senza errori lo dice', () => {
    expect(testoDaCopiare({ voci: [] })).toContain('Nessun errore registrato.')
  })
})

describe('l’invio al PC di sviluppo', () => {
  it('lo storico che parte sta nel tetto: via prima i dettagli vecchi, poi le voci vecchie', () => {
    let s: StoricoErrori = { voci: [] }
    for (let i = 0; i < 30; i += 1) s = aggiungiErrore(s, voceDaTesto({ testo: `errore ${i} ${'y'.repeat(i)}\n${'    at f (/x/src/a.ts:1:1)\n'.repeat(40)}`, dove: 'pc', quando: new Date(Date.UTC(2026, 9, 19, 15, i)).toISOString() }))
    const piccolo = storicoPerLInvio(s, 4000)
    expect(new TextEncoder().encode(JSON.stringify(piccolo)).length).toBeLessThanOrEqual(4000)
    expect(piccolo.voci[0]?.messaggio).toBe(s.voci[0]?.messaggio)
    expect(storicoPerLInvio(s).voci).toHaveLength(30)
  })

  it('il nome della cartella di chi manda non esce mai dalla cartella degli arrivi', () => {
    expect(cartellaMittente('../../Windows')).toBe('Windows')
    expect(cartellaMittente('Portàtile: di casa')).toBe('Portatile- di casa')
    expect(cartellaMittente('...')).toBe('sconosciuto')
  })

  it('il nome del file è l’ora, senza i due punti vietati su Windows', () => {
    expect(nomeFileArrivo(new Date('2026-10-19T15:04:05.000Z'))).toBe('2026-10-19_15-04-05.json')
    expect(nomeFileArrivo(new Date('2026-10-19T15:04:05.000Z'), 3)).toBe('2026-10-19_15-04-05-3.json')
  })

  it('chi riceve controlla il corpo e toglie di nuovo i segreti', () => {
    expect(leggiInvioErrori(undefined).ok).toBe(false)
    expect(leggiInvioErrori({ voci: [] }).ok).toBe(false)
    const l = leggiInvioErrori({ da: 'Portatile', voci: [{ quando: 'q', messaggio: 'password=abc123 fallita' }] })
    expect(l.ok && l.invio.voci[0]?.messaggio).toBe('password=‹tolto› fallita')
  })
})
