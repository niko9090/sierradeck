// Misura delle chiamate al Drive e del primo giro di un PC nuovo (0.81.0), con un Drive FINTO:
// lo stesso adattatore di Google Drive del programma (`creaArchivioDrive`), che parla con un
// server in memoria che risponde come l'API v3 (appDataFolder). Niente account vero.
//
//   $env:MISURA_CHAT = "<cartella projects di Claude Code da leggere>"   (solo lettura)
//   $env:MISURA_LATENZA_MS = "120"                                        (attesa finta per richiesta)
//   npx vitest run --config scripts/misure/vitest.misure.config.ts
//
// Le cartelle vere sono protette dal setup dei test: una scrittura fuori dalla cartella finta
// o dal progetto fa fallire la misura. Gli esiti vanno in note/misure-drive/esiti.jsonl.
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join, resolve } from 'node:path'
import { test } from 'vitest'
import { creaArchivioDrive } from '../../src/main/cassaforte/google-drive'
import { radiciDaSincronizzare } from '../../src/main/cassaforte/raccolta'
import { salvaIncrementale, ripristinaIncrementale, manifestoVuoto } from '../../src/main/cassaforte/incrementale'
import { daComprimere } from '../../src/main/cassaforte/compressione'

const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

/** Un Drive in memoria che risponde alle stesse richieste dell'adattatore, e le conta per tipo. */
function driveFinto(latenzaMs: number): { fetch: typeof fetch; conta: Map<string, number>; byteSu: () => number; byteGiu: () => number; azzera: () => void } {
  const file = new Map<string, { nome: string; blocco: Buffer; versione: number }>()
  const conta = new Map<string, number>()
  let su = 0
  let giu = 0
  let prossimo = 0
  const segna = (t: string): void => { conta.set(t, (conta.get(t) ?? 0) + 1) }
  const json = (o: unknown): Response => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } })
  const f = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> => {
    if (latenzaMs > 0) await new Promise((r) => setTimeout(r, latenzaMs))
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const metodo = init?.method ?? 'GET'
    const base = `${url.origin}${url.pathname}`
    const id = /\/files\/([^/?]+)$/.exec(url.pathname)?.[1]
    if (metodo === 'GET' && base === `${API}/files`) {
      const q = url.searchParams.get('q')
      if (q !== null) {
        segna('ricerca')
        const nome = /^name='(.*)'$/.exec(q)?.[1]
        const trovato = [...file.entries()].find(([, v]) => v.nome === nome)
        return json({ files: trovato === undefined ? [] : [{ id: trovato[0] }] })
      }
      segna('elenco')
      const tutti = [...file.entries()]
      const da = Number(url.searchParams.get('pageToken') ?? '0')
      const pagina = tutti.slice(da, da + 1000)
      return json({
        files: pagina.map(([i, v]) => ({ id: i, name: v.nome, version: String(v.versione), size: String(v.blocco.length) })),
        ...(da + 1000 < tutti.length ? { nextPageToken: String(da + 1000) } : {})
      })
    }
    if (metodo === 'GET' && id !== undefined && url.searchParams.get('alt') === 'media') {
      segna('scaricamento')
      const v = file.get(id)
      if (v === undefined) return new Response('{}', { status: 404 })
      giu += v.blocco.length
      return new Response(new Uint8Array(v.blocco), { status: 200 })
    }
    if (metodo === 'POST' && base === `${API}/files`) {
      segna('creazione')
      const { name } = JSON.parse(String(init?.body)) as { name: string }
      prossimo += 1
      const nuovo = `f${prossimo}`
      file.set(nuovo, { nome: name, blocco: Buffer.alloc(0), versione: 1 })
      return json({ id: nuovo })
    }
    if (metodo === 'PATCH' && base.startsWith(`${UPLOAD}/files/`) && id !== undefined) {
      segna('scrittura')
      const v = file.get(id)
      if (v === undefined) return new Response('{}', { status: 404 })
      const corpo = Buffer.from(init?.body as Uint8Array)
      su += corpo.length
      file.set(id, { ...v, blocco: corpo, versione: v.versione + 1 })
      return json({ id })
    }
    if (metodo === 'DELETE' && id !== undefined) {
      segna('cancellazione')
      file.delete(id)
      return new Response(null, { status: 204 })
    }
    segna(`altro ${metodo} ${url.pathname}`)
    return new Response('{}', { status: 400 })
  }) as typeof fetch
  return { fetch: f, conta, byteSu: () => su, byteGiu: () => giu, azzera: () => { conta.clear(); su = 0; giu = 0 } }
}

test('chiamate al Drive e primo giro di un PC nuovo', async () => {
  const chat = process.env.MISURA_CHAT
  if (chat === undefined) throw new Error('MISURA_CHAT: la cartella projects da leggere')
  const latenza = Number(process.env.MISURA_LATENZA_MS ?? '0')
  const radice = resolve(__dirname, '..', '..', 'note', 'misure-drive')
  mkdirSync(radice, { recursive: true })
  const lavoro = mkdtempSync(join(radice, 'giro-'))

  // PC A: l'assetto minimo e le chat vere (lette, mai scritte).
  const datiA = join(lavoro, 'pc-a', 'SierraDeck')
  mkdirSync(datiA, { recursive: true })
  writeFileSync(join(datiA, 'workspaces.json'), JSON.stringify({ workspaces: [{ nome: 'Predefinito', perSlot: {} }] }))
  const claudeA = resolve(chat, '..')
  // PC nuovo: tutto vuoto.
  const datiB = join(lavoro, 'pc-b', 'SierraDeck')
  const claudeB = join(lavoro, 'pc-b', 'claude')
  mkdirSync(datiB, { recursive: true })
  mkdirSync(join(claudeB, 'projects'), { recursive: true })

  const maestra = randomBytes(32)
  const drive = driveFinto(latenza)
  const archivio = (): ReturnType<typeof creaArchivioDrive> => creaArchivioDrive({ token: () => Promise.resolve('finto'), fetch: drive.fetch })
  const esiti: Record<string, unknown> = { latenzaMs: latenza }
  const fotografa = (nome: string, t0: number, extra: Record<string, unknown>): void => {
    const richieste = Object.fromEntries(drive.conta)
    const totale = [...drive.conta.values()].reduce((a, b) => a + b, 0)
    esiti[nome] = { ms: Math.round(performance.now() - t0), richieste: totale, perTipo: richieste, suMB: +(drive.byteSu() / 1048576).toFixed(1), giuMB: +(drive.byteGiu() / 1048576).toFixed(1), ...extra }
    console.log(nome, JSON.stringify(esiti[nome]))
    drive.azzera()
  }

  // 1) Primo salvataggio di A, compresso come fra PC tutti ≥ 0.69.0.
  let t0 = performance.now()
  const s1 = await salvaIncrementale({ radici: radiciDaSincronizzare(datiA, claudeA), maestra, archivio: archivio(), manifestoPrec: manifestoVuoto(), adesso: new Date().toISOString(), comprimi: daComprimere })
  fotografa('primoSalvataggio', t0, { file: s1.caricati })

  // 2) Salvataggio automatico senza cambi (ogni 5 minuti sul PC vero).
  t0 = performance.now()
  await salvaIncrementale({ radici: radiciDaSincronizzare(datiA, claudeA), maestra, archivio: archivio(), manifestoPrec: s1.manifesto, adesso: new Date().toISOString(), comprimi: daComprimere })
  fotografa('salvataggioInvariato', t0, {})

  // 3) Primo giro di un PC nuovo: tutto giù in cartelle vuote (un archivio nuovo: nessun id ricordato).
  t0 = performance.now()
  const r1 = await ripristinaIncrementale({ radici: radiciDaSincronizzare(datiB, claudeB), maestra, archivio: archivio() })
  fotografa('primoGiroPcNuovo', t0, { scritti: r1.scritti, trovato: r1.trovato })

  // 4) Il giro dopo sul PC nuovo, senza cambi.
  t0 = performance.now()
  const r2 = await ripristinaIncrementale({ radici: radiciDaSincronizzare(datiB, claudeB), maestra, archivio: archivio(), ...(r1.manifesto !== undefined ? { manifestoPrec: r1.manifesto } : {}) })
  fotografa('ripristinoInvariato', t0, { scritti: r2.scritti, invariati: r2.invariati })

  appendFileSync(join(radice, 'esiti.jsonl'), JSON.stringify({ quando: new Date().toISOString(), ...esiti }) + '\n')
}, 3_600_000)
