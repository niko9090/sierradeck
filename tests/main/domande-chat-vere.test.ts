import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { creaServerClient } from '../../src/main/client-server'
import { rotteClient, type DipendenzeRotte, type Chat } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'
import { creaGuardianoPin } from '../../src/main/pin-guardiano'
import { creaClientPcRemoto, ErroreRemoto } from '../../src/main/pc-remoto'
import { GIU, INVIO } from '@shared/scelte-terminale'
import type { BattitoPc } from '@shared/posta'

/**
 * «Non riesco a rispondere alle domande» (Nicholas, 08/10), sulle rotte vere,
 * con gli schermi veri di Claude Code 2.1.294 (`tests/fixtures/claude-2.1.294-domande/`,
 * catturati da un claude.exe in un pty e letti con xterm come fa il programma).
 *
 * La causa: le domande di Claude Code (AskUserQuestion) hanno una riga di
 * spiegazione sotto ogni opzione, e il riconoscitore voleva le opzioni
 * attaccate. La domanda non si vedeva come scelta: la colonna, la pagina e
 * l'app davano solo il campo di testo, e «Verde» + Invio nel selettore faceva
 * scegliere la prima opzione (provato: Claude riceveva «Rosso»).
 */
const schermo = (nome: string): string[] =>
  readFileSync(join(__dirname, '../fixtures/claude-2.1.294-domande', `${nome}.txt`), 'utf8').split('\n')

/** Le stesse righe senza colori: come `coda`, che il programma prende dallo schermo disegnato. */
const pulite = (r: string[]): string[] => r.map((x) => x.replace(new RegExp(String.fromCharCode(27) + '[[][0-9;]*m', 'g'), ''))

const K = 'chiave-di-casa-di-esempio'
const server: Server[] = []
afterEach(() => { for (const s of server.splice(0)) s.close() })

type Banco = { rotte: ReturnType<typeof rotteClient>; tasti: { chat: string; pezzi: string[] }[]; scritti: string[]; chat: Chat[] }

function banco(nome: string, extra: Partial<DipendenzeRotte> = {}): Banco {
  const chat: Chat[] = [
    { id: 'p-1', titolo: 'Prova', cwd: 'C:\\Progetti\\Esempio', sessione: 's-prova', codaGrezza: schermo(nome), coda: pulite(schermo(nome)) },
    { id: 'p-2', titolo: 'Ferma', cwd: 'C:\\Progetti\\Esempio', sessione: 's-ferma', codaGrezza: ['● Fatto.', '', '❯ '], coda: ['● Fatto.', '', '❯ '], aspetta: true }
  ]
  const tasti: { chat: string; pezzi: string[] }[] = []
  const scritti: string[] = []
  const rotte = rotteClient({
    dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-domande-'))),
    chat: () => chat,
    autopiloti: async () => [],
    domande: async () => [],
    workspace: async () => ({ nomi: [], attivo: '' }),
    scriviAChat: (id: string, t: string) => { scritti.push(`${id}:${t}`) },
    tastiAChat: (id: string, pezzi: string[]) => { tasti.push({ chat: id, pezzi }) },
    aggiornamento: () => ({ fase: 'fermo' }),
    ...extra
  } as unknown as DipendenzeRotte)
  return { rotte, tasti, scritti, chat }
}
const post = (b: Banco, percorso: string, corpo: unknown): ReturnType<Banco['rotte']> => b.rotte({ metodo: 'POST', percorso, corpo })

describe('la domanda di Claude Code si vede come domanda', () => {
  it('nelle Domande è una scelta con le opzioni, le spiegazioni e «Type something.»; nello stato «chiede»', async () => {
    const b = banco('singola')
    const d = await b.rotte({ metodo: 'GET', percorso: '/api/domande', corpo: undefined })
    const voci = (d.corpo as { voci: Record<string, unknown>[] }).voci
    const v = voci.find((x) => x.chat === 'p-1') as { tipo: string; opzioni: { testo: string; descrizione?: string; libera?: boolean }[]; righe: string[] }
    expect(v.tipo).toBe('scelta')
    expect(v.opzioni.map((o) => o.testo)).toEqual(['Rosso', 'Verde', 'Blu', 'Type something.', 'Chat about this'])
    expect(v.opzioni[0]?.descrizione).toBe("Il colore della passione e dell'energia")
    expect(v.opzioni[3]?.libera).toBe(true)
    // La domanda sopra le opzioni, intera.
    expect(v.righe.join(' ')).toContain('Quale colore preferisci?')
    const s = await b.rotte({ metodo: 'GET', percorso: '/api/stato', corpo: undefined })
    expect((s.corpo as { chat: { id: string; chiede: boolean }[] }).chat.find((c) => c.id === 'p-1')?.chiede).toBe(true)
  })
})

describe('rispondere toccando: i tasti giusti alla chat giusta', () => {
  it('un’opzione: le frecce fino a lei, poi Invio, a pezzi', async () => {
    const b = banco('singola')
    expect((await post(b, '/api/scegli', { chat: 'p-1', opzione: 'Blu' })).stato).toBe(200)
    expect(b.tasti).toEqual([{ chat: 'p-1', pezzi: [GIU + GIU, INVIO] }])
    // Appena mandata, la stessa domanda non si rimostra (lo schermo non si è ancora ridisegnato).
    const d = await b.rotte({ metodo: 'GET', percorso: '/api/domande', corpo: undefined })
    expect((d.corpo as { voci: { chat?: string; tipo: string }[] }).voci.find((x) => x.chat === 'p-1')?.tipo).not.toBe('scelta')
    expect((await post(b, '/api/scegli', { chat: 'p-1', opzione: 'Blu' })).stato).toBe(409)
  })
  it('«Type something.» senza testo non manda niente e dice cosa fare; con il testo è la risposta libera', async () => {
    const b = banco('libera')
    const no = await post(b, '/api/scegli', { chat: 'p-1', opzione: 'Type something.' })
    expect(no.stato).toBe(409)
    expect(JSON.stringify(no.corpo)).toContain('scrivi la risposta')
    expect(b.tasti).toEqual([])
    expect((await post(b, '/api/scegli', { chat: 'p-1', opzione: 'Type something.', testo: 'Pappagallo' })).stato).toBe(200)
    expect(b.tasti).toEqual([{ chat: 'p-1', pezzi: [GIU + GIU, 'Pappagallo', INVIO] }])
  })
  it('scelta multipla: un tocco spunta (Invio), «Submit» manda; dopo una spunta la domanda è nuova', async () => {
    const b = banco('multi')
    await post(b, '/api/scegli', { chat: 'p-1', opzione: 'Lunedì' })
    expect(b.tasti[0]?.pezzi).toEqual([INVIO])
    // Lo schermo dopo la spunta: stessa domanda, Lunedì spuntato. Non è «già mandata».
    ;(b.chat[0] as Chat).codaGrezza = schermo('multi-spuntata')
    expect((await post(b, '/api/scegli', { chat: 'p-1', opzione: 'Submit' })).stato).toBe(200)
    expect(b.tasti[1]?.pezzi).toEqual([GIU + GIU + GIU + GIU, INVIO])
  })
  it('due domande insieme: si risponde a una per volta, poi al riepilogo «Submit answers»', async () => {
    const b = banco('due-1')
    await post(b, '/api/scegli', { chat: 'p-1', opzione: 'Rosso' })
    ;(b.chat[0] as Chat).codaGrezza = schermo('due-2')
    expect((await post(b, '/api/scegli', { chat: 'p-1', opzione: 'Due' })).stato).toBe(200)
    ;(b.chat[0] as Chat).codaGrezza = schermo('due-riepilogo')
    expect((await post(b, '/api/scegli', { chat: 'p-1', opzione: 'Submit answers' })).stato).toBe(200)
    expect(b.tasti.map((t) => t.pezzi)).toEqual([[INVIO], [GIU, INVIO], [INVIO]])
  })
})

describe('rispondere scrivendo (il difetto vero): il testo non finisce più nel selettore', () => {
  it('«Verde» sceglie Verde, «3» sceglie Blu: niente testo nel selettore', async () => {
    const b = banco('singola')
    const r = await post(b, '/api/scrivi', { chat: 'p-1', testo: 'Verde' })
    expect(r.corpo).toMatchObject({ fatto: true, comeScelta: 'Verde' })
    expect(b.tasti).toEqual([{ chat: 'p-1', pezzi: [GIU, INVIO] }])
    expect(b.scritti).toEqual([])
    const c = banco('singola')
    await post(c, '/api/scrivi', { chat: 'p-1', testo: '3' })
    expect(c.tasti[0]?.pezzi).toEqual([GIU + GIU, INVIO])
  })
  it('una risposta che non è un’opzione va in «Type something.»', async () => {
    const b = banco('libera')
    expect((await post(b, '/api/scrivi', { chat: 'p-1', testo: 'Pappagallo' })).corpo).toMatchObject({ comeScelta: 'risposta libera' })
    expect(b.tasti).toEqual([{ chat: 'p-1', pezzi: [GIU + GIU, 'Pappagallo', INVIO] }])
  })
  it('un permesso: «sì» è Yes, «no» è No; una parola qualunque non scrive niente e dice le opzioni', async () => {
    const b = banco('permesso')
    await post(b, '/api/scrivi', { chat: 'p-1', testo: 'sì' })
    expect(b.tasti[0]?.pezzi).toEqual([INVIO])
    const c = banco('permesso')
    await post(c, '/api/scrivi', { chat: 'p-1', testo: 'no' })
    expect(c.tasti[0]?.pezzi).toEqual([GIU, INVIO])
    const d = banco('permesso')
    const r = await post(d, '/api/scrivi', { chat: 'p-1', testo: 'forse più tardi' })
    expect(r.stato).toBe(409)
    expect((r.corpo as { errore: string }).errore).toContain('1. Yes, 2. No')
    expect(d.tasti).toEqual([])
    expect(d.scritti).toEqual([])
  })
  it('una chat senza domanda riceve il testo come sempre', async () => {
    const b = banco('singola')
    expect((await post(b, '/api/scrivi', { chat: 'p-2', testo: 'continua pure' })).corpo).toEqual({ fatto: true })
    expect(b.scritti).toEqual(['p-2:continua pure'])
    expect(b.tasti).toEqual([])
  })
  it('lo schermo di adesso vince sulla foto: la domanda appena risposta non riceve il testo come scelta', async () => {
    const b = banco('singola', { schermoDi: async () => ['● Fatto.', '', '❯ '] })
    await post(b, '/api/scrivi', { chat: 'p-1', testo: 'Verde' })
    expect(b.tasti).toEqual([])
    expect(b.scritti).toEqual(['p-1:Verde'])
  })
})

describe('da un altro PC (ponte con la chiave di casa) e con il PIN', () => {
  async function portatile(protetta: boolean): Promise<{ porta: number; b: Banco }> {
    const g = creaGuardianoPin({ leggi: () => undefined, scrivi: () => {}, passphraseGiusta: async () => false })
    await g.impostaPin('4821')
    if (protetta) g.proteggiChat('s-prova', true)
    const b = banco('singola', { pin: g } as Partial<DipendenzeRotte>)
    const dispositivi = apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-domande-pin-')))
    const s = creaServerClient({ dispositivi, chiaveDiCasa: () => K, rotta: (r) => b.rotte(r) })
    server.push(s)
    await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()))
    return { porta: (s.address() as AddressInfo).port, b }
  }
  const altroPc = (porta: number): ReturnType<typeof creaClientPcRemoto> => {
    const bt: BattitoPc = { pcId: 'lap', nome: 'PC-ESEMPIO', versione: '0.52.5', battito: new Date().toISOString(), cartelle: [], chat: [], indirizzi: ['127.0.0.1'], porta }
    return creaClientPcRemoto({ battiti: () => [bt], chiavePer: () => K, mioNome: () => 'PC-FISSO', mioId: () => 'pc-fisso-id' })
  }
  it('il riquadro remoto vede la scelta e la tocca: i tasti arrivano alla chat di quel PC', async () => {
    const { porta, b } = await portatile(false)
    const pc = altroPc(porta)
    const storia = await pc.chiama('lap', '/api/storia', { chat: 'p-1', da: -1, quante: 50 }) as { scelte?: { opzioni: { testo: string }[] } }
    expect(storia.scelte?.opzioni.map((o) => o.testo)).toContain('Verde')
    expect(await pc.chiama('lap', '/api/scegli', { chat: 'p-1', opzione: 'Verde' })).toEqual({ fatto: true })
    expect(b.tasti).toEqual([{ chat: 'p-1', pezzi: [GIU, INVIO] }])
  })
  it('le Domande di un PC scrivono alla chat di un altro: là il testo diventa la scelta', async () => {
    const { porta, b } = await portatile(false)
    expect(await altroPc(porta).chiama('lap', '/api/scrivi', { chat: 'p-1', testo: 'blu' })).toMatchObject({ fatto: true, comeScelta: 'Blu' })
    expect(b.tasti[0]?.pezzi).toEqual([GIU + GIU, INVIO])
  })
  it('chat protetta: 423 e niente tasti; con il PIN giusto la risposta passa', async () => {
    const { porta, b } = await portatile(true)
    const pc = altroPc(porta)
    const e = await pc.chiama('lap', '/api/scegli', { chat: 'p-1', opzione: 'Verde' }).catch((x: unknown) => x as ErroreRemoto)
    expect((e as ErroreRemoto).motivo).toBe('pin')
    expect(((await pc.chiama('lap', '/api/scrivi', { chat: 'p-1', testo: 'Verde' }).catch((x: unknown) => x)) as ErroreRemoto).motivo).toBe('pin')
    expect(b.tasti).toEqual([])
    expect(await pc.chiama('lap', '/api/pin/sblocca', { chat: 'p-1', pin: '4821' })).toEqual({ fatto: true })
    expect(await pc.chiama('lap', '/api/scegli', { chat: 'p-1', opzione: 'Verde' })).toEqual({ fatto: true })
    expect(b.tasti).toEqual([{ chat: 'p-1', pezzi: [GIU, INVIO] }])
  })
})
