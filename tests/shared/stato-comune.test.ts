import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as scoperta from '../../src/shared/scoperta-pc'
import { TESTO_IN_AGGIORNAMENTO } from '../../src/shared/aggiornamento-remoto'
import { SPENTO_DOPO_MS, statoPc } from '../../src/shared/stato-pc'
import { dataBreve, giornoEOra, tempoRelativo } from '../../src/shared/tempo-it'
import { STATI_PC, etichettaStatoPc, vocePc } from '../../src/shared/vocabolario-stati-pc'

const MIN = 60_000
const ORA = 60 * MIN
// Mezzogiorno locale: «ieri» e «oggi» non dipendono dal fuso né dall'ora legale.
const ADESSO = new Date(2026, 10, 20, 12, 0, 0).getTime()
const fa = (ms: number): string => new Date(ADESSO - ms).toISOString()

describe('un solo statoPc', () => {
  it('scoperta-pc non esporta più un statoPc', () => {
    expect('statoPc' in scoperta).toBe(false)
    expect(typeof scoperta.titoloDopoIlBussare).toBe('function')
    const src = readFileSync(join(__dirname, '../../src/shared/scoperta-pc.ts'), 'utf8')
    expect(src).not.toMatch(/export function statoPc\b/)
  })
  it('stato-pc dà acceso, spento e in-aggiornamento con le sue soglie', () => {
    expect(statoPc(fa(MIN), ADESSO).stato).toBe('acceso')
    expect(statoPc(fa(SPENTO_DOPO_MS), ADESSO).stato).toBe('spento')
    const agg = { versione: '1.2.3' }
    expect(statoPc(fa(2 * ORA), ADESSO, agg)).toMatchObject({ stato: 'in-aggiornamento', frase: TESTO_IN_AGGIORNAMENTO, aggiornando: agg })
    expect(statoPc(fa(MIN), ADESSO, agg).stato).toBe('acceso')
    expect(statoPc(fa(2 * ORA), ADESSO, null).stato).toBe('spento')
  })
})

describe('vocabolario degli stati', () => {
  it('ogni stato ha etichetta italiana, colore e classe', () => {
    for (const [chiave, v] of Object.entries(STATI_PC)) {
      expect(v.etichetta.length, chiave).toBeGreaterThan(2)
      expect(v.classe).toBe(`stato-pc--${chiave}`)
      expect(['verde', 'ambra', 'rosso', 'blu', 'quieto']).toContain(v.colore)
    }
  })
  it('copre tutti gli stati di statoPc e di titoloDopoIlBussare', () => {
    for (const s of ['acceso', 'spento', 'in-aggiornamento', 'da-rimuovere', 'non-so', 'irraggiungibile', 'chiave', 'rifiutato', 'altro', 'senza-indirizzi', 'versione-vecchia', 'solo-aiutante']) {
      expect(STATI_PC).toHaveProperty(s)
    }
    expect(etichettaStatoPc('in-aggiornamento')).toBe(TESTO_IN_AGGIORNAMENTO)
    expect(etichettaStatoPc('da-rimuovere')).toBe('da rimuovere')
  })
  it('vivo solo per acceso (anche con l’Aiutante); uno stato ignoto vale «non so»', () => {
    expect(vocePc('acceso').vivo).toBe(true)
    expect(vocePc('spento').vivo).toBe(false)
    expect(vocePc('boh')).toBe(STATI_PC['non-so'])
  })
})

describe('tempo-it', () => {
  it('tempoRelativo, per esteso e breve', () => {
    expect(tempoRelativo(undefined, ADESSO)).toBe('mai')
    expect(tempoRelativo('boh', ADESSO)).toBe('non si sa')
    expect(tempoRelativo(fa(10_000), ADESSO)).toBe('adesso')
    expect(tempoRelativo(fa(MIN), ADESSO)).toBe('1 minuto fa')
    expect(tempoRelativo(fa(30 * MIN), ADESSO)).toBe('30 minuti fa')
    expect(tempoRelativo(fa(ORA), ADESSO)).toBe('1 ora fa')
    expect(tempoRelativo(fa(3 * ORA), ADESSO)).toBe('3 ore fa')
    expect(tempoRelativo(fa(2 * 24 * ORA), ADESSO)).toBe('2 giorni fa')
    expect(tempoRelativo(new Date(ADESSO + ORA).toISOString(), ADESSO)).toBe('adesso')
    expect(tempoRelativo(fa(2 * MIN), ADESSO, { breve: true })).toBe('2 min fa')
    expect(tempoRelativo(fa(3 * ORA), ADESSO, { breve: true })).toBe('3 h fa')
    expect(tempoRelativo(fa(5 * 24 * ORA), ADESSO, { breve: true })).toBe('5 giorni fa')
  })
  it('giornoEOra: oggi, ieri, un altro giorno', () => {
    const alle = (g: number, h: number, m: number): string => new Date(2026, 10, g, h, m).toISOString()
    expect(giornoEOra(alle(20, 9, 5), ADESSO)).toBe('oggi alle 09:05')
    expect(giornoEOra(alle(19, 18, 4), ADESSO)).toBe('ieri alle 18:04')
    expect(giornoEOra(alle(12, 18, 4), ADESSO)).toMatch(/^il 12 nov\.? alle 18:04$/)
    expect(giornoEOra(undefined, ADESSO)).toBe('')
    expect(giornoEOra('boh', ADESSO)).toBe('')
  })
  it('dataBreve: vuota se manca o non si legge', () => {
    expect(dataBreve(undefined)).toBe('')
    expect(dataBreve('')).toBe('')
    expect(dataBreve('boh')).toBe('')
    expect(dataBreve(alleDieci())).toMatch(/10[:.]00/)
  })
})

function alleDieci(): string {
  return new Date(2026, 10, 20, 10, 0).toISOString()
}

describe('niente formattatori duplicati nelle liste', () => {
  const leggi = (p: string): string => readFileSync(join(__dirname, '../..', p), 'utf8')
  it('le pagine non hanno più il loro «quando» con toLocaleString', () => {
    for (const f of ['src/renderer/components/ModalePosta.tsx', 'src/renderer/components/RiquadroRemoto.tsx', 'src/renderer/components/VistaProgetti.tsx', 'src/renderer/components/GestioneProgetti.tsx', 'src/shared/scoperta-pc.ts']) {
      expect(leggi(f), f).not.toContain("toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })")
    }
  })
  it('salute e rapporti-chat usano tempo-it', () => {
    expect(leggi('src/shared/salute.ts')).toContain("from './tempo-it'")
    expect(leggi('src/shared/rapporti-chat.ts')).toContain("from './tempo-it'")
  })
})
