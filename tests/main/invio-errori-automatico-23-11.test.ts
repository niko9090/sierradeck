import { describe, it, expect } from 'vitest'
import { ATTESA_LIMITE_MS, ATTESA_TETTO_MS, attesaDopo, eLimiteRichieste, eSpazioEsaurito, type AttesaInvio } from '../../src/shared/attesa-invio'
import { giroInvioErrori } from '../../src/main/errori-invio-automatico'
import { mandaErrori } from '../../src/main/errori-arrivati'
import { giroRapportoLavori, mandaRapporto } from '../../src/main/rapporti-lavori'
import type { StoricoErrori } from '../../src/shared/storico-errori'
import type { RapportoLavori } from '../../src/shared/rapporto-lavori'

const T0 = Date.parse('2026-11-20T12:00:00Z')
const storico: StoricoErrori = { voci: [{ messaggio: 'x', dove: 'pc', quando: new Date(T0 - 3_600_000).toISOString(), ultima: new Date(T0 - 3_600_000).toISOString(), volte: 1 }] }

type Esito = { ok: boolean; messaggio: string }

function giroProva(esiti: Array<Esito | 'lancia' | 'appeso'>) {
  let tempo = T0
  let attesa: AttesaInvio | undefined
  let motivo: string | undefined
  let chiamate = 0
  const righe: string[] = []
  const giro = (forza = false) => giroInvioErrori({
    storico: () => storico,
    stato: { leggi: () => ({ fino: new Date(T0 - 86_400_000).toISOString() }), scrivi: () => {} },
    pcSviluppo: () => 'pc-a',
    adesso: () => tempo,
    manda: async () => {
      chiamate++
      const e = esiti.shift() ?? { ok: true, messaggio: 'Mandati' }
      if (e === 'lancia') throw new Error('Drive ricerca 403 (limite di richieste)')
      if (e === 'appeso') return await new Promise<Esito>(() => undefined)
      return e
    },
    log: (r) => righe.push(r),
    fallimento: { leggi: () => motivo, scrivi: (m) => { motivo = m } },
    attesa: { leggi: () => attesa, scrivi: (a) => { attesa = a } },
    tempoMassimoMs: 50,
    forza
  })
  return { giro, avanza: (ms: number) => { tempo += ms }, chiamate: () => chiamate, righe, attesa: () => attesa }
}

describe('invio automatico degli errori (k-197h)', () => {
  it('dopo un errore il giro riparte: un invio che scoppia o resta appeso non lo spegne', async () => {
    const p = giroProva(['lancia', 'appeso', { ok: true, messaggio: 'Mandati' }])
    expect((await p.giro()).ok).toBe(false) // l'eccezione diventa un esito fallito, con attesa
    expect(p.attesa()?.fallimenti).toBe(1)
    p.avanza(ATTESA_LIMITE_MS)
    const appeso = await p.giro() // non resta in attesa per sempre
    expect(appeso.ok).toBe(false)
    expect(appeso.messaggio).toMatch(/non ha finito entro/)
    expect(p.attesa()?.fallimenti).toBe(2)
    p.avanza(ATTESA_TETTO_MS)
    expect((await p.giro()).ok).toBe(true)
    expect(p.attesa()).toBeUndefined()
    expect(p.chiamate()).toBe(3)
  })

  it('un 403 di limite aspetta (2 minuti, poi il doppio) e poi riprova', async () => {
    const limite = 'Drive ricerca 403 (limite di richieste)'
    expect(eLimiteRichieste(limite)).toBe(true)
    expect(eLimiteRichieste('403 userRateLimitExceeded')).toBe(true)
    expect(eSpazioEsaurito('Quota exceeded for quota metric per minute')).toBe(false)
    expect(eSpazioEsaurito('storageQuotaExceeded')).toBe(true)
    expect([1, 2, 3].map((n) => attesaDopo(n, limite))).toEqual([ATTESA_LIMITE_MS, 2 * ATTESA_LIMITE_MS, 4 * ATTESA_LIMITE_MS])
    expect(attesaDopo(20, limite)).toBe(ATTESA_TETTO_MS)

    const p = giroProva([{ ok: false, messaggio: limite }, { ok: false, messaggio: limite }])
    await p.giro()
    p.avanza(ATTESA_LIMITE_MS - 1)
    await p.giro()
    expect(p.chiamate()).toBe(1) // ancora in attesa: non si martella Drive
    p.avanza(1)
    await p.giro()
    expect(p.chiamate()).toBe(2) // scaduta l'attesa riprova
    p.avanza(2 * ATTESA_LIMITE_MS - 1)
    await p.giro()
    expect(p.chiamate()).toBe(2)
    p.avanza(1)
    expect((await p.giro()).ok).toBe(true)
    expect(p.chiamate()).toBe(3)
  })

  it('il motivo viene scritto, anche quello della posta sul Drive', async () => {
    const p = giroProva([{ ok: false, messaggio: 'Non mandati a PC: rete' }])
    await p.giro()
    expect(p.righe).toHaveLength(1)
    expect(p.righe[0]).toContain('Non mandati a PC: rete')
    expect(p.righe[0]).toMatch(/riprovo fra \d+ secondi/)

    const log: string[] = []
    const e = await mandaErrori({
      pcSviluppo: 'pc-ref', io: { id: 'pc-io', nome: 'Io' }, versione: '0.1.0', storico, nomeDi: () => 'Riferimento',
      chiama: async () => { throw new Error('Riferimento non raggiungibile') },
      salvaQui: () => ({ ok: false, errore: 'no' }),
      perPosta: async () => { throw new Error('Drive ricerca 403 (limite di richieste)') },
      log: (r) => log.push(r)
    })
    expect(e.ok).toBe(false)
    expect(e.messaggio).toContain('Riferimento non raggiungibile')
    expect(e.messaggio).toContain('limite di richieste')
    expect(log[0]).toContain('limite di richieste')
  })

  it('anche il rapporto dei lavori passa di lì: stessa attesa, stesso motivo, stessa ripartenza', async () => {
    let tempo = T0
    let attesa: AttesaInvio | undefined
    let chiamate = 0
    const righe: string[] = []
    const riga = `${new Date(T0 - 60_000).toISOString()} [info] [servizio] [unione di prova] ramo-a: attesa del turno 12 s, prova 340 s`
    const d = {
      righe: () => [riga],
      stato: { leggi: () => ({ fino: new Date(T0 - 86_400_000).toISOString() }), scrivi: () => {} },
      pcRiferimento: () => 'pc-ref',
      adesso: () => tempo,
      da: () => 'Io',
      versione: '0.1.0',
      manda: async (_r: RapportoLavori): Promise<Esito> => { chiamate++; if (chiamate === 1) throw new Error('403 limite di richieste'); return { ok: true, messaggio: 'ok' } },
      log: (r: string) => righe.push(r),
      attesa: { leggi: () => attesa, scrivi: (a: AttesaInvio | undefined) => { attesa = a } },
      tempoMassimoMs: 50
    }
    const primo = await giroRapportoLavori(d)
    expect(primo.ok).toBe(false)
    expect(primo.messaggio).toContain('limite di richieste')
    expect(attesa?.fallimenti).toBe(1)
    expect(righe[0]).toContain('limite di richieste')
    tempo += attesa!.fino - tempo
    expect((await giroRapportoLavori(d)).ok).toBe(true)
  })

  it('mandaRapporto dice il motivo del Drive quando nemmeno la posta lo prende', async () => {
    const r = { da: 'Io', versione: '0.1.0', giorno: '2026-11-20', dal: 'a', al: 'b', workspace: {} } as unknown as RapportoLavori
    const e = await mandaRapporto({
      pcRiferimento: 'pc-ref', io: { id: 'pc-io', nome: 'Io' }, rapporto: r, nomeDi: () => 'Riferimento',
      chiama: async () => { throw new Error('Riferimento non raggiungibile') },
      salvaQui: () => ({ ok: false, errore: 'no' }),
      perPosta: async () => { throw new Error('Drive 403 (limite di richieste)') },
      log: () => undefined
    })
    expect(e.ok).toBe(false)
    expect(e.messaggio).toContain('limite di richieste')
  })
})
