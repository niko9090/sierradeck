import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { motivoCorto, postiDelBattito, vistaPostiPc, type MisuraPc, type PostiChat } from '@shared/posti-chat'
import { alberoRete } from '@shared/albero-rete'
import { computerDa } from '@shared/computer-vista'
import type { BattitoPc } from '@shared/posta'

const ADESSO = Date.parse('2026-11-23T10:00:00Z')
const MISURA: MisuraPc = { processori: 8, memoriaLiberaMb: 3174, memoriaTotaleMb: 16384, caricoPercento: 87 }
const posti = (o: Partial<PostiChat> = {}): PostiChat => ({ attive: 1, posti: 4, inFila: 0, regolazione: 0, perche: 'memoria', risale: false, misura: MISURA, ...o })

const battito = (nome: string, extra: Partial<BattitoPc> = {}): BattitoPc => ({
  pcId: `pc-${nome}`, nome, versione: '1.0.0', battito: new Date(ADESSO - 10_000).toISOString(), cartelle: [], chat: [], ...extra
})
const dati = (pc: BattitoPc[]) => ({ io: { nome: 'Mio PC', versione: '1.0.0' }, pc, adesso: ADESSO })

describe('postiDelBattito: il campo è facoltativo', () => {
  it('un PC di versione vecchia non lo manda: nessun errore, nessuna vista', () => {
    expect(postiDelBattito(undefined)).toBeUndefined()
    expect(vistaPostiPc(undefined)).toBeUndefined()
    expect(() => alberoRete(dati([battito('Finto1')]))).not.toThrow()
  })

  it('un campo storto conta come assente', () => {
    for (const x of [null, 5, 'testo', [], {}, { attive: 1, posti: 3 }, { attive: 1, posti: 3, perche: 'boh' }, { perche: 'memoria' }]) {
      expect(postiDelBattito(x)).toBeUndefined()
    }
  })

  it('un campo giusto passa con motivo, misura e scelta', () => {
    const p = postiDelBattito(posti({ perche: 'scelto', scelti: 5 }))
    expect(p).toMatchObject({ attive: 1, posti: 4, perche: 'scelto', scelti: 5, misura: MISURA })
  })

  it('la misura storta si scarta, il resto resta', () => {
    const p = postiDelBattito({ ...posti(), misura: { processori: 'otto' } })
    expect(p).toBeDefined()
    expect(p?.misura).toBeUndefined()
  })
})

describe('vistaPostiPc: lo stesso motivo di k-179a', () => {
  it('riga, motivo e spiegazione vengono dalle funzioni di questo PC', () => {
    for (const perche of ['memoria', 'carico', 'processori', 'minimo', 'massimo', 'scelto'] as const) {
      const p = posti({ perche })
      const v = vistaPostiPc(p)
      expect(v?.motivo).toBe(motivoCorto(p))
      expect(v?.riga).toBe('1 di 4 chat')
    }
    expect(vistaPostiPc(posti({ perche: 'memoria' }))?.motivo).toBe('poca memoria (3,1 GB liberi)')
    expect(vistaPostiPc(posti({ perche: 'carico' }))?.motivo).toBe('PC carico (87%)')
  })

  it('la spiegazione parla di quel PC e non di questo', () => {
    const v = vistaPostiPc(posti())
    expect(v?.spiega.startsWith('Su quel PC')).toBe(true)
    expect(v?.spiega).toContain('3,1 GB di memoria libera su 16')
  })

  it('senza misura non inventa numeri', () => {
    const { misura: _m, ...senza } = posti()
    expect(vistaPostiPc(senza)?.motivo).toBe('poca memoria')
  })
})

describe('rete dei PC, Computer e Altri PC', () => {
  const pc = [
    battito('Finto1', { posti: posti({ perche: 'carico' }) }),
    battito('Finto2'),
    battito('Finto3', { aiutante: true, posti: posti() })
  ]

  it('il nodo di ogni PC porta il motivo se il PC lo manda, e solo il numero se non lo manda', () => {
    const rami = alberoRete(dati(pc)).rami
    const nodi = rami.flatMap((r) => r.nodi)
    expect(nodi.find((n) => n.nome === 'Finto1')?.posti?.motivo).toBe('PC carico (87%)')
    expect(nodi.find((n) => n.nome === 'Finto2')?.posti).toBeUndefined()
    // l'Aiutante non ha chat sue: niente motivo
    expect(nodi.find((n) => n.nome === 'Finto3')?.posti).toBeUndefined()
  })

  it('la scheda della pagina Computer lo riporta uguale', () => {
    const { altri } = computerDa(dati(pc))
    expect(altri.find((s) => s.nome === 'Finto1')?.posti?.motivo).toBe('PC carico (87%)')
    expect(altri.find((s) => s.nome === 'Finto2')?.posti).toBeUndefined()
  })
})

describe('il sorgente', () => {
  const leggi = (p: string): string => readFileSync(p, 'utf8')

  it('il battito manda i posti e non si riscrive a ogni misura', () => {
    const posta = leggi('src/main/progetti/posta.ts')
    expect(posta).toMatch(/posti\?: \(\) => PostiChat \| undefined/u)
    expect(posta).toMatch(/\{ posti: p \}/u)
    expect(posta).toMatch(/misura: _m/u)
    expect(leggi('src/shared/posta.ts')).toMatch(/posti\?: PostiChat/u)
    const indice = leggi('src/main/index.ts')
    expect(indice).toMatch(/posti: \(\) => postiQuiGlobale/u)
    expect(indice).toMatch(/clientAutopilota\.postiChat\(\)/u)
  })

  it('la pagina mostra il motivo accanto al numero e la spiegazione dietro «?»', () => {
    const pagina = leggi('src/renderer/components/PaginaComputer.tsx')
    expect(pagina).toMatch(/export function PostiDelPc/u)
    expect(pagina).toMatch(/posti\.riga/u)
    expect(pagina).toMatch(/posti\.motivo/u)
    expect(pagina).toMatch(/<Aiuto di="chat insieme">\{posti\.spiega/u)
    // in tutte e due le forme della scheda: riga compatta e scheda piena
    expect(pagina.match(/<PostiDelPc posti=\{s\.posti\} \/>/gu)?.length).toBe(2)
  })

  it('niente nomi veri, indirizzi o percorsi nel codice nuovo', () => {
    const nuovi = [leggi('src/shared/posti-chat.ts'), leggi('src/renderer/components/PaginaComputer.tsx')].join('\n')
    expect(nuovi).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/u)
    expect(nuovi).not.toMatch(/[A-Za-z]:\\Users\\/u)
  })
})
