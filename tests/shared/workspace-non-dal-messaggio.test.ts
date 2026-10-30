import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { controllaBozzaAutopilota, BOZZA_AUTOPILOTA_VUOTA, nomeDaCartella, nomeDaObiettivo, nomeScritto, workspaceDellAutopilota } from '../../src/shared/azioni-telefono'

/**
 * Il caso del 19/10 (0.80.0): il primo messaggio all'autopilota diventava il
 * nome di un workspace, con la sua cartella. Il nome del workspace viene dal
 * nome scritto da Nicholas o dalla cartella in cui lavora, mai dal messaggio.
 */
const messaggio = 'dentro al mio server di prova c’è già un sito da sistemare'
const cwd = 'X:\\Progetti\\sito-di-prova'

describe('il nome del workspace di un autopilota', () => {
  it('senza nome scritto: la cartella, non le prime parole del messaggio', () => {
    expect(workspaceDellAutopilota(nomeDaObiettivo(messaggio), cwd, messaggio)).toBe('sito-di-prova')
  })

  it('il telefono manda il nome già ricavato dal messaggio: conta come non scritto', () => {
    const b = controllaBozzaAutopilota({ ...BOZZA_AUTOPILOTA_VUOTA, obiettivo: messaggio, cwd })
    expect(b.ok).toBe(true)
    if (!b.ok) return
    expect(nomeScritto(b.richiesta.nome, b.richiesta.obiettivo)).toBe('')
    expect(workspaceDellAutopilota(b.richiesta.nome, b.richiesta.cwd, b.richiesta.obiettivo)).toBe('sito-di-prova')
  })

  it('un nome scritto da Nicholas si usa', () => {
    expect(nomeScritto('Sito nuovo', messaggio)).toBe('Sito nuovo')
    expect(workspaceDellAutopilota('Sito nuovo', cwd, messaggio)).toBe('Sito nuovo')
  })

  it('la cartella con la barra in fondo dà lo stesso nome', () => {
    expect(nomeDaCartella('X:\\Progetti\\sito-di-prova\\')).toBe('sito-di-prova')
    expect(nomeDaCartella('/home/prova/sito/')).toBe('sito')
  })

  it('senza obiettivo resta il comportamento di prima (nome, poi cartella)', () => {
    expect(workspaceDellAutopilota('Nome', cwd)).toBe('Nome')
    expect(workspaceDellAutopilota('', cwd)).toBe('sito-di-prova')
  })
})

describe('sul PC: il pannello Autopiloti', () => {
  it('non crea più autopiloti né workspace dal messaggio (30/10: uno per workspace)', () => {
    const src = readFileSync('src/renderer/components/PannelloAutopiloti.tsx', 'utf8')
    expect(src).not.toContain('nomeWorkspacePerAutopilota')
    expect(src).not.toContain("r.obiettivo.split(/\\s+/).slice(0, 4)")
  })

  it('da lontano (pagina e app) il PC passa l’obiettivo, così il nome ricavato non vale', () => {
    expect(readFileSync('src/main/index.ts', 'utf8')).toContain("workspaceDellAutopilota(r.nome ?? '', r.cwd, r.obiettivo)")
  })
})
