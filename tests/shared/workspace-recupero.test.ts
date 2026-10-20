import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Archivio, WorkspaceSalvato } from '../../src/shared/workspace'
import { chatDi, mettiNelRecupero, nomeLibero, ripristina, vociPerElenco, vociValide, leggiVoci, type WorkspaceInRecupero } from '../../src/shared/workspace-recupero'
import { elencoRecuperoWorkspace, FILE_RECUPERO_WORKSPACE, mettiWorkspaceNelRecupero, recuperoLeggibile, ripristinaWorkspace } from '../../src/main/workspace-recupero-file'
import { NOME_WORKSPACE_MAX } from '../../src/shared/azioni-telefono'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'

/**
 * «Elimina workspace» con il recupero di 30 giorni (0.81.0): il workspace
 * intero, con i suoi riquadri, torna con «Ripristina» senza cambiare lo schermo.
 */
const pane = (sessionUuid: string) => ({ id: `p-${sessionUuid}`, sessionUuid, cwd: 'C:\\Progetti\\Esempio' }) as unknown as WorkspaceSalvato['perSlot'][string]['panes'][number]
const ws = (nome: string, ...sessioni: string[]): WorkspaceSalvato => ({ nome, perSlot: { 1: { root: undefined, panes: sessioni.map(pane) } } as unknown as WorkspaceSalvato['perSlot'] })
const archivio = (attivo: string, ...w: WorkspaceSalvato[]): Archivio => ({ versione: 1, attivo, workspace: w } as Archivio)
const ORA = '2026-10-19T12:00:00.000Z'
const giorniDopo = (g: number): string => new Date(Date.parse(ORA) + g * 86_400_000).toISOString()

describe('le regole del recupero dei workspace', () => {
  it('eliminando, il workspace com’era (riquadri compresi) va in cima al recupero', () => {
    const prima = archivio('Lavoro', ws('Lavoro'), ws('Prova', 'a', 'b', 'a'))
    const voci = mettiNelRecupero([], prima, 'Prova', ORA, 'tel:t1')
    expect(voci).toHaveLength(1)
    expect(voci[0]).toEqual({ workspace: prima.workspace[1], eliminatoIl: ORA, da: 'tel:t1' })
    // Le chat si contano una volta anche se lo stesso riquadro è in più slot.
    expect(chatDi(voci[0]!.workspace)).toBe(2)
    // Un nome che non c'era non mette niente.
    expect(mettiNelRecupero([], prima, 'Altro', ORA)).toEqual([])
  })

  it('dopo 30 giorni una voce esce da sola; prima no', () => {
    const v: WorkspaceInRecupero[] = [{ workspace: ws('Vecchio'), eliminatoIl: ORA }]
    expect(vociValide(v, giorniDopo(29))).toHaveLength(1)
    expect(vociValide(v, giorniDopo(30))).toHaveLength(0)
    expect(vociPerElenco(v, giorniDopo(1))).toEqual([{ nome: 'Vecchio', eliminatoIl: ORA, scadeIl: giorniDopo(30), chat: 0 }])
  })

  it('«Ripristina» rimette il workspace senza cambiare lo schermo e lo toglie dal recupero', () => {
    const voci = mettiNelRecupero([], archivio('Lavoro', ws('Lavoro'), ws('Prova', 'a')), 'Prova', ORA)
    const e = ripristina(voci, archivio('Lavoro', ws('Lavoro')), { nome: 'Prova', eliminatoIl: ORA }, giorniDopo(2))
    expect(e.ok).toBe(true)
    if (!e.ok) return
    expect(e.archivio.attivo).toBe('Lavoro')
    expect(e.archivio.workspace.map((w) => w.nome)).toEqual(['Lavoro', 'Prova'])
    expect(chatDi(e.archivio.workspace[1]!)).toBe(1)
    expect(e.voci).toEqual([])
  })

  it('un nome ripreso nel frattempo: torna come «(recuperato)»', () => {
    expect(nomeLibero('Prova', ['Prova'])).toBe('Prova (recuperato)')
    expect(nomeLibero('Prova', ['Prova', 'Prova (recuperato)'])).toBe('Prova (recuperato 2)')
    const voci = mettiNelRecupero([], archivio('Lavoro', ws('Lavoro'), ws('Prova')), 'Prova', ORA)
    const e = ripristina(voci, archivio('Lavoro', ws('Lavoro'), ws('Prova')), { nome: 'Prova', eliminatoIl: ORA }, ORA)
    expect(e.ok && e.nome).toBe('Prova (recuperato)')
  })

  it('la revisione: un nome lungo con «(recuperato)» resta nei 60 caratteri', () => {
    const lungo = 'n'.repeat(NOME_WORKSPACE_MAX)
    const n = nomeLibero(lungo, [lungo])
    expect(n.length).toBeLessThanOrEqual(NOME_WORKSPACE_MAX)
    expect(n.endsWith(' (recuperato)')).toBe(true)
    expect(nomeLibero(lungo, [lungo, n]).length).toBeLessThanOrEqual(NOME_WORKSPACE_MAX)
  })

  it('la revisione: una chat riaperta altrove nel frattempo resta lì, non torna doppia', () => {
    const voci = mettiNelRecupero([], archivio('Lavoro', ws('Lavoro'), ws('Prova', 'a', 'b')), 'Prova', ORA)
    // «a» è stata riaperta in «Lavoro» dopo l'eliminazione.
    const e = ripristina(voci, archivio('Lavoro', ws('Lavoro', 'a')), { nome: 'Prova', eliminatoIl: ORA }, ORA)
    expect(e.ok).toBe(true)
    if (!e.ok) return
    const sessioni = (nome: string): string[] => Object.values(e.archivio.workspace.find((w) => w.nome === nome)!.perSlot).flatMap((l) => l.panes.map((p) => p.sessionUuid))
    expect(sessioni('Lavoro')).toEqual(['a'])
    expect(sessioni('Prova')).toEqual(['b'])
  })

  it('una voce scaduta o sconosciuta non torna, e lo dice', () => {
    const voci = mettiNelRecupero([], archivio('Lavoro', ws('Lavoro'), ws('Prova')), 'Prova', ORA)
    expect(ripristina(voci, archivio('Lavoro', ws('Lavoro')), { nome: 'Prova', eliminatoIl: ORA }, giorniDopo(31))).toMatchObject({ ok: false })
    expect(ripristina(voci, archivio('Lavoro', ws('Lavoro')), { nome: 'Prova', eliminatoIl: giorniDopo(1) }, ORA)).toMatchObject({ ok: false })
  })

  it('dal disco si tengono solo le voci con la forma giusta', () => {
    expect(leggiVoci({})).toEqual([])
    expect(leggiVoci([{ eliminatoIl: ORA }, { workspace: { nome: 'X', perSlot: {} }, eliminatoIl: ORA }, null])).toHaveLength(1)
  })
})

describe('il recupero sul disco', () => {
  it('elimina, elenca, ripristina: la voce esce solo dopo che l’archivio è scritto', () => {
    const dati = mkdtempSync(join(tmpdir(), 'sd-recupero-'))
    const prima = archivio('Lavoro', ws('Lavoro'), ws('Prova', 'a'))
    expect(mettiWorkspaceNelRecupero(dati, prima, 'Prova', 'pc', ORA)).toBe(true)
    expect(elencoRecuperoWorkspace(dati, ORA)).toMatchObject([{ nome: 'Prova', chat: 1, da: 'pc' }])
    // La scrittura dell'archivio non riesce: la voce resta.
    const fallita = ripristinaWorkspace(dati, archivio('Lavoro', ws('Lavoro')), { nome: 'Prova', eliminatoIl: ORA }, () => false, ORA)
    expect(fallita.ok).toBe(false)
    expect(elencoRecuperoWorkspace(dati, ORA)).toHaveLength(1)
    let scritto: Archivio | undefined
    const e = ripristinaWorkspace(dati, archivio('Lavoro', ws('Lavoro')), { nome: 'Prova', eliminatoIl: ORA }, (a) => { scritto = a; return true }, ORA)
    expect(e.ok).toBe(true)
    expect(scritto?.workspace.map((w) => w.nome)).toEqual(['Lavoro', 'Prova'])
    expect(elencoRecuperoWorkspace(dati, ORA)).toEqual([])
  })

  it('un file del recupero che non si legge non si riscrive vuoto, e l’eliminazione si ferma prima (la revisione)', () => {
    const dati = mkdtempSync(join(tmpdir(), 'sd-recupero-'))
    expect(recuperoLeggibile(dati)).toBe(true)
    writeFileSync(join(dati, FILE_RECUPERO_WORKSPACE), '{ rotto')
    expect(recuperoLeggibile(dati)).toBe(false)
    expect(mettiWorkspaceNelRecupero(dati, archivio('A', ws('A'), ws('B')), 'B', undefined, ORA)).toBe(false)
    expect(readFileSync(join(dati, FILE_RECUPERO_WORKSPACE), 'utf8')).toBe('{ rotto')
  })
})

describe('le rotte del recupero (pagina e app)', () => {
  const base = (over: Partial<DipendenzeRotte>): DipendenzeRotte => ({
    dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-rotte-'))),
    chat: () => [], autopiloti: () => Promise.resolve([]), rispondi: () => Promise.resolve(), domande: () => Promise.resolve([]),
    scriviAChat: () => undefined, apriChat: () => undefined, cartelle: () => Promise.resolve([]),
    workspace: () => Promise.resolve({ nomi: ['Lavoro'], attivo: 'Lavoro' }), cambiaWorkspace: () => Promise.resolve(),
    fermaAutopilota: () => Promise.resolve(), riprendiAutopilota: () => Promise.resolve(), vaiAutopilota: () => Promise.resolve(),
    creaAutopilota: () => Promise.resolve({ id: 'ap-9' }), eliminaAutopilota: () => Promise.resolve(), riprendiAlRiavvio: () => Promise.resolve(),
    chiudiChat: () => undefined, rinominaChat: () => undefined, sessioni: () => Promise.resolve([]), riprendiSessione: () => undefined,
    creaWorkspace: () => Promise.resolve(), eliminaWorkspace: () => Promise.resolve(), salvataggi: () => Promise.resolve([]),
    caricaIstantanea: () => Promise.resolve(), consumi: () => Promise.resolve({}), quaderno: () => [], scheda: () => undefined,
    impostaPreferenze: () => Promise.resolve(), aggiornamento: () => ({ fase: 'fermo' as const }), cercaAggiornamento: () => undefined,
    scaricaAggiornamento: () => undefined, installaAggiornamento: () => undefined, versione: '0.81.0', apk: () => Promise.resolve(undefined),
    ...over
  } as unknown as DipendenzeRotte)

  it('elenca e ripristina; un PC che non li tiene lo dice', async () => {
    const chiesti: string[] = []
    const su = base({
      recuperoWorkspace: () => Promise.resolve([{ nome: 'Prova', eliminatoIl: ORA, scadeIl: giorniDopo(30), chat: 2 }]),
      ripristinaWorkspace: (n, q) => { chiesti.push(`${n}|${q}`); return Promise.resolve({ ok: true as const, nome: n }) }
    })
    expect((await rotteClient(su)({ metodo: 'GET', percorso: '/api/workspace/recupero', corpo: undefined })).corpo).toMatchObject({ voci: [{ nome: 'Prova', chat: 2 }] })
    const r = await rotteClient(su)({ metodo: 'POST', percorso: '/api/workspace/ripristina', corpo: { nome: 'Prova', eliminatoIl: ORA } })
    expect(r).toMatchObject({ stato: 200, corpo: { fatto: true, nome: 'Prova' } })
    expect(chiesti).toEqual([`Prova|${ORA}`])
    expect((await rotteClient(su)({ metodo: 'POST', percorso: '/api/workspace/ripristina', corpo: { nome: 'Prova' } })).stato).toBe(400)
    const vecchio = base({})
    expect((await rotteClient(vecchio)({ metodo: 'GET', percorso: '/api/workspace/recupero', corpo: undefined })).corpo).toMatchObject({ voci: [], senzaRecupero: true })
    expect((await rotteClient(vecchio)({ metodo: 'POST', percorso: '/api/workspace/ripristina', corpo: { nome: 'Prova', eliminatoIl: ORA } })).stato).toBe(409)
  })

  it('un errore del ripristino arriva al telefono con le sue parole', async () => {
    const su = base({ ripristinaWorkspace: () => Promise.resolve({ ok: false as const, errore: '«Prova» non è più nel recupero.' }) })
    expect(await rotteClient(su)({ metodo: 'POST', percorso: '/api/workspace/ripristina', corpo: { nome: 'Prova', eliminatoIl: ORA } })).toMatchObject({ stato: 409, corpo: { errore: '«Prova» non è più nel recupero.' } })
  })
})
