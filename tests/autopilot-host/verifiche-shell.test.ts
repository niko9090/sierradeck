import { describe, it, expect } from 'vitest'
import {
  bashCandidati, bashDaGit, comandoShell, esecutoreReale, nomeScript,
  nonMisurabile, trovaBash, trovaGit
} from '../../src/autopilot-host/verifiche'

describe('trovaBash', () => {
  it('prende il primo che esiste davvero', () => {
    const esiste = (p: string): boolean => p === 'C:\\seconda\\bash.exe'
    expect(trovaBash(['C:\\prima\\bash.exe', 'C:\\seconda\\bash.exe'], esiste))
      .toBe('C:\\seconda\\bash.exe')
  })

  it('senza bash non inventa un percorso', () => {
    expect(trovaBash(['C:\\niente\\bash.exe'], () => false)).toBeUndefined()
  })
})

describe('bashDaGit', () => {
  it('propone la bash della radice partendo da git in cmd', () => {
    // Il caso reale su questa macchina: git non è sotto C:\Program Files.
    const c = bashDaGit('E:\\Programs\\Git\\cmd\\git.exe')
    expect(c).toContain('E:\\Programs\\Git\\bin\\bash.exe')
    expect(c).toContain('E:\\Programs\\Git\\usr\\bin\\bash.exe')
  })

  it('trova la radice anche partendo dalla git di mingw64', () => {
    // Dentro Git Bash il PATH mette per primo <radice>\mingw64\bin\git.exe:
    // la bash sta due livelli più su, non accanto a git.
    const c = bashDaGit('E:\\Programs\\Git\\mingw64\\bin\\git.exe')
    expect(c).toContain('E:\\Programs\\Git\\bin\\bash.exe')
    expect(c).toContain('E:\\Programs\\Git\\usr\\bin\\bash.exe')
  })
})

describe('trovaGit', () => {
  it('trova git scandendo le cartelle del PATH', () => {
    const path = 'C:\\altro;E:\\Programs\\Git\\cmd;C:\\ancora'
    const esiste = (p: string): boolean => p === 'E:\\Programs\\Git\\cmd\\git.exe'
    expect(trovaGit(path, esiste)).toBe('E:\\Programs\\Git\\cmd\\git.exe')
  })

  it('senza git nel PATH torna indefinito', () => {
    expect(trovaGit('C:\\niente;D:\\nemmeno', () => false)).toBeUndefined()
  })
})

describe('bashCandidati', () => {
  it('include la bash derivata dal git nel PATH e i percorsi noti', () => {
    const path = 'E:\\Programs\\Git\\cmd'
    const esiste = (p: string): boolean => p === 'E:\\Programs\\Git\\cmd\\git.exe'
    const candidati = bashCandidati(path, esiste)
    expect(candidati).toContain('E:\\Programs\\Git\\bin\\bash.exe')
    expect(candidati).toContain('C:\\Program Files\\Git\\bin\\bash.exe')
  })

  it('propone anche la bash direttamente presente in una cartella del PATH', () => {
    // Dentro Git Bash `usr\bin` è nel PATH e contiene bash.exe.
    const path = 'E:\\Programs\\Git\\usr\\bin'
    const candidati = bashCandidati(path, () => false)
    expect(candidati).toContain('E:\\Programs\\Git\\usr\\bin\\bash.exe')
  })

  it('senza git nel PATH restano comunque i percorsi noti', () => {
    const candidati = bashCandidati('C:\\niente', () => false)
    expect(candidati).toContain('C:\\Program Files\\Git\\bin\\bash.exe')
    expect(candidati).toContain('C:\\Program Files (x86)\\Git\\bin\\bash.exe')
    expect(candidati).toContain('C:\\Program Files\\Git\\usr\\bin\\bash.exe')
  })
})

describe('comandoShell', () => {
  it('con bash gli passa lo script, non il comando', () => {
    // E' tutto il punto: un comando con apici e pipe non deve attraversare
    // nessun livello che possa reinterpretarlo, e un file non va citato.
    const { file, argomenti } = comandoShell('C:\\Git\\bin\\bash.exe', 'C:\\t\\criterio.sh')
    expect(file).toBe('C:\\Git\\bin\\bash.exe')
    expect(argomenti).toContain('C:\\t\\criterio.sh')
  })

  it('senza bash ripiega su cmd', () => {
    const { file, argomenti } = comandoShell(undefined, 'C:\\t\\criterio.cmd')
    expect(file).toBe('cmd.exe')
    expect(argomenti).toEqual(['/d', '/s', '/c', 'C:\\t\\criterio.cmd'])
  })

  it('lo script ha l estensione che la shell sa eseguire', () => {
    expect(nomeScript('C:\\Git\\bin\\bash.exe')).toMatch(/\.sh$/)
    expect(nomeScript(undefined)).toMatch(/\.cmd$/)
  })
})

describe('nonMisurabile', () => {
  it('riconosce un comando che la shell non ha capito', () => {
    // Il caso vero: `cmd` spezzava `bash -lc '... | wc -l)'` sulla pipe, e
    // bash riceveva un pezzo senza chiusura.
    expect(nonMisurabile(2, 'bash: -c: line 2: unexpected EOF while looking for matching `)\'')).toBe(true)
    expect(nonMisurabile(1, 'SyntaxError: Invalid or unexpected token')).toBe(true)
  })

  it('riconosce un comando che non esiste', () => {
    expect(nonMisurabile(127, 'vitest: command not found')).toBe(true)
    expect(nonMisurabile(9009, "'npx' non è riconosciuto come comando interno")).toBe(true)
  })

  it('un test rosso resta un test rosso', () => {
    // Qui il comando ha funzionato benissimo: e' il criterio a non essere
    // soddisfatto, ed e' esattamente cio' su cui la chat deve lavorare.
    expect(nonMisurabile(1, 'Tests  3 failed | 915 passed')).toBe(false)
    expect(nonMisurabile(1, 'file di test: 61')).toBe(false)
  })
})

describe('esecutoreReale', () => {
  it('esegue un comando che cmd spezzerebbe', async () => {
    // La riproduzione esatta del criterio che teneva fermo l'autopilota: con
    // `exec` questo diventava «wc: unknown option -- )».
    const comando = `n=$(echo "uno due tre" | wc -w); echo "parole: $n"; [ "$n" -eq 3 ]`
    const { codice, uscita } = await esecutoreReale(60_000)(comando, process.cwd())
    expect(uscita).toContain('parole: 3')
    expect(codice).toBe(0)
  })

  it('un criterio non soddisfatto esce con un codice diverso da zero', async () => {
    const { codice } = await esecutoreReale(60_000)('[ 1 -eq 2 ]', process.cwd())
    expect(codice).not.toBe(0)
  })

  it('non aspetta i processi che il criterio lascia in background', async () => {
    // Riprodotto sul campo: un criterio che avvia un server con `&` finiva la
    // sua parte in un secondo, ma la risposta arrivava al **timeout** - dieci
    // minuti, con tutti i criteri successivi fermi dietro. La ragione e' che
    // il figlio in background eredita `stdout`/`stderr` e le tiene aperte, e
    // la callback di `execFile` scatta alla chiusura delle pipe, non
    // all'uscita del processo.
    const TETTO_MS = 20_000
    const t0 = Date.now()
    const { uscita } = await esecutoreReale(TETTO_MS)(
      ['sleep 30 &', 'sleep 1', 'echo fatto'].join('\n'), process.cwd()
    )
    const passato = Date.now() - t0
    expect(uscita).toContain('fatto')
    // La misura e' contro il **tetto**, non contro un numero assoluto: senza la
    // correzione questo comando ci mette esattamente `TETTO_MS`, con la
    // correzione il tempo del comando piu' l'avvio della shell. Un margine
    // largo perche' la suite intera gira in parallelo e su una macchina carica
    // aprire `bash` puo' costare qualche secondo: e' la distanza dal tetto a
    // dire se la correzione c'e', non il valore preciso.
    expect(passato).toBeLessThan(TETTO_MS / 2)
  }, 40_000)
})
