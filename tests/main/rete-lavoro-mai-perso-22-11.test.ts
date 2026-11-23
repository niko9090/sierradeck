import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaSpedizioniere } from '../../src/main/aiuto-spedizioniere'
import { ramoDiRitorno, type LavoroAffidato } from '../../src/shared/aiuto-rete'

/**
 * k-178e: dal lato di chi affida, un lavoro finito su un altro PC non si perde mai.
 * Il PC remoto si chiude solo dopo che il ramo è arrivato e il servizio ha l'esito;
 * un PC muto si aspetta (e si riassegna senza chiuderlo); un parziale si ritira prima di chiudere.
 */

const ID = 'r0000000000d1'
const MIN = 60_000

type Pc = { id: string; stato: (ora: number, inizio: number) => unknown | Error }

type Opzioni = { pcs: Pc[]; ritiriChePerdono?: number; avanzaChePerde?: number }

const avvia = async (opzioni: Opzioni) => {
  const cartella = mkdtempSync(join(tmpdir(), 'mai-perso-'))
  return corsa(opzioni, cartella)
}

const corsa = async (opzioni: Opzioni, cartella: string) => {
  const l: LavoroAffidato = {
    id: ID, workspace: 'Prova', cwd: tmpdir(), pcId: opzioni.pcs[0]!.id, pcNome: `Nome ${opzioni.pcs[0]!.id}`, ruolo: 'sviluppatore',
    descrizione: 'x', compito: 'k-9', prompt: 'fai x', sistema: '', modello: 'sonnet', strumenti: [], stato: 'da-spedire', inizio: new Date().toISOString()
  }
  const sequenza: string[] = []
  const avanzi: Record<string, unknown>[] = []
  const avvii: Record<string, unknown>[] = []
  const bundle: string[] = []
  const eventi: { tipo: string }[] = []
  let ritiriPersi = opzioni.ritiriChePerdono ?? 0
  let avanziPersi = opzioni.avanzaChePerde ?? 0
  let ora = Date.parse('2026-11-20T10:00:00Z')
  const inizio = new Map<string, number>()
  const git = async (args: string[]): Promise<string> => {
    if (args[0] === 'symbolic-ref') return 'main\n'
    if (args[0] === 'rev-parse') return `${'a'.repeat(40)}\n`
    if (args[0] === 'bundle') { writeFileSync(args[2]!, Buffer.from('pacchetto')); bundle.push(args.slice(3).join(' ')); return '' }
    return ''
  }
  const sp = creaSpedizioniere({
    altri: () => opzioni.pcs.map((p) => ({ pcId: p.id, nome: `Nome ${p.id}` })),
    chiama: async (pcId, percorso, corpo) => {
      if (percorso === '/api/aiuto/posti') return { modo: 'dedicato', liberi: 1, capacita: { programmi: [], telefono: false, aiutante: false, il: new Date(ora).toISOString() } }
      if (percorso === '/api/aiuto/pezzo') return {}
      if (percorso === '/api/aiuto/avvia') { inizio.set(pcId, ora); avvii.push({ pcId, ...(corpo ?? {}) }); return {} }
      if (percorso === '/api/aiuto/chiudi') { sequenza.push(`chiudi:${pcId}`); return {} }
      if (percorso === '/api/aiuto/ritira') {
        sequenza.push(`ritira:${pcId}`)
        if (ritiriPersi > 0) { ritiriPersi--; throw new Error('timeout del collegamento') }
        return { dati: Buffer.from('x').toString('base64') }
      }
      if (percorso === '/api/aiuto/stato') {
        const r = opzioni.pcs.find((p) => p.id === pcId)!.stato(ora, inizio.get(pcId) ?? ora)
        if (r instanceof Error) throw r
        return r
      }
      return {}
    },
    servizio: async (percorso, corpo) => {
      if (percorso === '/aiuto/giro') return { lavori: l.stato === 'da-spedire' || l.stato === 'spedito' ? [{ ...l }] : [] }
      if (corpo?.stato === 'finito') {
        if (avanziPersi > 0) { avanziPersi--; throw new Error('servizio non raggiungibile') }
        sequenza.push('avanza:finito')
      }
      avanzi.push(corpo ?? {})
      const r = corpo?.riassegna as { pcId: string; pcNome: string } | undefined
      if (r !== undefined) { l.provati = [...(l.provati ?? []), l.pcId]; l.pcId = r.pcId; l.pcNome = r.pcNome; l.stato = 'da-spedire'; l.riassegnazioni = (l.riassegnazioni ?? 0) + 1 }
      else {
        if (corpo?.stato !== undefined) l.stato = corpo.stato as LavoroAffidato['stato']
        if (typeof corpo?.ramo === 'string') l.ramo = corpo.ramo
        if (typeof corpo?.motivo === 'string') l.motivo = corpo.motivo
      }
      return {}
    },
    cartella, git, log: () => undefined, errore: () => undefined, avviso: () => undefined,
    registra: (e) => { eventi.push(e) },
    adesso: () => ora, dorme: async (ms) => { ora += Math.max(ms, 15_000) }
  })
  try {
    await sp.giro()
    const fine = Date.now() + 15_000
    // Si aspetta che il lavoro sia chiuso e che nessun seguito sia più in mano.
    while ((l.stato === 'da-spedire' || l.stato === 'spedito' || sp.inMano().length > 0) && Date.now() < fine) {
      await new Promise((ok) => setTimeout(ok, 20))
    }
    await new Promise((ok) => setTimeout(ok, 100))
  } finally { sp.ferma() }
  return { l, sequenza, avanzi, avvii, bundle, eventi }
}

const finitoCon = (byte: number) => ({ id: ID, stato: 'finito', byte, riepilogo: 'fatto' })
const muto = new Error('timeout: non risponde')

describe('un lavoro finito su un altro PC non si perde mai (k-178e)', () => {
  it('1. il ritiro fallisce 4 volte: il ramo arriva comunque, un solo chiudi, dopo avanza:finito', async () => {
    const r = await avvia({ pcs: [{ id: 'pc-uno', stato: () => finitoCon(9) }], ritiriChePerdono: 4 })
    expect(r.l.stato).toBe('finito')
    expect(r.l.ramo).toBe(ramoDiRitorno(ID))
    expect(r.avanzi.filter((a) => a.stato === 'fallito')).toHaveLength(0)
    expect(r.sequenza.filter((s) => s.startsWith('chiudi'))).toEqual(['chiudi:pc-uno'])
    expect(r.sequenza.indexOf('chiudi:pc-uno')).toBeGreaterThan(r.sequenza.indexOf('avanza:finito'))
  })

  it('2. il servizio non prende l’esito 4 volte: un solo avanza:finito, chiudi dopo', async () => {
    const r = await avvia({ pcs: [{ id: 'pc-uno', stato: () => finitoCon(9) }], avanzaChePerde: 4 })
    expect(r.l.stato).toBe('finito')
    expect(r.sequenza.filter((s) => s === 'avanza:finito')).toHaveLength(1)
    expect(r.sequenza.filter((s) => s.startsWith('chiudi'))).toEqual(['chiudi:pc-uno'])
    expect(r.sequenza.indexOf('chiudi:pc-uno')).toBeGreaterThan(r.sequenza.indexOf('avanza:finito'))
  })

  it('3. un PC muto per 40 minuti che poi torna finito: il ramo arriva, nessun fallito', async () => {
    const r = await avvia({
      pcs: [{ id: 'pc-uno', stato: (ora, inizio) => (ora - inizio < 40 * MIN ? muto : finitoCon(9)) }]
    })
    expect(r.l.stato).toBe('finito')
    expect(r.l.ramo).toBe(ramoDiRitorno(ID))
    expect(r.avanzi.filter((a) => a.stato === 'fallito')).toHaveLength(0)
  })

  it('3b. due PC: il primo muto 35 minuti, il secondo lavora 60: finito, chiudi del primo dopo l’esito, un solo esito', async () => {
    const r = await avvia({
      pcs: [
        { id: 'pc-uno', stato: () => muto },
        { id: 'pc-due', stato: (ora, inizio) => (ora - inizio < 60 * MIN ? { id: ID, stato: 'lavoro', fermoMs: 1000 } : finitoCon(9)) }
      ]
    })
    expect(r.l.stato).toBe('finito')
    expect(r.l.pcId).toBe('pc-due')
    expect(r.sequenza.filter((s) => s === 'avanza:finito')).toHaveLength(1)
    expect(r.sequenza.indexOf('chiudi:pc-uno')).toBeGreaterThan(r.sequenza.indexOf('avanza:finito'))
    expect(r.avanzi.filter((a) => a.stato === 'fallito')).toHaveLength(0)
  })

  it('4. un parziale lento con due PC: ritira prima di chiudere, riparte dal ramo parziale su pc-due', async () => {
    const r = await avvia({
      pcs: [
        { id: 'pc-uno', stato: () => ({ id: ID, stato: 'lavoro', fermoMs: 31 * MIN, byte: 9, commit: 2 }) },
        { id: 'pc-due', stato: (ora, inizio) => (ora - inizio < 20 * MIN ? { id: ID, stato: 'lavoro', fermoMs: 1000 } : finitoCon(0)) }
      ]
    })
    expect(r.sequenza.indexOf('ritira:pc-uno')).toBeGreaterThanOrEqual(0)
    expect(r.sequenza.indexOf('ritira:pc-uno')).toBeLessThan(r.sequenza.indexOf('chiudi:pc-uno'))
    const avvioDue = r.avvii.find((a) => a.pcId === 'pc-due')
    expect(avvioDue).toBeDefined()
    expect(avvioDue!.ramoBase).toBe(ramoDiRitorno(ID))
    expect(avvioDue!.base).toMatch(/^a{40}$/u)
    expect(r.bundle).toContain(`main ${ramoDiRitorno(ID)}`)
  })

  it('5. un PC solo, lento: fallito, dice «lo chiudo come non riuscito», ramo salvato, ritira prima di chiudere', async () => {
    const r = await avvia({
      pcs: [{ id: 'pc-uno', stato: () => ({ id: ID, stato: 'lavoro', fermoMs: 31 * MIN, byte: 9, commit: 2 }) }]
    })
    expect(r.l.stato).toBe('fallito')
    expect(r.l.motivo).not.toMatch(/riparte qui/u)
    expect(r.l.motivo).toMatch(/lo chiudo come non riuscito/u)
    expect(r.l.ramo).toBe(ramoDiRitorno(ID))
    expect(r.sequenza.indexOf('ritira:pc-uno')).toBeLessThan(r.sequenza.indexOf('chiudi:pc-uno'))
    expect(r.eventi.map((e) => e.tipo)).toContain('arreso')
    expect(r.eventi.map((e) => e.tipo)).not.toContain('riassegnato')
  })
})
