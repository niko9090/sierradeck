import { describe, it, expect, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaLavoratoreAiuto } from '../../src/autopilot-host/aiuto-lavoratore'
import { creaSpedizioniere } from '../../src/main/aiuto-spedizioniere'
import { raggruppa, type ArrivoLetto } from '../../src/main/errori-arrivati-lavoro'
import { creaNucleo } from '../../src/aiutante/nucleo'
import type { AvviaProcesso } from '../../src/autopilot-host/processo-claude'
import type { LavoroAffidato } from '../../src/shared/aiuto-rete'

/**
 * 23/11 (k-183b): un solo lavoro affidato fallito (k-55, Money) produceva tre
 * gruppi negli «Errori arrivati», due dal PC che affida (spedizioniere e
 * servizio), ciascuno due volte, più uno dall'Aiutante. Adesso: un errore sul
 * PC che affida (quello del servizio), il resto avvisi o cronaca; e la stessa
 * voce arrivata due volte non si conta due volte.
 */
const radice = mkdtempSync(join(tmpdir(), 'errore-aiuto-'))
afterAll(() => { try { rmSync(radice, { recursive: true, force: true }) } catch { /* Windows */ } })

const g = (cwd: string, ...args: string[]): string => execFileSync('git', ['-c', 'user.name=Prova', '-c', 'user.email=prova@example.invalid', ...args], { cwd, encoding: 'utf8' })

const senzaAccesso: AvviaProcesso = () => {
  const righe: ((r: string) => void)[] = []
  const uscite: ((c: number | null, e: string) => void)[] = []
  let finito = false
  const esci = (): void => { if (finito) return; finito = true; for (const f of uscite) f(1, '') }
  return {
    scrivi: () => { setTimeout(() => { for (const f of righe) f(JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'Invalid API key · Please run /login' })) }, 10) },
    uccidi: esci,
    suRiga: (f) => { righe.push(f) },
    suUscita: (f) => { if (finito) f(1, ''); else uscite.push(f) }
  }
}

describe('un lavoro affidato fallito: un solo errore', () => {
  it('lo spedizioniere (PC che affida) scrive un avviso, non un errore', async () => {
    const qui = join(radice, 'money')
    execFileSync('git', ['init', '-b', 'main', qui])
    writeFileSync(join(qui, 'a.txt'), 'ciao\n')
    g(qui, 'add', '.')
    g(qui, 'commit', '-m', 'inizio')
    const lav = creaLavoratoreAiuto({ cartella: join(radice, 'aiutante'), avvia: senzaAccesso, log: () => undefined, pulisciOgniMs: 0, suFine: () => undefined })
    const lavoro: LavoroAffidato = {
      id: 'r0000000000b1', workspace: 'money', cwd: qui, pcId: 'pc-la', pcNome: 'Aiutante', ruolo: 'sviluppatore',
      descrizione: 'k-55: x', compito: 'k-55', prompt: 'x', sistema: '', modello: 'sonnet', strumenti: [], stato: 'da-spedire', inizio: new Date().toISOString()
    }
    const chiama = async (_pc: string, percorso: string, corpo?: Record<string, unknown>): Promise<unknown> => {
      const c = corpo ?? {}
      const esito = (e: { ok: boolean; motivo?: string } & Record<string, unknown>): unknown => { if (!e.ok) throw new Error(e.motivo); return e }
      switch (percorso) {
        case '/api/aiuto/pezzo': return esito(lav.pezzo({ lavoro: c.lavoro, n: c.n, totale: c.totale, dati: c.dati }))
        case '/api/aiuto/avvia': return esito(lav.avvia(c))
        case '/api/aiuto/stato': { const v = lav.stato(c.lavoro); if (v === undefined) throw new Error('lavoro sconosciuto su questo PC'); return v }
        case '/api/aiuto/chiudi': return { fatto: lav.chiudi(c.lavoro) }
        default: throw new Error(`rotta inattesa ${percorso}`)
      }
    }
    const servizio = async (percorso: string, corpo?: Record<string, unknown>): Promise<unknown> => {
      if (percorso === '/aiuto/giro') return { lavori: lavoro.stato === 'da-spedire' || lavoro.stato === 'spedito' ? [lavoro] : [] }
      if (percorso === '/aiuto/avanza') { if (corpo!.stato !== undefined) lavoro.stato = corpo!.stato as LavoroAffidato['stato']; return { fatto: true } }
      throw new Error(`rotta inattesa ${percorso}`)
    }
    const errori: string[] = []
    const avvisi: string[] = []
    const sp = creaSpedizioniere({
      altri: () => [], chiama, servizio, cartella: join(radice, 'spedizioni'),
      log: () => undefined, errore: (r) => errori.push(r), avviso: (r) => avvisi.push(r),
      dorme: (ms) => new Promise((ok) => setTimeout(ok, Math.min(ms, 30)))
    })
    try {
      await sp.giro()
      const fine = Date.now() + 60_000
      while ((lavoro.stato === 'da-spedire' || lavoro.stato === 'spedito') && Date.now() < fine) await new Promise((ok) => setTimeout(ok, 30))
    } finally { sp.ferma() }
    expect(lavoro.stato).toBe('fallito')
    expect(errori).toEqual([])
    expect(avvisi.filter((r) => r.includes('non riuscito'))).toHaveLength(1)
  }, 90_000)

  it('l’Aiutante riporta il fallimento come cronaca, non come errore', () => {
    const errori: string[] = []
    const righe: string[] = []
    const n = creaNucleo({
      cartella: 'non-usata', avvia: () => { throw new Error('mai') }, misura: () => ({ processori: 8, memoriaLiberaMb: 32_000, memoriaTotaleMb: 64_000, caricoPercento: 5 }),
      regolazione: () => ({}), pronto: () => true, inScarico: () => false,
      log: (r) => righe.push(r), errore: (r) => errori.push(r),
      lavoratore: { inCorso: () => 0, ospitati: () => [], inCoda: () => [], avanzaCoda: () => false, pezzo: () => ({ ok: true as const, ricevuti: 1 }), avvia: () => ({ ok: true as const }), stato: () => undefined, ritira: () => ({ ok: false as const, motivo: '' }), chiudi: () => true, ferma: () => false, pulizia: async () => {} }
    })
    n.suFine({ id: 'rba4ca9869603', stato: 'fallito', testo: '', motivo: 'npm ci non riuscito', perPc: 'Portatile Asus', ruolo: 'sviluppatore' })
    expect(errori).toEqual([])
    expect(righe.filter((r) => r.includes('rba4ca9869603'))).toHaveLength(1)
  })

  it('la stessa voce arrivata due volte allo stesso istante conta una volta; un errore davvero ripetuto no', () => {
    const voce = { quando: '2026-11-23T09:40:00.123Z', ultima: '2026-11-23T09:40:00.123Z', dove: 'servizio' as const, volte: 1, messaggio: '[aiuto] Money — k-55 da X Aiutante: fallito — boh' }
    const arrivo = (file: string, v = voce): ArrivoLetto => ({ file, da: 'Portatile Asus', versione: '0.114.1', voci: [v] })
    const base = { versioneQui: '0.114.2', affidati: {}, adesso: Date.parse('2026-11-23T10:00:00Z') }
    expect(raggruppa({ ...base, arrivi: [arrivo('a.json'), arrivo('b.json')] }).gruppi.map((x) => x.volte)).toEqual([1])
    const dopo = { ...voce, quando: '2026-11-23T09:50:00.000Z', ultima: '2026-11-23T09:50:00.000Z' }
    expect(raggruppa({ ...base, arrivi: [arrivo('a.json'), arrivo('b.json', dopo)] }).gruppi.map((x) => x.volte)).toEqual([2])
  })
})
