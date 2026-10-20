import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Archivio, WorkspaceSalvato } from '../../src/shared/workspace'
import { cartellaVuotaDaRecuperare, motivoPerNonEliminare, type WorkspaceInRecupero } from '../../src/shared/workspace-recupero'
import { cartellaVuota, FILE_RECUPERO_WORKSPACE, mettiWorkspaceNelRecupero, ripristinaWorkspace } from '../../src/main/workspace-recupero-file'
import { dentroCartella } from '../../src/shared/progetti-unificati'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'

/**
 * «Elimina workspace» (0.81.0): dice di no a un workspace con una chat al
 * lavoro o con un autopilota attivo, con il motivo; la cartella vuota del
 * progetto va nel recupero con lui (sempre da `cancellaSicura`) e torna con
 * «Ripristina».
 */
type Pane = WorkspaceSalvato['perSlot'][string]['panes'][number]
const pane = (sessionUuid: string, cwd = 'C:\\Progetti\\Esempio'): Pane => ({ id: `p-${sessionUuid}`, sessionUuid, cwd }) as unknown as Pane
const ws = (nome: string, ...panes: Pane[]): WorkspaceSalvato => ({ nome, perSlot: { 1: { root: undefined, panes } } as unknown as WorkspaceSalvato['perSlot'] })
const archivio = (attivo: string, ...w: WorkspaceSalvato[]): Archivio => ({ versione: 1, attivo, workspace: w } as Archivio)
const ORA = '2026-10-20T08:00:00.000Z'
const giorniDopo = (g: number): string => new Date(Date.parse(ORA) + g * 86_400_000).toISOString()

describe('quando «Elimina workspace» dice di no', () => {
  const w = ws('Prova', pane('s1'), pane('s2'))

  it('una chat del workspace che sta lavorando: no, con il suo nome', () => {
    expect(motivoPerNonEliminare(w, [{ sessione: 's1', titolo: 'Analisi', viva: true }], [])).toBe('Non elimino «Prova»: la chat «Analisi» sta lavorando. Riprova quando ha finito.')
    expect(motivoPerNonEliminare(w, [{ sessione: 's1', titolo: 'A', viva: true }, { sessione: 's2', titolo: 'B', viva: true }], [])).toContain('2 chat stanno lavorando')
  })

  it('una chat ferma ad aspettare, chiusa, o di un altro workspace: si può', () => {
    expect(motivoPerNonEliminare(w, [{ sessione: 's1', titolo: 'A', viva: true, aspetta: true }], [])).toBeUndefined()
    expect(motivoPerNonEliminare(w, [{ sessione: 's1', titolo: 'A', viva: false }], [])).toBeUndefined()
    expect(motivoPerNonEliminare(w, [{ sessione: 'altra', titolo: 'A', viva: true }], [])).toBeUndefined()
  })

  it('la casa di un autopilota attivo: no, con il suo nome e lo stato', () => {
    for (const [stato, parole] of [['intervista', 'in intervista'], ['pronto', 'pronto a partire'], ['lavoro', 'al lavoro'], ['attesa', 'in attesa']] as const) {
      expect(motivoPerNonEliminare(w, [], [{ nome: 'Sito', obiettivo: 'x', stato, workspace: 'Prova' }])).toBe(`Non elimino «Prova»: è la casa dell’autopilota «Sito», ${parole}. Prima fermalo o eliminalo.`)
    }
    // Senza nome si usa l'obiettivo, accorciato.
    expect(motivoPerNonEliminare(w, [], [{ obiettivo: 'riprendi in mano tutto il progetto e vediamo a che punto sia', stato: 'intervista', workspace: 'Prova' }])).toContain('«riprendi in mano tutto il progetto e ve…»')
  })

  it('un autopilota sospeso, finito, fallito o di un altro workspace: si può', () => {
    for (const stato of ['sospeso', 'finito', 'fallito']) expect(motivoPerNonEliminare(w, [], [{ obiettivo: 'x', stato, workspace: 'Prova' }])).toBeUndefined()
    expect(motivoPerNonEliminare(w, [], [{ obiettivo: 'x', stato: 'lavoro', workspace: 'Altro' }])).toBeUndefined()
    expect(motivoPerNonEliminare(undefined, [], [])).toBeUndefined()
  })
})

describe('la cartella vuota del progetto', () => {
  const C = 'C:\\Progetti SierraDeck\\esempio'
  const dopo = archivio('Lavoro', ws('Lavoro', pane('a', 'C:\\Progetti SierraDeck\\altro')))

  it('vuota e di nessun altro: va nel recupero', () => {
    expect(cartellaVuotaDaRecuperare(C, true, dopo, [], dentroCartella)).toBe(true)
    // Un autopilota in una cartella che la contiene non la usa.
    expect(cartellaVuotaDaRecuperare(C, true, dopo, [{ obiettivo: 'x', stato: 'lavoro', cwd: 'C:\\Progetti SierraDeck' }], dentroCartella)).toBe(true)
  })

  it('con dentro qualcosa, o usata da un workspace che resta o da un autopilota: resta dov’è', () => {
    expect(cartellaVuotaDaRecuperare(C, false, dopo, [], dentroCartella)).toBe(false)
    expect(cartellaVuotaDaRecuperare(C, true, archivio('Lavoro', ws('Lavoro', pane('a', `${C}\\sotto`))), [], dentroCartella)).toBe(false)
    // Anche un autopilota finito: la cartella era sua.
    expect(cartellaVuotaDaRecuperare(C, true, dopo, [{ obiettivo: 'x', stato: 'finito', cwd: C.toUpperCase() }], dentroCartella)).toBe(false)
  })
})

describe('la cartella sul disco, dentro e fuori dal recupero', () => {
  const prepara = (): { dati: string; cartella: string; prima: Archivio } => {
    const radice = mkdtempSync(join(tmpdir(), 'sd-elimina-ws-'))
    const dati = join(radice, 'dati')
    const cartella = join(radice, 'Progetti', 'esempio')
    mkdirSync(dati, { recursive: true })
    mkdirSync(cartella, { recursive: true })
    return { dati, cartella, prima: archivio('Lavoro', ws('Lavoro'), ws('esempio', pane('e6', cartella))) }
  }
  const voci = (dati: string): WorkspaceInRecupero[] => JSON.parse(readFileSync(join(dati, FILE_RECUPERO_WORKSPACE), 'utf8')) as WorkspaceInRecupero[]

  it('eliminando, la cartella vuota va nel recupero; «Ripristina» la rimette dov’era', () => {
    const { dati, cartella, prima } = prepara()
    expect(cartellaVuota(cartella)).toBe(true)
    expect(mettiWorkspaceNelRecupero(dati, prima, 'esempio', undefined, ORA, cartella)).toBe(true)
    expect(existsSync(cartella)).toBe(false)
    const v = voci(dati)[0]!
    expect(v.cartella?.originale).toBe(cartella)
    expect(existsSync(v.cartella!.spostataIn)).toBe(true)
    expect(v.cartella!.spostataIn.startsWith(join(dati, 'workspaces-recupero-cartelle'))).toBe(true)

    let scritto: Archivio | undefined
    const e = ripristinaWorkspace(dati, archivio('Lavoro', ws('Lavoro')), { nome: 'esempio', eliminatoIl: ORA }, (a) => { scritto = a; return true }, giorniDopo(1))
    expect(e.ok).toBe(true)
    expect(scritto?.workspace.map((x) => x.nome)).toEqual(['Lavoro', 'esempio'])
    expect(existsSync(cartella)).toBe(true)
    expect(voci(dati)).toEqual([])
  })

  it('se al suo posto ne è nata un’altra, quella nuova non si tocca e la vuota del recupero esce', () => {
    const { dati, cartella, prima } = prepara()
    mettiWorkspaceNelRecupero(dati, prima, 'esempio', undefined, ORA, cartella)
    const spostata = voci(dati)[0]!.cartella!.spostataIn
    mkdirSync(cartella)
    writeFileSync(join(cartella, 'nuovo.txt'), 'x')
    expect(ripristinaWorkspace(dati, archivio('Lavoro', ws('Lavoro')), { nome: 'esempio', eliminatoIl: ORA }, () => true, giorniDopo(1)).ok).toBe(true)
    expect(existsSync(join(cartella, 'nuovo.txt'))).toBe(true)
    expect(existsSync(spostata)).toBe(false)
  })

  it('una cartella con dentro un file non si sposta mai', () => {
    const { dati, cartella, prima } = prepara()
    writeFileSync(join(cartella, 'leggimi.txt'), 'x')
    expect(cartellaVuota(cartella)).toBe(false)
    expect(mettiWorkspaceNelRecupero(dati, prima, 'esempio', undefined, ORA, cartella)).toBe(true)
    expect(existsSync(join(cartella, 'leggimi.txt'))).toBe(true)
    expect(voci(dati)[0]!.cartella).toBeUndefined()
  })

  it('dopo 30 giorni la cartella esce con la sua voce, alla prossima eliminazione', () => {
    const { dati, cartella, prima } = prepara()
    mettiWorkspaceNelRecupero(dati, prima, 'esempio', undefined, ORA, cartella)
    const spostata = voci(dati)[0]!.cartella!.spostataIn
    expect(mettiWorkspaceNelRecupero(dati, prima, 'Lavoro', undefined, giorniDopo(31))).toBe(true)
    expect(existsSync(spostata)).toBe(false)
    expect(voci(dati).map((x) => x.workspace.nome)).toEqual(['Lavoro'])
  })
})

describe('la rotta di «Elimina» (pagina e app)', () => {
  const base = (over: Partial<DipendenzeRotte>): DipendenzeRotte => ({
    dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-rotte-'))),
    chat: () => [], autopiloti: () => Promise.resolve([]), workspace: () => Promise.resolve({ nomi: ['Lavoro', 'Prova'], attivo: 'Lavoro' }),
    eliminaWorkspace: () => Promise.resolve(), versione: '0.81.0',
    ...over
  } as unknown as DipendenzeRotte)

  it('il motivo del no arriva con un 409, e il workspace non si tocca', async () => {
    const eliminati: string[] = []
    const su = base({
      rifiutoEliminaWorkspace: (n) => Promise.resolve(n === 'Prova' ? 'Non elimino «Prova»: la chat «A» sta lavorando. Riprova quando ha finito.' : undefined),
      eliminaWorkspace: (n) => { eliminati.push(n); return Promise.resolve() }
    })
    expect(await rotteClient(su)({ metodo: 'POST', percorso: '/api/workspace/elimina', corpo: { nome: 'Prova' } })).toMatchObject({ stato: 409, corpo: { errore: 'Non elimino «Prova»: la chat «A» sta lavorando. Riprova quando ha finito.' } })
    expect(eliminati).toEqual([])
    expect(await rotteClient(su)({ metodo: 'POST', percorso: '/api/workspace/elimina', corpo: { nome: 'Lavoro' } })).toMatchObject({ stato: 200 })
    expect(eliminati).toEqual(['Lavoro'])
  })
})
