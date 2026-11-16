import { describe, it, expect } from 'vitest'
import {
  motivoRisorsa, ricavaRisorse, risorseValide, risorsaMancante, sezioneRisorse, verificaRisorse, type Risorsa, type StrumentiVerifica
} from '../../src/shared/aiuto-risorse'
import { causaDelMotivo, colpaDelPc, fraseCausa, causaValida } from '../../src/shared/aiuto-esito'
import { lavoroAffidatoValido } from '../../src/shared/aiuto-rete'

const finto = (c: { esistono?: string[]; programmi?: string[]; variabili?: string[]; lento?: string[] }): StrumentiVerifica => ({
  esiste: (p) => (c.lento?.includes(p) === true ? new Promise<boolean>(() => undefined) : Promise.resolve(c.esistono?.includes(p) === true)),
  nelPath: (p) => Promise.resolve(c.programmi?.includes(p) === true),
  variabile: (n) => c.variabili?.includes(n) === true,
  tempoMs: 30
})

describe('ricavaRisorse', () => {
  it('ricava percorsi assoluti, UNC e unità di rete dal messaggio', () => {
    const r = ricavaRisorse('Leggi C:\\dati\\listino.csv, poi copia in \\\\server\\condivisa\\export. Su Z:\\progetti c’è il resto.')
    expect(r.map((x) => [x.tipo, x.valore])).toEqual([
      ['cartella', 'C:\\dati\\listino.csv'],
      ['percorso-rete', '\\\\server\\condivisa\\export'],
      ['percorso-rete', 'Z:\\progetti']
    ])
    expect(r.every((x) => x.alternativa !== undefined && x.indispensabile !== true)).toBe(true)
  })

  it('ricava i comandi noti solo in un blocco di codice o dopo un verbo d’uso', () => {
    expect(ricavaRisorse('Lancia `docker compose up` e poi usa ffmpeg per il video').map((x) => x.valore).sort()).toEqual(['docker', 'ffmpeg'])
    expect(ricavaRisorse('Vai a fare la prova e make it simple, vai go').length).toBe(0)
  })

  it('esclude la cartella del progetto e non fa doppioni', () => {
    const r = ricavaRisorse('Guarda C:\\lavoro\\proj\\src e C:\\altro\\x e C:\\altro\\x', [], ['C:\\lavoro\\proj'])
    expect(r.map((x) => x.valore)).toEqual(['C:\\altro\\x'])
  })

  it('le dichiarate passano prima e sono indispensabili salvo diversa indicazione', () => {
    const dich: Risorsa[] = [{ tipo: 'programma', valore: 'docker', perche: 'serve per le prove' }, { tipo: 'variabile', valore: 'NAS_HOST', perche: 'x', indispensabile: false }]
    const r = ricavaRisorse('Lancia `docker ps`', dich)
    expect(r.map((x) => [x.valore, x.indispensabile])).toEqual([['docker', true], ['NAS_HOST', false]])
  })

  it('scarta percorsi con credenziali e variabili o programmi dal nome strano', () => {
    const r = risorseValide([
      { tipo: 'percorso-rete', valore: 'smb://utente:segreto@nas/x', perche: 'x' },
      { tipo: 'variabile', valore: 'NOME CON SPAZI', perche: 'x' },
      { tipo: 'programma', valore: 'a;b', perche: 'x' },
      { tipo: 'variabile', valore: 'NAS_HOST', perche: 'x' },
      { tipo: 'altro', valore: 'x' }
    ])
    expect(r.map((x) => x.valore)).toEqual(['NAS_HOST'])
  })

  it('il lavoro affidato porta le risorse dichiarate', () => {
    const l = lavoroAffidatoValido({
      id: 'r0000000000a1', workspace: 'P', cwd: 'C:\\p', pcId: 'pc', stato: 'da-spedire',
      risorse: [{ tipo: 'cartella', valore: 'D:\\x', perche: 'dati' }, { tipo: 'boh' }]
    })
    expect(l?.risorse).toEqual([{ tipo: 'cartella', valore: 'D:\\x', perche: 'dati' }])
  })
})

describe('verificaRisorse', () => {
  const risorse: Risorsa[] = [
    { tipo: 'cartella', valore: 'D:\\c', perche: 'a' },
    { tipo: 'cartella', valore: 'D:\\manca', perche: 'b' },
    { tipo: 'percorso-rete', valore: '\\\\nas\\x', perche: 'c' },
    { tipo: 'programma', valore: 'docker', perche: 'd' },
    { tipo: 'variabile', valore: 'NAS_HOST', perche: 'e' }
  ]

  it('dice cosa c’è, cosa manca e cosa non risponde entro il tempo', async () => {
    const v = await verificaRisorse(risorse, finto({ esistono: ['D:\\c'], lento: ['\\\\nas\\x'], programmi: ['docker'] }))
    expect(v.map((x) => x.esito)).toEqual(['ok', 'manca', 'non-risponde', 'ok', 'manca'])
  })

  it('un fs che lancia un errore vale «non risponde»', async () => {
    const v = await verificaRisorse([risorse[0]!], { ...finto({}), esiste: () => Promise.reject(new Error('EIO')) })
    expect(v[0]?.esito).toBe('non-risponde')
  })
})

describe('sezione del prompt e fallimento subito', () => {
  const dich: Risorsa = { tipo: 'percorso-rete', valore: '\\\\nas\\listini', perche: 'i listini da importare', indispensabile: true }
  const alt: Risorsa = { tipo: 'cartella', valore: 'D:\\x', perche: 'dati', alternativa: 'usa la cartella dati/ del progetto', indispensabile: true }

  it('la sezione elenca c’è/manca con l’alternativa, e non mostra mai il valore di una variabile', async () => {
    process.env.SD_TEST_SEGRETO_X = 'valore-segreto-123'
    const v = await verificaRisorse([alt, { tipo: 'variabile', valore: 'SD_TEST_SEGRETO_X', perche: 'accesso al NAS' }, { tipo: 'programma', valore: 'docker', perche: 'prove' }],
      { ...finto({ programmi: ['docker'] }), variabile: (n) => process.env[n] !== undefined })
    const s = sezioneRisorse(v)
    expect(s).toContain('cartella D:\\x: MANCA')
    expect(s).toContain('usa la cartella dati/ del progetto')
    expect(s).toContain('variabile d’ambiente SD_TEST_SEGRETO_X: c’è')
    expect(s).toContain('programma docker: c’è')
    expect(s).not.toContain('valore-segreto-123')
    delete process.env.SD_TEST_SEGRETO_X
  })

  it('senza risorse la sezione è vuota', () => { expect(sezioneRisorse([])).toBe('') })

  it('manca una indispensabile senza alternativa: si fallisce, con il motivo in italiano', async () => {
    const v = await verificaRisorse([alt, dich], finto({}))
    const m = risorsaMancante(v)
    expect(m?.risorsa.valore).toBe('\\\\nas\\listini')
    expect(motivoRisorsa(m!)).toBe('percorso di rete \\\\nas\\listini non c’è su questo PC e serve (i listini da importare)')
  })

  it('con alternativa, o se non indispensabile, o se c’è: non si fallisce', async () => {
    expect(risorsaMancante(await verificaRisorse([alt, { ...dich, indispensabile: false }], finto({})))).toBeUndefined()
    expect(risorsaMancante(await verificaRisorse([dich], finto({ esistono: ['\\\\nas\\listini'] })))).toBeUndefined()
  })

  it('la causa «risorsa» è valida, è colpa del PC e si rilegge dal motivo', () => {
    expect(causaValida('risorsa')).toBe(true)
    expect(colpaDelPc('risorsa')).toBe(true)
    expect(causaDelMotivo(`${fraseCausa('risorsa')} — cartella D:\\x non c’è su questo PC`)).toBe('risorsa')
  })
})
