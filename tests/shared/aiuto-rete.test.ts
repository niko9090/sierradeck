import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  idLavoroValido, lavoroAffidatoValido, nomeProgettoSicuro, quantiPezzi, PEZZO_BYTE, ramoDiRitorno, ramoValido,
  scegliPosto, strumentiAmmessi, type Aiutante
} from '../../src/shared/aiuto-rete'
import { giudicaGuardiaOrchestratore } from '../../src/autopilot-host/guardia-orchestratore'

/**
 * 0.103.0, tappa 3 del lavoro a distanza (Nicholas, 12/11): gli specialisti
 * usano i posti liberi degli altri PC, e i PC su «Aiuta la rete» (dedicati)
 * hanno la precedenza.
 */
const pc = (nome: string, modo: Aiutante['modo'], liberi: number): Aiutante => ({ pcId: `id-${nome}`, nome, modo, liberi })

describe('dove va il prossimo specialista', () => {
  it('prima un PC dedicato con posto, anche se qui c’è posto', () => {
    expect(scegliPosto([pc('A', 'posti-liberi', 3), pc('B', 'dedicato', 1)], 2)?.nome).toBe('B')
  })
  it('fra i dedicati quello più libero', () => {
    expect(scegliPosto([pc('B', 'dedicato', 1), pc('C', 'dedicato', 3)], 0)?.nome).toBe('C')
  })
  it('senza dedicati liberi: qui, se qui c’è posto', () => {
    expect(scegliPosto([pc('A', 'posti-liberi', 3), pc('B', 'dedicato', 0)], 1)).toBeUndefined()
  })
  it('qui pieno: un PC che presta i posti liberi', () => {
    expect(scegliPosto([pc('A', 'posti-liberi', 2)], 0)?.nome).toBe('A')
  })
  it('chi ha detto «no» o non ha posti non riceve niente', () => {
    expect(scegliPosto([pc('A', 'no', 4), pc('B', 'posti-liberi', 0)], 0)).toBeUndefined()
  })
})

describe('i controlli su quello che arriva da un altro PC', () => {
  it('id, rami e nomi: niente che possa uscire dalla cartella o ingannare git', () => {
    expect(idLavoroValido('r0123456789ab')).toBe(true)
    expect(idLavoroValido('r../../x')).toBe(false)
    expect(idLavoroValido('r0123456789AB')).toBe(false)
    expect(ramoDiRitorno('r0123456789ab')).toBe('worktree-agent-r0123456789ab')
    expect(ramoValido('main')).toBe(true)
    expect(ramoValido('feature/x')).toBe(true)
    expect(ramoValido('-x')).toBe(false)
    expect(ramoValido('a..b')).toBe(false)
    expect(ramoValido('--upload-pack=evil')).toBe(false)
    expect(nomeProgettoSicuro('..\\..\\Windows')).toBe('Windows')
    expect(nomeProgettoSicuro('')).toBe('progetto')
  })
  it('gli strumenti: solo quelli dell’elenco (niente Agent, niente web)', () => {
    expect(strumentiAmmessi(['Read', 'Bash', 'Agent', 'WebFetch', 'mcp__x__y', 'Edit'])).toEqual(['Read', 'Bash', 'Edit'])
    expect(strumentiAmmessi('Bash')).toEqual(['Read', 'Grep', 'Glob'])
  })
  it('i pezzi: almeno uno, e uno in più appena si supera la misura', () => {
    expect(quantiPezzi(0)).toBe(1)
    expect(quantiPezzi(PEZZO_BYTE)).toBe(1)
    expect(quantiPezzi(PEZZO_BYTE + 1)).toBe(2)
  })
  it('un lavoro letto dal disco: i campi storti cadono, quelli buoni restano', () => {
    expect(lavoroAffidatoValido({ id: 'x', workspace: 'W', cwd: 'C', pcId: 'p', stato: 'spedito' })).toBeUndefined()
    const l = lavoroAffidatoValido({ id: 'r0123456789ab', workspace: 'W', cwd: 'C', pcId: 'p', stato: 'spedito', strumenti: ['Agent', 'Read'], modello: 'gpt', ramo: '../x' })
    expect(l?.strumenti).toEqual(['Read'])
    expect(l?.modello).toBe('sonnet')
    expect(l?.ramo).toBeUndefined()
  })
})

describe('la guardia: un Agent affidato a un altro PC non parte qui', () => {
  const RADICE = join(tmpdir(), 'principale')
  const agente = { tool_name: 'Agent', cwd: RADICE, tool_input: { subagent_type: 'sviluppatore', description: 'k-7: il pulsante', prompt: 'fai il pulsante' } }
  const base = { radice: RADICE, specialistiSulPc: 0, tettoPc: 4 }

  it('affidato: rifiutato con il motivo che dice di non rilanciarlo, e la fila non si tocca', () => {
    const viste: unknown[] = []
    let fila = 0
    const g = giudicaGuardiaOrchestratore(agente, { ...base, affida: (r) => { viste.push(r); return 'affidato a Portatile' }, fila: () => { fila += 1; return { passa: true } } })
    expect(g).toEqual({ ok: false, motivo: 'affidato a Portatile' })
    expect(viste).toEqual([{ descrizione: 'k-7: il pulsante', tipo: 'sviluppatore', prompt: 'fai il pulsante' }])
    expect(fila).toBe(0)
  })
  it('nessun posto fuori: passa come sempre', () => {
    expect(giudicaGuardiaOrchestratore(agente, { ...base, affida: () => undefined }).ok).toBe(true)
  })
  it('un doppione resta un doppione: prima dei posti fuori', () => {
    let chiesto = false
    const g = giudicaGuardiaOrchestratore(agente, { ...base, doppio: () => 'già al lavoro', affida: () => { chiesto = true; return 'x' } })
    expect(g).toEqual({ ok: false, motivo: 'già al lavoro' })
    expect(chiesto).toBe(false)
  })
})
