import { ConflittoMagazzino, type Contenuto, type Magazzino } from './magazzino'

/**
 * Il magazzino su Google Drive dell'utente (bring-your-own-storage).
 *
 * Il blocco cifrato vive in **appDataFolder**: una cartella privata dell'app nel
 * Drive dell'utente, invisibile fra i suoi file normali, con il permesso più
 * piccolo che esista (`drive.appdata`). Non tocchiamo nient'altro del suo Drive,
 * e il file è comunque cifrato: né Google né noi lo leggiamo.
 *
 * L'access token arriva da fuori (`token()`): chi lo fornisce — il flusso OAuth —
 * si occupa di rinnovarlo. Qui si fanno solo le quattro chiamate REST che
 * servono: trovare il file, scaricarlo, crearlo, riscriverlo. `fetch` è
 * iniettabile per poter provare l'adattatore contro un Drive finto, senza rete.
 *
 * Concorrenza ottimista come per il magazzino in memoria: la `versione` è il
 * campo `version` di Drive (un numero che sale a ogni scrittura). `carica`
 * controlla che combaci con quello che c'è prima di riscrivere; se un altro PC ha
 * scritto nel frattempo, si rifiuta. Resta una finestra minima fra il controllo e
 * la scrittura — Drive non ha una scrittura condizionale — accettabile per l'uso
 * «un PC poi l'altro»; il caso simultaneo si raffina dopo.
 */

const NOME_FILE_PREDEFINITO = 'sierradeck.cassaforte'
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

type Fetch = typeof fetch

export type DriveDeps = {
  /** Un access token valido per lo scope drive.appdata. Chi lo dà lo rinnova. */
  token: () => Promise<string>
  /** Quale file dentro appDataFolder: i dati cifrati, o le chiavi. Predefinito: i dati. */
  nomeFile?: string
  /** Iniettabile per i test; di default il `fetch` dell'ambiente. */
  fetch?: Fetch
}

type FileDrive = { id: string; version: string }

export function creaMagazzinoDrive(deps: DriveDeps): Magazzino {
  const f: Fetch = deps.fetch ?? fetch
  const nomeFile = deps.nomeFile ?? NOME_FILE_PREDEFINITO
  const intestazioni = (tk: string): Record<string, string> => ({ Authorization: `Bearer ${tk}` })

  // Google spiega il perché nel CORPO della risposta (`error.message`): un 403
  // «API non abilitata» e un 403 «scope insufficiente» sono lo stesso numero ma
  // due problemi diversi. Senza il corpo, l'utente resta con un codice muto.
  const errore = async (r: Response, cosa: string): Promise<Error> => {
    let dettaglio = ''
    try {
      const testo = (await r.text()).trim()
      try {
        const j = JSON.parse(testo) as { error?: { message?: string } }
        dettaglio = j.error?.message ?? testo
      } catch {
        dettaglio = testo
      }
    } catch {
      // nessun corpo da leggere: resta solo il codice
    }
    return new Error(`Drive: ${cosa} fallito (${r.status})${dettaglio !== '' ? ` — ${dettaglio.slice(0, 300)}` : ''}`)
  }

  const trovaFile = async (tk: string): Promise<FileDrive | undefined> => {
    const q = encodeURIComponent(`name='${nomeFile}'`)
    const url = `${API}/files?spaces=appDataFolder&fields=${encodeURIComponent('files(id,version)')}&q=${q}`
    const r = await f(url, { headers: intestazioni(tk) })
    if (!r.ok) throw await errore(r, 'elenco')
    const j = (await r.json()) as { files?: Array<{ id?: string; version?: string | number }> }
    const primo = j.files?.[0]
    if (primo?.id === undefined) return undefined
    return { id: primo.id, version: String(primo.version ?? '') }
  }

  const scriviMedia = async (tk: string, id: string, blocco: Buffer): Promise<{ versione: string }> => {
    const url = `${UPLOAD}/files/${id}?uploadType=media&fields=version`
    const r = await f(url, {
      method: 'PATCH',
      headers: { ...intestazioni(tk), 'Content-Type': 'application/octet-stream' },
      body: blocco as unknown as BodyInit
    })
    if (!r.ok) throw await errore(r, 'scrittura')
    const j = (await r.json()) as { version?: string | number }
    return { versione: String(j.version ?? '') }
  }

  return {
    async scarica(): Promise<Contenuto | undefined> {
      const tk = await deps.token()
      const file = await trovaFile(tk)
      if (file === undefined) return undefined
      const r = await f(`${API}/files/${file.id}?alt=media`, { headers: intestazioni(tk) })
      if (!r.ok) throw await errore(r, 'scaricamento')
      return { blocco: Buffer.from(await r.arrayBuffer()), versione: file.version }
    },

    async carica(blocco: Buffer, seVersione?: string): Promise<{ versione: string }> {
      const tk = await deps.token()
      const file = await trovaFile(tk)
      if (file === undefined) {
        // Primo caricamento: ci si aspetta un magazzino vuoto. Se invece un file
        // c'è già (un altro PC), `seVersione` sarebbe definito → conflitto.
        if (seVersione !== undefined) throw new ConflittoMagazzino(undefined)
        const r = await f(`${API}/files?fields=id`, {
          method: 'POST',
          headers: { ...intestazioni(tk), 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: nomeFile, parents: ['appDataFolder'] })
        })
        if (!r.ok) throw await errore(r, 'creazione')
        const { id } = (await r.json()) as { id?: string }
        if (id === undefined) throw new Error('Drive: creazione senza id')
        return scriviMedia(tk, id, blocco)
      }
      // Esiste: si riscrive solo se la versione combacia con quella vista.
      if (seVersione !== file.version) throw new ConflittoMagazzino(file.version)
      return scriviMedia(tk, file.id, blocco)
    }
  }
}
