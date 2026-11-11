import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { annunciaAperte, avvisaNelGiornale, conGiornale, fattoDomanda } from '../../src/autopilot-host/avvisi-servizio'
import { creaRegistroDomande, type DomandaAperta } from '../../src/autopilot-host/domande'
import { DOMANDA_DECIDO_IO_MS } from '../../src/autopilot-host/domande-in-chat'
import { apriGiornaleAvvisi, leggiGiornaleAvvisi, NOTIZIE_TENUTE } from '../../src/autopilot-host/giornale-avvisi'
import { chiusuraDaMotivo, type Notizia } from '@shared/avvisi-telefono'
import type { Autopilota } from '@shared/autopilota'

const parti = { staFacendo: 'Rifaccio la schermata Adesso', domanda: 'Tengo il vecchio elenco?', perche: 'Serve a decidere il passo dopo', scelte: [{ scelta: 'Sì', conseguenza: 'lo tengo', consigliata: true as const }, { scelta: 'No', conseguenza: 'lo tolgo' }], seNonRispondi: 'scelgo io' }

function banco() {
  const giornale = apriGiornaleAvvisi({})
  const notizie: Notizia[] = []
  const g = { ...giornale, annota: (f: Parameters<typeof giornale.annota>[0]) => { const n = giornale.annota(f); notizie.push(n); return n } }
  const coda: (() => void)[] = []
  const registro = conGiornale(creaRegistroDomande({ adesso: () => 1_000_000 }), g, (id) => (id === 'ap-1' ? { workspace: 'Negozio' } : undefined), (f) => { coda.push(f) })
  const microtask = (): void => { while (coda.length > 0) coda.shift()!() }
  return { registro, notizie, microtask, g }
}

describe('il giornale degli avvisi del servizio', () => {
  it('numera, tiene le ultime, si rilegge dal disco', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'giornale-')), 'giornale-avvisi.json')
    const g = apriGiornaleAvvisi({ file, adesso: () => 0 })
    for (let i = 0; i < NOTIZIE_TENUTE + 3; i += 1) g.annota({ cosa: 'fatto', id: `f${i}`, workspace: 'w', titolo: 'x' })
    const letto = leggiGiornaleAvvisi(file)
    expect(letto?.ultimo).toBe(NOTIZIE_TENUTE + 3)
    expect(letto?.notizie).toHaveLength(NOTIZIE_TENUTE)
    expect(letto?.notizie[0]?.n).toBe(4)
    // Riaperto, il numero non torna indietro.
    expect(apriGiornaleAvvisi({ file }).annota({ cosa: 'fatto', id: 'y', workspace: 'w', titolo: 'x' }).n).toBe(NOTIZIE_TENUTE + 4)
    expect(leggiGiornaleAvvisi(join(file, '..', 'non-c-e.json'))).toBeUndefined()
  })
})

describe('le domande nel giornale', () => {
  it('aperta fuori dalla chat: si annuncia dopo che chi l’ha aperta ha scritto il contesto (non rischiosa: con la scadenza)', () => {
    const { registro, notizie, microtask } = banco()
    const d = registro.apri({ autopilotaId: 'ap-1', testo: '«Negozio» ti chiede:\n\nTengo il vecchio elenco?', scadenzaMs: 1000, opzioni: ['Sì', 'No'], parti })
    registro.ricorda(d.id, { autopilotaId: 'ap-1', testo: 'x', rischiosa: false })
    expect(notizie).toEqual([])
    microtask()
    expect(notizie).toHaveLength(1)
    expect(notizie[0]).toMatchObject({
      cosa: 'domanda', id: d.id, workspace: 'Negozio', autopilota: 'ap-1', domanda: 'Tengo il vecchio elenco?',
      scelte: [{ scelta: 'Sì', consigliata: true }, { scelta: 'No' }], scadeIl: 1_000_000 + DOMANDA_DECIDO_IO_MS
    })
  })

  it('nella chat: niente finché non esce; uscita, si annuncia; rischiosa: aspetta lui', () => {
    const { registro, notizie, microtask } = banco()
    const d = registro.apri({ autopilotaId: 'ap-1', testo: 't', scadenzaMs: 1000, parti, inChat: true })
    registro.ricorda(d.id, { autopilotaId: 'ap-1', testo: 't', rischiosa: true })
    microtask()
    expect(notizie).toEqual([])
    registro.emergi(d.id, 2_000_000)
    expect(notizie).toHaveLength(1)
    expect(notizie[0]).toMatchObject({ cosa: 'domanda', id: d.id, aspettaTe: true })
    expect((notizie[0] as { scadeIl?: number }).scadeIl).toBeUndefined()
  })

  it('la risposta, il ritiro e la scelta del programma chiudono; una domanda mai uscita dalla chat no', () => {
    const { registro, notizie, microtask } = banco()
    const a = registro.apri({ autopilotaId: 'ap-1', testo: 'a', scadenzaMs: 1000, parti })
    const b = registro.apri({ autopilotaId: 'ap-1', testo: 'b', scadenzaMs: 1000, parti })
    const c = registro.apri({ autopilotaId: 'ap-1', testo: 'c', scadenzaMs: 1000, parti })
    const solo = registro.apri({ autopilotaId: 'ap-1', testo: 'd', scadenzaMs: 1000, parti, inChat: true })
    microtask()
    notizie.length = 0
    registro.rispondi(a.id, 'Sì', 'modale')
    registro.ritira?.(b.id, 'non serve più')
    registro.superata(c.id, 'nessuna risposta in un’ora: scelta la consigliata, «Sì»')
    registro.superata(solo.id, 'la richiesta è chiusa')
    expect(notizie.map((n) => n.cosa === 'domanda-chiusa' ? [n.id, n.come, n.testo] : n.cosa)).toEqual([
      [a.id, 'risposta', 'Sì'], [b.id, 'ritirata', undefined], [c.id, 'programma', 'Sì']
    ])
  })

  it('chiudere le domande di un autopilota le chiude anche nel giornale', () => {
    const { registro, notizie, microtask } = banco()
    const a = registro.apri({ autopilotaId: 'ap-1', testo: 'a', scadenzaMs: 1000 })
    microtask()
    registro.chiudiDi('ap-1')
    expect(notizie.at(-1)).toMatchObject({ cosa: 'domanda-chiusa', id: a.id, come: 'ritirata' })
  })

  it('all’avvio, le domande già visibili che il giornale non ha', () => {
    const { registro, notizie, microtask, g } = banco()
    registro.apri({ autopilotaId: 'ap-1', testo: 'a', scadenzaMs: 1000 })
    microtask()
    expect(annunciaAperte(registro, g, () => undefined)).toBe(0)
    const nuovo = creaRegistroDomande({ adesso: () => 0 })
    nuovo.apri({ autopilotaId: 'ap-2', testo: '«X» ti chiede:\n\nVado avanti?', scadenzaMs: 1000, opzioni: ['Sì', 'No'] })
    expect(annunciaAperte(nuovo, g, () => undefined)).toBe(1)
    expect(notizie.at(-1)).toMatchObject({ cosa: 'domanda', workspace: '', domanda: 'Vado avanti?', scelte: [{ scelta: 'Sì' }, { scelta: 'No' }] })
  })

  it('una domanda senza parti (il consenso a cancellare): la frase intera, le opzioni come scelte', () => {
    const d: DomandaAperta = { id: 'd-1', autopilotaId: 'ap', testo: 'Posso cancellare la cartella dei file temporanei?', apertaIl: 0, scadeIl: 0, opzioni: ['No', 'Sì'] }
    expect(fattoDomanda(d, 'w')).toEqual({ cosa: 'domanda', id: 'd-1', workspace: 'w', autopilota: 'ap', domanda: 'Posso cancellare la cartella dei file temporanei?', scelte: [{ scelta: 'No' }, { scelta: 'Sì' }] })
  })
})

describe('com’è finita, dal motivo del servizio', () => {
  it('le frasi di chiudiDomandeVecchie', () => {
    expect(chiusuraDaMotivo('nessuna risposta in un’ora: scelta la consigliata, «Sì, tienilo»')).toEqual({ come: 'programma', testo: 'Sì, tienilo' })
    expect(chiusuraDaMotivo('nessuna risposta in un’ora: decide l’autopilota, con la strada più prudente')).toEqual({ come: 'programma' })
    expect(chiusuraDaMotivo('nessuna risposta in un giorno: l’autopilota decide con la scelta consigliata, o la rifà aggiornata')).toEqual({ come: 'scaduta' })
    expect(chiusuraDaMotivo('la richiesta r-3 è fatta: non serve più')).toEqual({ come: 'ritirata' })
  })

  it('le frasi sono ancora quelle che scrive il servizio', () => {
    const sorgente = readFileSync('src/autopilot-host/servizio-orchestratore.ts', 'utf8')
    expect(sorgente).toContain('`nessuna risposta in un’ora: scelta la consigliata, «${s.scelta}»`')
    expect(sorgente).toContain("'nessuna risposta in un’ora: decide l’autopilota, con la strada più prudente'")
    expect(sorgente).toContain("'nessuna risposta in un giorno: l’autopilota decide con la scelta consigliata, o la rifà aggiornata'")
  })
})

describe('l’avvisatore del servizio scrive nel giornale', () => {
  const ap = (extra: Partial<Autopilota> = {}): Autopilota => ({ id: 'ap-1', nome: 'Autopilota · Negozio', workspace: 'Negozio', ...extra }) as unknown as Autopilota

  it('«Fatta», «tutte fatte», «Lavoro fermo»; le domande no', async () => {
    const g = apriGiornaleAvvisi({})
    const notizie: Notizia[] = []
    const avvisa = avvisaNelGiornale({ ...g, annota: (f) => { const n = g.annota(f); notizie.push(n); return n } }, () => 5)
    await avvisa('avviso', ap({ annuncio: { id: 'n1', titolo: 'Fatta: Rifai la schermata', quando: 'q' } }), 'Fatta: Rifai la schermata')
    await avvisa('finito', ap({ annuncio: { id: 'n2', titolo: 'Fatta: Ultima', quando: 'q' } }), 'Tutte le richieste del workspace sono fatte.')
    await avvisa('avviso', ap({ annuncio: { id: 'n3', titolo: 'Lavoro fermo', quando: 'q' } }), 'Fermo da 12 minuti: nessuno lavora.')
    await avvisa('domanda', ap(), 'Vado?')
    expect(notizie.map(({ n: _n, quando: _q, ...f }) => f)).toEqual([
      { cosa: 'fatto', id: 'n1', workspace: 'Negozio', autopilota: 'ap-1', titolo: 'Fatta: Rifai la schermata' },
      { cosa: 'fatto', id: 'n2', workspace: 'Negozio', autopilota: 'ap-1', titolo: 'Fatta: Ultima', tutte: true },
      { cosa: 'fermo', id: 'n3', workspace: 'Negozio', autopilota: 'ap-1', motivo: 'Fermo da 12 minuti: nessuno lavora.' }
    ])
    await avvisa.svuotaOra()
  })

  it('il servizio usa il giornale, non più Telegram', () => {
    const sorgente = readFileSync('src/autopilot-host/index.ts', 'utf8')
    expect(sorgente).toContain('conGiornale(creaRegistroDomande(')
    expect(sorgente).toContain('const avvisa = avvisaNelGiornale(giornale)')
    expect(sorgente).not.toContain('creaAvvisatore(')
  })
})
