import { describe, it, expect } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriQuadernoPersonale, FILE_CHIAVE_PERSONALE, FILE_QUADERNO_PERSONALE, type PortachiaviPersonale } from '../../src/main/quaderno-personale'
import { apriGettoni, rispondiMcp, STRUMENTI_MCP, type DipendenzeMcp } from '../../src/main/mcp-telefono'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'
import { leggiIdDomandaPersonale, sceltaDaRisposta, trovaVoce, valoreNascosto } from '@shared/quaderno-personale'
import type { AlTelefono } from '../../src/main/al-telefono'

// 0.57.0: il Quaderno personale. I dati riservati di Nicholas stanno solo sul
// PC, cifrati; una chat li chiede e lui sceglie ogni volta. Qui i valori sono
// d'esempio: i suoi non vanno mai nel codice né nei test.

const tmp = (p: string): string => mkdtempSync(join(tmpdir(), p))
/** Un portachiavi finto: avvolge con un segno riconoscibile. Quello vero è DPAPI. */
const portachiavi = (segno = 'utente-a'): PortachiaviPersonale => ({
  disponibile: () => true,
  avvolgi: (k) => `${segno}:${k.toString('base64')}`,
  svolgi: (s) => { const [chi, k] = s.split(':'); if (chi !== segno) throw new Error('portachiavi di un altro utente'); return Buffer.from(k ?? '', 'base64') }
})
const chat = { sessione: 's-esempio', titolo: 'Pagina legale' }

function quaderno(attesaMs = 2000, cartella = tmp('sd-qp-')): { q: ReturnType<typeof apriQuadernoPersonale>; cartella: string } {
  const q = apriQuadernoPersonale({ cartella, portachiavi: portachiavi(), attesaMs })
  expect(q.salva({ nome: 'Email di contatto', valore: 'esempio@example.com', nota: 'per le pagine pubbliche' }).ok).toBe(true)
  expect(q.salva({ nome: 'Partita IVA', valore: 'IT00000000000' }).ok).toBe(true)
  return { q, cartella }
}

/** Aspetta che la richiesta compaia nelle Domande e risponde. */
async function rispondiQuandoArriva(q: ReturnType<typeof apriQuadernoPersonale>, risposta: string): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const d = q.domande()[0]
    if (d !== undefined) { q.rispondi(d.id, risposta); return d.testo }
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error('nessuna domanda')
}

describe('il quaderno sul disco', () => {
  it('è cifrato: nel file non c’è nessun valore né nome, e la chiave è avvolta dal portachiavi', () => {
    const { cartella } = quaderno()
    expect(readdirSync(cartella).sort()).toEqual([FILE_CHIAVE_PERSONALE, FILE_QUADERNO_PERSONALE].sort())
    const grezzo = readFileSync(join(cartella, FILE_QUADERNO_PERSONALE), 'utf8')
    for (const chiaro of ['esempio@example.com', 'IT00000000000', 'Email di contatto', 'Partita IVA']) {
      expect(grezzo).not.toContain(chiaro)
      expect(Buffer.from(grezzo, 'base64').toString('latin1')).not.toContain(chiaro)
    }
    expect(JSON.parse(readFileSync(join(cartella, FILE_CHIAVE_PERSONALE), 'utf8')).avvolta).toMatch(/^utente-a:/)
  })

  it('riaperto, rilegge le voci', () => {
    const { cartella } = quaderno()
    const di = apriQuadernoPersonale({ cartella, portachiavi: portachiavi() })
    expect(di.stato().voci.map((v) => v.nome)).toEqual(['Email di contatto', 'Partita IVA'])
  })

  it('con il portachiavi di un altro utente non si apre, e il file non si sovrascrive', () => {
    const { cartella } = quaderno()
    const prima = readFileSync(join(cartella, FILE_QUADERNO_PERSONALE), 'utf8')
    const altro = apriQuadernoPersonale({ cartella, portachiavi: portachiavi('utente-b') })
    expect(altro.stato().disponibile).toBe(false)
    expect(altro.stato().perche).toMatch(/portachiavi/)
    expect(altro.salva({ nome: 'X', valore: 'y' }).ok).toBe(false)
    expect(readFileSync(join(cartella, FILE_QUADERNO_PERSONALE), 'utf8')).toBe(prima)
  })

  it('un file manomesso non si decifra e non si sovrascrive', () => {
    const { cartella } = quaderno()
    const f = join(cartella, FILE_QUADERNO_PERSONALE)
    const b = Buffer.from(readFileSync(f, 'utf8'), 'base64'); b[b.length - 1] = (b[b.length - 1] ?? 0) ^ 1
    writeFileSync(f, b.toString('base64'))
    const q = apriQuadernoPersonale({ cartella, portachiavi: portachiavi() })
    expect(q.stato().disponibile).toBe(false)
    expect(q.salva({ nome: 'X', valore: 'y' }).ok).toBe(false)
  })

  it('senza portachiavi resta spento, e la chat lo sa', async () => {
    const q = apriQuadernoPersonale({ cartella: tmp('sd-qp-'), portachiavi: { ...portachiavi(), disponibile: () => false } })
    expect(q.stato().disponibile).toBe(false)
    const e = await q.chiedi(chat, 'Email di contatto', 'per la pagina dei contatti')
    expect(e.errore).toBe(true)
    expect(e.testo).toMatch(/non è disponibile/)
  })

  it('le voci si controllano: nome, valore, doppioni', () => {
    const { q } = quaderno()
    expect(q.salva({ nome: ' ', valore: 'x' })).toMatchObject({ ok: false })
    expect(q.salva({ nome: 'Sede', valore: '' })).toMatchObject({ ok: false })
    expect(q.salva({ nome: 'email  di CONTATTO', valore: 'x' })).toMatchObject({ ok: false, errore: expect.stringMatching(/già/) })
    const v = q.stato().voci[0]
    expect(q.salva({ id: v?.id, nome: 'Email di contatto', valore: 'altra@example.com' }).ok).toBe(true)
    expect(q.stato().voci[0]?.valore).toBe('altra@example.com')
  })
})

describe('una chat che chiede un dato', () => {
  it('«Consenti una volta»: lo riceve, e la volta dopo si chiede di nuovo', async () => {
    const { q } = quaderno()
    const [e, domanda] = await Promise.all([q.chiedi(chat, 'email di contatto', 'la scrivo nella pagina dei contatti'), rispondiQuandoArriva(q, 'Consenti una volta')])
    expect(domanda).toContain('«Pagina legale»')
    expect(domanda).toContain('«Email di contatto»')
    expect(domanda).toContain('la scrivo nella pagina dei contatti')
    expect(e.errore).toBe(false)
    expect(e.testo).toContain('esempio@example.com')
    expect(q.stato().consensi).toHaveLength(0)
    expect(q.stato().usi[0]).toMatchObject({ chat: 'Pagina legale', voce: 'Email di contatto', esito: 'una-volta' })
    const seconda = q.chiedi(chat, 'Email di contatto', 'di nuovo')
    await rispondiQuandoArriva(q, 'No')
    expect((await seconda).errore).toBe(true)
  })

  it('«Sempre per questa chat»: le volte dopo senza chiedere, solo per quella chat, finché non si revoca', async () => {
    const { q } = quaderno()
    const [prima] = await Promise.all([q.chiedi(chat, 'Partita IVA', 'nei termini d’uso'), rispondiQuandoArriva(q, 'Sempre per questa chat')])
    expect(prima.testo).toContain('IT00000000000')
    expect(q.stato().consensi).toMatchObject([{ sessione: 's-esempio', voce: 'Partita IVA' }])
    const seconda = await q.chiedi(chat, 'Partita IVA', 'nella presentazione')
    expect(seconda.testo).toContain('IT00000000000')
    expect(q.stato().usi[0]?.esito).toBe('gia-consentita')
    // Un'altra chat chiede da capo.
    const altra = q.chiedi({ sessione: 's-altra', titolo: 'Altro' }, 'Partita IVA', 'per un modulo')
    await rispondiQuandoArriva(q, 'No')
    expect((await altra).errore).toBe(true)
    // La revoca: si chiede di nuovo anche alla prima.
    const voce = q.stato().consensi[0]?.voceId ?? ''
    expect(q.revoca('s-esempio', voce)).toBe(true)
    const dopo = q.chiedi(chat, 'Partita IVA', 'ancora')
    await rispondiQuandoArriva(q, 'No')
    expect((await dopo).errore).toBe(true)
  })

  it('«No»: niente dato, e l’uso resta segnato come negato', async () => {
    const { q } = quaderno()
    const [e] = await Promise.all([q.chiedi(chat, 'Partita IVA', 'per curiosità'), rispondiQuandoArriva(q, 'No')])
    expect(e.errore).toBe(true)
    expect(e.testo).not.toContain('IT00000000000')
    expect(q.stato().usi[0]?.esito).toBe('negato')
  })

  it('senza risposta vale no, e la domanda sparisce', async () => {
    const { q } = quaderno(30)
    const e = await q.chiedi(chat, 'Partita IVA', 'nei termini')
    expect(e.errore).toBe(true)
    expect(e.testo).toMatch(/Nessuna risposta/)
    expect(q.domande()).toHaveLength(0)
    expect(q.stato().usi[0]?.esito).toBe('nessuna-risposta')
    expect(() => q.rispondi('dato-personale:inesistente', 'Consenti una volta')).toThrow(/non aspetta più/)
  })

  it('una voce che non c’è: niente domanda, e la chat sa quali ci sono', async () => {
    const { q } = quaderno()
    const e = await q.chiedi(chat, 'Codice fiscale', 'per un modulo')
    expect(e.errore).toBe(true)
    expect(e.testo).toContain('«Email di contatto», «Partita IVA»')
    expect(q.stato().usi[0]?.esito).toBe('voce-assente')
  })

  it('senza motivo non si chiede niente', async () => {
    const { q } = quaderno()
    expect((await q.chiedi(chat, 'Partita IVA', '')).testo).toMatch(/motivo/)
    expect(q.domande()).toHaveLength(0)
  })

  it('togliere una voce toglie anche i suoi «sempre»', async () => {
    const { q } = quaderno()
    await Promise.all([q.chiedi(chat, 'Partita IVA', 'nei termini'), rispondiQuandoArriva(q, 'Sempre per questa chat')])
    const id = q.stato().voci.find((v) => v.nome === 'Partita IVA')?.id ?? ''
    expect(q.togli(id)).toBe(true)
    expect(q.stato().consensi).toHaveLength(0)
  })
})

describe('le regole condivise', () => {
  it('la risposta: «sempre» e «una volta» solo se detto chiaro, il resto è no', () => {
    expect(sceltaDaRisposta('Consenti una volta')).toBe('una-volta')
    expect(sceltaDaRisposta('Sempre per questa chat')).toBe('sempre')
    expect(sceltaDaRisposta('No')).toBe('no')
    expect(sceltaDaRisposta('boh')).toBe('no')
    expect(sceltaDaRisposta('')).toBe('no')
  })
  it('la voce si trova senza badare a maiuscole, accenti e punti', () => {
    const voci = [{ id: 'v1', nome: 'Città della sede', valore: 'x', modificata: '' }]
    expect(trovaVoce(voci, 'citta della SEDE')?.id).toBe('v1')
    expect(trovaVoce(voci, 'v1')?.id).toBe('v1')
    expect(trovaVoce(voci, 'sede')).toBeUndefined()
  })
  it('negli elenchi il valore è nascosto', () => {
    expect(valoreNascosto('esempio@example.com')).not.toContain('example')
    expect(leggiIdDomandaPersonale('dato-personale:abc')).toBe('abc')
    expect(leggiIdDomandaPersonale('al-telefono:abc')).toBeUndefined()
  })
})

describe('lo strumento chiedi_dato_personale e le rotte', () => {
  it('le chat lo vedono fra gli strumenti, e chiamarlo passa dal quaderno', async () => {
    expect(STRUMENTI_MCP.map((s) => s.name)).toContain('chiedi_dato_personale')
    const { q } = quaderno()
    const gettoni = apriGettoni(join(tmp('sd-qp-g-'), 'g.json'))
    const g = gettoni.nuovo({ sessione: 's-esempio', cwd: tmp('sd-qp-c-'), pty: 'p1' })
    const deps: DipendenzeMcp = { gettoni, alTelefono: {} as AlTelefono, quadernoPersonale: q, titoloChat: () => 'Pagina legale', versione: '0.57.0' }
    const chiamata = rispondiMcp(deps, 'POST', `Bearer ${g}`, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'chiedi_dato_personale', arguments: { voce: 'Partita IVA', motivo: 'nei termini d’uso' } } })
    await rispondiQuandoArriva(q, 'Consenti una volta')
    const r = await chiamata
    expect((r.corpo as { result: { content: { text: string }[]; isError: boolean } }).result).toMatchObject({ isError: false })
    expect((r.corpo as { result: { content: { text: string }[] } }).result.content[0]?.text).toContain('IT00000000000')
  })

  it('si gestisce da questo PC e dai telefoni accoppiati qui, mai da un altro PC o dal ponte', async () => {
    const { q } = quaderno()
    const rotte = rotteClient({ quadernoPersonale: q, chat: () => [], domande: async () => [] } as unknown as DipendenzeRotte)
    const chiama = (dispositivo: string, percorso = '/api/quaderno-personale', corpo: unknown = {}) => rotte({ metodo: 'POST', percorso, corpo, dispositivo })
    expect((await chiama('locale')).stato).toBe(200)
    expect((await chiama('tel-esempio')).stato).toBe(200)
    expect((await chiama('pc:pc-fisso-id')).stato).toBe(403)
    expect((await chiama('pc:tel:tel-esempio@PC-ESEMPIO')).stato).toBe(403)
    const salva = await chiama('tel-esempio', '/api/quaderno-personale/salva', { nome: 'Sede', valore: 'Via Esempio 1' })
    expect(salva.stato).toBe(200)
    expect(q.stato().voci.map((v) => v.nome)).toContain('Sede')
    expect((await chiama('tel-esempio', '/api/quaderno-personale/salva', { nome: 'Sede', valore: 'doppione' })).stato).toBe(400)
  })
})
