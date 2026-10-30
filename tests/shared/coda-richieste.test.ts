import { describe, it, expect } from 'vitest'
import {
  aggiungi, avanzamentoCoda, avanzamentoRichiesta, candidatiUnione, chiaveWorkspace, citateIn, codaVuota, compatta,
  daSeguire, fattoreCompito, frazione, leggiCoda, leggiUnioneDalDialogo, passoDichiarato, riferimentiDi, separa,
  unioneDaDialogo, unisci, unite, type Coda, type MisuraCompito, type Richiesta
} from '@shared/coda-richieste'

/**
 * La coda delle richieste (P1): mai troncare, nessun punto perso in
 * un'unione, ogni unione si disfa, la percentuale dal programma.
 */

const T0 = '2026-10-30T08:00:00.000Z'
const ora = (min: number): string => new Date(Date.parse(T0) + min * 60_000).toISOString()

function conRichieste(...testi: string[]): Coda {
  let c = codaVuota('Lavoro')
  testi.forEach((t, i) => { c = aggiungi(c, { testo: t, quando: ora(i) }).coda })
  return c
}
const r = (c: Coda, id: string): Richiesta => c.richieste.find((x) => x.id === id)!

describe('aggiungere: le parole restano intere', () => {
  it('un testo lungo (oltre i 2000 caratteri di prima) resta intero, nell’originale e nel testo', () => {
    const lungo = `Correggi la barra delle chat. ${'Questa è una frase lunga che non deve sparire. '.repeat(300)}Fine.`
    expect(lungo.length).toBeGreaterThan(10_000)
    const m = aggiungi(codaVuota('Lavoro'), { testo: lungo, quando: T0 })
    expect(m.richiesta.originali[0]!.testo).toBe(lungo)
    expect(m.richiesta.testo).toBe(lungo)
    expect(m.richiesta.punti[0]!.testo).toBe(lungo)
    expect(m.richiesta.titolo.length).toBeLessThanOrEqual(120)
    expect(m.eventi[0]).toMatchObject({ tipo: 'aggiunta', id: 'r-1', originale: { testo: lungo } })
  })

  it('nessun tetto sul numero: 500 richieste restano 500, gli id non si riusano', () => {
    let c = codaVuota('Lavoro')
    for (let i = 0; i < 500; i += 1) c = aggiungi(c, { testo: `richiesta numero ${i}`, quando: T0 }).coda
    expect(c.richieste).toHaveLength(500)
    expect(c.prossimo).toEqual({ r: 501, p: 501 })
  })

  it('un punto per ogni richiesta vista; senza, uno con le sue parole', () => {
    const m = aggiungi(codaVuota('W'), { testo: 'fai A e poi B', quando: T0, punti: ['A', 'B'], compiti: ['k1', 'k1', 'k2'] })
    expect(m.richiesta.punti.map((p) => [p.id, p.testo, p.da])).toEqual([['p-1', 'A', 'r-1'], ['p-2', 'B', 'r-1']])
    expect(m.richiesta.compiti).toEqual(['k1', 'k2'])
    expect(m.richiesta.stato).toBe('pianificata')
  })

  it('la chiave del workspace: il suo nome, o la cartella per chi è nato prima del campo', () => {
    expect(chiaveWorkspace({ workspace: 'Lavoro', cwd: 'C:\\x' })).toBe('Lavoro')
    expect(chiaveWorkspace({ cwd: 'C:\\Progetti\\App\\' })).toBe('cartella:c:\\progetti\\app')
  })
})

describe('le candidate all’unione', () => {
  it('per parole simili (≥ 0.35)', () => {
    const c = conRichieste('la barra delle chat in alto non mostra il numero delle chat aperte', 'pubblica la documentazione')
    const k = candidatiUnione(c, 'la barra delle chat non mostra il numero giusto delle chat aperte')
    expect(k.map((x) => x.id)).toEqual(['r-1'])
    expect(k[0]!.motivi[0]).toMatch(/^parole /)
  })

  it('per file o identificatori in comune', () => {
    expect(riferimentiDi('guarda src/shared/coda-richieste.ts e stessoArgomento')).toEqual(new Set(['coda-richieste.ts', 'stessoargomento']))
    const c = conRichieste('sistema PannelloAutopiloti.tsx che si apre lento', 'altro')
    const k = candidatiUnione(c, 'il bottone in src/renderer/components/PannelloAutopiloti.tsx è storto')
    expect(k.map((x) => x.id)).toEqual(['r-1'])
    expect(k[0]!.motivi.join(' ')).toContain('pannelloautopiloti.tsx')
  })

  it('per argomento riconosciuto (installare la stessa versione)', () => {
    const c = conRichieste('installa la 0.86.3 sul portatile')
    expect(candidatiUnione(c, 'install the 0.86.3 when ready').map((x) => x.motivi)).toEqual([['stesso argomento']])
  })

  it('per citazione esplicita «r-12»', () => {
    expect(citateIn('come dicevo in r-2 e R-02, non r-')).toEqual(['r-2'])
    const c = conRichieste('uno', 'due cose diverse')
    expect(candidatiUnione(c, 'aggiungi a r-2 anche il colore').map((x) => x.id)).toEqual(['r-2'])
  })

  it('una richiesta già fatta è candidata da seguire, non da unire', () => {
    let c = conRichieste('la barra delle chat in alto non mostra il numero delle chat aperte')
    c = { ...c, richieste: c.richieste.map((x) => ({ ...x, stato: 'fatta' as const, fattaIl: T0 })) }
    const k = candidatiUnione(c, 'la barra delle chat non mostra il numero giusto delle chat aperte')
    expect(k[0]!.fatta).toBe(true)
    expect(daSeguire(k)).toBe('r-1')
  })
})

describe('unire: l’invariante, nessun punto perso', () => {
  const base = (): Coda => {
    let c = codaVuota('W')
    c = aggiungi(c, { testo: 'la barra in rosso', quando: ora(0), punti: ['barra rossa', 'testo grande'], compiti: ['k-a'] }).coda
    c = aggiungi(c, { testo: 'la barra in blu, non rossa', quando: ora(5), compiti: ['k-b'] }).coda
    return c
  }

  it('rifiuta l’unione che non nomina ogni punto delle fonti, e non cambia niente', () => {
    const c = base()
    const e = unisci(c, { ids: ['r-1', 'r-2'], testo: 'la barra in blu', punti: [{ id: 'p-1' }, { id: 'p-3' }], perche: 'stessa barra', quando: ora(6) })
    expect(e).toEqual({ ok: false, errore: 'unione rifiutata: si perderebbero i punti p-2' })
  })

  it('rifiuta punti sconosciuti, doppi, superati senza perché, tutti superati, fonti fatte o assenti', () => {
    const c = base()
    const u = { ids: ['r-1', 'r-2'], testo: 't', perche: 'p', quando: ora(6) }
    expect(unisci(c, { ...u, punti: [{ id: 'p-1' }, { id: 'p-2' }, { id: 'p-3' }, { id: 'p-9' }] }).ok).toBe(false)
    expect(unisci(c, { ...u, punti: [{ id: 'p-1' }, { id: 'p-1' }, { id: 'p-2' }, { id: 'p-3' }] }).ok).toBe(false)
    expect(unisci(c, { ...u, punti: [{ id: 'p-1', superato: ' ' }, { id: 'p-2' }, { id: 'p-3' }] }).ok).toBe(false)
    expect(unisci(c, { ...u, punti: [{ id: 'p-1', superato: 'a' }, { id: 'p-2', superato: 'b' }, { id: 'p-3', superato: 'c' }] }).ok).toBe(false)
    expect(unisci(c, { ...u, ids: ['r-1', 'r-7'], punti: [] }).ok).toBe(false)
    expect(unisci(c, { ...u, ids: ['r-1'], punti: [] }).ok).toBe(false)
    expect(unisci(c, { ...u, perche: ' ', punti: [{ id: 'p-1' }, { id: 'p-2' }, { id: 'p-3' }] }).ok).toBe(false)
    const fatta: Coda = { ...c, richieste: c.richieste.map((x) => (x.id === 'r-2' ? { ...x, stato: 'fatta' as const } : x)) }
    expect(unisci(fatta, { ...u, punti: [{ id: 'p-1' }, { id: 'p-2' }, { id: 'p-3' }] })).toMatchObject({ ok: false, errore: expect.stringContaining('già fatta') })
  })

  it('unisce: resta il numero più basso, tutti i punti ci sono, il contraddetto è superato col perché, gli originali intatti', () => {
    const c = base()
    const e = unisci(c, {
      ids: ['r-2', 'r-1'],
      testo: 'la barra in blu, col testo grande',
      titolo: 'Barra blu',
      punti: [{ id: 'p-1', superato: 'Nicholas ora la vuole blu', superatoDa: 'p-3' }, { id: 'p-2', testo: 'testo grande nella barra' }, { id: 'p-3' }],
      perche: 'parlano della stessa barra',
      quando: ora(6)
    })
    if (!e.ok) throw new Error(e.errore)
    expect(e.id).toBe('r-1')
    expect(e.coda.richieste.map((x) => x.id)).toEqual(['r-1'])
    const u = r(e.coda, 'r-1')
    expect(u.titolo).toBe('Barra blu')
    expect(u.punti.map((p) => p.id)).toEqual(['p-1', 'p-2', 'p-3'])
    expect(u.punti[0]).toMatchObject({ stato: 'superato', perche: 'Nicholas ora la vuole blu', superatoDa: 'p-3', da: 'r-1' })
    expect(u.punti[1]).toMatchObject({ testo: 'testo grande nella barra', stato: 'aperto' })
    expect(u.originali.map((o) => [o.id, o.testo])).toEqual([['r-1', 'la barra in rosso'], ['r-2', 'la barra in blu, non rossa']])
    expect(u.compiti).toEqual(['k-a', 'k-b'])
    expect(unite(u)).toEqual(['r-1', 'r-2'])
    expect(e.eventi[0]).toMatchObject({ tipo: 'unione', il: 'r-1', fonti: ['r-1', 'r-2'] })
  })

  it('nessun punto perso, mai: per ogni sottoinsieme di punti nominati l’unione passa solo se li nomina tutti', () => {
    const c = base()
    const tutti = ['p-1', 'p-2', 'p-3']
    for (let maschera = 0; maschera < 8; maschera += 1) {
      const nominati = tutti.filter((_, i) => (maschera >> i) & 1)
      const e = unisci(c, { ids: ['r-1', 'r-2'], testo: 't', punti: nominati.map((id) => ({ id })), perche: 'p', quando: ora(6) })
      expect(e.ok).toBe(nominati.length === 3)
      if (e.ok) {
        const ids = e.coda.richieste.flatMap((x) => x.punti.map((p) => p.id))
        expect(ids.sort()).toEqual(tutti)
      }
    }
  })

  it('una in verifica che riceve punti aperti torna in corso', () => {
    let c = base()
    c = { ...c, richieste: c.richieste.map((x) => (x.id === 'r-1' ? { ...x, stato: 'in-verifica' as const } : x)) }
    const e = unisci(c, { ids: ['r-1', 'r-2'], testo: 't', punti: [{ id: 'p-1' }, { id: 'p-2' }, { id: 'p-3' }], perche: 'p', quando: ora(6) })
    expect(e.ok && r(e.coda, 'r-1').stato).toBe('in-corso')
  })
})

describe('separare: l’unione si disfa', () => {
  it('rimette le richieste di prima, i punti per fonte, il superato riaperto, il fatto resta fatto', () => {
    let c = codaVuota('W')
    c = aggiungi(c, { testo: 'la barra in rosso', quando: ora(0), punti: ['barra rossa', 'testo grande'], compiti: ['k-a'] }).coda
    c = aggiungi(c, { testo: 'la barra in blu', quando: ora(5), compiti: ['k-b'] }).coda
    const prima = c
    const e = unisci(c, { ids: ['r-1', 'r-2'], testo: 'barra blu e testo grande', punti: [{ id: 'p-1', superato: 'ora blu' }, { id: 'p-2' }, { id: 'p-3' }], perche: 'stessa barra', quando: ora(6) })
    if (!e.ok) throw new Error(e.errore)
    // Nel frattempo il testo grande è fatto.
    const conFatto = { ...e.coda, richieste: e.coda.richieste.map((x) => ({ ...x, punti: x.punti.map((p) => (p.id === 'p-2' ? { ...p, stato: 'fatto' as const } : p)) })) }
    const s = separa(conFatto, 'r-1', ora(7))
    if (!s.ok) throw new Error(s.errore)
    expect(s.coda.richieste.map((x) => x.id)).toEqual(['r-1', 'r-2'])
    const r1 = r(s.coda, 'r-1')
    const r2 = r(s.coda, 'r-2')
    expect(r1.testo).toBe('la barra in rosso')
    expect(r1.punti.map((p) => [p.id, p.stato])).toEqual([['p-1', 'aperto'], ['p-2', 'fatto']])
    expect(r1.punti[0]!.perche).toBeUndefined()
    expect(r1.unioni).toEqual([])
    expect(r1.compiti).toEqual(['k-a'])
    expect(r1.originali).toEqual(r(prima, 'r-1').originali)
    expect(r2).toEqual(r(prima, 'r-2'))
    expect(s.eventi[0]).toMatchObject({ tipo: 'separazione', id: 'r-1', fonti: ['r-1', 'r-2'] })
    expect(separa(s.coda, 'r-1', ora(8)).ok).toBe(false)
  })

  it('unire tre e separare torna alle tre di prima, dopo una lettura dal disco', () => {
    const c = conRichieste('uno', 'due', 'tre')
    const e = unisci(c, { ids: ['r-1', 'r-2', 'r-3'], testo: 'tutto', punti: [{ id: 'p-3' }, { id: 'p-1' }, { id: 'p-2' }], perche: 'p', quando: ora(9) })
    if (!e.ok) throw new Error(e.errore)
    const riletta = leggiCoda(JSON.parse(JSON.stringify(e.coda)), 'W')
    const s = separa(riletta, 'r-1', ora(10))
    if (!s.ok) throw new Error(s.errore)
    expect(s.coda.richieste).toEqual(c.richieste)
  })
})

describe('la percentuale', () => {
  it('f(stato): da fare 0, in corso 0.2 + fino a 0.4 dal passo, in revisione 0.8, unito 1', () => {
    expect(fattoreCompito({ stato: 'da-fare' })).toBe(0)
    expect(fattoreCompito({ stato: 'in-corso' })).toBeCloseTo(0.2)
    expect(fattoreCompito({ stato: 'in-corso', passo: { k: 2, n: 4 } })).toBeCloseTo(0.4)
    expect(fattoreCompito({ stato: 'in-corso', passo: { k: 4, n: 4 } })).toBeCloseTo(0.6)
    expect(fattoreCompito({ stato: 'in-revisione' })).toBe(0.8)
    expect(fattoreCompito({ stato: 'unito' })).toBe(1)
    expect(passoDichiarato('sto facendo il passo 3 di 5: i test')).toEqual({ k: 3, n: 5 })
    expect(passoDichiarato('Passo 7/4')).toEqual({ k: 4, n: 4 })
    expect(passoDichiarato('niente')).toBeUndefined()
  })

  it('Σ peso·f / Σ peso, per richiesta e per il workspace', () => {
    expect(frazione([{ stato: 'unito', peso: 3 }, { stato: 'da-fare', peso: 1 }])).toBeCloseTo(0.75)
    expect(frazione([])).toBeUndefined()
    let c = codaVuota('W')
    c = aggiungi(c, { testo: 'a', quando: ora(0), compiti: ['k1', 'k2'] }).coda
    c = aggiungi(c, { testo: 'b', quando: ora(1), compiti: ['k3'] }).coda
    const stati: Record<string, ReturnType<MisuraCompito>> = { k1: { stato: 'unito' }, k2: { stato: 'in-revisione' }, k3: { stato: 'in-corso' } }
    const misura: MisuraCompito = (k) => stati[k]
    expect(avanzamentoRichiesta(r(c, 'r-1'), misura)).toBe(90)
    expect(avanzamentoRichiesta(r(c, 'r-2'), misura)).toBe(20)
    expect(avanzamentoCoda(c, misura)).toBe(67)
    // Non fatta, non al 100%: il criterio non è ancora verde.
    expect(avanzamentoRichiesta(r(c, 'r-1'), () => ({ stato: 'unito' }))).toBe(99)
    const fatta = { ...r(c, 'r-1'), stato: 'fatta' as const }
    expect(avanzamentoRichiesta(fatta, () => undefined)).toBe(100)
    expect(avanzamentoCoda(codaVuota('W'), misura)).toBeUndefined()
  })
})

describe('compattare le fatte da oltre 90 giorni', () => {
  it('diventano {id, titolo, fattaIl, commit, versione}; le altre restano', () => {
    let c = conRichieste('vecchia', 'recente', 'aperta')
    c = {
      ...c,
      richieste: c.richieste.map((x) => (x.id === 'r-1'
        ? { ...x, stato: 'fatta' as const, fattaIl: '2026-07-01T00:00:00.000Z', versione: '0.80.0', commit: 'abc1234' }
        : x.id === 'r-2' ? { ...x, stato: 'fatta' as const, fattaIl: '2026-10-01T00:00:00.000Z' } : x))
    }
    const m = compatta(c, T0)
    expect(m.coda.richieste.map((x) => x.id)).toEqual(['r-2', 'r-3'])
    expect(m.coda.compattate).toEqual([{ id: 'r-1', titolo: 'vecchia', fattaIl: '2026-07-01T00:00:00.000Z', versione: '0.80.0', commit: 'abc1234' }])
    expect(m.eventi).toEqual([{ tipo: 'compattazione', quando: T0, ids: ['r-1'] }])
    expect(compatta(m.coda, T0).coda).toBe(m.coda)
    // Il numero non si riusa dopo la compattazione.
    expect(leggiCoda(JSON.parse(JSON.stringify({ ...m.coda, prossimo: { r: 1, p: 1 } })), 'W').prossimo.r).toBe(4)
  })
})

describe('dal JSON del dialogo', () => {
  it('legge `unisci` e mette `nuovo` al posto dei punti del messaggio; i superati di prima entrano da soli', () => {
    let c = codaVuota('W')
    c = aggiungi(c, { testo: 'vecchia', quando: ora(0), punti: ['x', 'y'] }).coda
    c = { ...c, richieste: c.richieste.map((x) => ({ ...x, punti: x.punti.map((p) => (p.id === 'p-2' ? { ...p, stato: 'superato' as const, perche: 'prima' } : p)) })) }
    const m = aggiungi(c, { testo: 'nuova', quando: ora(1) })
    const d = leggiUnioneDalDialogo({ con: ['r-1'], testo: 'insieme', punti: [{ id: 'p-1' }, { id: 'nuovo', testo: 'riformulato' }], perche: 'stessa cosa' })
    expect(d).toBeDefined()
    const u = unioneDaDialogo(d!, m.richiesta, m.coda, ora(2))
    expect(u.ids).toEqual(['r-1', 'r-2'])
    expect(u.punti).toEqual([{ id: 'p-1' }, { id: 'p-3', testo: 'riformulato' }, { id: 'p-2' }])
    expect(unisci(m.coda, u).ok).toBe(true)
    expect(leggiUnioneDalDialogo(null)).toBeUndefined()
    expect(leggiUnioneDalDialogo({ con: [], testo: 't', perche: 'p', punti: [] })).toBeUndefined()
  })

  it('il supervisore che dimentica un punto di prima: l’unione si rifiuta', () => {
    let c = codaVuota('W')
    c = aggiungi(c, { testo: 'vecchia', quando: ora(0), punti: ['x', 'y'] }).coda
    const m = aggiungi(c, { testo: 'nuova', quando: ora(1) })
    const u = unioneDaDialogo({ con: ['r-1'], testo: 'insieme', punti: [{ id: 'p-1' }], perche: 'p' }, m.richiesta, m.coda, ora(2))
    expect(unisci(m.coda, u)).toEqual({ ok: false, errore: 'unione rifiutata: si perderebbero i punti p-2' })
  })
})

describe('lettura dal disco', () => {
  it('andata e ritorno uguale; una richiesta illeggibile si salta', () => {
    const c = conRichieste('uno', 'due')
    expect(leggiCoda(JSON.parse(JSON.stringify(c)), 'W')).toEqual(c)
    const rotta = leggiCoda({ ...c, richieste: [...c.richieste, { id: 'x' }] }, 'W')
    expect(rotta.richieste).toHaveLength(2)
    expect(leggiCoda('niente', 'W')).toEqual(codaVuota('W'))
  })
})
