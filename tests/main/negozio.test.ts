import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { commutaSkill, creaSkill, importaSkill, skillTogliibile } from '../../src/main/negozio/azioni'
import { skillDisponibili, agentiDisponibili, chiaveProgetto, percorsiClaude, versioniCatalogo } from '../../src/main/negozio/lettura'
import { idDi, interpreta, idPluginValido, installaPlugin, commutaPlugin, aggiornaPlugin, pluginDaCli, marketplaceDaCli } from '../../src/main/negozio/cli'
import { elencoMcp, conSalute, commutaMcp, approvaMcp, configDaModulo, impostaVariabiliMcp, applicaModifiche } from '../../src/main/negozio/mcp'

/**
 * Il negozio tocca i file più delicati dell'utente (`~/.claude.json`,
 * `settings.json`). La cosa che DEVE valere: cambia una chiave e non graffia
 * nient'altro. Questi test lo dimostrano su file veri in una cartella usa-e-getta.
 */

let radice: string
let claudeJson: string

beforeEach(() => {
  radice = mkdtempSync(join(tmpdir(), 'sd-negozio-'))
  claudeJson = join(radice, '.claude.json')
})
afterEach(() => { rmSync(radice, { recursive: true, force: true }) })

function scriviJson(percorso: string, dati: unknown): void {
  writeFileSync(percorso, JSON.stringify(dati, null, 2), 'utf8')
}

describe('commutaMcp (0.53.0: la chiave giusta)', () => {
  it('spegne con disabledMcpServers, la lista dell’interruttore di /mcp, senza toccare il resto di .claude.json', () => {
    // Provato con Claude Code 2.1.294: disabledMcpjsonServers (quello che si
    // scriveva prima) vale solo per i server di .mcp.json, e un server locale
    // «spento» così restava acceso nelle chat.
    scriviJson(claudeJson, {
      numStartups: 42,
      mcpServers: { globale: { command: 'x' } },
      projects: {
        '/altro': { mcpServers: { suo: { url: 'http://a' } } },
        '/mio': { mcpServers: { uno: { command: 'a' }, due: { url: 'http://b' } }, allowedTools: ['Read'] }
      }
    })

    const esito = commutaMcp(claudeJson, '/mio', 'uno', false)
    expect(esito.ok).toBe(true)
    expect(esito.fatto).toContain('che apri da adesso')

    const dopo = JSON.parse(readFileSync(claudeJson, 'utf8'))
    expect(dopo.projects['/mio'].disabledMcpServers).toEqual(['uno'])
    expect(dopo.projects['/mio'].disabledMcpjsonServers).toBeUndefined()
    // …e tutto il resto è identico.
    expect(dopo.numStartups).toBe(42)
    expect(dopo.mcpServers).toEqual({ globale: { command: 'x' } })
    expect(dopo.projects['/altro']).toEqual({ mcpServers: { suo: { url: 'http://a' } } })
    expect(dopo.projects['/mio'].mcpServers).toEqual({ uno: { command: 'a' }, due: { url: 'http://b' } })
    expect(dopo.projects['/mio'].allowedTools).toEqual(['Read'])
    // Anche un server personale (di tutti i progetti) si spegne per questa cartella.
    commutaMcp(claudeJson, '/mio', 'globale', false)
    const voci = elencoMcp(radice, claudeJson, '/mio')
    expect(voci.find((v) => v.nome === 'globale')).toMatchObject({ ambito: 'utente', config: 'spento', abilitato: false })
  })

  it('riaccendere toglie la voce, e pulisce quella scritta per sbaglio dalle versioni di prima', () => {
    scriviJson(claudeJson, {
      projects: { '/mio': { mcpServers: { uno: { command: 'a' } }, disabledMcpServers: ['uno'], disabledMcpjsonServers: ['uno'] } }
    })
    expect(elencoMcp(radice, claudeJson, '/mio')[0]?.config).toBe('spento')
    commutaMcp(claudeJson, '/mio', 'uno', true)
    const dopo = JSON.parse(readFileSync(claudeJson, 'utf8'))
    expect(dopo.projects['/mio'].disabledMcpServers).toEqual([])
    expect(dopo.projects['/mio'].disabledMcpjsonServers).toEqual([])
    expect(elencoMcp(radice, claudeJson, '/mio')[0]?.config).toBe('attivo')
  })

  it('non scrive e segnala se il file è illeggibile', () => {
    writeFileSync(claudeJson, '{ rotto', 'utf8')
    const esito = commutaMcp(claudeJson, '/mio', 'uno', false)
    expect(esito.ok).toBe(false)
    // Il file resta com'era: meglio un'azione mancata che una corrotta.
    expect(readFileSync(claudeJson, 'utf8')).toBe('{ rotto')
  })
})

describe('elencoMcp: tutti e tre i posti, come una chat li vede', () => {
  it('locali, personali e del .mcp.json (da approvare), coi nomi delle variabili ma mai i valori', () => {
    const progetto = join(radice, 'progetto')
    mkdirSync(join(progetto, '.claude'), { recursive: true })
    scriviJson(claudeJson, {
      mcpServers: { personale: { type: 'stdio', command: 'node', args: ['server.js'], env: {} } },
      projects: { [progetto]: { mcpServers: { finto: { type: 'stdio', command: 'node', args: ['a.js', '--token', 'segreto123'], env: { PROVA_CHIAVE: 'abc123' } } } } }
    })
    scriviJson(join(progetto, '.mcp.json'), { mcpServers: { condiviso: { command: 'node', args: ['b.js'] }, approvato: { type: 'http', url: 'https://esempio.it/mcp', headers: { Authorization: 'Bearer xyz' } } } })
    scriviJson(join(progetto, '.claude', 'settings.local.json'), { enabledMcpjsonServers: ['approvato'] })
    const voci = elencoMcp(radice, claudeJson, progetto)
    expect(voci.map((v) => [v.nome, v.ambito, v.config])).toEqual([
      ['finto', 'locale', 'attivo'],
      ['condiviso', 'progetto', 'da-approvare'],
      ['approvato', 'progetto', 'attivo'],
      ['personale', 'utente', 'attivo']
    ])
    const finto = voci[0]
    expect(finto?.variabili).toEqual(['PROVA_CHIAVE'])
    expect(JSON.stringify(voci)).not.toContain('abc123')
    expect(JSON.stringify(voci)).not.toContain('segreto123')
    expect(JSON.stringify(voci)).not.toContain('Bearer xyz')
    expect(voci[2]?.intestazioni).toEqual(['Authorization'])
    expect(voci[1]?.stato?.etichetta).toBe('da approvare')
  })

  it('con lo stato del collegamento da `claude mcp list` vero: errori col motivo, e quelli di claude.ai in sola lettura', () => {
    const progetto = join(radice, 'progetto')
    mkdirSync(progetto, { recursive: true })
    scriviJson(claudeJson, { projects: { [progetto]: { mcpServers: { finto: { command: 'node' }, rotto: { type: 'http', url: 'http://127.0.0.1:9/mcp' } } } } })
    const testo = readFileSync(join(__dirname, '..', 'fixtures', 'claude-2.1.294-negozio', 'mcp-list-errori.txt'), 'utf8') +
      readFileSync(join(__dirname, '..', 'fixtures', 'claude-2.1.294-negozio', 'mcp-list.txt'), 'utf8')
    const voci = conSalute(elencoMcp(radice, claudeJson, progetto), testo)
    expect(voci.find((v) => v.nome === 'rotto')).toMatchObject({ salute: 'errore', stato: { tono: 'errore' } })
    expect(voci.find((v) => v.nome === 'rotto')?.stato?.spiegazione).toContain('ECONNREFUSED')
    expect(voci.find((v) => v.nome === 'finto')?.stato?.etichetta).toBe('connesso')
    expect(voci.find((v) => v.nome === 'claude.ai Claude Docs')).toMatchObject({ ambito: 'altro', salute: 'connesso' })
  })

  it('approvare e rifiutare scrivono in .claude/settings.local.json del progetto, dove li tiene Claude Code', () => {
    const progetto = join(radice, 'progetto')
    mkdirSync(progetto, { recursive: true })
    scriviJson(join(progetto, '.mcp.json'), { mcpServers: { condiviso: { command: 'node' } } })
    expect(approvaMcp(progetto, 'condiviso', true).ok).toBe(true)
    expect(elencoMcp(radice, claudeJson, progetto)[0]?.config).toBe('attivo')
    expect(approvaMcp(progetto, 'condiviso', false).ok).toBe(true)
    const s = JSON.parse(readFileSync(join(progetto, '.claude', 'settings.local.json'), 'utf8'))
    expect(s).toEqual({ enabledMcpjsonServers: [], disabledMcpjsonServers: ['condiviso'] })
    expect(elencoMcp(radice, claudeJson, progetto)[0]?.config).toBe('rifiutato')
  })
})

describe('aggiungere un MCP e cambiarne le variabili', () => {
  it('il modulo diventa la configurazione di `claude mcp add-json`, controllata', () => {
    expect(configDaModulo({ nome: 'files', ambito: 'locale', tipo: 'stdio', comando: 'npx', argomenti: ['-y', 'server-files', ''], variabili: { CHIAVE_API: 'x' } }))
      .toEqual({ ok: true, json: { type: 'stdio', command: 'npx', args: ['-y', 'server-files'], env: { CHIAVE_API: 'x' } } })
    expect(configDaModulo({ nome: 'web', ambito: 'utente', tipo: 'http', url: 'https://esempio.it/mcp', intestazioni: { Authorization: 'Bearer x' } }))
      .toEqual({ ok: true, json: { type: 'http', url: 'https://esempio.it/mcp', headers: { Authorization: 'Bearer x' } } })
    expect(configDaModulo({ nome: '--help', ambito: 'locale', tipo: 'stdio', comando: 'x' }).ok).toBe(false)
    expect(configDaModulo({ nome: 'x', ambito: 'locale', tipo: 'stdio', comando: ' ' }).ok).toBe(false)
    expect(configDaModulo({ nome: 'x', ambito: 'locale', tipo: 'http', url: 'esempio.it' }).ok).toBe(false)
    expect(configDaModulo({ nome: 'x', ambito: 'locale', tipo: 'stdio', comando: 'a', variabili: { 'DUE PAROLE': 'v' } }).ok).toBe(false)
  })

  it('cambia una variabile senza conoscere le altre (il telefono non le vede mai), ne toglie una con null', () => {
    const a = applicaModifiche({ command: 'node', env: { UNO: '1', DUE: '2' } }, { variabili: { DUE: '22', TRE: '3', UNO: null } })
    expect(a).toEqual({ ok: true, cfg: { command: 'node', env: { DUE: '22', TRE: '3' } } })
  })

  it('nel file giusto per ogni posto, una voce sola', () => {
    const progetto = join(radice, 'progetto')
    mkdirSync(progetto, { recursive: true })
    scriviJson(claudeJson, { numStartups: 3, mcpServers: { personale: { command: 'p' } }, projects: { [progetto]: { mcpServers: { finto: { command: 'node', env: { A: '1' } } } } } })
    scriviJson(join(progetto, '.mcp.json'), { mcpServers: { condiviso: { command: 'node' } } })
    expect(impostaVariabiliMcp(claudeJson, progetto, 'finto', 'locale', { variabili: { B: '2' } }).ok).toBe(true)
    expect(impostaVariabiliMcp(claudeJson, progetto, 'personale', 'utente', { intestazioni: { 'X-Chiave': 'k' } }).ok).toBe(true)
    expect(impostaVariabiliMcp(claudeJson, progetto, 'condiviso', 'progetto', { variabili: { TOKEN: '${TOKEN}' } }).ok).toBe(true)
    const j = JSON.parse(readFileSync(claudeJson, 'utf8'))
    expect(j.numStartups).toBe(3)
    expect(j.projects[progetto].mcpServers.finto.env).toEqual({ A: '1', B: '2' })
    expect(j.mcpServers.personale.headers).toEqual({ 'X-Chiave': 'k' })
    expect(JSON.parse(readFileSync(join(progetto, '.mcp.json'), 'utf8')).mcpServers.condiviso.env).toEqual({ TOKEN: '${TOKEN}' })
    expect(impostaVariabiliMcp(claudeJson, progetto, 'sparito', 'locale', { variabili: { A: '1' } }).ok).toBe(false)
  })
})

describe('skill: aggiungere, importare, togliere', () => {
  it('una skill nuova scrive SKILL.md con nome e descrizione, e non scrive sopra una che c’è', () => {
    const cartella = join(radice, 'skills')
    const e = creaSkill(cartella, { nome: 'revisione-testi', descrizione: 'Rivede i testi: «virgolette» e "apici"', istruzioni: 'Correggi gli errori.' })
    expect(e.ok).toBe(true)
    expect(e.fatto).toContain('anche nelle chat già aperte')
    const s = skillDisponibili(radice)
    expect(s.map((x) => [x.nome, x.descrizione])).toEqual([['revisione-testi', 'Rivede i testi: «virgolette» e "apici"']])
    expect(creaSkill(cartella, { nome: 'revisione-testi', descrizione: 'x', istruzioni: 'y' }).ok).toBe(false)
    expect(creaSkill(cartella, { nome: 'Con Spazi', descrizione: 'x', istruzioni: 'y' }).ok).toBe(false)
    expect(creaSkill(cartella, { nome: 'vuota', descrizione: '', istruzioni: 'y' }).ok).toBe(false)
  })

  it('importa una cartella con il suo SKILL.md e i file accanto; senza SKILL.md no', () => {
    const sorgente = join(radice, 'fuori', 'mia-skill')
    mkdirSync(join(sorgente, 'script'), { recursive: true })
    writeFileSync(join(sorgente, 'SKILL.md'), '---\nname: mia-skill\ndescription: prova\n---\nfai')
    writeFileSync(join(sorgente, 'script', 'aiuto.py'), 'print(1)')
    const progetto = join(radice, 'progetto')
    expect(importaSkill(join(progetto, '.claude', 'skills'), sorgente).ok).toBe(true)
    expect(readFileSync(join(progetto, '.claude', 'skills', 'mia-skill', 'script', 'aiuto.py'), 'utf8')).toBe('print(1)')
    expect(skillDisponibili(radice, progetto).map((x) => [x.nome, x.origine])).toEqual([['mia-skill', 'progetto']])
    expect(importaSkill(join(progetto, '.claude', 'skills'), join(radice, 'fuori')).ok).toBe(false)
  })

  it('si toglie solo una skill che sta direttamente in una cartella delle skill', () => {
    const cartella = join(radice, 'skills')
    creaSkill(cartella, { nome: 'una', descrizione: 'x', istruzioni: 'y' })
    expect(skillTogliibile(join(cartella, 'una'), [cartella])).toBe(true)
    expect(skillTogliibile(join(cartella, 'una', '..', '..'), [cartella])).toBe(false)
    expect(skillTogliibile(radice, [cartella])).toBe(false)
    expect(skillTogliibile(join(cartella, 'nessuna'), [cartella])).toBe(false)
  })

  it('le spente si leggono anche dalle impostazioni del progetto; quelle dei plugin si accendono col plugin', () => {
    const progetto = join(radice, 'progetto')
    creaSkill(join(progetto, '.claude', 'skills'), { nome: 'locale', descrizione: 'x', istruzioni: 'y' })
    creaSkill(join(radice, 'skills'), { nome: 'mia', descrizione: 'x', istruzioni: 'y' })
    scriviJson(join(progetto, '.claude', 'settings.local.json'), { skillOverrides: { locale: 'off', mia: 'name-only' } })
    const plug = join(radice, 'plugins', 'cache', 'm', 'saluta', '1.0.0')
    mkdirSync(join(plug, 'skills', 'ciao'), { recursive: true })
    writeFileSync(join(plug, 'skills', 'ciao', 'SKILL.md'), '---\nname: ciao\ndescription: Dice ciao\n---\n')
    const s = skillDisponibili(radice, progetto, [{ id: 'saluta@m', nome: 'saluta', descrizione: '', marketplace: 'm', installato: true, abilitato: false, percorso: plug }])
    expect(s.map((x) => [x.nome, x.origine, x.abilitata, x.stato?.etichetta])).toEqual([
      ['mia', 'utente', true, 'solo il nome'],
      ['locale', 'progetto', false, 'disattivata'],
      ['saluta:ciao', 'plugin', false, 'plugin spento']
    ])
  })
})

describe('plugin e fonti dalle risposte vere del CLI 2.1.294', () => {
  const fx = (f: string): string => readFileSync(join(__dirname, '..', 'fixtures', 'claude-2.1.294-negozio', f), 'utf8')

  it('un installato non è nel catalogo dei disponibili: si vede lo stesso, con l’aggiornamento dalla cartella', () => {
    const p = pluginDaCli(JSON.parse(fx('available-dopo-mkt.json')))
    const saluta = p.find((x) => x.id === 'saluta@prova-mkt')
    expect(saluta).toMatchObject({ installato: true, abilitato: true, versione: '1.0.0', aggiornamento: true, versioneNuova: '1.1.0', ambito: 'user' })
    expect(saluta?.stato?.etichetta).toBe('aggiornamento disponibile')
    expect(p.filter((x) => !x.installato).map((x) => x.stato?.etichetta)).toEqual(['da installare', 'da installare'])
  })

  it('spento, e il numero di installazioni dal catalogo vero', () => {
    const spento = pluginDaCli({ installed: JSON.parse(fx('list-spento.json')) })
    expect(spento[0]).toMatchObject({ abilitato: false, stato: { etichetta: 'disattivato' } })
    const cat = pluginDaCli(JSON.parse(fx('available-catalogo-vero.json')))
    expect(cat.length).toBe(6)
    expect(cat.filter((x) => (x.installazioni ?? 0) > 0)).toHaveLength(4)
  })

  it('la versione nel catalogo di un marketplace scaricato (per i plugin già installati)', () => {
    const mkt = join(radice, 'plugins', 'marketplaces', 'm')
    mkdirSync(join(mkt, '.claude-plugin'), { recursive: true })
    scriviJson(join(radice, 'plugins', 'known_marketplaces.json'), { m: { installLocation: mkt } })
    scriviJson(join(mkt, '.claude-plugin', 'marketplace.json'), { plugins: [{ name: 'a', version: '2.0.0' }, { name: 'b', source: { source: 'url', sha: 'abc' } }] })
    expect([...versioniCatalogo(radice)]).toEqual([['a@m', { version: '2.0.0' }], ['b@m', { sha: 'abc' }]])
    const p = pluginDaCli({ installed: [{ id: 'a@m', version: '1.0.0', enabled: true }] }, versioniCatalogo(radice))
    expect(p[0]).toMatchObject({ aggiornamento: true, versioneNuova: '2.0.0' })
  })

  it('le fonti: anche quella in una cartella («directory»)', () => {
    expect(marketplaceDaCli(JSON.parse(fx('mkt-list.json')), { 'prova-mkt': '2026-10-08T10:00:00.000Z' })).toEqual([
      { nome: 'prova-mkt', tipo: 'directory', riferimento: 'C:\\Progetti\\Esempio\\mercato', ufficiale: false, aggiornato: '2026-10-08T10:00:00.000Z' }
    ])
  })

  it('CLAUDE_CONFIG_DIR sposta anche .claude.json (provato con 2.1.294)', () => {
    expect(percorsiClaude({ CLAUDE_CONFIG_DIR: 'D:\\cfg' }, 'C:\\Utenti\\esempio')).toEqual({ radice: 'D:\\cfg', fileClaudeJson: join('D:\\cfg', '.claude.json') })
    expect(percorsiClaude({}, 'C:\\Utenti\\esempio')).toEqual({ radice: join('C:\\Utenti\\esempio', '.claude'), fileClaudeJson: join('C:\\Utenti\\esempio', '.claude.json') })
  })
})

describe('commutaSkill', () => {
  function creaSkill(nome: string): void {
    const d = join(radice, 'skills', nome)
    mkdirSync(d, { recursive: true })
    writeFileSync(join(d, 'SKILL.md'), `---\nname: ${nome}\ndescription: prova\n---\ncorpo\n`, 'utf8')
  }

  it('spegne una skill via skillOverrides e la lettura la vede spenta', () => {
    creaSkill('alfa')
    scriviJson(join(radice, 'settings.json'), { model: 'opus', skillOverrides: { beta: 'off' } })

    expect(skillDisponibili(radice).find((s) => s.nome === 'alfa')?.abilitata).toBe(true)

    const esito = commutaSkill(radice, 'alfa', false)
    expect(esito.ok).toBe(true)

    const dopo = JSON.parse(readFileSync(join(radice, 'settings.json'), 'utf8'))
    expect(dopo.skillOverrides).toEqual({ beta: 'off', alfa: 'off' })
    expect(dopo.model).toBe('opus') // il resto intatto
    expect(skillDisponibili(radice).find((s) => s.nome === 'alfa')?.abilitata).toBe(false)
  })

  it('riaccendere rimuove la voce, e svuota skillOverrides se resta vuoto', () => {
    creaSkill('alfa')
    scriviJson(join(radice, 'settings.json'), { skillOverrides: { alfa: 'off' } })

    commutaSkill(radice, 'alfa', true)
    const dopo = JSON.parse(readFileSync(join(radice, 'settings.json'), 'utf8'))
    expect(dopo.skillOverrides).toBeUndefined()
    expect(skillDisponibili(radice).find((s) => s.nome === 'alfa')?.abilitata).toBe(true)
  })
})

describe('agentiDisponibili', () => {
  function creaAgente(nome: string, testa: string): void {
    const d = join(radice, 'agents')
    mkdirSync(d, { recursive: true })
    writeFileSync(join(d, `${nome}.md`), `---\n${testa}\n---\ncorpo dell'agente\n`, 'utf8')
  }

  it('legge nome, descrizione, strumenti e modello dall’intestazione', () => {
    creaAgente('revisore', 'name: code-reviewer\ndescription: Rivede il codice\ntools: Read, Grep\nmodel: sonnet')
    const a = agentiDisponibili(radice).find((x) => x.percorso.endsWith('revisore.md'))
    expect(a).toBeDefined()
    expect(a?.nome).toBe('code-reviewer')
    expect(a?.descrizione).toBe('Rivede il codice')
    expect(a?.strumenti).toBe('Read, Grep')
    expect(a?.modello).toBe('sonnet')
    expect(a?.origine).toBe('utente')
  })

  it('senza intestazione usa il nome del file, e i campi assenti restano vuoti', () => {
    const d = join(radice, 'agents')
    mkdirSync(d, { recursive: true })
    writeFileSync(join(d, 'nudo.md'), 'solo corpo, niente frontmatter\n', 'utf8')
    const a = agentiDisponibili(radice).find((x) => x.percorso.endsWith('nudo.md'))
    expect(a?.nome).toBe('nudo')
    expect(a?.strumenti).toBeUndefined()
    expect(a?.modello).toBeUndefined()
  })

  it('una cartella agenti che non c’è è «niente», non un errore', () => {
    expect(agentiDisponibili(radice)).toEqual([])
  })

  it('ignora i file che non sono .md', () => {
    const d = join(radice, 'agents')
    mkdirSync(d, { recursive: true })
    writeFileSync(join(d, 'note.txt'), 'non un agente', 'utf8')
    creaAgente('vero', 'name: vero\ndescription: x')
    const nomi = agentiDisponibili(radice).map((a) => a.nome)
    expect(nomi).toEqual(['vero'])
  })
})

describe('idDi (l’id di un plugin, da qualunque campo)', () => {
  it('il catalogo usa pluginId', () => {
    expect(idDi({ pluginId: 'x@m' })).toBe('x@m')
  })
  it('gli INSTALLATI usano id (era il bug: la riga non passava a «installato»)', () => {
    expect(idDi({ id: 'x@m', name: 'x', marketplaceName: 'm', enabled: true } as never)).toBe('x@m')
  })
  it('in mancanza, ricompone da name@marketplace', () => {
    expect(idDi({ name: 'x', marketplaceName: 'm' })).toBe('x@m')
  })
  it('senza niente di utile è undefined', () => {
    expect(idDi({})).toBeUndefined()
  })
})

describe('interpreta (esito di un CLI che esce 0 anche fallendo)', () => {
  it('con ✔ è riuscito', () => {
    expect(interpreta({ ok: true, stdout: '✔ Successfully installed plugin: x@m', stderr: '' }, 'ko')).toEqual({ ok: true })
  })
  it('con ✘ è fallito ANCHE se il codice d’uscita è 0', () => {
    const r = interpreta({ ok: true, stdout: '✘ Failed to install plugin "x": not found', stderr: '' }, 'ko')
    expect(r.ok).toBe(false)
    expect(r.messaggio).toContain('Failed to install')
  })
  it('senza glifi ripiega sul codice d’uscita', () => {
    expect(interpreta({ ok: false, stdout: '', stderr: 'boom' }, 'ko').ok).toBe(false)
    expect(interpreta({ ok: true, stdout: 'fatto', stderr: '' }, 'ko')).toEqual({ ok: true })
  })
})

describe('un identificatore non deve poter diventare un opzione', () => {
  /**
   * `execFile` passa gli argomenti in un array, quindi una virgoletta o un
   * `&&` non diventano mai un comando: quella strada era gia' chiusa. Restava
   * l'altra — un valore che comincia per `-` non viene letto come nome ma come
   * **flag** — e l'id arriva da fuori: dal telefono, che sta sulla rete di
   * casa. Non tocca a noi sapere quali flag esistono nel CLI di qualcun altro.
   */
  it('la forma buona e quella che il CLI stesso produce', () => {
    expect(idPluginValido('scrittore@claude-plugins-official')).toBe(true)
    expect(idPluginValido('scrittore')).toBe(true)
    expect(idPluginValido('un.plugin-2_0@mercato.mio')).toBe(true)
  })

  it('un trattino davanti non e un nome', () => {
    expect(idPluginValido('--help')).toBe(false)
    expect(idPluginValido('-x')).toBe(false)
    expect(idPluginValido('')).toBe(false)
  })

  it('ne uno spazio, una barra o un apice', () => {
    expect(idPluginValido('due parole')).toBe(false)
    expect(idPluginValido('../../fuori')).toBe(false)
    expect(idPluginValido("nome'; rm -rf /")).toBe(false)
    expect(idPluginValido('nome@uno@due')).toBe(false)
  })

  it('e non si prova nemmeno a eseguirlo', async () => {
    // Il punto non e' il messaggio: e' che il CLI non viene chiamato affatto.
    const esito = await installaPlugin('--dangerous')
    expect(esito.ok).toBe(false)
    expect(esito.messaggio).toContain('non valido')
    const altro = await commutaPlugin('-x', true)
    expect(altro.ok).toBe(false)
    expect((await aggiornaPlugin('-y')).ok).toBe(false)
    // Nemmeno un'impronta del comando che non sia un sha256.
    expect((await installaPlugin('buono@m', '--yes')).messaggio).toContain('impronta')
  })
})

describe('un salvataggio che non riesce non deve dirsi riuscito', () => {
  /**
   * `scriviAtomico` non solleva mai: e' il suo contratto, perche' chi lo chiama
   * e' quasi sempre dentro un canale a senso unico. Qui pero' c'e' un esito da
   * riferire, e il `try`/`catch` che stava intorno alla scrittura non poteva
   * scattare: un salvataggio fallito tornava indietro come `ok: true`, il
   * pannello diceva fatto, e non era cambiato niente.
   *
   * Si fa fallire nel modo piu' semplice e portabile: una cartella che non c'e'.
   */
  it('commutaMcp riferisce il guasto', () => {
    const esito = commutaMcp(join(radice, 'cartella-che-non-esiste', '.claude.json'), '/mio', 'uno', false)
    expect(esito.ok).toBe(false)
    expect(esito.messaggio).toBeTruthy()
  })

  it('commutaSkill riferisce il guasto', () => {
    const esito = commutaSkill(join(radice, 'cartella-che-non-esiste'), 'alfa', false)
    expect(esito.ok).toBe(false)
    expect(esito.messaggio).toBeTruthy()
  })
})

describe('la cartella come la scrive Claude Code', () => {
  it('trova la chiave esistente a meno di barre, maiuscole e barra finale; nuova solo se nessuna', () => {
    // Sullo stesso PC la stessa cartella sta due volte in ~/.claude.json:
    // `C:\\Progetti\\Esempio` e `C:/Progetti/Esempio`. Con il confronto esatto la
    // scheda MCP era vuota e «commuta» creava un ramo che Claude Code non guarda.
    const projects = { 'C:/Progetti/Esempio': {}, 'D:\\altro\\': {} }
    expect(chiaveProgetto(projects, 'C:\\Progetti\\Esempio')).toBe('C:/Progetti/Esempio')
    expect(chiaveProgetto(projects, 'c:\\progetti\\ESEMPIO\\')).toBe('C:/Progetti/Esempio')
    expect(chiaveProgetto(projects, 'D:\\altro')).toBe('D:\\altro\\')
    expect(chiaveProgetto(projects, 'E:\\nuova')).toBe('E:\\nuova')
    expect(chiaveProgetto(undefined, 'E:\\nuova')).toBe('E:\\nuova')
  })

  it('elencoMcp e commutaMcp lavorano sulla chiave che c e gia', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sd-negozio-chiave-'))
    const file = join(dir, '.claude.json')
    writeFileSync(file, JSON.stringify({ projects: { 'C:/lavoro/app': { mcpServers: { fs: { command: 'npx' } } } } }), 'utf8')
    expect(elencoMcp(dir, file, 'C:\\lavoro\\app').map((m) => m.nome)).toEqual(['fs'])
    expect(commutaMcp(file, 'C:\\lavoro\\app', 'fs', false).ok).toBe(true)
    const dopo = JSON.parse(readFileSync(file, 'utf8')) as { projects: Record<string, { disabledMcpServers?: string[] }> }
    expect(Object.keys(dopo.projects)).toEqual(['C:/lavoro/app'])
    expect(dopo.projects['C:/lavoro/app']?.disabledMcpServers).toEqual(['fs'])
    rmSync(dir, { recursive: true, force: true })
  })
})
