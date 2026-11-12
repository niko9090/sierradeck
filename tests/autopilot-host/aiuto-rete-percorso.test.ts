import { describe, it, expect, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaLavoratoreAiuto } from '../../src/autopilot-host/aiuto-lavoratore'
import { creaSpedizioniere } from '../../src/main/aiuto-spedizioniere'
import type { AvviaProcesso } from '../../src/autopilot-host/orchestratore'
import type { LavoroAffidato } from '../../src/shared/aiuto-rete'

/**
 * 0.103.0: il percorso intero di un lavoro affidato a un altro PC, con git
 * vero e uno specialista finto (niente Claude): il progetto parte a pezzi,
 * di là nasce una copia, lo specialista fa un commit, il ramo torna nel
 * progetto di qui come `worktree-agent-r<id>` e il servizio riceve l'esito.
 */
const radice = mkdtempSync(join(tmpdir(), 'aiuto-rete-'))
afterAll(() => { try { rmSync(radice, { recursive: true, force: true }) } catch { /* Windows tiene i file un attimo */ } })

const g = (cwd: string, ...args: string[]): string => execFileSync('git', ['-c', 'user.name=Prova', '-c', 'user.email=prova@example.invalid', ...args], { cwd, encoding: 'utf8' })

/** Lo specialista finto: scrive un file nella sua copia, fa il commit, dice «fatto». */
const specialistaFinto = (prompt: { visto?: string; args?: string[] }): AvviaProcesso => ({ args, cwd }) => {
  prompt.args = args
  const righe: ((r: string) => void)[] = []
  const uscite: ((c: number | null, e: string) => void)[] = []
  let finito = false
  const esci = (): void => { if (finito) return; finito = true; for (const f of uscite) f(0, '') }
  return {
    scrivi: (riga) => {
      prompt.visto = (JSON.parse(riga) as { message: { content: string } }).message.content
      setTimeout(() => {
        writeFileSync(join(cwd, 'pulsante.txt'), 'fatto di là\n')
        g(cwd, 'add', 'pulsante.txt')
        g(cwd, 'commit', '-m', 'k-7: il pulsante')
        for (const f of righe) f(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: join(cwd, 'pulsante.txt') } }] } }))
        for (const f of righe) f(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'Fatto il pulsante.\nRAPPORTO: ok' }))
      }, 20)
    },
    uccidi: esci,
    suRiga: (f) => { righe.push(f) },
    suUscita: (f) => { if (finito) f(0, ''); else uscite.push(f) }
  }
}

describe('un lavoro affidato a un altro PC, dall’inizio alla fine', () => {
  it('il progetto va, lo specialista lavora di là, il ramo torna qui', async () => {
    const qui = join(radice, 'progetto')
    execFileSync('git', ['init', '-b', 'main', qui])
    writeFileSync(join(qui, 'leggimi.txt'), 'ciao\n')
    g(qui, 'add', '.')
    g(qui, 'commit', '-m', 'inizio')

    const visto: { visto?: string; args?: string[] } = {}
    const lav = creaLavoratoreAiuto({ cartella: join(radice, 'aiutante'), avvia: specialistaFinto(visto), log: () => undefined })

    // Il servizio di qui, finto: tiene il lavoro e gli esiti.
    const lavoro: LavoroAffidato = {
      id: 'r0123456789ab', workspace: 'Prova', cwd: qui, pcId: 'pc-la', pcNome: 'Portatile',
      ruolo: 'sviluppatore', descrizione: 'k-7: il pulsante', compito: 'k-7', prompt: 'Fai il pulsante.',
      sistema: 'Sei lo sviluppatore.', modello: 'sonnet', strumenti: ['Read', 'Edit', 'Write', 'Bash', 'Agent'],
      stato: 'da-spedire', inizio: new Date().toISOString()
    }
    const esiti: Record<string, unknown>[] = []
    const servizio = async (percorso: string, corpo?: Record<string, unknown>): Promise<unknown> => {
      if (percorso === '/aiuto/giro') return { lavori: lavoro.stato === 'da-spedire' || lavoro.stato === 'spedito' ? [lavoro] : [] }
      if (percorso === '/aiuto/avanza') {
        esiti.push(corpo!)
        if (corpo!.stato !== undefined) lavoro.stato = corpo!.stato as LavoroAffidato['stato']
        if (typeof corpo!.ramo === 'string') lavoro.ramo = corpo!.ramo
        return { fatto: true }
      }
      throw new Error(`rotta inattesa ${percorso}`)
    }
    // Il collegamento fra i PC, finto: le rotte vanno dritte al lavoratore di là.
    const chiama = async (pcId: string, percorso: string, corpo?: Record<string, unknown>): Promise<unknown> => {
      expect(pcId).toBe('pc-la')
      const c = corpo ?? {}
      const esito = (e: { ok: boolean; motivo?: string } & Record<string, unknown>): unknown => { if (!e.ok) throw new Error(e.motivo); return e }
      switch (percorso) {
        case '/api/aiuto/posti': return { modo: 'dedicato', liberi: 2, tetto: 2 }
        case '/api/aiuto/pezzo': return esito(lav.pezzo({ lavoro: c.lavoro, n: c.n, totale: c.totale, dati: c.dati }))
        case '/api/aiuto/avvia': return esito(lav.avvia(c))
        case '/api/aiuto/stato': { const v = lav.stato(c.lavoro); if (v === undefined) throw new Error('lavoro sconosciuto su questo PC'); return v }
        case '/api/aiuto/ritira': return esito(lav.ritira({ lavoro: c.lavoro, n: c.n }))
        case '/api/aiuto/chiudi': return { fatto: lav.chiudi(c.lavoro) }
        default: throw new Error(`rotta inattesa ${percorso}`)
      }
    }

    const sp = creaSpedizioniere({
      altri: () => [{ pcId: 'pc-la', nome: 'Portatile' }],
      chiama, servizio, cartella: join(radice, 'spedizioni'), log: () => undefined,
      dorme: (ms) => new Promise((ok) => setTimeout(ok, Math.min(ms, 30)))
    })
    try {
      await sp.giro()
      const fine = Date.now() + 60_000
      while ((lavoro.stato === 'da-spedire' || lavoro.stato === 'spedito') && Date.now() < fine) await new Promise((ok) => setTimeout(ok, 50))
    } finally { sp.ferma() }

    expect(lavoro.stato).toBe('finito')
    expect(lavoro.ramo).toBe('worktree-agent-r0123456789ab')
    // Lo specialista di là ha ricevuto lo stesso messaggio, e non ha avuto Agent fra gli strumenti.
    expect(visto.visto).toBe('Fai il pulsante.')
    const strumenti = visto.args![visto.args!.indexOf('--allowedTools') + 1]!
    expect(strumenti.split(',')).not.toContain('Agent')
    const vietati = visto.args![visto.args!.indexOf('--disallowedTools') + 1]!.split(',')
    expect(vietati).toContain('Bash(git push:*)')
    // Uno strumento non concesso è anche vietato per nome: in -p, provarlo lascerebbe lo specialista senza risposta.
    expect(vietati).toContain('PowerShell')
    expect(vietati).not.toContain('Bash')
    // Il ramo è nel progetto di qui, con il commit fatto di là; il ramo principale non si è mosso.
    expect(g(qui, 'log', '--format=%s', 'worktree-agent-r0123456789ab')).toContain('k-7: il pulsante')
    expect(g(qui, 'show', 'worktree-agent-r0123456789ab:pulsante.txt')).toBe('fatto di là\n')
    expect(g(qui, 'log', '--format=%s', 'main').trim()).toBe('inizio')
    expect(readFileSync(join(qui, 'leggimi.txt'), 'utf8')).toBe('ciao\n')
    // L'esito al servizio: con il riepilogo, per l'autopilota.
    const ultimo = esiti.at(-1)!
    expect(ultimo).toMatchObject({ id: 'r0123456789ab', stato: 'finito', ramo: 'worktree-agent-r0123456789ab' })
    expect(String(ultimo.riepilogo)).toContain('Fatto il pulsante.')
    // Di là non resta niente da ritirare: il lavoro è chiuso.
    expect(lav.stato('r0123456789ab')).toBeUndefined()
    expect(lav.inCorso()).toBe(0)
  }, 90_000)

  it('un PC che dimentica il lavoro (riavvio): non riuscito, con il perché', async () => {
    const lavoro: LavoroAffidato = {
      id: 'r00000000000f', workspace: 'Prova', cwd: radice, pcId: 'pc-la', pcNome: 'Portatile', ruolo: 'sviluppatore',
      descrizione: 'x', prompt: 'x', sistema: '', modello: 'sonnet', strumenti: [], stato: 'spedito', inizio: new Date().toISOString()
    }
    const esiti: Record<string, unknown>[] = []
    const sp = creaSpedizioniere({
      altri: () => [],
      chiama: async (_pc, percorso) => { if (percorso === '/api/aiuto/stato') throw new Error('lavoro sconosciuto su questo PC'); return {} },
      servizio: async (percorso, corpo) => { if (percorso === '/aiuto/giro') return { lavori: lavoro.stato === 'spedito' ? [lavoro] : [] }; esiti.push(corpo!); lavoro.stato = corpo!.stato as LavoroAffidato['stato']; return {} },
      cartella: join(radice, 'spedizioni2'), log: () => undefined, dorme: async () => undefined
    })
    try {
      await sp.giro()
      const fine = Date.now() + 5000
      while (lavoro.stato === 'spedito' && Date.now() < fine) await new Promise((ok) => setTimeout(ok, 20))
    } finally { sp.ferma() }
    expect(esiti.at(-1)).toMatchObject({ stato: 'fallito' })
    expect(String(esiti.at(-1)!.motivo)).toContain('Portatile non ha più questo lavoro')
  })
})
