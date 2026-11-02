import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ePesante } from '../../src/autopilot-host/criteri-veloci'
import { creaTurni } from '../../src/autopilot-host/turni-criteri'
import { giudicaPesanteDellaChat } from '../../src/autopilot-host/guardia-pc'
import { fileImpostazioniCli } from '../../src/autopilot-host/agenti-orchestratore'
import { lavoroFermo, testoLavoroFermo } from '../../src/autopilot-host/lavoro-fermo'
import { aggiungi, codaVuota, conRichiesta, type Coda } from '@shared/coda-richieste'
import type { CompitoPiano, Piano } from '@shared/piano-orchestratore'

/**
 * 0.89.4, dalla prova dal vero del 02/11 (servizio isolato, due progetti, Opus):
 * un `npm test` di mezzo secondo teneva il turno dei pesanti 2 minuti e 15, e
 * il criterio dello stesso compito aspettava in fila dietro di lui.
 */

function progetto(test: string): string {
  const d = mkdtempSync(join(tmpdir(), 'sd-pesante-'))
  writeFileSync(join(d, 'package.json'), JSON.stringify({ name: 'p', scripts: { test } }))
  return d
}

describe('npm test è pesante solo se lo è il suo script (0.89.4)', () => {
  it('node test.js no; vitest, jest e gli script che ne lanciano altri sì', () => {
    expect(ePesante('npm test', progetto('node test.js'))).toBe(false)
    expect(ePesante('npm run test', progetto('node --test'))).toBe(false)
    expect(ePesante('npm test', progetto('vitest run'))).toBe(true)
    expect(ePesante('npm test', progetto('jest --ci'))).toBe(true)
    expect(ePesante('npm test', progetto('npm run build && node t.js'))).toBe(true)
  })

  it('senza cartella, con un cd, senza package.json o con un pezzo pesante: come prima', () => {
    const leggero = progetto('node test.js')
    expect(ePesante('npm test')).toBe(true)
    expect(ePesante('cd sotto && npm test', leggero)).toBe(true)
    expect(ePesante('npm test', mkdtempSync(join(tmpdir(), 'sd-vuota-')))).toBe(true)
    expect(ePesante('npm test && npx vitest run', leggero)).toBe(true)
    // Il criterio del 02/11: un controllo veloce e poi npm test.
    expect(ePesante('node -e "process.exit(0)" && npm test', leggero)).toBe(false)
  })

  it('una chat che lancia npm test leggero non prende il turno: l’altra passa subito', () => {
    const leggero = progetto('node test.js')
    const turni = creaTurni({ ora: () => 1000 })
    const comando = (command: string): Record<string, unknown> => ({ tool_name: 'Bash', tool_input: { command } })
    expect(giudicaPesanteDellaChat(comando('npm test'), { chi: 'a::-', cwd: leggero, turni, ora: 1000 }).ok).toBe(true)
    expect(turni.prenotato()).toBeUndefined()
    expect(giudicaPesanteDellaChat(comando('npm test'), { chi: 'b::-', cwd: leggero, turni, ora: 1000 }).ok).toBe(true)
  })
})

describe('l’autopilota dice al servizio quando un comando finisce (0.89.4)', () => {
  it('PostToolUse sulle shell, verso il rapporto che rende il turno', () => {
    const f = JSON.parse(fileImpostazioniCli(47630, 'ap-1')) as { hooks: { PostToolUse?: { matcher: string; hooks: { url: string }[] }[] } }
    expect(f.hooks.PostToolUse?.[0]?.matcher).toBe('Bash|PowerShell')
    expect(f.hooks.PostToolUse?.[0]?.hooks[0]?.url).toBe('http://127.0.0.1:47630/hook/rapporto?ap=ap-1')
  })
})

describe('il lavoro fermo (0.89.4)', () => {
  const T = '2026-11-02T12:00:00.000Z'
  const compito = (id: string, p: Partial<CompitoPiano> = {}): CompitoPiano => ({ id, richiesta: 'r-1', titolo: id, criterio: 'x', dopo: [], peso: 1, stato: 'da-fare', creato: T, ...p })
  const piano = (...c: CompitoPiano[]): Piano => ({ versione: 1, compiti: c })
  function coda(): Coda {
    let c = aggiungi(codaVuota('W'), { testo: 'la barra', quando: T }).coda
    c = conRichiesta(c, 'r-1', (r) => ({ ...r, stato: 'in-corso', compiti: ['k-1', 'k-2', 'k-3', 'k-4', 'k-5'] }))
    return c
  }

  it('dice cosa potrebbe muoversi: pronto, orfano, da unire, rosso; non quello che aspetta un altro compito', () => {
    const f = lavoroFermo({
      coda: coda(),
      alLavoro: new Set(['vivo']),
      piano: piano(
        compito('k-1', { stato: 'unito', criterioVerde: true }),
        compito('k-2', { dopo: ['k-1'] }),
        compito('k-3', { stato: 'in-corso', chat: 'morto' }),
        compito('k-4', { stato: 'in-revisione', esito: 'unione non fatta: conflitto' }),
        compito('k-5', { stato: 'unito', criterioVerde: false, esito: '`npm test` non passa' }),
        compito('k-6', { dopo: ['k-3'] }),
        compito('k-7', { stato: 'in-corso', chat: 'vivo' })
      )
    })
    expect(f?.righe.join('\n')).toMatch(/k-2 pronto da affidare/)
    expect(f?.righe.join('\n')).toMatch(/k-3 risulta in corso ma nessuno/)
    expect(f?.righe.join('\n')).toMatch(/k-4 finito e non unito \(unione non fatta: conflitto\)/)
    expect(f?.righe.join('\n')).toMatch(/k-5 unito con il criterio rosso/)
    expect(f?.firma).not.toMatch(/k-6|k-7|k-1/)
  })

  it('una richiesta senza piano conta; una fatta no; niente da muovere: niente', () => {
    const c = aggiungi(coda(), { testo: 'e poi il menu', quando: T }).coda
    expect(lavoroFermo({ coda: c, piano: piano(compito('k-1', { stato: 'unito', criterioVerde: true })), alLavoro: new Set() })?.righe).toEqual([expect.stringContaining('r-2 senza piano')])
    const fatta = conRichiesta(coda(), 'r-1', (r) => ({ ...r, stato: 'fatta' }))
    expect(lavoroFermo({ coda: fatta, piano: piano(compito('k-2')), alLavoro: new Set() })).toBeUndefined()
  })

  it('il testo dice di andare avanti, e con domande aperte di aspettare solo ciò che dipende da loro', () => {
    const f = { firma: 'k-2:pronto', righe: ['- k-2 pronto da affidare: x'] }
    expect(testoLavoroFermo(f, 3, 0)).toMatch(/fermo da 3 minuti[\s\S]*Vai avanti adesso[\s\S]*Non chiedere «procedo\?»/)
    expect(testoLavoroFermo(f, 3, 2)).toMatch(/2 domande aperte/)
  })
})
