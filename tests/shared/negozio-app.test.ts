import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pluginDaCli } from '../../src/main/negozio/cli'
import { conSalute } from '../../src/main/negozio/mcp'
import { statoMcp, statoSkill, vetrina, type McpVoce } from '../../src/shared/negozio'

/**
 * La risposta di `/api/negozio` di un computer alla 0.53.0, composta con le
 * funzioni vere dalle risposte vere del CLI 2.1.294. L'app la legge da
 * `android/app/src/test/resources/negozio/api-negozio-0.53.json`
 * (NegozioVistaTest): se il formato cambia qui, questo test lo dice prima
 * che lo scopra il telefono.
 */
export function rispostaDiEsempio(dir = join(__dirname, '..', 'fixtures', 'claude-2.1.294-negozio')): Record<string, unknown> {
  const fx = (f: string): string => readFileSync(join(dir, f), 'utf8')
  const plugin = pluginDaCli(JSON.parse(fx('available-dopo-mkt.json')))
  const v = vetrina(plugin, '', 30)
  const mcpBase: McpVoce[] = [
    { nome: 'finto', ambito: 'locale', tipo: 'stdio', come: 'node C:/Progetti/Esempio/mcp-finto.js', variabili: ['PROVA_CHIAVE'], intestazioni: [], config: 'attivo', abilitato: true },
    { nome: 'condiviso', ambito: 'progetto', tipo: 'stdio', come: 'node C:/Progetti/Esempio/mcp-finto.js', variabili: [], intestazioni: [], config: 'da-approvare', abilitato: false },
    { nome: 'rotto', ambito: 'utente', tipo: 'http', come: 'http://127.0.0.1:9/mcp', variabili: [], intestazioni: ['Authorization'], config: 'attivo', abilitato: true }
  ].map((m) => ({ ...m, ambito: m.ambito as McpVoce['ambito'], config: m.config as McpVoce['config'], stato: statoMcp(m as McpVoce) }))
  const mcp = conSalute(mcpBase, fx('mcp-list-errori.txt') + fx('mcp-list.txt'))
  const skill = [
    { nome: 'revisione-testi', descrizione: 'Rivede i testi', origine: 'utente' as const, percorso: 'C:/Utenti/esempio/.claude/skills/revisione-testi', abilitata: true },
    { nome: 'saluta:ciao', descrizione: 'Dice ciao', origine: 'plugin' as const, percorso: 'C:/Utenti/esempio/.claude/plugins/cache/prova-mkt/saluta/1.1.0/skills/ciao', abilitata: true, plugin: 'saluta' }
  ].map((s) => ({ ...s, stato: statoSkill(s) }))
  return { plugin: v.plugin, totalePlugin: v.totale, skill, agenti: [], mcp, cartella: 'C:/Progetti/Esempio' }
}

describe('la risposta del negozio che legge l’app', () => {
  it('è quella del file che usano i test dell’app', () => {
    const file = join(__dirname, '..', '..', 'android', 'app', 'src', 'test', 'resources', 'negozio', 'api-negozio-0.53.json')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(JSON.parse(JSON.stringify(rispostaDiEsempio())))
  })
})
