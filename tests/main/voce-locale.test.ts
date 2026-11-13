import { describe, it, expect, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cancellaSicura } from '@shared/cancella-sicura'
import { IMPRONTA_SBAGLIATA, type IdModello, type Pezzo, type StatoModello } from '@shared/modello-voce'
import { argomentiWhisper, creaVoceLocale, filiWhisper, testoDaUscita, wav, type Esecutore, type Estrattore, type Scaricatore } from '../../src/main/voce-locale'

/**
 * Whisper sul PC (Parlato, 13/11): lo scaricamento con impronta, lo stato
 * all'avvio, la trascrizione. La rete è finta: niente si scarica davvero.
 */

const temp: string[] = []
afterEach(() => { for (const t of temp.splice(0)) cancellaSicura(t, { dentro: [tmpdir()] }) })

const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex')
const byte = (n: number, seme: number): Uint8Array => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seme) % 251)

const ZIP = byte(700_000, 1)
const MOD_P = byte(1_300_000, 2)
const MOD_L = byte(400_000, 3)
const pezzo = (id: Pezzo['id'], b: Uint8Array, file: string): Pezzo => ({ id, nome: id, url: `https://esempio.invalid/${file}`, sha256: sha(b), byte: b.byteLength, file })
const CATALOGO = {
  programma: pezzo('programma', ZIP, 'w.zip'),
  modelli: { preciso: pezzo('preciso', MOD_P, 'p.bin'), leggero: pezzo('leggero', MOD_L, 'l.bin') } as Record<IdModello, Pezzo>
}

/** Una rete finta: risponde coi byte dati, a pezzi da 64 KB; `rotto` cambia un byte. */
function rete(opz: { rotto?: string; status?: number; ferma?: { dopo: number } } = {}): { scarica: Scaricatore; chiesti: string[] } {
  const chiesti: string[] = []
  const dati: Record<string, Uint8Array> = { 'w.zip': ZIP, 'p.bin': MOD_P, 'l.bin': MOD_L }
  const scarica: Scaricatore = async (url, init) => {
    chiesti.push(url)
    const nome = url.split('/').pop()!
    const b = Uint8Array.from(dati[nome]!)
    if (opz.rotto === nome) b[10] = (b[10]! + 1) % 256
    if (opz.status !== undefined) return { ok: false, status: opz.status, body: null }
    let i = 0
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        if (init.signal.aborted) { c.error(new Error('annullato')); return }
        if (opz.ferma !== undefined && i >= opz.ferma.dopo) return new Promise<void>((ok) => init.signal.addEventListener('abort', () => { c.error(new Error('annullato')); ok() }))
        if (i >= b.byteLength) { c.close(); return }
        c.enqueue(b.subarray(i, i + 65_536))
        i += 65_536
      }
    })
    return { ok: true, status: 200, body }
  }
  return { scarica, chiesti }
}

/** L'estrattore finto: scrive i file che servono come farebbe tar. */
const estrai: Estrattore = async (_zip, dest) => {
  mkdirSync(join(dest, 'Release'), { recursive: true })
  for (const f of ['whisper-cli.exe', 'whisper.dll', 'ggml.dll']) writeFileSync(join(dest, 'Release', f), 'finto')
}

function prepara(o: { scarica: Scaricatore; esegui?: Esecutore }): { voce: ReturnType<typeof creaVoceLocale>; stati: StatoModello[]; cartella: string; dati: string } {
  const dati = mkdtempSync(join(tmpdir(), 'sd-voce-'))
  temp.push(dati)
  const cartella = join(dati, 'voce-locale')
  const stati: StatoModello[] = []
  const voce = creaVoceLocale({ cartella, dati, scarica: o.scarica, estrai, ...(o.esegui !== undefined ? { esegui: o.esegui } : {}), catalogo: CATALOGO, log: () => {}, avvisa: (s) => stati.push(s) })
  return { voce, stati, cartella, dati }
}

describe('voce locale: scaricamento', () => {
  it('scarica programma e modello, controlla le impronte, segna pronto e si ritrova al riavvio', async () => {
    const r = rete()
    const { voce, stati, cartella, dati } = prepara({ scarica: r.scarica })
    expect(voce.stato()).toEqual({ fase: 'assente' })
    const fine = await voce.scarica('preciso')
    expect(fine).toEqual({ fase: 'pronto', modello: 'preciso', byte: ZIP.byteLength + MOD_P.byteLength })
    expect(r.chiesti.map((u) => u.split('/').pop())).toEqual(['w.zip', 'p.bin'])
    expect(stati.map((s) => s.fase)).toEqual(expect.arrayContaining(['scarica', 'verifica', 'estrai', 'pronto']))
    expect(existsSync(join(cartella, 'programma', 'Release', 'whisper-cli.exe'))).toBe(true)
    expect(readFileSync(join(cartella, 'modelli', 'p.bin')).equals(Buffer.from(MOD_P))).toBe(true)
    // Lo zip si butta, niente file parziali.
    expect(existsSync(join(cartella, 'w.zip'))).toBe(false)
    expect(readdirSync(join(cartella, 'modelli')).filter((f) => f.endsWith('.parziale'))).toEqual([])
    // Un avvio nuovo lo ritrova pronto senza scaricare.
    const dopo = creaVoceLocale({ cartella, dati, scarica: r.scarica, estrai, catalogo: CATALOGO, log: () => {}, avvisa: () => {} })
    expect(dopo.stato()).toMatchObject({ fase: 'pronto', modello: 'preciso' })
  })

  it('un file con l’impronta sbagliata si butta e lo stato dice perché', async () => {
    const { voce } = prepara({ scarica: rete({ rotto: 'p.bin' }).scarica })
    const fine = await voce.scarica('preciso')
    expect(fine).toEqual({ fase: 'errore', messaggio: IMPRONTA_SBAGLIATA })
  })

  it('il server che risponde male è un errore con il codice', async () => {
    const { voce, cartella } = prepara({ scarica: rete({ status: 404 }).scarica })
    const fine = await voce.scarica('leggero')
    expect(fine.fase).toBe('errore')
    expect(fine.fase === 'errore' ? fine.messaggio : '').toContain('404')
    expect(existsSync(join(cartella, 'w.zip.parziale'))).toBe(false)
  })

  it('annullare a metà torna ad assente e toglie il parziale', async () => {
    const { voce, cartella } = prepara({ scarica: rete({ ferma: { dopo: 65_536 * 3 } }).scarica })
    const lavoro = voce.scarica('preciso')
    await new Promise((ok) => setTimeout(ok, 50))
    expect(voce.stato().fase).toBe('scarica')
    voce.annulla()
    expect(await lavoro).toEqual({ fase: 'assente' })
    expect(existsSync(join(cartella, 'w.zip.parziale'))).toBe(false)
  })

  it('cambiare modello scarica solo il modello e toglie quello di prima', async () => {
    const r = rete()
    const { voce, cartella } = prepara({ scarica: r.scarica })
    await voce.scarica('preciso')
    r.chiesti.length = 0
    expect(await voce.scarica('leggero')).toMatchObject({ fase: 'pronto', modello: 'leggero' })
    expect(r.chiesti.map((u) => u.split('/').pop())).toEqual(['l.bin'])
    expect(existsSync(join(cartella, 'modelli', 'p.bin'))).toBe(false)
  })

  it('«Togli» cancella la cartella della voce, dentro i dati', async () => {
    const { voce, cartella, dati } = prepara({ scarica: rete().scarica })
    await voce.scarica('leggero')
    expect(await voce.rimuovi()).toEqual({ fase: 'assente' })
    expect(existsSync(cartella)).toBe(false)
    expect(existsSync(dati)).toBe(true)
  })
})

describe('voce locale: trascrizione', () => {
  const pcm = new Uint8Array(32_000) // un secondo di silenzio

  it('senza modello non trascrive', async () => {
    const { voce } = prepara({ scarica: rete().scarica })
    expect(await voce.trascrivi(pcm, { parola: 'Sierra' })).toMatchObject({ ok: false })
  })

  it('scrive il WAV, chiama whisper-cli in italiano con la parola di sveglia, legge il testo e butta il file', async () => {
    const chiamate: string[][] = []
    const esegui: Esecutore = async (_exe, args) => {
      chiamate.push(args)
      const f = args[args.indexOf('-f') + 1]!
      expect(readFileSync(f).subarray(0, 4).toString()).toBe('RIFF')
      return { codice: 0, out: ' Sierra, aggiungi un test.\n[BLANK_AUDIO]\n', err: '' }
    }
    const { voce, cartella } = prepara({ scarica: rete().scarica, esegui })
    await voce.scarica('leggero')
    expect(await voce.trascrivi(pcm, { parola: 'Sierra' })).toMatchObject({ ok: true, testo: 'Sierra, aggiungi un test.' })
    const a = chiamate[0]!
    expect(a).toEqual(expect.arrayContaining(['-l', 'it', '-nt', '--prompt', 'Sierra.']))
    expect(a[a.indexOf('-m') + 1]).toBe(join(cartella, 'modelli', 'l.bin'))
    expect(readdirSync(join(cartella, 'tmp'))).toEqual([])
  })

  it('whisper che fallisce dà un esito, non un’eccezione', async () => {
    const { voce } = prepara({ scarica: rete().scarica, esegui: async () => ({ codice: 1, out: '', err: 'errore' }) })
    await voce.scarica('leggero')
    expect(await voce.trascrivi(pcm, { parola: 'Sierra' })).toMatchObject({ ok: false })
  })

  it('una frase alla volta; oltre due in attesa la nuova si rifiuta', async () => {
    const liberi: Array<() => void> = []
    const esegui: Esecutore = () => new Promise((ok) => { liberi.push(() => ok({ codice: 0, out: 'ciao', err: '' })) })
    const attendi = async (n: number): Promise<void> => { for (let i = 0; i < 500 && liberi.length < n; i += 1) await new Promise((ok) => setTimeout(ok, 10)) }
    const { voce } = prepara({ scarica: rete().scarica, esegui })
    await voce.scarica('leggero')
    const a = voce.trascrivi(pcm, { parola: 'Sierra' })
    const b = voce.trascrivi(pcm, { parola: 'Sierra' })
    expect(await voce.trascrivi(pcm, { parola: 'Sierra' })).toEqual({ ok: false, messaggio: 'occupato' })
    await attendi(1)
    // La seconda non parte finché la prima non ha finito.
    await new Promise((ok) => setTimeout(ok, 30))
    expect(liberi.length).toBe(1)
    liberi[0]!()
    expect(await a).toMatchObject({ ok: true })
    await attendi(2)
    liberi[1]!()
    expect(await b).toMatchObject({ ok: true })
  })
})

describe('voce locale: pezzi puri', () => {
  it('argomenti: finestra ridotta per le frasi corte, intera per le lunghe', () => {
    const base = { modello: 'm', wav: 'w', fili: 4, parola: 'Sierra' }
    expect(argomentiWhisper({ ...base, durataMs: 3000 })).toEqual(expect.arrayContaining(['-ac', '512']))
    expect(argomentiWhisper({ ...base, durataMs: 12_000 })).toEqual(expect.arrayContaining(['-ac', '768']))
    expect(argomentiWhisper({ ...base, durataMs: 15_000 })).not.toContain('-ac')
  })
  it('fili fra 2 e 6', () => {
    expect(filiWhisper(2)).toBe(2)
    expect(filiWhisper(8)).toBe(4)
    expect(filiWhisper(32)).toBe(6)
  })
  it('il testo dall’uscita, senza segni', () => {
    expect(testoDaUscita('  Ciao.\r\n [BLANK_AUDIO]\n  come va?\n')).toBe('Ciao. come va?')
  })
  it('il WAV ha la testa giusta', () => {
    const w = wav(new Uint8Array(100))
    expect(w.byteLength).toBe(144)
    expect(w.readUInt32LE(24)).toBe(16_000)
    expect(w.readUInt16LE(22)).toBe(1)
    expect(w.readUInt32LE(40)).toBe(100)
  })
})
