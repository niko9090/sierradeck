import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio, type Archivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria, type Memoria } from '../../src/autopilot-host/memoria'
import { aperteSulloStesso, argomentoDi, risoltaDalloStato, rispostaGiaData, stessoArgomento } from '../../src/autopilot-host/domande-doppie'
import { REGOLE_DOMANDA, sembraNonItaliano, validaDomanda } from '@shared/domanda-strutturata'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'

/**
 * Nessuna domanda ripetuta, sempre in italiano (0.81.0).
 *
 * Il caso vero, 20/10: «Installi tu la 0.80.0 su questo PC?» da una chat e
 * «Will you install the 0.80.0 on this PC?» da un'altra, aperte insieme,
 * quando sul PC girava già la 0.80.1. Nicholas ha risposto due volte.
 */

const IT = 'Installi tu la 0.80.0 su questo PC, così chiudo le chat finite c-7, c-10 e c-12?'
const EN = 'Will you install the 0.80.0 on this PC so finished chats close on their own?'

describe('l argomento di una domanda', () => {
  it('riconosce «installare la stessa versione» in due lingue', () => {
    expect(argomentoDi(IT)).toEqual({ installa: true, pubblica: false, versioni: ['0.80.0'] })
    expect(stessoArgomento(IT, EN)).toBe(true)
  })

  it('non confonde versioni diverse, né disinstallare con installare', () => {
    expect(stessoArgomento(IT, 'Installi la 0.81.0?')).toBe(false)
    expect(stessoArgomento(IT, 'Disinstallo la 0.80.0 dal portatile?')).toBe(false)
    expect(stessoArgomento('Pubblico la 0.80.0?', 'Pubblico la 0.80.0 adesso?')).toBe(false)
    // Le stesse versioni, non una in comune (Revisione 0.81.0).
    expect(stessoArgomento('Installi la 0.80.0 o la 0.80.1?', 'Installi la 0.80.1?')).toBe(false)
  })

  it('un numero di pacchetto non è una versione del programma', () => {
    expect(argomentoDi('Installo vitest 0.34.6 nel progetto?').versioni).toEqual([])
    expect(argomentoDi('Installi la v0.80.1 e poi SierraDeck 0.81.0?').versioni).toEqual(['0.80.1', '0.81.0'])
  })
})

describe('lo stato vero', () => {
  it('«installi la 0.80.0?» con la 0.80.1 già installata è già risolta', () => {
    expect(risoltaDalloStato(IT, { versioneInstallata: '0.80.1' })).toBe('su questo PC è già installata la 0.80.1')
    expect(risoltaDalloStato(EN, { versioneInstallata: '0.80.0' })).toBeDefined()
  })

  it('una versione più nuova di quella installata si chiede ancora', () => {
    expect(risoltaDalloStato('Installi la 0.81.0?', { versioneInstallata: '0.80.1' })).toBeUndefined()
    expect(risoltaDalloStato(IT, {})).toBeUndefined()
    expect(risoltaDalloStato('Uso npm o pnpm?', { versioneInstallata: '0.80.1' })).toBeUndefined()
    expect(risoltaDalloStato('Installo vitest 0.34.6 nel progetto?', { versioneInstallata: '0.80.1' })).toBeUndefined()
  })
})

describe('le risposte già date', () => {
  const adesso = Date.parse('2026-10-20T07:00:00Z')
  const risposte = [
    { domanda: IT, risposta: 'ho già installato la 0.80.1', quando: '2026-10-20T06:51:20Z', chat: 'c-10' },
    { domanda: 'Quale chiave SSH uso per il server di prova?', risposta: 'quella nuova', quando: '2026-10-20T06:00:00Z', chat: 'c-3' }
  ]

  it('vale per lo stesso argomento anche da un altra chat e in un altra lingua', () => {
    expect(rispostaGiaData(risposte, EN, 'c-12', adesso)).toMatchObject({ risposta: 'ho già installato la 0.80.1', perche: 'argomento' })
  })

  it('dalla stessa chat basta una domanda simile; da un altra no', () => {
    const simile = 'Quale chiave SSH uso adesso per il server di prova?'
    expect(rispostaGiaData(risposte, simile, 'c-3', adesso)).toMatchObject({ perche: 'stessa chat' })
    expect(rispostaGiaData(risposte, simile, 'c-4', adesso)).toBeUndefined()
  })

  it('una risposta per argomento vale poche ore: lo stato cambia', () => {
    expect(rispostaGiaData(risposte, EN, 'c-12', adesso + 7 * 3_600_000)).toBeUndefined()
  })

  it('un «no» o un «aspetta» non chiude l argomento', () => {
    const rinvii = [{ domanda: 'Installi la 0.81.0?', risposta: 'no, aspetta stasera', quando: '2026-10-20T06:51:20Z', chat: 'c-10' }]
    expect(rispostaGiaData(rinvii, 'Installi la 0.81.0 adesso?', 'c-10', adesso)).toBeUndefined()
  })

  it('la memoria ricorda quale chat aveva chiesto', () => {
    const m = apriMemoria(mkdtempSync(join(tmpdir(), 'ap-memoria-chat-')))
    m.ricordaRisposta('ap-1', IT, 'fatto', '2026-10-20T06:51:20Z', 'c-10')
    expect(m.risposte('ap-1')).toEqual([{ domanda: IT, risposta: 'fatto', quando: '2026-10-20T06:51:20Z', chat: 'c-10' }])
  })

  it('le domande aperte uguali si trovano per argomento', () => {
    const aperte = [{ id: 'd1', autopilotaId: 'ap', testo: IT }, { id: 'd2', autopilotaId: 'ap', testo: 'Uso npm o pnpm?' }]
    expect(aperteSulloStesso(aperte, 'ap', EN).map((d) => d.id)).toEqual(['d1'])
    expect(aperteSulloStesso(aperte, 'altro', EN)).toEqual([])
  })
})

describe('sempre in italiano', () => {
  it('riconosce una domanda in inglese, non una italiana con nomi tecnici', () => {
    expect(sembraNonItaliano(EN)).toBe(true)
    expect(sembraNonItaliano(IT)).toBe(false)
    expect(sembraNonItaliano('Unisco il ramo `feature/the-new-api` in main con `git merge --no-ff`?')).toBe(false)
  })

  it('una domanda in inglese torna da riscrivere, e le regole lo dicono', () => {
    const v = validaDomanda({
      staFacendo: 'The 0.80.0 is published and checked; c-12 has finished.',
      domanda: EN,
      perche: 'Closing chats whose branch is gone needs the new version.',
      scelte: [{ scelta: 'Yes', conseguenza: 'I close them now', consigliata: true }, { scelta: 'No', conseguenza: 'they stay open' }],
      seNonRispondi: 'I wait.'
    })
    expect(v.completa).toBe(false)
    expect(v.note.join(' ')).toContain('non è in italiano')
    expect(REGOLE_DOMANDA.join(' ')).toContain('Sempre in italiano')
  })
})

// ─── Dal vero, nel servizio ──────────────────────────────────────────────

let server: ServerAutopiloti | undefined
let porta: number
let archivio: Archivio
let memoria: Memoria
let scritti: { id: string; chat?: string; messaggio?: string }[]
let promptVisti: string[]
/** La decisione del supervisore per ogni chat; la riscrittura ha la sua. */
let giudizi: Record<string, string>
let riscrittura: string
let registro: ReturnType<typeof creaRegistroDomande>

const parti = (domanda: string, staFacendo = 'Sto chiudendo le chat finite di questo lavoro.'): Record<string, unknown> => ({
  staFacendo,
  domanda,
  perche: 'Il servizio installato è troppo vecchio per chiuderle.',
  scelte: [{ scelta: 'Sì, installo', conseguenza: 'chiudo le chat appena è installata', consigliata: true }, { scelta: 'No', conseguenza: 'restano aperte' }],
  seNonRispondi: 'Aspetto e intanto vado avanti con il resto.'
})

function banco(versione: string, prima?: (r: typeof registro) => void): ServerAutopiloti {
  archivio = apriArchivio(mkdtempSync(join(tmpdir(), 'ap-doppie-')))
  memoria = apriMemoria(mkdtempSync(join(tmpdir(), 'ap-doppie-mem-')))
  scritti = []
  promptVisti = []
  giudizi = {}
  riscrittura = ''
  registro = creaRegistroDomande({ adesso: () => Date.now() })
  prima?.(registro)
  return creaServer({
    archivio,
    memoria,
    versione,
    esegui: () => Promise.resolve({ codice: 0, uscita: 'ok' }),
    interroga: (prompt) => {
      promptVisti.push(prompt)
      if (prompt.includes('Riscrivila completa')) return Promise.resolve({ testo: riscrittura })
      const chat = Object.keys(giudizi).find((c) => prompt.includes(`ultimo-${c}:`))
      return Promise.resolve({ testo: giudizi[chat ?? ''] ?? '{"azione":"rispondo","risposta":"vai"}' })
    },
    avviaLavoro: (a, messaggio, chat) => {
      scritti.push({ id: a.id, ...(chat !== undefined ? { chat: chat.id } : {}), ...(messaggio !== undefined ? { messaggio } : {}) })
      return Promise.resolve()
    },
    fermaLavoro: () => {},
    avvisa: () => Promise.resolve(),
    domande: registro,
    // Quello che ogni chat aveva appena detto: lo riconosce l'interroga finto.
    ultimoDetto: (_cwd, sessione) => `ultimo-${sessione}: ho una domanda`,
    scadenzaDomandaMs: 5000,
    scadenzaInterviataMs: 5000,
    adesso: () => new Date().toISOString()
  })
}

function flotta(): Autopilota {
  return {
    ...nuovoAutopilota({
      id: 'ap-flotta',
      nome: 'Analisi',
      obiettivo: 'Chiudi il lavoro della 0.80.0',
      cwd: process.cwd(),
      criteri: [{ descrizione: 'test verdi', comando: 'npm test', soddisfatto: false }],
      iniziatoIl: '2026-10-20T06:00:00.000Z'
    }),
    stato: 'lavoro',
    chats: ['c-10', 'c-12', 'c-13'].map((id) => ({ id, compito: `compito di ${id}`, stato: 'lavoro' as const, cicli: 1, sessionId: id }))
  }
}

async function notifica(chat: string): Promise<void> {
  await fetch(`http://127.0.0.1:${porta}/hook/notification?ap=ap-flotta&chat=${chat}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notification_type: 'attesa', message: 'Claude is waiting for your input' })
  })
}

const aperte = async (): Promise<{ id: string; testo: string }[]> =>
  (await (await fetch(`http://127.0.0.1:${porta}/domande`)).json()) as { id: string; testo: string }[]

async function rispondiA(id: string, risposta: string): Promise<void> {
  await fetch(`http://127.0.0.1:${porta}/domande/${id}/risposta`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ risposta })
  })
}

async function attendiScritti(n: number): Promise<void> {
  for (let i = 0; i < 80 && scritti.length < n; i += 1) await new Promise((r) => setTimeout(r, 25))
}

async function avvia(versione: string, prima?: (r: typeof registro) => void): Promise<void> {
  const s = banco(versione, prima)
  server = s
  await new Promise<void>((ris) => {
    s.listen(0, '127.0.0.1', () => {
      porta = (s.address() as { port: number }).port
      ris()
    })
  })
}

afterEach(() => { server?.close(); server = undefined })

describe('nel servizio', () => {
  it('una domanda già risolta dalla versione installata non arriva a Nicholas', async () => {
    await avvia('0.80.1')
    archivio.scrivi(flotta())
    giudizi['c-10'] = JSON.stringify({ azione: 'chiedi', domanda: parti(IT) })
    await notifica('c-10')

    expect(await aperte()).toEqual([])
    // La chat sa perché nessuno le chiede niente: lo dice il programma.
    await attendiScritti(1)
    expect(scritti).toHaveLength(1)
    expect(scritti[0]).toMatchObject({ chat: 'c-10' })
    expect(scritti[0]?.messaggio).toContain('già installata la 0.80.1')
    expect(archivio.leggi('ap-flotta')?.decisioni.at(-1)?.cosa).toContain('non la chiedo')
  })

  it('una domanda in inglese si fa riscrivere in italiano prima di mostrarla', async () => {
    await avvia('0.79.0')
    archivio.scrivi(flotta())
    giudizi['c-12'] = JSON.stringify({ azione: 'chiedi', domanda: parti(EN, 'The 0.80.0 is published and checked; c-12 has finished.') })
    riscrittura = JSON.stringify(parti('Installi la 0.80.0 su questo PC, così le chat finite si chiudono da sole?'))
    await notifica('c-12')

    const [d] = await aperte()
    expect(promptVisti.some((p) => p.includes('non è in italiano'))).toBe(true)
    expect(d?.testo).toContain('Installi la 0.80.0 su questo PC')
    expect(d?.testo).not.toContain('Will you')
  })

  it('la stessa domanda da un altra chat non si apre una seconda volta, e una risposta le riprende tutte e due', async () => {
    await avvia('0.79.0')
    archivio.scrivi(flotta())
    giudizi['c-10'] = JSON.stringify({ azione: 'chiedi', domanda: parti(IT) })
    giudizi['c-12'] = JSON.stringify({ azione: 'chiedi', domanda: parti('Installi la 0.80.0 adesso, così le chat finite si chiudono da sole?') })
    await notifica('c-10')
    await notifica('c-12')

    const tutte = await aperte()
    expect(tutte).toHaveLength(1)
    const ap = archivio.leggi('ap-flotta')
    expect(ap?.chats.find((c) => c.id === 'c-12')?.stato).toBe('bloccata')
    expect(ap?.decisioni.at(-1)?.cosa).toContain('è la stessa domanda di c-10')

    await rispondiA(tutte[0]!.id, 'Sì, installo')
    await attendiScritti(2)
    expect(scritti.map((s) => s.chat).sort()).toEqual(['c-10', 'c-12'])
    expect(archivio.leggi('ap-flotta')?.chats.filter((c) => c.stato === 'bloccata')).toEqual([])
  })

  it('una chat agganciata riparte anche se la domanda aveva un turno in attesa (risposta in tempo)', async () => {
    // Le domande del supervisore a fine turno tengono l'hook fermo: la risposta
    // arriva «in tempo» e la via delle risposte tardive non scatta. La chat
    // agganciata non deve restare bloccata per sempre.
    let inAttesa: Promise<unknown> = Promise.resolve()
    let a = { id: '' }
    await avvia('0.79.0', (r) => {
      a = r.apri({ autopilotaId: 'ap-flotta', testo: IT, scadenzaMs: 5000 })
      r.ricorda(a.id, { autopilotaId: 'ap-flotta', testo: IT, grezza: IT, chatId: 'c-10' })
      inAttesa = r.attendi(a.id)
    })
    const ap = flotta()
    archivio.scrivi({ ...ap, chats: ap.chats.map((c) => (c.id === 'c-10' ? { ...c, stato: 'bloccata' as const } : c)) })
    giudizi['c-12'] = JSON.stringify({ azione: 'chiedi', domanda: parti('Installi la 0.80.0 adesso, così le chat finite si chiudono da sole?') })
    await notifica('c-12')
    expect(registro.aperte('ap-flotta')).toHaveLength(1)
    expect(archivio.leggi('ap-flotta')?.chats.find((c) => c.id === 'c-12')?.stato).toBe('bloccata')

    await rispondiA(a.id, 'Sì, installo')
    expect(await inAttesa).toMatchObject({ risposta: 'Sì, installo' })
    await attendiScritti(1)
    expect(scritti.map((s) => s.chat)).toEqual(['c-12'])
    expect(archivio.leggi('ap-flotta')?.chats.find((c) => c.id === 'c-12')?.stato).toBe('lavoro')
  })

  it('dopo la risposta, la stessa domanda dalla stessa chat si scarta con una riga', async () => {
    await avvia('0.79.0')
    archivio.scrivi(flotta())
    giudizi['c-13'] = JSON.stringify({ azione: 'chiedi', domanda: parti('Quale chiave SSH uso per il server di prova del progetto?') })
    await notifica('c-13')
    const [d] = await aperte()
    await rispondiA(d!.id, 'quella nuova')
    await attendiScritti(1)
    scritti.length = 0

    giudizi['c-13'] = JSON.stringify({ azione: 'chiedi', domanda: parti('Quale chiave SSH uso adesso per il server di prova del progetto?') })
    await notifica('c-13')

    expect(await aperte()).toEqual([])
    await attendiScritti(1)
    expect(scritti[0]?.messaggio).toContain('quella nuova')
    expect(archivio.leggi('ap-flotta')?.decisioni.at(-1)?.cosa).toContain('questa chat l’aveva già chiesta')
  })

  it('una risposta chiude anche la domanda uguale già aperta, e riprende le due chat', async () => {
    // Il 20/10: due domande uguali già aperte (aperte da una versione senza
    // questo filtro). Rispondere alla prima chiude anche la seconda.
    const ap = flotta()
    let a = { id: '' }
    // Le domande ci sono già quando il servizio parte, come dopo un riavvio.
    await avvia('0.79.0', (r) => {
      a = r.apri({ autopilotaId: 'ap-flotta', testo: IT, scadenzaMs: 5000 })
      r.ricorda(a.id, { autopilotaId: 'ap-flotta', testo: IT, grezza: IT, chatId: 'c-10' })
      const b = r.apri({ autopilotaId: 'ap-flotta', testo: EN, scadenzaMs: 5000 })
      r.ricorda(b.id, { autopilotaId: 'ap-flotta', testo: EN, grezza: EN, chatId: 'c-12' })
    })
    archivio.scrivi({ ...ap, chats: ap.chats.map((c) => (c.id === 'c-13' ? c : { ...c, stato: 'bloccata' as const })) })
    expect(registro.aperte('ap-flotta')).toHaveLength(2)

    await rispondiA(a.id, 'ho già installato la 0.80.1')
    await attendiScritti(2)
    expect(await aperte()).toEqual([])
    expect(scritti.map((x) => x.chat).sort()).toEqual(['c-10', 'c-12'])
    expect(archivio.leggi('ap-flotta')?.decisioni.map((d) => d.cosa).join(' ')).toContain('vale anche per una domanda uguale')
  })
})
