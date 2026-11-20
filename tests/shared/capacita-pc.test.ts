import { describe, expect, it } from 'vitest'
import { CAPACITA_VALIDA_MS, capacitaValida, haCapacita, ricavaCapacita } from '@shared/capacita-pc'
import { rispondiAiuto } from '../../src/main/rotte-aiuto'
import { creaCapacitaLocali } from '../../src/main/capacita-locali'

const IL = Date.UTC(2026, 10, 20, 10, 0, 0)

describe('ricavaCapacita', () => {
  it('trova i programmi in un PATH finto (Windows)', () => {
    const presenti = new Set(['C:\\bin\\git.exe', 'D:\\tools\\node.cmd', 'D:\\tools\\gh.exe', 'C:\\bin\\docker.exe'])
    const c = ricavaCapacita('C:\\bin;D:\\tools\\;', (p) => presenti.has(p), { adesso: IL })
    expect(c.programmi.sort()).toEqual(['docker', 'gh', 'git', 'node'])
    expect(c.telefono).toBe(false)
    expect(c.aiutante).toBe(false)
    expect(c.il).toBe('2026-11-20T10:00:00.000Z')
  })

  it('trova i programmi in un PATH finto (POSIX) e ignora le cartelle vuote', () => {
    const presenti = new Set(['/usr/bin/python', '/opt/x/adb'])
    const c = ricavaCapacita('/usr/bin::/opt/x', (p) => presenti.has(p))
    expect(c.programmi.sort()).toEqual(['adb', 'python'])
  })

  it('PATH vuoto: nessun programma; un esiste che lancia non rompe', () => {
    expect(ricavaCapacita('', () => true).programmi).toEqual([])
    expect(ricavaCapacita('/a', () => { throw new Error('x') }).programmi).toEqual([])
  })

  it('porta telefono, rete e aiutante', () => {
    const c = ricavaCapacita('/a', () => false, { telefono: true, rete: ['\\\\nas\\condivisa', '\\\\nas\\condivisa'], aiutante: true })
    expect(c.telefono).toBe(true)
    expect(c.rete).toEqual(['\\\\nas\\condivisa'])
    expect(c.aiutante).toBe(true)
  })
})

describe('haCapacita', () => {
  const c = ricavaCapacita('/bin', (p) => p === '/bin/git', { telefono: true, rete: ['nas'] })

  it('si / no per programmi, telefono, rete', () => {
    expect(haCapacita(c, 'git')).toBe('si')
    expect(haCapacita(c, 'docker')).toBe('no')
    expect(haCapacita(c, 'telefono')).toBe('si')
    expect(haCapacita(c, 'nas')).toBe('si')
    expect(haCapacita(c, 'aiutante')).toBe('no')
  })

  it('telefono assente: no', () => {
    expect(haCapacita(ricavaCapacita('/bin', () => false), 'telefono')).toBe('no')
  })

  it('battito vecchio senza il campo: sconosciuto, non no', () => {
    const vecchio: { pcId: string; capacita?: ReturnType<typeof ricavaCapacita> } = { pcId: 'a' }
    expect(haCapacita(vecchio.capacita, 'git')).toBe('sconosciuto')
    expect(haCapacita(vecchio.capacita, 'telefono')).toBe('sconosciuto')
    expect(haCapacita(null, 'git')).toBe('sconosciuto')
    expect(haCapacita(capacitaValida({ pcId: 'a' }), 'git')).toBe('sconosciuto')
  })

  it('capacitaValida accetta la forma giusta e scarta il resto', () => {
    expect(capacitaValida({ programmi: ['git', 3], telefono: true, aiutante: false, il: 'x' })).toEqual({ programmi: ['git'], telefono: true, aiutante: false, il: 'x' })
    expect(capacitaValida('no')).toBeUndefined()
  })
})

describe('memoria di 10 minuti', () => {
  it('non rifà il calcolo prima di 10 minuti', () => {
    let ora = IL
    let giri = 0
    const leggi = creaCapacitaLocali({ aiutante: false, path: () => '/bin', esiste: () => { giri++; return false }, adesso: () => ora })
    const a = leggi()
    const giriPrima = giri
    ora += CAPACITA_VALIDA_MS - 1
    expect(leggi()).toBe(a)
    expect(giri).toBe(giriPrima)
    ora += 2
    expect(leggi()).not.toBe(a)
    expect(giri).toBeGreaterThan(giriPrima)
  })
})

describe('/api/aiuto/posti', () => {
  const r = { metodo: 'GET', percorso: '/api/aiuto/posti', corpo: undefined }

  it('porta le capacità, anche con modo no', async () => {
    const capacita = ricavaCapacita('/bin', (p) => p === '/bin/java', { adesso: IL })
    for (const modo of ['no', 'dedicato'] as const) {
      const e = await rispondiAiuto(r, { modo: () => modo, servizio: async () => ({ liberi: 2, tetto: 3 }), capacita: () => capacita })
      expect((e?.corpo as { capacita?: unknown }).capacita).toEqual(capacita)
    }
  })

  it('senza capacità la risposta resta quella di prima', async () => {
    const e = await rispondiAiuto(r, { modo: () => 'dedicato', servizio: async () => ({ liberi: 1, tetto: 1 }) })
    expect(e?.corpo).toEqual({ modo: 'dedicato', liberi: 1, tetto: 1 })
  })
})
