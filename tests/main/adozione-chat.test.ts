import { describe, it, expect, beforeEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { avviaGiroAdozione, creaMigrazioneAdozione, type ServizioAdozione } from '../../src/main/adozione-chat'
import { conChatAdottate, conMessaggiAdottate, conSoloMia } from '@shared/adozione'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import { parseArchivio, type Archivio } from '@shared/workspace'
import type { StatoMigrazione } from '@shared/migrazione-elenco'

/**
 * 0.78.0, c-30. Nicholas: «le chat già avviate non le hai convertite». Gli
 * autopiloti veri adottano le chat del loro workspace; sicurezza come nella
 * 0.74.1: copia prima, idempotente, guasto → com'era, «Torna come prima»,
 * solo i workspace di questo PC, nessun file delle chat toccato.
 */
const pane = (id: string, title: string) => ({ id, sessionUuid: `s-${id}`, cwd: 'E:\\p', title })
const ARCHIVIO = {
  versione: 1, attivo: 'S',
  workspace: [
    { nome: 'S', perSlot: { 1: { root: { type: 'split', id: 'x', direction: 'horizontal', children: [{ type: 'pane', id: 'a' }, { type: 'pane', id: 'b' }], sizes: [0.5, 0.5] }, panes: [pane('a', 'la chat dell autopilota'), pane('b', 'correggi il bug')] } } },
    { nome: 'Solo dormiente', perSlot: { 1: { root: { type: 'pane', id: 'c' }, panes: [pane('c', 'ciao')] } } }
  ]
}
const MIG: StatoMigrazione = { versione: 1, stato: 'fatta', iniziata: 'x', prima: { workspaceElenco: [] }, aggiunti: ['S', 'Solo dormiente'], dormienti: [{ workspace: 'S', chat: 2 }, { workspace: 'Solo dormiente', chat: 1 }] }

let dati = ''
let righe: string[] = []
let autopiloti: Autopilota[] = []
const archivio = (): Archivio => parseArchivio(JSON.parse(readFileSync(join(dati, 'workspaces.json'), 'utf8'))).archivio
const servizio = (rompi?: () => void): ServizioAdozione & { scritti: (id: string, ids: string[]) => Promise<void> } => ({
  elenca: async () => autopiloti,
  adotta: async (id, chat) => {
    rompi?.()
    const i = autopiloti.findIndex((a) => a.id === id)
    const r = conChatAdottate(autopiloti[i]!, chat, 'q')
    autopiloti[i] = r.autopilota
    return r.nuove.map((x) => x.sessionId)
  },
  togli: async (id, sessioni) => {
    const i = autopiloti.findIndex((a) => a.id === id)
    autopiloti[i] = { ...autopiloti[i]!, adottate: (autopiloti[i]!.adottate ?? []).filter((x) => !sessioni.includes(x.sessionId)) }
  },
  scritti: async (id, ids) => {
    const i = autopiloti.findIndex((a) => a.id === id)
    autopiloti[i] = { ...autopiloti[i]!, perAdottate: (autopiloti[i]!.perAdottate ?? []).filter((m) => !ids.includes(m.id)) }
  }
})
const crea = (s = servizio(), guasto?: Parameters<typeof creaMigrazioneAdozione>[0]['guasto']) => creaMigrazioneAdozione({
  dati, leggiArchivio: archivio, statoMigrazione: () => MIG, servizio: s, log: (r) => { righe.push(r) }, adesso: () => new Date('2026-10-16T16:00:00Z'),
  ...(guasto !== undefined ? { guasto } : {})
})

beforeEach(() => {
  dati = mkdtempSync(join(tmpdir(), 'sd-adozione-'))
  writeFileSync(join(dati, 'workspaces.json'), JSON.stringify(ARCHIVIO))
  writeFileSync(join(dati, 'migrazione-elenco.json'), JSON.stringify(MIG))
  mkdirSync(join(dati, 'autopiloti'))
  writeFileSync(join(dati, 'autopiloti', 'ap-1.json'), '{"id":"ap-1"}')
  autopiloti = [{ ...nuovoAutopilota({ id: 'ap-1', nome: 'S', obiettivo: 'o', cwd: 'E:\\p', criteri: [], iniziatoIl: 'x', workspace: 'S' }), sessionId: 's-a', stato: 'finito' }]
  righe = []
})

describe('l’adozione delle chat già avviate', () => {
  it('l’autopilota vero adotta le chat del suo workspace (non la sua), il dormiente doppio si archivia; copia prima, workspaces.json intatto', async () => {
    const prima = readFileSync(join(dati, 'workspaces.json'), 'utf8')
    const e = await crea().esegui()
    expect(e.esito).toBe('fatta')
    expect(autopiloti[0]!.adottate?.map((x) => x.sessionId)).toEqual(['s-b'])
    expect(autopiloti[0]!.adottate?.[0]?.ruolo).toBe('sviluppo')
    expect(e.stato?.dormientiArchiviati).toEqual([{ workspace: 'S', chat: 2 }])
    expect(e.stato?.adozioni).toEqual([{ autopilota: 'ap-1', workspace: 'S', sessioni: ['s-b'] }])
    expect(readFileSync(join(dati, 'workspaces.json'), 'utf8')).toBe(prima)
    const copie = readdirSync(join(dati, 'copie-di-versione'))
    expect(copie.some((c) => c.startsWith('migrazione-adozione-'))).toBe(true)
    expect(existsSync(join(dati, 'copie-di-versione', copie[0]!, 'autopiloti', 'ap-1.json'))).toBe(true)
    expect(righe.some((r) => r.startsWith('[migrazione] adozione fatta') && r.includes('nessuna chat chiusa o riavviata'))).toBe(true)
  })
  it('idempotente: rifatta non adotta due volte e non rifà la copia', async () => {
    await crea().esegui()
    const e = await crea().esegui()
    expect(e.esito).toBe('gia')
    const r = await crea().rifai()
    expect(r.stato?.adozioni[0]?.sessioni).toEqual([])
    expect(autopiloti[0]!.adottate).toHaveLength(1)
  })
  it('un guasto a metà toglie quello che aveva adottato: com’era prima, e lo dice', async () => {
    const e = await crea(servizio(), (p) => { if (p === 'dopo-adozione') throw new Error('spento') }).esegui()
    expect(e.esito).toBe('fallita')
    expect(autopiloti[0]!.adottate).toEqual([])
    expect(righe.some((r) => r.includes("adozione non riuscita, tutto com'era prima: spento"))).toBe(true)
  })
  it('il servizio che non risponde non blocca: fallita, niente adottato', async () => {
    const e = await crea(servizio(() => { throw new Error('servizio giù') })).esegui()
    expect(e.esito).toBe('fallita')
    expect(autopiloti[0]!.adottate).toBeUndefined()
  })
  it('«Torna come prima»: le chat adottate tornano normali, lo stato è «annullata»', async () => {
    const m = crea()
    await m.esegui()
    const t = await m.tornaComePrima()
    expect(t.ok).toBe(true)
    expect(autopiloti[0]!.adottate).toEqual([])
    expect(m.stato()?.stato).toBe('annullata')
  })
  it('«Torna come prima» toglie anche le chat adottate dopo, dal giro (prova del 16/10)', async () => {
    const m = crea()
    await m.esegui()
    autopiloti[0] = conChatAdottate(autopiloti[0]!, [{ sessionId: 's-nuova', titolo: 'aperta dopo' }], 'q').autopilota
    expect(autopiloti[0]!.adottate).toHaveLength(2)
    expect((await m.tornaComePrima()).ok).toBe(true)
    expect(autopiloti[0]!.adottate).toEqual([])
  })
  it('senza autopiloti veri non cambia niente e non copia', async () => {
    autopiloti = []
    const e = await crea().esegui()
    expect(e.esito).toBe('niente')
    expect(existsSync(join(dati, 'copie-di-versione'))).toBe(false)
  })
})

describe('il giro dell’adozione', () => {
  it('scrive solo alla chat adottata ferma e mai a una «solo mia»; adotta le chat nuove', async () => {
    let a = conChatAdottate(autopiloti[0]!, [{ sessionId: 's-b', titolo: 'b' }, { sessionId: 's-z', titolo: 'z' }], 'q').autopilota
    a = conMessaggiAdottate(a, [{ id: 'm1', quando: 'q', sessionId: 's-b', testo: 'fai i test' }, { id: 'm2', quando: 'q', sessionId: 's-z', testo: 'no' }])
    a = conSoloMia(a, 's-z', true)
    autopiloti = [a]
    const scritte: string[] = []
    let ferma = false
    const stop = avviaGiroAdozione({
      servizio: servizio(), leggiArchivio: archivio, adozioneAttiva: () => true,
      chat: () => [{ id: 'b', sessione: 's-b', aspetta: ferma, viva: true }, { id: 'z', sessione: 's-z', aspetta: true, viva: true }],
      scrivi: (id, t) => { scritte.push(`${id}:${t}`) }, log: () => undefined, ogniMs: 10
    })
    await new Promise((r) => setTimeout(r, 60))
    expect(scritte).toEqual([])
    ferma = true
    await new Promise((r) => setTimeout(r, 60))
    stop()
    expect(scritte).toEqual(['b:fai i test'])
    expect(autopiloti[0]!.perAdottate).toEqual([])
  })
})
