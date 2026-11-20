import { describe, it, expect, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriSincronia } from '../../src/main/cassaforte/sincronia'
import { magazzinoInMemoria } from '../../src/main/cassaforte/magazzino'
import { archivioInMemoria } from '../../src/main/cassaforte/archivio'
import { apriRegistroProgetti } from '../../src/main/progetti/registro'
import { creaLavoro } from '../../src/main/cassaforte/lavoro-in-corso'
import { collegaCredenziali, creaDepositoCredenziali } from '../../src/main/aiuto-credenziali'
import { rispondiAiuto, type FonteAiuto } from '../../src/main/rotte-aiuto'
import { creaLavoratoreAiuto } from '../../src/autopilot-host/aiuto-lavoratore'
import type { AvviaProcesso } from '../../src/autopilot-host/orchestratore'

/**
 * 20/11 (k-166n7): le credenziali di rete collegate al programma vero. Il deposito si apre con la
 * cassaforte (maestra della sincronia), la rotta `/api/aiuto/credenziali` risponde solo a un PC
 * riconosciuto per un lavoro affidato da qui, e il lavoratore dell'altro PC le mette solo nell'env
 * dello specialista: il valore non è mai nel log, nello stato, sul disco né sul collegamento.
 */
const radice = mkdtempSync(join(tmpdir(), 'aiuto-cred-coll-'))
afterAll(() => { try { rmSync(radice, { recursive: true, force: true }) } catch { /* Windows tiene i file un attimo */ } })

const SEGRETO = 'tok-SEGRETISSIMO-collegato-777'
const LAVORO = 'r0000000000c1'
const g = (cwd: string, ...args: string[]): string => execFileSync('git', ['-c', 'user.name=Prova', '-c', 'user.email=prova@example.invalid', ...args], { cwd, encoding: 'utf8' })

/** Una cassaforte vera (sincronia) con un Drive in memoria, sbloccata con una passphrase di prova. */
async function cassaforteDiProva(nome: string, sbloccata = true) {
  const dati = join(radice, nome, 'dati')
  const claude = join(radice, nome, 'claude')
  mkdirSync(dati, { recursive: true })
  mkdirSync(join(claude, 'projects'), { recursive: true })
  const reg = apriRegistroProgetti(dati)
  const mag = magazzinoInMemoria()
  const arch = archivioInMemoria()
  const sincronia = apriSincronia({
    dati, radiceClaude: claude, driveConnesso: () => true, magazzino: () => mag, archivio: () => arch,
    lavoro: creaLavoro(), pcId: () => nome, cartellaProgetti: () => join(radice, nome, 'Progetti'),
    registroProgetti: { leggi: () => reg.leggi(), scrivi: (r) => reg.scrivi(r) }
  })
  if (sbloccata) expect((await sincronia.creaPassphrase('passphrase-di-prova-1')).ok).toBe(true)
  return { dati, sincronia }
}

describe('credenziali di rete collegate', () => {
  it('il deposito si apre con la maestra della cassaforte: chiusa non serve, niente in chiaro su disco', async () => {
    const { dati, sincronia } = await cassaforteDiProva('torre-a')
    const file = join(dati, 'credenziali-rete.cifrato')
    const dep = creaDepositoCredenziali({ file, maestra: () => sincronia.maestraInMemoria() })
    expect(dep.aperto()).toBe(true)
    expect(await dep.aggiungi({ nome: 'nas', tipo: 'accesso-pc', valore: SEGRETO, serveA: [] })).toEqual({ ok: true })
    expect(readFileSync(file).includes(Buffer.from(SEGRETO))).toBe(false)
    expect(readFileSync(file, 'utf8')).not.toContain(SEGRETO)
    expect(await dep.valori(['nas'])).toEqual({ nas: SEGRETO })
    sincronia.blocca()
    expect(dep.aperto()).toBe(false)
    expect(await dep.valori(['nas'])).toEqual({})
  })

  it('rotta attiva solo per richieste autorizzate; il lavoratore riceve la credenziale nell’env e il valore non esce', async () => {
    // Il PC che ha affidato il lavoro: cassaforte aperta, deposito, e sa quali credenziali il lavoro dichiara e a chi è affidato.
    const torre = await cassaforteDiProva('torre-b')
    const depTorre = creaDepositoCredenziali({ file: join(torre.dati, 'credenziali-rete.cifrato'), maestra: () => torre.sincronia.maestraInMemoria() })
    await depTorre.aggiungi({ nome: 'nas', tipo: 'accesso-pc', valore: SEGRETO, serveA: [] })
    await depTorre.aggiungi({ nome: 'altra', tipo: 'token-servizio', valore: 'altro-valore-riservato', serveA: [] })
    const sulCollegamento: string[] = []
    const fonteTorre: FonteAiuto = {
      modo: () => 'dedicato',
      servizio: async () => ({}),
      ...collegaCredenziali({
        deposito: depTorre,
        dichiarate: (l) => (l === LAVORO ? { pcId: 'pc-ospite', nomi: ['nas'] } : undefined),
        chiama: async () => { throw new Error('la torre non chiede a nessuno') }
      })
    }

    // Autorizzazione della rotta (stessa regola delle altre rotte aiuto: PC riconosciuto, lavoro affidato da qui).
    const corpoFinto = { lavoro: LAVORO, nomi: ['nas'], chiave: 'AAAA' }
    for (const dispositivo of [undefined, 'locale', 'pc:', 'pc:tel:xyz', 'telefono-1']) {
      const e = await rispondiAiuto({ metodo: 'POST', percorso: '/api/aiuto/credenziali', corpo: corpoFinto, ...(dispositivo !== undefined ? { dispositivo } : {}) }, fonteTorre)
      expect(e?.stato, String(dispositivo)).toBe(403)
    }
    expect((await rispondiAiuto({ metodo: 'GET', percorso: '/api/aiuto/credenziali', corpo: {}, dispositivo: 'pc:pc-ospite' }, fonteTorre))?.stato).toBe(405)
    expect((await rispondiAiuto({ metodo: 'POST', percorso: '/api/aiuto/credenziali', corpo: corpoFinto, dispositivo: 'pc:pc-estraneo' }, fonteTorre))?.stato).toBe(409)
    expect((await rispondiAiuto({ metodo: 'POST', percorso: '/api/aiuto/credenziali', corpo: corpoFinto, dispositivo: 'pc:pc-ospite' }, undefined))?.stato).toBe(404)

    // Il PC che aiuta: lavoratore vero, specialista finto che registra l'ambiente; niente cassaforte propria (chiusa).
    const dati = join(radice, 'ospite')
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
    const chiusa = creaDepositoCredenziali({ file: join(dati, 'credenziali-rete.cifrato'), maestra: () => undefined })
    const fonteOspite: FonteAiuto = {
      modo: () => 'dedicato',
      servizio: async (percorso, corpo) => { expect(percorso).toBe('/aiuto/avvia'); const e = lav.avvia(corpo ?? {}); if (!e.ok) throw new Error(e.motivo); return { fatto: true } },
      nomePc: () => 'torre',
      ...collegaCredenziali({
        deposito: chiusa,
        dichiarate: () => undefined,
        // Il collegamento fra i due PC: la richiesta arriva alla torre con l'id firmato dell'ospite.
        chiama: async (pc, percorso, corpo) => {
          expect(pc).toBe('pc-torre')
          const e = await rispondiAiuto({ metodo: 'POST', percorso, corpo, dispositivo: 'pc:pc-ospite' }, fonteTorre)
          sulCollegamento.push(JSON.stringify(e))
          if (e?.stato !== 200) throw new Error('rifiutata')
          return e.corpo
        }
      })
    }

    const sorg = join(radice, 'sorg')
    execFileSync('git', ['init', '-b', 'main', sorg])
    writeFileSync(join(sorg, 'a.txt'), 'a\n')
    g(sorg, 'add', '.')
    g(sorg, 'commit', '-m', 'inizio')
    const base = g(sorg, 'rev-parse', 'HEAD').trim()
    const bundle = join(radice, 'p.bundle')
    g(sorg, 'bundle', 'create', bundle, 'main')
    expect(lav.pezzo({ lavoro: LAVORO, n: 0, totale: 1, dati: readFileSync(bundle).toString('base64') })).toMatchObject({ ok: true })

    // Un corpo ostile con dei «segreti» inventati dal chiamante: si scartano, valgono solo quelli chiesti da questo PC.
    const corpo = { lavoro: LAVORO, progetto: 'p', ramoBase: 'main', base, prompt: 'lavora', sistema: '', modello: 'sonnet', strumenti: ['Read'], ruolo: 'sviluppatore', descrizione: 'prova', risorse: [{ tipo: 'credenziale', valore: 'nas', perche: 'copiare', indispensabile: true }], segreti: { nas: 'inventato-dal-chiamante' } }
    const avvio = await rispondiAiuto({ metodo: 'POST', percorso: '/api/aiuto/avvia', corpo, dispositivo: 'pc:pc-torre' }, fonteOspite)
    expect(avvio?.stato).toBe(200)
    for (let i = 0; i < 400 && lav.stato(LAVORO)?.stato !== 'finito' && lav.stato(LAVORO)?.stato !== 'fallito'; i++) await new Promise((ok) => setTimeout(ok, 50))

    expect(lav.stato(LAVORO)?.stato).toBe('finito')
    expect(avviati).toHaveLength(1)
    expect(avviati[0]!.env.SD_CRED_NAS).toBe(SEGRETO)
    expect(JSON.stringify(avviati[0]!.env)).not.toContain('inventato-dal-chiamante')
    // Nessun valore: né sul collegamento fra i PC, né negli argomenti, né nello stato/riepilogo, né nel log, né su disco.
    expect(sulCollegamento).toHaveLength(1)
    expect(sulCollegamento.join('')).not.toContain(SEGRETO)
    expect(avviati[0]!.args.join('\n')).not.toContain(SEGRETO)
    expect(JSON.stringify(lav.stato(LAVORO))).not.toContain(SEGRETO)
    expect(log.join('\n')).not.toContain(SEGRETO)
    for (const f of readdirSync(dati)) if (f.endsWith('.json')) expect(readFileSync(join(dati, f), 'utf8')).not.toContain(SEGRETO)
    expect(JSON.stringify(avvio)).not.toContain(SEGRETO)
  }, 60_000)

  it('il programma vero le collega davvero: deposito sulla maestra della cassaforte e rotte nella fonte dell’aiuto', () => {
    const indice = readFileSync(join(__dirname, '..', '..', 'src', 'main', 'index.ts'), 'utf8')
    expect(indice).toMatch(/creaDepositoCredenziali\(\{[^}]*maestraInMemoria\(\)/u)
    expect(indice).toMatch(/collegaCredenziali\(\{ deposito: depositoCredenziali, dichiarate: [^}]*spedizioniere\.dichiarate/u)
    expect(indice).toMatch(/aiuto: \{ \.\.\.credenzialiAiuto,/u)
  })
})
