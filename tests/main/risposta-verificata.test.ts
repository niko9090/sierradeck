import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rotteClient, type DipendenzeRotte, type Chat } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'
import { andataAvanti, fraseEsito, leggiEsitoAltroPc, premiEVerifica, TENTATIVI_MAX } from '../../src/main/risposta-verificata'
import { GIU, INVIO, scelteDiTerminale, tastiPerRisposta, type Scelta } from '@shared/scelte-terminale'

/**
 * Risposte date dal riquadro delle domande (0.84.1, Nicholas 21/10): contano
 * solo se il PC della chat le ha premute davvero e la chat è andata avanti.
 * Se no, un nuovo tentativo da solo; l'esito torna a chi ha risposto e ogni
 * pressione va nel registro. Schermi veri di Claude Code 2.1.294.
 */
const schermo = (nome: string): string[] =>
  readFileSync(join(__dirname, '../fixtures/claude-2.1.294-domande', `${nome}.txt`), 'utf8').split('\n')
const scelta = (nome: string): Scelta => scelteDiTerminale(schermo(nome).join('\n')) as Scelta
const subito = (): Promise<void> => Promise.resolve()
const FATTO = ['● Fatto.', '', '❯ ']

describe('premiEVerifica', () => {
  it('presa al primo colpo: un solo invio, una riga «presa» nel registro', async () => {
    const s = scelta('singola')
    const mandati: string[][] = []
    const log: string[] = []
    const e = await premiEVerifica(s, {
      leggi: async () => (mandati.length > 0 ? undefined : s),
      tasti: (x) => tastiPerRisposta(x, { tipo: 'opzione', testo: 'Blu' }),
      manda: (p) => mandati.push(p), pausa: subito, log: (r) => log.push(r), cosa: '«Blu»'
    })
    expect(e).toEqual({ esito: 'presa', tentativi: 1 })
    expect(mandati).toEqual([[GIU + GIU, INVIO]])
    expect(log.filter((r) => r.includes('premo'))).toHaveLength(1)
    expect(log.at(-1)).toContain('presa al tentativo 1')
  })

  it('la domanda resta: riprova una volta, con i tasti ricalcolati sullo schermo di adesso', async () => {
    const s = scelta('singola')
    // Le frecce del primo tentativo sono arrivate, l'Invio no: il cursore ora è su «Blu».
    const suBlu: Scelta = { ...s, corrente: 2 }
    const mandati: string[][] = []
    const log: string[] = []
    const e = await premiEVerifica(s, {
      leggi: async () => (mandati.length === 1 ? suBlu : mandati.length === 2 ? undefined : s),
      tasti: (x) => tastiPerRisposta(x, { tipo: 'opzione', testo: 'Blu' }),
      manda: (p) => mandati.push(p), pausa: subito, log: (r) => log.push(r), cosa: '«Blu»'
    })
    expect(e).toEqual({ esito: 'presa', tentativi: 2 })
    expect(mandati).toEqual([[GIU + GIU, INVIO], [INVIO]])
    expect(log.some((r) => r.includes('riprovo'))).toBe(true)
  })

  it('mai più di due pressioni: dopo, «non presa» e la riga nel registro', async () => {
    const s = scelta('permesso')
    const mandati: string[][] = []
    const log: string[] = []
    const e = await premiEVerifica(s, {
      leggi: async () => s,
      tasti: (x) => tastiPerRisposta(x, { tipo: 'opzione', testo: s.opzioni[0]?.testo ?? '' }),
      manda: (p) => mandati.push(p), pausa: subito, log: (r) => log.push(r), cosa: '«Yes»'
    })
    expect(e).toEqual({ esito: 'non-presa', tentativi: TENTATIVI_MAX })
    expect(mandati).toHaveLength(2)
    expect(log.at(-1)).toContain('NON presa dopo 2 tentativi')
  })

  it('un permesso uguale che ricompare dopo il comando non fa premere di nuovo', async () => {
    const s = scelta('permesso')
    // Prima lettura: il riquadro è sparito (il comando gira); poi ne ricompare uno uguale.
    let letture = 0
    const mandati: string[][] = []
    const e = await premiEVerifica(s, {
      leggi: async () => (letture++ === 0 ? undefined : s),
      tasti: (x) => tastiPerRisposta(x, { tipo: 'opzione', testo: s.opzioni[0]?.testo ?? '' }),
      manda: (p) => mandati.push(p), pausa: subito, log: () => {}, cosa: '«Yes»'
    })
    expect(e.esito).toBe('presa')
    expect(mandati).toHaveLength(1)
  })

  it('una spunta nella scelta multipla è andare avanti', () => {
    expect(andataAvanti(scelta('multi'), scelta('multi-spuntata'))).toBe(true)
    expect(andataAvanti(scelta('multi'), scelta('multi'))).toBe(false)
  })

  it('le frasi: presa, al secondo tentativo, non presa', () => {
    expect(fraseEsito({ esito: 'presa', tentativi: 1 }, 'Blu')).toBe('Presa: «Blu», la chat è andata avanti.')
    expect(fraseEsito({ esito: 'presa', tentativi: 2 }, 'Blu')).toContain('secondo tentativo')
    expect(fraseEsito({ esito: 'non-presa', tentativi: 2 }, 'Blu')).toContain('ancora lì')
  })

  it('l’esito di un altro PC si legge senza fidarsi della forma', () => {
    expect(leggiEsitoAltroPc({ fatto: true, esito: 'presa', tentativi: 2, frase: 'Presa' })).toEqual({ ok: true, esito: 'presa', tentativi: 2, frase: 'Presa' })
    expect(leggiEsitoAltroPc({ fatto: true })).toEqual({ ok: true })
    expect(leggiEsitoAltroPc(null)).toEqual({ ok: true })
  })
})

type Banco = { rotte: ReturnType<typeof rotteClient>; tasti: string[][]; log: string[]; chat: Chat[] }

/** Le rotte vere; lo schermo di adesso cambia quando arrivano i tasti, se `prende` lo dice. */
function banco(nome: string, prende: (invii: number) => boolean, extra: Partial<DipendenzeRotte> = {}): Banco {
  const chat: Chat[] = [{ id: 'p-1', titolo: 'Prova', cwd: 'C:\\Progetti\\Esempio', sessione: 's-prova', codaGrezza: schermo(nome), coda: schermo(nome) }]
  const tasti: string[][] = []
  const log: string[] = []
  const rotte = rotteClient({
    dispositivi: apriDispositivi(mkdtempSync(join(tmpdir(), 'sd-verifica-'))),
    chat: () => chat,
    autopiloti: async () => [],
    domande: async () => [],
    workspace: async () => ({ nomi: [], attivo: '' }),
    scriviAChat: () => {},
    tastiAChat: (_id: string, pezzi: string[]) => { tasti.push(pezzi) },
    schermoDi: async () => (prende(tasti.length) ? FATTO : schermo(nome)),
    verificaRisposte: { pausa: subito },
    log: (r: string) => { log.push(r) },
    aggiornamento: () => ({ fase: 'fermo' }),
    ...extra
  } as unknown as DipendenzeRotte)
  return { rotte, tasti, log, chat }
}
const post = (b: Banco, percorso: string, corpo: unknown, dispositivo?: string): ReturnType<Banco['rotte']> =>
  b.rotte({ metodo: 'POST', percorso, corpo, ...(dispositivo !== undefined ? { dispositivo } : {}) })

describe('le rotte: una risposta conta solo se presa', () => {
  it('/api/scegli presa: 200 con l’esito e la frase; nel registro chi l’ha chiesta', async () => {
    const b = banco('singola', (n) => n >= 1)
    const r = await post(b, '/api/scegli', { chat: 'p-1', opzione: 'Blu' }, 'telefono-1')
    expect(r.stato).toBe(200)
    expect(r.corpo).toMatchObject({ fatto: true, esito: 'presa', tentativi: 1, frase: 'Presa: «Blu», la chat è andata avanti.' })
    expect(b.tasti).toEqual([[GIU + GIU, INVIO]])
    expect(b.log.some((x) => x.includes('[risposta] «Blu» nella chat «Prova» (p-1), chiesto da tel:telefono-1: tentativo 1'))).toBe(true)
  })

  it('/api/scegli presa al secondo tentativo', async () => {
    const b = banco('singola', (n) => n >= 2)
    const r = await post(b, '/api/scegli', { chat: 'p-1', opzione: 'Verde' })
    expect(r.corpo).toMatchObject({ esito: 'presa', tentativi: 2 })
    expect(b.tasti).toHaveLength(2)
  })

  it('/api/scegli non presa: 409, la domanda torna visibile e si può ritoccare', async () => {
    const b = banco('singola', () => false)
    const r = await post(b, '/api/scegli', { chat: 'p-1', opzione: 'Blu' })
    expect(r.stato).toBe(409)
    expect(r.corpo).toMatchObject({ esito: 'non-presa', tentativi: 2 })
    expect((r.corpo as { errore: string }).errore).toContain('ancora lì')
    expect(b.tasti).toHaveLength(2)
    expect(b.log.filter((x) => x.startsWith('[risposta]'))).toHaveLength(4)
    // Non è «già mandata»: la domanda si rimostra nelle Domande.
    const d = await b.rotte({ metodo: 'GET', percorso: '/api/domande', corpo: undefined })
    expect((d.corpo as { voci: { chat?: string; tipo: string }[] }).voci.find((x) => x.chat === 'p-1')?.tipo).toBe('scelta')
  })

  it('/api/scrivi su una chat ferma su una scelta: stessa verifica', async () => {
    const b = banco('singola', (n) => n >= 1)
    const r = await post(b, '/api/scrivi', { chat: 'p-1', testo: 'Verde' })
    expect(r.corpo).toMatchObject({ fatto: true, comeScelta: 'Verde', esito: 'presa', tentativi: 1 })
    const c = banco('singola', () => false)
    expect((await post(c, '/api/scrivi', { chat: 'p-1', testo: 'Verde' })).stato).toBe(409)
  })

  it('un secondo tocco mentre il PC sta verificando non preme di nuovo', async () => {
    const b = banco('singola', (n) => n >= 1)
    const [x, y] = await Promise.all([
      post(b, '/api/scegli', { chat: 'p-1', opzione: 'Blu' }),
      post(b, '/api/scegli', { chat: 'p-1', opzione: 'Blu' })
    ])
    expect([x.stato, y.stato].sort()).toEqual([200, 409])
    expect(b.tasti).toHaveLength(1)
  })

  it('la chat di un altro PC: l’esito arriva da là; un PC vecchio dice «senza verifica»', async () => {
    const nuovo = banco('singola', () => true, { scegliAltroPc: async () => ({ ok: true, esito: 'presa', tentativi: 2, frase: 'Presa al secondo tentativo: «Blu», la chat è andata avanti.' }) })
    const r = await post(nuovo, '/api/scegli', { chat: 'pc:pc-2:s-la', opzione: 'Blu' })
    expect(r.corpo).toMatchObject({ fatto: true, esito: 'presa', tentativi: 2 })
    expect(nuovo.log.some((x) => x.includes('alla chat su pc-2: presa là al tentativo 2'))).toBe(true)
    const vecchio = banco('singola', () => true, { scegliAltroPc: async () => ({ ok: true }) })
    expect((await post(vecchio, '/api/scegli', { chat: 'pc:pc-2:s-la', opzione: 'Blu' })).corpo).toMatchObject({ esito: 'senza-verifica' })
    // Non presa là: 409 con la frase di quel PC.
    const no = banco('singola', () => true, { scegliAltroPc: async () => ({ ok: false, messaggio: 'Non presa: …', stato: 409 }) })
    expect((await post(no, '/api/scegli', { chat: 'pc:pc-2:s-la', opzione: 'Blu' })).stato).toBe(409)
    const noScrivi = banco('singola', () => true, { scriviAltroPc: async () => ({ ok: false, messaggio: 'Non presa: …', stato: 409 }) })
    expect((await post(noScrivi, '/api/scrivi', { chat: 'pc:pc-2:s-la', testo: 'Blu' })).stato).toBe(409)
  })
})
