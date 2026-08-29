import { describe, it, expect } from 'vitest'
import { chiaveTurno, chiTace, motivoSilenzio } from '../../src/autopilot-host/guardiano'
import { nuovoAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'

/**
 * Il guardiano guardava l'autopilota, non le sue chat.
 *
 * Con una flotta bastava che **una** chat chiudesse i suoi turni perché tutte
 * le altre risultassero vive: quella impiantata su un comando che non finisce
 * restava appesa per sempre, e il pannello diceva «al lavoro» perché le sorelle
 * rispondevano. È il difetto che questi test tengono chiuso.
 */

const ORA = Date.parse('2026-08-29T12:00:00.000Z')
const LIMITE = 30 * 60_000

const chat = (id: string, over: Partial<ChatGovernata> = {}): ChatGovernata =>
  ({ id, compito: `il pezzo ${id}`, stato: 'lavoro', cicli: 1, ...over })

function ap(over: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({
      id: 'ap-1', nome: 'Test', obiettivo: 'Fai la cosa', cwd: 'C:\\p',
      criteri: [{ descrizione: 'i test passano', comando: 'npm test', soddisfatto: false }],
      iniziatoIl: '2026-08-29T10:00:00.000Z'
    }),
    ultimoEvento: '2026-08-29T11:59:00.000Z',
    ...over
  }
}

describe('la chiave del turno', () => {
  it('tiene separate le chat della stessa flotta', () => {
    expect(chiaveTurno('ap-1', 'ch-a')).not.toBe(chiaveTurno('ap-1', 'ch-b'))
  })

  it('senza chat e la sola id: e il caso normale, una chat sola', () => {
    expect(chiaveTurno('ap-1')).toBe('ap-1')
    expect(chiaveTurno('ap-1', '')).toBe('ap-1')
  })
})

describe('chi tace', () => {
  it('con una chat sola si comporta come prima', () => {
    const a = ap()
    const muto = new Map([[chiaveTurno('ap-1'), ORA - LIMITE - 60_000]])
    expect(chiTace(a, (k) => muto.get(k), ORA, LIMITE)).toEqual([{ da: LIMITE + 60_000 }])
    const vivo = new Map([[chiaveTurno('ap-1'), ORA - 60_000]])
    expect(chiTace(a, (k) => vivo.get(k), ORA, LIMITE)).toEqual([])
  })

  it('IL DIFETTO: una chat viva non copre piu la sorella impiantata', () => {
    // Prima si guardava una chiave sola: il turno di `ch-viva` teneva in piedi
    // anche `ch-ferma`, che restava appesa per sempre.
    const a = ap({ chats: [chat('ch-viva'), chat('ch-ferma')] })
    const turni = new Map([
      [chiaveTurno('ap-1', 'ch-viva'), ORA - 60_000],
      [chiaveTurno('ap-1', 'ch-ferma'), ORA - LIMITE - 5 * 60_000]
    ])
    const mute = chiTace(a, (k) => turni.get(k), ORA, LIMITE)
    expect(mute.map((m) => m.chatId)).toEqual(['ch-ferma'])
    expect(mute[0]?.compito).toBe('il pezzo ch-ferma')
  })

  it('una chat finita non e muta: ha finito', () => {
    // Contarla sospenderebbe le flotte proprio quando cominciano a concludere.
    const a = ap({ chats: [chat('ch-1', { stato: 'finita' }), chat('ch-2')] })
    const turni = new Map([[chiaveTurno('ap-1', 'ch-2'), ORA - 60_000]])
    expect(chiTace(a, (k) => turni.get(k), ORA, LIMITE)).toEqual([])
  })

  it('tutte mute: le dice tutte', () => {
    const a = ap({ chats: [chat('ch-1'), chat('ch-2')] })
    const mute = chiTace(a, () => ORA - LIMITE - 60_000, ORA, LIMITE)
    expect(mute).toHaveLength(2)
  })

  it('una flotta nata prima di questa misura non risulta muta al primo giro', () => {
    // Le vecchie hanno segnato i turni sotto la sola id dell'autopilota: senza
    // il ripiego, al primo giro dopo l'aggiornamento verrebbero sospese tutte.
    const a = ap({ chats: [chat('ch-1'), chat('ch-2')] })
    const vecchio = new Map([[chiaveTurno('ap-1'), ORA - 60_000]])
    expect(chiTace(a, (k) => vecchio.get(k), ORA, LIMITE)).toEqual([])
  })

  it('senza memoria si ricade su ultimoEvento, per eccesso di pazienza', () => {
    // Dopo un riavvio del servizio la mappa e' vuota: si sbaglia al piu' una
    // volta, e nel verso giusto.
    const a = ap({ chats: [chat('ch-1')], ultimoEvento: '2026-08-29T11:59:00.000Z' })
    expect(chiTace(a, () => undefined, ORA, LIMITE)).toEqual([])
    const vecchio = ap({ chats: [chat('ch-1')], ultimoEvento: '2026-08-29T10:00:00.000Z' })
    expect(chiTace(vecchio, () => undefined, ORA, LIMITE)).toHaveLength(1)
  })
})

describe('il motivo che legge chi guarda', () => {
  it('con una chat sola resta la frase di prima', () => {
    expect(motivoSilenzio([{ da: 31 * 60_000 }])).toContain('nessun segnale dalla chat da 31 minuti')
  })

  it('con una flotta dice QUALE tace, o non si sa dove guardare', () => {
    const testo = motivoSilenzio([{ chatId: 'ch-2', compito: 'sistema i test', da: 40 * 60_000 }])
    expect(testo).toContain('sistema i test')
    expect(testo).toContain('40 min')
  })
})
