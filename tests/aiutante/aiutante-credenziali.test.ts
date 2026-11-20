import { describe, it, expect, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { credenzialiPerAiutante } from '../../src/aiutante/rete'
import { servi, type Deposito } from '../../src/main/aiuto-credenziali'
import { rispondiAiuto, type FonteAiuto } from '../../src/main/rotte-aiuto'
import { creaLavoratoreAiuto } from '../../src/autopilot-host/aiuto-lavoratore'
import type { AvviaProcesso } from '../../src/autopilot-host/orchestratore'

/**
 * 20/11 (k-166n12): le credenziali di rete anche quando il lavoro arrivato da un altro PC lo esegue
 * l'Aiutante. Chiede al PC che ha affidato il lavoro (non a un altro), il valore sta solo nell'ambiente
 * dello specialista, mai nel log, nello stato o su disco; un rifiuto lascia il lavoro senza e lo dice.
 */
const radice = mkdtempSync(join(tmpdir(), 'aiutante-cred-'))
afterAll(() => { try { rmSync(radice, { recursive: true, force: true }) } catch { /* Windows tiene i file un attimo */ } })

const SEGRETO = 'tok-SEGRETISSIMO-aiutante-555'
const LAVORO = 'r0000000000a1'
const g = (cwd: string, ...args: string[]): string => execFileSync('git', ['-c', 'user.name=Prova', '-c', 'user.email=prova@example.invalid', ...args], { cwd, encoding: 'utf8' })

const deposito: Deposito = {
  aperto: () => true,
  elenco: async () => [],
  aggiungi: async () => ({ ok: true }),
  togli: async () => true,
  valori: async (nomi) => Object.fromEntries(nomi.filter((n) => n === 'nas').map((n) => [n, SEGRETO]))
}

/** Un'esecuzione completa: l'Aiutante riceve il progetto, la rotta `avvia` e lo specialista (finto) parte. */
async function eseguiLavoro(nome: string, chiama: Parameters<typeof credenzialiPerAiutante>[0]) {
  const dati = join(radice, nome)
  const avviati: Array<{ env: Record<string, string>; args: string[] }> = []
  const log: string[] = []
  const avvia: AvviaProcesso = ({ args, env }) => {
    avviati.push({ env, args })
    let riga: (r: string) => void = () => undefined
    let uscita: (c: number | null, e: string) => void = () => undefined
    return {
      scrivi: () => { setImmediate(() => { riga(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: `fatto, la chiave era ${SEGRETO}` })); uscita(0, `stderr con ${SEGRETO}`) }) },
      uccidi: () => undefined,
      suRiga: (f) => { riga = f },
      suUscita: (f) => { uscita = f }
    }
  }
  const lav = creaLavoratoreAiuto({ cartella: dati, avvia, log: (r) => log.push(r), pulisciOgniMs: 0, verificaRisorse: { esiste: async () => true, nelPath: async () => true, variabile: () => true } })
  // Come in `colleghiRete`: la fonte dell'aiuto dell'Aiutante porta `chiediCredenziali` sul collegamento fra i PC.
  const fonte: FonteAiuto = {
    modo: () => 'dedicato',
    servizio: async (_p, corpo) => { const e = lav.avvia(corpo ?? {}); if (!e.ok) throw new Error(e.motivo); return { fatto: true } },
    nomePc: () => 'torre',
    chiediCredenziali: credenzialiPerAiutante(chiama)
  }
  const sorg = join(radice, `sorg-${nome}`)
  execFileSync('git', ['init', '-b', 'main', sorg])
  writeFileSync(join(sorg, 'a.txt'), 'a\n')
  g(sorg, 'add', '.')
  g(sorg, 'commit', '-m', 'inizio')
  const base = g(sorg, 'rev-parse', 'HEAD').trim()
  const bundle = join(radice, `${nome}.bundle`)
  g(sorg, 'bundle', 'create', bundle, 'main')
  expect(lav.pezzo({ lavoro: LAVORO, n: 0, totale: 1, dati: readFileSync(bundle).toString('base64') })).toMatchObject({ ok: true })
  const corpo = { lavoro: LAVORO, progetto: 'p', ramoBase: 'main', base, prompt: 'lavora', sistema: '', modello: 'sonnet', strumenti: ['Read'], ruolo: 'sviluppatore', descrizione: 'prova', risorse: [{ tipo: 'credenziale', valore: 'nas', perche: 'copiare', indispensabile: false }], segreti: { nas: 'inventato-dal-chiamante' } }
  const avvio = await rispondiAiuto({ metodo: 'POST', percorso: '/api/aiuto/avvia', corpo, dispositivo: 'pc:pc-torre' }, fonte)
  for (let i = 0; i < 400 && lav.stato(LAVORO)?.stato !== 'finito' && lav.stato(LAVORO)?.stato !== 'fallito'; i++) await new Promise((ok) => setTimeout(ok, 50))
  return { lav, avvio, avviati, log, dati }
}

describe('credenziali di rete sull’Aiutante', () => {
  it('le chiede al PC che ha affidato il lavoro e il valore finisce solo nell’ambiente dello specialista', async () => {
    const richieste: Array<{ pc: string; percorso: string; corpo: Record<string, unknown> }> = []
    const sulCollegamento: string[] = []
    const { lav, avvio, avviati, log, dati } = await eseguiLavoro('ok', async (pc, percorso, corpo) => {
      richieste.push({ pc, percorso, corpo })
      // La torre risponde con `servi` (stessa regola del programma): solo per quel lavoro, solo a quel PC.
      const s = await servi({ pcId: 'pc-aiutante', corpo, deposito, dichiarate: (l) => (l === LAVORO ? { pcId: 'pc-aiutante', nomi: ['nas'] } : undefined) })
      sulCollegamento.push(JSON.stringify(s))
      return s
    })
    expect(avvio?.stato).toBe(200)
    expect(richieste).toHaveLength(1)
    expect(richieste[0]!.pc).toBe('pc-torre')
    expect(richieste[0]!.percorso).toBe('/api/aiuto/credenziali')
    expect(richieste[0]!.corpo.lavoro).toBe(LAVORO)
    expect(richieste[0]!.corpo.nomi).toEqual(['nas'])
    expect(lav.stato(LAVORO)?.stato).toBe('finito')
    expect(avviati).toHaveLength(1)
    expect(avviati[0]!.env.SD_CRED_NAS).toBe(SEGRETO)
    expect(JSON.stringify(avviati[0]!.env)).not.toContain('inventato-dal-chiamante')
    // Il valore non è mai altrove: collegamento, argomenti, stato, log, disco.
    expect(sulCollegamento.join('')).not.toContain(SEGRETO)
    expect(JSON.stringify(richieste)).not.toContain(SEGRETO)
    expect(avviati[0]!.args.join('\n')).not.toContain(SEGRETO)
    expect(JSON.stringify(lav.stato(LAVORO))).not.toContain(SEGRETO)
    expect(log.join('\n')).not.toContain(SEGRETO)
    for (const f of readdirSync(dati)) if (f.endsWith('.json')) expect(readFileSync(join(dati, f), 'utf8')).not.toContain(SEGRETO)
    expect(JSON.stringify(avvio)).not.toContain(SEGRETO)
  }, 60_000)

  it('se il PC che ha affidato rifiuta, il lavoro prosegue senza credenziale e senza valori in giro', async () => {
    const { lav, avviati, log } = await eseguiLavoro('rifiuto', async () => { throw new Error('rifiutata') })
    expect(lav.stato(LAVORO)?.stato).toBe('finito')
    expect(avviati).toHaveLength(1)
    expect(avviati[0]!.env.SD_CRED_NAS).toBeUndefined()
    expect(avviati[0]!.args.join('\n')).toMatch(/credenziale/u)
    expect(avviati[0]!.args.join('\n')).not.toContain(SEGRETO)
    expect(log.join('\n')).not.toContain(SEGRETO)
  }, 60_000)

  it('la torre non serve il lavoro di un altro PC, né nomi non dichiarati', async () => {
    const corpo = { lavoro: LAVORO, nomi: ['nas'], chiave: 'AAAA' }
    const dichiarate = (l: string) => (l === LAVORO ? { pcId: 'pc-aiutante', nomi: ['nas'] } : undefined)
    await expect(servi({ pcId: 'pc-estraneo', corpo, deposito, dichiarate })).rejects.toThrow(/non è stato affidato/u)
    await expect(servi({ pcId: 'pc-aiutante', corpo: { ...corpo, lavoro: 'r0000000000ff' }, deposito, dichiarate })).rejects.toThrow(/non ha affidato/u)
    await expect(servi({ pcId: 'pc-aiutante', corpo: { ...corpo, nomi: ['altra'] }, deposito, dichiarate })).rejects.toThrow(/non dichiara/u)
  })

  it('l’Aiutante le collega davvero: la fonte dell’aiuto di `colleghiRete` porta `chiediCredenziali` sul collegamento fra i PC', () => {
    const rete = readFileSync(join(__dirname, '..', '..', 'src', 'aiutante', 'rete.ts'), 'utf8')
    expect(rete).toMatch(/import \{ chiedi \} from '\.\.\/main\/aiuto-credenziali'/u)
    expect(rete).toMatch(/chiediCredenziali: credenzialiPerAiutante\(\(pc, percorso, corpo\) => remoto\.chiama\(pc, percorso, corpo\)\)/u)
    expect(rete).toMatch(/alPcCheAffido: \(richiesta\) => chiama\(r\.daPc, '\/api\/aiuto\/credenziali'/u)
  })
})
