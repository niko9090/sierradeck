import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { domandaDaNonFare, scartaSeNonVa } from '../../src/autopilot-host/gesti-a-mano'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande, type RegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { gestoAMano, nomeInterno, noteDiChiarezza } from '@shared/domanda-chiara'
import { partiBloccato, partiPubblica, testoDomanda, validaDomanda, type PartiDomanda } from '@shared/domanda-strutturata'
import { nuovoAutopilota, type ChatGovernata } from '@shared/autopilota'
import { attendi } from '../setup/attendi'
import { orologioDa } from '../setup/orologio'

// L'orologio del servizio di prova parte da un istante fisso e avanza col
// tempo vero: le attese funzionano come prima, il giorno non cambia mai.
const orologio = orologioDa('2026-10-29T10:00:00.000Z')

/**
 * Mai un gesto a mano (0.84.3). Il caso vero del 22/10, dalla scheda Domande
 * di Nicholas: autopilota «Proposte di migliorie», con le due scelte.
 */
const VERA: PartiDomanda = {
  staFacendo: 'Il lavoro è finito, ma un criterio non si lascia misurare e il programma non mi lascia chiudere.',
  domanda: 'Chiudi tu a mano l’autopilota del gestionale, visto che il programma non mi lascia né chiuderlo né correggere il controllo del gruppo 3?',
  perche: 'Ho provato a correggere il comando del criterio e il programma l’ha rifiutato.',
  scelte: [
    { scelta: 'Sì, lo chiudo io', conseguenza: 'chiudi tu l’autopilota dalla scheda', consigliata: true },
    { scelta: 'Correggo io il comando', conseguenza: 'mi scrivi il comando giusto e lo rimisuro' }
  ],
  seNonRispondi: 'resto fermo ad aspettare'
}

/** Domande buone che devono passare: nessun gesto, nessun nome interno. */
const BUONE: PartiDomanda[] = [
  partiPubblica('SierraDeck', true),
  partiBloccato({ lavoro: 'Fai passare i test', falliti: [{ descrizione: 'I test passano' }], tentativi: 6, strade: ['dividi', 'ricomincia'], errori: 'npm test: 3 falliti', ultimaStrada: true, continua: true }),
  { ...VERA, domanda: 'Installo la 0.80.0 adesso?', scelte: [{ scelta: 'la installo io', conseguenza: 'aspetto che tu la installi', consigliata: true }, { scelta: 'non adesso', conseguenza: 'aspetto' }] },
  { ...VERA, domanda: 'Uso la porta 8080 per l’emulatore?', scelte: [{ scelta: 'sì', conseguenza: 'la uso', consigliata: true }, { scelta: 'ti dico io la porta', conseguenza: 'aspetto il numero' }] },
  { ...VERA, domanda: 'Chiudo lo stesso questo ciclo di NexoraOS o aspetto la tua prova sulla NAS?', scelte: [{ scelta: 'chiudi lo stesso', conseguenza: 'lo chiudo', consigliata: true }, { scelta: 'aspetta', conseguenza: 'aspetto' }] }
]

describe('il controllo riconosce i gesti a mano', () => {
  it('22/10 dal vero: la domanda e tutte e due le scelte', () => {
    expect(gestoAMano(VERA)).toBe('Chiudi tu a mano')
    expect(gestoAMano({ domanda: 'x', scelte: [VERA.scelte[0]!] })).toBe('chiudo io')
    expect(gestoAMano({ domanda: 'x', scelte: [VERA.scelte[1]!] })).toBe('Correggo io')
    expect(nomeInterno(VERA.domanda)).toBe('gruppo 3')
  })
  it('09/10 dal vero: «Puoi modificare a mano nella scheda…», «Incollo il comando a mano»', () => {
    expect(gestoAMano({ domanda: 'Puoi modificare a mano nella scheda il comando del criterio, oppure eliminare quel criterio?', scelte: [] })).toBeDefined()
    expect(gestoAMano({ domanda: 'Come procedo?', scelte: [{ scelta: 'Incollo il comando a mano', conseguenza: 'x' }] })).toBeDefined()
    expect(gestoAMano({ domanda: 'Come procedo?', scelte: [{ scelta: 'Elimino io il criterio dalla scheda', conseguenza: 'x' }] })).toBeDefined()
  })
  it('le altre gestualità della richiesta: spostare, cancellare, lanciare', () => {
    for (const d of ['Sposta tu la chat nel workspace giusto?', 'Puoi cancellare la cartella vecchia?', 'Lanci tu la build Android?', 'Devi correggere tu il test?']) {
      expect(gestoAMano({ domanda: d, scelte: [] }), d).toBeDefined()
    }
  })
  it('le domande buone passano: installare resta di Nicholas, «ti dico io» è una decisione', () => {
    for (const p of BUONE) {
      expect(gestoAMano(p), p.domanda).toBeUndefined()
      expect(scartaSeNonVa(p), p.domanda).toBeUndefined()
    }
  })
  it('le note di chiarezza la mandano a riscrivere, con il perché', () => {
    const note = noteDiChiarezza(VERA).join(' ')
    expect(note).toContain('mai chiedere a Nicholas un gesto a mano')
    expect(note).toContain('«gruppo 3»')
    expect(validaDomanda(VERA).completa).toBe(false)
  })
})

describe('se anche riscritta chiede un gesto, non arriva a Nicholas', () => {
  it('22/10: scartata, e la chat riceve la strada senza Nicholas (nessuna scelta presa al suo posto)', () => {
    const s = scartaSeNonVa(VERA)!
    expect(s).toBeDefined()
    expect(s.riga).toContain('non la chiedo a Nicholas: chiedeva un gesto a mano («Chiudi tu a mano»)')
    expect(s.perLaChat).toContain('lo giudica l’autopilota e il lavoro si chiude da solo')
    expect(s.perLaChat).not.toContain('Sì, lo chiudo io →')
  })
  it('le domande già aperte di questo tipo sono superate, con la strada', () => {
    expect(domandaDaNonFare(VERA)?.motivo).toContain('gesto a mano')
    const vecchia = { ...VERA, domanda: 'Chiudo lo stesso il lavoro, o correggi prima il comando di verifica che non parte?' }
    expect(domandaDaNonFare(vecchia)?.motivo).toContain('si chiude da solo')
    for (const p of BUONE) expect(domandaDaNonFare(p), p.domanda).toBeUndefined()
  })
})

/* ------------------------------------------------------------------ */
/* Nel servizio.                                                       */
/* ------------------------------------------------------------------ */

let server: ServerAutopiloti | undefined
let porta: number
let archivio: Archivio
let registro: RegistroDomande
let scritti: { chat?: string; messaggio?: string }[]

const chat = (id: string, compito: string, stato: ChatGovernata['stato'] = 'lavoro'): ChatGovernata => ({ id, compito, stato, cicli: 1, sessionId: `s-${id}` })

async function avvia(p: { interroga: () => Promise<{ testo: string }>; chats: ChatGovernata[]; stato?: 'lavoro' | 'attesa' }): Promise<void> {
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-gesti-')))
  registro = creaRegistroDomande({ adesso: orologio.ms })
  scritti = []
  const s = creaServer({
    archivio,
    memoria: apriMemoria(undefined),
    esegui: () => Promise.resolve({ codice: 0, uscita: 'ok' }),
    interroga: p.interroga,
    avviaLavoro: (_a, messaggio, c) => {
      scritti.push({ ...(c !== undefined ? { chat: c.id } : {}), ...(messaggio !== undefined ? { messaggio } : {}) })
      return Promise.resolve()
    },
    fermaLavoro: () => {},
    avvisa: () => Promise.resolve(),
    domande: registro,
    // 0.86.2: «idle_prompt» è una domanda solo se l'ultimo messaggio ne fa una.
    ultimoDetto: () => `Ho finito, ma il programma non mi lascia chiudere.

Come vado avanti?`,
    scadenzaDomandaMs: 5000,
    scadenzaInterviataMs: 5000,
    adesso: orologio.iso
  })
  server = s
  await new Promise<void>((ris) => { s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }) })
  archivio.scrivi({
    ...nuovoAutopilota({ id: 'ap-mig', nome: 'Proposte di migliorie', obiettivo: 'Proposte di migliorie per il gestionale', cwd: process.cwd(), criteri: [{ descrizione: 'c', comando: 'node c.js', soddisfatto: false }], iniziatoIl: '2026-10-22T06:00:00.000Z' }),
    stato: p.stato ?? 'lavoro',
    chats: p.chats
  })
}

afterEach(() => { server?.close(); server = undefined })

describe('nel servizio', () => {
  it('22/10: la domanda con il gesto a mano non si apre; la chat riparte con la strada', async () => {
    await avvia({ interroga: () => Promise.resolve({ testo: JSON.stringify({ azione: 'chiedi', domanda: VERA }) }), chats: [chat('c-3', 'Proposte di migliorie per il gestionale')] })
    await fetch(`http://127.0.0.1:${porta}/hook/notification?ap=ap-mig&chat=c-3`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notification_type: 'idle_prompt', message: 'Claude is waiting for your input' })
    })
    expect(registro.aperte('ap-mig')).toEqual([])
    await attendi(() => scritti.length > 0)
    expect(scritti[0]).toMatchObject({ chat: 'c-3' })
    expect(scritti[0]?.messaggio).toContain('Non lo chiedo a Nicholas')
    expect(archivio.leggi('ap-mig')!.decisioni.at(-1)?.cosa).toContain('non la chiedo a Nicholas')
    expect(registro.risolte('ap-mig')[0]?.risposta).toContain('non chiesta')
  })

  it('la domanda già aperta del 22/10 si chiude come superata, e la chat bloccata riparte', async () => {
    await avvia({ interroga: () => Promise.reject(new Error('no')), chats: [chat('c-3', 'Proposte di migliorie per il gestionale', 'bloccata')] })
    const d = registro.apri({ autopilotaId: 'ap-mig', testo: testoDomanda('Proposte di migliorie', VERA), scadenzaMs: 5000, parti: VERA, opzioni: VERA.scelte.map((s) => s.scelta) })
    registro.ricorda(d.id, { autopilotaId: 'ap-mig', testo: d.testo, grezza: VERA.domanda, chatId: 'c-3' })
    const buona = registro.apri({ autopilotaId: 'ap-mig', testo: 'Uso la porta 8080 per l’emulatore?', scadenzaMs: 5000 })
    registro.ricorda(buona.id, { autopilotaId: 'ap-mig', testo: buona.testo, chatId: 'c-3' })

    expect(await server!.ricontrollaDomande()).toBe(1)
    expect(registro.aperte('ap-mig').map((x) => x.id)).toEqual([buona.id])
    expect(registro.risolte('ap-mig')[0]?.risposta).toContain('gesto a mano')
    expect(archivio.leggi('ap-mig')!.chats[0]?.stato).toBe('lavoro')
    await attendi(() => scritti.length > 0)
    expect(scritti[0]?.messaggio).toContain('Non serve più chiederlo a Nicholas')
    expect(await server!.ricontrollaDomande()).toBe(0)
  })

  it('con una chat sola: «chiudo lo stesso o correggi il comando?» si chiude e l’autopilota riparte', async () => {
    await avvia({ interroga: () => Promise.reject(new Error('no')), chats: [], stato: 'attesa' })
    const vecchia = { ...VERA, domanda: 'Chiudo lo stesso il lavoro, o correggi prima il comando di verifica che non parte?' }
    const d = registro.apri({ autopilotaId: 'ap-mig', testo: testoDomanda('Proposte di migliorie', vecchia), scadenzaMs: 5000, parti: vecchia })
    registro.ricorda(d.id, { autopilotaId: 'ap-mig', testo: d.testo })

    expect(await server!.ricontrollaDomande()).toBe(1)
    expect(registro.aperte('ap-mig')).toEqual([])
    expect(archivio.leggi('ap-mig')!.stato).toBe('lavoro')
    await attendi(() => scritti.length > 0)
    expect(scritti[0]?.messaggio).toContain('il lavoro si chiude da solo')
  })
})
