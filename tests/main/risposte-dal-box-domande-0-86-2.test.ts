import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'
import { notificaSoloStato } from '@shared/domande-telefono'

/**
 * 0.86.2 — «le risposte non arrivano alla chat quando sono fatte dal box
 * domande». Dal lato del PC: una risposta a una chat che qui non c'è non dice
 * più «fatto»; e un «idle_prompt» senza domanda non diventa una domanda.
 */
const rotte = (over: Partial<DipendenzeRotte>): ReturnType<typeof rotteClient> => rotteClient({
  dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-box-'))),
  chat: () => [{ id: 'p-1', titolo: 'Clienti', cwd: 'C:\\x' }],
  ...over
} as unknown as DipendenzeRotte)

describe('/api/scrivi verso una chat che qui non c’è', () => {
  it('404, e niente scritto alle finestre (prima: «fatto» e la risposta spariva)', async () => {
    const scritti: string[] = []
    const r = rotte({ scriviAChat: (c: string, t: string) => { scritti.push(`${c}:${t}`) } })
    const e = await r({ metodo: 'POST', percorso: '/api/scrivi', corpo: { chat: 'p-chiusa', testo: 'sì' }, dispositivo: 'locale' })
    expect(e.stato).toBe(404)
    expect(JSON.stringify(e.corpo)).toContain('chat non trovata')
    expect(scritti).toEqual([])
  })
  it('alla chat aperta si scrive come prima', async () => {
    const scritti: string[] = []
    const r = rotte({ scriviAChat: (c: string, t: string) => { scritti.push(`${c}:${t}`) } })
    const e = await r({ metodo: 'POST', percorso: '/api/scrivi', corpo: { chat: 'p-1', testo: 'sì' }, dispositivo: 'locale' })
    expect(e.corpo).toEqual({ fatto: true })
    expect(scritti).toEqual(['p-1:sì'])
  })
})

describe('«idle_prompt» è uno stato, non una domanda', () => {
  it('senza una domanda in fondo all’ultimo messaggio: solo stato', () => {
    expect(notificaSoloStato('idle_prompt', 'Ho finito il refactoring e i test passano.')).toBe(true)
    expect(notificaSoloStato('idle_prompt', undefined)).toBe(true)
  })
  it('con una domanda vera in fondo: è una domanda', () => {
    expect(notificaSoloStato('idle_prompt', 'Ho preparato due strade.\n\nUso la chiave di prova o quella vera?')).toBe(false)
  })
  it('un permesso resta una domanda', () => {
    expect(notificaSoloStato('permission_prompt', 'Ho finito.')).toBe(false)
  })
})
