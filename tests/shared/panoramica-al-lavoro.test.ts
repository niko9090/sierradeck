import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { riassuntoAlLavoro, separaConversazione, sottoAlLavoro, titoloAlLavoro, type SchedaChat } from '@shared/panoramica'
import { compitoBreve, conversazione, rigaTraguardo } from '@shared/chat-autopilota'
import { nuovoAutopilota, parseAutopilota, type Autopilota, type ChatGovernata } from '@shared/autopilota'

/**
 * 0.79.0, Nicholas: nella Panoramica la conversazione con l'autopilota grande
 * e sempre in vista; accanto un riassunto che si aggiorna da solo, una riga
 * per chat al lavoro (chi è, cosa fa, da quanto, se aspetta lui); quando uno
 * specialista finisce, una riga corta nella conversazione. Tutto dai dati del
 * servizio e dai segnali, mai dalle parole delle chat.
 *
 * I casi per l'app stanno in
 * `android/app/src/test/resources/panoramica/al-lavoro-0.79.json` (`AGGIORNA=1` riscrive).
 */
const ORA = Date.parse('2026-10-18T10:30:00.000Z')
const MIN = 60_000
const ap = (x: Partial<Autopilota> = {}): Autopilota => ({
  ...nuovoAutopilota({ id: 'ap-1', nome: 'Prova', obiettivo: 'Gestione delle chat', cwd: 'C:\\p', criteri: [], iniziatoIl: '2026-10-18T09:00:00.000Z' }),
  ...x
})
const chat = (id: string, compito: string, stato: ChatGovernata['stato'], x: Partial<ChatGovernata> = {}): ChatGovernata => ({ id, compito, stato, cicli: 1, sessionId: `s-${id}`, ...x })
type Scheda = SchedaChat & { sessione?: string; dal?: number; suPc?: string }
const scheda = (id: string, stato: Scheda['stato'], x: Partial<Scheda> = {}): Scheda => ({ id, titolo: id, stato, nataIl: 0, ...x })

const flotta = (): Autopilota => ap({
  sessionId: 's-ap',
  chats: [
    chat('c-1', 'Il motore della gestione delle chat. Chiudi, Archivia, Elimina dal PC con il recupero di 30 giorni.', 'finita', { ruolo: 'sviluppo', ramo: 'ap/x/c-1' }),
    chat('c-2', 'Interfaccia della gestione delle chat su PC, pagina e app', 'lavoro', { ruolo: 'interfaccia' }),
    chat('c-3', 'Rileggi il ramo di c-1', 'lavoro', { ruolo: 'revisione', revisioneDi: 'c-1' }),
    chat('c-4', 'Prova dal vero in una copia', 'bloccata', { ruolo: 'collaudo' })
  ]
})

describe('compitoBreve: il compito in poche parole', () => {
  it('la prima frase, tagliata su una parola', () => {
    expect(compitoBreve('Il motore della gestione delle chat. Chiudi, Archivia…')).toBe('Il motore della gestione delle chat')
    expect(compitoBreve('\n\n  Rileggi il ramo  \nseconda riga')).toBe('Rileggi il ramo')
    const lungo = compitoBreve('Interfaccia della gestione delle chat su PC, pagina e app Android nativa, allineate fra loro e basate sulle API del compito zero')
    expect(lungo.length).toBeLessThanOrEqual(60)
    expect(lungo.endsWith('…')).toBe(true)
    expect(lungo).not.toMatch(/\s…$/)
  })
})

describe('il riassunto accanto alla conversazione', () => {
  it('una riga per chat al lavoro o che aspetta te, prima chi aspetta te; chi è e cosa fa dal registro, da quanto dai segnali', () => {
    const r = riassuntoAlLavoro(flotta(), [
      scheda('p-int', 'lavora', { sessione: 's-c-2', ruolo: 'interfaccia', dal: ORA - 12 * MIN }),
      scheda('p-rev', 'lavora', { sessione: 's-c-3', ruolo: 'revisione', dal: ORA - 3 * MIN }),
      scheda('p-col', 'chiede', { sessione: 's-c-4', ruolo: 'collaudo', dal: ORA - 30_000 }),
      scheda('p-ferma', 'ferma', { sessione: 's-c-1', ruolo: 'sviluppo' }),
      scheda('p-mia', 'lavora', { titolo: 'Prove di grafica', dal: ORA - 2 * 3600_000 }),
      scheda('p-ap', 'lavora', { sessione: 's-ap', dal: ORA - 5 * MIN }),
      scheda('p-la', 'lavora', { sessione: 's-x', titolo: 'Sul portatile', suPc: 'PORTATILE' })
    ], ORA)
    // A parità di ruolo (nessuno) e di nascita, per id: l'ordine fisso della Panoramica.
    expect(r.map((x) => x.id)).toEqual(['p-col', 'p-int', 'p-rev', 'p-ap', 'p-la', 'p-mia'])
    expect(r[0]).toEqual({ id: 'p-col', chi: 'Collaudo', ruolo: 'collaudo', cosa: 'prova: «Prova dal vero in una copia»', quanto: 'adesso', aspettaTe: true })
    expect(r[1]).toMatchObject({ chi: 'Interfaccia', cosa: 'lavora a: «Interfaccia della gestione delle chat su PC, pagina e app»', quanto: 'da 12 min', aspettaTe: false })
    expect(r[2]).toMatchObject({ chi: 'Revisione', cosa: 'rilegge il lavoro di Sviluppo: «Il motore della gestione delle chat»', quanto: 'da 3 min' })
    expect(r[5]).toMatchObject({ chi: 'Chat', cosa: 'chat del workspace: «Prove di grafica»', quanto: 'da 2 h' })
    expect(r[3]).toMatchObject({ chi: 'Chat', cosa: 'lavora all’obiettivo' })
    expect(r[4]).toMatchObject({ quanto: 'su PORTATILE' })
  })

  it('niente al lavoro: niente righe; senza autopilota le chat del workspace', () => {
    expect(riassuntoAlLavoro(flotta(), [scheda('a', 'ferma'), scheda('b', 'finita')], ORA)).toEqual([])
    expect(riassuntoAlLavoro(undefined, [scheda('a', 'lavora', { titolo: 'Sviluppo · scrive', ruolo: 'sviluppo' })], ORA)[0]).toMatchObject({ chi: 'Sviluppo', cosa: 'chat del workspace: «scrive»' })
  })

  it('titolo e riga quieta', () => {
    const r = [
      { id: 'a', chi: 'Sviluppo', cosa: 'x', quanto: 'da 3 min', aspettaTe: false },
      { id: 'b', chi: 'Collaudo', cosa: 'y', quanto: 'adesso', aspettaTe: true }
    ]
    expect(titoloAlLavoro(r)).toBe('Al lavoro · 2 · ◆ 1 aspetta te')
    expect(titoloAlLavoro([...r, { ...r[1]!, id: 'c' }])).toBe('Al lavoro · 3 · ◆ 2 aspettano te')
    expect(titoloAlLavoro([])).toBe('Al lavoro · 0')
    expect(sottoAlLavoro(r[0]!)).toBe('da 3 min')
    expect(sottoAlLavoro(r[1]!)).toBe('aspetta te · adesso')
    expect(sottoAlLavoro({ ...r[1]!, quanto: '' })).toBe('aspetta te')
  })
})

describe('le righe corte quando uno specialista finisce', () => {
  it('dal registro: chi, cosa, com’è andata; niente righe tecniche', () => {
    const a = flotta()
    expect(rigaTraguardo(a, { chat: 'c-1', esito: 'in-revisione' })).toBe('Sviluppo: ha finito «Il motore della gestione delle chat», ora lo rilegge la Revisione.')
    expect(rigaTraguardo(a, { chat: 'c-3', esito: 'approvato', di: 'c-1' })).toBe('Revisione: ha approvato «Il motore della gestione delle chat» di Sviluppo, unito.')
    expect(rigaTraguardo(a, { chat: 'c-3', esito: 'da-rifare', di: 'c-1' })).toBe('Revisione: rimanda «Il motore della gestione delle chat» di Sviluppo da correggere.')
    expect(rigaTraguardo(a, { chat: 'c-3', esito: 'chiede-te', di: 'c-1' })).toBe('Revisione: rimanda di nuovo «Il motore della gestione delle chat» di Sviluppo, decidi tu come andare avanti.')
    expect(rigaTraguardo(a, { chat: 'c-2', esito: 'finito' })).toBe('Interfaccia: ha finito «Interfaccia della gestione delle chat su PC, pagina e app».')
    expect(rigaTraguardo(a, { chat: 'c-99', esito: 'finito' })).toBeUndefined()
  })

  it('nella conversazione la riga corta, in «Cosa è successo» quella tecnica', () => {
    const a = flotta()
    a.decisioni = [
      { quando: '2026-10-18T10:00:00.000Z', cosa: 'c-1 ha finito il suo compito: il ramo ap/x/c-1 passa alla Revisione prima di essere unito', traguardo: { chat: 'c-1', esito: 'in-revisione' } },
      { quando: '2026-10-18T10:20:00.000Z', cosa: 'Revisione c-3: OK per c-1 (ap/x/c-1), unito nel ramo principale. ok', traguardo: { chat: 'c-3', esito: 'approvato', di: 'c-1' } },
      { quando: '2026-10-18T10:21:00.000Z', cosa: 'nuovo compito in coda: altro' }
    ]
    a.dialogo = [{ quando: '2026-10-18T10:25:00.000Z', da: 'tu', testo: 'come va?' }]
    const { messaggi, eventi } = separaConversazione(conversazione(a))
    const corte = messaggi.filter((b) => b.tono === 'traguardo').map((b) => b.testo)
    expect(corte).toEqual([
      'Sviluppo: ha finito «Il motore della gestione delle chat», ora lo rilegge la Revisione.',
      'Revisione: ha approvato «Il motore della gestione delle chat» di Sviluppo, unito.'
    ])
    expect(messaggi.some((b) => b.da === 'nota' && b.tono !== 'traguardo')).toBe(false)
    expect(messaggi.some((b) => /ap\/x\/c-1/.test(b.testo))).toBe(false)
    expect(eventi.some((b) => /ap\/x\/c-1/.test(b.testo))).toBe(true)
    // In ordine di tempo, prima della tua battuta delle 10:25.
    expect(messaggi.map((b) => b.testo).indexOf('come va?')).toBeGreaterThan(messaggi.map((b) => b.testo).indexOf(corte[1]!))
  })

  it('il traguardo si conserva rileggendo lo stato; uno storto si scarta, la riga resta', () => {
    const a = { ...flotta(), criteri: [{ descrizione: 'test verdi', soddisfatto: false }] }
    a.decisioni = [
      { quando: '2026-10-18T10:00:00.000Z', cosa: 'uno', traguardo: { chat: 'c-1', esito: 'in-revisione' } },
      { quando: '2026-10-18T10:01:00.000Z', cosa: 'due', traguardo: { chat: 'c-3', esito: 'inventato' as never } },
      { quando: '2026-10-18T10:02:00.000Z', cosa: 'tre' }
    ]
    const r = parseAutopilota({ ...JSON.parse(JSON.stringify(a)), versione: 1 })
    expect(r.scartati).toEqual([])
    expect(r.autopilota?.decisioni).toEqual([
      { quando: '2026-10-18T10:00:00.000Z', cosa: 'uno', traguardo: { chat: 'c-1', esito: 'in-revisione' } },
      { quando: '2026-10-18T10:01:00.000Z', cosa: 'due' },
      { quando: '2026-10-18T10:02:00.000Z', cosa: 'tre' }
    ])
  })
})

describe('l’app legge gli stessi casi', () => {
  it('i casi d’esempio sono quelli dei test dell’app', () => {
    const righe = riassuntoAlLavoro(flotta(), [
      scheda('p-int', 'lavora', { sessione: 's-c-2', ruolo: 'interfaccia', dal: ORA - 12 * MIN }),
      scheda('p-col', 'chiede', { sessione: 's-c-4', ruolo: 'collaudo', dal: ORA - 30_000 }),
      scheda('p-col2', 'chiede', { sessione: 's-c-x', titolo: 'senza tempo' })
    ], ORA)
    const a = flotta()
    a.decisioni = [{ quando: '2026-10-18T10:00:00.000Z', cosa: 'tecnica', traguardo: { chat: 'c-1', esito: 'in-revisione' } }]
    const battute = conversazione(a)
    const casi = {
      panoramica: { alLavoro: righe },
      titolo: titoloAlLavoro(righe),
      sotto: righe.map(sottoAlLavoro),
      battute,
      messaggi: separaConversazione(battute).messaggi.map((b) => b.testo),
      eventi: separaConversazione(battute).eventi.map((b) => b.testo)
    }
    const file = join(__dirname, '..', '..', 'android', 'app', 'src', 'test', 'resources', 'panoramica', 'al-lavoro-0.79.json')
    const atteso = `${JSON.stringify(casi, null, 2)}\n`
    if (process.env.AGGIORNA === '1' || !existsSync(file)) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, atteso) }
    expect(readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).toBe(atteso)
  })
})
