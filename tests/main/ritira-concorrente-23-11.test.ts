import { describe, it, expect } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaSpedizioniere } from '../../src/main/aiuto-spedizioniere'
import { ramoDiRitorno, type LavoroAffidato } from '../../src/shared/aiuto-rete'

/**
 * 23/11: due ritiri dello stesso lavoro insieme (il PC muto che torna e il PC a cui è passato il lavoro)
 * usavano lo stesso file e lo stesso ramo. Ora vanno uno dopo l'altro: il pacchetto di ognuno è intero
 * quando git lo legge, e due ritiri non toccano mai insieme lo stesso ramo.
 */
const ID = 'r0000000000e1'
const MIN = 60_000
const BASE = Date.parse('2026-11-20T10:00:00Z')
const pausa = (ms: number) => new Promise((ok) => setTimeout(ok, ms))

describe('ritiri dello stesso lavoro insieme', () => {
  it('non si scontrano: mai due insieme, pacchetto intero, file tolto alla fine', async () => {
    const cartella = mkdtempSync(join(tmpdir(), 'ritira-conc-'))
    const l: LavoroAffidato = {
      id: ID, workspace: 'Prova', cwd: tmpdir(), pcId: 'pc-uno', pcNome: 'Nome pc-uno', ruolo: 'sviluppatore',
      descrizione: 'x', compito: 'k-9', prompt: 'fai x', sistema: '', modello: 'sonnet', strumenti: [], stato: 'da-spedire', inizio: new Date(BASE).toISOString()
    }
    let ora = BASE
    let attivi = 0
    let massimo = 0
    let inizi = 0
    const fetch: { dimensione: number; ramo: string }[] = []
    let sovrapposti = 0
    let ritiriInCorso = 0
    const finito = { id: ID, stato: 'finito', byte: 9, riepilogo: 'fatto' }
    const sp = creaSpedizioniere({
      altri: () => ['pc-uno', 'pc-due'].map((p) => ({ pcId: p, nome: `Nome ${p}` })),
      chiama: async (pcId, percorso, corpo) => {
        if (percorso === '/api/aiuto/posti') return { modo: 'dedicato', liberi: 1, capacita: { programmi: [], telefono: false, aiutante: false, il: new Date(ora).toISOString() } }
        if (percorso === '/api/aiuto/pezzo' || percorso === '/api/aiuto/avvia' || percorso === '/api/aiuto/chiudi') return {}
        if (percorso === '/api/aiuto/ritira') {
          if (corpo?.n === 0) { inizi++; ritiriInCorso++; if (ritiriInCorso > 1) sovrapposti++ }
          attivi++
          massimo = Math.max(massimo, attivi)
          await pausa(25)
          attivi--
          return { dati: Buffer.from('pacchetto!').toString('base64') }
        }
        if (percorso === '/api/aiuto/stato') {
          if (pcId === 'pc-uno') { if (ora < BASE + 40 * MIN) throw new Error('timeout: non risponde'); return finito }
          return ora < BASE + 40 * MIN ? { id: ID, stato: 'lavoro', fermoMs: 1000 } : finito
        }
        return {}
      },
      servizio: async (percorso, corpo) => {
        if (percorso === '/aiuto/giro') return { lavori: l.stato === 'da-spedire' || l.stato === 'spedito' ? [{ ...l }] : [] }
        const r = corpo?.riassegna as { pcId: string; pcNome: string } | undefined
        if (r !== undefined) { l.provati = [...(l.provati ?? []), l.pcId]; l.pcId = r.pcId; l.pcNome = r.pcNome; l.stato = 'da-spedire'; l.riassegnazioni = (l.riassegnazioni ?? 0) + 1 }
        else if (corpo?.stato !== undefined) l.stato = corpo.stato as LavoroAffidato['stato']
        return {}
      },
      cartella,
      git: async (args: string[]): Promise<string> => {
        if (args[0] === 'symbolic-ref') return 'main\n'
        if (args[0] === 'rev-parse') return `${'a'.repeat(40)}\n`
        if (args[0] === 'bundle') { writeFileSync(args[2]!, Buffer.from('pacchetto')); return '' }
        if (args[0] === 'fetch') {
          const file = args[2]!
          // Il pacchetto dev'essere intero (un ritiro che riparte lo azzererebbe a metà).
          fetch.push({ dimensione: existsSync(file) ? readFileSync(file).length : -1, ramo: args[3]! })
          await pausa(10)
          ritiriInCorso--
        }
        return ''
      },
      log: () => undefined, errore: () => undefined, avviso: () => undefined, registra: () => undefined,
      adesso: () => ora, dorme: async (ms) => { ora += Math.max(ms, 15_000); await pausa(1) }
    })
    try {
      await sp.giro()
      const fine = Date.now() + 15_000
      while ((l.stato === 'da-spedire' || l.stato === 'spedito' || sp.inMano().length > 0) && Date.now() < fine) await pausa(20)
      await pausa(300)
    } finally { sp.ferma() }
    expect(inizi).toBeGreaterThanOrEqual(2)
    expect(massimo).toBe(1)
    expect(sovrapposti).toBe(0)
    expect(fetch.length).toBeGreaterThanOrEqual(1)
    for (const f of fetch) {
      expect(f.dimensione).toBe(10)
      expect(f.ramo).toBe(`+refs/heads/${ramoDiRitorno(ID)}:refs/heads/${ramoDiRitorno(ID)}`)
    }
    expect(readdirSync(cartella).filter((n) => n.endsWith('.bundle'))).toEqual([])
  })
})
