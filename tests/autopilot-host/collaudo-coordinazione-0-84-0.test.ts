import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { agenteFinito, daChiudereDaSole, FINITA_SI_CHIUDE_MS } from '../../src/autopilot-host/posti'
import { chiHaGia, codaSenzaDoppioni, quadroFlotta, rigaSegnale, segnaleDiFineTurno, senzaRigaSegnale } from '@shared/segnali-flotta'
import { nuovoAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'

// Collaudo 0.84.0 (c-66, 21/10): controllo e coordinazione dell'autopilota e
// agente finito, sui casi veri del 20-21/10 (c-34, c-52 e la flotta di
// ap-f1e631f5). I test `it.fails` sono DIFETTI APERTI del prodotto, descritti
// in `.sierradeck/quaderno/collaudo-coordinazione-0-84-0.md`: quando il
// difetto è corretto il test diventa rosso, e allora si toglie `.fails`.

const ORA = Date.parse('2026-10-21T12:00:00.000Z')
const iso = (ms: number): string => new Date(ms).toISOString()
const PRIMA = iso(ORA - FINITA_SI_CHIUDE_MS - 60_000)
const unito = { il: PRIMA, come: 'unito' as const }

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

describe('collaudo: il segnale di fine turno', () => {
  const sorelle = ['c-1', 'c-2', 'c-3']

  it('le quattro forme dette nella regola si leggono', () => {
    expect(rigaSegnale('Ho fatto.\nSEGNALE: fatto — test verdi', sorelle, 'c-1')).toMatchObject({ tipo: 'fatto', motivo: 'test verdi' })
    expect(rigaSegnale('SEGNALE: bloccata — manca la chiave del Drive', sorelle, 'c-1')).toMatchObject({ tipo: 'bloccata', motivo: 'manca la chiave del Drive' })
    expect(rigaSegnale('SEGNALE: aspetto c-2', sorelle, 'c-1')).toMatchObject({ tipo: 'aspetto', di: 'c-2' })
    expect(rigaSegnale('SEGNALE: aspetto — la release su GitHub', sorelle, 'c-1')).toMatchObject({ tipo: 'aspetto', cosa: 'la release su GitHub' })
    expect(rigaSegnale('SEGNALE: avanti — scrivo i test', sorelle, 'c-1')).toMatchObject({ tipo: 'avanti', motivo: 'scrivo i test' })
  })

  it('bloccata senza motivo lo dice; aspettare sé stessa o una chat che non c è non è una sorella', () => {
    expect(rigaSegnale('SEGNALE: bloccata', sorelle, 'c-1')).toMatchObject({ tipo: 'bloccata', motivo: 'non ha detto il motivo' })
    expect(rigaSegnale('SEGNALE: aspetto c-1', sorelle, 'c-1')?.di).toBeUndefined()
    expect(rigaSegnale('SEGNALE: aspetto c-99', sorelle, 'c-1')?.di).toBeUndefined()
  })

  it('una parola che comincia come un segnale non è un segnale («fattore»)', () => {
    expect(rigaSegnale('SEGNALE: fattore di scala', sorelle, 'c-1')).toBeUndefined()
  })

  it('senza la riga: «aspetto c-2» detto a parole vale, se no «avanti» non dichiarato', () => {
    expect(segnaleDiFineTurno('Lavoro fatto a metà.', { sorelle, me: 'c-1', quando: PRIMA })).toEqual({ tipo: 'avanti', quando: PRIMA, dichiarato: false })
    expect(segnaleDiFineTurno('Aspetto c-2.', { sorelle, me: 'c-1', quando: PRIMA, aspettaDi: 'c-2' })).toEqual({ tipo: 'aspetto', di: 'c-2', quando: PRIMA, dichiarato: false })
  })

  it('la riga tutta in grassetto o fra apici si legge lo stesso', () => {
    expect(rigaSegnale('**SEGNALE: fatto** — tutto committato', sorelle, 'c-1')?.tipo).toBe('fatto')
    expect(rigaSegnale('`SEGNALE: bloccata — gradle non parte`', sorelle, 'c-1')?.tipo).toBe('bloccata')
  })

  // DIFETTO D3: `**SEGNALE:** fatto` (grassetto solo sull'etichetta) viene
  // TOLTO dal messaggio da `senzaRigaSegnale`, ma `rigaSegnale` non lo legge:
  // il segnale vale «avanti» e il «fatto» si perde. Causa: `pulisci` toglie gli
  // asterischi solo in testa e in coda alla riga (src/shared/segnali-flotta.ts:62),
  // la regex di riga 72 vuole i due punti subito dopo «SEGNALE».
  it('D3: «**SEGNALE:** fatto» (grassetto sull etichetta) si legge come fatto', () => {
    const msg = 'Ho finito il pezzo.\n**SEGNALE:** fatto — test verdi'
    // Il programma la toglie come riga di segnale…
    expect(senzaRigaSegnale(msg)).toBe('Ho finito il pezzo.')
    // …quindi deve anche leggerla.
    expect(rigaSegnale(msg, sorelle, 'c-1')?.tipo).toBe('fatto')
    expect(rigaSegnale('**SEGNALE**: bloccata — gradle non parte', sorelle, 'c-1')).toMatchObject({ tipo: 'bloccata', motivo: 'gradle non parte' })
    expect(senzaRigaSegnale('Ok.\n**SEGNALE**: avanti')).toBe('Ok.')
  })
})

describe('collaudo: il quadro in un punto solo', () => {
  it('prima le bloccate, poi chi aspetta, poi chi ha finito; le chiuse si contano', () => {
    const q = quadroFlotta([
      chat('c-1', 'lavoro', { segnale: { tipo: 'avanti', quando: iso(ORA), dichiarato: true } }),
      chat('c-2', 'lavoro', { segnale: { tipo: 'fatto', quando: iso(ORA), dichiarato: true } }),
      chat('c-3', 'bloccata', { segnale: { tipo: 'bloccata', motivo: 'manca la chiave', quando: iso(ORA - 3 * 60_000), dichiarato: true } }),
      chat('c-4', 'lavoro', { segnale: { tipo: 'aspetto', di: 'c-3', quando: iso(ORA), dichiarato: true } }),
      chat('c-5', 'finita'),
      chat('c-6', 'finita')
    ], ORA, 'c-1')
    const righe = q.filter((r) => r.startsWith('- c-'))
    expect(righe.map((r) => r.slice(2, 5))).toEqual(['c-3', 'c-4', 'c-2', 'c-1'])
    expect(righe[0]).toContain('bloccata: manca la chiave (3 min fa)')
    expect(righe[3]).toContain('(questa)')
    expect(q).toContain('- Chiuse: 2.')
    expect(q.at(-1)).toContain('Decidi tu')
  })
})

describe('collaudo: nessun lavoro dato due volte', () => {
  it('lo stesso compito scritto diverso (maiuscole, accenti, punteggiatura) è un doppione', () => {
    const chats = [chat('c-1', 'lavoro', { compito: 'Controllo delle domande (0.82.0): perché' })]
    expect(chiHaGia('controllo delle DOMANDE 0.82.0 — perche', chats)).toBe('c-1')
  })

  it('un compito già fatto da una chat chiusa non si rida; un avvio fallito e una Revisione sì', () => {
    const chats = [
      chat('c-1', 'finita', { compito: 'A', approvata: true, cicli: 4 }),
      chat('c-2', 'finita', { compito: 'B', cicli: 0 }),
      chat('c-3', 'finita', { compito: 'Rivedi il ramo x', ruolo: 'revisione', cicli: 2 })
    ]
    const r = codaSenzaDoppioni(['A', 'B', 'Rivedi il ramo x', 'C', 'c'], chats)
    expect(r.compiti).toEqual(['B', 'Rivedi il ramo x', 'C'])
    expect(r.tolti).toEqual([{ compito: 'A', chi: 'c-1' }, { compito: 'c', chi: 'coda' }])
  })

  it('una chat rimandata (compito con «(rimandato: …)») non blocca il compito rimesso in coda', () => {
    const chats = [chat('c-1', 'finita', { compito: 'Fai la pagina (rimandato: riparte dopo «la chiave»)', cicli: 2 })]
    expect(chiHaGia('Fai la pagina', chats)).toBeUndefined()
  })
})

describe('collaudo: agente finito, i casi del 20-21/10', () => {
  it('c-52 (Rilascio, senza ramo) chiusa con chiudiChat: conclusa → va nel recupero', () => {
    const c52 = chat('c-52', 'finita', { ruolo: 'rilascio', conclusa: unito })
    const a = autopilota({ id: 'a', chats: [c52] })
    expect(agenteFinito(a, c52)).toBe(true)
    expect(daChiudereDaSole({ autopiloti: [a], accese: [], ora: ORA, domandeAperte: () => 0 })).toEqual([
      { autopilotaId: 'a', chatId: 'c-52', sessionId: 's-c-52', motivo: 'ha finito e il suo ramo è unito', alRecupero: true }
    ])
  })

  it('mai una chat che chiede a Nicholas, mai una adottata, mai la chat dell autopilota', () => {
    const a = autopilota({
      id: 'a', sessionId: 's-c-3',
      chats: [chat('c-1', 'bloccata', { conclusa: unito }), chat('c-2', 'finita', { conclusa: unito }), chat('c-3', 'finita', { conclusa: unito })],
      adottate: [{ sessionId: 's-c-2', titolo: 'di Nicholas', adottataIl: PRIMA }]
    })
    const accese = ['s-c-1', 's-c-2', 's-c-3'].map((sessione) => ({ sessione, ferma: true }))
    const fuori = daChiudereDaSole({ autopiloti: [a], accese, ora: ORA, domandeAperte: () => 1 })
    expect(fuori.filter((f) => f.alRecupero === true)).toEqual([])
    expect(fuori.map((f) => f.chatId)).not.toContain('c-1')
    expect(fuori.map((f) => f.chatId)).not.toContain('c-2')
  })

  // DIFETTO D2: una chat di Rilascio (senza ramo) che finisce con il «finito»
  // dell'autopilota (T6) non riceve `conclusa`: in src/autopilot-host/server.ts:3435
  // `conclusa` va solo alle chat con `ramo`. Quindi c-63/c-64 (Rilascio del
  // 21/10) restano fra le chiuse e non vanno mai nel recupero.
  it.fails('D2: a lavoro finito (T6) anche la chat di Rilascio senza ramo è conclusa', () => {
    // Come la lascia T6: tutte «finita», `conclusa` solo a chi ha un ramo.
    const rilascio = chat('c-63', 'finita', { ruolo: 'rilascio' })
    const a = autopilota({ id: 'a', stato: 'finito', chats: [chat('c-61', 'finita', { ramo: 'ap/x/c-61', conclusa: unito }), rilascio] })
    expect(agenteFinito(a, rilascio)).toBe(true)
  })

  // DIFETTO D4: Nicholas rimette una conversazione con «Ripristina» e la apre
  // per leggerla: la chat è accesa e ferma al prompt, ancora `finita` con
  // `nelRecupero`. `daChiudereDaSole` (posti.ts:122) la richiude dopo 5 minuti
  // e poi ogni `RICHIUDI_DOPO_MS`: la conversazione che ha ripreso gli sparisce
  // dallo schermo. La scheda dice «se Nicholas la ripristina, resta dov'è».
  it.fails('D4: una conversazione già mandata nel recupero e riaperta da Nicholas non si richiude', () => {
    const a = autopilota({ id: 'a', chats: [chat('c-34', 'finita', { conclusa: unito, nelRecupero: PRIMA })] })
    const fuori = daChiudereDaSole({ autopiloti: [a], accese: [{ sessione: 's-c-34', ferma: true }], ora: ORA, domandeAperte: () => 0 })
    expect(fuori).toEqual([])
  })
})

describe('collaudo: «Riprendi» su un autopilota finito (il caso c-34)', () => {
  let server: ServerAutopiloti | undefined
  let archivio: Archivio
  let porta = 0
  afterEach(() => { server?.close(); server = undefined })

  async function ambiente(): Promise<{ avviate: string[] }> {
    archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-collaudo-')))
    const avviate: string[] = []
    server = creaServer({
      archivio,
      esegui: () => Promise.resolve({ codice: 1, uscita: 'rosso' }),
      interroga: () => Promise.resolve({ testo: '{"azione": "prosegui", "istruzioni": "vai"}', sessionId: 'sup' }),
      avviaLavoro: (_a, _m, c) => { avviate.push(c?.id ?? '-'); return Promise.resolve() },
      fermaLavoro: () => {},
      avvisa: () => Promise.resolve(),
      domande: creaRegistroDomande({ adesso: () => ORA }),
      scadenzaDomandaMs: 5000,
      scadenzaInterviataMs: 5000,
      adesso: () => iso(ORA)
    })
    const s = server
    await new Promise<void>((ris) => { s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }) })
    return { avviate }
  }

  // DIFETTO D1 (la causa vera di c-34 «lavoro» nell'elenco): il 21/10 alle
  // 03:24 l'autopilota ap-f1e631f5 è «finito» (T6 mette tutte le chat
  // `finita`); alle 06:08 Nicholas preme «Riprendi» e `riprendiAutopilota`
  // (src/autopilot-host/server.ts:2015) rimette a «lavoro» TUTTE le chat,
  // perché `eraFinito` vale per tutte, e le riavvia una per una (riga 2033).
  // c-34, chiusa il 20/10 23:33 col ramo unito, torna «lavoro» (09:48 le
  // arrivano messaggi) finché non la richiude il supervisore alle 15:53.
  // Le chat concluse (ramo unito o tolto, o già nel recupero) devono restare chiuse.
  it.fails('D1: «Riprendi» non riapre le chat che hanno finito col ramo unito', async () => {
    const { avviate } = await ambiente()
    archivio.scrivi(autopilota({
      id: 'ap-a',
      stato: 'finito',
      sessionId: 's-ap',
      chats: [
        chat('c-34', 'finita', { ramo: 'ap/ap-a/c-34', conclusa: unito }),
        chat('c-52', 'finita', { ruolo: 'rilascio', conclusa: unito, nelRecupero: PRIMA }),
        chat('c-1', 'finita', { ramo: 'ap/ap-a/c-1', approvata: true })
      ]
    }))
    const r = await fetch(`http://127.0.0.1:${porta}/autopiloti/ap-a/riprendi`, { method: 'POST' })
    expect(r.status).toBe(200)
    const a = archivio.leggi('ap-a')!
    expect(a.chats.map((c) => `${c.id}:${c.stato}`)).toEqual(['c-34:finita', 'c-52:finita', 'c-1:finita'])
    expect(avviate).toEqual([])
  })

  it('il comportamento di oggi, misurato: «Riprendi» riavvia anche le chat concluse', async () => {
    // Fotografia del difetto D1 (vedi sopra): quando è corretto questo test
    // diventa rosso insieme a D1, e si toglie.
    const { avviate } = await ambiente()
    archivio.scrivi(autopilota({
      id: 'ap-a', stato: 'finito', sessionId: 's-ap',
      chats: [chat('c-34', 'finita', { ramo: 'ap/ap-a/c-34', conclusa: unito }), chat('c-52', 'finita', { ruolo: 'rilascio', conclusa: unito, nelRecupero: PRIMA })]
    }))
    await fetch(`http://127.0.0.1:${porta}/autopiloti/ap-a/riprendi`, { method: 'POST' })
    expect(archivio.leggi('ap-a')!.chats.map((c) => c.stato)).toEqual(['lavoro', 'lavoro'])
    expect(avviate).toEqual(['c-34', 'c-52'])
  })
})
