import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'
import { MODELLI } from '@shared/modelli'

/**
 * Le mancanze della tabella della parità che costavano poco (0.56.0):
 * archiviare un autopilota, il PIN di una chat, l'ospite, nome e modello
 * della chat nuova — dal telefono, come dal PC.
 */
function base(extra: Partial<DipendenzeRotte> & Record<string, unknown>): ReturnType<typeof rotteClient> {
  return rotteClient({
    dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-par-'))),
    chat: () => [{ id: 'p-1', titolo: 'Esempio', cwd: 'C:\\Progetti\\Esempio', sessione: 's-1', coda: [] }],
    workspace: () => Promise.resolve({ nomi: ['Lavoro'], attivo: 'Lavoro' }),
    cartelle: () => Promise.resolve(['C:\\Progetti\\Esempio']),
    autopiloti: () => Promise.resolve([{ id: 'ap-1', stato: 'sospeso' }, { id: 'ap-2', stato: 'lavoro' }]),
    ...extra
  } as unknown as DipendenzeRotte)
}
const vai = (r: ReturnType<typeof rotteClient>, percorso: string, corpo?: object): ReturnType<ReturnType<typeof rotteClient>> =>
  r({ metodo: corpo === undefined ? 'GET' : 'POST', percorso, corpo, dispositivo: 'tel-1' })

describe('le mancanze della parità, dal telefono', () => {
  it('archiviare: solo un autopilota fermo; e si toglie dall’archivio', async () => {
    const fatti: string[] = []
    const r = base({ archiviaAutopilota: async (id: string, a: boolean) => { fatti.push(`${id}:${a}`) } })
    expect((await vai(r, '/api/autopilota/archivia', { autopilota: 'ap-1' })).stato).toBe(200)
    expect(await vai(r, '/api/autopilota/archivia', { autopilota: 'ap-2' })).toMatchObject({ stato: 409 })
    expect((await vai(r, '/api/autopilota/archivia', { autopilota: 'ap-1', archivia: false })).stato).toBe(200)
    expect((await vai(r, '/api/autopilota/archivia', { autopilota: 'ap-9' })).stato).toBe(404)
    expect(fatti).toEqual(['ap-1:true', 'ap-1:false'])
  })

  it('il PIN: senza PIN sul computer lo dice; proteggere sempre; togliere solo a chat aperta', async () => {
    const fatti: string[] = []
    let impostato = false
    let chiusa = true
    let protetta = false
    const pin = {
      stato: () => ({ impostato }),
      protetta: () => protetta,
      chiusa: () => protetta && chiusa,
      tocca: () => undefined
    }
    const r = base({ pin: pin as never, proteggiChat: (s: string, si: boolean) => { fatti.push(`${s}:${si}`); protetta = si } })
    expect((await vai(r, '/api/pin/proteggi', { chat: 'p-1', si: true })).stato).toBe(409)
    impostato = true
    expect((await vai(r, '/api/pin/proteggi', { chat: 'p-1', si: true })).stato).toBe(200)
    // Protetta e chiusa per chi guarda: togliere no, serve prima il PIN.
    expect((await vai(r, '/api/pin/proteggi', { chat: 'p-1', si: false })).stato).toBe(423)
    chiusa = false
    expect((await vai(r, '/api/pin/proteggi', { chat: 'p-1', si: false })).stato).toBe(200)
    expect(fatti).toEqual(['s-1:true', 's-1:false'])
  })

  it('l’ospite: la scelta arriva a casa:scegli con la sessione della chat', async () => {
    const scelte: unknown[] = []
    const r = base({ scegliOspite: async (sessioni: string[], pc: { id: string; nome: string }) => { scelte.push({ sessioni, pc }); return { ok: true, messaggio: 'Fatto' } } })
    expect(await vai(r, '/api/chat/ospite', { chat: 'p-1', pc: 'pc-esempio-id', pcNome: 'PC-ESEMPIO' })).toMatchObject({ stato: 200, corpo: { messaggio: 'Fatto' } })
    expect((await vai(r, '/api/chat/ospite', { chat: 'p-1' })).stato).toBe(400)
    expect(scelte).toEqual([{ sessioni: ['s-1'], pc: { id: 'pc-esempio-id', nome: 'PC-ESEMPIO' } }])
  })

  it('chat nuova con nome e modello; un modello sconosciuto no', async () => {
    const aperte: unknown[] = []
    const r = base({ apriChat: (c: string, m?: string, w?: string, n?: string) => { aperte.push({ c, m, w, n }) } })
    expect((await vai(r, '/api/modelli')).corpo).toEqual({ modelli: MODELLI })
    expect((await vai(r, '/api/apri', { cartella: 'C:\\Progetti\\Esempio', nome: 'Relazione', modello: 'sonnet' })).stato).toBe(200)
    expect((await vai(r, '/api/apri', { cartella: 'C:\\Progetti\\Esempio', modello: 'gpt-qualcosa' })).stato).toBe(400)
    expect(aperte).toEqual([{ c: 'C:\\Progetti\\Esempio', m: 'sonnet', w: undefined, n: 'Relazione' }])
  })
  it('«Installa là» dal telefono (0.56.2): dal telefono sì, da un altro PC no; senza Salute pronta lo dice', async () => {
    const chiesti: string[] = []
    const r = base({ installaLa: (pc: string) => { chiesti.push(pc); return { pcId: pc, fase: 'cerco', messaggio: 'Busso…' } }, installaLaStato: () => [{ pcId: 'pc-esempio-id', fase: 'cerco' }] })
    expect(await vai(r, '/api/installa-la', { pc: 'pc-esempio-id' })).toMatchObject({ stato: 200, corpo: { fatto: true } })
    expect((await r({ metodo: 'POST', percorso: '/api/installa-la', corpo: { pc: 'pc-esempio-id' }, dispositivo: 'pc:altro' })).stato).toBe(403)
    expect((await vai(r, '/api/installa-la', {})).stato).toBe(400)
    expect(await vai(r, '/api/installa-la/stato')).toMatchObject({ stato: 200, corpo: { avanzamenti: [{ pcId: 'pc-esempio-id' }] } })
    expect(chiesti).toEqual(['pc-esempio-id'])
    // Un PC che non c'è: 404 subito, invece di riprovare per sempre (ripasso 0.56.2).
    expect((await vai(base({ installaLa: () => ({ sconosciuto: true }) }), '/api/installa-la', { pc: 'nessuno' })).stato).toBe(404)
    const senza = base({ installaLa: () => undefined })
    expect((await vai(senza, '/api/installa-la', { pc: 'x' })).stato).toBe(409)
  })
})
