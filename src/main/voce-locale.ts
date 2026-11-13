import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { open, unlink, writeFile } from 'node:fs/promises'
import { cpus, setPriority, constants as costantiOs } from 'node:os'
import { join } from 'node:path'
import { cancellaSicuraAsincrona } from '@shared/cancella-sicura'
import {
  avanzaModello, ESEGUIBILE, FILE_DEL_PROGRAMMA, inCorso, MODELLI, PROGRAMMA,
  type EventoModello, type IdModello, type Pezzo, type StatoModello
} from '@shared/modello-voce'

/**
 * **Whisper sul PC** per «Parlato» (13/11). Scarica (col consenso, chiesto
 * dalla finestra) whisper.cpp e un modello nella cartella dei dati, controlla
 * le impronte, e trascrive i pezzi di voce che gli manda la finestra:
 * l'audio arriva qui, va in un file temporaneo, `whisper-cli` lo legge e il
 * file si cancella. Niente rete dopo lo scaricamento.
 *
 * Un processo `whisper-cli` per frase, con priorità bassa: il resto del PC
 * non deve rallentare mentre capisce. Una frase alla volta.
 */

/** La risposta di rete che serve qui: `net.fetch` di Electron e `fetch` di Node vanno bene tutti e due. */
export type RispostaRete = {
  ok: boolean
  status: number
  body: ReadableStream<Uint8Array> | null
}
export type Scaricatore = (url: string, init: { signal: AbortSignal }) => Promise<RispostaRete>
export type Esecutore = (exe: string, args: string[], opz: { timeoutMs: number }) => Promise<{ codice: number | null; out: string; err: string }>
export type Estrattore = (zip: string, dest: string, nomi: readonly string[]) => Promise<void>

export type DipendenzeVoce = {
  /** La cartella della voce: `<dati>/voce-locale`. */
  cartella: string
  /** La cartella dei dati che la contiene: le cancellazioni restano dentro. */
  dati: string
  scarica: Scaricatore
  esegui?: Esecutore
  estrai?: Estrattore
  log: (riga: string) => void
  avvisa: (s: StatoModello) => void
  /** I file da scaricare; di serie quelli di `@shared/modello-voce` (le prove ne passano di finti). */
  catalogo?: { programma: Pezzo; modelli: Record<IdModello, Pezzo> }
}

export type EsitoTrascrizione = { ok: true; testo: string; ms: number } | { ok: false; messaggio: string }

/** Quanto audio al più per frase (20 s a 16 kHz, 16 bit). */
export const PCM_MAX_BYTE = 16_000 * 2 * 20

type Segnato = { modello: IdModello; programma: string; impronta: string; byte: number }

const FILE_SEGNO = 'pronto.json'

/** Gli argomenti di whisper-cli per una frase. */
export function argomentiWhisper(p: { modello: string; wav: string; durataMs: number; fili: number; parola: string }): string[] {
  // La finestra di Whisper è di 30 s: per una frase corta se ne usa un pezzo
  // (`-ac`), che rende il calcolo molto più veloce; mai sotto 512 (circa 10 s),
  // sotto si inventa parole.
  const ac = p.durataMs <= 9_000 ? 512 : p.durataMs <= 14_000 ? 768 : 0
  return [
    '-m', p.modello, '-f', p.wav, '-l', 'it', '-nt', '-np',
    '-t', String(p.fili),
    // Due candidati invece di cinque: quasi la stessa precisione, metà del tempo.
    '-bs', '2', '-bo', '2',
    ...(ac > 0 ? ['-ac', String(ac)] : []),
    // L'inizio suggerito insegna come si scrive la parola di sveglia.
    '--prompt', `${p.parola}.`
  ]
}

/** I fili per Whisper: metà dei processori, fra 2 e 6, per lasciare spazio al resto. */
export function filiWhisper(processori = cpus().length): number {
  return Math.max(2, Math.min(6, Math.floor(processori / 2)))
}

/** Il testo detto, dall'uscita di whisper-cli: le righe unite, senza i segni come [BLANK_AUDIO]. */
export function testoDaUscita(out: string): string {
  return out.split(/\r?\n/u).map((r) => r.replace(/\[[^\]]*\]/gu, '').trim()).filter((r) => r !== '').join(' ').replace(/\s+/gu, ' ').trim()
}

/** Un file WAV (PCM 16 bit, mono, 16 kHz) attorno ai campioni. */
export function wav(pcm: Uint8Array, frequenza = 16_000): Buffer {
  const testa = Buffer.alloc(44)
  testa.write('RIFF', 0, 'ascii')
  testa.writeUInt32LE(36 + pcm.byteLength, 4)
  testa.write('WAVE', 8, 'ascii')
  testa.write('fmt ', 12, 'ascii')
  testa.writeUInt32LE(16, 16)
  testa.writeUInt16LE(1, 20)
  testa.writeUInt16LE(1, 22)
  testa.writeUInt32LE(frequenza, 24)
  testa.writeUInt32LE(frequenza * 2, 28)
  testa.writeUInt16LE(2, 32)
  testa.writeUInt16LE(16, 34)
  testa.write('data', 36, 'ascii')
  testa.writeUInt32LE(pcm.byteLength, 40)
  return Buffer.concat([testa, Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)])
}

const esecutoreVero: Esecutore = (exe, args, opz) => new Promise((ok) => {
  const p = execFile(exe, args, { windowsHide: true, timeout: opz.timeoutMs, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' }, (err, out, errOut) => {
    ok({ codice: err === null ? 0 : typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : null, out: String(out), err: String(errOut) })
  })
  // Priorità bassa: capire una frase non deve rallentare il resto del PC.
  try { if (p.pid !== undefined) setPriority(p.pid, costantiOs.priority.PRIORITY_BELOW_NORMAL) } catch { /* resta normale */ }
})

/** `tar` di Windows (c'è da Windows 10 1803) apre anche gli zip; si estraggono solo i file che servono. */
const estrattoreVero: Estrattore = (zip, dest, nomi) => new Promise((ok, no) => {
  const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
  const p = spawn(tar, ['-xf', zip, '-C', dest, ...nomi], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
  let err = ''
  p.stderr?.on('data', (d: Buffer) => { err += d.toString() })
  p.once('error', no)
  p.once('close', (c) => (c === 0 ? ok() : no(new Error(`tar uscito con ${String(c)}: ${err.trim().slice(0, 200)}`))))
})

export function creaVoceLocale(d: DipendenzeVoce) {
  const PROG = d.catalogo?.programma ?? PROGRAMMA
  const MOD = d.catalogo?.modelli ?? MODELLI
  const esegui = d.esegui ?? esecutoreVero
  const estrai = d.estrai ?? estrattoreVero
  const dirProgramma = join(d.cartella, 'programma')
  const dirModelli = join(d.cartella, 'modelli')
  const dirTemp = join(d.cartella, 'tmp')
  let stato: StatoModello = leggiStato()
  let interrompi: AbortController | undefined
  let scaricando: Promise<unknown> = Promise.resolve()
  let fila: Promise<unknown> = Promise.resolve()
  let attese = 0
  let contatore = 0

  function leggiSegno(): Segnato | undefined {
    try {
      const s = JSON.parse(readFileSync(join(d.cartella, FILE_SEGNO), 'utf8')) as Partial<Segnato>
      if ((s.modello === 'preciso' || s.modello === 'leggero') && typeof s.programma === 'string' && typeof s.impronta === 'string') return s as Segnato
    } catch { /* niente segno */ }
    return undefined
  }

  /** Pronto se c'è il segno, l'eseguibile, e il modello della misura giusta (l'impronta si è controllata scaricando). */
  function leggiStato(): StatoModello {
    const s = leggiSegno()
    if (s === undefined) return { fase: 'assente' }
    const m = MOD[s.modello]
    try {
      if (s.programma !== PROG.sha256 || s.impronta !== m.sha256) return { fase: 'assente' }
      if (!existsSync(join(dirProgramma, ESEGUIBILE))) return { fase: 'assente' }
      if (statSync(join(dirModelli, m.file)).size !== m.byte) return { fase: 'assente' }
    } catch {
      return { fase: 'assente' }
    }
    return { fase: 'pronto', modello: s.modello, byte: m.byte + PROG.byte }
  }

  const passo = (e: EventoModello): void => {
    const n = avanzaModello(stato, e)
    if (n === stato) return
    stato = n
    d.avvisa(stato)
  }

  /** Scarica un pezzo in `<file>.parziale`, calcolando l'impronta mentre scrive; poi lo rinomina. */
  async function scaricaPezzo(p: Pezzo, dest: string, base: number, segnale: AbortSignal): Promise<void> {
    const parziale = `${dest}.parziale`
    const r = await d.scarica(p.url, { signal: segnale })
    if (!r.ok || r.body === null) throw new Error(`il server ha risposto ${r.status}`)
    const hash = createHash('sha256')
    const fh = await open(parziale, 'w')
    let fatto = 0
    let ultimo = 0
    try {
      const lettore = r.body.getReader()
      for (;;) {
        const { done, value } = await lettore.read()
        if (done) break
        if (segnale.aborted) throw new Error('annullato')
        hash.update(value)
        await fh.write(value)
        fatto += value.byteLength
        if (fatto > p.byte * 1.05) throw new Error('il file è più grande del previsto')
        // Un avviso ogni mezzo MB, non a ogni pezzetto.
        if (fatto - ultimo >= 512 * 1024) { ultimo = fatto; passo({ tipo: 'progresso', pezzo: p.id, fatto: base + fatto }) }
      }
    } finally {
      await fh.close()
    }
    passo({ tipo: 'progresso', pezzo: p.id, fatto: base + fatto })
    passo({ tipo: 'verifica', pezzo: p.id })
    const impronta = hash.digest('hex')
    passo({ tipo: 'verificato', pezzo: p.id, sha256: impronta, atteso: p.sha256 })
    if (impronta !== p.sha256 || fatto !== p.byte) {
      await unlink(parziale).catch(() => undefined)
      throw new Impronta()
    }
    try { unlinkSync(dest) } catch { /* non c'era */ }
    renameSync(parziale, dest)
  }

  class Impronta extends Error {}

  async function scarica(modello: IdModello): Promise<StatoModello> {
    if (inCorso(stato)) return stato
    const m = MOD[modello]
    const segno = leggiSegno()
    const serveProgramma = segno?.programma !== PROG.sha256 || !existsSync(join(dirProgramma, ESEGUIBILE))
    const pezzi: Pezzo[] = [...(serveProgramma ? [PROG] : []), m]
    const totale = pezzi.reduce((n, p) => n + p.byte, 0)
    const primo = pezzi[0]!
    interrompi = new AbortController()
    const segnale = interrompi.signal
    passo({ tipo: 'inizia', modello, primo: primo.id, totale })
    d.log(`[voce] scarico ${pezzi.map((p) => p.file).join(' + ')} (${Math.round(totale / 1e6)} MB)`)
    try {
      mkdirSync(dirProgramma, { recursive: true })
      mkdirSync(dirModelli, { recursive: true })
      let base = 0
      for (const p of pezzi) {
        const dest = p.id === 'programma' ? join(d.cartella, p.file) : join(dirModelli, p.file)
        await scaricaPezzo(p, dest, base, segnale)
        base += p.byte
        if (p.id === 'programma') {
          passo({ tipo: 'estrai' })
          await estrai(dest, dirProgramma, FILE_DEL_PROGRAMMA)
          try { unlinkSync(dest) } catch { /* resta: si riscrive alla prossima */ }
          if (!existsSync(join(dirProgramma, ESEGUIBILE))) throw new Error('nel pacchetto manca whisper-cli.exe')
          // Il modello dopo il programma: la macchina torna a «scarica».
        }
      }
      // Il modello di prima, se era un altro, si toglie: ne serve uno.
      if (segno !== undefined && segno.modello !== modello) {
        try { unlinkSync(join(dirModelli, MOD[segno.modello].file)) } catch { /* già via */ }
      }
      const nuovo: Segnato = { modello, programma: PROG.sha256, impronta: m.sha256, byte: m.byte + PROG.byte }
      writeFileSync(join(d.cartella, FILE_SEGNO), JSON.stringify(nuovo, null, 2))
      passo({ tipo: 'fatto', modello, byte: nuovo.byte })
      d.log(`[voce] pronto: ${m.nome}`)
    } catch (err) {
      if (segnale.aborted) {
        passo({ tipo: 'annulla' })
        d.log('[voce] scaricamento annullato')
      } else if (!(err instanceof Impronta)) {
        // L'impronta sbagliata ha già il suo messaggio (dalla macchina).
        d.log(`[voce] scaricamento non riuscito: ${String(err)}`)
        passo({ tipo: 'errore', messaggio: `Scaricamento non riuscito: ${err instanceof Error ? err.message : String(err)}. Riprova.` })
      } else {
        d.log('[voce] impronta sbagliata: file buttato')
      }
      for (const p of pezzi) {
        const dest = p.id === 'programma' ? join(d.cartella, p.file) : join(dirModelli, p.file)
        await unlink(`${dest}.parziale`).catch(() => undefined)
      }
    } finally {
      interrompi = undefined
    }
    return stato
  }

  return {
    stato: (): StatoModello => stato,
    scarica(modello: IdModello): Promise<StatoModello> {
      if (inCorso(stato)) return Promise.resolve(stato)
      const p = scarica(modello)
      scaricando = p.catch(() => undefined)
      return p
    },
    annulla(): void { interrompi?.abort() },
    /** Toglie programma e modello (la cartella intera della voce, dentro i dati). */
    async rimuovi(): Promise<StatoModello> {
      interrompi?.abort()
      // Una frase in corso tiene aperti eseguibile e modello: Windows non li lascerebbe cancellare.
      await fila
      await scaricando
      await cancellaSicuraAsincrona(d.cartella, { dentro: [d.dati] })
      stato = { fase: 'assente' }
      d.avvisa(stato)
      d.log('[voce] riconoscimento tolto')
      return stato
    },
    /**
     * Trascrive una frase (PCM 16 bit, mono, 16 kHz). Una alla volta; con
     * più di due in attesa la nuova si rifiuta (meglio perdere una frase
     * della TV che restare indietro di un minuto).
     */
    trascrivi(pcm: Uint8Array, opz: { parola: string }): Promise<EsitoTrascrizione> {
      if (stato.fase !== 'pronto') return Promise.resolve({ ok: false, messaggio: 'Il riconoscimento della voce non è scaricato.' })
      if (pcm.byteLength < 3200 || pcm.byteLength > PCM_MAX_BYTE) return Promise.resolve({ ok: false, messaggio: 'Frase troppo corta o troppo lunga.' })
      if (attese >= 2) return Promise.resolve({ ok: false, messaggio: 'occupato' })
      const modello = MOD[stato.modello]
      attese += 1
      const lavoro = fila.then(async (): Promise<EsitoTrascrizione> => {
        mkdirSync(dirTemp, { recursive: true })
        contatore += 1
        const file = join(dirTemp, `frase-${process.pid}-${contatore}.wav`)
        const inizio = Date.now()
        try {
          await writeFile(file, wav(pcm))
          const durataMs = Math.round(pcm.byteLength / 32)
          const r = await esegui(join(dirProgramma, ESEGUIBILE), argomentiWhisper({ modello: join(dirModelli, modello.file), wav: file, durataMs, fili: filiWhisper(), parola: opz.parola }), { timeoutMs: 90_000 })
          if (r.codice !== 0) {
            d.log(`[voce] whisper uscito con ${String(r.codice)}: ${r.err.trim().split(/\r?\n/u).slice(-2).join(' | ').slice(0, 300)}`)
            return { ok: false, messaggio: 'Il riconoscimento non ha capito questa frase.' }
          }
          return { ok: true, testo: testoDaUscita(r.out), ms: Date.now() - inizio }
        } finally {
          await unlink(file).catch(() => undefined)
          attese -= 1
        }
      })
      fila = lavoro.catch(() => undefined)
      return lavoro.catch((err: unknown) => ({ ok: false as const, messaggio: `Riconoscimento non riuscito: ${String(err)}` }))
    }
  }
}

export type VoceLocale = ReturnType<typeof creaVoceLocale>
