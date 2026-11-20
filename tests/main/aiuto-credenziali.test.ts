import { describe, it, expect, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { creaLavoratoreAiuto } from '../../src/autopilot-host/aiuto-lavoratore'
import type { AvviaProcesso } from '../../src/autopilot-host/orchestratore'
import { cancellaSicura } from '../../src/shared/cancella-sicura'
import { ambienteSpecialista, oscura, variabileCredenziale } from '../../src/shared/aiuto-credenziali'
import { ricavaRisorse, risorseValide, sezioneRisorse, verificaRisorse, type Risorsa } from '../../src/shared/aiuto-risorse'
import { chiedi, creaDepositoCredenziali, servi } from '../../src/main/aiuto-credenziali'
import { rispondiAiuto, type FonteAiuto } from '../../src/main/rotte-aiuto'

/**
 * 20/11 (k-166n4): un lavoro affidato a un altro PC riceve, su richiesta, le credenziali di rete che
 * dichiara per nome. Niente valori in chiaro su disco, nei log, nel prompt, nelle risorse; l'ambiente
 * dello specialista ospitato è filtrato; chi non è un PC riconosciuto non ne ottiene.
 */
const radice = mkdtempSync(join(tmpdir(), 'aiuto-cred-'))
afterAll(() => { try { cancellaSicura(radice, { dentro: [tmpdir()] }) } catch { /* Windows tiene i file un attimo */ } })

const SEGRETO = 'tok-SEGRETISSIMO-12345'
const ALTRO = 'altro-SEGRETO-ospite-999'
const maestra = randomBytes(32)
const g = (cwd: string, ...args: string[]): string => execFileSync('git', ['-c', 'user.name=Prova', '-c', 'user.email=prova@example.invalid', ...args], { cwd, encoding: 'utf8' })

describe('la cassaforte delle credenziali di rete', () => {
  it('il file è cifrato (nessun valore in chiaro), l’elenco non porta i valori, chiusa non si legge', async () => {
    const file = join(radice, 'dep', 'credenziali-rete.cifrato')
    let aperta: Buffer | undefined = maestra
    const dep = creaDepositoCredenziali({ file, maestra: () => aperta })
    expect(await dep.aggiungi({ nome: 'nas', tipo: 'accesso-pc', valore: SEGRETO, serveA: ['\\\\nas\\condivisa'] })).toEqual({ ok: true })
    expect(await dep.aggiungi({ nome: 'x', tipo: 'boh', valore: 'v' })).toMatchObject({ ok: false })
    expect(readFileSync(file, 'utf8')).not.toContain(SEGRETO)
    expect(readFileSync(file).includes(Buffer.from(SEGRETO))).toBe(false)
    expect(JSON.stringify(await dep.elenco())).not.toContain(SEGRETO)
    expect(await dep.elenco()).toEqual([{ nome: 'nas', tipo: 'accesso-pc', serveA: ['\\\\nas\\condivisa'] }])
    expect(await dep.valori(['nas', 'altra'])).toEqual({ nas: SEGRETO })
    aperta = undefined
    expect(await dep.valori(['nas'])).toEqual({})
    expect((await dep.aggiungi({ nome: 'y', tipo: 'chiave-ssh', valore: 'k' })).ok).toBe(false)
    aperta = randomBytes(32) // un’altra maestra: non apre
    expect(await dep.valori(['nas'])).toEqual({})
  })
})

describe('chi ha affidato il lavoro risponde solo a chi deve', () => {
  const dep = creaDepositoCredenziali({ file: join(radice, 'serv', 'c.cifrato'), maestra: () => maestra })
  const dichiarate = (lavoro: string): { pcId: string; nomi: string[] } | undefined => (lavoro === 'r000000000001' ? { pcId: 'pc-aiuto', nomi: ['nas'] } : undefined)
  const fonte: FonteAiuto = {
    modo: () => 'dedicato',
    servizio: async () => ({}),
    credenziali: ({ pcId, corpo }) => servi({ pcId, corpo, deposito: dep, dichiarate })
  }
  const conferma = async (): Promise<void> => { await dep.aggiungi({ nome: 'nas', tipo: 'accesso-pc', valore: SEGRETO, serveA: [] }); await dep.aggiungi({ nome: 'altra', tipo: 'token-servizio', valore: ALTRO, serveA: [] }) }

  it('un PC riconosciuto riceve il valore cifrato in transito e lo apre solo lui', async () => {
    await conferma()
    const vistoSulCollegamento: string[] = []
    const alPc = async (richiesta: unknown): Promise<unknown> => {
      const e = await rispondiAiuto({ metodo: 'POST', percorso: '/api/aiuto/credenziali', corpo: richiesta, dispositivo: 'pc:pc-aiuto' }, fonte)
      vistoSulCollegamento.push(JSON.stringify(e))
      expect(e?.stato).toBe(200)
      return e?.corpo
    }
    const avute = await chiedi({ lavoro: 'r000000000001', nomi: ['nas'], alPcCheAffido: alPc })
    expect(avute).toEqual({ nas: SEGRETO })
    expect(vistoSulCollegamento.join('')).not.toContain(SEGRETO)
    // Una risposta intercettata non si apre con un’altra chiave né per un altro lavoro.
    let risposta: unknown
    await chiedi({ lavoro: 'r000000000001', nomi: ['nas'], alPcCheAffido: async (r) => (risposta = await alPc(r)) })
    expect(await chiedi({ lavoro: 'r000000000001', nomi: ['nas'], alPcCheAffido: async () => risposta })).toEqual({})
  })

  it('richiesta da un PC non autenticato (o da un telefono, o senza dispositivo) → rifiutata', async () => {
    await conferma()
    const corpo = { lavoro: 'r000000000001', nomi: ['nas'], chiave: 'AAAA' }
    for (const dispositivo of [undefined, 'locale', 'pc', 'pc:', 'pc:tel:xyz', 'telefono-1']) {
      const e = await rispondiAiuto({ metodo: 'POST', percorso: '/api/aiuto/credenziali', corpo, ...(dispositivo !== undefined ? { dispositivo } : {}) }, fonte)
      expect(e?.stato, String(dispositivo)).toBe(403)
      expect(JSON.stringify(e)).not.toContain(SEGRETO)
    }
    expect((await rispondiAiuto({ metodo: 'GET', percorso: '/api/aiuto/credenziali', corpo: {}, dispositivo: 'pc:pc-aiuto' }, fonte))?.stato).toBe(405)
  })

  it('un PC riconosciuto ma diverso da quello del lavoro, un lavoro sconosciuto o un nome non dichiarato → rifiutati', async () => {
    await conferma()
    const prova = (lavoro: string, nomi: string[], pc: string) => chiedi({
      lavoro, nomi,
      alPcCheAffido: async (r) => (await rispondiAiuto({ metodo: 'POST', percorso: '/api/aiuto/credenziali', corpo: r, dispositivo: `pc:${pc}` }, fonte))?.corpo
    })
    expect(await prova('r000000000001', ['nas'], 'pc-estraneo')).toEqual({})
    expect(await prova('r0000000000ff', ['nas'], 'pc-aiuto')).toEqual({})
    expect(await prova('r000000000001', ['altra'], 'pc-aiuto')).toEqual({})
    expect(await prova('r000000000001', ['nas', 'altra'], 'pc-aiuto')).toEqual({})
  })

  it('con la cassaforte chiusa su questo PC non si danno credenziali', async () => {
    const chiusa = creaDepositoCredenziali({ file: join(radice, 'serv', 'c.cifrato'), maestra: () => undefined })
    await expect(servi({ pcId: 'pc-aiuto', corpo: { lavoro: 'r000000000001', nomi: ['nas'], chiave: 'AAAA' }, deposito: chiusa, dichiarate })).rejects.toThrow(/chiusa/u)
  })

  it('su un PC con la cassaforte aperta le legge da lì, senza chiamare nessuno', async () => {
    await conferma()
    let chiamate = 0
    expect(await chiedi({ lavoro: 'r000000000001', nomi: ['nas'], deposito: dep, alPcCheAffido: async () => { chiamate++; return {} } })).toEqual({ nas: SEGRETO })
    expect(chiamate).toBe(0)
  })
})

describe('le risorse: solo il nome della credenziale', () => {
  it('«credenziale:nome» nel messaggio diventa una risorsa con il solo nome; la sezione non ha mai il valore', async () => {
    const prompt = `Copia i file su \\\\nas\\condivisa. Serve credenziale:nas e credenziale:chiave-ssh-build.`
    const risorse = ricavaRisorse(prompt)
    expect(risorse.filter((r) => r.tipo === 'credenziale').map((r) => r.valore).sort()).toEqual(['chiave-ssh-build', 'nas'])
    const ver = await verificaRisorse(risorse.filter((r) => r.tipo === 'credenziale'), { esiste: async () => true, nelPath: async () => true, variabile: () => false, credenziale: (n) => n === 'nas' })
    expect(ver.map((v) => v.esito)).toEqual(['ok', 'manca'])
    const sezione = sezioneRisorse(ver)
    expect(sezione).toContain(variabileCredenziale('nas'))
    expect(sezione).not.toContain(SEGRETO)
    // Un nome non valido (o un valore al posto del nome) non passa.
    expect(risorseValide([{ tipo: 'credenziale', valore: 'ha spazi e ; simboli', perche: '' }, { tipo: 'credenziale', valore: 'ok-1', perche: '' }]).map((r) => r.valore)).toEqual(['ok-1'])
  })

  it('oscura toglie il valore (anche a righe) da un testo', () => {
    const chiave = '-----BEGIN KEY-----\nabcdefghijkl\n-----END KEY-----'
    expect(oscura(`ho usato ${SEGRETO} e ${chiave}`, [SEGRETO, chiave])).not.toMatch(/SEGRETISSIMO|abcdefghijkl/u)
  })
})

describe('l’ambiente dello specialista ospitato', () => {
  const processo = { PATH: '/bin', SystemRoot: 'C:\\Windows', TEMP: 'C:\\Temp', USERPROFILE: 'C:\\U', APPDATA: 'C:\\A', ANTHROPIC_API_KEY: 'chiave-claude', GITHUB_TOKEN: ALTRO, AWS_SECRET_ACCESS_KEY: ALTRO, SIERRADECK_HOOK_X: '1', SD_CRED_FINTA: ALTRO, DB_PASSWORD: ALTRO, PER_IL_LAVORO: 'dichiarata' }

  it('solo quelle di base + quelle dichiarate + le credenziali date: nient’altro', () => {
    const env = ambienteSpecialista(processo, ['PER_IL_LAVORO'], { nas: SEGRETO })
    expect(Object.keys(env).sort()).toEqual(['ANTHROPIC_API_KEY', 'APPDATA', 'PATH', 'PER_IL_LAVORO', 'SD_CRED_NAS', 'SystemRoot', 'TEMP', 'USERPROFILE'].sort())
    expect(JSON.stringify(env)).not.toContain(ALTRO)
    expect(env.SD_CRED_NAS).toBe(SEGRETO)
  })
  it('senza dichiarazioni niente di extra', () => {
    expect(ambienteSpecialista(processo)).not.toHaveProperty('PER_IL_LAVORO')
    expect(ambienteSpecialista(processo)).not.toHaveProperty('GITHUB_TOKEN')
  })
})

describe('il lavoratore: la credenziale dichiarata arriva solo a quel compito', () => {
  /** Un progetto vero in un bundle, arrivato in un pezzo, e due lavori con specialista finto che registra l’ambiente. */
  async function prova(risorseDelLavoro: Risorsa[], suCredenziali: (nomi: string[]) => Promise<Record<string, string>>, id: string, dati: string, pre?: { avviati: Array<{ env: Record<string, string>; args: string[] }> }) {
    const avviati = pre?.avviati ?? []
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
    const lav = creaLavoratoreAiuto({
      cartella: dati, avvia, log: (r) => log.push(r), pulisciOgniMs: 0,
      verificaRisorse: { esiste: async () => true, nelPath: async () => true, variabile: () => true },
      credenziali: async (r) => suCredenziali(r.nomi)
    })
    const sorg = join(radice, `sorg-${id}`)
    execFileSync('git', ['init', '-b', 'main', sorg])
    writeFileSync(join(sorg, 'a.txt'), 'a\n')
    g(sorg, 'add', '.')
    g(sorg, 'commit', '-m', 'inizio')
    const base = g(sorg, 'rev-parse', 'HEAD').trim()
    const bundle = join(radice, `${id}.bundle`)
    g(sorg, 'bundle', 'create', bundle, 'main')
    expect(lav.pezzo({ lavoro: id, n: 0, totale: 1, dati: readFileSync(bundle).toString('base64') })).toMatchObject({ ok: true })
    expect(lav.avvia({ lavoro: id, progetto: 'p', ramoBase: 'main', base, prompt: 'lavora', sistema: '', modello: 'sonnet', strumenti: ['Read'], ruolo: 'sviluppatore', descrizione: 'prova', risorse: risorseDelLavoro })).toEqual({ ok: true })
    for (let i = 0; i < 400 && lav.stato(id)?.stato !== 'finito' && lav.stato(id)?.stato !== 'fallito'; i++) await new Promise((ok) => setTimeout(ok, 50))
    return { lav, avviati, log }
  }
  const processoOspite = { ...process.env }

  it('l’env ha solo il necessario e la credenziale dichiarata; il riepilogo, lo stato, il log e i file non hanno il valore; poi si toglie', async () => {
    process.env.TOKEN_DEL_PC_OSPITE = ALTRO
    try {
      const dati = join(radice, 'dati-1')
      let richiesti: string[] = []
      const { lav, avviati, log } = await prova(
        [{ tipo: 'credenziale', valore: 'nas', perche: 'copiare', indispensabile: true }, { tipo: 'variabile', valore: 'PATH', perche: 'serve', indispensabile: false }],
        async (nomi) => { richiesti = nomi; return { nas: SEGRETO } }, 'r00000000aaa1', dati
      )
      expect(richiesti).toEqual(['nas'])
      expect(lav.stato('r00000000aaa1')?.stato).toBe('finito')
      expect(avviati).toHaveLength(1)
      const env = avviati[0]!.env
      expect(env.SD_CRED_NAS).toBe(SEGRETO)
      expect(env).not.toHaveProperty('TOKEN_DEL_PC_OSPITE')
      expect(JSON.stringify(env)).not.toContain(ALTRO)
      // Mai il valore: né negli argomenti (prompt di sistema), né nello stato, né nel log, né su disco.
      expect(avviati[0]!.args.join('\n')).not.toContain(SEGRETO)
      expect(JSON.stringify(lav.stato('r00000000aaa1'))).not.toContain(SEGRETO)
      expect(log.join('\n')).not.toContain(SEGRETO)
      expect(readFileSync(join(dati, 'lavori.json'), 'utf8')).not.toContain(SEGRETO)
      for (const f of readdirSync(dati)) if (f.endsWith('.json')) expect(readFileSync(join(dati, f), 'utf8')).not.toContain(SEGRETO)
      expect(avviati[0]!.args.join('\n')).toContain(variabileCredenziale('nas'))
    } finally { delete process.env.TOKEN_DEL_PC_OSPITE }
  }, 60_000)

  it('un altro compito, che non la dichiara, non la riceve (e il processo del programma non la conserva)', async () => {
    const dati = join(radice, 'dati-2')
    const avviati: Array<{ env: Record<string, string>; args: string[] }> = []
    const { lav } = await prova([{ tipo: 'credenziale', valore: 'nas', perche: 'copiare', indispensabile: true }], async () => ({ nas: SEGRETO }), 'r00000000bbb1', dati, { avviati })
    expect(lav.stato('r00000000bbb1')?.stato).toBe('finito')
    await prova([], async () => { throw new Error('non doveva chiedere niente') }, 'r00000000bbb2', join(radice, 'dati-3'), { avviati })
    expect(avviati).toHaveLength(2)
    expect(avviati[0]!.env.SD_CRED_NAS).toBe(SEGRETO)
    expect(avviati[1]!.env).not.toHaveProperty('SD_CRED_NAS')
    expect(JSON.stringify(avviati[1]!.env)).not.toContain(SEGRETO)
    expect(process.env).not.toHaveProperty('SD_CRED_NAS')
    expect(Object.keys(processoOspite).includes('SD_CRED_NAS')).toBe(false)
  }, 60_000)

  it('credenziale dichiarata ma non ottenuta: il lavoro non parte, con causa «risorsa» e senza valori', async () => {
    const dati = join(radice, 'dati-4')
    const avviati: Array<{ env: Record<string, string>; args: string[] }> = []
    const { lav } = await prova([{ tipo: 'credenziale', valore: 'nas', perche: 'copiare', indispensabile: true }], async () => ({}), 'r00000000ccc1', dati, { avviati })
    expect(avviati).toHaveLength(0)
    expect(lav.stato('r00000000ccc1')).toMatchObject({ stato: 'fallito', causa: 'risorsa' })
  }, 60_000)
})
