import { describe, it, expect } from 'vitest'
import {
  doppioniDaArchiviare, MANCA_DA_MS, firmaRichiestaDoppioni, leggiRichiestaDoppioni, nomeDiCartella, rigaDoppione,
  type OrchestratoreSulPc, type ProgettoNoto
} from '@shared/autopiloti-doppioni'

/**
 * 31/10, «solo cose sicure»: quando l'autopilota di un workspace è un doppione
 * su questo PC. La cartella che non c'è; il progetto di un altro PC; lo stesso
 * nome anche fra i progetti di qui (non è un doppione); un progetto che il
 * registro non conosce (NexoraOS: non è un doppione); i nomi senza maiuscole.
 */

const QUI = 'pc-qui'
const LA = 'pc-la'
const orch = (ws: string, cwd: string, autopilota = `ap-${ws.toLowerCase()}`): OrchestratoreSulPc => ({ ws, autopilota, cwd })
const tutteCi = (): boolean => true
const decidi = (orchestratori: OrchestratoreSulPc[], progetti: ProgettoNoto[], esiste: (c: string) => boolean = tutteCi, giaFatti?: Set<string>) =>
  doppioniDaArchiviare({ orchestratori, progetti, pcId: QUI, esiste, ...(giaFatti !== undefined ? { giaFatti } : {}) })

describe('gli autopiloti doppioni, la decisione pura', () => {
  it('la cartella del progetto non c’è su questo PC: doppione', () => {
    const d = decidi([orch('Sito', 'C:\\Users\\n\\Documents\\Sito')], [], () => false)
    expect(d).toEqual([{ ws: 'Sito', autopilota: 'ap-sito', cwd: 'C:\\Users\\n\\Documents\\Sito', motivo: 'cartella-mancante' }])
  })

  it('0.102.0: la cartella c’è su questo PC: mai un doppione, anche se il progetto vive altrove', () => {
    expect(decidi([orch('GLOS', 'E:\\Lavori\\GLOS')], [{ nome: 'GLOS', proprietario: LA }])).toEqual([])
  })

  it('la cartella manca e il progetto è di un altro PC: doppione, con l’id del proprietario', () => {
    const d = decidi([orch('GLOS', 'E:\\Lavori\\GLOS')], [{ nome: 'GLOS', proprietario: LA }], () => false)
    expect(d).toEqual([{ ws: 'GLOS', autopilota: 'ap-glos', cwd: 'E:\\Lavori\\GLOS', motivo: 'altro-pc', pc: LA }])
  })

  it('0.102.0: in pulizia una cartella mancante conta solo dopo 24 ore di fila', () => {
    const assenze = new Map<string, number>()
    const giro = (adesso: number, c: boolean) => doppioniDaArchiviare({ orchestratori: [orch('Sito', 'E:\\Sito')], progetti: [], pcId: QUI, esiste: () => c, assenze, adesso })
    expect(giro(0, false)).toEqual([])
    expect(giro(MANCA_DA_MS - 1, false)).toEqual([])
    expect(giro(MANCA_DA_MS + 1, false).map((x) => x.motivo)).toEqual(['cartella-mancante'])
    // Torna un attimo: si ricomincia a contare.
    expect(giro(MANCA_DA_MS + 2, true)).toEqual([])
    expect(giro(MANCA_DA_MS + 3, false)).toEqual([])
  })

  it('lo stesso nome è anche un progetto di questo PC: non è un doppione', () => {
    const d = decidi([orch('GLOS', 'E:\\Lavori\\GLOS')], [{ nome: 'GLOS', proprietario: LA }, { nome: 'glos', proprietario: QUI }])
    expect(d).toEqual([])
  })

  it('un progetto che il registro non conosce (NexoraOS) non è un doppione', () => {
    const d = decidi([orch('NexoraOS', 'E:\\NexoraOS')], [{ nome: 'GLOS', proprietario: LA }])
    expect(d).toEqual([])
  })

  it('un progetto senza proprietario (registro di prima della migrazione) non decide niente', () => {
    expect(decidi([orch('GLOS', 'E:\\GLOS')], [{ nome: 'GLOS' }])).toEqual([])
  })

  it('i nomi si confrontano senza maiuscole, con barre di ogni verso e la barra in coda', () => {
    const d = decidi([orch('a', 'E:/Lavori/sierraDECK/'), orch('b', 'E:\\Altro\\Nexora')], [{ nome: 'SierraDeck', proprietario: LA }], () => false)
    expect(d.map((x) => [x.ws, x.motivo])).toEqual([['a', 'altro-pc'], ['b', 'cartella-mancante']])
    expect(nomeDiCartella('E:/Lavori/sierraDECK/')).toBe('sierradeck')
    expect(nomeDiCartella('C:\\Users\\n\\Progetti SierraDeck\\GLOS')).toBe('glos')
  })

  it('un autopilota già archiviato non si riguarda; senza l’id di questo PC non si decide niente', () => {
    expect(decidi([orch('GLOS', 'E:\\GLOS')], [{ nome: 'GLOS', proprietario: LA }], tutteCi, new Set(['ap-glos']))).toEqual([])
    expect(decidi([orch('Sito', 'E:\\Sito')], [], () => false, new Set(['ap-sito']))).toEqual([])
    expect(doppioniDaArchiviare({ orchestratori: [orch('GLOS', 'E:\\GLOS')], progetti: [{ nome: 'GLOS', proprietario: LA }], pcId: '', esiste: tutteCi })).toEqual([])
  })

  it('la riga del registro dice dove vive il progetto', () => {
    expect(rigaDoppione({ ws: 'GLOS', autopilota: 'ap-1', cwd: 'E:\\GLOS', motivo: 'altro-pc', pc: LA }, { [LA]: 'Portatile' }))
      .toBe('[pulizia] autopilota di GLOS archiviato: il progetto vive su Portatile')
    expect(rigaDoppione({ ws: 'GLOS', autopilota: 'ap-1', cwd: 'E:\\GLOS', motivo: 'altro-pc', pc: 'pc-sconosciuto' }))
      .toBe('[pulizia] autopilota di GLOS archiviato: il progetto vive su un altro PC')
    expect(rigaDoppione({ ws: 'Sito', autopilota: 'ap-2', cwd: 'E:\\Sito', motivo: 'cartella-mancante' }))
      .toBe('[pulizia] autopilota di Sito archiviato: la cartella E:\\Sito non c’è su questo PC')
  })

  it('la richiesta dal programma si controlla, e la sua firma non cambia con l’ordine', () => {
    expect(leggiRichiestaDoppioni({ progetti: [] })).toBeUndefined()
    expect(leggiRichiestaDoppioni({ pcId: QUI })).toBeUndefined()
    const r = leggiRichiestaDoppioni({ pcId: QUI, progetti: [{ nome: 'A', proprietario: LA }, { nome: '' }, 'x', { nome: 'B', proprietario: 3 }], nomiPc: { [LA]: 'Portatile', y: 4 } })
    expect(r).toEqual({ pcId: QUI, progetti: [{ nome: 'A', proprietario: LA }, { nome: 'B' }], nomiPc: { [LA]: 'Portatile' } })
    const a = firmaRichiestaDoppioni({ pcId: QUI, progetti: [{ nome: 'A', proprietario: LA }, { nome: 'B' }], nomiPc: {} })
    const b = firmaRichiestaDoppioni({ pcId: QUI, progetti: [{ nome: 'B' }, { nome: 'a', proprietario: LA }], nomiPc: {} })
    expect(a).toBe(b)
    expect(firmaRichiestaDoppioni({ pcId: QUI, progetti: [{ nome: 'A', proprietario: QUI }, { nome: 'B' }], nomiPc: {} })).not.toBe(a)
  })
})
