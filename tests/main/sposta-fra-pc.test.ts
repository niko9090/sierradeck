import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  creaSposta, creaLatoProprietario, pulisciCopia, giornaleSuDisco, vistaSposta,
  type DipendenzeSposta, type GiornaleSposta, type ManifestoSposta, type ProgressoSalvataggio
} from '../../src/main/progetti/sposta'
import { pathToSlug } from '../../src/main/indexer/project-scanner'
import { creaClientPcRemoto, ErroreRemoto } from '../../src/main/pc-remoto'
import { provaCasa } from '../../src/main/casa-firma'
import { datiPannello, pcPerPannello } from '../../src/main/pannello-drive-dati'
import { MOTIVO_DRIVE_PIENO_SPOSTA, percentualeSposta, type VistaSposta } from '../../src/shared/sposta'
import type { BattitoPc } from '../../src/shared/posta'
import { type RegistroProgetti, type RegistroProgettiStore } from '../../src/main/progetti/registro'

/**
 * «Sposta su questo PC» con il Drive pieno e i passi lunghi (0.98.x): avvio
 * rifiutato subito, il proprietario che carica in sottofondo e dice a che
 * punto è, niente «fatta» senza registro sul Drive o posta partita, tempo
 * massimo di attesa, «Apri su» con la sua causa, «acceso» dal bussare.
 */
const sha = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex')

function memoria(r: RegistroProgetti): RegistroProgettiStore & { r: RegistroProgetti } {
  const s = { r, leggi: () => s.r, scrivi: (x: RegistroProgetti) => { s.r = JSON.parse(JSON.stringify(x)) as RegistroProgetti } }
  return s
}

type Opzioni = {
  salva?: (onProgresso?: (p: ProgressoSalvataggio) => void) => Promise<{ ok: boolean; messaggio?: string }>
  puoCaricare?: () => string | undefined
}

function mondo(opz: Opzioni = {}) {
  const base = mkdtempSync(join(tmpdir(), 'sd-sposta-pc-'))
  const fisso = { id: 'pc-f', nome: 'Fisso', cartellaProgetti: join(base, 'fisso', 'Progetti') }
  const port = { id: 'pc-l', nome: 'Portatile', cartellaProgetti: join(base, 'port', 'Progetti') }
  const percorsoDa = join(fisso.cartellaProgetti, 'Sito')
  mkdirSync(join(percorsoDa, 'src'), { recursive: true })
  writeFileSync(join(percorsoDa, 'README.md'), 'ciao')
  writeFileSync(join(percorsoDa, 'src', 'a.ts'), 'export const a = 1')
  const reg: RegistroProgetti = { versione: 1, progetti: [{ id: 'p1', nome: 'Sito', aggiuntoIl: '', proprietario: 'pc-f', percorso: percorsoDa, proprietarioDal: '2026-10-01T00:00:00.000Z' }] }
  const regFisso = memoria(JSON.parse(JSON.stringify(reg)) as RegistroProgetti)
  const regPort = memoria(JSON.parse(JSON.stringify(reg)) as RegistroProgetti)
  const blob = new Map<string, Buffer>()
  const drive: ManifestoSposta = { file: {} }
  const carica = (k: string, b: Buffer): void => { blob.set(k, b); drive.file[k] = { nome: `f_${sha(k)}`, size: b.length, mtime: 1_700_000_000_000, sha: sha(b) } }
  const radiceChatFisso = join(base, 'fisso', 'claude')
  const radiceChatPort = join(base, 'port', 'claude')
  const slugDa = pathToSlug(percorsoDa)
  mkdirSync(join(radiceChatFisso, slugDa), { recursive: true })
  writeFileSync(join(radiceChatFisso, slugDa, 'ses-1.jsonl'), '{"cwd":"x"}\n')
  const salvaFisso = async (): Promise<{ ok: boolean }> => {
    carica('progetto-p1/README.md', readFileSync(join(percorsoDa, 'README.md')))
    carica('progetto-p1/src/a.ts', readFileSync(join(percorsoDa, 'src', 'a.ts')))
    carica(`chat/${slugDa}/ses-1.jsonl`, readFileSync(join(radiceChatFisso, slugDa, 'ses-1.jsonl')))
    return { ok: true }
  }
  const inRecupero = (c: string): { ok: boolean } => { renameSync(c, `${c}.recupero`); return { ok: true } }
  let fermate = 0
  let salvataggi = 0
  let aperteFisso: { sessione?: string; alLavoro: boolean }[] = []
  const proprietario = creaLatoProprietario({
    io: () => fisso,
    registro: regFisso,
    chatAperte: () => aperteFisso,
    fermaChat: async () => { fermate += aperteFisso.length; const n = aperteFisso.length; aperteFisso = []; return n },
    salva: async (onP) => { salvataggi += 1; return (opz.salva ?? salvaFisso)(onP) },
    ...(opz.puoCaricare !== undefined ? { puoCaricare: opz.puoCaricare } : {}),
    manifestoDrive: async () => JSON.parse(JSON.stringify(drive)) as ManifestoSposta,
    pulisci: ({ progetto, percorso }) => pulisciCopia({
      progetto, percorso, cartellaProgetti: fisso.cartellaProgetti,
      chatAperte: () => aperteFisso.length, gitDaSalvare: async () => 0,
      manifestoDrive: async () => drive, inRecupero
    }),
    primaRispostaMs: 0
  })
  let fissoAcceso = true
  const chiamate: string[] = []
  const posta: { voce: string; comando: unknown }[] = []
  const stato = { postaFunziona: true, registroOk: true, drivePieno: () => false, ora: Date.parse('2026-11-09T10:00:00.000Z'), vivoDa: undefined as number | undefined }
  const giornale = giornaleSuDisco(join(base, 'port', 'dati'))
  const viste: VistaSposta[] = []
  let allaLettura: (() => void) | undefined
  const deps = (): DipendenzeSposta => ({
    io: () => port,
    registro: regPort,
    giornale,
    driveNonPronto: () => undefined,
    drivePieno: () => stato.drivePieno(),
    vivoDa: () => stato.vivoDa,
    chiamaPc: async (_pc, percorso, corpo) => {
      chiamate.push(percorso)
      if (!fissoAcceso) throw new ErroreRemoto('irraggiungibile', 'il fisso non risponde')
      const c = corpo as { progetto: string; verso: string; versoNome: string; percorso: string; proprietarioDal: string; sposta?: string; asincrono?: boolean }
      if (percorso === '/api/sposta/prepara') return proprietario.prepara(c)
      if (percorso === '/api/sposta/concludi') return proprietario.concludi(c)
      throw new Error(`rotta inattesa ${percorso}`)
    },
    posta: {
      chiedi: async (_pc, comando) => { if (!stato.postaFunziona) return undefined; const voce = `v${posta.length + 1}`; posta.push({ voce, comando }); return voce },
      esito: async () => ({ stato: 'attesa' })
    },
    manifestoDrive: async () => JSON.parse(JSON.stringify(drive)) as ManifestoSposta,
    leggiFileDrive: async (k) => { allaLettura?.(); return blob.get(k) },
    radiceChat: () => radiceChatPort,
    salvaRegistro: async () => (stato.registroOk ? { ok: true } : { ok: false, messaggio: 'Drive non raggiungibile' }),
    inRecupero,
    nomeDi: (id) => (id === 'pc-f' ? 'Fisso' : id),
    adesso: () => new Date(stato.ora).toISOString(),
    nuovoId: () => 'sp-1',
    avanzamento: (g) => { const v = vistaSposta(g); if (v !== undefined) viste.push(v) },
    pausaAttesaMs: 0,
    pausaCaricoMs: 0
  })
  return {
    port, percorsoDa, regFisso, regPort, drive, posta, giornale, deps, carica, stato, viste, chiamate, proprietario,
    fermate: () => fermate,
    salvataggi: () => salvataggi,
    apri: (c: { sessione?: string; alLavoro: boolean }[]) => { aperteFisso = c },
    spegni: () => { fissoAcceso = false },
    allaLettura: (f: () => void) => { allaLettura = f },
    quiPercorso: join(port.cartellaProgetti, 'Sito')
  }
}

const dopo = (ms = 10): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Il proprietario lavora in sottofondo: si rilegge lo stato finché non ha risposto (come fa il giro del programma). */
async function giro(s: ReturnType<typeof creaSposta>, g0: GiornaleSposta): Promise<GiornaleSposta> {
  let g = g0
  for (let i = 0; i < 20 && g.fase === 'attesa-proprietario' && g.attesa?.includes('sta lavorando') !== true && g.attesa?.includes('sta ') !== true; i += 1) {
    await dopo(2)
    g = (await s.riprendi()) ?? g
  }
  return g
}

describe('Drive pieno all’avvio', () => {
  it('rifiuta subito con un motivo chiaro: niente cartella, niente chat chiuse, nessuna richiesta', async () => {
    const m = mondo()
    m.apri([{ sessione: 'ses-1', alLavoro: false }])
    m.stato.drivePieno = () => true
    const g = await creaSposta(m.deps()).avvia('p1')
    expect(g.fase).toBe('fallita')
    expect(g.errore).toBe(MOTIVO_DRIVE_PIENO_SPOSTA)
    expect(g.errore).toContain('Drive è pieno')
    expect(existsSync(m.quiPercorso)).toBe(false)
    expect(m.fermate()).toBe(0)
    expect(m.chiamate).toHaveLength(0)
    expect(vistaSposta(g)?.puoRiprovare).toBe(true)
  })

  it('il proprietario con il Drive pieno non ferma le chat: lo dice e basta, senza «riprova»', async () => {
    const m = mondo({ puoCaricare: () => MOTIVO_DRIVE_PIENO_SPOSTA })
    m.apri([{ sessione: 'ses-1', alLavoro: false }])
    const g = await creaSposta(m.deps()).avvia('p1')
    expect(g.fase).toBe('fallita')
    expect(g.errore).toContain('Drive è pieno')
    expect(m.fermate()).toBe(0)
    expect(m.salvataggi()).toBe(0)
  })

  it('proprietario spento e Drive pieno: «il Drive è pieno, libera spazio prima», non un generico fallita', async () => {
    const m = mondo()
    m.spegni()
    let n = 0
    m.stato.drivePieno = () => { n += 1; return n > 1 } // all'avvio non lo era ancora
    const g = await creaSposta(m.deps()).avvia('p1')
    expect(g.fase).toBe('fallita')
    expect(g.errore).toContain('Il Drive è pieno, libera spazio prima')
    expect(m.posta).toHaveLength(0)
  })
})

describe('«prepara» lungo: parte in sottofondo e si legge lo stato', () => {
  it('un caricamento lungo non è più «non ha finito entro 4 secondi»: attesa con i numeri, poi si va avanti', async () => {
    let rilascia: () => void = () => {}
    const m = mondo({
      salva: async (onP) => {
        onP?.({ fase: 'carico', fatto: 3, totale: 10, unita: 'file' })
        await new Promise<void>((r) => { rilascia = r })
        return { ok: true }
      }
    })
    // Il file del manifesto arriva quando il salvataggio finisce.
    const s = creaSposta(m.deps())
    const g = await s.avvia('p1')
    expect(g.fase).toBe('attesa-proprietario')
    expect(g.messaggio).not.toContain('4 secondi')
    const v = vistaSposta(g) as VistaSposta
    expect(v).toMatchObject({ fileFatti: 3, fileTotali: 10, percentualePasso: 30, percentuale: percentualeSposta('attesa-proprietario', 30), puoRiprovare: false })
    expect(v.attesa).toContain('Fisso')
    expect(v.ultimoContatto).toBeDefined()
    // Rilanciare la richiesta mentre carica non fa partire un secondo lavoro.
    await s.riprendi()
    expect(m.salvataggi()).toBe(1)
    // Finito il caricamento (i file arrivano sul Drive), si scarica e si chiude.
    m.carica('progetto-p1/README.md', Buffer.from('ciao'))
    m.carica('progetto-p1/src/a.ts', Buffer.from('export const a = 1'))
    m.carica(`chat/${pathToSlug(m.percorsoDa)}/ses-1.jsonl`, Buffer.from('{"cwd":"x"}\n'))
    rilascia()
    // Il lavoro in sottofondo finisce quando può: si aspetta che lo stato cambi, non un tempo fisso (sotto carico 10 ms non bastavano).
    let fine = await s.riprendi()
    for (let i = 0; i < 400 && fine?.fase === 'attesa-proprietario'; i += 1) {
      await dopo(5)
      fine = (await s.riprendi()) ?? fine
    }
    expect(fine?.fase).toBe('fatta')
  })

  it('un PC proprietario con la versione di prima (risposta lenta, 504) resta in attesa invece di fermarsi', async () => {
    const m = mondo()
    const d = m.deps()
    const s = creaSposta({ ...d, chiamaPc: async () => { throw new ErroreRemoto('http', 'Fisso risponde, ma non ha finito entro 4 secondi: riprova fra poco.', 504) } })
    const g = await s.avvia('p1')
    expect(g.fase).toBe('attesa-proprietario')
    expect(g.attesa).toContain('sta ancora lavorando')
  })
})

describe('niente «fatta» senza registro sul Drive o posta partita', () => {
  it('il registro non sale: resta al passo «cambio» e lo dice; quando sale, finisce', async () => {
    const m = mondo()
    m.stato.registroOk = false
    const s = creaSposta(m.deps())
    const g = await giro(s, await s.avvia('p1'))
    expect(g.fase).toBe('cambio')
    expect(g.attesa).toContain('registro')
    expect(vistaSposta(g)?.attesa).toContain('Drive non raggiungibile')
    m.stato.registroOk = true
    expect((await s.riprendi())?.fase).toBe('fatta')
  })

  it('Drive pieno prima del cambio: il registro di qui non cambia finché non c’è spazio', async () => {
    const m = mondo()
    let pieno = false
    m.stato.drivePieno = () => pieno
    m.allaLettura(() => { pieno = true })
    const s = creaSposta(m.deps())
    const g = await giro(s, await s.avvia('p1'))
    expect(g.fase).toBe('cambio')
    expect(g.attesa).toContain('Drive è pieno')
    expect(m.regPort.r.progetti[0]?.proprietario).toBe('pc-f')
    pieno = false
    expect((await s.riprendi())?.fase).toBe('fatta')
    expect(m.regPort.r.progetti[0]?.proprietario).toBe('pc-l')
  })

  it('la posta per la vecchia copia non parte: non è «fatta», aspetta; poi parte e finisce', async () => {
    const m = mondo()
    const d = m.deps()
    // Il fisso si spegne appena il registro è salito: «concludi» non lo raggiunge.
    const s = creaSposta({ ...d, salvaRegistro: async () => { m.spegni(); return { ok: true } } })
    m.stato.postaFunziona = false
    const g = await giro(s, await s.avvia('p1'))
    expect(g.fase).toBe('vecchia-copia')
    expect(g.attesa).toContain('posta')
    m.stato.postaFunziona = true
    const fine = await s.riprendi()
    expect(fine).toMatchObject({ fase: 'fatta', vecchiaCopia: 'in-attesa' })
    expect(m.posta[0]?.comando).toMatchObject({ tipo: 'sposta-concludi' })
  })

  it('dopo il tempo massimo senza posta: ferma con il motivo, e «Riprova» riparte da lì', async () => {
    const m = mondo()
    const d = m.deps()
    const s = creaSposta({ ...d, salvaRegistro: async () => { m.spegni(); return { ok: true } } })
    m.stato.postaFunziona = false
    expect((await giro(s, await s.avvia('p1'))).fase).toBe('vecchia-copia')
    m.stato.ora += 31 * 60_000
    const g = await s.riprendi()
    expect(g?.fase).toBe('fallita')
    expect(g?.errore).toContain('30 minuti')
    expect(g?.messaggio).toContain('già di questo PC')
    m.stato.postaFunziona = true
    const di = await s.avvia('p1')
    expect(di.fase).toBe('fatta')
    expect(m.posta).toHaveLength(1)
  })
})

describe('tempo massimo di attesa del proprietario', () => {
  it('oltre 30 minuti con una chat che lavora: fallita con il motivo, «Riprova» disponibile', async () => {
    const m = mondo()
    m.apri([{ sessione: 'ses-1', alLavoro: true }])
    const s = creaSposta(m.deps())
    const g = await s.avvia('p1')
    expect(g.fase).toBe('attesa-proprietario')
    expect(g.attesa).toContain('chat sta lavorando')
    m.stato.ora += 29 * 60_000
    expect((await s.riprendi())?.fase).toBe('attesa-proprietario')
    m.stato.ora += 2 * 60_000
    const f = await s.riprendi()
    expect(f?.fase).toBe('fallita')
    expect(f?.errore).toContain('entro 30 minuti')
    expect(f?.errore).toContain('chat sta lavorando')
    expect(vistaSposta(f)?.puoRiprovare).toBe(true)
    // Riprova, ora che la chat ha finito.
    m.apri([])
    expect((await giro(s, await s.avvia('p1'))).fase).toBe('fatta')
  })

  it('con la richiesta nella posta di un PC spento si aspetta di più (un giorno), poi si ferma', async () => {
    const m = mondo()
    m.spegni()
    const s = creaSposta(m.deps())
    expect((await s.avvia('p1')).fase).toBe('attesa-proprietario')
    m.stato.ora += 5 * 3_600_000
    expect((await s.riprendi())?.fase).toBe('attesa-proprietario')
    m.stato.ora += 20 * 3_600_000
    const f = await s.riprendi()
    expect(f?.fase).toBe('fallita')
    expect(f?.errore).toContain('24 ore')
  })
})

describe('i numeri dell’avanzamento', () => {
  it('file e byte fatti/totali, percentuale complessiva e del passo, ultimo contatto, motivo dell’attesa', async () => {
    const m = mondo()
    for (let i = 0; i < 45; i += 1) m.carica(`progetto-p1/extra/f${i}.txt`, Buffer.from(`file ${i}`))
    const s = creaSposta(m.deps())
    const g = await giro(s, await s.avvia('p1'))
    expect(g.fase).toBe('fatta')
    const inScarico = m.viste.filter((v) => v.fase === 'scarico' && v.fileTotali !== undefined)
    expect(inScarico.length).toBeGreaterThan(1)
    expect(inScarico.some((v) => (v.fileFatti ?? 0) >= 20)).toBe(true)
    expect(inScarico.every((v) => v.fileTotali === 48 && (v.byteTotali ?? 0) > 0 && v.percentualePasso !== undefined)).toBe(true)
    // La percentuale complessiva sale sempre e arriva a 100.
    const perc = m.viste.map((v) => v.percentuale ?? 0)
    expect(perc.every((p, i) => i === 0 || p >= (perc[i - 1] ?? 0))).toBe(true)
    expect(vistaSposta(g)?.percentuale).toBe(100)
  })

  it('l’ultimo contatto col PC di prima viene dal bussare riuscito, e la vista dice perché si aspetta', async () => {
    const m = mondo()
    m.spegni()
    m.stato.vivoDa = 30_000
    const g = await creaSposta(m.deps()).avvia('p1')
    const v = vistaSposta(g) as VistaSposta
    expect(v.ultimoContatto).toBe(new Date(m.stato.ora - 30_000).toISOString())
    expect(v.attesa).toBe('Fisso è spento')
    expect(v.percentuale).toBeGreaterThanOrEqual(2)
  })
})

/* ------------------------------------------------------------------ */

const ORA = Date.parse('2026-11-09T10:00:00.000Z')
const PORTATILE: BattitoPc = {
  pcId: 'B', nome: 'Portatile', versione: '0.98.0', battito: new Date(ORA - 60_000).toISOString(),
  cartelle: ['C:\\lavoro'], chat: [], indirizzi: ['192.168.1.50'], porta: 47640
}
function fintoFetch(stato: number, corpo: unknown): typeof fetch {
  return (async (url: string | URL | Request): Promise<Response> => {
    const u = new URL(String(url))
    if (u.pathname === '/api/casa') return new Response(JSON.stringify({ prova: provaCasa('chiave-di-casa-B', u.searchParams.get('sfida') ?? '') }), { status: 200 })
    return new Response(JSON.stringify(corpo), { status: stato, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
}
const clientRemoto = (f: typeof fetch): ReturnType<typeof creaClientPcRemoto> =>
  creaClientPcRemoto({ battiti: () => [PORTATILE], chiavePer: () => 'chiave-di-casa-B', mioNome: () => 'Torre', fetch: f, adesso: () => ORA, attesaMs: 200 })

describe('«Apri su»: la cartella che manca ha il suo motivo', () => {
  it('404 «cartella inesistente»: il PC risponde, ma la cartella non c’è (non «la chat non è aperta»)', async () => {
    const c = clientRemoto(fintoFetch(404, { errore: 'cartella inesistente' }))
    const e = await c.chiama('B', '/api/apri', { cartella: 'X' }).catch((x: unknown) => x as ErroreRemoto)
    expect((e as ErroreRemoto).motivo).toBe('cartella')
    expect((e as ErroreRemoto).message).toContain('risponde, ma lì la cartella del progetto non c’è')
    expect((e as ErroreRemoto).message).not.toContain('questa chat là non è aperta')
    expect((e as ErroreRemoto).message).toContain('Sposta su questo PC')
    // Ha risposto: per «acceso» conta come ultimo contatto.
    expect(c.vivoDa('B')).toBe(0)
  })

  it('un altro 404 (una chat sparita) resta «la chat non è aperta»', async () => {
    const c = clientRemoto(fintoFetch(404, { errore: 'chat non trovata' }))
    const e = await c.chiama('B', '/api/storia', { chat: 'x' }).catch((x: unknown) => x as ErroreRemoto)
    expect((e as ErroreRemoto).motivo).toBe('chat')
  })
})

describe('«acceso» in Progetti: battito o ultimo bussare', () => {
  const costruisci = (rispostoDa?: (pcId: string) => number | undefined): boolean | undefined => {
    const vecchio: BattitoPc = { ...PORTATILE, battito: new Date(ORA - 3 * 3_600_000).toISOString() }
    const p = datiPannello({
      io: { id: 'A', nome: 'Torre', battito: new Date(ORA).toISOString() },
      pc: pcPerPannello([vecchio], (b) => b.nome, rispostoDa, ORA),
      locali: [], manifesto: undefined, aperteQui: [], titoliNoti: [],
      progetti: [{ id: 'p1', nome: 'Sito', proprietario: 'B', percorso: 'C:\\lavoro\\Sito' }],
      adesso: ORA
    })
    return p.progetti[0]?.proprietarioAcceso
  }

  it('battito fermo (Drive pieno) e nessun bussare: non acceso', () => {
    expect(costruisci()).toBe(false)
    expect(costruisci(() => undefined)).toBe(false)
  })
  it('battito fermo ma ha risposto da poco: acceso', () => {
    expect(costruisci(() => 20_000)).toBe(true)
  })
  it('ha risposto ore fa: non basta', () => {
    expect(costruisci(() => 3 * 3_600_000)).toBe(false)
  })
})
