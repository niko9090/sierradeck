import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'

/**
 * La cartella che il computer e il telefono si passano.
 *
 * Una cartella sola, senza sincronizzazione e senza account: ci metti un file
 * da una parte e lo trovi dall'altra. È il modo più semplice che funzioni, e
 * per mandarsi uno screenshot o un PDF non serve niente di più.
 *
 * Passa dal Client, quindi dai suoi due muri: dalla rete locale, e solo da un
 * dispositivo accoppiato. Nessun file esce da questa cartella e nessuno ci
 * entra da fuori.
 */

/** Oltre questo, non è più uno scambio: è un trasferimento, e va fatto altrimenti. */
export const FILE_MAX_BYTE = 100 * 1024 * 1024

export type FileScambiato = {
  nome: string
  byte: number
  /** Quando è stato messo lì, in ISO: dice quale è quello nuovo. */
  quando: string
}

/**
 * Un nome che resta un nome.
 *
 * Arriva da un telefono, quindi da fuori: un nome che contiene un percorso è
 * perfettamente valido per chi lo scrive, e non deve diventare un percorso qui
 * dentro. Si **rifiuta** invece di ripulirlo: tenere solo l'ultima parte
 * sarebbe comunque sicuro, ma accetterebbe in silenzio qualcosa che nessun
 * telefono manda per sbaglio.
 */
export function nomeSicuro(grezzo: string): string | undefined {
  const testo = grezzo.trim()
  if (testo === '' || testo === '.' || testo === '..') return undefined
  if (testo.includes('/') || testo.includes('\\') || testo.includes('..')) return undefined
  if (/[<>:"|?*]/.test(testo)) return undefined
  // Cintura oltre alle bretelle: se dopo tutti i controlli il nome non coincide
  // con la sua ultima parte, qualcosa è sfuggito.
  if (basename(testo) !== testo) return undefined
  return testo.slice(0, 120)
}

/** Il tipo da dichiarare al browser, per le poche estensioni che contano. */
export function tipoDi(nome: string): string {
  const est = extname(nome).toLowerCase()
  const noti: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/plain; charset=utf-8',
    '.json': 'application/json',
    '.zip': 'application/zip'
  }
  // Quello che non si riconosce si scarica invece di aprirsi: aprire nel
  // browser un file di tipo ignoto è il modo più veloce per farne eseguire uno.
  return noti[est] ?? 'application/octet-stream'
}

export type Scambio = {
  cartella: string
  elenca: () => FileScambiato[]
  leggi: (nome: string) => { dati: Buffer; tipo: string } | undefined
  scrivi: (nome: string, dati: Buffer) => FileScambiato | undefined
}

export function apriScambio(cartella: string): Scambio {
  mkdirSync(cartella, { recursive: true })

  const percorsoDi = (nome: string): string | undefined => {
    const sicuro = nomeSicuro(nome)
    if (sicuro === undefined) return undefined
    const percorso = resolve(cartella, sicuro)
    // Un percorso che esce dalla cartella non deve poter essere letto né
    // scritto nemmeno se un giorno i controlli sul nome cambiassero.
    return percorso.startsWith(resolve(cartella)) ? percorso : undefined
  }

  return {
    cartella,

    elenca() {
      if (!existsSync(cartella)) return []
      const trovati: FileScambiato[] = []
      for (const nome of readdirSync(cartella)) {
        try {
          const info = statSync(join(cartella, nome))
          // Solo file: una cartella dentro lo scambio non si scarica, e
          // mostrarla vorrebbe dire prometterlo.
          if (!info.isFile()) continue
          trovati.push({ nome, byte: info.size, quando: info.mtime.toISOString() })
        } catch {
          // Un file sparito fra la lettura dell'elenco e la sua statistica non
          // è un guasto: è un file che qualcuno ha appena tolto.
        }
      }
      // Il più recente in cima: è quello che si è appena messo lì.
      return trovati.sort((a, b) => (a.quando < b.quando ? 1 : -1))
    },

    leggi(nome) {
      const percorso = percorsoDi(nome)
      if (percorso === undefined || !existsSync(percorso)) return undefined
      return { dati: readFileSync(percorso), tipo: tipoDi(nome) }
    },

    scrivi(nome, dati) {
      const percorso = percorsoDi(nome)
      if (percorso === undefined || dati.length > FILE_MAX_BYTE) return undefined
      writeFileSync(percorso, dati)
      const info = statSync(percorso)
      return { nome: basename(percorso), byte: info.size, quando: info.mtime.toISOString() }
    }
  }
}
