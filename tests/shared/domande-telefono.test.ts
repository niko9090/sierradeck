import { describe, expect, it } from 'vitest'
import { contestoScelta, quanteChiedono, raccogliDomande, ultimeRighe } from '../../src/shared/domande-telefono'

const scelteFinte = (righe: string[]) => {
  const opzioni = righe
    .map((r) => /^\s*(\d)[.)]\s+(.+)$/.exec(r))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ numero: Number(m[1]), testo: (m[2] ?? '').trim(), scelta: false }))
  return opzioni.length >= 2 ? { opzioni, corrente: 0 } : undefined
}

describe('raccogliDomande', () => {
  it('IL PUNTO: domande degli autopiloti, scelte delle chat e chat ferme, in un elenco solo e in quest ordine', () => {
    const voci = raccogliDomande({
      domande: [
        { id: 'd2', autopilotaId: 'ap', testo: 'Seconda?', apertaIl: 20 },
        { id: 'd1', autopilotaId: 'ap', testo: 'Prima?', apertaIl: 10 }
      ],
      autopiloti: [{ id: 'ap', nome: '', obiettivo: 'Sistemare i test', stato: 'intervista' }],
      chat: [
        { id: 'c-ferma', titolo: 'Ferma', cwd: 'C:\\x', aspetta: true, coda: ['│ ho finito │', '', '❯ '] },
        { id: 'c-scelta', titolo: 'Scelta', cwd: 'C:\\y', aspetta: true, coda: ['Do you want to proceed?', '', '1. Yes', '2. No'] },
        { id: 'c-governata', titolo: 'Gov', cwd: 'C:\\z', aspetta: true, governata: true, coda: ['x'] },
        { id: 'c-lavora', titolo: 'Lav', cwd: 'C:\\w', aspetta: false, coda: ['esc to interrupt'] }
      ],
      scelteDi: (_id, righe) => scelteFinte(righe)
    })
    expect(voci.map((v) => v.tipo)).toEqual(['autopilota', 'autopilota', 'scelta', 'chat'])
    expect(voci[0]).toMatchObject({ id: 'd1', autopilota: 'Sistemare i test', origine: 'intervista', testo: 'Prima?' })
    expect(voci[2]).toMatchObject({ chat: 'c-scelta', righe: ['Do you want to proceed?'], opzioni: [{ numero: 1, testo: 'Yes' }, { numero: 2, testo: 'No' }] })
    expect(voci[3]).toMatchObject({ chat: 'c-ferma', righe: ['ho finito', '❯'] })
    expect(quanteChiedono(voci)).toBe(3)
  })

  it('un autopilota che lavora fa domande «di lavoro»; uno sconosciuto ha un nome di ripiego', () => {
    const voci = raccogliDomande({
      domande: [{ id: 'd', autopilotaId: 'ap', testo: 'Che faccio?' }, { id: 'e', autopilotaId: 'boh', testo: '?' }],
      autopiloti: [{ id: 'ap', nome: 'Notte', obiettivo: 'x', stato: 'lavoro' }],
      chat: [], scelteDi: () => undefined
    })
    expect(voci[0]).toMatchObject({ autopilota: 'Notte', origine: 'lavoro' })
    expect(voci[1]).toMatchObject({ autopilota: 'Un autopilota' })
  })
})

describe('contestoScelta e ultimeRighe', () => {
  it('tiene le righe sopra la prima opzione, senza cornici e senza vuote, al massimo otto', () => {
    const righe = ['│ a │', '│ b │', '', '│ c │', '│ d │', '│ e │', '│ f │', '│ g │', '│ h │', '│ Vuoi procedere? │', '', '│ 1. Sì │', '│ 2. No │']
    expect(contestoScelta(righe, 'Sì')).toEqual(['b', 'c', 'd', 'e', 'f', 'g', 'h', 'Vuoi procedere?'])
  })
  it('se l opzione non si trova piu, tiene le ultime righe e basta', () => {
    expect(contestoScelta(['x', 'y'], 'Sì')).toEqual(['x', 'y'])
  })
  it('ultimeRighe: le ultime otto non vuote, pulite', () => {
    const righe = Array.from({ length: 12 }, (_x, i) => `│ r${i} │`).concat([''])
    expect(ultimeRighe(righe)).toEqual(['r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10', 'r11'])
  })
})
