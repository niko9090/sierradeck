import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { decidiRiassegna, eventoArreso, eventoRiassegnato, MAX_RIASSEGNAZIONI, scegliAltroPc } from '../../src/shared/aiuto-riassegna'
import { creaSpedizioniere } from '../../src/main/aiuto-spedizioniere'
import type { EventoAiuto } from '../../src/shared/eventi-aiuto'
import type { Aiutante, LavoroAffidato } from '../../src/shared/aiuto-rete'

/**
 * 16/11: un lavoro affidato a un PC che non riesce ad agire (risorsa mancante,
 * rete, silenzio) passa a un altro PC con posti liberi, al più 2 volte, senza
 * tornare su un PC già provato; il fallimento del lavoro stesso non si riassegna.
 */

const pc = (pcId: string, liberi = 1, extra: Partial<Aiutante> = {}): Aiutante => ({ pcId, nome: `Nome ${pcId}`, modo: 'dedicato', liberi, ...extra })

describe('decidiRiassegna', () => {
  it('colpa del PC: passa a un altro PC libero', () => {
    const m = decidiRiassegna({ causa: 'risorsa', riassegnazioni: 0, provati: ['a'], aiutanti: [pc('a'), pc('b')] })
    expect(m).toMatchObject({ tipo: 'riassegna', a: { pcId: 'b' } })
  })

  it('colpa del lavoro: non si riassegna, nemmeno con PC liberi', () => {
    const m = decidiRiassegna({ causa: 'compito', riassegnazioni: 0, provati: ['a'], aiutanti: [pc('b')] })
    expect(m.tipo).toBe('resta-fallito')
    expect(m.tipo === 'resta-fallito' && m.arreso).toBe(false)
  })

  it('al più 2 volte: alla terza resta fallito (arreso)', () => {
    const m = decidiRiassegna({ causa: 'pc', riassegnazioni: MAX_RIASSEGNAZIONI, provati: ['a', 'b', 'c'], aiutanti: [pc('d')] })
    expect(m).toMatchObject({ tipo: 'resta-fallito', arreso: true })
  })

  it('esclude i PC già provati e quelli senza posti o fuori', () => {
    const fuori = new Map([['f', 2000]])
    const scelto = scegliAltroPc({ aiutanti: [pc('a'), pc('b', 0), pc('f', 3), pc('g', 1)], provati: ['a'], fuori, adesso: 1000 })
    expect(scelto?.pcId).toBe('g')
    // Passato il tempo di «fuori», quel PC torna disponibile.
    expect(scegliAltroPc({ aiutanti: [pc('f', 3)], provati: [], fuori, adesso: 3000 })?.pcId).toBe('f')
  })

  it('senza nessun altro PC libero resta fallito con il motivo', () => {
    const m = decidiRiassegna({ causa: 'risorsa', riassegnazioni: 1, provati: ['a', 'b'], aiutanti: [pc('a'), pc('b')] })
    expect(m).toMatchObject({ tipo: 'resta-fallito', arreso: true })
    expect(m.tipo === 'resta-fallito' && m.motivo).toMatch(/nessun altro PC/u)
  })

  it('preferisce un Aiutante dedicato, poi chi ha più posti', () => {
    expect(scegliAltroPc({ aiutanti: [pc('x', 5), pc('y', 1, { programma: 'aiutante' })], provati: [] })?.pcId).toBe('y')
    expect(scegliAltroPc({ aiutanti: [pc('x', 1), pc('y', 3)], provati: [] })?.pcId).toBe('y')
  })

  it('gli eventi del registro hanno tipo, da quale PC a quale e motivo', () => {
    const e = eventoRiassegnato({ quando: 'q', lavoroId: 'r1', compito: 'k-1', daPc: 'Uno', aPc: 'Due', motivo: 'quel PC non risponde (dettagli)', causa: 'risorsa' })
    expect(e).toMatchObject({ tipo: 'riassegnato', daPc: 'Uno', aPc: 'Due', lavoroId: 'r1' })
    expect(e.motivo.length).toBeGreaterThan(0)
    expect(eventoArreso({ quando: 'q', lavoroId: 'r1', compito: 'k-1', daPc: 'Uno', motivo: 'm' }).tipo).toBe('arreso')
  })
})

describe('lo spedizioniere riassegna', () => {
  const nuovoLavoro = (): LavoroAffidato => ({
    id: 'r0000000000b1', workspace: 'Prova', cwd: tmpdir(), pcId: 'pc-uno', pcNome: 'Uno', ruolo: 'sviluppatore',
    descrizione: 'x', compito: 'k-9', prompt: 'fai x', sistema: '', modello: 'sonnet', strumenti: [], stato: 'da-spedire', inizio: new Date().toISOString()
  })

  /** Un finto servizio e finti PC: `esiti[pcId]` dice come va il lavoro su quel PC. */
  const prova = async (esiti: Record<string, { stato: string; causa?: string; motivo?: string } | 'giu'>, pcLiberi: string[]) => {
    const l = nuovoLavoro()
    const avvii: string[] = []
    const eventi: EventoAiuto[] = []
    const avanzi: Record<string, unknown>[] = []
    const git = async (args: string[]): Promise<string> => {
      if (args[0] === 'symbolic-ref') return 'main\n'
      if (args[0] === 'rev-parse') return `${'a'.repeat(40)}\n`
      if (args[0] === 'bundle') { writeFileSync(args[2]!, Buffer.from('pacchetto')); return '' }
      return ''
    }
    const sp = creaSpedizioniere({
      altri: () => pcLiberi.map((id) => ({ pcId: id, nome: `Nome ${id}` })),
      chiama: async (pcId, percorso) => {
        if (percorso === '/api/aiuto/posti') return { modo: 'dedicato', liberi: 1 }
        const esito = esiti[pcId] ?? 'giu'
        if (percorso === '/api/aiuto/avvia') { avvii.push(pcId); if (esito === 'giu') throw new Error('non raggiungibile'); return {} }
        if (percorso === '/api/aiuto/stato') {
          if (esito === 'giu') throw new Error('non raggiungibile')
          return { id: l.id, ...esito, byte: 0 }
        }
        return {}
      },
      servizio: async (percorso, corpo) => {
        if (percorso === '/aiuto/giro') return { lavori: l.stato === 'da-spedire' || l.stato === 'spedito' ? [{ ...l }] : [] }
        avanzi.push(corpo ?? {})
        const r = corpo?.riassegna as { pcId: string; pcNome: string } | undefined
        if (r !== undefined) { l.provati = [...(l.provati ?? []), l.pcId]; l.pcId = r.pcId; l.pcNome = r.pcNome; l.stato = 'da-spedire'; l.riassegnazioni = (l.riassegnazioni ?? 0) + 1 }
        else if (corpo?.stato !== undefined) l.stato = corpo.stato as LavoroAffidato['stato']
        return {}
      },
      cartella: mkdtempSync(join(tmpdir(), 'spedizioni-')), git, log: () => undefined, errore: () => undefined, avviso: () => undefined,
      // Qui contano solo i passaggi e le rese; affidato, risorsa-mancante e rifiutato sono in aiuto-eventi-registro.test.ts.
      registra: (e) => { if (e.tipo === 'riassegnato' || e.tipo === 'arreso') eventi.push(e) }, dorme: async () => undefined
    })
    try {
      await sp.giro()
      const fine = Date.now() + 8000
      while ((l.stato === 'da-spedire' || l.stato === 'spedito' || sp.inMano().length > 0) && Date.now() < fine) {
        await new Promise((ok) => setTimeout(ok, 20))
      }
    } finally { sp.ferma() }
    return { l, avvii, eventi, avanzi }
  }

  it('risorsa mancante sul primo PC: il lavoro passa al secondo e finisce', async () => {
    const r = await prova({ 'pc-uno': { stato: 'fallito', causa: 'risorsa', motivo: 'manca la cartella' }, 'pc-due': { stato: 'finito' } }, ['pc-due'])
    expect(r.avvii).toEqual(['pc-uno', 'pc-due'])
    expect(r.l.stato).toBe('finito')
    expect(r.l.provati).toEqual(['pc-uno'])
    expect(r.eventi.map((e) => e.tipo)).toEqual(['riassegnato'])
    expect(r.eventi[0]).toMatchObject({ lavoroId: r.l.id, daPc: 'Uno', aPc: 'Nome pc-due' })
  })

  it('fallimento del lavoro stesso (prove rosse): nessuna riassegnazione', async () => {
    const r = await prova({ 'pc-uno': { stato: 'fallito', causa: 'compito', motivo: 'prove rosse' }, 'pc-due': { stato: 'finito' } }, ['pc-due'])
    expect(r.avvii).toEqual(['pc-uno'])
    expect(r.l.stato).toBe('fallito')
    expect(r.eventi).toEqual([])
  })

  it('PC irraggiungibile alla spedizione: passa a un altro; nessun PC libero: resta fallito e si registra la resa', async () => {
    const a = await prova({ 'pc-uno': 'giu', 'pc-due': { stato: 'finito' } }, ['pc-due'])
    expect(a.l.stato).toBe('finito')
    expect(a.eventi.map((e) => e.tipo)).toEqual(['riassegnato'])

    const b = await prova({ 'pc-uno': 'giu' }, [])
    expect(b.l.stato).toBe('fallito')
    expect(b.eventi.map((e) => e.tipo)).toEqual(['arreso'])
  })

  it('al più 2 passaggi, e mai su un PC già provato', async () => {
    const r = await prova({
      'pc-uno': { stato: 'fallito', causa: 'risorsa' },
      'pc-due': { stato: 'fallito', causa: 'risorsa' },
      'pc-tre': { stato: 'fallito', causa: 'risorsa' },
      'pc-zeta': { stato: 'finito' }
    }, ['pc-due', 'pc-tre', 'pc-zeta'])
    expect(r.avvii.length).toBe(3)
    expect(new Set(r.avvii).size).toBe(3)
    expect(r.l.stato).toBe('fallito')
    expect(r.eventi.map((e) => e.tipo)).toEqual(['riassegnato', 'riassegnato', 'arreso'])
  })
})
