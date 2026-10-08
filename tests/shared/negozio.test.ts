import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  esitoCli, saluteDaMcpList, aggiornamentoDisponibile, vetrina, comeMostrare, motivoLeggibile,
  statoPlugin, statoSkill, statoMcp, cosaCambia, type PluginVoce
} from '../../src/shared/negozio'

/**
 * Il negozio sulle risposte **vere** di Claude Code 2.1.294 (08/10), prese su
 * una configurazione temporanea (`CLAUDE_CONFIG_DIR`) con un marketplace di
 * prova in una cartella, un server MCP finto e uno irraggiungibile. I percorsi
 * sono resi neutri; il resto è com'era.
 */
const dir = join(__dirname, '..', 'fixtures', 'claude-2.1.294-negozio')
const leggi = (f: string): string => readFileSync(join(dir, f), 'utf8')
/** Le uscite dei comandi --json: l'ultima riga è il codice d'uscita. */
const uscita = (f: string): { ok: boolean; stdout: string; stderr: string } => {
  const righe = leggi(f).trimEnd().split('\n')
  const codice = righe.pop()
  return { ok: codice === '0', stdout: righe.join('\n'), stderr: '' }
}

describe('esitoCli: la riga --json del CLI', () => {
  it('riuscito', () => {
    expect(esitoCli(uscita('enable-ok.txt'))).toMatchObject({ ok: true })
    expect(esitoCli(uscita('disable-ok.txt')).ok).toBe(true)
  })

  it('«già spento» non è un guasto per chi tocca un interruttore (prima diceva errore)', () => {
    const e = esitoCli(uscita('disable-gia.txt'))
    expect(e.ok).toBe(true)
    expect(e.giaFatto).toBe(true)
  })

  it('un plugin che non c’è: il motivo, detto per sapere cosa fare, e il codice', () => {
    const e = esitoCli(uscita('install-nontrovato.txt'))
    expect(e.ok).toBe(false)
    expect(e.codice).toBe('not_found')
    expect(e.messaggio).toContain('Aggiorna il marketplace')
    expect(e.messaggio).toContain('Claude Code: «Plugin "nonce" not found')
  })

  it('disinstallare un plugin che non c’è e aggiungere una fonte che non esiste', () => {
    expect(esitoCli(uscita('uninstall-noninst.txt'))).toMatchObject({ ok: false, codice: 'not_installed' })
    const m = esitoCli(uscita('mkt-add-errore.txt'))
    expect(m).toMatchObject({ ok: false, codice: 'invalid_source' })
    expect(m.messaggio).toContain('non esiste')
  })

  it('aggiorna: da quale a quale versione', () => {
    expect(esitoCli(uscita('update-ok.txt'))).toMatchObject({ ok: true, aggiornato: { da: '1.0.0', a: '1.1.0', giaUltima: false } })
    const gia = esitoCli({ ok: true, stderr: '', stdout: '{"command":"update","outcome":"ok","updateOutcome":"up_to_date","oldVersion":"2.0.0","newVersion":"2.0.0"}' })
    expect(gia.aggiornato?.giaUltima).toBe(true)
  })

  it('un comando dichiarato dal marketplace non si accetta al buio: torna da confermare con la sua impronta', () => {
    const sha = 'a'.repeat(64)
    const e = esitoCli({ ok: false, stderr: '', stdout: JSON.stringify({ command: 'install', outcome: 'failed', failureCode: 'needs_confirmation', shownCommand: { command: 'npx esempio-installa', sha256: sha } }) })
    expect(e.ok).toBe(false)
    expect(e.conferma).toEqual({ sha256: sha, comando: 'npx esempio-installa' })
  })

  it('senza riga JSON ripiega sui glifi, come prima', () => {
    expect(esitoCli({ ok: true, stdout: '✔ Successfully installed plugin: x@m', stderr: '' }).ok).toBe(true)
    expect(esitoCli({ ok: true, stdout: '✘ Failed to install plugin "x": boom', stderr: '' }).ok).toBe(false)
  })
})

describe('motivoLeggibile', () => {
  it('il percorso troppo lungo di git su Windows (successo davvero nella prova) dice il rimedio', () => {
    const m = motivoLeggibile("fatal: cannot write promisor file 'C:/x/.git/objects/pack/p.promisor': Filename too long")
    expect(m).toContain('core.longpaths')
  })
  it('rete e git mancante', () => {
    expect(motivoLeggibile('getaddrinfo ENOTFOUND github.com')).toContain('rete')
    expect(motivoLeggibile('spawn git ENOENT')).toContain('serve git')
  })
})

describe('saluteDaMcpList: `claude mcp list` vero', () => {
  it('connesso, spento per il progetto, e i connettori di claude.ai col nome con gli spazi', () => {
    const s = saluteDaMcpList(leggi('mcp-list.txt'))
    expect(s['claude.ai Claude Docs']).toEqual({ salute: 'connesso', come: 'https://api.anthropic.com/v1/pages/mcp' })
    expect(s.personale?.salute).toBe('spento')
    expect(s.finto?.salute).toBe('connesso')
  })
  it('da approvare, e l’errore con il suo motivo', () => {
    const s = saluteDaMcpList(leggi('mcp-list-errori.txt'))
    expect(s.condiviso?.salute).toBe('da-approvare')
    expect(s.rotto?.salute).toBe('errore')
    expect(s.rotto?.motivo).toContain('ECONNREFUSED')
    expect(s.rotto?.come).toBe('http://127.0.0.1:9/mcp (HTTP)')
  })
})

describe('aggiornamentoDisponibile', () => {
  it('marketplace in una cartella: folderVersion più nuova (risposta vera)', () => {
    const [p] = JSON.parse(leggi('available-dopo-mkt.json')).installed as Array<{ version: string; folderVersion: string }>
    expect(aggiornamentoDisponibile(p as { version: string; folderVersion: string })).toEqual({ aggiornamento: true, nuova: '1.1.0' })
    const [dopo] = JSON.parse(leggi('list-dopo-update.json')) as Array<{ version: string; folderVersion: string }>
    expect(aggiornamentoDisponibile(dopo as { version: string; folderVersion: string }).aggiornamento).toBe(false)
  })
  it('catalogo con versione, e con il solo commit (versione installata «sha12-hash»)', () => {
    expect(aggiornamentoDisponibile({ version: '1.0.0' }, { version: '1.2.0' })).toEqual({ aggiornamento: true, nuova: '1.2.0' })
    expect(aggiornamentoDisponibile({ version: '1.2.0' }, { version: '1.2.0' }).aggiornamento).toBe(false)
    expect(aggiornamentoDisponibile({ version: 'b78ac49cdc6b-65ba16f3' }, { sha: 'b78ac49cdc6b3d7b61c4439470e311f4291265b1' }).aggiornamento).toBe(false)
    expect(aggiornamentoDisponibile({ version: 'b78ac49cdc6b-65ba16f3' }, { sha: 'ffffffffffff3d7b61c4439470e311f4291265b1' })).toEqual({ aggiornamento: true, nuova: 'ffffffffffff' })
  })
  it('senza dati non si inventa niente', () => {
    expect(aggiornamentoDisponibile({}, { version: '1.0.0' }).aggiornamento).toBe(false)
    expect(aggiornamentoDisponibile({ version: '1.0.0' }).aggiornamento).toBe(false)
  })
})

describe('vetrina: il catalogo per un telefono', () => {
  const catalogo: PluginVoce[] = Array.from({ length: 200 }, (_, i) => ({
    id: `p${i}@m`, nome: `p${i}`, descrizione: i === 150 ? 'scrive documenti' : 'altro', marketplace: 'm',
    installato: i === 199, abilitato: i === 199, installazioni: 1000 - i
  }))
  it('senza ricerca: gli installati e i più installati, fino al tetto; il totale dice quanti sono', () => {
    const v = vetrina(catalogo, '', 30)
    expect(v.totale).toBe(200)
    expect(v.plugin).toHaveLength(31)
    expect(v.plugin[0]?.id).toBe('p199@m')
    expect(v.plugin[1]?.id).toBe('p0@m')
  })
  it('con una parola cerca in nome, descrizione e id', () => {
    const v = vetrina(catalogo, 'documenti', 30)
    expect(v.plugin.map((p) => p.id)).toEqual(['p150@m'])
    expect(v.totale).toBe(1)
  })
})

describe('comeMostrare: niente segreti sul telefono', () => {
  it('copre il valore dopo --token, i CHIAVE=valore da segreto, utente:password e i parametri da segreto', () => {
    expect(comeMostrare({ command: 'npx', args: ['server', '--api-key', 'abc', '--porta', '3000', 'API_TOKEN=xyz'] }))
      .toBe('npx server --api-key ••• --porta 3000 API_TOKEN=•••')
    expect(comeMostrare({ url: 'https://io:segreto@esempio.it/mcp?token=abc&lingua=it' })).toBe('https://•••@esempio.it/mcp?token=•••&lingua=it')
  })
})

describe('stati e testi', () => {
  it('ogni stato ha etichetta, tono e una spiegazione per esteso', () => {
    const tutti = [
      statoPlugin({ installato: false, abilitato: false, marketplace: 'm' }),
      statoPlugin({ installato: true, abilitato: true, marketplace: 'm' }),
      statoPlugin({ installato: true, abilitato: false, marketplace: 'm' }),
      statoPlugin({ installato: true, abilitato: true, marketplace: 'm', aggiornamento: true, versione: '1.0.0', versioneNuova: '1.1.0' }),
      statoSkill({ origine: 'utente', abilitata: true }),
      statoSkill({ origine: 'progetto', abilitata: false }),
      statoSkill({ origine: 'plugin', abilitata: true, plugin: 'saluta' }),
      statoSkill({ nome: 'rivedi', origine: 'utente', abilitata: true, override: 'user-invocable-only' }),
      statoMcp({ ambito: 'locale', config: 'attivo', salute: 'connesso' }),
      statoMcp({ ambito: 'locale', config: 'attivo', salute: 'errore', motivo: 'ECONNREFUSED' }),
      statoMcp({ ambito: 'progetto', config: 'da-approvare' }),
      statoMcp({ ambito: 'locale', config: 'spento' })
    ]
    for (const s of tutti) {
      expect(s.etichetta).not.toBe('')
      expect(s.spiegazione.length).toBeGreaterThan(40)
    }
    expect(tutti[3]?.etichetta).toBe('aggiornamento disponibile')
    expect(tutti[3]?.spiegazione).toContain('1.1.0')
    expect(tutti[7]?.spiegazione).toContain('/rivedi')
    expect(tutti[9]).toMatchObject({ etichetta: 'errore', tono: 'errore' })
    expect(tutti[9]?.spiegazione).toContain('ECONNREFUSED')
  })
  it('cosa cambia dopo un’azione: le skill subito, plugin e MCP dalla prossima chat', () => {
    expect(cosaCambia('attiva-skill')).toContain('anche nelle chat già aperte')
    expect(cosaCambia('installa')).toContain('/reload-plugins')
    expect(cosaCambia('disattiva-mcp')).toContain('che apri da adesso')
  })
})
