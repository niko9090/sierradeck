import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'
import { cartellaDiProva } from '@shared/chat-di-prova'
import { giudicaStrumento } from '../../src/autopilot-host/divieti'
import { leggiRichiestaPonte, azioneDelPonte } from '@shared/ponte-telefono'
import { rottaPermessaSulCanale } from '@shared/strada-pc'
import { leggiAzioneFinestra } from '@shared/azioni-telefono'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'

/**
 * Le chat di prova (0.63.0): chi collauda le chiude da solo; le chat vere no.
 * Decisione di Nicholas del 12/10: «se devi chiudere delle chat di prova devi
 * essere autonomo».
 */

const PROVA = 'C:\\Progetti\\SierraDeck-prova-collaudo'
const VERA = 'C:\\Progetti\\Trading'

function deps(chiuse: string[], righe: string[]): DipendenzeRotte {
  const base = {
    dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-prova-'))),
    chat: () => [
      { id: 'sf-prova', titolo: 'Prova chiusura', cwd: PROVA },
      { id: 'p-vera', titolo: 'Controllo resa', cwd: VERA }
    ],
    chiudiChat: (id: string) => { chiuse.push(id) },
    log: (r: string) => { righe.push(r) }
  }
  return base as unknown as DipendenzeRotte
}

describe('quale chat è di prova', () => {
  it('conta il nome della cartella in cui lavora, non quelli sopra', () => {
    expect(cartellaDiProva(PROVA)).toBe(true)
    expect(cartellaDiProva('/home/x/sierradeck-prova-due/')).toBe(true)
    expect(cartellaDiProva(VERA)).toBe(false)
    expect(cartellaDiProva('C:\\SierraDeck-prova-collaudo\\Trading')).toBe(false)
    expect(cartellaDiProva('C:\\Progetti\\SierraDeck-prova-')).toBe(false)
    expect(cartellaDiProva('C:\\Progetti\\SierraDeck')).toBe(false)
  })
})

describe('/api/prova/chiudi', () => {
  it('chiude una chat di prova e lo scrive nel registro', async () => {
    const chiuse: string[] = []
    const righe: string[] = []
    const r = await rotteClient(deps(chiuse, righe))({ metodo: 'POST', percorso: '/api/prova/chiudi', corpo: { chat: 'sf-prova' } })
    expect(r.stato).toBe(200)
    expect(chiuse).toEqual(['sf-prova'])
    expect(righe.join('\n')).toContain('[prova] chiudo la chat di prova «Prova chiusura»')
  })

  it('rifiuta una chat vera, dicendo perché, e non la chiude', async () => {
    const chiuse: string[] = []
    const r = await rotteClient(deps(chiuse, []))({ metodo: 'POST', percorso: '/api/prova/chiudi', corpo: { chat: 'p-vera' } })
    expect(r.stato).toBe(403)
    expect(String((r.corpo as { errore: string }).errore)).toContain('non è una chat di prova')
    expect(chiuse).toEqual([])
  })

  it('una chat che non c’è: 404, niente chiuso', async () => {
    const chiuse: string[] = []
    const r = await rotteClient(deps(chiuse, []))({ metodo: 'POST', percorso: '/api/prova/chiudi', corpo: { chat: 'nessuna' } })
    expect(r.stato).toBe(404)
    expect(chiuse).toEqual([])
  })

  it('passa dal ponte e fra i PC, e il ponte lo scrive', () => {
    expect(leggiRichiestaPonte({ pc: 'lap', percorso: '/api/prova/chiudi', corpo: { chat: 'sf-prova' } }).ok).toBe(true)
    expect(rottaPermessaSulCanale('/api/prova/chiudi')).toBe(true)
    expect(azioneDelPonte('/api/prova/chiudi', { chat: 'sf-prova' })).toBe('chiudo la chat di prova sf-prova')
  })
})

describe('l’hook delle chat governate', () => {
  const bash = (command: string) => giudicaStrumento({ tool_name: 'Bash', tool_input: { command }, cwd: 'C:\\lavoro' }, ['C:\\lavoro'])

  it('lascia passare la chiusura delle chat di prova', () => {
    expect(bash('curl -X POST http://127.0.0.1:47640/api/prova/chiudi -d \'{"chat":"sf-prova"}\'').ok).toBe(true)
  })

  it('continua a negare la chiusura delle chat vere', () => {
    expect(bash('curl -X POST http://127.0.0.1:47640/api/chat/chiudi -d \'{"chat":"p-vera"}\'').ok).toBe(false)
  })

  it('lascia passare le azioni sugli autopiloti di prova e nega ancora «Ferma» normale', () => {
    expect(bash('curl -X POST http://127.0.0.1:47640/api/prova/autopilota -d \'{"autopilota":"ap-prova","azione":"ferma"}\'').ok).toBe(true)
    expect(bash('curl -X POST http://127.0.0.1:47640/api/autopilota/ferma -d \'{"autopilota":"ap-vero"}\'').ok).toBe(false)
  })
})

describe('/api/prova/autopilota (0.64.0)', () => {
  const ap = (id: string, cwd: string, stato?: Autopilota['stato']): Autopilota => ({
    ...nuovoAutopilota({ id, nome: id === 'ap-prova' ? 'Autopilota di prova' : 'Notte', obiettivo: 'x', cwd, criteri: [], iniziatoIl: '2026-10-12T10:00:00.000Z' }),
    ...(stato !== undefined ? { stato } : {})
  })
  const su = (fatti: string[], righe: string[], stato?: Autopilota['stato']): DipendenzeRotte => ({
    ...(deps([], righe) as object),
    autopiloti: () => Promise.resolve([ap('ap-prova', PROVA, stato), ap('ap-vero', VERA, stato)]),
    fermaAutopilota: (id: string) => { fatti.push('ferma ' + id); return Promise.resolve() },
    riprendiAutopilota: (id: string) => { fatti.push('riprendi ' + id); return Promise.resolve() },
    archiviaAutopilota: (id: string, si: boolean) => { fatti.push(`archivia ${id} ${si}`); return Promise.resolve() }
  }) as unknown as DipendenzeRotte
  const vai = (d: DipendenzeRotte, corpo: unknown) => rotteClient(d)({ metodo: 'POST', percorso: '/api/prova/autopilota', corpo })

  it('ferma e fa riprendere un autopilota di prova, scrivendolo nel registro', async () => {
    const fatti: string[] = []
    const righe: string[] = []
    expect((await vai(su(fatti, righe), { autopilota: 'ap-prova', azione: 'ferma' })).stato).toBe(200)
    expect((await vai(su(fatti, righe), { autopilota: 'ap-prova', azione: 'riprendi' })).stato).toBe(200)
    expect(fatti).toEqual(['ferma ap-prova', 'riprendi ap-prova'])
    expect(righe.join('\n')).toContain('[prova] fermo l’autopilota di prova «Autopilota di prova»')
  })

  it('archivia solo un autopilota di prova già fermo', async () => {
    const fatti: string[] = []
    expect((await vai(su(fatti, []), { autopilota: 'ap-prova', azione: 'archivia' })).stato).toBe(409)
    expect((await vai(su(fatti, [], 'sospeso'), { autopilota: 'ap-prova', azione: 'archivia' })).stato).toBe(200)
    expect(fatti).toEqual(['archivia ap-prova true'])
  })

  it('rifiuta gli autopiloti veri e le azioni sconosciute, senza toccare niente', async () => {
    const fatti: string[] = []
    for (const azione of ['ferma', 'riprendi', 'archivia']) {
      const r = await vai(su(fatti, [], 'sospeso'), { autopilota: 'ap-vero', azione })
      expect(r.stato, azione).toBe(403)
    }
    expect((await vai(su(fatti, []), { autopilota: 'ap-prova', azione: 'elimina' })).stato).toBe(400)
    expect(fatti).toEqual([])
  })

  it('passa dal ponte e fra i PC', () => {
    expect(leggiRichiestaPonte({ pc: 'lap', percorso: '/api/prova/autopilota' }).ok).toBe(true)
    expect(rottaPermessaSulCanale('/api/prova/autopilota')).toBe(true)
    expect(azioneDelPonte('/api/prova/autopilota', { autopilota: 'ap-prova', azione: 'ferma' })).toBe('fermo l’autopilota di prova ap-prova')
  })
})

describe('«Riprendi» da lontano di una chat che vive su un altro PC (0.64.0)', () => {
  type Aperta = { cwd: string; sessione: string; titolo: string }
  const base = (aperte: Aperta[]): DipendenzeRotte => ({
    ...(deps([], []) as object),
    cartelle: () => Promise.resolve([PROVA]),
    chatAltrove: () => 'Portatile',
    riprendiSessione: () => { throw new Error('non deve riaprirla qui') },
    apriRemota: (cwd: string, sessione: string, titolo: string) => { aperte.push({ cwd, sessione, titolo }); return Promise.resolve({ ok: true }) }
  }) as unknown as DipendenzeRotte
  const corpo = (dalVivo?: boolean) => ({ cartella: PROVA, sessione: '00000000-0000-0000-0000-000000000001', titolo: 'Prova chiusura', ...(dalVivo !== undefined ? { dalVivo } : {}) })

  it('con dalVivo apre qui il riquadro dal vivo verso quel PC', async () => {
    const aperte: Aperta[] = []
    const r = await rotteClient(base(aperte))({ metodo: 'POST', percorso: '/api/sessioni/riprendi', corpo: corpo(true) })
    expect(r.stato).toBe(200)
    expect(aperte).toEqual([{ cwd: PROVA, sessione: '00000000-0000-0000-0000-000000000001', titolo: 'Prova chiusura' }])
  })

  it('con dalVivo apre anche una chat che qui non è conosciuta, se un altro PC la elenca nel battito', async () => {
    const aperte: { cwd: string; sessione: string; titolo: string; pc?: { id: string; nome: string } }[] = []
    const d = {
      ...(deps([], []) as object),
      cartelle: () => Promise.resolve([] as string[]),
      riprendiSessione: () => { throw new Error('non deve riaprirla qui') },
      pc: () => Promise.resolve([{ pcId: 'pc-2', nome: 'Portatile', versione: '0.64.1', battito: new Date().toISOString(), cartelle: [], chat: [{ sessione: 's-2', titolo: 'Prova chiusura', cwd: PROVA, aspetta: true }] }]),
      apriRemota: (cwd: string, sessione: string, titolo: string, pc?: { id: string; nome: string }) => { aperte.push({ cwd, sessione, titolo, ...(pc !== undefined ? { pc } : {}) }); return Promise.resolve({ ok: true }) }
    } as unknown as DipendenzeRotte
    const r = await rotteClient(d)({ metodo: 'POST', percorso: '/api/sessioni/riprendi', corpo: { cartella: PROVA, sessione: 's-2', dalVivo: true } })
    expect(r.stato).toBe(200)
    expect(aperte).toEqual([{ cwd: PROVA, sessione: 's-2', titolo: 'Prova chiusura', pc: { id: 'pc-2', nome: 'Portatile' } }])
    // Senza dalVivo, la stessa chat resta «cartella non conosciuta».
    expect((await rotteClient(d)({ metodo: 'POST', percorso: '/api/sessioni/riprendi', corpo: { cartella: PROVA, sessione: 's-2' } })).stato).toBe(403)
  })

  it('senza dalVivo la risposta resta quella di sempre (409, niente aperto)', async () => {
    const aperte: Aperta[] = []
    const r = await rotteClient(base(aperte))({ metodo: 'POST', percorso: '/api/sessioni/riprendi', corpo: corpo() })
    expect(r.stato).toBe(409)
    expect(aperte).toEqual([])
  })

  it('la finestra riconosce l’azione, e la scarta se manca il PC', () => {
    expect(leggiAzioneFinestra({ tipo: 'chat', azione: 'apriRemota', chat: 's-1', cwd: PROVA, titolo: 'P', pcId: 'pc-2', pcNome: 'Portatile' }))
      .toEqual({ tipo: 'chat', azione: 'apriRemota', chat: 's-1', cwd: PROVA, titolo: 'P', pcId: 'pc-2', pcNome: 'Portatile' })
    expect(leggiAzioneFinestra({ tipo: 'chat', azione: 'apriRemota', chat: 's-1', cwd: PROVA })).toBeUndefined()
  })
})

describe('/api/prova/togli-progetto (0.68.1)', () => {
  const conTogli = (tolti: string[]): DipendenzeRotte => ({
    ...(deps([], []) as unknown as Record<string, unknown>),
    provaTogliProgetto: async (nome: string) => { tolti.push(nome); return { ok: true, messaggio: 'nel recupero' } }
  }) as unknown as DipendenzeRotte
  it('toglie un progetto di prova: la cartella nel recupero', async () => {
    const tolti: string[] = []
    const r = await rotteClient(conTogli(tolti))({ metodo: 'POST', percorso: '/api/prova/togli-progetto', corpo: { nome: 'SierraDeck-prova-c2' } })
    expect(r.stato).toBe(200)
    expect(tolti).toEqual(['SierraDeck-prova-c2'])
  })
  it('un progetto vero no, con il perché', async () => {
    const tolti: string[] = []
    const r = await rotteClient(conTogli(tolti))({ metodo: 'POST', percorso: '/api/prova/togli-progetto', corpo: { nome: 'Trading' } })
    expect(r.stato).toBe(403)
    expect(tolti).toEqual([])
  })
  it('passa dal ponte, come le altre azioni di prova, e si racconta nel registro', () => {
    expect(leggiRichiestaPonte({ pc: 'pc-a', percorso: '/api/prova/togli-progetto', corpo: { nome: 'SierraDeck-prova-c2' } }).ok).toBe(true)
    expect(azioneDelPonte('/api/prova/togli-progetto', { nome: 'SierraDeck-prova-c2' })).toBe('tolgo il progetto di prova «SierraDeck-prova-c2» (cartella nel recupero)')
  })
})
