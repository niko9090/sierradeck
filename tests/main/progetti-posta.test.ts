import { describe, it, expect } from 'vitest'
import {
  creaPostino, nomeBattitoPc, nomePosta, pcVivo, scegliDestinataria, chatNellaCartella, prossimaDaConsegnare,
  PC_SPENTO_DOPO_MS, BATTITO_PC_OGNI_MS, RIAPRI_DOPO_MS, VOCI_MAX,
  type BattitoPc, type ChatDiPc, type Posta
} from '../../src/main/progetti/posta'
import type { Scatola } from '../../src/main/progetti/presenza'

/**
 * Nicholas (2026-09-14): «se sto operando su una chat su una cartella in rete
 * gli altri come fanno a operare li'? … un'azione che rimane eseguibile solo
 * in remoto su quel PC quando e' online». La cassetta di un PC sul Drive, e
 * il postino che consegna quando il PC c'e'.
 */
function scatolaInMemoria(): Scatola & { dati: Map<string, unknown> } {
  const dati = new Map<string, unknown>()
  return {
    dati,
    leggi: <T,>(nome: string) => Promise.resolve(dati.get(nome) as T | undefined),
    scrivi: (nome, oggetto) => { dati.set(nome, JSON.parse(JSON.stringify(oggetto))); return Promise.resolve() },
    cancella: (nome) => { dati.delete(nome); return Promise.resolve() },
    elenca: (prefisso) => Promise.resolve([...dati.keys()].filter((k) => k.startsWith(prefisso)))
  }
}

function ambiente(opts: { pcId: string; nome: string; scatola: Scatola; cartelle?: string[] }) {
  let orologio = Date.parse('2026-09-14T08:00:00.000Z')
  let chat: ChatDiPc[] = []
  const scritti: { id: string; testo: string }[] = []
  const aperte: string[] = []
  const riprese: { cwd: string; sessione: string }[] = []
  const esistenti = new Set<string>(opts.cartelle ?? [])
  const registro: string[] = []
  const postino = creaPostino({
    scatola: () => opts.scatola,
    pcId: () => opts.pcId,
    pcNome: () => opts.nome,
    versione: () => '0.27.0',
    chat: () => chat,
    cartelle: () => [...esistenti],
    cartellaEsiste: (c) => esistenti.has(c),
    apriChat: (c) => { aperte.push(c) },
    riprendiChat: (cwd, sessione) => { riprese.push({ cwd, sessione }) },
    scrivi: (id, testo) => { scritti.push({ id, testo }) },
    adesso: () => orologio,
    nuovoId: () => `v${scritti.length + aperte.length + registro.length + 1}-${Math.random().toString(36).slice(2, 6)}`,
    log: (m) => { registro.push(m) }
  })
  return {
    postino, scritti, aperte, riprese, registro,
    chat: (c: ChatDiPc[]) => { chat = c },
    esiste: (c: string) => { esistenti.add(c) },
    avanza: (ms: number) => { orologio += ms },
    adesso: () => orologio
  }
}

const NAS = 'Z:\\progetti\\gestionale'

describe('scegliere la chat a cui va un comando', () => {
  const chat: ChatDiPc[] = [
    { id: 'p1', sessione: 's1', titolo: 'lavora', cwd: NAS, viva: true, aspetta: false },
    { id: 'p2', sessione: 's2', titolo: 'aspetta', cwd: `${NAS}\\src`, viva: true, aspetta: true },
    { id: 'p3', sessione: 's3', titolo: 'dorme', cwd: NAS, viva: false, aspetta: false },
    { id: 'p4', sessione: 's4', titolo: 'altrove', cwd: 'C:\\altro', viva: true, aspetta: true }
  ]
  it('la prima viva che aspetta dentro la cartella, o quella precisa', () => {
    expect(scegliDestinataria(chat, { cwd: NAS })?.id).toBe('p2')
    expect(scegliDestinataria(chat, { cwd: NAS, sessione: 's1' })).toBeUndefined()
    expect(scegliDestinataria(chat, { cwd: NAS, sessione: 's2' })?.id).toBe('p2')
    expect(scegliDestinataria(chat, { cwd: 'D:\\nessuna' })).toBeUndefined()
    expect(chatNellaCartella(chat, { cwd: NAS }).map((c) => c.id)).toEqual(['p1', 'p2', 'p3'])
    expect(chatNellaCartella(chat, { cwd: NAS, sessione: 's3' }).map((c) => c.id)).toEqual(['p3'])
  })

  it('un PC e vivo se ha battuto da poco', () => {
    const b: BattitoPc = { pcId: 'A', nome: 'Torre', versione: '0.27.0', battito: '2026-09-14T08:00:00.000Z', cartelle: [], chat: [] }
    const t = Date.parse(b.battito)
    expect(pcVivo(b, t + 60_000)).toBe(true)
    expect(pcVivo(b, t + PC_SPENTO_DOPO_MS + 1)).toBe(false)
    expect(pcVivo(undefined, t)).toBe(false)
    expect(prossimaDaConsegnare({ voci: [] })).toBeUndefined()
  })
})

describe('il postino', () => {
  it('IL PUNTO: dal portatile si scrive nella cassetta della torre, la torre consegna nella sua chat che aspetta', async () => {
    const scatola = scatolaInMemoria()
    const torre = ambiente({ pcId: 'A', nome: 'Torre', scatola, cartelle: [NAS] })
    const portatile = ambiente({ pcId: 'B', nome: 'Portatile', scatola })
    torre.chat([{ id: 'p1', sessione: 's1', titolo: 'gestionale', cwd: NAS, viva: true, aspetta: true }])
    await torre.postino.giro()
    // Il portatile vede la torre, con la sua cartella e la sua chat.
    const altri = await portatile.postino.pc()
    expect(altri.map((b) => b.pcId)).toEqual(['A'])
    expect(altri[0]?.cartelle).toContain(NAS)
    expect(altri[0]?.chat.map((c) => c.titolo)).toEqual(['gestionale'])
    expect(pcVivo(altri[0], portatile.adesso())).toBe(true)
    // E le scrive un comando, nella cassetta della torre.
    const p = await portatile.postino.aggiungi('A', { cwd: NAS, testo: 'aggiorna il changelog' })
    expect(p?.voci).toHaveLength(1)
    expect(p?.voci[0]).toMatchObject({ stato: 'attesa', daNome: 'Portatile', cwd: NAS })
    expect(scatola.dati.has(nomePosta('A'))).toBe(true)
    // La torre, al suo giro, consegna alla chat che aspetta.
    await torre.postino.giro()
    expect(torre.scritti).toEqual([{ id: 'p1', testo: 'aggiorna il changelog' }])
    const dopo = (await portatile.postino.posta('A')) as Posta
    expect(dopo.voci[0]).toMatchObject({ stato: 'consegnata', aSessione: 's1', esito: 'consegnato a «gestionale»' })
    // Il portatile stesso non compare fra «gli altri PC».
    expect((await torre.postino.pc()).map((b) => b.pcId)).toEqual([])
  })

  it('senza una chat nella cartella ne apre una, una volta, e consegna quando aspetta', async () => {
    const scatola = scatolaInMemoria()
    const torre = ambiente({ pcId: 'A', nome: 'Torre', scatola, cartelle: [NAS] })
    const portatile = ambiente({ pcId: 'B', nome: 'Portatile', scatola })
    await portatile.postino.aggiungi('A', { cwd: NAS, testo: 'fai i test' })
    await torre.postino.giro()
    expect(torre.aperte).toEqual([NAS])
    expect(torre.scritti).toEqual([])
    // Il giro dopo la chat e' nata ma lavora ancora (legge il progetto): si aspetta, non se ne apre un'altra.
    torre.chat([{ id: 'p9', sessione: 's9', titolo: 'gestionale', cwd: NAS, viva: true, aspetta: false }])
    torre.avanza(30_000)
    await torre.postino.giro()
    expect(torre.aperte).toEqual([NAS])
    // Poi aspetta: consegnato.
    torre.chat([{ id: 'p9', sessione: 's9', titolo: 'gestionale', cwd: NAS, viva: true, aspetta: true }])
    torre.avanza(30_000)
    await torre.postino.giro()
    expect(torre.scritti).toEqual([{ id: 'p9', testo: 'fai i test' }])
    expect(((await torre.postino.posta('A')) as Posta).voci[0]?.stato).toBe('consegnata')
  })

  it('se la chat aperta non compare mai, riprova ad aprirla solo dopo un po', async () => {
    const scatola = scatolaInMemoria()
    const torre = ambiente({ pcId: 'A', nome: 'Torre', scatola, cartelle: [NAS] })
    await torre.postino.aggiungi('A', { cwd: NAS, testo: 'x' })
    await torre.postino.giro()
    torre.avanza(60_000)
    await torre.postino.giro()
    expect(torre.aperte).toHaveLength(1)
    torre.avanza(RIAPRI_DOPO_MS)
    await torre.postino.giro()
    expect(torre.aperte).toHaveLength(2)
  })

  it('una chat precisa si riprende con la sua conversazione', async () => {
    const scatola = scatolaInMemoria()
    const torre = ambiente({ pcId: 'A', nome: 'Torre', scatola, cartelle: [NAS] })
    await torre.postino.aggiungi('A', { cwd: NAS, testo: 'continua', sessione: 's7' })
    await torre.postino.giro()
    expect(torre.riprese).toEqual([{ cwd: NAS, sessione: 's7' }])
    torre.chat([{ id: 'p7', sessione: 's7', titolo: 'quella', cwd: NAS, viva: true, aspetta: true }])
    torre.avanza(30_000)
    await torre.postino.giro()
    expect(torre.scritti).toEqual([{ id: 'p7', testo: 'continua' }])
  })

  it('una cartella che su quel PC non esiste: la voce fallisce e dice perche', async () => {
    const scatola = scatolaInMemoria()
    const torre = ambiente({ pcId: 'A', nome: 'Torre', scatola })
    await torre.postino.aggiungi('A', { cwd: 'Q:\\non-c-e', testo: 'x' })
    await torre.postino.giro()
    const p = (await torre.postino.posta('A')) as Posta
    expect(p.voci[0]?.stato).toBe('fallita')
    expect(p.voci[0]?.esito).toContain('non esiste su questo PC')
    expect(torre.aperte).toEqual([])
  })

  it('una per giro, in ordine; togli e pulisci', async () => {
    const scatola = scatolaInMemoria()
    const torre = ambiente({ pcId: 'A', nome: 'Torre', scatola, cartelle: [NAS] })
    torre.chat([{ id: 'p1', sessione: 's1', titolo: 'g', cwd: NAS, viva: true, aspetta: true }])
    await torre.postino.aggiungi('A', { cwd: NAS, testo: 'uno' })
    await torre.postino.aggiungi('A', { cwd: NAS, testo: 'due' })
    const conTre = await torre.postino.aggiungi('A', { cwd: NAS, testo: 'tre' })
    const idTre = conTre?.voci[2]?.id as string
    await torre.postino.giro()
    expect(torre.scritti.map((s) => s.testo)).toEqual(['uno'])
    await torre.postino.togli('A', idTre)
    await torre.postino.giro()
    expect(torre.scritti.map((s) => s.testo)).toEqual(['uno', 'due'])
    const pulita = await torre.postino.pulisci('A')
    expect(pulita?.voci).toEqual([])
    // Una cassetta vuota sparisce dal Drive.
    expect(scatola.dati.has(nomePosta('A'))).toBe(false)
  })

  it('il battito si riscrive solo se cambia qualcosa, o ogni due minuti', async () => {
    const scatola = scatolaInMemoria()
    let scritture = 0
    const originale = scatola.scrivi
    scatola.scrivi = (nome, oggetto) => { if (nome.startsWith('pc-')) scritture += 1; return originale(nome, oggetto) }
    const torre = ambiente({ pcId: 'A', nome: 'Torre', scatola, cartelle: [NAS] })
    await torre.postino.giro()
    torre.avanza(30_000)
    await torre.postino.giro()
    expect(scritture).toBe(1)
    torre.chat([{ id: 'p1', sessione: 's1', titolo: 'g', cwd: NAS, viva: true, aspetta: true }])
    await torre.postino.giro()
    expect(scritture).toBe(2)
    torre.avanza(BATTITO_PC_OGNI_MS)
    await torre.postino.giro()
    expect(scritture).toBe(3)
    expect((scatola.dati.get(nomeBattitoPc('A')) as BattitoPc).chat[0]?.aspetta).toBe(true)
  })

  it('senza Drive non fa niente e non solleva', async () => {
    const torre = ambiente({ pcId: 'A', nome: 'Torre', scatola: { leggi: () => Promise.resolve(undefined), scrivi: () => Promise.resolve(), cancella: () => Promise.resolve() } })
    await torre.postino.giro()
    expect(await torre.postino.pc()).toEqual([])
    const senza = creaPostino({
      scatola: () => undefined, pcId: () => 'A', pcNome: () => 'A', versione: () => '1', chat: () => [], cartelle: () => [],
      cartellaEsiste: () => true, apriChat: () => undefined, riprendiChat: () => undefined, scrivi: () => undefined
    })
    await senza.giro()
    expect(await senza.posta('A')).toBeUndefined()
    expect(await senza.aggiungi('A', { cwd: 'x', testo: 'y' })).toBeUndefined()
  })

  it('un giro che fallisce lo dice una volta, e la cassetta tiene al massimo cinquanta voci', async () => {
    const scatola = scatolaInMemoria()
    const torre = ambiente({ pcId: 'A', nome: 'Torre', scatola, cartelle: [NAS] })
    for (let i = 0; i < VOCI_MAX + 5; i += 1) await torre.postino.aggiungi('A', { cwd: NAS, testo: `v${i}` })
    expect(((await torre.postino.posta('A')) as Posta).voci).toHaveLength(VOCI_MAX)
    scatola.leggi = () => Promise.reject(new Error('Drive giu'))
    await torre.postino.giro()
    await torre.postino.giro()
    expect(torre.registro.filter((r) => r.includes('giro fallito'))).toHaveLength(1)
  })
})
