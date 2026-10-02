import { describe, it, expect } from 'vitest'
import { creaRtc, type EventoPonte, type PonteRtc, type Rtc } from '../../src/main/rtc/collegamento-rtc'
import type { Scatola } from '../../src/main/progetti/presenza'

/**
 * 0.40.0: il collegamento WebRTC fra due PC su reti diverse, senza Tailscale.
 * Il WebRTC vero lo fa Chromium (provato a mano in Electron: due finestre
 * nascoste si collegano, i server STUN danno l'indirizzo visto da Internet,
 * i messaggi lunghi arrivano interi). Qui la regia, con un ponte finto: lo
 * scambio sul Drive, la chiave di casa, le richieste e i guasti.
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

type Capo = { ponte: PonteFinto; id: string }
type PonteFinto = PonteRtc & { emetti: (e: EventoPonte) => void; capi: Map<string, Capo> }

/** Una rete finta: le offerte e le risposte sono gettoni; `nat: 'chiuso'` simula due reti che non si lasciano attraversare. */
function reteFinta(opz: { nat?: 'aperto' | 'chiuso' } = {}) {
  let n = 0
  const offerte = new Map<string, Capo>()
  const risposte = new Map<string, Capo>()
  const crea = (): PonteFinto => {
    const cbs: ((e: EventoPonte) => void)[] = []
    const p: PonteFinto = {
      capi: new Map(),
      emetti: (e) => { for (const c of cbs) c(e) },
      offri: async (id) => { n += 1; const t = `offerta-${n}`; offerte.set(t, { ponte: p, id }); return t },
      rispondi: async (id, offerta) => {
        const da = offerte.get(offerta)
        if (da === undefined) throw new Error('offerta sconosciuta')
        p.capi.set(id, da)
        da.ponte.capi.set(da.id, { ponte: p, id })
        n += 1
        const t = `risposta-${n}`
        risposte.set(t, { ponte: p, id })
        return t
      },
      completa: async (id, risposta) => {
        const altro = risposte.get(risposta)
        if (altro === undefined) throw new Error('risposta sconosciuta')
        if (opz.nat === 'chiuso') return
        setTimeout(() => { p.emetti({ id, tipo: 'aperto', via: 'srflx' }); altro.ponte.emetti({ id: altro.id, tipo: 'aperto', via: 'srflx' }) }, 1)
      },
      manda: (id, testo) => {
        const altro = p.capi.get(id)
        if (altro !== undefined) setTimeout(() => altro.ponte.emetti({ id: altro.id, tipo: 'messaggio', testo }), 1)
      },
      chiudi: (id) => {
        const altro = p.capi.get(id)
        p.capi.delete(id)
        if (altro !== undefined) { altro.ponte.capi.delete(altro.id); setTimeout(() => altro.ponte.emetti({ id: altro.id, tipo: 'chiuso' }), 1) }
      },
      ascolta: (cb) => { cbs.push(cb) }
    }
    return p
  }
  return { crea }
}

const TEMPI = { attesaRisposta: 600, rileggiRisposta: 10, apertura: 200, richiesta: 300 }

function pc(p: { io: string; nome: string; altri: string[]; scatola: Scatola; ponte: PonteRtc; casa: (id: string) => string | undefined; rotta?: (percorso: string, corpo: unknown) => Promise<{ stato: number; corpo: unknown }> }) {
  const registro: string[] = []
  const chiamate: { percorso: string; corpo: unknown }[] = []
  const rtc = creaRtc({
    ponte: async () => p.ponte,
    scatola: () => p.scatola,
    io: () => p.io,
    mioNome: () => p.nome,
    chiaveDiCasa: p.casa,
    altriPc: () => p.altri,
    rotta: p.rotta ?? (async (percorso, corpo) => { chiamate.push({ percorso, corpo }); return { stato: 200, corpo: { chat: [{ id: '1', titolo: 'Trading' }], eco: corpo } } }),
    log: (m) => { registro.push(m) },
    tempi: TEMPI
  })
  return { rtc, registro, chiamate }
}

/** Il PC che risponde guarda il Drive ogni tanto (sul vero ogni dieci secondi). */
function guarda(rtc: Rtc): () => void {
  const t = setInterval(() => { void rtc.cercaOfferte() }, 15)
  return () => clearInterval(t)
}
async function finche(cond: () => boolean, ms = 2000): Promise<void> {
  const fine = Date.now() + ms
  while (!cond() && Date.now() < fine) await new Promise((r) => setTimeout(r, 5))
}

// Le chiavi di casa: chi ha la stessa cassaforte ricava le stesse.
const casa = (id: string): string => `casa:${id}`

describe('il collegamento WebRTC fra due PC', () => {
  it('si apre con lo scambio sul Drive e porta le richieste del riquadro remoto', async () => {
    const drive = scatolaInMemoria()
    const rete = reteFinta()
    const fisso = pc({ io: 'fisso', nome: 'PC-Fisso', altri: ['lap'], scatola: drive, ponte: rete.crea(), casa })
    const lap = pc({ io: 'lap', nome: 'LAPTOP', altri: ['fisso'], scatola: drive, ponte: rete.crea(), casa })
    const smetti = guarda(lap.rtc)
    expect(fisso.rtc.stato('lap')).toBe('spento')
    fisso.rtc.avvia('lap')
    expect(fisso.rtc.stato('lap')).toBe('collegando')
    await finche(() => fisso.rtc.stato('lap') === 'aperto')
    smetti()
    expect(fisso.rtc.stato('lap')).toBe('aperto')
    // Sul Drive non resta niente: offerta e risposta si cancellano.
    await finche(() => drive.dati.size === 0, 200)
    expect([...drive.dati.keys()]).toEqual([])
    // Le offerte viaggiano cifrate: nemmeno il gettone del ponte si legge.
    const e = await fisso.rtc.chiama('lap', '/api/storia', { chat: '1', quante: 200 })
    expect(e).toEqual({ stato: 200, corpo: { chat: [{ id: '1', titolo: 'Trading' }], eco: { chat: '1', quante: 200 } } })
    expect(lap.chiamate).toEqual([{ percorso: '/api/storia', corpo: { chat: '1', quante: 200 } }])
    expect(lap.registro.some((m) => m.includes('PC-Fisso collegato direttamente'))).toBe(true)
    expect(fisso.registro.some((m) => m.includes('candidato srflx'))).toBe(true)
  })

  it('solo le rotte del riquadro remoto: le altre non arrivano nemmeno a quel PC', async () => {
    const drive = scatolaInMemoria()
    const rete = reteFinta()
    const fisso = pc({ io: 'fisso', nome: 'PC-Fisso', altri: ['lap'], scatola: drive, ponte: rete.crea(), casa })
    const lap = pc({ io: 'lap', nome: 'LAPTOP', altri: ['fisso'], scatola: drive, ponte: rete.crea(), casa })
    const smetti = guarda(lap.rtc)
    fisso.rtc.avvia('lap')
    await finche(() => fisso.rtc.stato('lap') === 'aperto')
    smetti()
    expect((await fisso.rtc.chiama('lap', '/api/autopilota', { autopilota: 'x' })).stato).toBe(403)
    expect(lap.chiamate).toEqual([])
  })

  it('con un’altra cassaforte l’offerta non si apre: scartata, e chi chiama passa oltre', async () => {
    const drive = scatolaInMemoria()
    const rete = reteFinta()
    const fisso = pc({ io: 'fisso', nome: 'PC-Fisso', altri: ['lap'], scatola: drive, ponte: rete.crea(), casa })
    const lap = pc({ io: 'lap', nome: 'LAPTOP', altri: ['fisso'], scatola: drive, ponte: rete.crea(), casa: (id) => `altra-cassaforte:${id}` })
    const smetti = guarda(lap.rtc)
    fisso.rtc.avvia('lap')
    await finche(() => fisso.rtc.stato('lap') === 'fallito', 2000)
    smetti()
    expect(fisso.rtc.stato('lap')).toBe('fallito')
    expect(fisso.rtc.fallitoIl('lap')).toBeTypeOf('number')
    expect(lap.registro.some((m) => m.includes('non sigillata con la chiave di casa'))).toBe(true)
    expect(fisso.registro.some((m) => m.includes('nessuna risposta'))).toBe(true)
    expect(lap.chiamate).toEqual([])
  })

  it('quel PC non risponde sul Drive (spento, o senza la 0.40.0): fallito, con il perché', async () => {
    const drive = scatolaInMemoria()
    const fisso = pc({ io: 'fisso', nome: 'PC-Fisso', altri: ['lap'], scatola: drive, ponte: reteFinta().crea(), casa })
    fisso.rtc.avvia('lap')
    await finche(() => fisso.rtc.stato('lap') === 'fallito')
    expect(fisso.registro.at(-1)).toContain('non ha la 0.40.0')
    // L'offerta non resta sul Drive.
    expect(drive.dati.has('rtc-offerta-lap-fisso')).toBe(false)
  })

  it('due reti che non si lasciano attraversare (niente TURN): fallito, e il registro lo dice', async () => {
    const drive = scatolaInMemoria()
    const rete = reteFinta({ nat: 'chiuso' })
    const fisso = pc({ io: 'fisso', nome: 'PC-Fisso', altri: ['lap'], scatola: drive, ponte: rete.crea(), casa })
    const lap = pc({ io: 'lap', nome: 'LAPTOP', altri: ['fisso'], scatola: drive, ponte: rete.crea(), casa })
    const smetti = guarda(lap.rtc)
    fisso.rtc.avvia('lap')
    await finche(() => fisso.rtc.stato('lap') === 'fallito')
    smetti()
    expect(fisso.registro.at(-1)).toContain('TURN')
  })

  it('il canale si chiude: si torna a «spento» (non fallito), e la prossima chiamata lo riapre', async () => {
    const drive = scatolaInMemoria()
    const rete = reteFinta()
    const pLap = rete.crea()
    const fisso = pc({ io: 'fisso', nome: 'PC-Fisso', altri: ['lap'], scatola: drive, ponte: rete.crea(), casa })
    const lap = pc({ io: 'lap', nome: 'LAPTOP', altri: ['fisso'], scatola: drive, ponte: pLap, casa })
    const smetti = guarda(lap.rtc)
    fisso.rtc.avvia('lap')
    await finche(() => fisso.rtc.stato('lap') === 'aperto')
    smetti()
    lap.rtc.chiudiTutto()
    await finche(() => fisso.rtc.stato('lap') === 'spento')
    expect(fisso.rtc.stato('lap')).toBe('spento')
    await expect(fisso.rtc.chiama('lap', '/api/stato')).rejects.toThrow('non è aperto')
  })

  it('un messaggio che non viene da casa si butta, senza risposta', async () => {
    const drive = scatolaInMemoria()
    const rete = reteFinta()
    const pLap = rete.crea() as PonteFinto
    const fisso = pc({ io: 'fisso', nome: 'PC-Fisso', altri: ['lap'], scatola: drive, ponte: rete.crea(), casa })
    const lap = pc({ io: 'lap', nome: 'LAPTOP', altri: ['fisso'], scatola: drive, ponte: pLap, casa })
    const smetti = guarda(lap.rtc)
    fisso.rtc.avvia('lap')
    await finche(() => fisso.rtc.stato('lap') === 'aperto')
    smetti()
    const id = [...pLap.capi.keys()][0] ?? ''
    pLap.emetti({ id, tipo: 'messaggio', testo: 'AAAA-non-cifrato' })
    await new Promise((r) => setTimeout(r, 20))
    expect(lap.registro.some((m) => m.includes('non autentico'))).toBe(true)
    expect(lap.chiamate).toEqual([])
  })

  it('una richiesta senza risposta chiude il canale (la prossima ne apre uno nuovo o cambia strada)', async () => {
    const drive = scatolaInMemoria()
    const rete = reteFinta()
    const fisso = pc({ io: 'fisso', nome: 'PC-Fisso', altri: ['lap'], scatola: drive, ponte: rete.crea(), casa })
    const lap = pc({ io: 'lap', nome: 'LAPTOP', altri: ['fisso'], scatola: drive, ponte: rete.crea(), casa, rotta: () => new Promise(() => undefined) })
    const smetti = guarda(lap.rtc)
    fisso.rtc.avvia('lap')
    await finche(() => fisso.rtc.stato('lap') === 'aperto')
    smetti()
    await expect(fisso.rtc.chiama('lap', '/api/stato')).rejects.toThrow('nessuna risposta')
    expect(fisso.rtc.stato('lap')).toBe('spento')
  })
})
