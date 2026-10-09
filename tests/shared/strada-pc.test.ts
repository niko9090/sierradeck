import { describe, it, expect } from 'vitest'
import {
  ORDINE_STRADE, RIPROVA_RTC_DOPO_MS, SCHERMO_CHAT_MAX, SCHERMO_RIGHE, etichettaStrada, indirizzoPreferito, leggiMessaggioCanale,
  leggiSchermo, nomeOffertaRtc, nomeRispostaRtc, nonViaDrive, prossimaMossa, richiestaSchermoViva, rottaPermessaSulCanale,
  schermoDaScrivere, segnaleValido, statoDaSchermo, storiaDaSchermo, stradaBreve, stradaDiIndirizzo
} from '@shared/strada-pc'

/**
 * 0.40.0: le chat degli altri PC raggiungibili anche su reti diverse e senza
 * Tailscale. Ordine deciso da Nicholas il 02/10: rete di casa, Tailscale,
 * WebRTC, cassetta via Drive (lenta e dichiarata).
 */
const ADESSO = Date.parse('2026-10-02T12:00:00Z')

describe('l’ordine delle strade', () => {
  it('è quello deciso: rete di casa, Tailscale, WebRTC, Drive', () => {
    expect(ORDINE_STRADE).toEqual(['lan', 'tailscale', 'webrtc', 'drive'])
  })
  it('fra gli indirizzi che rispondono, prima la rete di casa e poi Tailscale', () => {
    // I dati veri del portatile: risponde su tutti e due; Tailscale arriva prima.
    expect(indirizzoPreferito(['100.117.177.78', '192.168.1.177'])).toBe('192.168.1.177')
    expect(indirizzoPreferito(['100.117.177.78'])).toBe('100.117.177.78')
    expect(indirizzoPreferito([])).toBeUndefined()
    expect(stradaDiIndirizzo('100.117.177.78')).toBe('tailscale')
    expect(stradaDiIndirizzo('192.168.1.177')).toBe('lan')
  })
})

describe('cosa fare a una chiamata', () => {
  const base = { rtcPossibile: true, rtc: 'spento' as const, drivePossibile: true, adesso: ADESSO }
  it('una strada diretta risponde: si usa quella, senza WebRTC', () => {
    expect(prossimaMossa({ ...base, diretta: true })).toEqual({ mossa: 'http', avviaRtc: false })
  })
  it('niente strada diretta: si apre il WebRTC, e intanto si dice «mi collego»', () => {
    expect(prossimaMossa({ ...base, diretta: false })).toEqual({ mossa: 'aspetta-rtc', avviaRtc: true })
    expect(prossimaMossa({ ...base, diretta: false, rtc: 'collegando' })).toEqual({ mossa: 'aspetta-rtc', avviaRtc: false })
  })
  it('WebRTC aperto: si usa il canale', () => {
    expect(prossimaMossa({ ...base, diretta: false, rtc: 'aperto' })).toEqual({ mossa: 'rtc', avviaRtc: false })
  })
  it('WebRTC fallito: il Drive; dopo due minuti si riprova il WebRTC, ma lo schermo intanto arriva dal Drive', () => {
    const fallito = { ...base, diretta: false, rtc: 'fallito' as const, rtcFallitoIl: ADESSO - 10_000 }
    expect(prossimaMossa(fallito)).toEqual({ mossa: 'drive', avviaRtc: false })
    expect(prossimaMossa({ ...fallito, rtcFallitoIl: ADESSO - RIPROVA_RTC_DOPO_MS })).toEqual({ mossa: 'drive', avviaRtc: true })
    // Mentre lo si riprova, chi guarda resta sul Drive.
    expect(prossimaMossa({ ...fallito, rtc: 'collegando' })).toEqual({ mossa: 'drive', avviaRtc: false })
  })
  it('senza Drive: niente WebRTC (lo scambio passa dal Drive) e niente cassetta', () => {
    expect(prossimaMossa({ diretta: false, rtcPossibile: false, rtc: 'spento', drivePossibile: false, adesso: ADESSO })).toEqual({ mossa: 'errore', avviaRtc: false })
  })
  it('chiave rifiutata: nessuna strada aiuta, si dice il motivo', () => {
    expect(prossimaMossa({ ...base, diretta: false, chiaveRifiutata: true }).mossa).toBe('errore')
  })
})

describe('come si racconta la strada nel riquadro', () => {
  it('rete di casa e Tailscale con l’indirizzo; WebRTC cifrato; Drive lento e dichiarato', () => {
    expect(etichettaStrada({ strada: 'lan', indirizzo: '192.168.1.177' }, 'LAPTOP')?.breve).toBe('rete di casa · 192.168.1.177')
    expect(etichettaStrada({ strada: 'tailscale', indirizzo: '100.117.177.78' }, 'LAPTOP')?.breve).toBe('Tailscale · 100.117.177.78')
    const w = etichettaStrada({ strada: 'webrtc' }, 'LAPTOP')
    expect(w?.breve).toBe('diretto via Internet (WebRTC)')
    expect(w?.testo).toContain('chiave di casa')
    expect(w?.lento).toBe(false)
    const d = etichettaStrada({ strada: 'drive' }, 'LAPTOP')
    expect(d?.breve).toBe('collegamento lento via Drive')
    expect(d?.lento).toBe(true)
    expect(d?.testo).toContain('solo leggere e mandare un messaggio')
    expect(etichettaStrada(undefined, 'LAPTOP')).toBeUndefined()
  })
  it('in due parole per il telefono', () => {
    expect(stradaBreve('lan')).toBe('rete di casa')
    expect(stradaBreve('drive')).toBe('Drive, lento')
  })
})

describe('la segnalazione sul Drive', () => {
  it('un file per coppia e per verso', () => {
    expect(nomeOffertaRtc('lap', 'fisso')).toBe('rtc-offerta-lap-fisso')
    expect(nomeRispostaRtc('fisso', 'lap')).toBe('rtc-risposta-fisso-lap')
  })
  it('un segnale vale solo se è per me, da chi aspetto, del giro giusto e fresco', () => {
    const s = { giro: 'g1', da: 'fisso', daNome: 'PC-Fisso', verso: 'lap', creatoIl: new Date(ADESSO - 5000).toISOString(), sdp: 'x' }
    expect(segnaleValido(s, { io: 'lap', adesso: ADESSO })).toEqual(s)
    expect(segnaleValido(s, { io: 'altro', adesso: ADESSO })).toBeUndefined()
    expect(segnaleValido(s, { io: 'lap', da: 'terzo', adesso: ADESSO })).toBeUndefined()
    expect(segnaleValido(s, { io: 'lap', giro: 'g2', adesso: ADESSO })).toBeUndefined()
    expect(segnaleValido(s, { io: 'lap', adesso: ADESSO + 10 * 60_000 })).toBeUndefined()
    expect(segnaleValido({ ...s, sdp: 3 }, { io: 'lap', adesso: ADESSO })).toBeUndefined()
    expect(segnaleValido(null, { io: 'lap', adesso: ADESSO })).toBeUndefined()
  })
})

describe('le rotte', () => {
  it('sul canale solo quelle del riquadro remoto', () => {
    for (const r of ['/api/stato', '/api/storia', '/api/scrivi', '/api/scegli', '/api/pc']) expect(rottaPermessaSulCanale(r)).toBe(true)
    for (const r of ['/api/drive/porta', '/api/rispondi', '/api/file', '/api/account/esci', '/']) expect(rottaPermessaSulCanale(r)).toBe(false)
    // La gestione dal telefono attraverso il ponte (0.55.0).
    for (const r of ['/api/autopilota', '/api/autopilota/crea', '/api/workspace/crea', '/api/chat/dormi']) expect(rottaPermessaSulCanale(r)).toBe(true)
  })
  it('via Drive si dice cosa non si può fare, e perché', () => {
    expect(nonViaDrive('/api/scegli', 'LAPTOP')).toContain('premere un’opzione')
    expect(nonViaDrive('/api/scegli', 'LAPTOP')).toContain('solo leggere lo schermo e mandare un messaggio')
  })
  it('i messaggi del canale: forma giusta o niente', () => {
    expect(leggiMessaggioCanale({ n: 1, tipo: 'chiedi', id: 'a', percorso: '/api/stato' })).toEqual({ n: 1, tipo: 'chiedi', id: 'a', percorso: '/api/stato' })
    expect(leggiMessaggioCanale({ n: 2, tipo: 'risposta', id: 'a', stato: 200, corpo: { ok: 1 } })?.tipo).toBe('risposta')
    expect(leggiMessaggioCanale({ n: 1, tipo: 'ciao', pc: 'lap', nome: 'LAPTOP' })?.tipo).toBe('ciao')
    expect(leggiMessaggioCanale({ tipo: 'chiedi', id: 'a', percorso: '/x' })).toBeUndefined()
    expect(leggiMessaggioCanale({ n: 1, tipo: 'boh' })).toBeUndefined()
    expect(leggiMessaggioCanale(undefined)).toBeUndefined()
  })
})

describe('lo schermo nella cassetta del Drive', () => {
  const chat = (i: number): { id: string; titolo: string; cwd: string; righe: string[]; grezze: string[]; totale: number; sessione: string; aspetta: boolean } => ({
    id: `c${i}`, titolo: `Chat ${i}`, cwd: `C:\\p${i}`, sessione: `s${i}`, aspetta: i === 0,
    righe: Array.from({ length: 200 }, (_, k) => `riga ${k}`), grezze: Array.from({ length: 200 }, (_, k) => `\u001b[1mriga ${k}`), totale: 500
  })
  it('si scrive piccolo: poche chat, poche righe', () => {
    const s = schermoDaScrivere({ nome: 'LAPTOP', adesso: ADESSO, chat: Array.from({ length: 12 }, (_, i) => chat(i)) })
    expect(s.chat).toHaveLength(SCHERMO_CHAT_MAX)
    expect(s.chat[0]?.righe).toHaveLength(SCHERMO_RIGHE)
    expect(s.chat[0]?.righe.at(-1)).toBe('riga 199')
    expect(s.scritto).toBe('2026-10-02T12:00:00.000Z')
  })
  it('si legge come le rotte di quel PC: /api/stato e /api/storia', () => {
    const s = leggiSchermo(JSON.parse(JSON.stringify(schermoDaScrivere({ nome: 'LAPTOP', adesso: ADESSO, chat: [chat(0)] }))))
    expect(s).toBeDefined()
    if (s === undefined) return
    expect(statoDaSchermo(s)).toEqual({ chat: [{ id: 'c0', titolo: 'Chat 0', cwd: 'C:\\p0', sessione: 's0', aspetta: true }], computer: { nome: 'LAPTOP' } })
    const st = storiaDaSchermo(s, 'c0')
    expect(st?.righe).toHaveLength(SCHERMO_RIGHE)
    expect(st?.da).toBe(500 - SCHERMO_RIGHE)
    expect(st?.scritto).toBe('2026-10-02T12:00:00.000Z')
    expect(storiaDaSchermo(s, 'nessuna')).toBeUndefined()
    expect(leggiSchermo({ chat: 'no' })).toBeUndefined()
  })
  it('la richiesta di schermo scade dopo tre minuti', () => {
    const r = { da: 'fisso', daNome: 'PC-Fisso', il: new Date(ADESSO).toISOString() }
    expect(richiestaSchermoViva(r, ADESSO + 60_000)).toEqual(r)
    expect(richiestaSchermoViva(r, ADESSO + 4 * 60_000)).toBeUndefined()
    expect(richiestaSchermoViva({ da: 1 }, ADESSO)).toBeUndefined()
  })
})
