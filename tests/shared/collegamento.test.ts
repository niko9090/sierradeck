import { describe, it, expect } from 'vitest'
import {
  accoda, attesaPrima, erroreDiStrada, cambioVisibile, CAMBIO_VISIBILE_MS, consegnato, creaMemoriaInvii, eOra, fraSecondi, iconaStrada, inInvio,
  KEEPALIVE_OGNI_MS, LINEA_NUOVA, mappaPc, meglio, nonPartito, passo, prossimoDaMandare, qualita, rigaStoria, stradaMigliore,
  taccheTesto, testoRiconnessione, faseVista, parolaFase, LENTA_DOPO_MS, type Linea
} from '@shared/collegamento'

/** 0.51.0: il collegamento verso un altro PC, con le cadute simulate. */
describe('le attese', () => {
  it('1, 2, 5, 10, 30 secondi, poi sempre 30: mai una resa', () => {
    expect([1, 2, 3, 4, 5, 6, 50].map(attesaPrima)).toEqual([1000, 2000, 5000, 10_000, 30_000, 30_000, 30_000])
  })
})

describe('la qualità', () => {
  it('tacche dal ritardo e dalle perdite', () => {
    expect(qualita([])).toMatchObject({ tacche: 0 })
    expect(qualita([{ ok: true, ritardoMs: 40, il: 1 }, { ok: true, ritardoMs: 60, il: 2 }])).toMatchObject({ tacche: 4, ritardoMs: 50, perdite: 0, parola: 'ottima' })
    expect(qualita([{ ok: true, ritardoMs: 300, il: 1 }])).toMatchObject({ tacche: 3 })
    expect(qualita([{ ok: true, ritardoMs: 700, il: 1 }])).toMatchObject({ tacche: 2 })
    expect(qualita([{ ok: true, ritardoMs: 2500, il: 1 }])).toMatchObject({ tacche: 1, parola: 'debole' })
    // Veloce ma con una chiamata su due persa: incerta.
    const mezze = [{ ok: true, ritardoMs: 50, il: 1 }, { ok: false, il: 2 }, { ok: true, ritardoMs: 50, il: 3 }, { ok: false, il: 4 }]
    expect(qualita(mezze)).toMatchObject({ tacche: 2, perdite: 0.5 })
    expect(qualita([{ ok: false, il: 1 }])).toMatchObject({ tacche: 0, parola: 'non arriva niente' })
    expect(taccheTesto(2)).toBe('▂▄··')
  })
})

describe('la macchina degli stati, con cadute, ritorni e cambi di strada', () => {
  it('collegato su rete di casa → caduta vera → tentativi con attese crescenti → torna via WebRTC → torna la rete di casa', () => {
    let l: Linea = passo(LINEA_NUOVA, { tipo: 'ok', il: 0, ritardoMs: 30, strada: 'lan' })
    expect(l).toMatchObject({ fase: 'collegato', strada: 'lan', tentativo: 0 })
    expect(eOra(l, 0, KEEPALIVE_OGNI_MS - 1)).toBe(false)
    expect(eOra(l, 0, KEEPALIVE_OGNI_MS)).toBe(true)
    // Il keepalive non risponde: prima «linea lenta», al ritmo di sempre (0.56.0).
    l = passo(l, { tipo: 'errore', il: 10_000, motivo: 'irraggiungibile', messaggio: 'non risponde' })
    expect(l).toMatchObject({ fase: 'lenta', falliti: 1 })
    expect(l.prossimoIl).toBeUndefined()
    l = passo(l, { tipo: 'errore', il: 16_000, motivo: 'irraggiungibile', messaggio: 'non risponde' })
    expect(l.fase).toBe('lenta')
    // Tre fallimenti di fila e più di 20 s senza niente: caduta, che comincia dall'ultimo segno di vita.
    l = passo(l, { tipo: 'errore', il: 22_000, motivo: 'irraggiungibile', messaggio: 'non risponde' })
    expect(l).toMatchObject({ fase: 'ricollego', tentativo: 1, prossimoIl: 23_000, cadutaIl: 0 })
    expect(testoRiconnessione(l, 'LAPTOP', 22_000)).toBe('Collegamento con LAPTOP caduto da 22 s · tentativo 1 · riprovo fra 1 s')
    expect(eOra(l, 22_000, 22_500)).toBe(false)
    expect(eOra(l, 22_000, 23_000)).toBe(true)
    const attese: number[] = []
    let t = 23_000
    for (let i = 0; i < 5; i++) {
      l = passo(l, { tipo: 'errore', il: t, motivo: 'irraggiungibile' })
      attese.push((l.prossimoIl ?? 0) - t)
      t = l.prossimoIl ?? t
    }
    expect(attese).toEqual([2000, 5000, 10_000, 30_000, 30_000])
    expect(l.tentativo).toBe(6)
    // «Riprova adesso»: il prossimo tentativo è subito.
    l = passo(l, { tipo: 'riprova-adesso', il: t - 20_000 })
    expect(fraSecondi(l, t - 20_000)).toBe(0)
    // Torna, per un'altra strada: la prima risposta fa «lenta», la seconda «collegato» (isteresi).
    l = passo(l, { tipo: 'ok', il: t, ritardoMs: 180, strada: 'webrtc' })
    expect(l).toMatchObject({ fase: 'lenta', strada: 'webrtc' })
    l = passo(l, { tipo: 'ok', il: t + 2000, ritardoMs: 170, strada: 'webrtc' })
    expect(l).toMatchObject({ fase: 'collegato', strada: 'webrtc', tentativo: 0 })
    expect(l.prossimoIl).toBeUndefined()
    // La rete di casa torna: si ripassa da sola, senza cadute.
    l = passo(l, { tipo: 'ok', il: t + 30_000, ritardoMs: 20, strada: 'lan' })
    expect(cambioVisibile(l, t + 30_001)).toBe('Passo da WebRTC a rete di casa')
    expect(l.storia.map((e) => e.tipo)).toEqual(['collegato', 'caduta', 'tornato', 'cambio'])
    const tornato = l.storia[2]
    expect(tornato).toMatchObject({ tipo: 'tornato', tentativi: 6 })
    expect(rigaStoria(l.storia[1]!)).toContain('caduta (rete di casa): non risponde')
    expect(rigaStoria(tornato!)).toMatch(/tornato \(WebRTC\) dopo \d+ (s|min) e 6 tentativi/)
  })
  it('il caso di Nicholas (09/10): lo schermo arriva mentre il controllo fallisce — mai «non connesso»', () => {
    // Ogni due secondi il controllo dello stato scade (pesante, 6 s); intanto
    // la storia della chat arriva ogni secondo e mezzo. Per due minuti.
    let l: Linea = passo(LINEA_NUOVA, { tipo: 'ok', il: 0, ritardoMs: 40, strada: 'tailscale' })
    const fasi = new Set<string>()
    for (let t = 1000; t <= 120_000; t += 500) {
      if (t % 2000 === 0) l = passo(l, { tipo: 'errore', il: t, motivo: 'irraggiungibile', messaggio: 'non ha risposto in 6 secondi' })
      if (t % 1500 === 0) l = passo(l, { tipo: 'ok', il: t, ritardoMs: 300, strada: 'tailscale' })
      fasi.add(faseVista(l, t))
    }
    expect(fasi.has('ricollego')).toBe(false)
    expect(l.storia.map((e) => e.tipo)).toEqual(['collegato'])
  })
  it('una richiesta appesa senza errore: «linea lenta» dopo 8 s di silenzio, verde alla risposta', () => {
    const l = passo(LINEA_NUOVA, { tipo: 'ok', il: 0, ritardoMs: 40 })
    expect(faseVista(l, LENTA_DOPO_MS - 1)).toBe('collegato')
    expect(faseVista(l, LENTA_DOPO_MS)).toBe('lenta')
    expect(faseVista(passo(l, { tipo: 'ok', il: LENTA_DOPO_MS + 100, ritardoMs: 9000 }), LENTA_DOPO_MS + 200)).toBe('collegato')
    expect(parolaFase('lenta')).toEqual({ parola: 'linea lenta', colore: 'ambra' })
    expect(parolaFase('ricollego')).toEqual({ parola: 'non connesso', colore: 'rosso' })
  })
  it('molti fallimenti ma un segno di vita recente: lenta; tanto silenzio ma pochi fallimenti: lenta', () => {
    let l: Linea = passo(LINEA_NUOVA, { tipo: 'ok', il: 0, ritardoMs: 40 })
    for (let i = 1; i <= 5; i++) l = passo(l, { tipo: 'errore', il: i * 1000, motivo: 'irraggiungibile' })
    expect(l.fase).toBe('lenta')
    let m: Linea = passo(LINEA_NUOVA, { tipo: 'ok', il: 0, ritardoMs: 40 })
    m = passo(m, { tipo: 'errore', il: 60_000, motivo: 'irraggiungibile' })
    m = passo(m, { tipo: 'errore', il: 61_000, motivo: 'irraggiungibile' })
    expect(m.fase).toBe('lenta')
    m = passo(m, { tipo: 'errore', il: 62_000, motivo: 'irraggiungibile' })
    expect(m.fase).toBe('ricollego')
    // Senza mai un segno di vita (il primo collegamento): giù subito, come prima, per la schermata dei tentativi.
    expect(passo(LINEA_NUOVA, { tipo: 'errore', il: 0, motivo: 'irraggiungibile' }).fase).toBe('ricollego')
  })
  it('la storia si tiene corta, le misure anche', () => {
    let l: Linea = LINEA_NUOVA
    for (let i = 0; i < 100; i++) l = passo(l, { tipo: 'ok', il: i * 1000, ritardoMs: 10, strada: i % 2 === 0 ? 'lan' : 'webrtc' })
    expect(l.storia.length).toBe(30)
    expect(l.misure.length).toBe(12)
  })
  it('«riprova adesso» a linea su non cambia niente', () => {
    const l = passo(LINEA_NUOVA, { tipo: 'ok', il: 0, ritardoMs: 5 })
    expect(passo(l, { tipo: 'riprova-adesso', il: 5 })).toBe(l)
  })
})

describe('quali errori sono della strada', () => {
  it('la chat chiusa là, il PIN e «via Drive non si fa» no: la linea è su', () => {
    expect(['irraggiungibile', 'collegando', 'spento', 'non-so', 'chiave'].every(erroreDiStrada)).toBe(true)
    expect(['chat', 'pin', 'lento'].some(erroreDiStrada)).toBe(false)
  })
})

describe('la strada migliore', () => {
  it('rete di casa, Tailscale, WebRTC, Drive', () => {
    expect(stradaMigliore(['drive', 'webrtc', 'tailscale'])).toBe('tailscale')
    expect(stradaMigliore([])).toBeUndefined()
    expect(meglio('lan', 'webrtc')).toBe(true)
    expect(meglio('drive', 'webrtc')).toBe(false)
    expect(meglio('drive', undefined)).toBe(true)
    expect(iconaStrada('lan')).toBe('🏠')
  })
})

describe('la coda dell’input, senza doppioni', () => {
  it('scritto a linea giù, parte al ritorno uno alla volta; ricaduto torna in attesa con lo stesso id', () => {
    let c = accoda([], { id: 'm-00000001', testo: 'continua', il: 1 })
    c = accoda(c, { id: 'm-00000001', testo: 'continua', il: 1 })
    c = accoda(c, { id: 'm-00000002', testo: 'poi i test', il: 2 })
    expect(c.map((x) => x.id)).toEqual(['m-00000001', 'm-00000002'])
    const primo = prossimoDaMandare(c)!
    expect(primo.id).toBe('m-00000001')
    c = inInvio(c, primo.id)
    expect(prossimoDaMandare(c)).toBeUndefined()
    c = nonPartito(c, primo.id)
    expect(prossimoDaMandare(c)?.id).toBe('m-00000001')
    c = consegnato(inInvio(c, 'm-00000001'), 'm-00000001')
    expect(prossimoDaMandare(c)?.id).toBe('m-00000002')
  })
  it('dall’altra parte: un id già consegnato non si scrive di nuovo; si segna solo quando è arrivato', () => {
    const m = creaMemoriaInvii(3)
    expect(m.gia('p-1', 'a', 0)).toBe(false)
    m.segna('p-1', 'a', 0)
    expect(m.gia('p-1', 'a', 10)).toBe(true)
    expect(m.gia('p-2', 'a', 10)).toBe(false)
    for (const x of ['b', 'c', 'd']) m.segna('p-1', x, 1)
    expect(m.gia('p-1', 'a', 10)).toBe(false)
    expect(m.gia('p-1', 'd', 10)).toBe(true)
  })
})

describe('la mappa dei PC', () => {
  it('questo PC al centro, gli altri in cerchio, linee colorate per stato', () => {
    const m = mappaPc({ id: 'fisso', nome: 'FISSO' }, [
      { pcId: 'lap', nome: 'LAPTOP', stato: 'acceso', strada: 'rete di casa' },
      { pcId: 'ufficio', nome: 'UFFICIO', stato: 'acceso', strada: 'Drive, lento' },
      { pcId: 'vecchio', nome: 'VECCHIO', stato: 'non-so' }
    ])
    expect(m.nodi[0]).toMatchObject({ id: 'fisso', x: 50, y: 50, io: true })
    expect(m.nodi[1]).toMatchObject({ id: 'lap', x: 50, y: 12 })
    expect(m.linee.map((l) => l.stato)).toEqual(['ok', 'lento', 'giu'])
    expect(m.linee[2]?.testo).toBe('VECCHIO: non risponde adesso')
    for (const n of m.nodi) { expect(n.x).toBeGreaterThanOrEqual(0); expect(n.x).toBeLessThanOrEqual(100) }
  })
})
