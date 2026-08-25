import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { commutaSkill, commutaMcp } from '../../src/main/negozio/azioni'
import { skillDisponibili, mcpDiProgetto, agentiDisponibili } from '../../src/main/negozio/lettura'
import { idDi, interpreta } from '../../src/main/negozio/cli'

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

describe('commutaMcp', () => {
  it('disattiva un MCP senza toccare il resto di .claude.json', () => {
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

    const dopo = JSON.parse(readFileSync(claudeJson, 'utf8'))
    // La chiave voluta è cambiata…
    expect(dopo.projects['/mio'].disabledMcpjsonServers).toEqual(['uno'])
    // …e tutto il resto è identico.
    expect(dopo.numStartups).toBe(42)
    expect(dopo.mcpServers).toEqual({ globale: { command: 'x' } })
    expect(dopo.projects['/altro']).toEqual({ mcpServers: { suo: { url: 'http://a' } } })
    expect(dopo.projects['/mio'].mcpServers).toEqual({ uno: { command: 'a' }, due: { url: 'http://b' } })
    expect(dopo.projects['/mio'].allowedTools).toEqual(['Read'])
  })

  it('riattivare toglie la voce dai disabilitati, e la lettura lo riflette', () => {
    scriviJson(claudeJson, {
      projects: { '/mio': { mcpServers: { uno: { command: 'a' } }, disabledMcpjsonServers: ['uno'] } }
    })
    expect(mcpDiProgetto(claudeJson, '/mio')[0]?.abilitato).toBe(false)

    commutaMcp(claudeJson, '/mio', 'uno', true)
    const dopo = JSON.parse(readFileSync(claudeJson, 'utf8'))
    expect(dopo.projects['/mio'].disabledMcpjsonServers).toBeUndefined()
    expect(mcpDiProgetto(claudeJson, '/mio')[0]?.abilitato).toBe(true)
  })

  it('non scrive e segnala se il file è illeggibile', () => {
    writeFileSync(claudeJson, '{ rotto', 'utf8')
    const esito = commutaMcp(claudeJson, '/mio', 'uno', false)
    expect(esito.ok).toBe(false)
    // Il file resta com'era: meglio un'azione mancata che una corrotta.
    expect(readFileSync(claudeJson, 'utf8')).toBe('{ rotto')
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
