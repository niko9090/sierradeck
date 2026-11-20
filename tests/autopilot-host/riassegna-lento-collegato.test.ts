import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaSpedizioniere } from '../../src/main/aiuto-spedizioniere'
import type { EventoAiuto } from '../../src/shared/eventi-aiuto'
import type { LavoroAffidato } from '../../src/shared/aiuto-rete'

/**
 * k-166n6: la riassegnazione per lentezza è nel ciclo vero dello spedizioniere.
 * Un lavoro fermo da più di 15 minuti passa a un altro PC capace e libero (mai
 * il lento, mai uno senza i programmi che servono); se nessuno può, si dice
 * chiaro e il lavoro è fallito per causa del PC. Quello che il PC lento manda
 * dopo si ignora.
 */

type PcProva = { id: string; liberi?: number; programmi?: string[] }

const prova = async (pcs: PcProva[], requisiti: string[] = []) => {
  const l: LavoroAffidato = {
    id: 'r0000000000c1', workspace: 'Prova', cwd: tmpdir(), pcId: 'pc-uno', pcNome: 'Uno', ruolo: 'sviluppatore',
    descrizione: 'x', compito: 'k-9', prompt: 'fai x', sistema: '', modello: 'sonnet', strumenti: [], stato: 'da-spedire', inizio: new Date().toISOString(),
    ...(requisiti.length > 0 ? { risorse: requisiti.map((valore) => ({ tipo: 'programma' as const, valore, perche: 'serve', indispensabile: true })) } : {})
  }
  const eventi: EventoAiuto[] = []
  const avanzi: Record<string, unknown>[] = []
  const chiusi: string[] = []
  let ritiri = 0
  let giriLento = 0
  let ora = Date.parse('2026-11-20T10:00:00Z')
  const git = async (args: string[]): Promise<string> => {
    if (args[0] === 'symbolic-ref') return 'main\n'
    if (args[0] === 'rev-parse') return `${'a'.repeat(40)}\n`
    if (args[0] === 'bundle') { writeFileSync(args[2]!, Buffer.from('pacchetto')); return '' }
    return ''
  }
  const sp = creaSpedizioniere({
    altri: () => pcs.map((p) => ({ pcId: p.id, nome: `Nome ${p.id}` })),
    chiama: async (pcId, percorso) => {
      if (percorso === '/api/aiuto/posti') {
        const p = pcs.find((v) => v.id === pcId)!
        return { modo: 'dedicato', liberi: p.liberi ?? 1, capacita: { programmi: p.programmi ?? [], telefono: false, aiutante: false, il: new Date(ora).toISOString() } }
      }
      if (percorso === '/api/aiuto/chiudi') { chiusi.push(pcId); return {} }
      if (percorso === '/api/aiuto/ritira') { ritiri++; return { dati: Buffer.from('x').toString('base64') } }
      if (percorso === '/api/aiuto/stato') {
        if (pcId === 'pc-uno') {
          giriLento++
          // Primo giro: fermo da 31 minuti. Dopo (se qualcuno lo chiede ancora): arriva tardi un risultato con un ramo.
          return giriLento === 1 ? { id: l.id, stato: 'lavoro', fermoMs: 31 * 60_000 } : { id: l.id, stato: 'finito', ramo: 'ramo-tardivo', byte: 9 }
        }
        return { id: l.id, stato: 'finito', byte: 0 }
      }
      return {}
    },
    servizio: async (percorso, corpo) => {
      if (percorso === '/aiuto/giro') return { lavori: l.stato === 'da-spedire' || l.stato === 'spedito' ? [{ ...l }] : [] }
      avanzi.push(corpo ?? {})
      const r = corpo?.riassegna as { pcId: string; pcNome: string } | undefined
      if (r !== undefined) { l.provati = [...(l.provati ?? []), l.pcId]; l.pcId = r.pcId; l.pcNome = r.pcNome; l.stato = 'da-spedire'; l.riassegnazioni = (l.riassegnazioni ?? 0) + 1 }
      else {
        if (corpo?.stato !== undefined) l.stato = corpo.stato as LavoroAffidato['stato']
        if (typeof corpo?.ramo === 'string') l.ramo = corpo.ramo
        if (typeof corpo?.motivo === 'string') l.motivo = corpo.motivo
        if (corpo?.causa !== undefined) l.causa = corpo.causa as NonNullable<LavoroAffidato['causa']>
      }
      return {}
    },
    cartella: mkdtempSync(join(tmpdir(), 'spedizioni-')), git, log: () => undefined, errore: () => undefined, avviso: () => undefined,
    registra: (e) => { if (e.tipo === 'riassegnato') eventi.push(e) },
    adesso: () => ora, dorme: async () => { ora += 1000 }
  })
  try {
    await sp.giro()
    const fine = Date.now() + 8000
    while ((l.stato === 'da-spedire' || l.stato === 'spedito' || sp.inMano().length > 0) && Date.now() < fine) {
      await new Promise((ok) => setTimeout(ok, 20))
    }
  } finally { sp.ferma() }
  return { l, eventi, avanzi, chiusi, ritiri }
}

describe('riassegnazione per lentezza nel ciclo dello spedizioniere', () => {
  it('un lavoro fermo da 31 minuti passa a un altro PC, con la frase chiara', async () => {
    const r = await prova([{ id: 'pc-uno' }, { id: 'pc-due' }])
    expect(r.l.pcId).toBe('pc-due')
    expect(r.l.stato).toBe('finito')
    expect(r.eventi).toHaveLength(1)
    expect(r.eventi[0]).toMatchObject({ tipo: 'riassegnato', daPc: 'Uno', aPc: 'Nome pc-due' })
    const frase = r.avanzi.find((a) => a.riassegna !== undefined)?.motivo as string
    expect(frase).toMatch(/k-9 era fermo da 31 minuti su Uno: l’ho passato a Nome pc-due/u)
  })

  it('con un requisito (adb) sceglie il PC che ce l’ha, non il primo libero', async () => {
    const r = await prova([{ id: 'pc-uno' }, { id: 'pc-due', liberi: 3 }, { id: 'pc-tre', programmi: ['adb'] }], ['adb'])
    expect(r.l.pcId).toBe('pc-tre')
    expect(r.eventi[0]).toMatchObject({ aPc: 'Nome pc-tre' })
  })

  it('il PC lento è escluso anche con più posti liberi', async () => {
    const r = await prova([{ id: 'pc-uno', liberi: 9 }, { id: 'pc-due', liberi: 1 }])
    expect(r.l.pcId).toBe('pc-due')
    expect(r.l.provati).toEqual(['pc-uno'])
    expect(r.chiusi).toContain('pc-uno')
  })

  it('nessun altro PC capace: il lavoro risulta fallito per causa del PC e lo dice', async () => {
    const r = await prova([{ id: 'pc-uno' }, { id: 'pc-due', programmi: ['git'] }], ['adb'])
    expect(r.l.stato).toBe('fallito')
    expect(r.l.causa).toBe('pc')
    expect(r.l.motivo).toMatch(/riparte qui/u)
    expect(r.eventi).toHaveLength(1)
    expect(r.eventi[0]).toMatchObject({ tipo: 'riassegnato', aPc: 'questo PC' })
  })

  it('il risultato tardivo del PC lento è ignorato: una sola copia viva', async () => {
    const r = await prova([{ id: 'pc-uno' }, { id: 'pc-due' }])
    expect(r.ritiri).toBe(0)
    expect(r.l.ramo).toBeUndefined()
    expect(r.avanzi.filter((a) => a.stato === 'finito')).toHaveLength(1)
    expect(r.chiusi.filter((c) => c === 'pc-uno')).toHaveLength(1)
  })
})
