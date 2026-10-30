import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaTrasloco, type DipendenzeTrasloco } from '../../src/main/trasloco'
import { daTogliere, fermoChiaro, nuovoTrasloco, ferma, vistoDa, PULISCI_TRASLOCHI_GIORNI, type Trasloco } from '@shared/trasloco'
import type { StatoResidenza } from '@shared/residenza'

/**
 * Audit M5 (0.86.2): un trasloco è rimasto su «Raccolgo le copie» per sempre,
 * e sul PC che lo seguiva mostrava «Collega prima Google Drive» — l'errore
 * dell'altro PC — come se fosse di questo. In più la cartella `traslochi`
 * cresceva senza fine.
 */
const GIORNO = 86_400_000
const ORA = Date.parse('2026-10-30T08:00:00.000Z')

function traslocoSu(pc: { pc: string; nome: string }, adesso = ORA): Trasloco {
  return nuovoTrasloco({
    id: 'trasloco-prova', progetto: 'p1', nome: 'SierraDeck-prova-trasloco', verso: pc,
    chiesto: { da: 'pc-qui', come: 'sposta' }, altrove: [{ pc: 'pc-qui', nome: 'PC-ESEMPIO' }], adesso: new Date(adesso).toISOString()
  })
}

describe('un errore di un altro PC si dice con il suo nome', () => {
  const torre = { pc: 'pc-torre', nome: 'TORRE-ESEMPIO' }
  const fermo = ferma(traslocoSu(torre), 'analisi', 'Collega prima Google Drive.', false, new Date(ORA).toISOString())

  it('sul PC che lo segue: «Su «Torre»: Collega prima Google Drive.»', () => {
    expect(fermoChiaro(fermo, () => 'Torre', 'pc-qui')?.testo).toBe('Su «Torre»: Collega prima Google Drive.')
    expect(vistoDa(fermo, 'pc-qui', () => 'Torre').passi.analisi.dettaglio).toBe('Su «Torre»: Collega prima Google Drive.')
    // Il motivo vero non si tocca: serve a riconoscere il PC spento.
    expect(vistoDa(fermo, 'pc-qui').fermo?.motivo).toBe('Collega prima Google Drive.')
  })

  it('sul PC dove gira resta com’era', () => {
    expect(fermoChiaro(fermo, () => 'Torre', 'pc-torre')?.testo).toBe('Collega prima Google Drive.')
    expect(vistoDa(fermo, 'pc-torre')).toBe(fermo)
    expect(fermoChiaro(fermo)?.testo).toBe('Collega prima Google Drive.')
  })

  it('un terzo PC spento, visto da qui: il nome di chi lo dice, senza «da qui»', () => {
    const t = { ...traslocoSu(torre), altrove: [{ pc: 'pc-port', nome: 'PORTATILE-ESEMPIO' }] }
    const f = ferma(t, 'raccolta', 'PORTATILE-ESEMPIO non risponde (timeout)', true, new Date(ORA).toISOString(), 'pc-port')
    const testo = fermoChiaro(f, () => undefined, 'pc-qui')?.testo ?? ''
    expect(testo.startsWith('Su «TORRE-ESEMPIO»: «PORTATILE-ESEMPIO» è spento o non si raggiunge.')).toBe(true)
  })
})

function banco(chiamaPc: DipendenzeTrasloco['chiamaPc'], dati = mkdtempSync(join(tmpdir(), 'trasloco-m5-'))) {
  const righe: string[] = []
  let adesso = ORA
  const riassunto = {
    nome: 'SierraDeck-prova-trasloco', pcNome: 'PC-ESEMPIO', destinazione: 'C:\\prova', nuova: false, git: false, copie: [],
    file: { uguali: 1, aggiunti: 0, sostituiti: 0, recuperati: 0, note: 0 }, chat: { daSpostare: 0, delProgetto: 0, daAltriPc: 0 },
    workspace: { tiene: 'x', uniti: [], aperti: [] }, registro: { principale: 'p1', uniti: [] }, recupero: [], inUso: [], recuperati: 'r', righe: []
  }
  const d: DipendenzeTrasloco = {
    dati,
    io: () => ({ id: 'pc-qui', nome: 'PC-ESEMPIO' }),
    progetto: async (id) => (id === 'p1' ? { id: 'p1', nome: 'SierraDeck-prova-trasloco', ids: ['p1'], altrove: [{ pc: 'pc-port', nome: 'PORTATILE-ESEMPIO' }] } : undefined),
    residenza: {
      avvia: async (progetto) => ({ progetto, nome: 'x', fase: 'attesa-conferma', messaggio: 'r', riassunto, quando: '' } as StatoResidenza),
      conferma: async (progetto) => ({ progetto, nome: 'x', fase: 'fatta', messaggio: 'ok', quando: '' } as StatoResidenza),
      stati: () => [],
      annullaUnione: async () => ({ ok: true, messaggio: 'ok' })
    },
    chiamaPc,
    casaA: async () => ({ ok: true, messaggio: 'ok' }),
    log: (m) => { righe.push(m) },
    attesa: async () => undefined,
    adesso: () => adesso,
    tempoMassimoMs: 30
  }
  return { d, dati, righe, avanza: (ms: number) => { adesso += ms } }
}

describe('un trasloco fermo su «Raccolgo le copie»', () => {
  it('la chiamata che non torna scade: il passo si ferma con il motivo e riprende da solo', async () => {
    let risponde = false
    const b = banco((_pc, percorso) => {
      if (!risponde) return new Promise(() => undefined) // non torna mai
      if (percorso === '/api/trasloco/salva') return Promise.resolve({ ok: true })
      if (percorso === '/api/trasloco/togli') return Promise.resolve({ ok: true })
      return Promise.resolve({ fase: 'spostata', messaggio: 'Tolto.' })
    })
    const tr = creaTrasloco(b.d)
    const id = (await tr.avvia('p1', { da: 'pc-port', come: 'sposta' })).trasloco!.id
    await tr.inCorso(id)
    const fermo = tr.stato(id)!
    expect(fermo.fermo?.passo).toBe('raccolta')
    expect(fermo.fermo?.motivo).toContain('nessuna risposta')
    expect(fermo.fermo?.riprovaDaSolo).toBe(true)
    expect(tr.inCorso(id)).toBeUndefined()
    // Al giro dopo, con il PC che risponde, va fino in fondo.
    risponde = true
    tr.giro()
    await tr.inCorso(id)
    expect(tr.stato(id)?.finitoIl).toBeDefined()
  })
})

describe('la cartella traslochi si pulisce', () => {
  it('daTogliere: finiti o falliti da più di sette giorni, mai se «Annulla tutto» vale ancora', () => {
    const qui = { pc: 'pc-qui', nome: 'PC-ESEMPIO' }
    const vecchio = ORA - (PULISCI_TRASLOCHI_GIORNI + 1) * GIORNO
    const annullato: Trasloco = { ...traslocoSu(qui, vecchio), annullatoIl: new Date(vecchio).toISOString() }
    expect(daTogliere(annullato, ORA)).toBe(true)
    expect(daTogliere({ ...annullato, annullatoIl: new Date(ORA - GIORNO).toISOString() }, ORA)).toBe(false)
    const fallito = ferma(traslocoSu(qui, vecchio), 'analisi', 'qualcosa non va', false, new Date(vecchio).toISOString())
    expect(daTogliere(fallito, ORA)).toBe(true)
    const aspettaUnPc = ferma(traslocoSu(qui, vecchio), 'raccolta', 'X non risponde', true, new Date(vecchio).toISOString())
    expect(daTogliere(aspettaUnPc, ORA)).toBe(false)
    const conUnione: Trasloco = { ...traslocoSu(qui, vecchio), unione: 'u1', finitoIl: new Date(vecchio).toISOString(), scadeIl: new Date(vecchio + 30 * GIORNO).toISOString() }
    expect(daTogliere(conUnione, ORA)).toBe(false)
    expect(daTogliere(conUnione, vecchio + 31 * GIORNO)).toBe(true)
    expect(daTogliere(traslocoSu(qui, vecchio), ORA)).toBe(false)
  })

  it('il giro toglie i file vecchi e lascia gli altri', () => {
    const dati = mkdtempSync(join(tmpdir(), 'trasloco-pulizia-'))
    const cartella = join(dati, 'traslochi')
    mkdirSync(cartella, { recursive: true })
    const qui = { pc: 'pc-qui', nome: 'PC-ESEMPIO' }
    const vecchio = ORA - 10 * GIORNO
    const scrivi = (t: Trasloco): void => { writeFileSync(join(cartella, `${t.id}.json`), JSON.stringify(t)) }
    scrivi({ ...traslocoSu(qui, vecchio), id: 'trasloco-vecchio', annullatoIl: new Date(vecchio).toISOString() })
    scrivi({ ...traslocoSu(qui, ORA - GIORNO), id: 'trasloco-recente', annullatoIl: new Date(ORA - GIORNO).toISOString() })
    scrivi({ ...traslocoSu(qui, vecchio), id: 'trasloco-annullabile', unione: 'u1', finitoIl: new Date(vecchio).toISOString(), scadeIl: new Date(vecchio + 30 * GIORNO).toISOString() })
    const b = banco(() => Promise.resolve({}), dati)
    const tr = creaTrasloco(b.d)
    tr.giro()
    expect(existsSync(join(cartella, 'trasloco-vecchio.json'))).toBe(false)
    expect(existsSync(join(cartella, 'trasloco-recente.json'))).toBe(true)
    expect(existsSync(join(cartella, 'trasloco-annullabile.json'))).toBe(true)
    expect(tr.stato('trasloco-vecchio')).toBeUndefined()
    expect(b.righe.some((r) => r.includes('tolti 1 trasloco'))).toBe(true)
  })
})
