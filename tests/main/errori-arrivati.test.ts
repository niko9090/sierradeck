import { describe, it, expect } from 'vitest'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cartellaDiSierraDeck, mandaErrori, salvaErroriArrivati } from '../../src/main/errori-arrivati'
import { rotteClient, type DipendenzeRotte } from '../../src/main/client-rotte'
import { apriDispositivi } from '../../src/main/dispositivi'
import { aggiungiErrore, voceDaTesto, type InvioErrori, type StoricoErrori } from '@shared/storico-errori'
import { ROTTE_PONTE } from '@shared/ponte-telefono'

// Nella Temp finta della suite: la toglie la guardia alla fine (tests/setup).
const cartella = (): string => mkdtempSync(join(tmpdir(), 'sierradeck-test-arrivi-'))
const progetto = (nome: string, pacchetto = 'sierradeck'): string => {
  const c = join(cartella(), nome)
  mkdirSync(c, { recursive: true })
  writeFileSync(join(c, 'package.json'), JSON.stringify({ name: pacchetto }))
  return c
}
const quando = '2026-10-19T15:00:00.000Z'
const storico = (n = 1): StoricoErrori => {
  let s: StoricoErrori = { voci: [] }
  for (let i = 0; i < n; i += 1) s = aggiungiErrore(s, voceDaTesto({ testo: `boom ${'x'.repeat(i)}`, dove: 'pc', quando }))
  return s
}

describe('chi riceve: la cartella di SierraDeck', () => {
  it('sceglie la cartella con il package.json di SierraDeck, mai una copia di lavoro di un autopilota', () => {
    const altro = progetto('Clienti', 'clienti')
    const copia = progetto(join('SierraDeck.sierradeck-wt', 'ap-1-c-3'))
    const vera = progetto('SierraDeck')
    expect(cartellaDiSierraDeck([altro, copia, vera])).toBe(vera)
    expect(cartellaDiSierraDeck([altro, copia])).toBeUndefined()
  })

  it('scrive in .sierradeck/errori-arrivati/<mittente>/ e non sovrascrive mai un arrivo', () => {
    const radice = progetto('SierraDeck')
    const invio: InvioErrori = { da: 'Portatile ../di prova', versione: '0.81.0', voci: storico(2).voci }
    const ora = new Date(quando)
    const a = salvaErroriArrivati(radice, invio, ora)
    const b = salvaErroriArrivati(radice, invio, ora)
    expect(a.ok && b.ok).toBe(true)
    // Le barre spariscono: il nome non può uscire dalla cartella degli arrivi.
    const dove = join(radice, '.sierradeck', 'errori-arrivati', 'Portatile ..-di prova')
    expect(readdirSync(dove).sort()).toEqual(['2026-10-19_15-00-00-2.json', '2026-10-19_15-00-00.json'])
    const letto = JSON.parse(readFileSync(join(dove, '2026-10-19_15-00-00.json'), 'utf8')) as { da: string; voci: unknown[]; arrivato: string }
    expect(letto).toMatchObject({ da: 'Portatile ../di prova', arrivato: quando })
    expect(letto.voci).toHaveLength(2)
  })
})

describe('chi riceve: la rotta /api/errori/arrivati', () => {
  const rotte = (ricevi: DipendenzeRotte['erroriArrivati']): ReturnType<typeof rotteClient> => rotteClient({
    dispositivi: apriDispositivi(cartella()),
    chat: () => [],
    autopiloti: async () => [],
    ...(ricevi !== undefined ? { erroriArrivati: ricevi } : {})
  } as unknown as DipendenzeRotte)

  it('da un altro PC: controlla il corpo e lo passa a chi salva, con chi l’ha mandato', async () => {
    const visti: Array<{ invio: InvioErrori; chi: string }> = []
    const r = rotte(async (invio, chi) => { visti.push({ invio, chi }); return { ok: true, file: 'x.json' } })
    const e = await r({ metodo: 'POST', percorso: '/api/errori/arrivati', corpo: { da: 'Portatile', versione: '0.81.0', voci: storico(3).voci }, dispositivo: 'pc:pc-prova' })
    expect(e.stato).toBe(200)
    expect(e.corpo).toMatchObject({ arrivati: 3 })
    expect(visti[0]?.invio.da).toBe('Portatile')
    expect(visti[0]?.chi).toContain('pc-prova')
  })

  it('rifiuta un corpo vuoto o troppo grande (arriva senza corpo) con il motivo', async () => {
    const r = rotte(async () => ({ ok: true, file: 'x.json' }))
    const e = await r({ metodo: 'POST', percorso: '/api/errori/arrivati', corpo: undefined, dispositivo: 'pc:pc-prova' })
    expect(e.stato).toBe(400)
    expect(JSON.stringify(e.corpo)).toContain('non è arrivato intero')
  })

  it('solo da un altro PC: il telefono usa /api/errori/aggiungi (quello che arriva qui diventa un compito che cambia il codice)', async () => {
    const visti: InvioErrori[] = []
    const r = rotte(async (invio) => { visti.push(invio); return { ok: true, file: 'x.json' } })
    for (const dispositivo of ['tel-prova', 'locale', undefined]) {
      const e = await r({ metodo: 'POST', percorso: '/api/errori/arrivati', corpo: { da: 'x', voci: storico().voci }, ...(dispositivo !== undefined ? { dispositivo } : {}) })
      expect(e.stato).toBe(403)
    }
    expect(visti).toHaveLength(0)
  })

  it('un PC che non sa ancora ricevere lo dice', async () => {
    const e = await rotte(undefined)({ metodo: 'POST', percorso: '/api/errori/arrivati', corpo: { da: 'x', voci: storico().voci }, dispositivo: 'pc:pc-prova' })
    expect(e.stato).toBe(409)
  })

  it('il telefono non lo chiede attraverso il ponte (lo manda il suo PC)', () => {
    expect(ROTTE_PONTE).not.toContain('/api/errori/arrivati')
  })
})

describe('chi manda: «Manda al PC di sviluppo»', () => {
  const base = {
    io: { id: 'pc-qui', nome: 'Fisso' },
    versione: '0.81.0',
    nomeDi: (pc: string) => (pc === 'pc-la' ? 'Portatile' : undefined),
    log: () => undefined
  }

  it('senza PC scelto o senza errori non manda niente, e lo dice', async () => {
    const chiamate: string[] = []
    const chiama = async (pc: string): Promise<unknown> => { chiamate.push(pc); return {} }
    const salvaQui = (): { ok: false; errore: string } => ({ ok: false, errore: 'no' })
    expect(await mandaErrori({ ...base, pcSviluppo: undefined, storico: storico(), chiama, salvaQui })).toEqual({ ok: false, messaggio: 'Prima scegli il PC di sviluppo.' })
    expect((await mandaErrori({ ...base, pcSviluppo: 'pc-la', storico: { voci: [] }, chiama, salvaQui })).ok).toBe(false)
    expect(chiamate).toEqual([])
  })

  it('verso un altro PC: la rotta firmata del ponte, con chi manda e la versione', async () => {
    const chiamate: Array<{ pc: string; percorso: string; corpo: InvioErrori }> = []
    const e = await mandaErrori({ ...base, pcSviluppo: 'pc-la', storico: storico(2), chiama: async (pc, percorso, corpo) => { chiamate.push({ pc, percorso, corpo }); return {} }, salvaQui: () => ({ ok: false, errore: 'no' }) })
    expect(e).toEqual({ ok: true, messaggio: 'Mandati a Portatile: 2 errori.' })
    expect(chiamate[0]).toMatchObject({ pc: 'pc-la', percorso: '/api/errori/arrivati', corpo: { da: 'Fisso', versione: '0.81.0' } })
    expect(chiamate[0]?.corpo.voci).toHaveLength(2)
  })

  it('se il PC di sviluppo è questo, salva qui senza passare dalla rete', async () => {
    let salvati = 0
    const e = await mandaErrori({ ...base, pcSviluppo: 'pc-qui', storico: storico(), chiama: async () => { throw new Error('non deve chiamare') }, salvaQui: () => { salvati += 1; return { ok: true, file: 'x.json' } } })
    expect(e.ok).toBe(true)
    expect(salvati).toBe(1)
  })

  it('se l’altro PC non risponde, dice perché', async () => {
    const e = await mandaErrori({ ...base, pcSviluppo: 'pc-la', storico: storico(), chiama: async () => { throw new Error('Portatile non raggiungibile') }, salvaQui: () => ({ ok: false, errore: 'no' }) })
    expect(e).toEqual({ ok: false, messaggio: 'Non mandati a Portatile: Portatile non raggiungibile' })
  })

  it('se l’altro PC non risponde, li lascia sul Drive nella sua posta (0.88.2)', async () => {
    const posta: Array<{ pc: string; invio: InvioErrori }> = []
    const e = await mandaErrori({ ...base, pcSviluppo: 'pc-la', storico: storico(3), chiama: async () => { throw new Error('Portatile non raggiungibile') }, salvaQui: () => ({ ok: false, errore: 'no' }), perPosta: async (pc, invio) => { posta.push({ pc, invio }); return true } })
    expect(e).toEqual({ ok: true, messaggio: 'Portatile adesso non risponde: 3 errori lasciati sul Drive, arrivano appena si accende.' })
    expect(posta[0]).toMatchObject({ pc: 'pc-la', invio: { da: 'Fisso', versione: '0.81.0' } })
    expect(posta[0]?.invio.voci).toHaveLength(3)
  })

  it('se nemmeno il Drive prende la voce, dice perché come prima', async () => {
    const e = await mandaErrori({ ...base, pcSviluppo: 'pc-la', storico: storico(), chiama: async () => { throw new Error('Portatile non raggiungibile') }, salvaQui: () => ({ ok: false, errore: 'no' }), perPosta: async () => { throw new Error('Drive spento') } })
    expect(e).toEqual({ ok: false, messaggio: 'Non mandati a Portatile: Portatile non raggiungibile' })
  })
})

describe('lo storico del PC per la pagina e l’app: /api/errori, /api/errori/aggiungi, /api/errori/manda', () => {
  const lato = (): { aggiunti: unknown[]; mandati: number; dep: NonNullable<DipendenzeRotte['errori']> } => {
    const aggiunti: unknown[] = []
    const stato = { mandati: 0 }
    return {
      aggiunti,
      get mandati() { return stato.mandati },
      dep: {
        leggi: () => ({ voci: storico().voci, testo: 'Errori di SierraDeck…', pcSviluppo: 'Portatile' }),
        aggiungi: (e) => { aggiunti.push(e) },
        manda: async () => { stato.mandati += 1; return { ok: true, messaggio: 'Mandati a Portatile: 1 errore.' } }
      }
    }
  }
  const rotteCon = (dep: NonNullable<DipendenzeRotte['errori']>): ReturnType<typeof rotteClient> => rotteClient({
    dispositivi: apriDispositivi(cartella()), chat: () => [], autopiloti: async () => [], errori: dep
  } as unknown as DipendenzeRotte)

  it('il telefono legge lo storico, con il nome del PC di sviluppo, e lo fa mandare', async () => {
    const l = lato()
    const r = rotteCon(l.dep)
    const letto = await r({ metodo: 'POST', percorso: '/api/errori', corpo: {}, dispositivo: 't1' })
    expect(letto.corpo).toMatchObject({ testo: 'Errori di SierraDeck…', pcSviluppo: 'Portatile' })
    const mandato = await r({ metodo: 'POST', percorso: '/api/errori/manda', corpo: {}, dispositivo: 't1' })
    expect(mandato.corpo).toMatchObject({ ok: true })
    expect(l.mandati).toBe(1)
  })

  it('il telefono aggiunge i suoi errori con il loro posto; al massimo venti per volta', async () => {
    const l = lato()
    const errori = Array.from({ length: 30 }, (_, i) => ({ testo: `boom ${i}`, cosa: 'apro una chat' }))
    const e = await rotteCon(l.dep)({ metodo: 'POST', percorso: '/api/errori/aggiungi', corpo: { dove: 'app', versione: '2.81.0', errori }, dispositivo: 't1' })
    expect(e.corpo).toEqual({ aggiunti: 20 })
    expect(l.aggiunti[0]).toEqual({ dove: 'app', testo: 'boom 0', cosa: 'apro una chat', versione: '2.81.0' })
  })

  it('un altro PC non legge né scrive lo storico di questo', async () => {
    const e = await rotteCon(lato().dep)({ metodo: 'POST', percorso: '/api/errori', corpo: {}, dispositivo: 'pc:pc-prova' })
    expect(e.stato).toBe(403)
  })
})
