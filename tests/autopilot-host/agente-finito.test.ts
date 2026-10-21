import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { agenteFinito, daChiudereDaSole, FINITA_SI_CHIUDE_MS } from '../../src/autopilot-host/posti'
import { creaConsegne } from '../../src/autopilot-host/consegne'
import { esecutoreNelMosaico } from '../../src/autopilot-host/nel-mosaico'
import { leggiConsegne } from '../../src/main/autopilota-consegne'
import { nelRecuperoQuandoChiusa } from '../../src/main/agente-finito'
import { governataDa, type EsitoAzioni } from '@shared/gestione-chat'
import { nuovoAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'

// 0.84.0 — Agente finito: compito fatto e ramo unito o tolto, la chat si chiude
// da sola, esce dall'elenco e la conversazione va nel recupero di 30 giorni.

const ORA = Date.parse('2026-10-21T12:00:00.000Z')
const iso = (ms: number): string => new Date(ms).toISOString()
const PRIMA = iso(ORA - FINITA_SI_CHIUDE_MS - 60_000)

function autopilota(over: Partial<Autopilota> & { id: string }): Autopilota {
  return {
    ...nuovoAutopilota({ id: over.id, nome: over.id, obiettivo: 'o', cwd: 'C:\\Progetti\\Esempio', criteri: [{ descrizione: 'i test passano', comando: 'npm test', soddisfatto: false }], iniziatoIl: iso(ORA - 3_600_000) }),
    stato: 'lavoro',
    ultimoEvento: iso(ORA),
    ...over
  }
}
const chat = (id: string, stato: ChatGovernata['stato'], over: Partial<ChatGovernata> = {}): ChatGovernata =>
  ({ id, compito: `compito ${id}`, stato, cicli: 1, sessionId: `s-${id}`, dal: PRIMA, ...over })
const unito = { il: PRIMA, come: 'unito' as const }

describe('agente finito: la regola (puro)', () => {
  it('finita col ramo unito, tolto o approvato: sì; finita in revisione o al lavoro: no', () => {
    const a = autopilota({ id: 'a', chats: [] })
    expect(agenteFinito(a, chat('c-1', 'finita', { conclusa: unito }))).toBe(true)
    expect(agenteFinito(a, chat('c-2', 'finita', { conclusa: { il: PRIMA, come: 'tolto' } }))).toBe(true)
    expect(agenteFinito(a, chat('c-3', 'finita', { approvata: true }))).toBe(true)
    // Finita ma il ramo aspetta la Revisione: può essere rimandata indietro.
    expect(agenteFinito(a, chat('c-4', 'finita'))).toBe(false)
    expect(agenteFinito(a, chat('c-5', 'lavoro', { conclusa: unito }))).toBe(false)
    expect(agenteFinito(a, chat('c-6', 'bloccata', { conclusa: unito }))).toBe(false)
  })

  it('mai una adottata, mai la chat dell autopilota, mai due volte', () => {
    const a = autopilota({ id: 'a', sessionId: 's-c-2', adottate: [{ sessionId: 's-c-1', titolo: 'di Nicholas', adottataIl: PRIMA }] })
    expect(agenteFinito(a, chat('c-1', 'finita', { conclusa: unito }))).toBe(false)
    expect(agenteFinito(a, chat('c-2', 'finita', { conclusa: unito }))).toBe(false)
    expect(agenteFinito(a, chat('c-3', 'finita', { conclusa: unito, nelRecupero: PRIMA }))).toBe(false)
  })

  it('la Revisione si chiude solo quando il ramo che rivedeva è approvato', () => {
    const autore = chat('c-1', 'finita')
    const rev = chat('c-2', 'finita', { ruolo: 'revisione', revisioneDi: 'c-1' })
    expect(agenteFinito(autopilota({ id: 'a', chats: [autore, rev] }), rev)).toBe(false)
    const approvato = { ...autore, approvata: true }
    expect(agenteFinito(autopilota({ id: 'a', chats: [approvato, rev] }), rev)).toBe(true)
  })

  it('a lavoro finito tutto, l ultima chat rimasta «lavoro» col ramo unito conta', () => {
    const c = chat('c-1', 'lavoro', { conclusa: unito })
    expect(agenteFinito(autopilota({ id: 'a', stato: 'finito', chats: [c] }), c)).toBe(true)
  })

  it('daChiudereDaSole: anche spenta va nel recupero, mai mentre lavora, dopo il tempo di leggere', () => {
    const a = autopilota({ id: 'a', chats: [chat('c-1', 'finita', { conclusa: unito }), chat('c-2', 'finita', { conclusa: unito }), chat('c-3', 'finita', { conclusa: unito, dal: iso(ORA - 60_000) })] })
    const accese = [{ sessione: 's-c-2', ferma: false }, { sessione: 's-c-3', ferma: true }]
    const fuori = daChiudereDaSole({ autopiloti: [a], accese, ora: ORA, domandeAperte: () => 0 })
    // c-1 spenta: va nel recupero lo stesso. c-2 sta scrivendo: no. c-3 ha appena finito: non ancora.
    expect(fuori).toEqual([{ autopilotaId: 'a', chatId: 'c-1', sessionId: 's-c-1', motivo: 'ha finito e il suo ramo è unito', alRecupero: true }])
  })

  it('una finita senza ramo chiuso si chiude come prima, senza recupero', () => {
    const a = autopilota({ id: 'a', chats: [chat('c-1', 'finita')] })
    const fuori = daChiudereDaSole({ autopiloti: [a], accese: [{ sessione: 's-c-1', ferma: true }], ora: ORA, domandeAperte: () => 0 })
    expect(fuori).toHaveLength(1)
    expect(fuori[0]!.alRecupero).toBeUndefined()
  })

  it('i campi nuovi sopravvivono al disco', () => {
    const a = autopilota({ id: 'a', chats: [chat('c-1', 'finita', { conclusa: unito, nelRecupero: PRIMA })] })
    const disco = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-finito-')))
    disco.scrivi(a)
    expect(disco.leggi('a')?.chats[0]).toMatchObject({ conclusa: unito, nelRecupero: PRIMA })
  })
})

describe('agente finito: il servizio', () => {
  let server: ServerAutopiloti | undefined
  let archivio: Archivio
  let chiuse: Array<{ chat?: string; sessione: string; alRecupero?: boolean }>
  let porta = 0
  afterEach(() => { server?.close(); server = undefined })

  it('chiude la chat e la manda nel recupero una volta sola, con la riga nella conversazione', async () => {
    archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-finito-')))
    chiuse = []
    server = creaServer({
      archivio,
      esegui: () => Promise.resolve({ codice: 1, uscita: 'rosso' }),
      interroga: () => Promise.resolve({ testo: '{}', sessionId: 'sup' }),
      avviaLavoro: () => Promise.resolve(),
      fermaLavoro: () => {},
      avvisa: () => Promise.resolve(),
      domande: creaRegistroDomande({ adesso: () => ORA }),
      scadenzaDomandaMs: 5000,
      scadenzaInterviataMs: 5000,
      adesso: () => iso(ORA),
      misuraPc: () => ({ processori: 8, memoriaLiberaMb: 9_000, memoriaTotaleMb: 16_384, caricoPercento: 10 }),
      chiudiChat: (_id, chatId, chi) => { chiuse.push({ ...(chatId !== undefined ? { chat: chatId } : {}), sessione: chi.sessionId, ...(chi.alRecupero === true ? { alRecupero: true } : {}) }) }
    })
    const s = server
    await new Promise<void>((ris) => { s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }) })
    archivio.scrivi(autopilota({
      id: 'ap-a',
      chats: [chat('c-1', 'finita', { conclusa: unito }), chat('c-2', 'lavoro'), chat('c-3', 'finita', { conclusa: unito })],
      adottate: [{ sessionId: 's-c-3', titolo: 'di Nicholas', adottataIl: PRIMA }]
    }))
    const stato = {
      letto: ORA,
      limiti: { cinqueOre: { percento: 5, lettoIl: ORA } },
      chat: [
        { titolo: 'c-1', cwd: 'x', stato: 'lavoro', governata: true, sessione: 's-c-1', ferma: true },
        { titolo: 'c-2', cwd: 'x', stato: 'lavoro', governata: true, sessione: 's-c-2', ferma: false }
      ],
      domandeAperte: 0, progetti: [], altriPc: []
    }
    await fetch(`http://127.0.0.1:${porta}/stato-programma`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(stato) })
    s.controllaChatFerme()
    expect(chiuse).toEqual([{ chat: 'c-1', sessione: 's-c-1', alRecupero: true }])
    const a = archivio.leggi('ap-a')!
    expect(a.chats.find((c) => c.id === 'c-1')!.nelRecupero).toBe(iso(ORA))
    // L'adottata non è nostra: non si tocca.
    expect(a.chats.find((c) => c.id === 'c-3')!.nelRecupero).toBeUndefined()
    const riga = a.decisioni.find((d) => d.cosa.includes('chiudo la chat c-1'))
    expect(riga?.cosa).toContain('recupero per 30 giorni')
    expect(riga?.traguardo).toEqual({ chat: 'c-1', esito: 'nel-recupero' })
    // Il giro dopo non la rimanda, anche se è ancora accesa.
    s.controllaChatFerme()
    expect(chiuse).toHaveLength(1)
  })

  it('la consegna «chiudi» porta alRecupero fino al programma', () => {
    const consegne = creaConsegne()
    const e = esecutoreNelMosaico({ consegne, nuovaSessione: () => 's-nuova', ricorda: () => {} })
    e.chiudi('ap-1', 'c-1', { sessionId: 's-c-1', workspace: 'Lavoro', alRecupero: true })
    const fuori = consegne.ritira().filter((c) => c.cosa === 'chiudi')
    expect(fuori[0]).toMatchObject({ sessionId: 's-c-1', alRecupero: true })
    const lette = leggiConsegne({ consegne: [...fuori, { ...fuori[0], id: 'c-x', cosa: 'scrivi', testo: 'ciao', alRecupero: true }] })
    expect(lette[0]!.alRecupero).toBe(true)
    // Solo con «chiudi»: su una consegna da scrivere non vuol dire niente.
    expect(lette[1]!.alRecupero).toBeUndefined()
  })
})

describe('agente finito: il programma', () => {
  it('una chat mandata nel recupero non è più «governata»: la gestione la può togliere', () => {
    const ap = { id: 'a', nome: 'Lavoro', stato: 'lavoro', chats: [{ sessionId: 'S-1', nelRecupero: PRIMA }, { sessionId: 'S-2' }] }
    expect(governataDa([ap], 'S-1')).toBeUndefined()
    expect(governataDa([ap], 'S-2')).toEqual({ autopilota: 'Lavoro', attivo: true })
  })

  const esito = (ok: boolean, motivo?: string): EsitoAzioni => ({ azione: 'elimina', esiti: [{ sessione: 's', ok, ...(motivo !== undefined ? { motivo } : {}) }], fatte: ok ? 1 : 0, rifiutate: ok ? 0 : 1, messaggio: '' })

  it('aspetta che la finestra chiuda il riquadro, poi la mette nel recupero con «Elimina dal PC»', async () => {
    const chieste: unknown[] = []
    const risposte = [esito(false, '«x» è aperta e ti aspetta: chiudila prima con «Chiudi».'), esito(true)]
    const log: string[] = []
    const r = await nelRecuperoQuandoChiusa('s', {
      azione: (q) => { chieste.push(q); return Promise.resolve(risposte.shift()!) },
      attendi: () => Promise.resolve(),
      log: (x) => { log.push(x) }
    })
    expect(r).toEqual({ ok: true })
    expect(chieste).toEqual([{ azione: 'elimina', sessioni: ['s'], da: 'autopilota: aveva finito' }, { azione: 'elimina', sessioni: ['s'], da: 'autopilota: aveva finito' }])
    expect(log.join('\n')).toContain('nel recupero per 30 giorni')
  })

  it('una chat che lavora non si tocca: dopo i tentativi resta dov è, e lo dice', async () => {
    let n = 0
    const log: string[] = []
    const r = await nelRecuperoQuandoChiusa('s', {
      azione: () => { n += 1; return Promise.resolve(esito(false, '«x» sta lavorando: aspetta che finisca, poi chiudila.')) },
      attendi: () => Promise.resolve(),
      log: (x) => { log.push(x) }
    }, { tentativi: 3 })
    expect(r.ok).toBe(false)
    expect(n).toBe(3)
    expect(log.join('\n')).toContain('resta fra le chiuse')
  })

  it('senza file qui non riprova', async () => {
    let n = 0
    const r = await nelRecuperoQuandoChiusa('s', {
      azione: () => { n += 1; return Promise.resolve(esito(false, 'Questa chat non ha file su questo PC: non c’è niente da eliminare qui.')) },
      attendi: () => Promise.resolve(),
      log: () => {}
    })
    expect(r.ok).toBe(false)
    expect(n).toBe(1)
  })
})
