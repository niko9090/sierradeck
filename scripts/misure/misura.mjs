// Misure della copia di prova (0.80.0), dalla radice del progetto, dopo `node scripts/misure/prepara.mjs`:
//   node scripts/misure/misura.mjs avvia <etichetta>  → avvia la copia; tempi d'avvio, memoria dopo 15 s, rotte, memoria dopo 60 s
//   node scripts/misure/misura.mjs apri               → 6 chat nuove (4 nel workspace corrente, 2 in un secondo), come dal telefono
//   node scripts/misure/misura.mjs rotte <etichetta>  → tempi delle rotte principali (5 giri) e memoria
//   node scripts/misure/misura.mjs ferma              → ferma la copia (solo i processi di questa cartella) e controlla le porte
// I risultati vanno anche in note/prova-080/misure.jsonl. La copia usa le porte 47670/47671 e DevTools 9363.
import { spawn, execFileSync } from 'node:child_process'
import { readFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'

const PROGETTO = process.cwd()
const RADICE = join(PROGETTO, 'note', 'prova-080')
const CHIAVE = readFileSync(join(RADICE, 'chiave.txt'), 'utf8').trim()
const PORTA = 47670
const DEBUG = 9363
const [, , cosa = 'avvia', etichetta = 'prima'] = process.argv
const pausa = (ms) => new Promise((r) => setTimeout(r, ms))
const scrivi = (o) => { appendFileSync(join(RADICE, 'misure.jsonl'), JSON.stringify({ etichetta, quando: new Date().toISOString(), ...o }) + '\n'); console.log(JSON.stringify(o)) }
const ps = (comando) => execFileSync('powershell.exe', ['-NoProfile', '-Command', comando], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

/** I processi della copia: l'albero sotto l'electron.exe lanciato da questa cartella. */
function albero() {
  const tutti = JSON.parse(ps('Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,PrivatePageCount,CommandLine | ConvertTo-Json -Compress').replace(/[\u0000-\u001f]/g, ' '))
  const ids = new Set(tutti.filter((p) => p.Name === 'electron.exe' && (p.CommandLine ?? '').includes(PROGETTO) && !(p.CommandLine ?? '').includes('--type=')).map((p) => p.ProcessId))
  for (let cresciuto = true; cresciuto;) { cresciuto = false; for (const p of tutti) if (ids.has(p.ParentProcessId) && !ids.has(p.ProcessId)) { ids.add(p.ProcessId); cresciuto = true } }
  return tutti.filter((p) => ids.has(p.ProcessId))
}
function memoria() {
  const tipo = (p) => {
    const c = p.CommandLine ?? ''
    if (p.Name !== 'electron.exe') return p.Name.replace(/\.exe$/, '')
    if (c.includes('autopilot-host')) return 'servizio'
    if (c.includes('pty-host')) return 'pty-host'
    return /--type=([a-z-]+)/.exec(c)?.[1] ?? 'main'
  }
  const voci = albero().map((p) => ({ tipo: tipo(p), mb: Math.round(Number(p.PrivatePageCount) / 1048576) }))
  const somma = (f) => voci.filter(f).reduce((a, v) => a + v.mb, 0)
  const programma = ['main', 'renderer', 'gpu-process', 'utility', 'pty-host']
  return {
    programmaMB: somma((v) => programma.includes(v.tipo)), servizioMB: somma((v) => v.tipo === 'servizio'),
    claudeMB: somma((v) => v.tipo === 'claude'), chat: voci.filter((v) => v.tipo === 'claude').length,
    perTipo: Object.fromEntries(programma.concat('servizio').map((t) => [t, somma((v) => v.tipo === t)]))
  }
}
async function chiama(metodo, percorso, corpo) {
  const t = performance.now()
  const r = await fetch(`http://127.0.0.1:${PORTA}${percorso}`, { method: metodo, headers: { 'x-sierradeck-chiave': CHIAVE, 'content-type': 'application/json' }, ...(corpo ? { body: JSON.stringify(corpo) } : {}) })
  const testo = await r.text()
  return { ms: Math.round(performance.now() - t), stato: r.status, kb: Math.round(testo.length / 1024), testo }
}
async function rotte() {
  const ws = JSON.parse((await chiama('GET', '/api/stato')).testo).workspace?.attivo ?? 'Predefinito'
  const elenco = [
    ['GET', '/api/stato'], ['GET', '/api/sessioni'], ['POST', '/api/panoramica', { workspace: ws }], ['POST', '/api/file/progetti', {}],
    ['POST', '/api/drive/pannello', {}], ['GET', '/api/drive/catalogo'], ['GET', '/api/salute'], ['GET', '/api/pc'],
    ['GET', '/api/consumi'], ['GET', '/api/domande'], ['GET', '/api/negozio'], ['GET', '/']
  ]
  const esiti = {}
  for (const [m, p, c] of elenco) {
    const giri = []
    for (let i = 0; i < 5; i += 1) { try { giri.push(await chiama(m, p, c)) } catch { giri.push({ ms: -1, stato: 0, kb: 0 }) } }
    const ms = giri.map((g) => g.ms).sort((a, b) => a - b)
    esiti[p] = { stato: giri[0].stato, kb: giri[0].kb, primoMs: giri[0].ms, medianaMs: ms[2], maxMs: ms[4] }
  }
  return esiti
}
async function valuta(espr) {
  const p = (await (await fetch(`http://127.0.0.1:${DEBUG}/json`)).json()).find((x) => x.type === 'page' && !x.url.startsWith('devtools'))
  const ws = new WebSocket(p.webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  const risposta = new Promise((r) => ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id === 1) r(m) }))
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: espr, returnByValue: true } }))
  const m = await risposta
  ws.close()
  return m.result?.result?.value
}

if (cosa === 'avvia') {
  const env = { ...process.env, SIERRADECK_PROVA: join(RADICE, 'dati'), CLAUDE_CONFIG_DIR: join(RADICE, 'claude') }
  delete env.ELECTRON_RUN_AS_NODE
  const t0 = Date.now()
  const figlio = spawn(join(PROGETTO, 'node_modules', 'electron', 'dist', 'electron.exe'), ['.', `--remote-debugging-port=${DEBUG}`], { cwd: PROGETTO, env, detached: true, stdio: 'ignore' })
  figlio.unref()
  let porta, interfaccia
  for (let i = 0; i < 600 && interfaccia === undefined; i += 1) {
    await pausa(250)
    if (porta === undefined) { try { await fetch(`http://127.0.0.1:${PORTA}/api/ciao`); porta = Date.now() - t0 } catch { /* non ancora */ } }
    try { if ((await valuta('document.querySelectorAll("button").length')) > 5) interfaccia = Date.now() - t0 } catch { /* non ancora */ }
  }
  scrivi({ misura: 'avvio', portaInAscoltoMs: porta, interfacciaProntaMs: interfaccia })
  await pausa(15000)
  scrivi({ misura: 'memoria-15s', ...memoria() })
  scrivi({ misura: 'rotte', ...(await rotte()) })
  await pausa(30000)
  scrivi({ misura: 'memoria-60s', ...memoria() })
} else if (cosa === 'apri') {
  const stato = JSON.parse((await chiama('GET', '/api/stato')).testo)
  const nomi = stato.workspace?.nomi ?? []
  const primo = stato.workspace?.attivo
  const secondo = nomi.find((n) => n !== primo)
  for (let i = 1; i <= 6; i += 1) {
    const ws = i > 4 && secondo !== undefined ? secondo : primo
    const r = await chiama('POST', '/api/apri', { cartella: join(RADICE, 'SierraDeck-prova-080'), ...(ws ? { workspace: ws } : {}), nome: `Prova ${i}` })
    console.log(i, r.stato, r.testo.slice(0, 120))
    await pausa(3000)
  }
} else if (cosa === 'rotte') {
  scrivi({ misura: 'rotte', ...(await rotte()) })
  scrivi({ misura: 'memoria', ...memoria() })
} else if (cosa === 'ferma') {
  for (const p of albero()) { try { process.kill(p.ProcessId, 'SIGKILL') } catch { /* già uscito */ } }
  await pausa(3000)
  console.log(ps(`Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in ${PORTA},${PORTA + 1},${DEBUG} } | Select-Object LocalPort,OwningProcess | Out-String`).trim() || 'porte della copia libere')
}
process.exit(0)
