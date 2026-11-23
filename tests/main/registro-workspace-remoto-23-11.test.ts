import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { creaServerClient } from '../../src/main/client-server'
import { apriDispositivi } from '../../src/main/dispositivi'
import { creaClientPcRemoto, ErroreRemoto } from '../../src/main/pc-remoto'
import { chiediRegistroWorkspace, rispondiRegistroWorkspace, type FonteRegistroWorkspace } from '../../src/main/registro-workspace-pc'
import { registriDelleScadute } from '../../src/main/rapporti-lavori-analisi'
import { riassumi } from '../../src/main/rapporti-lavori-analisi'
import { MAX_BYTE_REGISTRO, MAX_RIGHE_REGISTRO, pianoVisto, righeDelWorkspace, ROTTA_REGISTRO_WORKSPACE, type RegistroWorkspaceVisto } from '@shared/registro-workspace'
import { lavoriVuoti } from '@shared/rapporto-lavori'
import type { BattitoPc } from '@shared/posta'

/**
 * k-197d: il registro (unioni di prova, criteri) e il piano di un workspace letti da un
 * altro PC, sulle strade vere: il server del Client di un PC d'esempio e un altro PC
 * che bussa con la firma di casa (o con una chiave sbagliata).
 */
const K = 'chiave-di-casa-di-esempio'
const WS = 'AREA-UNO'
const ALTRO = 'AREA-DUE'
const riga = (n: number, t: string): string => `2026-11-23T10:${String(n % 60).padStart(2, '0')}:00.000Z [info] [main] ${t}`

const REGISTRO = [
  riga(1, `[unione di prova] [ws: ${WS}] ramo-a: attesa del turno 10 s, prova 20 s`),
  riga(2, `[unione di prova] [ws: ${ALTRO}] ramo-b: attesa del turno 90 s, prova 400 s (scaduta mentre stava per criterio)`),
  riga(3, `[criterio] [ws: ${WS}] finito con 1 in 30 s`),
  riga(4, `[orchestratore] ${WS} — k1: unione in fila, 2ª, dopo k0`),
  riga(5, `[orchestratore] ${ALTRO} — k9: unione in fila, 3ª, dopo k8`),
  riga(6, `[orchestratore] ${WS} — unione di k2 ripresa dopo il riavvio`),
  riga(7, `[unione di prova] [ws: ${WS}] ramo-c: attesa del turno 5 s, prova 500 s (scaduta mentre stava per unione)`),
  riga(8, '[chat] testo di una chat che non va mai mandato'),
  riga(9, `[unione di prova] ramo-d: attesa del turno 1 s, prova 1 s`)
]

const PIANO = pianoVisto(
  [
    { id: 'k1', richiesta: 'r-1', titolo: 'Primo compito', stato: 'unito', peso: 1, criterioVerde: false, esito: 'criterio rosso: 3 test' },
    { id: 'k2', richiesta: 'r-1', titolo: 'Secondo compito', stato: 'in-revisione', peso: 2 }
  ],
  [{ id: 'r-1', titolo: 'Una richiesta', stato: 'in-corso' }]
)

const fonte = (extra: Partial<FonteRegistroWorkspace> = {}): FonteRegistroWorkspace => ({
  righe: () => REGISTRO,
  ospita: (ws) => ws === WS || ws === ALTRO,
  piano: async () => PIANO,
  ...extra
})

const server: Server[] = []
afterEach(() => { for (const s of server.splice(0)) s.close() })

async function casa(f: FonteRegistroWorkspace | undefined) {
  const dispositivi = apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-regws-')))
  const s = creaServerClient({
    dispositivi,
    chiaveDiCasa: () => K,
    rotta: async (r) => (await rispondiRegistroWorkspace(r, f)) ?? { stato: 404, corpo: { errore: 'no' } }
  })
  server.push(s)
  await new Promise<void>((ok) => s.listen(0, '127.0.0.1', () => ok()))
  return (s.address() as AddressInfo).port
}
const pcCon = (porta: number, chiave: string): ReturnType<typeof creaClientPcRemoto> => {
  const b: BattitoPc = { pcId: 'casa', nome: 'PC-ESEMPIO-A', versione: '1.0.0', battito: new Date().toISOString(), cartelle: [], chat: [], indirizzi: ['127.0.0.1'], porta }
  return creaClientPcRemoto({ battiti: () => [b], chiavePer: () => chiave, mioNome: () => 'PC-ESEMPIO-B', mioId: () => 'pc-b' })
}

describe('registro e piano di un workspace letti da un altro PC', () => {
  it('con la firma di casa dà le righe di quel workspace e il piano, e niente altro', async () => {
    const porta = await casa(fonte())
    const r = await chiediRegistroWorkspace(pcCon(porta, K), 'casa', WS)
    expect(r?.ospitato).toBe(true)
    const v = r as RegistroWorkspaceVisto
    expect(v.righe).toHaveLength(5)
    expect(v.righe.join('\n')).toContain('ramo-a')
    expect(v.righe.join('\n')).toContain('unione in fila, 2ª')
    expect(v.righe.join('\n')).toContain('ripresa dopo il riavvio')
    expect(v.righe.join('\n')).toContain('(scaduta mentre stava per unione)')
    expect(v.righe.join('\n')).not.toContain(ALTRO)
    expect(v.righe.join('\n')).not.toContain('chat')
    expect(v.piano.compiti.map((c) => [c.id, c.stato, c.criterioVerde, c.esito])).toEqual([['k1', 'unito', false, 'criterio rosso: 3 test'], ['k2', 'in-revisione', undefined, undefined]])
    // Del piano solo stati ed esiti: nessun testo di richiesta o di chat.
    expect(Object.keys(v.piano.richieste[0] as object).sort()).toEqual(['id', 'stato', 'titolo'])
  })

  it('una firma sbagliata è rifiutata e la fonte non è mai letta', async () => {
    let lette = 0
    const porta = await casa(fonte({ righe: () => { lette += 1; return REGISTRO } }))
    const e = await pcCon(porta, 'chiave-di-un-altra-casa').chiama('casa', ROTTA_REGISTRO_WORKSPACE, { workspace: WS }).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(ErroreRemoto)
    expect(await chiediRegistroWorkspace(pcCon(porta, 'chiave-di-un-altra-casa'), 'casa', WS)).toBeUndefined()
    expect(lette).toBe(0)
  })

  it('un workspace che questo PC non ospita: lo dice, senza righe né piano', async () => {
    const porta = await casa(fonte())
    expect(await chiediRegistroWorkspace(pcCon(porta, K), 'casa', 'WS-ALTROVE')).toEqual({ ospitato: false, workspace: 'WS-ALTROVE' })
  })

  it('senza fonte (l’Aiutante) risponde che non ospita workspace', async () => {
    const porta = await casa(undefined)
    expect(await chiediRegistroWorkspace(pcCon(porta, K), 'casa', WS)).toEqual({ ospitato: false, workspace: WS })
  })

  it('un corpo senza workspace è 400; da un telefono o dal PC stesso 403; il GET 405', async () => {
    const f = fonte()
    const base = { percorso: ROTTA_REGISTRO_WORKSPACE, corpo: { workspace: WS } }
    expect((await rispondiRegistroWorkspace({ metodo: 'POST', percorso: ROTTA_REGISTRO_WORKSPACE, corpo: {}, dispositivo: 'pc:pc-b' }, f))?.stato).toBe(400)
    expect((await rispondiRegistroWorkspace({ metodo: 'POST', percorso: ROTTA_REGISTRO_WORKSPACE, corpo: { workspace: 'a\nb' }, dispositivo: 'pc:pc-b' }, f))?.stato).toBe(400)
    expect((await rispondiRegistroWorkspace({ metodo: 'POST', ...base, dispositivo: 'tel:abc' }, f))?.stato).toBe(403)
    expect((await rispondiRegistroWorkspace({ metodo: 'POST', ...base, dispositivo: 'pc:tel:abc' }, f))?.stato).toBe(403)
    expect((await rispondiRegistroWorkspace({ metodo: 'POST', ...base }, f))?.stato).toBe(403)
    expect((await rispondiRegistroWorkspace({ metodo: 'GET', ...base, dispositivo: 'pc:pc-b' }, f))?.stato).toBe(405)
    expect(await rispondiRegistroWorkspace({ metodo: 'POST', percorso: '/api/altro', corpo: {}, dispositivo: 'pc:pc-b' }, f)).toBeUndefined()
  })

  it('un guasto nel leggere è un 500 breve, non un’eccezione', async () => {
    const e = await rispondiRegistroWorkspace({ metodo: 'POST', percorso: ROTTA_REGISTRO_WORKSPACE, corpo: { workspace: WS }, dispositivo: 'pc:pc-b' }, fonte({ righe: () => { throw new Error('disco rotto') } }))
    expect(e?.stato).toBe(500)
  })
})

describe('i limiti', () => {
  const tante = Array.from({ length: 200 }, (_, i) => riga(i, `[criterio] [ws: ${WS}] finito con 0 in ${i} s`))

  it('al più MAX_RIGHE_REGISTRO righe, le più recenti', () => {
    const r = righeDelWorkspace(tante, WS)
    expect(r.righe).toHaveLength(MAX_RIGHE_REGISTRO)
    expect(r.totali).toBe(200)
    expect(r.righe[r.righe.length - 1]).toContain('in 199 s')
    expect(righeDelWorkspace(tante, WS, { righe: 3 }).righe).toHaveLength(3)
  })

  it('al più i byte dati, e una riga lunghissima si accorcia', () => {
    const r = righeDelWorkspace(tante, WS, { byte: 500 })
    expect(new TextEncoder().encode(r.righe.join('\n')).length).toBeLessThanOrEqual(500)
    expect(r.righe.length).toBeGreaterThan(0)
    const lunga = righeDelWorkspace([riga(1, `[criterio] [ws: ${WS}] finito con 0 in 5 s ${'x'.repeat(5000)}`)], WS)
    expect((lunga.righe[0] as string).length).toBeLessThanOrEqual(300)
    expect(MAX_BYTE_REGISTRO).toBeGreaterThan(0)
  })

  it('anche la risposta intera sta dentro il tetto di byte', async () => {
    const e = await rispondiRegistroWorkspace({ metodo: 'POST', percorso: ROTTA_REGISTRO_WORKSPACE, corpo: { workspace: WS }, dispositivo: 'pc:pc-b' }, fonte({ righe: () => tante }))
    const v = e?.corpo as RegistroWorkspaceVisto
    expect(v.righe.length).toBeLessThanOrEqual(MAX_RIGHE_REGISTRO)
    expect(new TextEncoder().encode(v.righe.join('\n')).length).toBeLessThanOrEqual(MAX_BYTE_REGISTRO)
  })
})

describe('l’autopilota lo usa nei rapporti dei lavori', () => {
  const lavori = (scadute: number) => { const l = lavoriVuoti(); l.unioni.prove = 2; l.unioni.scadute = scadute; return l }
  const rapporto = (scadute: number) => riassumi([{ da: 'PC-ESEMPIO-A', giorno: '2026-11-23', dal: '2026-11-23T09:00:00.000Z', al: '2026-11-23T10:00:00.000Z', workspace: { [WS]: lavori(scadute), generale: lavori(5) } }])!

  it('chiede il registro solo dei workspace remoti con unioni scadute, e lo mette nel riassunto', async () => {
    const chiesti: string[] = []
    const testo = await registriDelleScadute(rapporto(1), async (pc, ws) => {
      chiesti.push(`${pc}/${ws}`)
      return { ospitato: true, workspace: ws, righe: ['riga uno'], righeTotali: 1, piano: PIANO }
    })
    expect(chiesti).toEqual([`PC-ESEMPIO-A/${WS}`])
    expect(testo).toContain(`Registro di ${WS} su PC-ESEMPIO-A`)
    expect(testo).toContain('riga uno')
  })

  it('senza unioni scadute non chiede niente, e un PC che non risponde non rompe il riassunto', async () => {
    let n = 0
    expect(await registriDelleScadute(rapporto(0), async () => { n += 1; return undefined })).toBe('')
    expect(n).toBe(0)
    expect(await registriDelleScadute(rapporto(2), async () => { throw new Error('non risponde') })).toBe('')
  })
})

describe('niente dati veri nei sorgenti nuovi', () => {
  it('nessun IP o percorso di PC nei file della rotta', () => {
    for (const f of ['src/shared/registro-workspace.ts', 'src/main/registro-workspace-pc.ts']) {
      const t = readFileSync(join(process.cwd(), f), 'utf8')
      expect(t).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/)
      expect(t).not.toMatch(/[A-Za-z]:\\\\?Users/)
    }
  })
})
