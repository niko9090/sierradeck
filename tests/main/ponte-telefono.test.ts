import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { creaServerClient } from '../../src/main/client-server'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'
import { creaClientPcRemoto, ErroreRemoto } from '../../src/main/pc-remoto'
import { leggiRichiestaPonte, ROTTE_PONTE } from '@shared/ponte-telefono'
import { ROTTE_VIA_CANALE } from '@shared/strada-pc'
import type { BattitoPc } from '@shared/posta'

/**
 * 0.48.0: dal telefono le chat di tutti i PC dal vivo, attraverso il PC a
 * cui è accoppiato. Gli stessi permessi del PC (le rotte del suo riquadro
 * remoto), mai la chiave di casa al telefono, niente catene fra PC.
 */

describe('le regole del ponte', () => {
  it('passano solo le rotte che il PC usa dal suo riquadro remoto', () => {
    for (const p of ROTTE_PONTE) expect(ROTTE_VIA_CANALE).toContain(p)
    for (const no of ['/api/rinomina', '/api/chiudi', '/api/aggiornamento/installa', '/api/drive/porta', '/api/autopilota/elimina', '/api/ponte', '/api/salute']) {
      const l = leggiRichiestaPonte({ pc: 'lap', percorso: no })
      expect(l.ok, no).toBe(false)
      if (!l.ok) expect(l.stato).toBe(403)
    }
    expect(leggiRichiestaPonte({ pc: 'lap', percorso: '/api/scrivi', corpo: { chat: 'x', testo: 'ciao' } })).toEqual({ ok: true, r: { pc: 'lap', percorso: '/api/scrivi', corpo: { chat: 'x', testo: 'ciao' } } })
    expect(leggiRichiestaPonte({ percorso: '/api/stato' })).toMatchObject({ ok: false, stato: 400 })
    expect(leggiRichiestaPonte({ pc: 'lap', percorso: '/api/stato', corpo: [1] })).toMatchObject({ ok: false, stato: 400 })
  })
  it('la rotta: un altro PC non usa il ponte; senza ponte acceso lo dice', async () => {
    const chiesti: string[] = []
    const base = { dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-ponte-'))) } as unknown as DipendenzeRotte
    const r = rotteClient({ ...base, ponte: async (pc, percorso) => { chiesti.push(`${pc}${percorso}`); return { stato: 200, corpo: { ok: true } } } })
    expect((await r({ metodo: 'POST', percorso: '/api/ponte', corpo: { pc: 'lap', percorso: '/api/stato' }, dispositivo: 'pc' })).stato).toBe(403)
    expect(await r({ metodo: 'POST', percorso: '/api/ponte', corpo: { pc: 'lap', percorso: '/api/stato' }, dispositivo: 'tel-1' })).toMatchObject({ stato: 200, corpo: { ok: true } })
    expect((await r({ metodo: 'POST', percorso: '/api/ponte', corpo: { pc: 'lap', percorso: '/api/rinomina' }, dispositivo: 'tel-1' })).stato).toBe(403)
    expect(chiesti).toEqual(['lap/api/stato'])
    expect((await rotteClient(base)({ metodo: 'POST', percorso: '/api/ponte', corpo: { pc: 'lap', percorso: '/api/stato' }, dispositivo: 'tel-1' })).stato).toBe(409)
  })
})

const server: Server[] = []
afterEach(() => { for (const s of server.splice(0)) s.close() })
const ascolta = async (s: Server): Promise<number> => {
  server.push(s)
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()))
  return (s.address() as AddressInfo).port
}

describe('il giro intero: telefono → PC accoppiato → portatile', () => {
  // Lo stato del portatile: la risposta di /api/stato di un PC (quella che l'app 2.39+ legge).
  const STATO_PORTATILE = JSON.parse(readFileSync('android/app/src/test/resources/pc/0.42.0/stato.json', 'utf8')) as Record<string, unknown>
  const K = 'chiave-di-casa-del-portatile'

  async function casa(): Promise<{ portaFisso: number; chiaveTelefono: string; scritti: unknown[] }> {
    // Il portatile: il suo Client vero, con la chiave di casa.
    const scritti: unknown[] = []
    const portaLap = await ascolta(creaServerClient({
      dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-lap-'))),
      chiaveDiCasa: () => K,
      rotta: ({ percorso, corpo, dispositivo }) => {
        if (dispositivo !== 'pc') return { stato: 500, corpo: { errore: 'doveva arrivare come PC' } }
        if (percorso === '/api/stato') return { stato: 200, corpo: STATO_PORTATILE }
        if (percorso === '/api/scrivi') { scritti.push(corpo); return { stato: 200, corpo: { fatto: true } } }
        if (percorso === '/api/scegli') return { stato: 409, corpo: { errore: 'la domanda è cambiata' } }
        return { stato: 404, corpo: { errore: 'rotta sconosciuta' } }
      }
    }))
    const battito: BattitoPc = { pcId: 'lap', nome: 'LAPTOP', versione: '0.48.0', battito: new Date().toISOString(), cartelle: [], chat: [], indirizzi: ['127.0.0.1'], porta: portaLap }
    // Il fisso: il client verso gli altri PC e il ponte, come in index.ts.
    const remoto = creaClientPcRemoto({ battiti: () => [battito], chiavePer: () => K, mioNome: () => 'FISSO' })
    const dispositivi = apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-fisso-')))
    const rotte = rotteClient({
      dispositivi,
      ponte: async (pc: string, percorso: string, corpo?: Record<string, unknown>) => {
        try { return { stato: 200, corpo: await remoto.chiama(pc, percorso, corpo) } } catch (err) {
          return err instanceof ErroreRemoto ? { stato: err.stato ?? 502, corpo: { errore: err.message, motivo: err.motivo } } : { stato: 502, corpo: { errore: String(err) } }
        }
      }
    } as unknown as DipendenzeRotte)
    const portaFisso = await ascolta(creaServerClient({ dispositivi, rotta: (r) => rotte(r) }))
    const t = dispositivi.accoppia(dispositivi.apriAccoppiamento().codice, 'telefono')
    return { portaFisso, chiaveTelefono: t?.chiave ?? '', scritti }
  }
  const ponte = async (porta: number, chiave: string | undefined, corpo: unknown): Promise<{ stato: number; dati: Record<string, unknown> }> => {
    const r = await fetch(`http://127.0.0.1:${porta}/api/ponte`, {
      method: 'POST', body: JSON.stringify(corpo),
      headers: { 'content-type': 'application/json', ...(chiave !== undefined ? { 'x-sierradeck-chiave': chiave } : {}) }
    })
    return { stato: r.status, dati: await r.json() as Record<string, unknown> }
  }

  it('il telefono vede le chat del portatile e gli scrive; la risposta è quella del portatile, intera', async () => {
    const { portaFisso, chiaveTelefono, scritti } = await casa()
    const s = await ponte(portaFisso, chiaveTelefono, { pc: 'lap', percorso: '/api/stato' })
    // Intera, più un campo (0.51.0): la strada e il tempo del giro, per l'indicatore del telefono.
    const { ponte: giro, ...delPortatile } = s.dati
    expect({ stato: s.stato, dati: delPortatile }).toEqual({ stato: 200, dati: STATO_PORTATILE })
    expect(typeof (giro as { ritardoMs?: unknown }).ritardoMs).toBe('number')
    const w = await ponte(portaFisso, chiaveTelefono, { pc: 'lap', percorso: '/api/scrivi', corpo: { chat: 'p-1', testo: 'continua' } })
    expect(w).toMatchObject({ stato: 200, dati: { fatto: true } })
    expect(scritti).toEqual([{ chat: 'p-1', testo: 'continua' }])
  })
  it('gli errori del portatile tornano con il loro stato (409 = la domanda è cambiata: non si preme niente)', async () => {
    const { portaFisso, chiaveTelefono } = await casa()
    const e = await ponte(portaFisso, chiaveTelefono, { pc: 'lap', percorso: '/api/scegli', corpo: { chat: 'p-1', opzione: 'Yes' } })
    expect(e.stato).toBe(409)
    expect(String(e.dati.errore)).toContain('la domanda è cambiata')
  })
  it('un telefono non accoppiato non passa; un PC che non c’è si dice per esteso', async () => {
    const { portaFisso, chiaveTelefono } = await casa()
    expect((await ponte(portaFisso, undefined, { pc: 'lap', percorso: '/api/stato' })).stato).toBe(401)
    expect((await ponte(portaFisso, 'inventata', { pc: 'lap', percorso: '/api/stato' })).stato).toBe(401)
    const nessuno = await ponte(portaFisso, chiaveTelefono, { pc: 'ufficio', percorso: '/api/stato' })
    expect(nessuno.stato).toBe(502)
    expect(String(nessuno.dati.errore)).toContain('battito')
  })
})
