import { describe, it, expect, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaLavoratoreAiuto, type FineLavoro } from '../../src/autopilot-host/aiuto-lavoratore'
import { creaSpedizioniere, pesoInParole } from '../../src/main/aiuto-spedizioniere'
import type { AvviaProcesso } from '../../src/autopilot-host/processo-claude'
import type { LavoroAffidato } from '../../src/shared/aiuto-rete'
import { fraseCausa } from '../../src/shared/aiuto-esito'

/**
 * 13/11, il caso vero: un compito affidato a un Aiutante, «parte lo
 * specialista», quindici secondi dopo «fallito (lo specialista ha chiuso con
 * un errore)». Qui con git vero e uno specialista finto che chiude subito con
 * il `result` d'errore della CLI senza accesso: il motivo che torna al PC che
 * ha chiesto dice il perché, con la causa.
 */
const radice = mkdtempSync(join(tmpdir(), 'aiuto-esito-'))
afterAll(() => { try { rmSync(radice, { recursive: true, force: true }) } catch { /* Windows tiene i file un attimo */ } })

const g = (cwd: string, ...args: string[]): string => execFileSync('git', ['-c', 'user.name=Prova', '-c', 'user.email=prova@example.invalid', ...args], { cwd, encoding: 'utf8' })

/** La CLI senza accesso: risponde subito con un result d'errore, e qualcosa sullo stderr. */
const senzaAccesso: AvviaProcesso = () => {
  const righe: ((r: string) => void)[] = []
  const uscite: ((c: number | null, e: string) => void)[] = []
  let finito = false
  const esci = (): void => { if (finito) return; finito = true; for (const f of uscite) f(1, 'avviso: credenziali non valide') }
  return {
    scrivi: () => {
      setTimeout(() => {
        for (const f of righe) f(JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'Invalid API key · Please run /login' }))
      }, 10)
    },
    uccidi: esci,
    suRiga: (f) => { righe.push(f) },
    suUscita: (f) => { if (finito) f(1, 'avviso: credenziali non valide'); else uscite.push(f) }
  }
}

type Finto = { lavoro: LavoroAffidato; esiti: Record<string, unknown>[] }

function servizioFinto(f: Finto): (percorso: string, corpo?: Record<string, unknown>) => Promise<unknown> {
  return async (percorso, corpo) => {
    if (percorso === '/aiuto/giro') return { lavori: f.lavoro.stato === 'da-spedire' || f.lavoro.stato === 'spedito' ? [f.lavoro] : [] }
    if (percorso === '/aiuto/avanza') {
      f.esiti.push(corpo!)
      if (corpo!.stato !== undefined) f.lavoro.stato = corpo!.stato as LavoroAffidato['stato']
      return { fatto: true }
    }
    throw new Error(`rotta inattesa ${percorso}`)
  }
}

const aspetta = async (f: Finto): Promise<void> => {
  const fine = Date.now() + 60_000
  while ((f.lavoro.stato === 'da-spedire' || f.lavoro.stato === 'spedito') && Date.now() < fine) await new Promise((ok) => setTimeout(ok, 30))
}

describe('il perché di un lavoro affidato non riuscito arriva al PC che ha chiesto', () => {
  it('lo specialista chiude con l’errore della CLI: torna la causa «accesso», il tipo del result e il suo testo', async () => {
    const qui = join(radice, 'investimento')
    execFileSync('git', ['init', '-b', 'main', qui])
    writeFileSync(join(qui, 'leggimi.txt'), 'ciao\n')
    g(qui, 'add', '.')
    g(qui, 'commit', '-m', 'inizio')

    const fini: FineLavoro[] = []
    const righe: string[] = []
    const lav = creaLavoratoreAiuto({ cartella: join(radice, 'aiutante'), avvia: senzaAccesso, log: (r) => righe.push(r), pulisciOgniMs: 0, suFine: (x) => fini.push(x) })
    const f: Finto = {
      lavoro: {
        id: 'r0000000000a1', workspace: 'investimento', cwd: qui, pcId: 'pc-la', pcNome: 'Aiutante',
        ruolo: 'sviluppatore', descrizione: 'k-34: il grafico', compito: 'k-34', prompt: 'Fai il grafico.',
        sistema: '', modello: 'sonnet', strumenti: ['Read'], stato: 'da-spedire', inizio: new Date().toISOString()
      },
      esiti: []
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
    const registro: string[] = []
    const sp = creaSpedizioniere({
      altri: () => [], chiama, servizio: servizioFinto(f), cartella: join(radice, 'spedizioni'),
      log: (r) => registro.push(r), errore: (r) => registro.push(r),
      dorme: (ms) => new Promise((ok) => setTimeout(ok, Math.min(ms, 30)))
    })
    try { await sp.giro(); await aspetta(f) } finally { sp.ferma() }

    expect(f.lavoro.stato).toBe('fallito')
    const ultimo = f.esiti.at(-1)!
    expect(ultimo.causa).toBe('accesso')
    const motivo = String(ultimo.motivo)
    expect(motivo.startsWith(fraseCausa('accesso'))).toBe(true)
    expect(motivo).toContain('tipo success')
    expect(motivo).toContain('Invalid API key')
    expect(motivo).toContain('stderr: avviso: credenziali non valide')
    // Lo vede anche chi ospita il lavoro (l'Aiutante lo scrive nel suo registro e ci legge il limite del piano).
    expect(fini.at(-1)).toMatchObject({ stato: 'fallito', causa: 'accesso' })
    expect(righe.some((r) => r.includes('Invalid API key'))).toBe(true)
    // Il registro di qui: il peso in KB (non più «0 MB»), e il perché del fallimento.
    expect(registro.some((r) => /progetto spedito a Aiutante \(\d+ KB\)/u.test(r))).toBe(true)
    expect(registro.some((r) => r.includes('non riuscito') && r.includes('Invalid API key'))).toBe(true)
  }, 90_000)

  it('un progetto senza commit non parte: colpa del progetto, il PC che aiuta non si tocca', async () => {
    const vuoto = join(radice, 'vuoto')
    execFileSync('git', ['init', '-b', 'main', vuoto])
    writeFileSync(join(vuoto, 'appunti.txt'), 'mai salvato\n')
    const f: Finto = {
      lavoro: {
        id: 'r0000000000a2', workspace: 'vuoto', cwd: vuoto, pcId: 'pc-la', pcNome: 'Aiutante', ruolo: 'sviluppatore',
        descrizione: 'k-1: x', compito: 'k-1', prompt: 'x', sistema: '', modello: 'sonnet', strumenti: [], stato: 'da-spedire', inizio: new Date().toISOString()
      },
      esiti: []
    }
    const chiamate: string[] = []
    let posti = 0
    const sp = creaSpedizioniere({
      altri: () => [{ pcId: 'pc-la', nome: 'Aiutante' }],
      chiama: async (_pc, percorso) => { chiamate.push(percorso); if (percorso === '/api/aiuto/posti') { posti++; return { modo: 'dedicato', liberi: 2, tetto: 2 } } return {} },
      servizio: servizioFinto(f), cartella: join(radice, 'spedizioni2'), log: () => undefined, errore: () => undefined,
      dorme: async () => undefined
    })
    try { await sp.giro(); await aspetta(f) } finally { sp.ferma() }
    expect(f.esiti.at(-1)).toMatchObject({ stato: 'fallito', causa: 'progetto' })
    expect(String(f.esiti.at(-1)!.motivo).startsWith(fraseCausa('progetto'))).toBe(true)
    // Niente pezzi e niente avvio di là.
    expect(chiamate.filter((c) => c === '/api/aiuto/pezzo' || c === '/api/aiuto/avvia')).toEqual([])
    expect(posti).toBe(1)
  })

  it('il peso del pacchetto in parole: sotto il mega in KB', () => {
    expect(pesoInParole(300)).toBe('1 KB')
    expect(pesoInParole(200 * 1024)).toBe('200 KB')
    expect(pesoInParole(5 * 1024 * 1024)).toBe('5 MB')
  })
})
