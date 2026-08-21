import { gzipSync, gunzipSync } from 'node:zlib'

/**
 * Il pacchetto: tutto ciò che di un utente si porta da un PC all'altro, in un
 * blocco solo.
 *
 * È volutamente **generico**: un elenco di voci `percorso → contenuto`, non uno
 * schema rigido. Cosa ci vada dentro — le trascrizioni delle chat, il quaderno,
 * i workspace, le impostazioni — lo decide chi lo compone leggendo i file giusti;
 * qui si tiene solo il contenitore. Così aggiungere qualcosa domani non cambia il
 * formato, e il formato resta provabile senza toccare il disco.
 *
 * Un blocco solo perché è quello che la cassaforte cifra e il magazzino carica:
 * un file cifrato opaco. Compresso (gzip) prima di cifrare, perché trascrizioni e
 * note sono testo e si stringono parecchio — e comprimere **dopo** aver cifrato
 * non servirebbe a niente (il cifrato è incomprimibile).
 */

export type Voce = {
  /** Un percorso **relativo**, con `/` come separatore. Chi ripristina lo valida prima di scrivere. */
  percorso: string
  contenuto: Buffer
}

export type Pacchetto = {
  versione: 1
  /** Quando è stato composto, in ISO. Passato da fuori: il modulo non guarda l'orologio. */
  creatoIl: string
  voci: Voce[]
}

/** Impacchetta le voci in un blocco compresso. `creatoIl` arriva da fuori (niente orologio qui). */
export function componiPacchetto(voci: Voce[], creatoIl: string): Buffer {
  const grezzo = {
    versione: 1 as const,
    creatoIl,
    voci: voci.map((v) => ({ percorso: v.percorso, contenuto: v.contenuto.toString('base64') }))
  }
  return gzipSync(Buffer.from(JSON.stringify(grezzo), 'utf8'))
}

/**
 * Rilegge un pacchetto. `undefined` se il blocco non è un pacchetto valido —
 * corrotto, di una versione futura, o non nostro. Non solleva: chi ripristina
 * decide cosa fare di un pacchetto illeggibile, non lo scopre da un'eccezione.
 */
export function leggiPacchetto(blocco: Buffer): Pacchetto | undefined {
  let grezzo: unknown
  try {
    grezzo = JSON.parse(gunzipSync(blocco).toString('utf8'))
  } catch {
    return undefined
  }
  if (typeof grezzo !== 'object' || grezzo === null) return undefined
  const o = grezzo as Record<string, unknown>
  // Una versione più alta di quella che conosciamo si rifiuta, non si interpreta
  // a caso: potrebbe avere campi con lo stesso nome e significato diverso.
  if (o.versione !== 1 || !Array.isArray(o.voci)) return undefined

  const voci: Voce[] = []
  for (const v of o.voci) {
    if (typeof v !== 'object' || v === null) continue
    const vo = v as Record<string, unknown>
    if (typeof vo.percorso !== 'string' || typeof vo.contenuto !== 'string') continue
    voci.push({ percorso: vo.percorso, contenuto: Buffer.from(vo.contenuto, 'base64') })
  }
  return {
    versione: 1,
    creatoIl: typeof o.creatoIl === 'string' ? o.creatoIl : '',
    voci
  }
}
