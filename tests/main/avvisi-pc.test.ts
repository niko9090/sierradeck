import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { apriAvvisi } from '../../src/main/avvisi'
import { creaFontiAvvisi, statoAvvisi, type ChatPerAvvisi, type ConsegnaPerAvvisi } from '../../src/main/avvisi-pc'
import { avviaTelegram, configurazioneTelegram, messaggioTelegram } from '../../src/main/avvisi-telegram'
import { apriGiornaleAvvisi } from '../../src/autopilot-host/giornale-avvisi'
import { dimenticaTelegramAssente, RIGA_TELEGRAM_ASSENTE } from '../../src/autopilot-host/telegram'
import { CHAT_FERMA_MS, bozzaDomanda, bozzaProva, type Avviso, type DomandaDelProgramma } from '@shared/avvisi-telefono'

function banco() {
  let ora = new Date(2026, 10, 11, 12, 0, 0).getTime()
  const righe: string[] = []
  const registro = apriAvvisi({ adesso: () => ora, log: (r) => righe.push(r) })
  const fileGiornale = join(mkdtempSync(join(tmpdir(), 'avvisi-pc-')), 'servizio', 'giornale-avvisi.json')
  const mondo: {
    chat: ChatPerAvvisi[]; aggiornamento?: { fase: string; versione?: string }; domande: DomandaDelProgramma[]; consegne: ConsegnaPerAvvisi[]
    altri: { pcId: string; nome: string }[]; risposte: Record<string, unknown>; chiamate: string[]
  } = { chat: [], domande: [], consegne: [], altri: [], risposte: {}, chiamate: [] }
  const fonti = creaFontiAvvisi({
    registro, fileGiornale, adesso: () => ora, log: (r) => righe.push(r),
    chat: () => mondo.chat,
    aggiornamento: () => mondo.aggiornamento,
    domandeDelProgramma: () => mondo.domande,
    delProgramma: (id) => id.startsWith('conferma:'),
    consegne: () => mondo.consegne,
    altriPc: async () => mondo.altri,
    chiamaPc: async (pcId, percorso) => {
      mondo.chiamate.push(`${pcId} ${percorso}`)
      const r = mondo.risposte[pcId]
      if (r instanceof Error) throw r
      return r
    }
  })
  return { registro, righe, fileGiornale, mondo, fonti, avanti: (ms: number) => { ora += ms } }
}

const aperti = (registro: ReturnType<typeof apriAvvisi>) => registro.aperti().map((a) => a.id)

describe('le fonti degli avvisi sul PC', () => {
  it('il giornale del servizio: le domande nascono e si chiudono, una volta sola', () => {
    const b = banco()
    const g = apriGiornaleAvvisi({ file: b.fileGiornale })
    g.annota({ cosa: 'domanda', id: 'd-1', workspace: 'Negozio', autopilota: 'ap-1', domanda: 'Tengo il vecchio elenco?' })
    g.annota({ cosa: 'fermo', id: 'f-1', workspace: 'Negozio', motivo: 'La revisione non passa' })
    b.fonti.giro()
    expect(aperti(b.registro)).toEqual(['domanda:d-1', 'fermo:f-1'])
    b.fonti.giro()
    expect(b.registro.ultimo()).toBe(2)
    g.annota({ cosa: 'domanda-chiusa', id: 'd-1', come: 'programma', testo: 'Sì' })
    // Una richiesta fatta: il «Lavoro fermo» dello stesso workspace non vale più.
    g.annota({ cosa: 'fatto', id: 'r-1', workspace: 'Negozio', titolo: 'Fatta: la schermata nuova' })
    b.fonti.giro()
    expect(aperti(b.registro)).toEqual(['fatto:r-1'])
    expect(b.registro.ultimi(4).find((a) => a.id === 'domanda:d-1')?.chiuso).toMatchObject({ come: 'programma', testo: 'Sì' })
    expect(b.registro.cursore('servizio')).toBe(4)
  })

  it('un giornale ripartito da capo si rilegge senza doppioni', () => {
    const b = banco()
    const g = apriGiornaleAvvisi({ file: b.fileGiornale })
    for (const id of ['d-1', 'd-2', 'd-3']) g.annota({ cosa: 'domanda', id, workspace: 'Negozio', domanda: `${id}?` })
    b.fonti.giro()
    expect(b.registro.ultimo()).toBe(3)
    rmSync(b.fileGiornale)
    const nuovo = apriGiornaleAvvisi({ file: b.fileGiornale })
    nuovo.annota({ cosa: 'domanda', id: 'd-3', workspace: 'Negozio', domanda: 'd-3?' })
    nuovo.annota({ cosa: 'domanda', id: 'd-4', workspace: 'Negozio', domanda: 'd-4?' })
    b.fonti.giro()
    expect(aperti(b.registro)).toEqual(['domanda:d-1', 'domanda:d-2', 'domanda:d-3', 'domanda:d-4'])
    expect(b.righe.some((r) => r.includes('giornale del servizio è ripartito'))).toBe(true)
    expect(b.registro.cursore('servizio')).toBe(2)
  })

  it('senza giornale non succede niente, e non si rompe', () => {
    const b = banco()
    b.fonti.giro()
    expect(b.registro.ultimo()).toBe(0)
  })

  it('la versione pronta: un avviso finché non è installata o tolta', () => {
    const b = banco()
    b.mondo.aggiornamento = { fase: 'scarico', versione: '0.101.0' }
    b.fonti.giro()
    expect(aperti(b.registro)).toEqual([])
    b.mondo.aggiornamento = { fase: 'pronto', versione: '0.101.0' }
    b.fonti.giro()
    b.fonti.giro()
    expect(aperti(b.registro)).toEqual(['versione:0.101.0'])
    b.mondo.aggiornamento = { fase: 'nessuno' }
    b.fonti.giro()
    expect(aperti(b.registro)).toEqual([])
  })

  it('le domande del programma nascono e, sparite, si chiudono; quelle degli autopiloti no', () => {
    const b = banco()
    b.registro.nasce(bozzaDomanda({ cosa: 'domanda', id: 'd-ap', workspace: 'Negozio', domanda: 'Di un autopilota?' }))
    b.mondo.domande = [{ id: 'conferma:c-1', testo: 'Mando foto.jpg al telefono?\n\nViene da fuori della cartella.', opzioni: ['Sì, mandalo', 'No'], da: 'Manda al telefono · Negozio' }]
    b.fonti.giro()
    const d = b.registro.aperti('domanda:conferma:')[0]!
    expect(d).toMatchObject({ titolo: 'Manda al telefono · Negozio chiede', testo: 'Mando foto.jpg al telefono?', azioni: [{ etichetta: 'Sì, mandalo', risposta: 'Sì, mandalo' }, { etichetta: 'No', risposta: 'No' }] })
    b.mondo.domande = []
    b.fonti.giro()
    expect(aperti(b.registro)).toEqual(['domanda:d-ap'])
  })

  it('i file per il telefono: l’avviso è per quel telefono, si chiude a consegna fatta', () => {
    const b = banco()
    b.mondo.consegne = [{ id: 'c-1', nome: 'foto.jpg', a: 'tel:tel-1', stato: 'attesa' }, { id: 'c-2', nome: 'x.pdf', a: 'tel:tel-1', stato: 'conferma' }]
    b.fonti.giro()
    expect(aperti(b.registro)).toEqual(['file:c-1'])
    b.mondo.consegne = [{ id: 'c-1', nome: 'foto.jpg', a: 'tel:tel-1', stato: 'consegnata' }]
    b.fonti.giro()
    expect(aperti(b.registro)).toEqual([])
  })

  it('una chat tua ferma: solo con «Chat ferma» accesa, dopo tre minuti; ripartita, l’avviso si chiude', () => {
    const b = banco()
    b.mondo.chat = [
      { id: 's-1', titolo: 'Negozio', aspetta: true },
      { id: 's-2', titolo: 'Governata', aspetta: true, governata: true },
      { id: 's-3', titolo: 'Al lavoro' }
    ]
    b.fonti.giro()
    b.avanti(CHAT_FERMA_MS)
    b.fonti.giro()
    expect(aperti(b.registro)).toEqual([])
    b.registro.imposta({ chatFerma: true })
    b.fonti.giro()
    const a = b.registro.aperti('chat:')
    expect(a.map((x) => x.bersaglio.id)).toEqual(['s-1'])
    expect(a[0]).toMatchObject({ tipo: 'fatto', titolo: 'Negozio aspetta te' })
    b.mondo.chat = [{ id: 's-1', titolo: 'Negozio' }]
    b.fonti.giro()
    expect(aperti(b.registro)).toEqual([])
    // Ferma di nuovo: un avviso nuovo, dopo altri tre minuti.
    b.mondo.chat = [{ id: 's-1', titolo: 'Negozio', chiedeSegnale: true, domanda: 'Quale delle due?' }]
    b.fonti.giro()
    b.avanti(CHAT_FERMA_MS)
    b.fonti.giro()
    expect(b.registro.aperti('chat:')[0]).toMatchObject({ tipo: 'domanda', testo: 'Quale delle due?' })
  })

  it('gli altri PC: le loro domande e i loro «fermo» arrivano col PC nel bersaglio, e si chiudono con loro', async () => {
    const b = banco()
    const dLa = { n: 4, id: 'domanda:d-9', tipo: 'domanda', titolo: 'Sito chiede', testo: 'Pubblico?', quando: '2026-11-11T11:00:00.000Z', suona: true, bersaglio: { cosa: 'domanda', id: 'd-9', autopilota: 'ap-9' } }
    const fileLa = { n: 5, id: 'file:c-9', tipo: 'sapere', titolo: 'File per il telefono', testo: 'x', quando: '2026-11-11T11:00:00.000Z', suona: false, bersaglio: { cosa: 'file', id: 'c-9' } }
    const giaPreso = { n: 6, id: 'pc:pc-c:domanda:d-1', tipo: 'domanda', titolo: 'x', testo: 'x', quando: '2026-11-11T11:00:00.000Z', suona: true, bersaglio: { cosa: 'domanda', id: 'd-1', pc: 'pc-c' } }
    b.mondo.altri = [{ pcId: 'pc-b', nome: 'Portatile' }, { pcId: 'pc-spento', nome: 'Fisso' }]
    b.mondo.risposte = { 'pc-b': { ultimo: 6, avvisi: [dLa, fileLa, giaPreso, { rotto: true }] }, 'pc-spento': new Error('ECONNREFUSED') }
    await b.fonti.giroAltriPc()
    expect(b.mondo.chiamate).toEqual(['pc-b /api/eventi?avvisi=0&attesa=0', 'pc-spento /api/eventi?avvisi=0&attesa=0'])
    const preso = b.registro.aperti()
    expect(preso.map((a) => a.id)).toEqual(['pc:pc-b:domanda:d-9'])
    expect(preso[0]).toMatchObject({ titolo: 'Sito chiede · Portatile', bersaglio: { cosa: 'domanda', id: 'd-9', autopilota: 'ap-9', pc: 'pc-b' } })
    expect(b.registro.cursore('pc:pc-b')).toBe(6)
    b.mondo.risposte = { 'pc-b': { ultimo: 7, avvisi: [{ ...dLa, n: 7, suona: false, chiuso: { quando: '2026-11-11T11:05:00.000Z', come: 'risposta' } }] } }
    b.mondo.chiamate = []
    await b.fonti.giroAltriPc()
    expect(b.mondo.chiamate[0]).toBe('pc-b /api/eventi?avvisi=6&attesa=0')
    expect(aperti(b.registro)).toEqual([])
  })

  it('un altro PC rifatto da capo: il suo numero torna indietro, e si riparte da zero', async () => {
    const b = banco()
    b.mondo.altri = [{ pcId: 'pc-b', nome: 'Portatile' }]
    b.mondo.risposte = { 'pc-b': { ultimo: 40, avvisi: [] } }
    await b.fonti.giroAltriPc()
    b.mondo.risposte = { 'pc-b': { ultimo: 3, avvisi: [] } }
    await b.fonti.giroAltriPc()
    expect(b.registro.cursore('pc:pc-b')).toBe(0)
    b.mondo.risposte = { 'pc-b': { stato: 404 } }
    await b.fonti.giroAltriPc()
    expect(b.registro.cursore('pc:pc-b')).toBe(0)
  })
})

describe('la riga di stato della schermata «Notifiche»', () => {
  it('nessun telefono, in ascolto, ultimo contatto', () => {
    const registro = apriAvvisi({})
    const ora = Date.parse('2026-11-11T12:00:00.000Z')
    expect(statoAvvisi(registro, [], ora)).toEqual({ riga: 'Nessun telefono accoppiato: gli avvisi restano qui.', inAscolto: false })
    expect(statoAvvisi(registro, [{ ultimoAccesso: '2026-11-11T11:50:00.000Z' }, {}], ora)).toEqual({
      riga: 'Ultimo contatto del telefono: 10 min fa.', inAscolto: false, ultimoContatto: '2026-11-11T11:50:00.000Z'
    })
    const attesa = registro.attendi(0, 10_000)
    expect(statoAvvisi(registro, [{}], ora)).toMatchObject({ riga: 'Il telefono è in ascolto adesso.', inAscolto: true })
    attesa.lascia()
  })
})

describe('Telegram dal registro', () => {
  const avviso = (x: Partial<Avviso>): Avviso => ({ n: 1, id: 'domanda:d-1', tipo: 'domanda', titolo: 'Negozio chiede', testo: 'Tengo <b>o</b> tolgo?', quando: '', suona: true, bersaglio: { cosa: 'domanda', id: 'd-1', autopilota: 'ap-1' }, ...x })

  it('il messaggio: titolo, testo protetto, la riga per rispondere; delle chiusure solo «ho scelto io»', () => {
    expect(messaggioTelegram(avviso({ sotto: 'Consigliata: tengo' }))).toBe(
      '<b>Negozio chiede</b>\nTengo &lt;b&gt;o&lt;/b&gt; tolgo?\n<i>Consigliata: tengo</i>\n\nRispondi con: <code>/rispondi ap-1 la tua risposta</code>'
    )
    // Una domanda di un altro PC: il bot di questo PC non saprebbe a chi girarla.
    expect(messaggioTelegram(avviso({ bersaglio: { cosa: 'domanda', id: 'd-1', autopilota: 'ap-1', pc: 'pc-b' } }))).not.toContain('/rispondi')
    expect(messaggioTelegram(avviso({ chiuso: { quando: '', come: 'risposta' } }))).toBeUndefined()
    expect(messaggioTelegram(avviso({ chiuso: { quando: '', come: 'programma', testo: 'Tengo' } }))).toContain('Ho scelto io: Tengo.')
    expect(messaggioTelegram(avviso({ chiuso: { quando: '', come: 'programma' } }))).toContain('Ho scelto io la strada più prudente.')
  })

  it('ogni avviso che nasce va a Telegram, silenzioso quando non suona; senza configurazione niente', async () => {
    const registro = apriAvvisi({})
    const mandati: { url: string; corpo: Record<string, unknown> }[] = []
    const righe: string[] = []
    const smetti = avviaTelegram(registro, { configurazione: { token: 'T', chat: '42' }, manda: async (url, corpo) => { mandati.push({ url, corpo: corpo as Record<string, unknown> }); return true }, log: (r) => righe.push(r) })
    expect(avviaTelegram(registro, { configurazione: undefined, manda: async () => { throw new Error('mai') } })()).toBeUndefined()
    registro.nasce(bozzaProva(new Date(2026, 10, 11, 12, 0)))
    registro.nasce(bozzaDomanda({ cosa: 'domanda', id: 'd-1', workspace: 'Negozio', domanda: 'Sì?' }))
    registro.chiudi('domanda:d-1', 'risposta')
    await new Promise((r) => setTimeout(r, 0))
    expect(mandati.map((m) => [m.url, m.corpo.chat_id, m.corpo.disable_notification])).toEqual([
      ['https://api.telegram.org/botT/sendMessage', '42', false],
      // Suonata la prova da meno di 20 s: la domanda arriva muta.
      ['https://api.telegram.org/botT/sendMessage', '42', true]
    ])
    expect(righe).toEqual(['[notifica] Telegram: avviso n=1 sapere', '[notifica] Telegram: avviso n=2 domanda'])
    smetti()
    registro.nasce(bozzaDomanda({ cosa: 'domanda', id: 'd-2', workspace: 'Negozio', domanda: 'Sì?' }))
    expect(mandati).toHaveLength(2)
  })

  it('senza configurazione lo dice una volta', () => {
    dimenticaTelegramAssente()
    const righe: string[] = []
    const vuota = mkdtempSync(join(tmpdir(), 'tg-'))
    expect(configurazioneTelegram({}, vuota, (r) => righe.push(r))).toBeUndefined()
    expect(configurazioneTelegram({}, vuota, (r) => righe.push(r))).toBeUndefined()
    expect(righe).toEqual([RIGA_TELEGRAM_ASSENTE])
  })
})
