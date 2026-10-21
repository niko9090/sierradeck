// Prova di durata del servizio degli autopiloti (0.84.0, c-56): il servizio di questo ramo
// (`npx electron-vite build` prima), isolato (APPDATA e porta 47651 di prova), con un
// autopilota e 4 chat simulate su worktree git veri, per MINUTI minuti.
// Uso: node scripts/prova-durata-autopilota.cjs [cartella del progetto] [minuti] [nome cartella in note/]
// Il driver fa la parte delle chat (hook PreToolUse e Stop) e del Gestore (consegne, battiti).
const { spawn, spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const { randomUUID } = require('crypto')

const WT = process.argv[2] ?? process.cwd()
const MINUTI = Number(process.argv[3] ?? 30)
const P = path.join(WT, 'note', process.argv[4] ?? 'prova-084')
const PORTA = 47651
const BASE = `http://127.0.0.1:${PORTA}`
const AP = 'ap-08400084-0000-4000-8000-000000000084'
const CORTO = 'ap-08400084'
const progetto = path.join(P, 'progetto')
const dati = path.join(P, 'AppData')
const out = path.join(P, 'esito.json')
const diario = path.join(P, 'driver.log')
const log = (m) => { const r = `${new Date().toISOString()} ${m}`; fs.appendFileSync(diario, r + '\n'); console.log(r) }

function git (args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stdout}${r.stderr}`)
  return r.stdout.trim()
}

async function porta (p) {
  try { await fetch(`http://127.0.0.1:${p}/salute`, { signal: AbortSignal.timeout(1000) }); return true } catch { return false }
}

async function prepara () {
  if (fs.existsSync(P)) throw new Error(`${P} esiste già: toglila prima`)
  if (await porta(PORTA)) throw new Error(`la porta ${PORTA} è già in uso`)
  fs.mkdirSync(progetto, { recursive: true })
  git(['init', '-q', '-b', 'main'], progetto)
  git(['config', 'user.name', 'Prova'], progetto)
  git(['config', 'user.email', 'prova@example.com'], progetto)
  git(['config', 'core.autocrlf', 'false'], progetto)
  fs.writeFileSync(path.join(progetto, 'conta.js'), [
    "// Conta le righe dei registri lavoro-*.txt: passa se sono almeno argv[2]; argv[3] secondi di attesa.",
    "const fs = require('fs')",
    "let n = 0",
    "for (const f of fs.readdirSync('.')) if (f.startsWith('lavoro-')) n += fs.readFileSync(f, 'utf8').split('\\n').length - 1",
    "const fine = () => { console.log(`righe ${n} su ${process.argv[2]}`); process.exit(n >= Number(process.argv[2]) ? 0 : 1) }",
    "setTimeout(fine, Number(process.argv[3] ?? 0) * 1000)",
    ''
  ].join('\n'))
  fs.writeFileSync(path.join(progetto, 'LEGGIMI.md'), '# Prova\n\nOgni chat aggiunge righe al suo registro lavoro-c-N.txt.\n')
  git(['add', '-A'], progetto)
  git(['commit', '-q', '-m', 'inizio'], progetto)
  const chats = []
  for (let i = 1; i <= 4; i++) {
    const ramo = `ap/${CORTO}/c-${i}`
    const cartella = path.join(`${progetto}.sierradeck-wt`, `${CORTO}-c-${i}`)
    git(['worktree', 'add', '-q', '-b', ramo, cartella, 'main'], progetto)
    git(['config', 'core.autocrlf', 'false'], cartella)
    chats.push({ id: `c-${i}`, compito: `Aggiungi righe al registro lavoro-c-${i}.txt, dieci per turno`, stato: 'lavoro', cicli: 0, ramo, cartella, sessionId: randomUUID() })
  }
  const ora = new Date().toISOString()
  const criteri = [200, 400, 800, 1600, 3200].map((n) => ({ descrizione: `i registri hanno almeno ${n} righe`, comando: `node conta.js ${n}`, soddisfatto: false }))
  criteri.push({ descrizione: 'i registri hanno almeno 6400 righe (lento)', comando: 'node conta.js 6400 25', soddisfatto: false })
  const a = {
    versione: 1, id: AP, nome: 'Prova 0.84.0', obiettivo: 'Riempire i registri lavoro-c-N.txt: ogni chat aggiunge dieci righe al suo a ogni turno, finché node conta.js 6400 passa. È una prova di durata: prosegui sempre, non serve chiedere niente.',
    obiettivoTuo: 'prova di durata', cwd: progetto, criteri, stato: 'lavoro', cicli: 0, iniziatoIl: ora, ultimoEvento: ora,
    decisioni: [], intervista: [], limiti: { cicliMax: 0, minutiMax: 0, stalloMax: 3 }, tettoChat: 4, chats, compitiDaFare: [], modifiche: [], dialogo: [], daConsegnare: [], ramoBase: 'main'
  }
  const arch = path.join(dati, 'SierraDeck', 'autopiloti')
  fs.mkdirSync(arch, { recursive: true })
  fs.writeFileSync(path.join(arch, `${AP}.json`), JSON.stringify(a, null, 2))
  return chats
}

async function chiama (metodo, percorso, corpo, ms) {
  const r = await fetch(`${BASE}${percorso}`, { method: metodo, headers: { 'Content-Type': 'application/json' }, ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}), ...(ms !== undefined ? { signal: AbortSignal.timeout(ms) } : {}) })
  const t = await r.text()
  return t === '' ? {} : JSON.parse(t)
}

async function main () {
  const chats = await prepara()
  log(`preparata ${P}`)
  const servizio = spawn(process.execPath, [path.join(WT, 'out', 'main', 'autopilot-host.js')], {
    env: { ...process.env, APPDATA: dati, SIERRADECK_PORTA_AUTOPILOTI: String(PORTA), SIERRADECK_VERSIONE: '0.84.0-prova' },
    stdio: ['ignore', fs.openSync(path.join(P, 'servizio.out'), 'a'), fs.openSync(path.join(P, 'servizio.out'), 'a')],
    windowsHide: true
  })
  log(`servizio pid ${servizio.pid}`)
  for (let i = 0; i < 60 && !(await porta(PORTA)); i++) await new Promise((r) => setTimeout(r, 1000))
  if (!(await porta(PORTA))) throw new Error('il servizio non risponde')

  const m = { saluteKo: 0, saluteMaxMs: 0, pretool: 0, pretoolMaxMs: 0, pretoolKo: 0, stop: 0, stopKo: 0, stopMaxMs: 0, decisioni: {}, consegne: 0, ritardiConsegnaS: [], fermateLunghe: [], statiAutopilota: [], chatBloccate: [] }
  const stato = new Map(chats.map((c, i) => [c.id, { ...c, fase: 'lavoro', fine: Date.now() + (60 + i * 40) * 1000, ferma: 0, turni: 0 }]))
  const inizio = Date.now()
  const fine = inizio + MINUTI * 60_000
  let ultimoStato = 'lavoro'

  const fermata = async (c) => {
    c.fase = 'stop'
    fs.appendFileSync(path.join(c.cartella, `lavoro-${c.id}.txt`), Array.from({ length: 10 }, (_, k) => `${c.id} turno ${c.turni} riga ${k + 1}`).join('\n') + '\n')
    c.turni++
    const t0 = Date.now()
    try {
      const r = await chiama('POST', `/hook/stop?ap=${AP}&chat=${c.id}`, { session_id: c.sessionId, stop_hook_active: false, last_assistant_message: `Ho aggiunto dieci righe a lavoro-${c.id}.txt (turno ${c.turni}). Continuo col prossimo turno.`, hook_event_name: 'Stop', cwd: c.cartella, transcript_path: path.join(P, `${c.id}.jsonl`) })
      const ms = Date.now() - t0
      m.stop++; m.stopMaxMs = Math.max(m.stopMaxMs, ms)
      const d = r.decision ?? 'lascia'
      m.decisioni[d] = (m.decisioni[d] ?? 0) + 1
      log(`${c.id} stop in ${(ms / 1000).toFixed(1)} s → ${d}${r.reason ? `: ${String(r.reason).slice(0, 100).replace(/\s+/g, ' ')}` : ''}`)
      if (c.fase === 'chiusa') return
      if (d === 'block') { c.fase = 'lavoro'; c.fine = Date.now() + (90 + Math.random() * 90) * 1000 } else { c.fase = 'ferma'; c.ferma = Date.now() }
    } catch (err) {
      m.stopKo++; log(`${c.id} stop FALLITO: ${err}`); c.fase = 'ferma'; c.ferma = Date.now()
    }
  }

  const pretool = async (c) => {
    const t0 = Date.now()
    try {
      await chiama('POST', `/hook/pretool?ap=${AP}&chat=${c.id}`, { session_id: c.sessionId, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'node conta.js 1' }, cwd: c.cartella }, 30_000)
      const ms = Date.now() - t0
      m.pretool++; m.pretoolMaxMs = Math.max(m.pretoolMaxMs, ms)
    } catch (err) { m.pretoolKo++; log(`${c.id} pretool FALLITO dopo ${Date.now() - t0} ms: ${err}`) }
  }

  // I limiti del piano, come li manda il Gestore (senza, al massimo 2 chat insieme).
  const limiti = () => chiama("POST", "/stato-programma", { letto: Date.now(), chat: [], limiti: { cinqueOre: { percentoLetto: 20, lettoIl: Date.now() }, settimana: { percentoLetto: 30, lettoIl: Date.now() } } }, 5000).catch((err) => { log(`stato-programma: ${err}`) })
  await limiti()
  let giro = 0
  while (Date.now() < fine) {
    giro++
    const ora = Date.now()
    // La salute, come il pannello.
    const ts = Date.now()
    try { await chiama('GET', '/salute', undefined, 3000); m.saluteMaxMs = Math.max(m.saluteMaxMs, Date.now() - ts) } catch { m.saluteKo++; log('salute: nessuna risposta in 3 s') }
    for (const c of stato.values()) {
      if (c.fase === 'lavoro') {
        void pretool(c)
        if (ora >= c.fine) void fermata(c)
      }
    }
    if (giro % 3 === 0) {
      const segni = [...stato.values()].filter((c) => c.fase === 'lavoro' || c.fase === 'stop').map((c) => ({ autopilota: AP, chat: c.id }))
      const ferme = [...stato.values()].filter((c) => c.fase === 'ferma').map((c) => ({ autopilota: AP, chat: c.id, dal: new Date(c.ferma).toISOString() }))
      try { await chiama('POST', '/battiti', { segni, ferme }, 5000) } catch (err) { log(`battiti falliti: ${err}`) }
    }
    try {
      const { consegne = [] } = await chiama('GET', '/consegne', undefined, 5000)
      if (consegne.length > 0) {
        await chiama('POST', '/consegne/conferma', { ids: consegne.map((x) => x.id) }, 5000)
        for (const x of consegne) {
          await chiama('POST', '/consegne/esito', { id: x.id, esito: 'partita' }, 5000)
          const c = stato.get(x.chatId)
          m.consegne++
          log(`consegna ${x.id} ${x.cosa} per ${x.chatId}${x.testo ? `: ${String(x.testo).slice(0, 90).replace(/\s+/g, ' ')}` : ''}`)
          if (c === undefined) continue
          if (x.cosa === 'chiudi' || x.cosa === 'interrompi') { c.fase = 'chiusa'; continue }
          if (c.fase === 'ferma') { m.ritardiConsegnaS.push(Math.round((Date.now() - c.ferma) / 1000)); c.fase = 'lavoro'; c.fine = Date.now() + (90 + Math.random() * 90) * 1000 }
        }
      }
    } catch (err) { log(`consegne: ${err}`) }
    if (giro % 12 === 0) {
      await limiti()
      try {
        const a = JSON.parse(fs.readFileSync(path.join(dati, 'SierraDeck', 'autopiloti', `${AP}.json`), 'utf8'))
        if (a.stato !== ultimoStato) { m.statiAutopilota.push(`${new Date().toISOString()} ${ultimoStato} → ${a.stato} ${a.motivoSospensione ?? ''}`); log(`autopilota: ${ultimoStato} → ${a.stato} ${a.motivoSospensione ?? ''}`); ultimoStato = a.stato }
        for (const ch of a.chats) if (ch.stato === 'bloccata' && !m.chatBloccate.includes(ch.id)) { m.chatBloccate.push(ch.id); log(`chat ${ch.id} bloccata`) }
        log(`minuto ${Math.round((Date.now() - inizio) / 60000)}: autopilota ${a.stato}, chat ${a.chats.map((x) => `${x.id}=${x.stato}`).join(' ')}, da parte ${JSON.stringify(a.daParte ?? [])}, in coda ${a.daConsegnare.length}, righe diario ${a.decisioni.length}`)
      } catch (err) { log(`archivio illeggibile: ${err}`) }
    }
    for (const c of stato.values()) {
      if (c.fase === 'ferma' && Date.now() - c.ferma > 5 * 60_000 && !c.segnalata) { c.segnalata = true; m.fermateLunghe.push(`${c.id} ferma da più di 5 minuti alle ${new Date().toISOString()}`); log(`${c.id} ferma da più di 5 minuti`) }
      if (c.fase !== 'ferma') c.segnalata = false
    }
    await new Promise((r) => setTimeout(r, 5000))
  }
  const a = JSON.parse(fs.readFileSync(path.join(dati, 'SierraDeck', 'autopiloti', `${AP}.json`), 'utf8'))
  const righe = (() => { try { return spawnSync(process.execPath, ['conta.js', '0'], { cwd: progetto, encoding: 'utf8' }).stdout.trim() } catch { return '?' } })()
  const esito = { minuti: MINUTI, ...m, statoFinale: a.stato, chatFinali: a.chats.map((x) => `${x.id}=${x.stato}`), unioni: a.decisioni.filter((d) => /^unito il ramo/.test(d.cosa)).length, commitMain: git(['rev-list', '--count', 'main'], progetto), righeInMain: righe, sospensioni: a.decisioni.filter((d) => /sospeso|chiedo a Nicholas|in attesa di risposta/i.test(d.cosa)).map((d) => `${d.quando} ${d.cosa.slice(0, 160)}`) }
  fs.writeFileSync(out, JSON.stringify(esito, null, 2))
  log(`FINE: ${JSON.stringify(esito)}`)
  servizio.kill()
  spawnSync('taskkill', ['/PID', String(servizio.pid), '/T', '/F'], { windowsHide: true })
  process.exit(0)
}

main().catch((err) => { log(`ERRORE: ${err.stack ?? err}`); process.exit(1) })
