import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import {
  isPtyId,
  validateListOptions,
  validateLayoutSalvato,
  validateIdFinestra,
  validateNomeWorkspace,
  validatePtyId,
  validateResizeArgs,
  validateSpawnRequest,
  validateWriteArgs,
  validaIdAutopilota,
  validaNuovoAutopilota,
  NOME_WORKSPACE_MAX
,
  validaPercorsoTrascrizione
} from '../../src/main/validation'

const UUID = '11111111-2222-3333-4444-555555555555'
const cartella = mkdtempSync(join(tmpdir(), 'valida-'))

function richiesta(over: Record<string, unknown> = {}): unknown {
  return { sessionUuid: UUID, cwd: cartella, cols: 80, rows: 24, ...over }
}

describe('validateSpawnRequest', () => {
  it('accetta una richiesta ben formata', () => {
    expect(validateSpawnRequest(richiesta())).toEqual({
      sessionUuid: UUID, cwd: cartella, title: undefined, cols: 80, rows: 24
    })
  })

  it('scarta i campi che il renderer non deve poter decidere', () => {
    // Il punto della correzione: anche se il renderer manda command e args,
    // non arrivano da nessuna parte. Il comando lo compone il Core.
    const req = validateSpawnRequest(richiesta({ command: 'cmd.exe', args: ['/c', 'calc'] }))
    expect(req).not.toHaveProperty('command')
    expect(req).not.toHaveProperty('args')
  })

  it('rifiuta un sessionUuid che non e un uuid', () => {
    expect(() => validateSpawnRequest(richiesta({ sessionUuid: 'x' }))).toThrow(/sessionUuid/)
  })

  it('rifiuta un cwd inesistente invece di lasciarlo arrivare a node-pty', () => {
    expect(() => validateSpawnRequest(richiesta({ cwd: join(cartella, 'non-esiste') })))
      .toThrow(/cwd non accessibile/)
  })

  it('rifiuta un cwd che e un file e non una cartella', () => {
    const file = join(cartella, 'un-file.txt')
    writeFileSync(file, 'x')
    expect(() => validateSpawnRequest(richiesta({ cwd: file }))).toThrow(/cartella/)
  })

  it('rifiuta un cwd vuoto', () => {
    expect(() => validateSpawnRequest(richiesta({ cwd: '   ' }))).toThrow(/cwd/)
  })

  it('rifiuta dimensioni non intere, negative o sconfinate', () => {
    expect(() => validateSpawnRequest(richiesta({ cols: 80.5 }))).toThrow(/cols/)
    expect(() => validateSpawnRequest(richiesta({ rows: 0 }))).toThrow(/rows/)
    expect(() => validateSpawnRequest(richiesta({ cols: 999_999 }))).toThrow(/cols/)
    expect(() => validateSpawnRequest(richiesta({ rows: '24' }))).toThrow(/rows/)
  })

  it('rifiuta una richiesta che non e un oggetto', () => {
    expect(() => validateSpawnRequest(undefined)).toThrow(/non valida/)
    expect(() => validateSpawnRequest('spawn')).toThrow(/non valida/)
  })

  it('accetta un titolo normale', () => {
    expect(validateSpawnRequest(richiesta({ title: 'Rifattorizzazione del parser' })).title)
      .toBe('Rifattorizzazione del parser')
  })

  it('rifiuta un titolo con apici doppi, che diventerebbero argomenti separati', () => {
    // argsToCommandLine di node-pty non racchiude fra apici un argomento che
    // gia' comincia e finisce con un apice, ma continua a farli precedere da
    // backslash: CommandLineToArgvW li rilegge come apici letterali e spezza
    // sugli spazi. Il titolo arriva da disco (aiTitle), quindi la forma
    // pericolosa non e' teorica.
    expect(() => validateSpawnRequest(richiesta({ title: '" --pericoloso "' })))
      .toThrow(/apici doppi/)
  })

  it('rifiuta un titolo con caratteri di controllo', () => {
    expect(() => validateSpawnRequest(richiesta({ title: `riga${String.fromCharCode(10)}due` })))
      .toThrow(/caratteri di controllo/)
  })

  it('rifiuta un titolo sconfinato', () => {
    expect(() => validateSpawnRequest(richiesta({ title: 'a'.repeat(500) }))).toThrow(/title/)
  })
})

describe('validazione degli argomenti dei canali a senso unico', () => {
  it('riconosce un id di pty', () => {
    expect(isPtyId(UUID)).toBe(true)
    expect(isPtyId('pane-1')).toBe(false)
    expect(isPtyId(42)).toBe(false)
  })

  it('rifiuta un id che non e un uuid', () => {
    expect(() => validatePtyId('../../etc')).toThrow(/id/)
    expect(() => validatePtyId(undefined)).toThrow(/id/)
  })

  it('accetta una scrittura ben formata e rifiuta i dati non stringa', () => {
    expect(validateWriteArgs(UUID, 'ls')).toEqual({ id: UUID, data: 'ls' })
    expect(() => validateWriteArgs(UUID, { toString: 'no' })).toThrow(/data/)
  })

  it('valida anche le dimensioni del resize', () => {
    expect(validateResizeArgs(UUID, 100, 40)).toEqual({ id: UUID, cols: 100, rows: 40 })
    expect(() => validateResizeArgs(UUID, -1, 40)).toThrow(/cols/)
  })
})

describe('validateListOptions', () => {
  it('tratta assente e nullo come nessuna opzione', () => {
    expect(validateListOptions(undefined)).toEqual({})
    expect(validateListOptions(null)).toEqual({})
  })

  it('accetta le opzioni previste', () => {
    expect(validateListOptions({ projectSlug: 'C--p', limit: 10 }))
      .toEqual({ projectSlug: 'C--p', limit: 10 })
  })

  it('rifiuta un limit non numerico prima che lo faccia better-sqlite3', () => {
    expect(() => validateListOptions({ limit: '10' })).toThrow(/limit/)
    expect(() => validateListOptions({ limit: 1.5 })).toThrow(/limit/)
    expect(() => validateListOptions({ limit: 0 })).toThrow(/limit/)
  })

  it('rifiuta un projectSlug non stringa', () => {
    expect(() => validateListOptions({ projectSlug: 7 })).toThrow(/projectSlug/)
  })

  it('ignora i campi sconosciuti invece di inoltrarli alla query', () => {
    expect(validateListOptions({ pericoloso: 'DROP TABLE sessions' })).toEqual({})
  })
})

describe('validateLayoutSalvato', () => {
  it('accetta un layout valido', () => {
    const { layout } = validateLayoutSalvato({
      root: { type: 'pane', id: 'a' },
      panes: [{ id: 'a', sessionUuid: 'u', cwd: 'C:\\p', title: 't' }]
    })
    expect(layout.panes).toHaveLength(1)
  })

  it('riduce a vuoto un valore assurdo invece di sollevare', () => {
    expect(validateLayoutSalvato('non sono un layout').layout).toEqual({ root: undefined, panes: [] })
    expect(validateLayoutSalvato(null).layout).toEqual({ root: undefined, panes: [] })
  })

  it('normalizza un titolo ostile', () => {
    const { layout } = validateLayoutSalvato({
      root: { type: 'pane', id: 'a' },
      panes: [{ id: 'a', sessionUuid: 'u', cwd: 'C:\\p', title: '" --flag "' }]
    })
    expect(layout.panes[0]?.title).not.toContain('"')
  })

  it('riferisce gli scarti invece di inghiottirli', () => {
    const { layout, scartati } = validateLayoutSalvato({
      root: { type: 'split', id: 's1', direction: 'horizontal',
        children: [{ type: 'pane', id: 'a' }, { type: 'boh' }], sizes: [0.5, 0.5] },
      panes: [{ id: 'a', sessionUuid: 'u', cwd: 'C:\\p', title: 't' }]
    })
    expect(layout.root).toEqual({ type: 'pane', id: 'a' })
    expect(scartati.length).toBeGreaterThan(0)
  })

  it('non riferisce scarti per un layout pulito', () => {
    const { scartati } = validateLayoutSalvato({
      root: { type: 'pane', id: 'a' },
      panes: [{ id: 'a', sessionUuid: 'u', cwd: 'C:\\p', title: 't' }]
    })
    expect(scartati).toEqual([])
  })
})

describe('validateNomeWorkspace', () => {
  it('accetta un nome normale', () => {
    expect(validateNomeWorkspace('Lavoro')).toBe('Lavoro')
  })

  it('restituisce il nome ripulito dagli spazi ai bordi', () => {
    expect(validateNomeWorkspace('  Lavoro  ')).toBe('Lavoro')
  })

  it('rifiuta un valore non testuale', () => {
    expect(() => validateNomeWorkspace(42)).toThrow()
    expect(() => validateNomeWorkspace(null)).toThrow()
  })

  it('rifiuta un nome vuoto o di soli spazi', () => {
    expect(() => validateNomeWorkspace('')).toThrow()
    expect(() => validateNomeWorkspace('   ')).toThrow()
  })

  it('rifiuta un nome troppo lungo', () => {
    expect(() => validateNomeWorkspace('x'.repeat(NOME_WORKSPACE_MAX + 1))).toThrow()
  })

  it('rifiuta i caratteri di controllo', () => {
    // Finirebbero come chiave in un file JSON e come etichetta nell'elenco:
    // in entrambi i posti un a capo rende illeggibile cio' che lo contiene.
    expect(() => validateNomeWorkspace('Lav\noro')).toThrow()
  })
})

describe('validateIdFinestra', () => {
  it('accetta un intero positivo', () => {
    expect(validateIdFinestra(3)).toBe(3)
  })

  it('rifiuta zero, i negativi e i non interi', () => {
    expect(() => validateIdFinestra(0)).toThrow()
    expect(() => validateIdFinestra(-1)).toThrow()
    expect(() => validateIdFinestra(1.5)).toThrow()
  })

  it('rifiuta cio che non e un numero', () => {
    expect(() => validateIdFinestra('3')).toThrow()
    expect(() => validateIdFinestra(undefined)).toThrow()
  })
})

describe('validaNuovoAutopilota', () => {
  function richiestaAp(over: Record<string, unknown> = {}): unknown {
    return {
      nome: 'Test verdi',
      obiettivo: 'Fai passare la suite',
      cwd: cartella,
      criteri: [{ descrizione: 'i test passano', comando: 'npm test' }],
      ...over
    }
  }

  it('accetta una richiesta ben formata', () => {
    const r = validaNuovoAutopilota(richiestaAp())
    expect(r.obiettivo).toBe('Fai passare la suite')
    expect(r.criteri).toEqual([{ descrizione: 'i test passano', comando: 'npm test' }])
  })

  it('ripulisce gli spazi ai bordi di obiettivo e criteri', () => {
    const r = validaNuovoAutopilota(richiestaAp({
      obiettivo: '  Fai passare la suite  ',
      criteri: [{ descrizione: '  i test passano  ', comando: '  npm test  ' }]
    }))
    expect(r.obiettivo).toBe('Fai passare la suite')
    expect(r.criteri[0]).toEqual({ descrizione: 'i test passano', comando: 'npm test' })
  })

  it('rifiuta un obiettivo vuoto o non testuale', () => {
    expect(() => validaNuovoAutopilota(richiestaAp({ obiettivo: '   ' }))).toThrow(/obiettivo/)
    expect(() => validaNuovoAutopilota(richiestaAp({ obiettivo: 42 }))).toThrow(/obiettivo/)
  })

  it('rifiuta un obiettivo sterminato', () => {
    expect(() => validaNuovoAutopilota(richiestaAp({ obiettivo: 'x'.repeat(4001) }))).toThrow(/obiettivo/)
  })

  it('rifiuta criteri che non sono un elenco', () => {
    // I criteri possono mancare — li produce l'intervista — ma se ci sono
    // devono avere la forma giusta.
    expect(() => validaNuovoAutopilota(richiestaAp({ criteri: 'npm test' }))).toThrow(/criteri/)
  })

  it('scarta i criteri senza descrizione invece di rifiutare la richiesta', () => {
    // Un criterio senza descrizione non e' usabile, ma non e' un motivo per non
    // far partire l'autopilota: l'intervista completera' quello che manca.
    expect(validaNuovoAutopilota(richiestaAp({ criteri: [{ comando: 'npm test' }] })).criteri)
      .toEqual([])
  })

  it('rifiuta un comando che non e una stringa', () => {
    // Il comando finisce dentro `exec` nel servizio: e' l'unico punto in cui il
    // renderer si avvicina a decidere cosa eseguire, e va guardato.
    expect(() => validaNuovoAutopilota(richiestaAp({
      criteri: [{ descrizione: 'd', comando: { toString: 'no' } }]
    }))).toThrow(/comando/)
  })

  it('rifiuta una cartella inesistente', () => {
    expect(() => validaNuovoAutopilota(richiestaAp({ cwd: join(cartella, 'non-esiste') })))
      .toThrow(/cwd non accessibile/)
  })

  it('usa l obiettivo come nome quando il nome manca', () => {
    expect(validaNuovoAutopilota(richiestaAp({ nome: '   ' })).nome).toBe('Fai passare la suite')
  })
})

describe('validaIdAutopilota', () => {
  it('accetta un id emesso dal servizio', () => {
    expect(validaIdAutopilota('ap-11111111-2222-3333-4444-555555555555'))
      .toBe('ap-11111111-2222-3333-4444-555555555555')
  })

  it('rifiuta un id che contiene separatori di percorso', () => {
    // Arriva fino a un nome di file nell'archivio del servizio.
    expect(() => validaIdAutopilota('..\..\settings')).toThrow(/id/)
    expect(() => validaIdAutopilota('ap/1')).toThrow(/id/)
    expect(() => validaIdAutopilota('')).toThrow(/id/)
    expect(() => validaIdAutopilota(7)).toThrow(/id/)
  })
})

describe('validaNuovoAutopilota — preparazione e percorsi', () => {
  it('accetta una richiesta senza criteri: li produrra l intervista', () => {
    // E' il caso normale adesso: l'utente descrive cosa vuole, e i criteri se
    // li da' l'autopilota dopo aver guardato il progetto.
    const r = validaNuovoAutopilota({ obiettivo: 'Sistema il lettore', cwd: cartella, criteri: [] })
    expect(r.criteri).toEqual([])
    expect(r.obiettivo).toBe('Sistema il lettore')
  })

  it('accetta anche criteri del tutto assenti', () => {
    expect(validaNuovoAutopilota({ obiettivo: 'x', cwd: cartella }).criteri).toEqual([])
  })

  it('tiene i criteri quando ci sono', () => {
    const r = validaNuovoAutopilota({
      obiettivo: 'x', cwd: cartella, criteri: [{ descrizione: 'd', comando: 'npm test' }]
    })
    expect(r.criteri).toEqual([{ descrizione: 'd', comando: 'npm test' }])
  })

  it('espande la tilde nel percorso della cartella', () => {
    // Nell'interfaccia si scrive «~\Documents\progetto» perche' e' come si
    // scrive un percorso a mano: senza espanderla, la cartella non esiste e
    // l'autopilota non parte con un errore che parla di un percorso che
    // l'utente non ha mai scritto.
    const r = validaNuovoAutopilota({ obiettivo: 'x', cwd: '~', criteri: [] })
    expect(r.cwd).toBe(homedir())
    expect(r.cwd.startsWith('~')).toBe(false)
  })

  it('espande la tilde anche dentro un percorso piu lungo', () => {
    const r = validaNuovoAutopilota({ obiettivo: 'x', cwd: join('~', 'Documents'), criteri: [] })
    expect(r.cwd).toBe(join(homedir(), 'Documents'))
  })

  it('non tocca un percorso che comincia per tilde ma non e la home', () => {
    // «~progetto» e' un nome di cartella, non un riferimento alla home.
    expect(() => validaNuovoAutopilota({ obiettivo: 'x', cwd: '~progetto', criteri: [] }))
      .toThrow(/cwd non accessibile/)
  })
})

describe('validaPercorsoTrascrizione', () => {
  const radice = 'C:\\Users\\utente\\.claude'

  it('accetta un file dentro le sessioni di Claude Code', () => {
    const p = 'C:\\Users\\utente\\.claude\\projects\\C--p\\abc.jsonl'
    expect(validaPercorsoTrascrizione(p, radice)).toBe(p)
  })

  it('rifiuta un file fuori da quella cartella', () => {
    // Il renderer passa un percorso: senza questo controllo, un canale pensato
    // per le anteprime diventerebbe un modo per leggere qualunque file.
    expect(() => validaPercorsoTrascrizione('C:\\Windows\\system.ini', radice)).toThrow()
  })

  it('rifiuta la risalita con i due punti', () => {
    expect(() => validaPercorsoTrascrizione(
      'C:\\Users\\utente\\.claude\\projects\\..\\..\\.ssh\\id_rsa', radice
    )).toThrow()
  })

  it('rifiuta un file che non e una trascrizione', () => {
    expect(() => validaPercorsoTrascrizione(
      'C:\\Users\\utente\\.claude\\projects\\C--p\\.credentials.json', radice
    )).toThrow()
  })

  it('rifiuta cio che non e nemmeno una stringa', () => {
    expect(() => validaPercorsoTrascrizione(42, radice)).toThrow()
  })
})

describe('un riquadro solo, senza albero', () => {
  it('sopravvive alla validazione invece di essere potato', () => {
    // Spostare una chat in un altro workspace passa di qui. Validandola dentro
    // un layout senza radice, il potatore la buttava via come «non
    // raggiungibile»: la chat spariva dalla finestra di partenza e non
    // arrivava mai a destinazione. Lavoro perso, in silenzio.
    const pane = { id: 'p-1', sessionUuid: '11111111-2222-3333-4444-555555555555', cwd: 'C:\p', title: 'La chat' }
    const { layout } = validateLayoutSalvato({ root: { type: 'pane', id: 'p-1' }, panes: [pane] })
    expect(layout.panes).toHaveLength(1)
    expect(layout.panes[0]?.title).toBe('La chat')
  })

  it('senza radice il riquadro viene potato: e il difetto da cui guardarsi', () => {
    const pane = { id: 'p-1', sessionUuid: '11111111-2222-3333-4444-555555555555', cwd: 'C:\p', title: 'La chat' }
    const { layout } = validateLayoutSalvato({ root: undefined, panes: [pane] })
    expect(layout.panes).toHaveLength(0)
  })
})
