import { describe, it, expect } from 'vitest'
import { decidiApertura, daQuandoTace, type DatiApertura } from '@shared/apertura-chat'
import type { BattitoPc } from '@shared/posta'
import { descriviSilenzio } from '@shared/pc-remoto'

/**
 * Da dove aprire una chat del workspace (0.36.1): locale, remoto dal vivo, o
 * attesa del PC che non risponde. Nicholas (01/10): «se apro un workspace con
 * chat che vivono su un altro PC devo collegarmi in remoto, non vedere
 * l'errore; gli errori solo se il PC non è raggiungibile».
 */
const ORA = Date.parse('2026-10-01T10:00:00Z')
const battito = (pcId: string, nome: string, minutiFa: number, extra: Partial<BattitoPc> = {}): BattitoPc => ({
  pcId, nome, versione: '0.36.0', battito: new Date(ORA - minutiFa * 60_000).toISOString(), cartelle: [], chat: [], ...extra
})
const base: DatiApertura = { sessione: 's-1', cwd: 'E:/Progetti/sito', io: 'fisso', trascrizioneQui: true, cartellaQui: true, battiti: [], adesso: ORA }

describe('da dove aprire una chat del workspace', () => {
  it('una chat di questo PC si apre in locale', () => {
    expect(decidiApertura(base)).toEqual({ tipo: 'locale' })
    // Il battito di questo stesso PC non conta.
    expect(decidiApertura({ ...base, battiti: [battito('fisso', 'Fisso', 1, { chat: [{ sessione: 's-1', titolo: 't', cwd: base.cwd, aspetta: false }] })] }).tipo).toBe('locale')
  })

  it('PC vivo: la chat aperta là diventa subito remota, anche con cartella e trascrizione qui', () => {
    const a = decidiApertura({ ...base, battiti: [battito('port', 'Portatile', 1, { chat: [{ sessione: 's-1', titolo: 't', cwd: base.cwd, aspetta: false }] })] })
    expect(a).toMatchObject({ tipo: 'remoto', pc: { id: 'port', nome: 'Portatile' }, sessione: 's-1' })
  })

  it('PC spento o che non risponde: riquadro d attesa con da quanto tace', () => {
    const a = decidiApertura({ ...base, battiti: [battito('port', 'Portatile', 30, { chat: [{ sessione: 's-1', titolo: 't', cwd: base.cwd, aspetta: false }] })] })
    expect(a).toMatchObject({ tipo: 'attesa', pc: { id: 'port', nome: 'Portatile' } })
    if (a.tipo === 'attesa') expect(daQuandoTace(a.ultimoSegno, ORA)).toBe('non risponde da 30 minuti')
  })

  it('nata là senza trascrizione e senza cartella qui: remota se il PC risponde, attesa se no', () => {
    const daBattito = { ...base, trascrizioneQui: false, cartellaQui: false }
    expect(decidiApertura({ ...daBattito, battiti: [battito('port', 'Portatile', 2, { cartelle: ['E:/Progetti'] })] }).tipo).toBe('remoto')
    expect(decidiApertura({ ...daBattito, battiti: [battito('port', 'Portatile', 600, { cartelle: ['E:/Progetti'] })] }).tipo).toBe('attesa')
    // Dal registro dei progetti, senza nessun battito: attesa, perché non si sa se è acceso.
    const r = decidiApertura({ ...daBattito, cartellaDi: { id: 'port', nome: 'Portatile' } })
    expect(r).toMatchObject({ tipo: 'attesa', pc: { nome: 'Portatile' } })
    if (r.tipo === 'attesa') expect(daQuandoTace(r.ultimoSegno, ORA)).toContain('non ha ancora lasciato un segno')
  })

  it('una chat nuova, senza trascrizione ma con la cartella qui, resta locale anche se un altro PC ha la stessa cartella', () => {
    const a = decidiApertura({ ...base, sessione: undefined, trascrizioneQui: false, battiti: [battito('port', 'Portatile', 1, { cartelle: ['E:/Progetti/sito'] })] })
    expect(a).toEqual({ tipo: 'locale' })
  })

  it('il riquadro remoto, quando quel PC smette di rispondere, dice lo stato e riprova da solo', () => {
    expect(descriviSilenzio('irraggiungibile', 'Portatile', 10_000)).toEqual({ titolo: 'Portatile non risponde da 10 secondi · riprovo da solo', breve: true })
    expect(descriviSilenzio('spento', 'Portatile', 5 * 60_000)).toEqual({ titolo: 'Portatile è spento · non risponde da 5 minuti · riprovo da solo', breve: false })
    expect(descriviSilenzio('cassaforte', 'Portatile', 0).titolo).toContain('cassaforte')
  })

  it('quando la chat è aperta su due PC vince il battito più recente', () => {
    const chat = [{ sessione: 's-1', titolo: 't', cwd: base.cwd, aspetta: false }]
    const a = decidiApertura({ ...base, battiti: [battito('vecchio', 'Vecchio', 40, { chat }), battito('port', 'Portatile', 1, { chat })] })
    expect(a).toMatchObject({ tipo: 'remoto', pc: { id: 'port' } })
  })
})
