import { describe, it, expect } from 'vitest'
import { componiAvvisi, chiavePreparazione, ricordaChiusi, AVVISI_CHIUSI_MAX, type FontiAvvisi } from '../../src/renderer/avvisi'
import { nuovoAutopilota, chiaveFermo, conMomentoDelFermo, parseAutopilota, type Autopilota } from '@shared/autopilota'
import { normalizzaPreferenze, PREFERENZE_PREDEFINITE } from '@shared/preferenze'
import { paginaClient } from '../../src/main/client-pagina'

/**
 * La banda degli autopiloti fermi si chiude (0.37.0). Nicholas: un autopilota
 * che non deve ripartire restava nella banda per sempre, con il solo «Vedi».
 * Chiuso, non torna per lo stesso fermo; torna per un fermo nuovo.
 */
function ap(over: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({
      id: 'ap-1', nome: 'Test verdi', obiettivo: 'o', cwd: 'C:\\p',
      criteri: [{ descrizione: 'c', soddisfatto: false }],
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

describe('banda: «Chiudi», «Riprendi», «Archivia»', () => {
  it('un fermo ha «Vedi», «Riprendi», «Archivia» e si può chiudere', () => {
    const [a] = componiAvvisi(fonti({ autopiloti: [ap()] }))
    expect(a?.id).toBe('fermi')
    expect(a?.etichettaAzione).toBe('Vedi')
    expect(a?.altre?.map((x) => x.etichetta)).toEqual(['Riprendi', 'Archivia'])
    expect(a?.altre?.[0]?.ids).toEqual(['ap-1'])
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

describe('le notifiche della pagina per un autopilota fermo', () => {
  const html = paginaClient()
  const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
  const estrai = (nome: string): string => {
    const inizio = script.indexOf(`function ${nome}(`)
    let profondita = 0
    for (let i = script.indexOf('{', inizio); i < script.length; i++) {
      if (script[i] === '{') profondita++
      else if (script[i] === '}' && --profondita === 0) return script.slice(inizio, i + 1)
    }
    throw new Error('non si chiude')
  }
  const giro = (): ((stato: unknown) => void) & { mandate: string[] } => {
    const mandate: string[] = []
    const f = new Function('mandate', `
      var avvisati = {}; var primoAvviso = false
      function Notification(titolo) { mandate.push(titolo) }
      Notification.permission = 'granted'
      ${estrai('avvisaSeServe')}
      return avvisaSeServe`)(mandate) as (stato: unknown) => void
    return Object.assign(f, { mandate })
  }
  const fermo = (chiave: string, extra: Record<string, unknown> = {}) => ({ id: 'ap-1', nome: 'Lavoro', stato: 'sospeso', motivo: 'm', fermo: chiave, ...extra })

  it('lo stesso fermo si annuncia una volta, anche se il servizio sparisce e torna; uno nuovo si annuncia', () => {
    const g = giro()
    g({ autopiloti: [fermo('ap-1|sospeso|t1|m')] })
    g({ autopiloti: [fermo('ap-1|sospeso|t1|m')] })
    // Il servizio non risponde: elenco vuoto, ma «non letto».
    g({ autopiloti: [], autopilotiLetti: false })
    g({ autopiloti: [fermo('ap-1|sospeso|t1|m')] })
    expect(g.mandate).toEqual(['Lavoro si è fermato'])
    g({ autopiloti: [fermo('ap-1|sospeso|t2|m')] })
    expect(g.mandate).toHaveLength(2)
  })

  it('un archiviato non manda notifiche', () => {
    const g = giro()
    g({ autopiloti: [fermo('ap-1|sospeso|t1|m', { archiviato: true })] })
    expect(g.mandate).toEqual([])
  })
})
