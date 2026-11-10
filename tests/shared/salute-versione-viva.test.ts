import { describe, it, expect } from 'vitest'
import { componiSalute, versionePcInBreve, type IngressiSalute, type PcPerSalute } from '@shared/salute'
import { criticitaDi } from '../../src/main/controllo-pc'

/**
 * k-191: la versione di un altro PC viene da quello che dice adesso, non dal
 * battito sul Drive (fermo per giorni se il Drive è pieno). PC finti.
 */
const ADESSO = Date.parse('2026-01-10T12:00:00.000Z')
const DUE_GIORNI_FA = new Date(ADESSO - 2 * 86_400_000).toISOString()
const base: IngressiSalute = {
  adesso: ADESSO, versione: '2.0.0', oreErrori: 6,
  drive: { configurato: true, connesso: true },
  pc: [], errori: [], consegne: []
}
const pc = (o: Partial<PcPerSalute>): PcPerSalute => ({ pcId: 'p1', nome: 'PC-A', versione: '1.0.0', battito: DUE_GIORNI_FA, ...o })
const vocePc = (p: PcPerSalute) => componiSalute({ ...base, pc: [p] }).voci.find((v) => v.chiave === `pc:${p.pcId}`)!

describe('la versione degli altri PC nel controllo', () => {
  it('risponde dal vivo con la versione nuova e il battito è vecchio: niente «Aggiorna»', () => {
    const v = vocePc(pc({ stato: 'acceso', strada: 'Tailscale', versione: '2.0.0', versioneDalVivo: true }))
    expect(v.tono).toBe('ok')
    expect(v.cosaFare).toBeUndefined()
    expect(v.azioni).toEqual([])
    expect(v.spiegazione).toContain('detta dal PC adesso')
    const salute = componiSalute({ ...base, pc: [pc({ stato: 'acceso', versione: '2.0.0', versioneDalVivo: true })] })
    expect(criticitaDi([{ pcId: 'io', nome: 'QUI', salute }], [], ADESSO)).toEqual([])
  })

  it('non risponde: usa il battito e dice che è vecchio e di quando', () => {
    const v = vocePc(pc({ stato: 'non-so' }))
    expect(v.spiegazione).toContain('dato vecchio')
    expect(v.spiegazione).toContain('2 giorni fa')
    expect(v.cosaFare).not.toContain('Aggiorna')
    expect(v.azioni.some((a) => a.id === 'installa-la')).toBe(false)
  })

  it('acceso ma la versione non si è potuta chiedere e il battito è vecchio: non si dice di aggiornare', () => {
    const v = vocePc(pc({ stato: 'acceso' }))
    expect(v.azioni.some((a) => a.id === 'installa-la')).toBe(false)
  })

  it('vivo davvero più vecchio: «Aggiorna»', () => {
    const v = vocePc(pc({ stato: 'acceso', versione: '1.5.0', versioneDalVivo: true }))
    expect(v.tono).toBe('attenzione')
    expect(v.cosaFare).toContain('Aggiorna PC-A')
    expect(v.azioni).toEqual([{ id: 'installa-la', testo: 'Installa là la 2.0.0', pc: 'p1', versione: '2.0.0' }])
  })

  it('un PC dice «Aggiorna X» dal battito, ma X ha detto di avere la versione giusta: scartata', () => {
    const vecchia = componiSalute({ ...base, pc: [pc({ stato: 'acceso', versione: '1.0.0', battito: new Date(ADESSO).toISOString() })] })
    const sua = { ...componiSalute(base), versione: '2.0.0' }
    expect(criticitaDi([{ pcId: 'io', nome: 'QUI', salute: vecchia }], [], ADESSO).length).toBe(1)
    expect(criticitaDi([{ pcId: 'io', nome: 'QUI', salute: vecchia }, { pcId: 'p1', nome: 'PC-A', salute: sua }], [], ADESSO)).toEqual([])
  })

  it('il Drive pieno è una criticità sola, anche se lo dicono più PC', () => {
    const piena = componiSalute({ ...base, drive: { configurato: true, connesso: true, pieno: true } })
    const c = criticitaDi([{ pcId: 'a', nome: 'PC-A', salute: piena }, { pcId: 'b', nome: 'PC-B', salute: piena }], [], ADESSO)
    expect(c).toHaveLength(1)
    expect(c[0]?.cosa).toContain('non accetta scritture (pieno)')
    expect(c[0]?.pc).toBe('PC-A, PC-B')
  })

  it('k-202: vivo con battito vecchio e Drive pieno: dice che il battito non si aggiorna per il Drive pieno', () => {
    const piena = componiSalute({ ...base, drive: { configurato: true, connesso: true, pieno: true }, pc: [pc({ stato: 'acceso', versione: '2.0.0', versioneDalVivo: true })] })
    const v = piena.voci.find((x) => x.chiave === 'pc:p1')!
    expect(v.spiegazione).toContain('Il battito non si aggiorna perché il Drive è pieno')
    expect(v.spiegazione).toContain('un account solo per tutti i PC')
    expect(v.spiegazione).toContain('può essere vecchia')
    // Drive non pieno: nessuna frase in più.
    expect(vocePc(pc({ stato: 'acceso', versioneDalVivo: true, versione: '2.0.0' })).spiegazione).not.toContain('Drive è pieno')
  })

  it('k-202: «questo PC» è il nome di chi compone la Salute, non un numero senza padrone', () => {
    const s = componiSalute({ ...base, io: { id: 'io', nome: 'PC-Fisso' }, pc: [pc({ stato: 'acceso', versione: '1.5.0', versioneDalVivo: true })] })
    const v = s.voci.find((x) => x.chiave === 'pc:p1')!
    expect(v.spiegazione).toContain('Ha la 1.5.0, PC-Fisso ha la 2.0.0')
    expect(v.spiegazione).not.toContain('questo PC la')
  })

  it('la salute di un PC dice la sua versione', () => {
    expect(componiSalute(base).versione).toBe('2.0.0')
  })

  it('«Altri computer»: la versione viva vale e dice «aggiorna» solo se è più vecchia', () => {
    expect(versionePcInBreve({ versione: '1.0.0', battito: DUE_GIORNI_FA, viva: '2.0.0' }, '2.0.0', ADESSO)).toEqual({ testo: 'v2.0.0', indietro: false })
    expect(versionePcInBreve({ versione: '2.0.0', battito: DUE_GIORNI_FA, viva: '1.5.0' }, '2.0.0', ADESSO)).toEqual({ testo: 'v1.5.0 · più vecchia, aggiorna', indietro: true })
  })

  it('«Altri computer»: solo dal battito vecchio, dice di quando e non dice «aggiorna»', () => {
    const r = versionePcInBreve({ versione: '1.0.0', battito: DUE_GIORNI_FA }, '2.0.0', ADESSO)
    expect(r).toEqual({ testo: 'v1.0.0 (dato di 2 g fa)', indietro: false })
  })

  it('«Altri computer»: battito di poco fa, senza avvisi sul dato', () => {
    const r = versionePcInBreve({ versione: '2.0.0', battito: new Date(ADESSO - 60_000).toISOString() }, '2.0.0', ADESSO)
    expect(r).toEqual({ testo: 'v2.0.0', indietro: false })
  })

  const gpuSpenta = { cpu: 0, ramMb: 100, driveAlMinuto: 0, driveRifiutate: 0, gpu: { testo: 'Scheda video: solo processore', spenta: true } } as unknown as PcPerSalute['risorse']

  it('scheda video di un PC senza battito recente: nessuna voce, nessuna criticità', () => {
    const s = componiSalute({ ...base, pc: [pc({ stato: 'non-so', risorse: gpuSpenta })] })
    expect(s.voci.some((v) => v.chiave.startsWith('gpu:'))).toBe(false)
    // con battito recente la scheda spenta si dice
    const fresco = componiSalute({ ...base, pc: [pc({ stato: 'acceso', battito: new Date(ADESSO - 60_000).toISOString(), risorse: gpuSpenta })] })
    expect(fresco.voci.some((v) => v.chiave === 'gpu:p1' && v.tono === 'attenzione')).toBe(true)
  })

  it('il controllo scarta la scheda video di un PC spento detta da un PC con versione vecchia', () => {
    const s = salute2([{ chiave: 'gpu:p1', gruppo: 'pc', tono: 'attenzione', titolo: 'PC-A · Scheda video: solo processore', spiegazione: 'x', azioni: [] }])
    expect(criticitaDi([{ pcId: 'io', nome: 'QUI', salute: s }, { pcId: 'p1', nome: 'PC-A', errore: 'x', battito: DUE_GIORNI_FA }], [], ADESSO)).toEqual([])
  })

  it('non risponde a chi compone ma ha risposto a chi controlla: attenzione, non GUASTO', () => {
    const s = componiSalute({ ...base, pc: [pc({ stato: 'non-so', battito: new Date(ADESSO - 20 * 60_000).toISOString() })] })
    expect(s.voci.find((v) => v.chiave === 'pc:p1')!.tono).toBe('guasto')
    const c = criticitaDi([{ pcId: 'io', nome: 'QUI', salute: s }, { pcId: 'p1', nome: 'PC-A', salute: salute2([]) }], [], ADESSO)
    expect(c.map((x) => x.cosa.split(' · ')[0])).toEqual(['attenzione'])
    // se nemmeno lui risponde a chi controlla, non si declassa
    const g = criticitaDi([{ pcId: 'io', nome: 'QUI', salute: s }, { pcId: 'p1', nome: 'PC-A', errore: 'x', battito: new Date(ADESSO - 20 * 60_000).toISOString() }], [], ADESSO)
    expect(g.every((x) => !x.cosa.startsWith('attenzione'))).toBe(true)
  })
})

function salute2(voci: ReturnType<typeof componiSalute>['voci']) {
  return { scritto: '', tono: 'attenzione' as const, riassunto: '', voci }
}
