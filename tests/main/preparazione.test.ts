import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import {
  candidatiClaude,
  trovaClaude,
  avvisiDiSistema,
  preparaAmbiente,
  comandoAccesso,
  INSTALLA_CLAUDE,
  type Sistema
} from '../../src/main/preparazione'

const CASA = 'C:\\Users\\tizio'
const NATIVO = join(CASA, '.local', 'bin', 'claude.exe')

function sistema(opts: {
  env?: Record<string, string | undefined>
  presenti?: string[]
} = {}): Sistema {
  const presenti = new Set(opts.presenti ?? [])
  return {
    env: opts.env ?? {},
    casa: CASA,
    esiste: (p) => presenti.has(p)
  }
}

describe('candidatiClaude', () => {
  it('guarda per primo nella cartella dell installatore ufficiale', () => {
    // E' dove scrive `irm https://claude.ai/install.ps1 | iex`, ed e' anche
    // dove scrive l'aggiornamento automatico: chi non ha mai toccato niente
    // ce l'ha li', e va trovato senza dover leggere tutto il PATH.
    expect(candidatiClaude(sistema())[0]).toBe(NATIVO)
  })

  it('un percorso scelto a mano viene prima di tutto', () => {
    // Chi ha impostato GESTORE_CLAUDE_PATH ha fatto una scelta: se un'altra
    // copia trovata per caso nel PATH la scavalcasse, la variabile smetterebbe
    // di servire proprio a chi ne ha bisogno — chi ne ha due installate.
    const c = candidatiClaude(sistema({ env: { GESTORE_CLAUDE_PATH: 'D:\\mio\\claude.exe' } }))
    expect(c[0]).toBe('D:\\mio\\claude.exe')
  })

  it('ignora un percorso scelto a mano che non sia assoluto', () => {
    // Un percorso relativo verrebbe risolto rispetto alla cartella di lavoro
    // del processo, che non e' quella di nessuna chat: il riquadro si
    // aprirebbe vuoto e nessuno saprebbe perche'.
    const c = candidatiClaude(sistema({ env: { GESTORE_CLAUDE_PATH: 'claude.exe' } }))
    expect(c).not.toContain('claude.exe')
    expect(c[0]).toBe(NATIVO)
  })

  it('prova ogni cartella del PATH', () => {
    const c = candidatiClaude(sistema({ env: { Path: 'C:\\bin;D:\\altro' } }))
    expect(c).toContain(join('C:\\bin', 'claude.exe'))
    expect(c).toContain(join('D:\\altro', 'claude.exe'))
  })

  it('non ripete la stessa cartella due volte', () => {
    // Il PATH contiene spesso due volte la stessa cartella, e ogni candidato
    // costa una statistica di file a ogni avvio.
    const c = candidatiClaude(sistema({ env: { Path: 'C:\\bin;C:\\bin' } }))
    expect(c.filter((p) => p === join('C:\\bin', 'claude.exe'))).toHaveLength(1)
  })

  it('guarda anche dove mettono i collegamenti WinGet e npm', () => {
    // Sono i posti che restano fuori dal PATH finche' non si riapre la
    // sessione di Windows: chi ha appena installato Claude Code e' proprio
    // chi ha piu' bisogno che lo troviamo.
    const c = candidatiClaude(sistema({
      env: { LOCALAPPDATA: 'C:\\lad', APPDATA: 'C:\\ad' }
    }))
    expect(c).toContain(join('C:\\lad', 'Microsoft', 'WinGet', 'Links', 'claude.exe'))
    expect(c).toContain(join('C:\\ad', 'npm', 'claude.exe'))
  })
})

describe('trovaClaude', () => {
  it('restituisce il primo candidato che esiste davvero', () => {
    const s = sistema({ env: { Path: 'C:\\bin' }, presenti: [join('C:\\bin', 'claude.exe')] })
    expect(trovaClaude(s)).toBe(join('C:\\bin', 'claude.exe'))
  })

  it('preferisce l installazione nativa a una del PATH', () => {
    const s = sistema({
      env: { Path: 'C:\\bin' },
      presenti: [NATIVO, join('C:\\bin', 'claude.exe')]
    })
    expect(trovaClaude(s)).toBe(NATIVO)
  })

  it('senza nessuna copia non inventa un percorso', () => {
    // Restituire 'claude.exe' e sperare nel PATH e' esattamente il difetto da
    // cui si parte: chi ce l'ha fuori dal PATH vede i riquadri aprirsi vuoti
    // senza una spiegazione. Meglio dire che non c'e' e proporre di installarlo.
    expect(trovaClaude(sistema({ env: { Path: 'C:\\bin' } }))).toBeUndefined()
  })
})

describe('avvisiDiSistema', () => {
  it('avvisa quando Node.js non c e, senza bloccare niente', () => {
    // SierraDeck porta con se' il proprio Node: manca solo ai criteri di
    // verifica degli autopiloti, che lanciano npm nella cartella dell'utente.
    // Installare un runtime di sistema al posto di qualcuno si fa solo se lo
    // si e' chiesto, quindi qui si dice e basta.
    const avvisi = avvisiDiSistema(sistema({ env: { Path: 'C:\\bin' } }))
    expect(avvisi.some((a) => a.includes('Node.js'))).toBe(true)
  })

  it('avvisa quando manca Git per Windows, dicendo cosa costa', () => {
    const avvisi = avvisiDiSistema(sistema({ env: { Path: 'C:\\bin' } }))
    expect(avvisi.some((a) => a.includes('Git'))).toBe(true)
  })

  it('quando ci sono tutti non dice niente', () => {
    // Un avviso permanente smette di essere un avviso e diventa arredamento.
    const s = sistema({
      env: { Path: 'C:\\bin' },
      presenti: [join('C:\\bin', 'node.exe'), join('C:\\bin', 'git.exe')]
    })
    expect(avvisiDiSistema(s)).toEqual([])
  })
})

describe('preparaAmbiente', () => {
  it('mette insieme il percorso trovato e cio che manca', () => {
    const s = sistema({
      env: { Path: 'C:\\bin' },
      presenti: [NATIVO, join('C:\\bin', 'node.exe'), join('C:\\bin', 'git.exe')]
    })
    expect(preparaAmbiente(s)).toEqual({ claude: NATIVO, avvisi: [] })
  })

  it('senza Claude Code il campo resta assente, non una stringa vuota', () => {
    // Una stringa vuota passerebbe per un percorso e finirebbe sulla riga di
    // comando: node-pty fallirebbe con «File not found:» e un percorso vuoto.
    expect(preparaAmbiente(sistema()).claude).toBeUndefined()
  })
})

describe('comandi', () => {
  it('l installazione usa l installatore ufficiale, eseguito in memoria', () => {
    // Nessun allentamento della politica di esecuzione degli script: `iex` di
    // una stringa non e' un file di script, quindi non serve, e una difesa del
    // sistema non si abbassa per comodita' nostra.
    expect(INSTALLA_CLAUDE.command).toBe('powershell.exe')
    expect(INSTALLA_CLAUDE.args.join(' ')).toContain('https://claude.ai/install.ps1')
    expect(INSTALLA_CLAUDE.args).toContain('-NoProfile')
    expect(INSTALLA_CLAUDE.args.join(' ')).not.toContain('Bypass')
  })

  it('l accesso lancia claude senza argomenti', () => {
    // Lanciato senza argomenti, Claude Code apre il browser e aspetta: e' il
    // modo documentato di fare il login, e l'unico pezzo che resta all'utente
    // perche' sono le sue credenziali.
    expect(comandoAccesso(NATIVO)).toEqual({ command: NATIVO, args: [] })
  })
})
