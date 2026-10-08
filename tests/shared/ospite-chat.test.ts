import { describe, it, expect } from 'vitest'
import {
  casaAltrove, casaPerAutopilota, caseCambiate, eScelta, pianoTrasloco, righeDove, sceltaOspite, sceltePerWorkspace
} from '@shared/ospite-chat'
import { unisciCase, type CasaChat, type CaseChat } from '@shared/una-casa'
import { decidiApertura, type DatiApertura } from '@shared/apertura-chat'
import type { BattitoPc } from '@shared/posta'

/**
 * L'ospite di ogni chat (0.52.0): scelto da Nicholas e fatto rispettare.
 * Scheda: .sierradeck/quaderno/ospite-delle-chat.md
 */
const FISSO = { id: 'pc-fisso-id', nome: 'PC-Fisso' }
const DESK = { id: 'pc-desk-id', nome: 'DESKTOP' }
const LAP = { id: 'pc-lap-id', nome: 'LAPTOP' }
const casa = (pc: { id: string; nome: string }, da: CasaChat['da'], decisaIl: string): CasaChat => ({ pc: pc.id, pcNome: pc.nome, motivo: 'm', decisaIl, da })
const cc = (c: Record<string, CasaChat>): CaseChat => ({ versione: 1, case: c })

describe('la casa altrove', () => {
  it('ogni casa memorizzata conta, anche quella della regola; senza casa la chat è di qui', () => {
    expect(casaAltrove(casa(DESK, 'regola', 'x'), FISSO.id)).toEqual({ id: DESK.id, nome: DESK.nome, motivo: 'm' })
    expect(casaAltrove(casa(DESK, 'nicholas', 'x'), FISSO.id)?.id).toBe(DESK.id)
    expect(casaAltrove(casa(FISSO, 'nicholas', 'x'), FISSO.id)).toBeUndefined()
    expect(casaAltrove(undefined, FISSO.id)).toBeUndefined()
    expect(eScelta(casa(DESK, 'regola', 'x'))).toBe(false)
    expect(eScelta(casa(DESK, 'sposta', 'x'))).toBe(true)
  })

  it('la scelta porta chi l’ha fatta, quando e il perché in parole', () => {
    const s = sceltaOspite({ pc: DESK, chi: FISSO, quando: '2026-10-07T14:00:00.000Z' })
    expect(s).toMatchObject({ pc: DESK.id, pcNome: DESK.nome, da: 'nicholas', sceltaDa: FISSO.id, decisaIl: '2026-10-07T14:00:00.000Z' })
    expect(s.motivo).toContain('scelta di Nicholas')
    expect(s.motivo).toContain('ospitata da DESKTOP')
    const w = sceltePerWorkspace({ workspace: 'Trading', sessioni: ['a', 'b'], pc: LAP, chi: FISSO, quando: 'q' })
    expect(Object.keys(w)).toEqual(['a', 'b'])
    expect(w.a?.motivo).toContain('per tutto il workspace «Trading»')
  })
})

describe('la chat di un autopilota (0.52.5, caso NexoraOS)', () => {
  const q = '2026-10-08T09:00:00.000Z'
  it('casa della regola o della nascita altrove: la prende il PC dell’autopilota, con il perché', () => {
    for (const da of ['regola', 'nascita'] as const) {
      const d = casaPerAutopilota({ casa: casa(DESK, da, '2026-10-02T14:45:00.000Z'), io: FISSO, autopilota: 'ap-esempio', quando: q })
      expect(d.tipo).toBe('prendi')
      if (d.tipo !== 'prendi') continue
      expect(d.casa).toMatchObject({ pc: FISSO.id, pcNome: FISSO.nome, da: 'sposta', decisaIl: q })
      expect(d.casa.motivo).toContain('autopilota')
      expect(d.casa.motivo).toContain('DESKTOP')
      // Pesa come una scelta: unita con la casa vecchia, vince lei su ogni PC.
      expect(unisciCase(cc({ s: casa(DESK, da, '2026-10-02T14:45:00.000Z') }), cc({ s: d.casa })).case.s?.pc).toBe(FISSO.id)
      expect(unisciCase(cc({ s: d.casa }), cc({ s: casa(DESK, da, '2026-10-02T14:45:00.000Z') })).case.s?.pc).toBe(FISSO.id)
    }
  })
  it('scelta di Nicholas altrove: resta altrove', () => {
    expect(casaPerAutopilota({ casa: casa(DESK, 'nicholas', 'x'), io: FISSO, autopilota: 'a', quando: q }).tipo).toBe('altrove')
    expect(casaPerAutopilota({ casa: casa(DESK, 'sposta', 'x'), io: FISSO, autopilota: 'a', quando: q }).tipo).toBe('altrove')
  })
  it('casa qui o nessuna: qui', () => {
    expect(casaPerAutopilota({ casa: undefined, io: FISSO, autopilota: 'a', quando: q }).tipo).toBe('qui')
    expect(casaPerAutopilota({ casa: casa(FISSO, 'regola', 'x'), io: FISSO, autopilota: 'a', quando: q }).tipo).toBe('qui')
  })
})

describe('i conflitti: due PC che si dicono casa', () => {
  it('vince la scelta più recente, in qualunque ordine si uniscano', () => {
    const suFisso = cc({ s: sceltaOspite({ pc: FISSO, chi: FISSO, quando: '2026-10-07T10:00:00.000Z' }) })
    const suDesk = cc({ s: sceltaOspite({ pc: DESK, chi: DESK, quando: '2026-10-07T10:05:00.000Z' }) })
    expect(unisciCase(suFisso, suDesk).case.s?.pc).toBe(DESK.id)
    expect(unisciCase(suDesk, suFisso).case.s?.pc).toBe(DESK.id)
  })
  it('una scelta batte sempre la regola, anche più vecchia', () => {
    const regola = cc({ s: casa(DESK, 'regola', '2026-10-07T12:00:00.000Z') })
    const scelta = cc({ s: sceltaOspite({ pc: FISSO, chi: FISSO, quando: '2026-10-02T12:00:00.000Z' }) })
    expect(unisciCase(regola, scelta).case.s?.pc).toBe(FISSO.id)
    expect(unisciCase(scelta, regola).case.s?.pc).toBe(FISSO.id)
  })
  it('nello stesso istante tutti i PC arrivano alla stessa risposta', () => {
    const a = cc({ s: sceltaOspite({ pc: FISSO, chi: FISSO, quando: 'T' }) })
    const b = cc({ s: sceltaOspite({ pc: LAP, chi: LAP, quando: 'T' }) })
    expect(unisciCase(a, b).case.s?.pc).toBe(unisciCase(b, a).case.s?.pc)
    const c = cc({ s: casa(FISSO, 'regola', 'T') })
    const d = cc({ s: casa(LAP, 'regola', 'T') })
    expect(unisciCase(c, d).case.s?.pc).toBe(unisciCase(d, c).case.s?.pc)
  })
  it('le case cambiate fra due versioni', () => {
    expect(caseCambiate(cc({ a: casa(FISSO, 'regola', 'x'), b: casa(FISSO, 'regola', 'x') }), cc({ a: casa(DESK, 'nicholas', 'y'), b: casa(FISSO, 'regola', 'x'), c: casa(LAP, 'nascita', 'x') }))).toEqual(['a', 'c'])
  })
})

describe('il trasloco della copia di qui', () => {
  const tutte = cc({
    sceltaAltrove: sceltaOspite({ pc: DESK, chi: FISSO, quando: 'q' }),
    apertaFerma: sceltaOspite({ pc: DESK, chi: FISSO, quando: 'q' }),
    apertaAlLavoro: sceltaOspite({ pc: LAP, chi: FISSO, quando: 'q' }),
    regolaAltrove: casa(DESK, 'regola', 'q'),
    sceltaQui: sceltaOspite({ pc: FISSO, chi: FISSO, quando: 'q' })
  })
  it('si sposta subito solo quella chiusa; aperta e ferma si chiude prima; al lavoro si aspetta il turno', () => {
    const p = pianoTrasloco({
      case: tutte, io: FISSO.id,
      copieQui: ['sceltaAltrove', 'apertaFerma', 'apertaAlLavoro', 'regolaAltrove', 'sceltaQui', 'senzaCasa'],
      aperte: [{ sessione: 'apertaFerma', alLavoro: false }, { sessione: 'apertaAlLavoro', alLavoro: true }]
    })
    expect(p).toEqual({ sposta: ['sceltaAltrove'], chiudi: ['apertaFerma'], aspetta: ['apertaAlLavoro'] })
  })
  it('le case della regola non spostano niente da sole (per quelle c’è «Riordina»)', () => {
    const p = pianoTrasloco({ case: tutte, io: FISSO.id, copieQui: ['regolaAltrove'], aperte: [{ sessione: 'regolaAltrove', alLavoro: false }] })
    expect(p).toEqual({ sposta: [], chiudi: [], aspetta: [] })
  })
  it('una chat aperta qui senza copia sul disco (appena nata) si chiude comunque', () => {
    const p = pianoTrasloco({ case: tutte, io: FISSO.id, copieQui: [], aperte: [{ sessione: 'sceltaAltrove', alLavoro: false }] })
    expect(p.chiudi).toEqual(['sceltaAltrove'])
  })
})

describe('«Dove vive ogni chat»', () => {
  it('una riga per chat con il suo ospite e da dove viene, raggruppate per workspace', () => {
    const g = righeDove([
      { workspace: 'Trading', sessione: 'a', titolo: 'Strategia', cwd: 'C:/T' },
      { workspace: 'Trading', sessione: 'b', titolo: 'Backtest', cwd: 'C:/T' },
      { workspace: 'Sito', sessione: 'c', titolo: 'Home', cwd: 'C:/S' }
    ], cc({ a: sceltaOspite({ pc: DESK, chi: FISSO, quando: 'q' }), b: casa(DESK, 'regola', 'q') }), FISSO)
    expect(g.map((x) => x.workspace)).toEqual(['Trading', 'Sito'])
    expect(g[0]?.ospiteComune).toBe(DESK.id)
    expect(g[0]?.righe.map((r) => [r.fonte, r.qui])).toEqual([['scelta', false], ['regola', false]])
    expect(g[1]?.righe[0]).toMatchObject({ pc: FISSO.id, fonte: 'nessuna', qui: true })
  })
})

describe('da dove aprirla: la casa prima di tutto (la causa vera del 07/10)', () => {
  const ORA = Date.parse('2026-10-07T12:30:00Z')
  const battito = (pc: { id: string; nome: string }, minutiFa: number, chat: BattitoPc['chat'] = []): BattitoPc => ({
    pcId: pc.id, nome: pc.nome, versione: '0.51.0', battito: new Date(ORA - minutiFa * 60_000).toISOString(), cartelle: ['E:\\Progetti\\Money'], chat
  })
  // Il caso visto sui PC di Nicholas (nomi e percorsi di esempio): la chat «Money» ha casa DESKTOP, la cartella c'è
  // anche qui (progetto sul Drive) e il battito di DESKTOP elenca un'altra chat sola.
  const base: DatiApertura = {
    sessione: 'sessione-money', cwd: 'C:\\Progetti\\Money', io: FISSO.id,
    trascrizioneQui: true, cartellaQui: true, adesso: ORA,
    battiti: [battito(DESK, 1, [{ sessione: 'sessione-altra', titolo: 'altra', cwd: 'E:\\Progetti\\Altro', aspetta: false }])]
  }
  it('prima della 0.52 (senza la casa) si apriva qui: ecco perché partiva su tutti e due i PC', () => {
    expect(decidiApertura(base)).toEqual({ tipo: 'locale' })
  })
  it('con la casa altrove e l’ospite acceso: dal vivo, mai qui', () => {
    const a = decidiApertura({ ...base, casa: { id: DESK.id, nome: DESK.nome, motivo: 'scelta di Nicholas' } })
    expect(a).toMatchObject({ tipo: 'remoto', pc: { id: DESK.id }, perCasa: true, sessione: base.sessione })
  })
  it('con l’ospite che tace: attesa con «non so se è acceso», mai locale', () => {
    const a = decidiApertura({ ...base, battiti: [battito(DESK, 600)], casa: { id: DESK.id, nome: DESK.nome, motivo: '' } })
    expect(a).toMatchObject({ tipo: 'attesa', perCasa: true, pc: { id: DESK.id } })
    // Anche con la cartella e la trascrizione qui, e senza nessun battito.
    expect(decidiApertura({ ...base, battiti: [], casa: { id: LAP.id, nome: LAP.nome, motivo: '' } }).tipo).toBe('attesa')
  })
  it('con la casa qui si apre qui, anche se un altro PC la tiene aperta per errore', () => {
    const a = decidiApertura({ ...base, casaQui: true, battiti: [battito(DESK, 1, [{ sessione: base.sessione as string, titolo: 'Money', cwd: 'E:/x', aspetta: false }])] })
    expect(a).toEqual({ tipo: 'locale' })
  })
  it('una chat nuova (senza sessione) non è toccata dalla casa', () => {
    const { sessione: _s, ...senza } = base
    expect(decidiApertura({ ...senza, casa: { id: DESK.id, nome: DESK.nome, motivo: '' } }).tipo).toBe('locale')
  })
})
