import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  apriScopeStore, scopeVuoto, scopeInerte, componiScope, fondiImpostazioni, leggiGlobaliPerScope
} from '../../src/main/negozio/scope'

/**
 * Lo scoping per-chat compone le `--settings` sul percorso di avvio delle chat:
 * un errore qui spegne o riaccende la cosa sbagliata. Questi test bloccano il
 * comportamento che conta — mappe SEMPRE complete (dai globali), e nessun tocco
 * quando non c'è niente da fare.
 */

describe('componiScope', () => {
  it('senza spegnimenti non produce niente', () => {
    const out = componiScope({
      scope: scopeVuoto(),
      enabledPluginGlobali: { 'a@m': true },
      skillOverridesGlobali: {},
      mcpDisabilitatiProgetto: []
    })
    expect(out).toEqual({})
  })

  it('spegne un plugin PARTENDO dalla mappa globale (non la sostituisce)', () => {
    const out = componiScope({
      scope: { pluginSpenti: ['b@m'], skillSpente: [], mcpSpenti: [] },
      enabledPluginGlobali: { 'a@m': true, 'b@m': true },
      skillOverridesGlobali: {},
      mcpDisabilitatiProgetto: []
    })
    // a@m resta true (non lo perdiamo), b@m diventa false.
    expect(out.enabledPlugins).toEqual({ 'a@m': true, 'b@m': false })
    expect(out.skillOverrides).toBeUndefined()
  })

  it('spegne una skill sopra gli override globali', () => {
    const out = componiScope({
      scope: { pluginSpenti: [], skillSpente: ['mia'], mcpSpenti: [] },
      enabledPluginGlobali: {},
      skillOverridesGlobali: { altra: 'off' },
      mcpDisabilitatiProgetto: []
    })
    expect(out.skillOverrides).toEqual({ altra: 'off', mia: 'off' })
  })

  it('unisce gli MCP spenti a quelli già disabilitati nel progetto, senza doppioni', () => {
    const out = componiScope({
      scope: { pluginSpenti: [], skillSpente: [], mcpSpenti: ['uno', 'due'] },
      enabledPluginGlobali: {},
      skillOverridesGlobali: {},
      mcpDisabilitatiProgetto: ['uno', 'tre']
    })
    expect(new Set(out.disabledMcpjsonServers as string[])).toEqual(new Set(['uno', 'due', 'tre']))
  })
})

describe('fondiImpostazioni', () => {
  it('fonde gli hook dell’autopilota con lo scope, senza perdere nessuno dei due', () => {
    const autop = JSON.stringify({ hooks: { Stop: [{ type: 'http' }] } })
    const scopeObj = { enabledPlugins: { 'x@m': false } }
    const s = fondiImpostazioni(autop, scopeObj)
    const o = JSON.parse(s ?? '{}')
    expect(o.hooks).toBeDefined()
    expect(o.enabledPlugins).toEqual({ 'x@m': false })
  })

  it('senza autopilota e senza scope non passa nessun --settings', () => {
    expect(fondiImpostazioni(undefined, {})).toBeUndefined()
  })

  it('solo scope: torna il JSON dello scope', () => {
    const s = fondiImpostazioni(undefined, { skillOverrides: { a: 'off' } })
    expect(JSON.parse(s ?? '{}')).toEqual({ skillOverrides: { a: 'off' } })
  })

  it('solo autopilota: lo lascia intatto', () => {
    const autop = JSON.stringify({ hooks: { Stop: [] } })
    expect(fondiImpostazioni(autop, {})).toBe(autop)
  })
})

describe('scopeInerte', () => {
  it('è inerte solo se tutte le liste sono vuote', () => {
    expect(scopeInerte(scopeVuoto())).toBe(true)
    expect(scopeInerte({ pluginSpenti: ['x'], skillSpente: [], mcpSpenti: [] })).toBe(false)
  })
})

describe('lo store dello scope', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'sd-scope-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('salva e rilegge lo scope di una cartella', () => {
    const s = apriScopeStore(dir)
    s.imposta('/progetto', { pluginSpenti: ['a@m'], skillSpente: [], mcpSpenti: ['srv'] })
    expect(apriScopeStore(dir).leggi('/progetto')).toEqual({ pluginSpenti: ['a@m'], skillSpente: [], mcpSpenti: ['srv'] })
  })

  it('una cartella senza scope torna vuota', () => {
    expect(apriScopeStore(dir).leggi('/mai-visto')).toEqual(scopeVuoto())
  })

  it('impostare uno scope vuoto toglie la voce, non la lascia vuota', () => {
    const s = apriScopeStore(dir)
    s.imposta('/p', { pluginSpenti: ['a@m'], skillSpente: [], mcpSpenti: [] })
    s.imposta('/p', scopeVuoto())
    expect(apriScopeStore(dir).leggi('/p')).toEqual(scopeVuoto())
  })
})

describe('leggiGlobaliPerScope', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'sd-glob-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('legge enabledPlugins/skillOverrides dal settings e i MCP disabilitati del progetto', () => {
    const radice = join(dir, '.claude')
    mkdirSync(radice, { recursive: true })
    writeFileSync(join(radice, 'settings.json'), JSON.stringify({
      enabledPlugins: { 'a@m': true, 'b@m': false },
      skillOverrides: { s: 'off' }
    }))
    const claudeJson = join(dir, '.claude.json')
    writeFileSync(claudeJson, JSON.stringify({ projects: { '/p': { disabledMcpjsonServers: ['srv1'] } } }))

    const g = leggiGlobaliPerScope({ radiceClaude: radice, fileClaudeJson: claudeJson, cwd: '/p' })
    expect(g.enabledPluginGlobali).toEqual({ 'a@m': true, 'b@m': false })
    expect(g.skillOverridesGlobali).toEqual({ s: 'off' })
    expect(g.mcpDisabilitatiProgetto).toEqual(['srv1'])
  })

  it('file mancanti = globali vuoti, non un errore', () => {
    const g = leggiGlobaliPerScope({ radiceClaude: join(dir, 'niente'), fileClaudeJson: join(dir, 'niente.json'), cwd: '/p' })
    expect(g.enabledPluginGlobali).toEqual({})
    expect(g.skillOverridesGlobali).toEqual({})
    expect(g.mcpDisabilitatiProgetto).toEqual([])
  })
})

// Verifica dell'invariante che conta di più: readFileSync per confermare che
// il file su disco resta JSON valido dopo un salvataggio.
describe('il file dello scope resta sano', () => {
  it('scrive JSON rileggibile', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sd-scope2-'))
    try {
      apriScopeStore(dir).imposta('/p', { pluginSpenti: ['a@m'], skillSpente: ['s'], mcpSpenti: [] })
      const grezzo = readFileSync(join(dir, 'negozio-scope.json'), 'utf8')
      expect(() => JSON.parse(grezzo)).not.toThrow()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
