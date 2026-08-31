import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { apriWorkspaceStore } from '../../src/main/workspace-store'
import { archivioVuoto, VERSIONE_ARCHIVIO, NOME_PREDEFINITO } from '@shared/workspace'

function dirTemporanea(): string {
  return mkdtempSync(join(tmpdir(), 'gestore-ws-'))
}

describe('apriWorkspaceStore', () => {
  it('restituisce un archivio vuoto se il file non esiste', () => {
    expect(apriWorkspaceStore(dirTemporanea()).leggi().workspace).toEqual([])
  })

  it('rilegge cio che ha scritto', () => {
    const store = apriWorkspaceStore(dirTemporanea())
    store.scrivi({
      versione: VERSIONE_ARCHIVIO,
      attivo: NOME_PREDEFINITO,
      workspace: [{
        nome: NOME_PREDEFINITO,
        perSlot: {
          '1': {
            root: { type: 'pane', id: 'pane-1' },
            panes: [{ id: 'pane-1', sessionUuid: 'u1', cwd: 'C:\\p', title: 'a' }]
          }
        }
      }]
    })
    expect(store.leggi().workspace[0]?.perSlot['1']?.panes[0]?.sessionUuid).toBe('u1')
  })

  it('non lascia il file temporaneo dopo una scrittura', () => {
    const dir = dirTemporanea()
    apriWorkspaceStore(dir).scrivi(archivioVuoto())
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })

  // Il file non e' ricostruibile da niente: a differenza di index.db non va
  // cancellato. Questo test e' l'unico modo di garantire che una versione futura
  // non lo "ripari" cancellandolo.
  it('conserva un file illeggibile spostandolo di lato invece di cancellarlo', () => {
    const dir = dirTemporanea()
    writeFileSync(join(dir, 'workspaces.json'), '{ questo non e JSON', 'utf8')

    expect(apriWorkspaceStore(dir).leggi().workspace).toEqual([])
    const salvati = readdirSync(dir).filter((f) => f.includes('.illeggibile'))
    expect(salvati).toHaveLength(1)
    expect(readFileSync(join(dir, salvati[0]!), 'utf8')).toBe('{ questo non e JSON')
  })

  it('conserva anche un archivio di versione futura', () => {
    const dir = dirTemporanea()
    writeFileSync(
      join(dir, 'workspaces.json'),
      JSON.stringify({ versione: VERSIONE_ARCHIVIO + 99, attivo: 'x', workspace: [] }),
      'utf8'
    )
    expect(apriWorkspaceStore(dir).leggi().workspace).toEqual([])
    expect(readdirSync(dir).filter((f) => f.includes('.illeggibile'))).toHaveLength(1)
  })

  it('non sovrascrive un salvataggio precedente dello stesso nome', () => {
    const dir = dirTemporanea()
    writeFileSync(join(dir, 'workspaces.json'), 'primo rotto', 'utf8')
    apriWorkspaceStore(dir).leggi()
    writeFileSync(join(dir, 'workspaces.json'), 'secondo rotto', 'utf8')
    apriWorkspaceStore(dir).leggi()
    expect(readdirSync(dir).filter((f) => f.includes('.illeggibile'))).toHaveLength(2)
  })

  it('un salvataggio fallito lascia intatto il precedente e non lascia residui', () => {
    const dir = dirTemporanea()
    const store = apriWorkspaceStore(dir)
    store.scrivi({
      versione: VERSIONE_ARCHIVIO, attivo: NOME_PREDEFINITO,
      workspace: [{ nome: NOME_PREDEFINITO, perSlot: {
        '1': { root: { type: 'pane', id: 'buono' }, panes: [{ id: 'buono', sessionUuid: 'u1', cwd: 'C:\\p', title: 'a' }] }
      } }]
    })
    // JSON.stringify solleva su BigInt: e' il modo di far fallire scrivi() senza
    // simulare un crash del processo.
    store.scrivi({ ...archivioVuoto(), attivo: 1n as unknown as string })

    // Il salvataggio precedente e' ancora quello buono...
    expect(store.leggi().workspace[0]?.perSlot['1']?.panes[0]?.id).toBe('buono')
    // ...e non e' rimasto un temporaneo a sporcare la cartella.
    expect(readdirSync(dir).filter((f) => f.includes('.tmp'))).toEqual([])
  })

  it('dice quando non ha scritto, invece di tacere', () => {
    // Prima l'esito si buttava via, e `scriviJsonAtomico` non solleva mai per
    // progetto: un salvataggio non riuscito era indistinguibile da uno riuscito.
    // Nessun errore, nessuna riga, e sul disco la versione di prima — la perdita
    // si scopriva al riavvio successivo, quando non c'era piu' modo di
    // ricostruire cosa fosse successo. Su Windows non e' teoria: la rinomina
    // sopra un file che qualcun altro tiene aperto fallisce, e `workspaces.json`
    // viene riletto ogni paio di secondi dal Client e dagli autopiloti.
    const store = apriWorkspaceStore(dirTemporanea())
    expect(store.scrivi(archivioVuoto())).toBe(true)
    expect(store.scrivi({ ...archivioVuoto(), attivo: 1n as unknown as string })).toBe(false)
  })

  it('scrive anche sotto il vecchio nome, cosi si puo tornare indietro', () => {
    // Se questa versione dovesse essere disinstallata, quella precedente cerca
    // `perMonitor`: senza la copia troverebbe un archivio vuoto, cioe' tutte le
    // chat sparite — il danno che questo lavoro esiste per chiudere. Quando si
    // tocca il modo in cui il lavoro e' archiviato, la prima cosa da garantire
    // non e' che vada bene: e' che si possa tornare indietro.
    const dir = dirTemporanea()
    apriWorkspaceStore(dir).scrivi({
      versione: VERSIONE_ARCHIVIO, attivo: 'Uno',
      workspace: [{ nome: 'Uno', perSlot: {
        '1': { root: { type: 'pane', id: 'p' }, panes: [{ id: 'p', sessionUuid: 'u1', cwd: 'C:\p', title: 'a' }] }
      } }]
    })
    const grezzo = JSON.parse(readFileSync(join(dir, 'workspaces.json'), 'utf8')) as {
      workspace: { perSlot?: unknown; perMonitor?: unknown }[]
    }
    expect(grezzo.workspace[0]?.perSlot).toBeDefined()
    expect(grezzo.workspace[0]?.perMonitor).toEqual(grezzo.workspace[0]?.perSlot)
  })

  it('crea la cartella se manca', () => {
    const dir = join(dirTemporanea(), 'non', 'esiste', 'ancora')
    apriWorkspaceStore(dir).scrivi(archivioVuoto())
    expect(existsSync(join(dir, 'workspaces.json'))).toBe(true)
  })
})
