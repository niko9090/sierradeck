import { describe, it, expect } from 'vitest'
import {
  componiPromptGiudizio, leggiGiudizio, chiediGiudizio, componiPromptScomposizione, leggiCompiti,
  argomentiSupervisore, componiPromptRiparazione, leggiComandoRiparato, ambientePulito,
  type Interrogazione
} from '../../src/autopilot-host/supervisore'
import { nuovoAutopilota } from '@shared/autopilota'

function ap() {
  return nuovoAutopilota({
    id: 'ap-1', nome: 'Test verdi', obiettivo: 'Fai passare la suite', cwd: 'C:\\p',
    criteri: [
      { descrizione: 'i test passano', comando: 'npm test', soddisfatto: false },
      { descrizione: 'la documentazione e aggiornata', soddisfatto: false }
    ],
    iniziatoIl: '2026-08-09T10:00:00.000Z'
  })
}

describe('componiPromptGiudizio', () => {
  it('contiene obiettivo, criteri e ultimo messaggio', () => {
    const p = componiPromptGiudizio(ap(), 'Ho sistemato il parser.')
    expect(p).toContain('Fai passare la suite')
    expect(p).toContain('la documentazione e aggiornata')
    expect(p).toContain('Ho sistemato il parser.')
  })

  it('chiede una risposta in JSON con i due campi previsti', () => {
    const p = componiPromptGiudizio(ap(), '')
    expect(p).toContain('"finito"')
    expect(p).toContain('"istruzioni"')
  })
})

describe('leggiGiudizio', () => {
  it('legge un JSON pulito', () => {
    expect(leggiGiudizio('{"finito": true, "istruzioni": ""}')).toEqual({ finito: true, istruzioni: '' })
  })

  it('legge un JSON circondato da chiacchiere', () => {
    // Un modello aggiunge volentieri una frase prima e dopo.
    const g = leggiGiudizio('Ecco la mia valutazione:\n{"finito": false, "istruzioni": "manca X"}\nSpero sia utile.')
    expect(g).toEqual({ finito: false, istruzioni: 'manca X' })
  })

  it('legge un JSON dentro un blocco di codice', () => {
    const g = leggiGiudizio('```json\n{"finito": false, "istruzioni": "manca Y"}\n```')
    expect(g?.istruzioni).toBe('manca Y')
  })

  it('restituisce undefined se non c e un JSON leggibile', () => {
    expect(leggiGiudizio('Direi che è finito, sì.')).toBeUndefined()
    expect(leggiGiudizio('')).toBeUndefined()
  })

  it('non si fa ingannare da un finito che non e booleano', () => {
    expect(leggiGiudizio('{"finito": "si", "istruzioni": ""}')).toBeUndefined()
  })

  it('accetta istruzioni mancanti quando dichiara finito', () => {
    expect(leggiGiudizio('{"finito": true}')).toEqual({ finito: true, istruzioni: '' })
  })
})

describe('chiediGiudizio', () => {
  it('passa il prompt e restituisce il giudizio letto', async () => {
    const visti: string[] = []
    const finta: Interrogazione = (prompt) => {
      visti.push(prompt)
      return Promise.resolve({
        testo: '{"finito": false, "istruzioni": "manca il test del caso vuoto"}',
        sessionId: 's-9'
      })
    }
    const { giudizio, sessionId } = await chiediGiudizio(ap(), 'fatto', finta)
    expect(visti[0]).toContain('Fai passare la suite')
    expect(giudizio?.istruzioni).toContain('caso vuoto')
    expect(sessionId).toBe('s-9')
  })

  it('un interrogazione che fallisce non solleva e non dichiara finito', async () => {
    // Se un errore del supervisore diventasse «finito», un guasto di rete
    // chiuderebbe da solo un lavoro incompleto.
    const rotta: Interrogazione = () => Promise.reject(new Error('claude non risponde'))
    const { giudizio } = await chiediGiudizio(ap(), 'fatto', rotta)
    expect(giudizio).toBeUndefined()
  })

  it('una risposta illeggibile non dichiara finito', async () => {
    const confusa: Interrogazione = () => Promise.resolve({ testo: 'boh' })
    const { giudizio } = await chiediGiudizio(ap(), 'fatto', confusa)
    expect(giudizio).toBeUndefined()
  })
})

describe('scomposizione in compiti', () => {
  it('il prompt chiede quanti compiti servono, non piu di quelli', () => {
    const p = componiPromptScomposizione(ap(), 3)
    expect(p).toContain('Fai passare la suite')
    expect(p).toContain('3')
    expect(p).toContain('"compiti"')
  })

  it('legge un elenco di compiti', () => {
    expect(leggiCompiti('{"compiti": ["scrivi i test", "aggiorna i documenti"]}'))
      .toEqual(['scrivi i test', 'aggiorna i documenti'])
  })

  it('legge un elenco circondato da chiacchiere', () => {
    expect(leggiCompiti('Ecco:\n{"compiti": ["uno"]}\nSpero vada bene.')).toEqual(['uno'])
  })

  it('scarta le voci vuote o non testuali', () => {
    expect(leggiCompiti('{"compiti": ["buono", "", 42, "   ", "altro"]}')).toEqual(['buono', 'altro'])
  })

  it('restituisce undefined se non c e un elenco leggibile', () => {
    // Chi chiama deve poter distinguere «nessuna scomposizione» da «una sola
    // chat»: nel dubbio si lavora con una chat, non con zero.
    expect(leggiCompiti('non ho capito')).toBeUndefined()
    expect(leggiCompiti('{"compiti": "uno solo"}')).toBeUndefined()
  })

  it('non restituisce un elenco vuoto', () => {
    expect(leggiCompiti('{"compiti": []}')).toBeUndefined()
  })
})

describe('permessi del supervisore', () => {
  it('lancia il giudizio senza richieste di permesso', () => {
    // Con un permesso da concedere il supervisore resterebbe fermo fino al
    // timeout, e l'autopilota si sospenderebbe per un giudizio mancato invece
    // che per un problema vero.
    const visti: string[][] = []
    const finto = (comando: string, args: string[]): void => { visti.push(args) }
    argomentiSupervisore('claude.exe', 'un prompt', 'C:\p', undefined, finto)
    expect(visti[0]).toContain('--dangerously-skip-permissions')
    expect(visti[0]).not.toContain('--permission-mode')
  })

  it('riprende la sessione di giudizio quando ne conosce una', () => {
    const visti: string[][] = []
    argomentiSupervisore('claude.exe', 'p', 'C:\p', 's-9', (_c, args) => { visti.push(args) })
    expect(visti[0]?.[visti[0].indexOf('--resume') + 1]).toBe('s-9')
  })

  it('sa nascere con una sessione decisa da noi, per poterla guardare mentre lavora', () => {
    // Senza, la sessione si conosce solo alla fine: durante la preparazione -
    // che dura minuti - il pannello non ha niente da mostrare e dice soltanto
    // «la chat non e' ancora partita».
    const visti: string[][] = []
    argomentiSupervisore('claude.exe', 'p', 'C:\p', undefined, (_c, args) => { visti.push(args) }, 's-nuova')
    expect(visti[0]?.[visti[0].indexOf('--session-id') + 1]).toBe('s-nuova')
  })

  it('non impone un id quando sta riprendendo: sarebbero due sessioni', () => {
    const visti: string[][] = []
    argomentiSupervisore('claude.exe', 'p', 'C:\p', 's-9', (_c, args) => { visti.push(args) }, 's-nuova')
    expect(visti[0]).not.toContain('--session-id')
    expect(visti[0]).toContain('--resume')
  })
})

describe('riparazione di un comando che non parte', () => {
  it('legge il comando proposto', () => {
    expect(leggiComandoRiparato('{"comando": "npx vitest run"}')).toBe('npx vitest run')
  })

  it('scarta un comando su piu righe', () => {
    // Un ritorno a capo dentro la stringa e' proprio cio' che aveva rotto il
    // comando originale: accettarlo rifarebbe il difetto da capo.
    expect(leggiComandoRiparato('{"comando": "riga uno\nriga due"}')).toBeUndefined()
  })

  it('scarta una risposta senza JSON o con un comando vuoto', () => {
    expect(leggiComandoRiparato('non ci sono riuscito')).toBeUndefined()
    expect(leggiComandoRiparato('{"comando": "   "}')).toBeUndefined()
  })

  it('il prompt porta con se l errore, il criterio e i vincoli', () => {
    const p = componiPromptRiparazione(
      { descrizione: 'i test passano', comando: "bash -lc 'x | wc -l)'" },
      'unexpected EOF while looking for matching )'
    )
    expect(p).toContain('i test passano')
    expect(p).toContain('unexpected EOF')
    expect(p).toContain('uscire con 0')
  })
})

describe('l ambiente con cui parte il supervisore', () => {
  it('non consegna ELECTRON_RUN_AS_NODE a claude.exe', () => {
    // Il servizio nasce con quella variabile a 1 — serve a farlo girare come
    // Node — e prosegue in ogni processo che lancia. Arrivata a claude.exe lo
    // fa partire come Node puro: esce con un errore, e da fuori si vede solo
    // «Command failed». Le chat non ne soffrivano perché il PTY host ripulisce
    // già lo stesso elenco: la regola c'era e non era applicata qui.
    const env = ambientePulito({ ELECTRON_RUN_AS_NODE: '1', PATH: '/usr/bin' })
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined()
    expect(env.PATH).toBe('/usr/bin')
  })

  it('nemmeno i marcatori della sessione che ha lanciato il gestore', () => {
    // Ereditandoli, la chat del supervisore non salverebbe la trascrizione.
    const env = ambientePulito({
      CLAUDE_CODE_SESSION_ID: 'x',
      CLAUDE_CODE_CHILD_SESSION: 'y',
      CLAUDE_PID: '123',
      HOME: '/casa'
    })
    expect(Object.keys(env)).toEqual(['HOME'])
  })

  it('tutto il resto passa: e l ambiente dell utente, non il nostro', () => {
    const env = ambientePulito({ ANTHROPIC_BASE_URL: 'https://x', LANG: 'it_IT' })
    expect(env).toEqual({ ANTHROPIC_BASE_URL: 'https://x', LANG: 'it_IT' })
  })
})
