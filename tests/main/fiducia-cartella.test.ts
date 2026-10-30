import { describe, it, expect } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  cartellaPericolosa, cartellaQualificata, cartelleAutopiloti, chiaveProgetto, creaFiduciaNelTerminale,
  fidatiPrimaDiAvviare, NASCOSTA_PER_MS, repoDelWorktree, segnaFidata, tastiPerFidarsi, type CartelleNote
} from '../../src/main/fiducia-cartella'

/**
 * La fiducia nelle cartelle (30/10): la domanda «Do you trust the files in
 * this folder?» non deve fermare le chat di SierraDeck, e non deve mai essere
 * accettata fuori dalle cartelle che SierraDeck conosce. Il `.claude.json` qui
 * è sempre in una cartella temporanea (la casa dei test è finta).
 */

const W = 'win32' as const
const NOTE: CartelleNote = {
  casa: 'C:\\Users\\nikof',
  progetti: ['C:\\Users\\nikof\\Progetti SierraDeck'],
  cartelle: ['E:\\Users\\nikof\\Documents\\SierraDeck', 'E:\\Lavori\\app\\web']
}

function fileFinto(contenuto: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'fiducia-'))
  const f = join(dir, '.claude.json')
  writeFileSync(f, contenuto, 'utf8')
  return f
}

describe('la casa dei test', () => {
  it('è finta: niente qui può arrivare al .claude.json vero', () => {
    expect(process.env.SIERRADECK_TEST_FINTA).toBeTruthy()
    expect(homedir().toLowerCase()).toContain(String(process.env.SIERRADECK_TEST_FINTA).toLowerCase())
  })
})

describe('la chiave di .claude.json', () => {
  it('su Windows: barre in avanti, lettera del disco maiuscola, niente barra in fondo', () => {
    expect(chiaveProgetto('E:\\Users\\nikof\\Documents\\SierraDeck', W)).toBe('E:/Users/nikof/Documents/SierraDeck')
    expect(chiaveProgetto('e:\\Users\\nikof\\Documents\\SierraDeck\\', W)).toBe('E:/Users/nikof/Documents/SierraDeck')
    expect(chiaveProgetto('E:/Users/nikof/Documents/SierraDeck.sierradeck-wt/ap-f1e631f5-c-5', W)).toBe('E:/Users/nikof/Documents/SierraDeck.sierradeck-wt/ap-f1e631f5-c-5')
  })
  it('altrove: il percorso com’è', () => {
    expect(chiaveProgetto('/home/n/progetto/', 'linux')).toBe('/home/n/progetto')
  })
})

describe('quali cartelle', () => {
  it('rifiuta la casa, la radice di un disco, una cartella che contiene la casa, una condivisione di rete', () => {
    for (const c of ['C:\\Users\\nikof', 'C:\\Users\\nikof\\', 'c:/users/NIKOF', 'C:\\', 'E:\\', 'E:', 'C:\\Users', '\\\\server\\share', '']) {
      expect(cartellaPericolosa(c, NOTE.casa, W), c).toBe(true)
      expect(cartellaQualificata(c, { ...NOTE, cartelle: [...NOTE.cartelle, c], progetti: [...NOTE.progetti, c] }, W), c).toBe(false)
    }
    expect(cartellaPericolosa('/', '/home/n', 'linux')).toBe(true)
    expect(cartellaPericolosa('/home', '/home/n', 'linux')).toBe(true)
    expect(cartellaPericolosa('/home/n/p', '/home/n', 'linux')).toBe(false)
  })
  it('una casa (o un disco) fra i progetti non rende fidato quello che c’è sotto', () => {
    const note = { ...NOTE, progetti: ['C:\\Users\\nikof', 'D:\\'] }
    expect(cartellaQualificata('C:\\Users\\nikof\\Downloads\\x', note, W)).toBe(false)
    expect(cartellaQualificata('D:\\qualcosa', note, W)).toBe(false)
  })
  it('le cartelle dei workspace valgono esatte, i progetti con le sottocartelle; maiuscole e barre non contano', () => {
    expect(cartellaQualificata('E:/Users/nikof/Documents/SierraDeck', NOTE, W)).toBe(true)
    expect(cartellaQualificata('e:\\users\\nikof\\documents\\sierradeck\\', NOTE, W)).toBe(true)
    expect(cartellaQualificata('E:\\Users\\nikof\\Documents\\SierraDeck\\src', NOTE, W)).toBe(false)
    expect(cartellaQualificata('C:\\Users\\nikof\\Progetti SierraDeck\\fionda apl', NOTE, W)).toBe(true)
    expect(cartellaQualificata('C:\\Users\\nikof\\Progetti SierraDeck', NOTE, W)).toBe(true)
  })
  it('rifiuta le cartelle che non c’entrano', () => {
    for (const c of ['E:\\Users\\nikof\\Documents', 'E:\\Users\\nikof\\Documents\\Altro', 'C:\\Users\\nikof\\Progetti SierraDeck2', 'C:\\Users\\nikof\\Downloads', 'E:\\Users\\nikof\\Documents\\SierraDeckX']) {
      expect(cartellaQualificata(c, NOTE, W), c).toBe(false)
    }
  })
  it('i worktree di SierraDeck valgono se il loro repository è di SierraDeck (anche con una sottocartella)', () => {
    expect(repoDelWorktree('E:\\Users\\nikof\\Documents\\SierraDeck.sierradeck-wt\\ap-f1e631f5-c-5', W)).toEqual({ repo: 'E:\\Users\\nikof\\Documents\\SierraDeck', resto: '' })
    expect(cartellaQualificata('E:\\Users\\nikof\\Documents\\SierraDeck.sierradeck-wt\\ap-f1e631f5-c-5', NOTE, W)).toBe(true)
    expect(cartellaQualificata('E:/Users/nikof/Documents/SierraDeck.sierradeck-wt/ap-f1e631f5-c-12', NOTE, W)).toBe(true)
    // L'autopilota lavora in E:\Lavori\app\web: il worktree è di E:\Lavori\app, con dentro web.
    expect(cartellaQualificata('E:\\Lavori\\app.sierradeck-wt\\ap-12345678-c-1\\web', NOTE, W)).toBe(true)
    expect(cartellaQualificata('E:\\Lavori\\app.sierradeck-wt\\ap-12345678-c-1', NOTE, W)).toBe(true)
    // Un worktree di un repository sconosciuto, o della casa, no.
    expect(cartellaQualificata('E:\\Altro.sierradeck-wt\\ap-12345678-c-1', NOTE, W)).toBe(false)
    expect(cartellaQualificata('C:\\Users\\nikof.sierradeck-wt\\ap-12345678-c-1', { ...NOTE, cartelle: ['C:\\Users\\nikof'] }, W)).toBe(false)
    expect(cartellaQualificata('E:\\.sierradeck-wt\\x', NOTE, W)).toBe(false)
  })
  it('le cartelle degli autopiloti si leggono dai loro file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'autopiloti-'))
    writeFileSync(join(dir, 'ap-1.json'), JSON.stringify({ id: 'ap-1', cwd: 'E:\\Lavori\\x' }))
    writeFileSync(join(dir, 'ap-2.json'), '{ rotto')
    writeFileSync(join(dir, 'altro.json'), JSON.stringify({ cwd: 'E:\\no' }))
    expect(cartelleAutopiloti(dir)).toEqual(['E:\\Lavori\\x'])
    expect(cartelleAutopiloti(join(dir, 'non-c-e'))).toEqual([])
  })
})

describe('la scrittura in .claude.json', () => {
  const base = {
    numStartups: 412,
    oauthAccount: { emailAddress: 'x@y.z', nested: { a: [1, 2, { b: null }] } },
    projects: {
      'E:/Users/nikof/Documents/SierraDeck': { allowedTools: ['Bash'], hasTrustDialogAccepted: true, lastCost: 1.25 },
      'E:/Users/nikof/Documents/SierraDeck.sierradeck-wt/ap-f1e631f5-c-5': { allowedTools: [], hasTrustDialogAccepted: false, lastSessionId: 'abc', mcpServers: { s: { command: 'x' } } },
      'C:\\Users\\nikof\\Desktop\\ollama': { hasTrustDialogAccepted: false }
    },
    ultimo: 'zz'
  }

  it('cambia solo quella chiave, e tutto il resto torna uguale', () => {
    const f = fileFinto(JSON.stringify(base, null, 2) + '\n')
    expect(segnaFidata(f, 'E:\\Users\\nikof\\Documents\\SierraDeck.sierradeck-wt\\ap-f1e631f5-c-5', { piattaforma: W })).toBe('scritta')
    const dopo = JSON.parse(readFileSync(f, 'utf8')) as typeof base
    const atteso = structuredClone(base)
    atteso.projects['E:/Users/nikof/Documents/SierraDeck.sierradeck-wt/ap-f1e631f5-c-5'].hasTrustDialogAccepted = true
    expect(dopo).toEqual(atteso)
    expect(Object.keys(dopo)).toEqual(Object.keys(base))
    expect(Object.keys(dopo.projects)).toEqual(Object.keys(base.projects))
    expect(readFileSync(f, 'utf8').endsWith('}\n')).toBe(true)
  })
  it('trova la chiave già scritta con maiuscole diverse e usa quella', () => {
    const f = fileFinto(JSON.stringify({ projects: { 'e:/users/NIKOF/x': { hasTrustDialogAccepted: false, lastCost: 2 } } }))
    expect(segnaFidata(f, 'E:\\Users\\nikof\\x', { piattaforma: W })).toBe('scritta')
    expect(JSON.parse(readFileSync(f, 'utf8'))).toEqual({ projects: { 'e:/users/NIKOF/x': { hasTrustDialogAccepted: true, lastCost: 2 } } })
  })
  it('una cartella nuova ha una voce completa, con la chiave di Claude Code', () => {
    const f = fileFinto(JSON.stringify({ projects: {} }))
    expect(segnaFidata(f, 'e:\\Nuova\\cartella', { piattaforma: W })).toBe('scritta')
    const p = (JSON.parse(readFileSync(f, 'utf8')) as { projects: Record<string, Record<string, unknown>> }).projects['E:/Nuova/cartella']
    expect(p?.hasTrustDialogAccepted).toBe(true)
    expect(p?.allowedTools).toEqual([])
    expect(p?.mcpServers).toEqual({})
  })
  it('già fidata: non scrive niente', () => {
    const testo = JSON.stringify(base)
    const f = fileFinto(testo)
    let scritture = 0
    expect(segnaFidata(f, 'E:/Users/nikof/Documents/SierraDeck', { piattaforma: W, scrivi: () => { scritture += 1; return true } })).toBe('gia')
    expect(scritture).toBe(0)
    expect(readFileSync(f, 'utf8')).toBe(testo)
  })
  it('un file che non si legge resta intatto', () => {
    for (const rotto of ['{ "projects": { "E:/x": ', '', '[1,2]', '{"projects": 3}', 'null']) {
      const f = fileFinto(rotto)
      expect(segnaFidata(f, 'E:\\x', { piattaforma: W }), rotto).toBe('illeggibile')
      expect(readFileSync(f, 'utf8')).toBe(rotto)
    }
  })
  it('un file che non c’è non si crea', () => {
    const f = join(mkdtempSync(join(tmpdir(), 'fiducia-')), '.claude.json')
    expect(segnaFidata(f, 'E:\\x', { piattaforma: W })).toBe('senza-file')
    expect(existsSync(f)).toBe(false)
  })
  it('prima dello spawn: solo con la voce accesa e per una cartella che si qualifica', () => {
    const testo = JSON.stringify({ projects: {} })
    const f = fileFinto(testo)
    const righe: string[] = []
    const prova = (cwd: string, attiva = true): string => fidatiPrimaDiAvviare({ cwd, attiva, note: () => NOTE, fileClaudeJson: f, piattaforma: W, log: (r) => righe.push(r) })
    expect(prova('E:\\Users\\nikof\\Documents\\SierraDeck.sierradeck-wt\\ap-1-c-1', false)).toBe('spenta')
    expect(prova('C:\\Users\\nikof')).toBe('fuori')
    expect(prova('C:\\')).toBe('fuori')
    expect(prova('E:\\Altrove')).toBe('fuori')
    expect(readFileSync(f, 'utf8')).toBe(testo)
    expect(prova('E:\\Users\\nikof\\Documents\\SierraDeck.sierradeck-wt\\ap-1-c-1')).toBe('scritta')
    expect(prova('E:\\Users\\nikof\\Documents\\SierraDeck.sierradeck-wt\\ap-1-c-1')).toBe('gia')
    expect(Object.keys((JSON.parse(readFileSync(f, 'utf8')) as { projects: object }).projects)).toEqual(['E:/Users/nikof/Documents/SierraDeck.sierradeck-wt/ap-1-c-1'])
    expect(righe).toHaveLength(1)
  })
})

describe('la domanda nel terminale', () => {
  const NUMERATA = [
    '╭──────────────────────────────────────────────╮',
    '│ Do you trust the files in this folder?       │',
    '│                                              │',
    '│ E:\\Users\\nikof\\Documents\\SierraDeck.sierradeck-wt\\ap-1-c-1 │',
    '│                                              │',
    '│ ❯ 1. Yes, I trust this folder                │',
    '│   2. No, exit                                │',
    '╰──────────────────────────────────────────────╯',
    '   Enter to confirm · Esc to exit'
  ]
  const SENZA_NUMERI = [
    ' Do you trust the files in this folder?',
    '',
    ' ❯ No, exit',
    '   Yes, I trust this folder',
    '',
    ' Enter to confirm · Esc to cancel'
  ]

  it('i tasti: Invio se il cursore è già sul sì, una freccia giù e Invio se è sul no', () => {
    expect(tastiPerFidarsi(NUMERATA)).toEqual(['\r'])
    expect(tastiPerFidarsi(SENZA_NUMERI)).toEqual(['\u001b[B', '\r'])
    expect(tastiPerFidarsi(['❯ 1. Yes', '  2. No'])).toBeUndefined()
  })

  function prepara(qualificate: (cwd: string) => boolean = (c) => c.startsWith('E:\\Users\\nikof\\Documents\\SierraDeck')) {
    const premuti: { chat: string; pezzi: string[] }[] = []
    const righe: string[] = []
    let ora = 1_000
    let attiva = true
    const f = creaFiduciaNelTerminale({ attiva: () => attiva, qualificata: qualificate, tasti: (chat, pezzi) => premuti.push({ chat, pezzi }), log: (r) => righe.push(r), adesso: () => ora })
    return { f, premuti, righe, avanza: (ms: number) => { ora += ms }, spegni: () => { attiva = false } }
  }

  it('risponde una volta sola per chat, e lo scrive nel registro con una riga', () => {
    const { f, premuti, righe, avanza } = prepara()
    const chat = { id: 'p1', sessione: 's1', titolo: 'c-1', cwd: 'E:\\Users\\nikof\\Documents\\SierraDeck.sierradeck-wt\\ap-1-c-1', codaGrezza: NUMERATA }
    expect([...f.guarda([chat])]).toEqual(['p1'])
    expect([...f.guarda([chat])]).toEqual(['p1'])
    avanza(NASCOSTA_PER_MS + 1)
    // Ancora lì dopo: non si ripreme, e torna nelle Domande.
    expect([...f.guarda([chat])]).toEqual([])
    expect(premuti).toEqual([{ chat: 'p1', pezzi: ['\r'] }])
    expect(righe).toHaveLength(1)
    expect(righe[0]).toContain('Yes, I trust this folder')
  })
  it('mai per una cartella che non si qualifica: lo dice una volta e lascia la scelta', () => {
    const { f, premuti, righe } = prepara()
    const chat = { id: 'p2', cwd: 'C:\\Users\\nikof', coda: SENZA_NUMERI }
    expect(f.guarda([chat]).size).toBe(0)
    expect(f.guarda([chat]).size).toBe(0)
    expect(premuti).toEqual([])
    expect(righe).toHaveLength(1)
  })
  it('niente senza la domanda di fiducia, e niente con la voce spenta', () => {
    const { f, premuti, spegni } = prepara(() => true)
    expect(f.guarda([{ id: 'p3', cwd: 'E:\\x', coda: ['❯ 1. Yes', '  2. No', 'Do you want to proceed?'] }]).size).toBe(0)
    spegni()
    expect(f.guarda([{ id: 'p4', cwd: 'E:\\x', coda: NUMERATA }]).size).toBe(0)
    expect(premuti).toEqual([])
  })
  it('due chat: ognuna la sua risposta', () => {
    const { f, premuti } = prepara(() => true)
    f.guarda([{ id: 'a', cwd: 'E:\\a', coda: NUMERATA }, { id: 'b', cwd: 'E:\\b', coda: SENZA_NUMERI }])
    expect(premuti.map((p) => p.chat)).toEqual(['a', 'b'])
  })
})
