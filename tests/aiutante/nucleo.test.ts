import { describe, it, expect } from 'vitest'
import { creaNucleo } from '../../src/aiutante/nucleo'
import { rotteAiutante, NESSUN_DISPOSITIVO } from '../../src/aiutante/rete'
import type { LavoratoreAiuto } from '../../src/autopilot-host/aiuto-lavoratore'

/**
 * 12/11, il cuore dell'Aiutante: le rotte `/api/aiuto/*` arrivano al
 * lavoratore nello stesso processo, con le stesse risposte del programma
 * completo; i posti dicono `programma: 'aiutante'` e modo «dedicato».
 */
function lavoratoreFinto(inCorso = 0): LavoratoreAiuto & { pezzi: number } {
  const l = {
    pezzi: 0,
    inCorso: () => inCorso,
    ospitati: () => [],
    pezzo: () => { l.pezzi += 1; return { ok: true as const, ricevuti: 1 } },
    avvia: () => ({ ok: true as const }),
    stato: () => undefined,
    ritira: () => ({ ok: false as const, motivo: 'niente da ritirare' }),
    chiudi: () => true,
    ferma: () => false,
    pulizia: async () => {}
  }
  return l
}

const misura = () => ({ processori: 8, memoriaLiberaMb: 32_000, memoriaTotaleMb: 64_000, caricoPercento: 5 })

function nucleo(p: { pronto?: boolean; scarico?: boolean; inCorso?: number; scelti?: number; adesso?: () => number } = {}) {
  const errori: string[] = []
  const lav = lavoratoreFinto(p.inCorso ?? 0)
  const n = creaNucleo({
    cartella: 'non-usata', avvia: () => { throw new Error('mai nei test') }, misura,
    regolazione: () => (p.scelti !== undefined ? { postiScelti: p.scelti } : {}),
    pronto: () => p.pronto ?? true, inScarico: () => p.scarico ?? false,
    log: () => {}, errore: (r) => errori.push(r), lavoratore: lav,
    ...(p.adesso !== undefined ? { adesso: p.adesso } : {})
  })
  return { n, lav, errori }
}

describe('i posti dell’Aiutante dal suo servizio', () => {
  it('pronto: liberi = tetto − in corso', async () => {
    const { n } = nucleo({ scelti: 4, inCorso: 1 })
    expect(await n.servizio('/aiuto/posti')).toMatchObject({ liberi: 3, tetto: 4, inCorso: 1 })
  })
  it('non pronto, o con un aggiornamento pronto: zero, e il primo pezzo di un lavoro nuovo si rifiuta', async () => {
    for (const p of [{ pronto: false }, { scarico: true }]) {
      const { n, lav } = nucleo({ ...p, scelti: 4 })
      expect(await n.servizio('/aiuto/posti')).toMatchObject({ liberi: 0 })
      await expect(n.servizio('/aiuto/pezzo', { lavoro: 'r000000000001', n: 0, totale: 1, dati: 'eA==' })).rejects.toThrow(/non ha posti liberi/u)
      expect(lav.pezzi).toBe(0)
    }
  })
  it('i pezzi dopo il primo di un lavoro già partito passano anche senza posti (il lavoro si finisce)', async () => {
    const { n, lav } = nucleo({ scarico: true, scelti: 4 })
    await n.servizio('/aiuto/pezzo', { lavoro: 'r000000000001', n: 1, totale: 2, dati: 'eA==' })
    expect(lav.pezzi).toBe(1)
  })
  it('lo stato di un lavoro che non c’è: lo stesso errore del programma completo («lavoro sconosciuto»)', async () => {
    const { n } = nucleo()
    await expect(n.servizio('/aiuto/stato', { lavoro: 'r000000000009' })).rejects.toThrow(/lavoro sconosciuto/u)
  })
  it('il piano esaurito: zero posti fino all’azzeramento, e un blocco nello storico (una volta)', async () => {
    let ora = Date.parse('2026-11-12T10:00:00.000Z')
    const { n, errori } = nucleo({ scelti: 4, adesso: () => ora })
    n.suFine({ id: 'r000000000001', stato: 'fallito', testo: 'Claude AI usage limit reached' })
    n.suFine({ id: 'r000000000002', stato: 'fallito', testo: 'Claude AI usage limit reached' })
    expect(await n.servizio('/aiuto/posti')).toMatchObject({ liberi: 0 })
    expect(n.limiteFino()).toBeGreaterThan(ora)
    expect(errori.filter((e) => /quota/u.test(e))).toHaveLength(1)
    ora += 2 * 60 * 60_000
    expect(await n.servizio('/aiuto/posti')).toMatchObject({ liberi: 4 })
  })
  it('un lavoro non riuscito per altro: un blocco nello storico, con il PC e il motivo', () => {
    const { n, errori } = nucleo()
    n.suFine({ id: 'r000000000003', stato: 'fallito', testo: '', motivo: 'npm ci non riuscito', perPc: 'Fisso', ruolo: 'sviluppatore' })
    expect(errori[0]).toMatch(/r000000000003.*Fisso.*npm ci/u)
    n.suFine({ id: 'r000000000004', stato: 'finito', testo: 'fatto' })
    expect(errori).toHaveLength(1)
  })
})

describe('le rotte del collegamento dell’Aiutante', () => {
  const rotte = (inPausa = false) => {
    const { n } = nucleo({ scelti: 3 })
    return rotteAiutante({
      aiuto: { modo: () => (inPausa ? 'no' : 'dedicato'), servizio: (p, c) => n.servizio(p, c), programma: 'aiutante', nomePc: () => 'Fisso' },
      versione: '1.0.0', identita: () => ({ nome: 'PC Aiutante', host: 'host' })
    })
  }
  it('/api/aiuto/posti: modo dedicato, i posti, e «aiutante» (chi chiede lo preferisce)', async () => {
    expect(await rotte()({ metodo: 'GET', percorso: '/api/aiuto/posti', corpo: undefined })).toEqual({ stato: 200, corpo: { modo: 'dedicato', liberi: 3, tetto: 3, programma: 'aiutante' } })
  })
  it('in pausa: modo «no», zero posti, e niente lavori nuovi', async () => {
    const r = rotte(true)
    expect((await r({ metodo: 'GET', percorso: '/api/aiuto/posti', corpo: undefined })).corpo).toMatchObject({ modo: 'no', liberi: 0, programma: 'aiutante' })
    expect((await r({ metodo: 'POST', percorso: '/api/aiuto/pezzo', corpo: {} })).stato).toBe(409)
  })
  it('/api/pc: il bussare leggero dice che è un Aiutante', async () => {
    expect((await rotte()({ metodo: 'GET', percorso: '/api/pc', corpo: undefined })).corpo).toMatchObject({ programma: 'SierraDeck', aiutante: true, versione: '1.0.0' })
  })
  it('tutto il resto (stato, chat, accoppiamento) non c’è', async () => {
    for (const percorso of ['/api/stato', '/api/scrivi', '/api/salute']) expect((await rotte()({ metodo: 'GET', percorso, corpo: undefined })).stato).toBe(404)
  })
  it('nessun dispositivo si accoppia o si riconosce con una chiave sua', () => {
    expect(NESSUN_DISPOSITIVO.riconosci('qualunque')).toBeUndefined()
    expect(NESSUN_DISPOSITIVO.accoppia('123456', 'telefono')).toBeUndefined()
    expect(() => NESSUN_DISPOSITIVO.apriAccoppiamento()).toThrow()
  })
})

describe('1.0.3: Claude che non va e l’ultimo lavoro non riuscito', () => {
  it('con Claude bloccato: zero posti e il primo pezzo si rifiuta', async () => {
    const lav = lavoratoreFinto(0)
    const n = creaNucleo({
      cartella: 'non-usata', avvia: () => { throw new Error('mai nei test') }, misura,
      regolazione: () => ({ postiScelti: 3 }), pronto: () => true, inScarico: () => false,
      claudeBloccato: () => 'Claude non collegato o accesso scaduto',
      log: () => {}, errore: () => {}, lavoratore: lav
    })
    expect(n.posti()).toMatchObject({ liberi: 0, perche: 'claude' })
    await expect(n.servizio('/aiuto/pezzo', { lavoro: 'x', n: 0, totale: 1, dati: '' })).rejects.toThrow(/posti/)
    expect(lav.pezzi).toBe(0)
  })
  it('un lavoro fallito: il motivo corto e la causa restano per la finestra, e chi ascolta lo sa', () => {
    const visti: string[] = []
    const n = creaNucleo({
      cartella: 'non-usata', avvia: () => { throw new Error('mai nei test') }, misura,
      regolazione: () => ({}), pronto: () => true, inScarico: () => false,
      suFallito: (f) => visti.push(f.causa),
      log: () => {}, errore: () => {}, lavoratore: lavoratoreFinto(0), adesso: () => 1000
    })
    n.suFine({ id: 'a1', stato: 'fallito', testo: '', motivo: 'su quel PC Claude Code non ha l’accesso fatto (o è scaduto): là va aperto un terminale, scritto «claude» e rifatto l’accesso (tipo error)', causa: 'accesso', perPc: 'PC-A' })
    expect(n.ultimoFallito()).toMatchObject({ id: 'a1', causa: 'accesso', perPc: 'PC-A', il: 1000 })
    expect(n.ultimoFallito()?.motivo).not.toContain('(tipo error)')
    expect(visti).toEqual(['accesso'])
  })
})
