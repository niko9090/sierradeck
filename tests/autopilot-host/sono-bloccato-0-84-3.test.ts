import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande, type RegistroDomande } from '../../src/autopilot-host/domande'
import { domandaDaNonFare, eVecchiaBloccato, scartaSeNonVa } from '../../src/autopilot-host/gesti-a-mano'
import { chiediBloccato, traccia, type EsitoVerifica } from '../../src/autopilot-host/decisione'
import { serveUltimaStrada, testoUltimaStrada } from '../../src/autopilot-host/ultima-strada'
import {
  nomeControllo, partiBloccato, rispostaBloccato, testoDomanda, validaDomanda,
  SCELTA_DICO_IO, SCELTA_LASCIA_STARE, SCELTA_SOSPENDI, type PartiDomanda
} from '@shared/domanda-strutturata'
import { schedaDaParti, toccoScelta } from '@shared/scheda-domanda'
import { sigleIn } from '@shared/domanda-chiara'
import { nuovoAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'
import { attendi } from '../setup/attendi'
import { orologioDa } from '../setup/orologio'

// L'orologio del servizio di prova parte da un istante fisso e avanza col
// tempo vero: le attese funzionano come prima, il giorno non cambia mai.
const orologio = orologioDa('2026-10-29T10:00:00.000Z')

/**
 * «Sono bloccato» in parole semplici, l'ultima strada con una chat nuova e la
 * domanda che non ferma il lavoro (0.84.3).
 *
 * Il caso vero del 22/10, dalla scheda Domande di Nicholas: «Come vuoi che
 * proceda?» con le scelte «rivedi i criteri / ti dico io la strada /
 * fermati». Non diceva di quale lavoro, né cosa non passava.
 */
const VERA_22_10: PartiDomanda = {
  staFacendo: 'Lavoro a «App Android: analisi, correzioni e allineamento», ma le verifiche continuano a fallire nello stesso modo.',
  domanda: 'Come vuoi che proceda?',
  perche: 'Ho provato 6 volte e ho esaurito le strade che conosco (capire, dubitare della misura, cambiare strada, tornare sul solido): l’esito non cambia.',
  scelte: [
    { scelta: 'rivedi i criteri', conseguenza: 'mi dici quale criterio o comando di verifica è sbagliato e lo cambio, poi riprendo' },
    { scelta: 'ti dico io la strada', conseguenza: 'scrivi la strada da tentare e la passo alla chat così com’è', consigliata: true },
    { scelta: 'fermati', conseguenza: 'sospendo il lavoro; lo riprendi quando vuoi da «Riprendi»' }
  ],
  seNonRispondi: 'resto fermo ad aspettare: non ricomincio a girare a vuoto sugli stessi tentativi'
}

/** Un criterio vero della 0.84.3, con i nomi interni dentro. */
const CRITERIO = '0.84.3 — Domande dalle chat degli altri PC: i difetti D1-D4 sono corretti. I test con «.fails» sono verdi senza il segno'
const ROSSO: EsitoVerifica = { descrizione: CRITERIO, comando: 'npx vitest run tests/main/collaudo.test.ts', passato: false, uscita: 'FAIL tests/main/collaudo.test.ts > D2 la verifica dura troppo\nAssertionError: expected 120000 to be less than 9000' }

const nuove = (lavoro = 'App Android: analisi, correzioni e allineamento', compito?: string): PartiDomanda => partiBloccato({
  lavoro,
  ...(compito !== undefined ? { compito } : {}),
  falliti: [{ descrizione: CRITERIO }],
  tentativi: 6,
  strade: ['capire', 'dubitare della misura', 'cambiare strada', 'tornare sul solido'],
  errori: ROSSO.uscita,
  ultimaStrada: true,
  continua: true
})

describe('la domanda «sono bloccato» si capisce da sola', () => {
  it('22/10 dal vero: la vecchia non diceva lavoro né cosa non passa, e la riconosce il ricontrollo', () => {
    expect(eVecchiaBloccato(VERA_22_10)).toBe(true)
    expect(domandaDaNonFare(VERA_22_10)?.motivo).toContain('non diceva di quale lavoro')
    expect(domandaDaNonFare(VERA_22_10)?.strada).toContain('Rileggi gli errori da capo')
  })

  it('la frase in vista dice il lavoro e il controllo che non passa, senza sigle né nomi interni', () => {
    const p = nuove('App Android c-95', 'Correggi i difetti D1 e D2 del collaudo (c-82)')
    expect(p.domanda).toContain('«App Android»')
    expect(p.domanda).toContain('il controllo «')
    expect(p.domanda).toContain('non passa')
    expect(p.domanda).toMatch(/\?$/)
    expect(p.domanda).not.toMatch(/\bD\d\b/)
    expect(sigleIn([p.domanda, p.staFacendo, ...p.scelte.map((s) => s.scelta)].join('\n'))).toEqual([])
    expect(p.staFacendo).toContain('Correggi i difetti del collaudo')
    expect(p.domanda.length).toBeLessThanOrEqual(200)
  })

  it('un comando che non parte si dice per quello che è', () => {
    const p = partiBloccato({ lavoro: 'Notte', falliti: [{ descrizione: 'la pagina si apre', misurato: false }], tentativi: 6, strade: ['capire'], errori: 'bash: syntax error', ultimaStrada: true, continua: false })
    expect(p.domanda).toBe('«Notte»: il controllo «la pagina si apre» non riesce nemmeno a partire. Come vado avanti?')
  })

  it('passa dallo stesso controllo delle altre domande: completa, nessun gesto a mano, non scartata', () => {
    const p = nuove()
    expect(validaDomanda(p)).toEqual({ completa: true, mancano: [], note: [] })
    expect(scartaSeNonVa(p)).toBeUndefined()
    expect(domandaDaNonFare(p)).toBeUndefined()
  })

  it('le scelte: ognuna dice cosa succede, nessuna chiede a Nicholas un lavoro a mano', () => {
    const p = nuove()
    expect(p.scelte.map((s) => s.scelta)).toEqual([SCELTA_LASCIA_STARE, SCELTA_DICO_IO, SCELTA_SOSPENDI])
    expect(p.scelte.find((s) => s.consigliata === true)?.scelta).toBe(SCELTA_LASCIA_STARE)
    for (const s of p.scelte) expect(s.conseguenza.length).toBeGreaterThan(20)
    expect(p.scelte.map((s) => s.scelta).join(' ')).not.toMatch(/rivedi i criteri|correggi/i)
  })

  it('su PC, pagina e app: sotto ogni tasto si vede cosa succede', () => {
    const s = schedaDaParti('autopilota «App Android» · SierraDeck', nuove())
    expect(s.scelte).toHaveLength(3)
    for (const c of s.scelte) expect(c.conseguenza).toBeDefined()
    expect(s.scelte[0]?.conseguenza).toContain('lo giudico io')
    expect(s.scelte[2]?.conseguenza).toContain('«Riprendi»')
    // Il testo composto (quello che arriva anche agli altri PC e alle app vecchie) le ha tutte.
    expect(testoDomanda('App Android', nuove())).toContain(`• ${SCELTA_LASCIA_STARE} (consigliata) → `)
  })

  it('le risposte riconosciute: un tocco o il testo scritto che comincia uguale', () => {
    expect(rispostaBloccato(SCELTA_LASCIA_STARE)).toBe('lascia')
    expect(rispostaBloccato('sospendi l’autopilota, grazie')).toBe('sospendi')
    expect(rispostaBloccato(SCELTA_DICO_IO)).toBeUndefined()
    expect(rispostaBloccato('prova a togliere la cache')).toBeUndefined()
  })

  it('i nomi dei controlli senza nomi interni', () => {
    expect(nomeControllo('i difetti D1 e D2 del collaudo passano')).toBe('i difetti del collaudo passano')
    expect(nomeControllo('il controllo del gruppo 3 passa')).toBe('il controllo del passa')
  })
})

describe('l’ultima strada, poi la domanda', () => {
  const ap = (chats: ChatGovernata[], decisioni: Autopilota['decisioni'] = []): Autopilota => ({
    ...nuovoAutopilota({ id: 'ap-b', nome: 'App Android', obiettivo: 'x', cwd: '.', criteri: [], iniziatoIl: '2026-10-22T06:00:00.000Z' }),
    chats,
    decisioni
  })
  it('una chat della flotta: la prima volta l’ultima strada, la chat nuova invece chiede', () => {
    expect(serveUltimaStrada(ap([{ id: 'c-1', compito: 'x', stato: 'lavoro', cicli: 1 }]), 'c-1')).toBe(true)
    expect(serveUltimaStrada(ap([{ id: 'c-2', compito: 'x', stato: 'lavoro', cicli: 1, ultimaStrada: true }]), 'c-2')).toBe(false)
  })
  it('una chat sola: una volta sola dopo l’ultima risposta di Nicholas', () => {
    expect(serveUltimaStrada(ap([]), undefined)).toBe(true)
    expect(serveUltimaStrada(ap([], [{ quando: 'x', cosa: 'ultima strada — il controllo «x» non passa' }]), undefined)).toBe(false)
    expect(serveUltimaStrada(ap([], [{ quando: 'x', cosa: 'ultima strada — …' }, { quando: 'y', cosa: 'risposta dell utente (pc): prova così' }]), undefined)).toBe(true)
  })
  it('le istruzioni dell’ultima strada: rileggere gli errori da capo, niente domande a Nicholas', () => {
    const b = chiediBloccato(ap([]), 6, [ROSSO]).bloccato!
    const t = testoUltimaStrada(b, { nuova: true, ramo: 'ap/ap-b/c-1', compito: 'Correggi i difetti' })
    expect(t).toContain('Sei una chat nuova')
    expect(t).toContain('ap/ap-b/c-1')
    expect(t).toContain('Rileggi gli errori da capo')
    expect(t).toContain('AssertionError: expected 120000')
    expect(t).toContain('tu non chiedere niente')
  })
})

/* ------------------------------------------------------------------ */
/* Nel servizio.                                                       */
/* ------------------------------------------------------------------ */

let server: ServerAutopiloti | undefined
let porta: number
let archivio: Archivio
let registro: RegistroDomande
let avviati: { chat?: string; messaggio?: string }[]
let fermati: string[]
let chiuse: string[]

afterEach(() => { server?.close(); server = undefined })

/** Sei giri identici già nella storia: le strade a gradini sono finite. */
const giriInCerchio = (): Autopilota['decisioni'] =>
  Array.from({ length: 8 }, (_, i) => ({ quando: `2026-10-22T0${i}:00:00.000Z`, cosa: traccia([ROSSO]) }))

async function avviaServizio(chats: ChatGovernata[]): Promise<void> {
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-bloccato-')))
  registro = creaRegistroDomande({ adesso: orologio.ms })
  avviati = []
  fermati = []
  chiuse = []
  const s = creaServer({
    archivio,
    esegui: () => Promise.resolve({ codice: 1, uscita: ROSSO.uscita }),
    // Il supervisore non risponde: decidono le regole, come nella notte vera.
    interroga: () => Promise.reject(new Error('il supervisore non risponde')),
    avviaLavoro: (_a, messaggio, c) => {
      avviati.push({ ...(c !== undefined ? { chat: c.id } : {}), ...(messaggio !== undefined ? { messaggio } : {}) })
      return Promise.resolve()
    },
    fermaLavoro: (id, chatId) => { fermati.push(chatId ?? id) },
    chiudiChat: (_id, chatId) => { chiuse.push(chatId ?? '?') },
    avvisa: () => Promise.resolve(),
    domande: registro,
    scadenzaDomandaMs: 5000,
    scadenzaInterviataMs: 5000,
    ultimoDetto: () => 'Non passa ancora.',
    adesso: orologio.iso
  })
  server = s
  await new Promise<void>((ris) => { s.listen(0, '127.0.0.1', () => { porta = (s.address() as { port: number }).port; ris() }) })
  archivio.scrivi({
    ...nuovoAutopilota({ id: 'ap-b', nome: 'App Android', obiettivo: 'App Android: analisi, correzioni e allineamento', cwd: process.cwd(), criteri: [{ descrizione: CRITERIO, comando: ROSSO.comando, soddisfatto: false }], iniziatoIl: '2026-10-22T06:00:00.000Z' }),
    stato: 'lavoro',
    chats,
    decisioni: giriInCerchio()
  })
}

const stop = (chatId?: string): Promise<Response> => fetch(`http://127.0.0.1:${porta}/hook/stop?ap=ap-b${chatId !== undefined ? `&chat=${chatId}` : ''}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ session_id: `s-${chatId ?? 'ap'}`, stop_hook_active: false, last_assistant_message: 'Non passa ancora.', hook_event_name: 'Stop', cwd: process.cwd() })
})

const chat = (id: string, extra: Partial<ChatGovernata> = {}): ChatGovernata => ({ id, compito: 'Correggi i difetti del collaudo delle domande', stato: 'lavoro', cicli: 3, sessionId: `s-${id}`, cartella: process.cwd(), ramo: `ap/ap-b/${id}`, ...extra })

describe('nel servizio', () => {
  it('le strade finite: prima una chat nuova sullo stesso ramo rilegge gli errori, nessuna domanda a Nicholas', async () => {
    await avviaServizio([chat('c-1')])
    expect((await stop('c-1')).ok).toBe(true)
    expect(registro.aperte('ap-b')).toEqual([])
    const a = archivio.leggi('ap-b')!
    const vecchia = a.chats.find((c) => c.id === 'c-1')!
    const nuova = a.chats.find((c) => c.sostituisce === 'c-1')!
    expect(vecchia.stato).toBe('finita')
    expect(vecchia.nelRecupero).toBeDefined()
    expect(nuova).toMatchObject({ stato: 'lavoro', ramo: 'ap/ap-b/c-1', ultimaStrada: true })
    expect(fermati).toContain('c-1')
    expect(chiuse).toContain('c-1')
    await attendi(() => avviati.length > 0)
    expect(avviati[0]?.chat).toBe(nuova.id)
    expect(avviati[0]?.messaggio).toContain('Rileggi gli errori da capo')
    expect(a.decisioni.some((d) => d.cosa.startsWith('ultima strada — il controllo «'))).toBe(true)
  })

  it('se si blocca anche la chat nuova chiede, e mentre aspetta continua con il resto', async () => {
    await avviaServizio([chat('c-1', { stato: 'finita' }), chat('c-2', { ultimaStrada: true, sostituisce: 'c-1' })])
    const r = await stop('c-2')
    const corpo = await r.json() as { decision?: string; reason?: string }
    // Il turno non resta trattenuto: la chat riceve il resto da fare.
    expect(corpo.decision).toBe('block')
    expect(corpo.reason).toContain('Mentre aspetti la sua risposta non restare ferma')
    const aperte = registro.aperte('ap-b')
    expect(aperte).toHaveLength(1)
    expect(aperte[0]?.parti?.domanda).toContain('«App Android»: il controllo «')
    expect(aperte[0]?.parti?.staFacendo).toContain('Correggi i difetti del collaudo delle domande')
    expect(aperte[0]?.parti?.seNonRispondi).toContain('intanto la chat continua')
    expect(aperte[0]?.opzioni).toEqual([SCELTA_LASCIA_STARE, SCELTA_DICO_IO, SCELTA_SOSPENDI])
    expect(archivio.leggi('ap-b')!.chats.find((c) => c.id === 'c-2')?.stato).toBe('lavoro')

    // «Lascia stare quel controllo»: il criterio lo giudica l'autopilota, la risposta va in coda alla chat al lavoro.
    expect(registro.rispondi(aperte[0]!.id, SCELTA_LASCIA_STARE, 'modale')).toBe(true)
    await attendi(() => archivio.leggi('ap-b')!.criteri[0]?.giudicato !== undefined)
    const a = archivio.leggi('ap-b')!
    expect(a.criteri[0]?.giudicato?.perche).toContain('Nicholas ha scelto di lasciarlo stare')
    expect(a.daConsegnare.at(-1)).toMatchObject({ chats: ['c-2'] })
    expect(a.daConsegnare.at(-1)?.testo).toContain('Da adesso lo giudica l’autopilota')
  })

  it('tornata sullo stesso controllo con la domanda aperta, aspetta; «Sospendi l’autopilota» ferma tutto', async () => {
    await avviaServizio([chat('c-2', { ultimaStrada: true })])
    await stop('c-2')
    const d = registro.aperte('ap-b')[0]!
    // La seconda fermata sullo stesso controllo resta trattenuta sulla domanda già aperta.
    const seconda = stop('c-2')
    await attendi(() => archivio.leggi('ap-b')!.chats[0]?.stato === 'bloccata')
    expect(registro.aperte('ap-b')).toHaveLength(1)
    registro.rispondi(d.id, SCELTA_SOSPENDI, 'modale')
    expect(await (await seconda).json()).toEqual({})
    const a = archivio.leggi('ap-b')!
    expect(a.stato).toBe('sospeso')
    expect(a.motivoSospensione).toContain('sospeso su tua scelta')
    expect(fermati).toContain('ap-b')
  })

  it('con una chat sola: l’ultima strada nella stessa chat, poi la domanda senza fermarsi', async () => {
    await avviaServizio([])
    const prima = await (await stop()).json() as { reason?: string }
    expect(prima.reason).toContain('Prima di chiedere a Nicholas, un’ultima strada')
    expect(registro.aperte('ap-b')).toEqual([])
    const seconda = await (await stop()).json() as { reason?: string }
    expect(seconda.reason).toContain('Mentre aspetti')
    expect(registro.aperte('ap-b')).toHaveLength(1)
    expect(archivio.leggi('ap-b')!.stato).toBe('lavoro')
  })

  it('22/10: la vecchia «Come vuoi che proceda?» aperta si chiude come superata e la chat riparte', async () => {
    await avviaServizio([chat('c-1', { stato: 'bloccata' })])
    const d = registro.apri({ autopilotaId: 'ap-b', testo: testoDomanda('App Android', VERA_22_10), scadenzaMs: 5000, parti: VERA_22_10, opzioni: VERA_22_10.scelte.map((s) => s.scelta) })
    registro.ricorda(d.id, { autopilotaId: 'ap-b', testo: d.testo, grezza: 'Sono bloccato su «App Android».', chatId: 'c-1' })
    expect(await server!.ricontrollaDomande()).toBe(1)
    expect(registro.aperte('ap-b')).toEqual([])
    expect(archivio.leggi('ap-b')!.chats[0]?.stato).toBe('lavoro')
    await attendi(() => avviati.length > 0)
    expect(avviati[0]?.messaggio).toContain('Rileggi gli errori da capo')
  })
})

describe('Revisione: «Ti scrivo io cosa provare» apre il campo, non risponde', () => {
  it('la scelta è segnata come risposta da scrivere, fino alla scheda di PC, pagina e app', () => {
    const p = nuove()
    expect(p.scelte.find((s) => s.scelta === SCELTA_DICO_IO)?.libera).toBe(true)
    const s = schedaDaParti('autopilota «App Android»', p)
    expect(s.scelte.map((c) => toccoScelta(c))).toEqual(['rispondi', 'scrivi', 'rispondi'])
  })

  it('PC, pagina e app: il tocco porta al campo invece di mandare la frase', () => {
    const pc = readFileSync('src/renderer/components/SchedaDomandaVista.tsx', 'utf8')
    expect(pc).toContain("if (toccoScelta(c) === 'scrivi') campo.current?.focus(); else onScelta(c)")
    const pagina = readFileSync('src/main/client-pagina.ts', 'utf8')
    expect(pagina).toContain('return c.libera ? tastoScrivi(c, campo.id) : tasto(c)')
    const app = readFileSync('android/app/src/main/java/it/ferrariconsulenze/sierradeck/SchedaDomandaVista.kt', 'utf8')
    expect(app).toContain('if (apreIlCampo(c)) campo.requestFocus() else onScelta(c)')
  })

  it('nel servizio: premendola (anche da un’app vecchia, che manda la frase) la domanda resta aperta', async () => {
    await avviaServizio([chat('c-2', { ultimaStrada: true })])
    await stop('c-2')
    const d = registro.aperte('ap-b')[0]!
    const r = await fetch(`http://127.0.0.1:${porta}/domande/${d.id}/risposta`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ risposta: SCELTA_DICO_IO })
    })
    expect(r.status).toBe(409)
    expect(((await r.json()) as { errore: string }).errore).toContain('la domanda resta aperta')
    expect(registro.aperte('ap-b').map((x) => x.id)).toEqual([d.id])
    // Quello che si scrive nel campo, invece, è la risposta.
    const scritta = await fetch(`http://127.0.0.1:${porta}/domande/${d.id}/risposta`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ risposta: 'prova a svuotare la cache di vitest' })
    })
    expect(scritta.status).toBe(200)
    expect(registro.aperte('ap-b')).toEqual([])
  })
})
