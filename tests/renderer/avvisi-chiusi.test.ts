import { describe, it, expect } from 'vitest'
import { componiAvvisi, chiavePreparazione, ricordaChiusi, AVVISI_CHIUSI_MAX, type FontiAvvisi } from '../../src/renderer/avvisi'
import { nuovoAutopilota, chiaveFermo, conMomentoDelFermo, parseAutopilota, type Autopilota } from '@shared/autopilota'
import { normalizzaPreferenze, PREFERENZE_PREDEFINITE } from '@shared/preferenze'

/**
 * La banda degli autopiloti fermi si chiude (0.37.0). Nicholas: un autopilota
 * che non deve ripartire restava nella banda per sempre, con il solo «Vedi».
 * Chiuso, non torna per lo stesso fermo; torna per un fermo nuovo.
 */
function ap(over: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({
      id: 'ap-1', nome: 'Test verdi', obiettivo: 'o', cwd: 'C:\\p',
      iniziatoIl: '2026-10-01T10:00:00.000Z'
    }),
    stato: 'sospeso',
    motivoSospensione: 'limiti del piano',
    fermatoIl: '2026-10-01T11:00:00.000Z',
    ...over
  }
}
function fonti(over: Partial<FontiAvvisi> = {}): FontiAvvisi {
  return {
    accesso: { autenticato: true },
    servizioRaggiungibile: true,
    autopiloti: [],
    preparazione: { claude: 'C:\\c\\claude.exe', avvisi: [] },
    ...over
  }
}

describe('banda: «Vedi» e «Chiudi»', () => {
  it('un fermo ha «Vedi» e si può chiudere (30/10: niente «Riprendi»/«Archivia»)', () => {
    const [a] = componiAvvisi(fonti({ autopiloti: [ap()] }))
    expect(a?.id).toBe('fermi')
    expect(a?.etichettaAzione).toBe('Vedi')
    expect('altre' in (a ?? {})).toBe(false)
    expect(a?.chiavi).toEqual([chiaveFermo(ap())])
  })

  it('chiuso → non torna per lo stesso fermo, nemmeno dopo un riavvio (le chiavi passano dalle preferenze)', () => {
    const chiavi = componiAvvisi(fonti({ autopiloti: [ap()] }))[0]?.chiavi ?? []
    // Il riavvio: le preferenze si riscrivono e si rileggono.
    const dopo = normalizzaPreferenze(JSON.parse(JSON.stringify({ ...PREFERENZE_PREDEFINITE, avvisiChiusi: ricordaChiusi([], chiavi) })))
    expect(componiAvvisi(fonti({ autopiloti: [ap()], chiusi: dopo.avvisiChiusi }))).toEqual([])
  })

  it('fermo nuovo → torna: ripartito e fermato di nuovo, o fermato per un altro motivo', () => {
    const chiusi = [chiaveFermo(ap())]
    expect(componiAvvisi(fonti({ autopiloti: [ap({ fermatoIl: '2026-10-01T15:00:00.000Z' })], chiusi }))[0]?.id).toBe('fermi')
    expect(componiAvvisi(fonti({ autopiloti: [ap({ stato: 'fallito', motivoSospensione: 'avvio fallito' })], chiusi }))[0]?.id).toBe('fermi')
    // Con due fermi e uno chiuso, resta l'altro.
    const due = componiAvvisi(fonti({ autopiloti: [ap(), ap({ id: 'ap-2', nome: 'Secondo' })], chiusi }))
    expect(due[0]?.testo).toContain('Secondo')
    expect(due[0]?.chiavi).toHaveLength(1)
  })

  it('un archiviato non compare nella banda', () => {
    expect(componiAvvisi(fonti({ autopiloti: [ap({ archiviato: true })] }))).toEqual([])
  })

  it('i programmi mancanti: chiusi non tornano finché la lista non cambia', () => {
    const prep = { claude: 'C:\\c\\claude.exe', avvisi: ['Git non trovato'] }
    const chiusi = [chiavePreparazione(['Git non trovato'])]
    expect(componiAvvisi(fonti({ preparazione: prep, chiusi }))).toEqual([])
    const nuova = componiAvvisi(fonti({ preparazione: { ...prep, avvisi: ['Git non trovato', 'Node.js non trovato'] }, chiusi }))
    expect(nuova[0]?.id).toBe('preparazione')
  })

  it('le chiavi chiuse non crescono per sempre e non si ripetono', () => {
    const tante = Array.from({ length: AVVISI_CHIUSI_MAX + 20 }, (_, i) => `k${i}`)
    expect(ricordaChiusi(tante, ['k5'])).toHaveLength(AVVISI_CHIUSI_MAX)
    expect(ricordaChiusi(['a', 'b'], ['a'])).toEqual(['b', 'a'])
  })
})

describe('il momento del fermo (servizio)', () => {
  it('si scrive entrando nel fermo, resta finché è fermo, sparisce (con l archiviazione) quando riparte', () => {
    const fermo = conMomentoDelFermo(ap({ fermatoIl: undefined }), '2026-10-01T12:00:00.000Z')
    expect(fermo.fermatoIl).toBe('2026-10-01T12:00:00.000Z')
    expect(conMomentoDelFermo({ ...fermo, archiviato: true }, '2026-10-01T13:00:00.000Z').fermatoIl).toBe('2026-10-01T12:00:00.000Z')
    const ripartito = conMomentoDelFermo({ ...fermo, archiviato: true, stato: 'lavoro' }, '2026-10-01T14:00:00.000Z')
    expect(ripartito.fermatoIl).toBeUndefined()
    expect(ripartito.archiviato).toBeUndefined()
  })

  it('fermatoIl e archiviato sopravvivono alla rilettura del file', () => {
    const letto = parseAutopilota(JSON.parse(JSON.stringify({ ...ap({ archiviato: true }), versione: 1 })))
    expect(letto.autopilota?.fermatoIl).toBe('2026-10-01T11:00:00.000Z')
    expect(letto.autopilota?.archiviato).toBe(true)
  })
})

// Le notifiche della pagina per un fermo (11/11): non più dallo stato, dal registro degli avvisi del PC
// (un fermo si annuncia una volta per id: tests/main/avvisi.test.ts, client-pagina-spunte-e-schede).
