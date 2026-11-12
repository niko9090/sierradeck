import { describe, it, expect, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaNucleo } from '../../src/aiutante/nucleo'
import { rotteAiutante } from '../../src/aiutante/rete'
import { creaSpedizioniere } from '../../src/main/aiuto-spedizioniere'
import type { AvviaProcesso } from '../../src/autopilot-host/processo-claude'
import type { LavoroAffidato } from '../../src/shared/aiuto-rete'

/**
 * 12/11: un lavoro affidato a SierraDeck Aiutante, dall'inizio alla fine, con
 * git vero e uno specialista finto (niente Claude). Il PC che chiede usa lo
 * spedizioniere di sempre; le sue richieste passano dalle rotte dell'Aiutante
 * (`rotte-aiuto.ts`) al suo nucleo, nello stesso processo. Lo specialista fa
 * un commit SENZA dire chi è: lo firma l'autore del progetto, che l'Aiutante
 * ha impostato nella sua copia (su un Aiutante appena preparato git non lo sa).
 */
const radice = mkdtempSync(join(tmpdir(), 'aiutante-percorso-'))
afterAll(() => { try { rmSync(radice, { recursive: true, force: true }) } catch { /* Windows tiene i file un attimo */ } })

const g = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8' })

const specialistaFinto: AvviaProcesso = ({ cwd }) => {
  const righe: ((r: string) => void)[] = []
  const uscite: ((c: number | null, e: string) => void)[] = []
  let finito = false
  const esci = (): void => { if (finito) return; finito = true; for (const f of uscite) f(0, '') }
  return {
    scrivi: () => {
      setTimeout(() => {
        writeFileSync(join(cwd, 'aiutato.txt'), 'fatto dall’Aiutante\n')
        g(cwd, 'add', 'aiutato.txt')
        g(cwd, 'commit', '-m', 'k-9: fatto dall’Aiutante')
        for (const f of righe) f(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'Fatto.' }))
      }, 20)
    },
    uccidi: esci,
    suRiga: (f) => { righe.push(f) },
    suUscita: (f) => { if (finito) f(0, ''); else uscite.push(f) }
  }
}

describe('un lavoro affidato a SierraDeck Aiutante', () => {
  it('va, l’Aiutante lavora, il ramo torna firmato dall’autore del progetto', async () => {
    const qui = join(radice, 'progetto')
    execFileSync('git', ['init', '-b', 'main', qui])
    g(qui, 'config', 'user.name', 'Autore Progetto')
    g(qui, 'config', 'user.email', 'autore@example.invalid')
    writeFileSync(join(qui, 'leggimi.txt'), 'ciao\n')
    g(qui, 'add', '.')
    g(qui, 'commit', '-m', 'inizio')

    const nucleo = creaNucleo({
      cartella: join(radice, 'aiutante', 'aiuto'), avvia: specialistaFinto,
      misura: () => ({ processori: 8, memoriaLiberaMb: 32_000, memoriaTotaleMb: 64_000, caricoPercento: 5 }),
      regolazione: () => ({ postiScelti: 2 }), pronto: () => true, inScarico: () => false,
      log: () => {}, errore: () => {}
    })
    const rotte = rotteAiutante({
      aiuto: { modo: () => 'dedicato', servizio: (p, c) => nucleo.servizio(p, c), programma: 'aiutante', nomePc: () => 'Fisso' },
      versione: '1.0.0', identita: () => ({ nome: 'Aiutante', host: 'h' })
    })
    // Il collegamento fra i PC, finto: la richiesta firmata arriva alle rotte dell'Aiutante.
    const chiama = async (_pc: string, percorso: string, corpo?: Record<string, unknown>): Promise<unknown> => {
      const r = await rotte({ metodo: percorso === '/api/aiuto/posti' ? 'GET' : 'POST', percorso, corpo, dispositivo: 'pc:pc-fisso' })
      if (r.stato !== 200) throw new Error(String((r.corpo as { errore?: string }).errore))
      return r.corpo
    }

    const lavoro: LavoroAffidato = {
      id: 'r0000000aa001', workspace: 'Prova', cwd: qui, pcId: 'pc-aiu', pcNome: 'Aiutante',
      ruolo: 'sviluppatore', descrizione: 'k-9', prompt: 'Fai k-9.', sistema: '', modello: 'sonnet',
      strumenti: ['Read', 'Edit', 'Write', 'Bash'], stato: 'da-spedire', inizio: new Date().toISOString()
    }
    let aiutantiVisti: unknown
    const servizio = async (percorso: string, corpo?: Record<string, unknown>): Promise<unknown> => {
      if (percorso === '/aiuto/giro') { aiutantiVisti = corpo?.aiutanti; return { lavori: lavoro.stato === 'da-spedire' || lavoro.stato === 'spedito' ? [lavoro] : [] } }
      if (corpo?.stato !== undefined) lavoro.stato = corpo.stato as LavoroAffidato['stato']
      if (typeof corpo?.ramo === 'string') lavoro.ramo = corpo.ramo
      return { fatto: true }
    }
    const sp = creaSpedizioniere({
      altri: () => [{ pcId: 'pc-aiu', nome: 'Aiutante', aiutante: true }],
      chiama, servizio, cartella: join(radice, 'spedizioni'), log: () => undefined,
      dorme: (ms) => new Promise((ok) => setTimeout(ok, Math.min(ms, 30)))
    })
    try {
      await sp.giro()
      const fine = Date.now() + 60_000
      while ((lavoro.stato === 'da-spedire' || lavoro.stato === 'spedito') && Date.now() < fine) await new Promise((ok) => setTimeout(ok, 50))
    } finally { sp.ferma() }

    expect(aiutantiVisti).toEqual([{ pcId: 'pc-aiu', nome: 'Aiutante', modo: 'dedicato', liberi: 2, programma: 'aiutante' }])
    expect(lavoro.stato).toBe('finito')
    expect(lavoro.ramo).toBe('worktree-agent-r0000000aa001')
    expect(g(qui, 'log', '-1', '--format=%an <%ae>', 'worktree-agent-r0000000aa001').trim()).toBe('Autore Progetto <autore@example.invalid>')
    expect(nucleo.lavoratore.inCorso()).toBe(0)
  }, 90_000)
})
