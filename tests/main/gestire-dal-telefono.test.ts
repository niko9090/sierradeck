import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { creaServerClient } from '../../src/main/client-server'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'
import { creaClientPcRemoto, ErroreRemoto } from '../../src/main/pc-remoto'
import type { BattitoPc } from '@shared/posta'
import type { AzioneFinestra, RichiestaAutopilota } from '@shared/azioni-telefono'

/**
 * 0.55.0, il difetto di Nicholas del 09/10: «Ho provato nell'app sul cell di
 * aprire un workspace nuovo e una chat nuova ma non si riesce, va in errore, e
 * poi non posso eliminare workspace o chat».
 *
 * Il giro intero con i server veri: telefono → PC accoppiato («FISSO») →
 * altro PC («LAPTOP») con la chiave di casa. Prima della 0.55.0 il ponte (e
 * l'app, ancora prima di chiamare) rifiutava con 403 tutto quello che non era
 * «guardare e scrivere»: crea workspace, sfoglia, cartelle, chiudi, autopilota.
 */

const server: Server[] = []
afterEach(() => { for (const s of server.splice(0)) s.close() })
const ascolta = async (s: Server): Promise<number> => {
  server.push(s)
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()))
  return (s.address() as AddressInfo).port
}

const K = 'chiave-di-casa-di-esempio'

type Portatile = {
  nomi: string[]
  azioni: AzioneFinestra[]
  aperte: { cartella: string; workspace?: string }[]
  autopiloti: RichiestaAutopilota[]
}

async function casa(): Promise<{ portaFisso: number; chiaveTelefono: string; lap: Portatile }> {
  const lap: Portatile = { nomi: ['Predefinito', 'Lavoro'], azioni: [], aperte: [], autopiloti: [] }
  // Il portatile: le rotte vere, con una finestra finta che esegue le azioni.
  const rotteLap = rotteClient({
    dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-lap-'))),
    chat: () => [{ id: 'p-1', titolo: 'Esempio', cwd: 'C:\\Progetti\\Esempio', coda: [] }],
    workspace: () => Promise.resolve({ nomi: lap.nomi, attivo: lap.nomi[0] ?? '' }),
    cartelle: () => Promise.resolve(['C:\\Progetti\\Esempio']),
    cartellaEsiste: (c: string) => Promise.resolve(c.startsWith('C:\\Progetti')),
    cartellaUtente: () => 'C:\\Users\\esempio',
    apriChat: (cartella: string, _m?: string, workspace?: string) => { lap.aperte.push({ cartella, ...(workspace !== undefined ? { workspace } : {}) }) },
    creaAutopilota: (r: RichiestaAutopilota) => { lap.autopiloti.push(r); return Promise.resolve({ id: 'ap-1' }) },
    azioneFinestra: (a: AzioneFinestra) => {
      lap.azioni.push(a)
      if (a.tipo === 'workspace' && a.azione === 'crea') lap.nomi = [...lap.nomi, a.nome]
      if (a.tipo === 'workspace' && a.azione === 'elimina') lap.nomi = lap.nomi.filter((n) => n !== a.nome)
      return Promise.resolve({ ok: true })
    },
    sfoglia: (dove: string) => Promise.resolve({ percorso: dove, voci: [{ nome: 'Esempio', percorso: 'C:\\Progetti\\Esempio' }] })
  } as unknown as DipendenzeRotte)
  const portaLap = await ascolta(creaServerClient({
    dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-lap2-'))),
    chiaveDiCasa: () => K,
    rotta: (r) => rotteLap(r)
  }))
  const battito: BattitoPc = { pcId: 'lap', nome: 'LAPTOP', versione: '0.55.0', battito: new Date().toISOString(), cartelle: [], chat: [], indirizzi: ['127.0.0.1'], porta: portaLap }
  const remoto = creaClientPcRemoto({ battiti: () => [battito], chiavePer: () => K, mioNome: () => 'FISSO' })
  const dispositivi = apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-fisso-')))
  const rotte = rotteClient({
    dispositivi,
    ponte: async (pc: string, percorso: string, corpo?: Record<string, unknown>) => {
      try { return { stato: 200, corpo: await remoto.chiama(pc, percorso, corpo) } } catch (err) {
        // Come `ponteVersoPc` in index.ts: i campi dell'errore di quel PC arrivano interi.
        return err instanceof ErroreRemoto ? { stato: err.stato ?? 502, corpo: { ...(err.altro ?? {}), errore: err.message, motivo: err.motivo } } : { stato: 502, corpo: { errore: String(err) } }
      }
    }
  } as unknown as DipendenzeRotte)
  const portaFisso = await ascolta(creaServerClient({ dispositivi, rotta: (r) => rotte(r) }))
  const t = dispositivi.accoppia(dispositivi.apriAccoppiamento().codice, 'telefono')
  return { portaFisso, chiaveTelefono: t?.chiave ?? '', lap }
}

const ponte = async (porta: number, chiave: string, percorso: string, corpo?: unknown): Promise<{ stato: number; dati: Record<string, unknown> }> => {
  const r = await fetch(`http://127.0.0.1:${porta}/api/ponte`, {
    method: 'POST', body: JSON.stringify({ pc: 'lap', percorso, ...(corpo !== undefined ? { corpo } : {}) }),
    headers: { 'content-type': 'application/json', 'x-sierradeck-chiave': chiave }
  })
  return { stato: r.status, dati: await r.json() as Record<string, unknown> }
}

describe('gestire un altro PC dal telefono, attraverso il ponte (0.55.0)', () => {
  it('un workspace nuovo e una chat nuova là: la chat nasce sul PC scelto, nel workspace scelto', async () => {
    const { portaFisso, chiaveTelefono, lap } = await casa()
    expect((await ponte(portaFisso, chiaveTelefono, '/api/workspace/crea', { nome: 'Dal telefono' })).stato).toBe(200)
    expect(lap.nomi).toContain('Dal telefono')
    // La cartella si sceglie sfogliando quel PC, poi si apre.
    const sf = await ponte(portaFisso, chiaveTelefono, '/api/sfoglia', { percorso: 'C:\\Progetti' })
    expect(sf.stato).toBe(200)
    expect((sf.dati.voci as { percorso: string }[])[0]?.percorso).toBe('C:\\Progetti\\Esempio')
    const ap = await ponte(portaFisso, chiaveTelefono, '/api/apri', { cartella: 'C:\\Progetti\\Esempio', workspace: 'Dal telefono' })
    expect(ap.stato).toBe(200)
    // La chat l'ha aperta il portatile, non il PC accoppiato: la sua casa è là (regola dell'ospite, 0.52).
    expect(lap.aperte).toEqual([{ cartella: 'C:\\Progetti\\Esempio', workspace: 'Dal telefono' }])
    // Un workspace che là non c'è: non se ne crea uno di nascosto.
    expect((await ponte(portaFisso, chiaveTelefono, '/api/apri', { cartella: 'C:\\Progetti\\Esempio', workspace: 'Inventato' })).stato).toBe(404)
  })

  it('chiudere, mettere a dormire, spostare una chat ed eliminare un workspace là, con le azioni della finestra', async () => {
    const { portaFisso, chiaveTelefono, lap } = await casa()
    expect((await ponte(portaFisso, chiaveTelefono, '/api/chat/dormi', { chat: 'p-1' })).stato).toBe(200)
    expect((await ponte(portaFisso, chiaveTelefono, '/api/chat/sposta', { chat: 'p-1', workspace: 'Lavoro' })).stato).toBe(200)
    expect((await ponte(portaFisso, chiaveTelefono, '/api/chat/chiudi', { chat: 'p-1' })).stato).toBe(200)
    expect((await ponte(portaFisso, chiaveTelefono, '/api/workspace/elimina', { nome: 'Lavoro' })).stato).toBe(200)
    // L'ultimo resta.
    const ultimo = await ponte(portaFisso, chiaveTelefono, '/api/workspace/elimina', { nome: 'Predefinito' })
    expect(ultimo.stato).toBe(409)
    expect(lap.azioni).toEqual([
      { tipo: 'chat', azione: 'dormi', chat: 'p-1' },
      { tipo: 'chat', azione: 'sposta', chat: 'p-1', workspace: 'Lavoro' },
      { tipo: 'chat', azione: 'chiudi', chat: 'p-1' },
      { tipo: 'workspace', azione: 'elimina', nome: 'Lavoro' }
    ])
  })

  it('un autopilota affidato a quel PC, con tutti i campi; la stessa validazione del PC', async () => {
    const { portaFisso, chiaveTelefono, lap } = await casa()
    const ok = await ponte(portaFisso, chiaveTelefono, '/api/autopilota/crea', {
      obiettivo: 'Porta i test a verde', cartella: 'C:\\Progetti\\Esempio', criteri: ['npm test passa'], pubblicazione: 'unica', vaSulCloud: true, workspace: 'Lavoro', partenza: 'subito'
    })
    expect(ok).toMatchObject({ stato: 200, dati: { fatto: true, autopilota: 'ap-1' } })
    expect(lap.autopiloti).toEqual([{ nome: 'Porta i test a verde', obiettivo: 'Porta i test a verde', cwd: 'C:\\Progetti\\Esempio', criteri: [{ descrizione: 'npm test passa' }], pubblicazione: 'unica', vaSulCloud: true, workspace: 'Lavoro', partenza: 'subito' }])
    const no = await ponte(portaFisso, chiaveTelefono, '/api/autopilota/crea', { obiettivo: '', cartella: 'C:\\Progetti\\Esempio' })
    expect(no).toMatchObject({ stato: 400, dati: { campo: 'obiettivo' } })
    const radice = await ponte(portaFisso, chiaveTelefono, '/api/autopilota/crea', { obiettivo: 'x', cartella: 'C:\\' })
    expect(radice).toMatchObject({ stato: 403, dati: { campo: 'cwd' } })
  })

  it('il Drive, gli aggiornamenti e l’account di un altro PC restano fuori dal ponte', async () => {
    const { portaFisso, chiaveTelefono } = await casa()
    for (const p of ['/api/drive/porta', '/api/aggiornamento/installa', '/api/account/esci', '/api/negozio/installa']) {
      expect((await ponte(portaFisso, chiaveTelefono, p, {})).stato, p).toBe(403)
    }
  })
})
