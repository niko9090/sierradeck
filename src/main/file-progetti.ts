import { open, readdir, realpath, stat } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import {
  FILE_PEZZO_BYTE, VOCI_MAX, cartellaSopra, chiaveCartella, conBarre, mimeDi, nascosta,
  nomeCartella, progettiDaMostrare, relativoSicuro, tipoAnteprima, type TipoAnteprima
} from '@shared/file-telefono'

/**
 * Sfogliare i progetti di questo PC dal telefono e dalla pagina (0.54.0).
 *
 * Solo lettura, e solo **dentro** i progetti noti (le cartelle dove Claude
 * Code ha già lavorato, quelle delle chat aperte e degli autopiloti). Ogni
 * richiesta porta il progetto e un percorso relativo: il progetto deve stare
 * nell'elenco, il percorso passare `relativoSicuro`, e il file vero — dopo
 * aver seguito collegamenti e giunzioni — stare ancora dentro il progetto.
 * Un collegamento che porta fuori non si segue: nell'elenco non compare, e
 * chiederlo per nome dà 403.
 */

export type VoceFileProgetto = {
  nome: string
  /** Relativo al progetto, con `/`. */
  percorso: string
  cartella: boolean
  byte: number
  /** Ultima modifica, millisecondi epoch. */
  quando: number
  tipo: TipoAnteprima
}

export type Rifiuto = { ok: false; stato: number; errore: string }

export type FileProgetti = {
  progetti: () => Promise<{ nome: string; percorso: string }[]>
  elenco: (progetto: string, percorso: string) => Promise<{ ok: true; progetto: string; nome: string; percorso: string; su?: string; voci: VoceFileProgetto[]; tagliato: boolean } | Rifiuto>
  /** Un pezzo di file: `da` byte in poi, al massimo un pezzo. */
  leggi: (progetto: string, percorso: string, da: number, quanti?: number) => Promise<{ ok: true; dati: Buffer; da: number; byte: number; quando: number; nome: string; tipo: TipoAnteprima; mime: string } | Rifiuto>
  /** Il percorso vero di un file o di una cartella del progetto, controllato: per chi ci scrive (il carica). */
  risolvi: (progetto: string, percorso: string) => Promise<{ ok: true; radice: string; assoluto: string } | Rifiuto>
}

const WIN = process.platform === 'win32'

/** `file` è `radice` o sta dentro? Su Windows senza badare alle maiuscole. */
export function dentroOUguale(radice: string, file: string): boolean {
  const r = resolve(radice)
  const f = resolve(file)
  if (WIN ? f.toLowerCase() === r.toLowerCase() : f === r) return true
  const conSep = r.endsWith(sep) ? r : r + sep
  return WIN ? f.toLowerCase().startsWith(conSep.toLowerCase()) : f.startsWith(conSep)
}

export function apriFileProgetti(deps: {
  /** Le cartelle candidate: Claude Code, chat aperte, autopiloti. */
  candidati: () => Promise<string[]>
  home: string
}): FileProgetti {
  const progetti = async (): Promise<{ nome: string; percorso: string }[]> => {
    const tutti = progettiDaMostrare(await deps.candidati().catch(() => [] as string[]), deps.home, WIN)
    // Solo quelle che ci sono davvero, adesso, e sono cartelle.
    const vere = await Promise.all(tutti.map(async (p) => {
      try { return (await stat(p.percorso)).isDirectory() ? p : undefined } catch { return undefined }
    }))
    return vere.filter((p): p is { nome: string; percorso: string } => p !== undefined)
  }

  const risolvi = async (progetto: string, percorso: string): Promise<{ ok: true; radice: string; assoluto: string } | Rifiuto> => {
    if (!relativoSicuro(percorso)) return { ok: false, stato: 400, errore: 'Percorso non valido: si sfoglia solo dentro il progetto, senza risalire.' }
    const noti = await progetti()
    const p = noti.find((x) => chiaveCartella(x.percorso, WIN) === chiaveCartella(progetto, WIN))
    if (p === undefined) return { ok: false, stato: 403, errore: 'Questa cartella non è fra i progetti di questo PC: si sfogliano solo quelli.' }
    let radice: string
    try { radice = await realpath(p.percorso) } catch { return { ok: false, stato: 404, errore: 'Il progetto non c’è più su questo PC.' } }
    const chiesto = resolve(radice, conBarre(percorso))
    let vero: string
    try { vero = await realpath(chiesto) } catch { return { ok: false, stato: 404, errore: 'Questo file o questa cartella non c’è (più): torna indietro e ricarica.' } }
    // Dopo collegamenti e giunzioni il file deve stare ancora nel progetto.
    if (!dentroOUguale(radice, vero)) return { ok: false, stato: 403, errore: 'Questo collegamento porta fuori dal progetto: non si segue.' }
    return { ok: true, radice, assoluto: vero }
  }

  return {
    progetti,
    risolvi,

    async elenco(progetto, percorso) {
      const r = await risolvi(progetto, percorso)
      if (!r.ok) return r
      let s
      try { s = await stat(r.assoluto) } catch { return { ok: false, stato: 404, errore: 'Questa cartella non c’è più.' } }
      if (!s.isDirectory()) return { ok: false, stato: 400, errore: 'Non è una cartella.' }
      let voci
      try { voci = await readdir(r.assoluto, { withFileTypes: true }) } catch (e) {
        return { ok: false, stato: 403, errore: `Windows non lascia leggere questa cartella (${e instanceof Error ? e.message : String(e)}).` }
      }
      const base = conBarre(percorso)
      const fuori: VoceFileProgetto[] = []
      for (const v of voci) {
        // I collegamenti (e le giunzioni) non si mostrano: potrebbero portare fuori dal progetto.
        if (v.isSymbolicLink() || nascosta(v.name)) continue
        if (!relativoSicuro(v.name)) continue
        const cartella = v.isDirectory()
        if (!cartella && !v.isFile()) continue
        let byte = 0
        let quando = 0
        try { const st = await stat(resolve(r.assoluto, v.name)); byte = cartella ? 0 : st.size; quando = st.mtimeMs } catch { continue }
        fuori.push({ nome: v.name, percorso: base === '' ? v.name : `${base}/${v.name}`, cartella, byte, quando: Math.round(quando), tipo: cartella ? 'altro' : tipoAnteprima(v.name) })
      }
      const nomi = new Intl.Collator('it', { numeric: true, sensitivity: 'base' })
      fuori.sort((a, b) => (a.cartella === b.cartella ? nomi.compare(a.nome, b.nome) : a.cartella ? -1 : 1))
      const su = cartellaSopra(base)
      return {
        ok: true, progetto, nome: base === '' ? nomeCartella(progetto) : nomeCartella(base), percorso: base,
        ...(su !== undefined ? { su } : {}), voci: fuori.slice(0, VOCI_MAX), tagliato: fuori.length > VOCI_MAX
      }
    },

    async leggi(progetto, percorso, da, quanti = FILE_PEZZO_BYTE) {
      if (percorso === '') return { ok: false, stato: 400, errore: 'Manca il file.' }
      const r = await risolvi(progetto, percorso)
      if (!r.ok) return r
      let s
      try { s = await stat(r.assoluto) } catch { return { ok: false, stato: 404, errore: 'Questo file non c’è più.' } }
      if (!s.isFile()) return { ok: false, stato: 400, errore: 'Non è un file: una cartella si apre, non si scarica.' }
      if (!Number.isInteger(da) || da < 0 || da > s.size) return { ok: false, stato: 416, errore: `Fuori dal file: è di ${s.size} byte.` }
      const n = Math.max(0, Math.min(Number.isInteger(quanti) && quanti > 0 ? quanti : FILE_PEZZO_BYTE, FILE_PEZZO_BYTE, s.size - da))
      const dati = Buffer.alloc(n)
      if (n > 0) {
        const fd = await open(r.assoluto, 'r')
        try { await fd.read(dati, 0, n, da) } finally { await fd.close() }
      }
      const nome = nomeCartella(percorso)
      return { ok: true, dati, da, byte: s.size, quando: Math.round(s.mtimeMs), nome, tipo: tipoAnteprima(nome), mime: mimeDi(nome) }
    }
  }
}
