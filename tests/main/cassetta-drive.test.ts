import { describe, it, expect } from 'vitest'
import { creaCassettaDrive, ATTESA_DRIVE, NON_VIA_DRIVE } from '../../src/main/rtc/cassetta-drive'
import { creaPostino, nomePosta, type ChatDiPc, type Posta } from '../../src/main/progetti/posta'
import type { Scatola } from '../../src/main/progetti/presenza'
import type { ChatNelloSchermo } from '@shared/strada-pc'

/**
 * 0.40.0, la quarta strada: quando niente di diretto arriva a quel PC, lo
 * schermo e i messaggi passano dal Drive. Lento e dichiarato: si legge e si
 * manda un messaggio, nient'altro.
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

describe('la cassetta sul Drive, dai due lati', () => {
  it('chi guarda chiede lo schermo; quel PC lo scrive al suo giro; chi guarda legge e manda un messaggio', async () => {
    const drive = scatolaInMemoria()
    let orologio = Date.parse('2026-10-02T12:00:00Z')
    const adesso = (): number => orologio
    // Il portatile: una chat aperta che aspetta.
    const chatLap: ChatDiPc[] = [{ id: '7', sessione: 's-trading', titolo: 'Trading', cwd: 'C:\\Trading', viva: true, aspetta: true }]
    const scritti: { id: string; testo: string }[] = []
    const registroLap: string[] = []
    const fotografa = async (): Promise<ChatNelloSchermo[]> => [{
      id: '7', sessione: 's-trading', titolo: 'Trading', cwd: 'C:\\Trading', aspetta: true, viva: true,
      righe: ['> fatto, aspetto'], grezze: ['\u001b[1m> fatto, aspetto'], totale: 120
    }]
    const lap = creaPostino({
      scatola: () => drive, pcId: () => 'lap', pcNome: () => 'LAPTOP', versione: () => '0.40.0',
      chat: () => chatLap, cartelle: () => ['C:\\Trading'], cartellaEsiste: () => true,
      apriChat: () => undefined, riprendiChat: () => undefined,
      scrivi: (id, testo) => { scritti.push({ id, testo }) },
      adesso, log: (m) => { registroLap.push(m) }, fotografa
    })
    // Il PC fisso, che guarda: la sua cassetta e il suo postino (per la posta).
    const fisso = creaPostino({
      scatola: () => drive, pcId: () => 'fisso', pcNome: () => 'PC-Fisso', versione: () => '0.40.0',
      chat: () => [], cartelle: () => [], cartellaEsiste: () => true,
      apriChat: () => undefined, riprendiChat: () => undefined, scrivi: () => undefined, adesso
    })
    const cassetta = creaCassettaDrive({
      scatola: () => drive, io: () => 'fisso', mioNome: () => 'PC-Fisso', nomeDi: () => 'LAPTOP',
      aggiungiPosta: (pcId, voce) => fisso.aggiungi(pcId, voce), adesso
    })

    // 1. La prima volta lo schermo non c'è: «aspetta», con il perché.
    const prima = await cassetta.chiama('lap', '/api/stato')
    expect(prima.stato).toBe(ATTESA_DRIVE)
    expect(String((prima.corpo as { errore: string }).errore)).toContain('al suo prossimo giro')
    expect(drive.dati.has('schermo-chiesto-lap')).toBe(true)

    // 2. Il giro del portatile vede la richiesta e scrive lo schermo.
    await lap.giro()
    expect(drive.dati.has('schermo-lap')).toBe(true)
    expect(registroLap.some((m) => m.includes('PC-Fisso guarda le mie chat via Drive'))).toBe(true)

    // 3. Chi guarda, dopo qualche secondo, legge le chat e lo schermo come da vicino.
    orologio += 10_000
    const stato = await cassetta.chiama('lap', '/api/stato')
    expect(stato).toEqual({ stato: 200, corpo: { chat: [{ id: '7', sessione: 's-trading', titolo: 'Trading', cwd: 'C:\\Trading', aspetta: true, viva: true }], computer: { nome: 'LAPTOP' } } })
    const storia = await cassetta.chiama('lap', '/api/storia', { chat: '7', da: -1, quante: 200 })
    expect(storia.stato).toBe(200)
    expect((storia.corpo as { righe: string[]; scritto: string }).righe).toEqual(['> fatto, aspetto'])
    expect((storia.corpo as { scritto: string }).scritto).toBe('2026-10-02T12:00:00.000Z')

    // 4. Un messaggio: una voce nella cassetta del portatile, per quella chat precisa.
    const scrivi = await cassetta.chiama('lap', '/api/scrivi', { chat: '7', testo: 'continua con i test' })
    expect(scrivi).toEqual({ stato: 200, corpo: { fatto: true, viaDrive: true } })
    const posta = drive.dati.get(nomePosta('lap')) as Posta
    expect(posta.voci[0]).toMatchObject({ testo: 'continua con i test', cwd: 'C:\\Trading', sessione: 's-trading', stato: 'attesa', daNome: 'PC-Fisso' })

    // 5. Il giro svelto del portatile (chi lo guarda c'è) consegna nella chat.
    await lap.giroVeloce()
    expect(scritti).toEqual([{ id: '7', testo: 'continua con i test' }])

    // 6. Quello che via Drive non si può fare lo dice, senza provarci.
    const scegli = await cassetta.chiama('lap', '/api/scegli', { chat: '7', opzione: 'Sì' })
    expect(scegli.stato).toBe(NON_VIA_DRIVE)
    expect(String((scegli.corpo as { errore: string }).errore)).toContain('premere un’opzione')
  })

  it('nessuno guarda: il portatile non scrive lo schermo e il giro svelto non fa niente', async () => {
    const drive = scatolaInMemoria()
    let foto = 0
    const lap = creaPostino({
      scatola: () => drive, pcId: () => 'lap', pcNome: () => 'LAPTOP', versione: () => '0.40.0',
      chat: () => [], cartelle: () => [], cartellaEsiste: () => true,
      apriChat: () => undefined, riprendiChat: () => undefined, scrivi: () => undefined,
      fotografa: async () => { foto += 1; return [] }
    })
    await lap.giro()
    await lap.giroVeloce()
    expect(foto).toBe(0)
    expect(drive.dati.has('schermo-lap')).toBe(false)
  })

  it('uno schermo vecchio non vale come «adesso»: si torna ad aspettare', async () => {
    const drive = scatolaInMemoria()
    let orologio = Date.parse('2026-10-02T12:00:00Z')
    drive.dati.set('schermo-lap', { scritto: '2026-10-02T11:50:00.000Z', nome: 'LAPTOP', chat: [] })
    const cassetta = creaCassettaDrive({
      scatola: () => drive, io: () => 'fisso', mioNome: () => 'PC-Fisso', nomeDi: () => 'LAPTOP',
      aggiungiPosta: async () => undefined, adesso: () => orologio
    })
    expect((await cassetta.chiama('lap', '/api/stato')).stato).toBe(ATTESA_DRIVE)
    orologio += 1000
    // Senza Drive: niente cassetta, detto chiaro.
    const senza = creaCassettaDrive({ scatola: () => undefined, io: () => 'fisso', mioNome: () => 'x', nomeDi: () => 'LAPTOP', aggiungiPosta: async () => undefined })
    expect((await senza.chiama('lap', '/api/stato')).stato).toBe(503)
  })
})
