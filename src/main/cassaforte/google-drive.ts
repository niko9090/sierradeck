import { ConflittoMagazzino, type Contenuto, type Magazzino, type SegnaProgresso } from './magazzino'
import type { Archivio, VoceArchivio } from './archivio'

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

  // L'upload **ripristinabile** di Google: prima si apre una sessione (che dice
  // quanti byte arriveranno), poi si mandano i dati a pezzi, ognuno con la sua
  // `Content-Range`. È il metodo ufficiale per i file grossi, e ogni pezzo che
  // parte è un aggiornamento di progresso — senza il rischio di un corpo «a
  // flusso» che qualche server rifiuta perché senza lunghezza.
  const PEZZO = 8 * 1024 * 1024 // multiplo di 256 KB, come richiede Drive

  const iniziaSessione = async (
    tk: string, url: string, metodo: 'POST' | 'PATCH', totale: number, metadati?: unknown
  ): Promise<string> => {
    const intest: Record<string, string> = { ...intestazioni(tk), 'X-Upload-Content-Length': String(totale) }
    const init: RequestInit = { method: metodo, headers: intest }
    if (metadati !== undefined) {
      intest['Content-Type'] = 'application/json'
      init.body = JSON.stringify(metadati)
    }
    const r = await f(url, init)
    if (!r.ok) throw await errore(r, 'avvio caricamento')
    const sessione = r.headers.get('location')
    if (sessione === null) throw new Error('Drive: sessione di caricamento senza URL (Location assente)')
    return sessione
  }

  const caricaSessione = async (
    sessione: string, blocco: Buffer, onProgresso?: SegnaProgresso
  ): Promise<{ versione: string }> => {
    const totale = blocco.length
    let off = 0
    for (;;) {
      const fine = Math.min(off + PEZZO, totale)
      const pezzo = blocco.subarray(off, fine)
      const r = await f(sessione, {
        method: 'PUT',
        headers: { 'Content-Length': String(pezzo.length), 'Content-Range': `bytes ${off}-${fine - 1}/${totale}` },
        body: pezzo as unknown as BodyInit
      })
      // 308 = «continua», il pezzo è arrivato; 200/201 = finito, con la risorsa.
      if (r.status === 308) {
        off = fine
        onProgresso?.(off, totale)
        continue
      }
      if (r.ok) {
        const j = (await r.json()) as { version?: string | number }
        onProgresso?.(totale, totale)
        return { versione: String(j.version ?? '') }
      }
      throw await errore(r, 'caricamento')
    }
  }

  return {
    async scarica(onProgresso?: SegnaProgresso): Promise<Contenuto | undefined> {
      const tk = await deps.token()
      const file = await trovaFile(tk)
      if (file === undefined) return undefined
      const r = await f(`${API}/files/${file.id}?alt=media`, { headers: intestazioni(tk) })
      if (!r.ok) throw await errore(r, 'scaricamento')
      // Legge il corpo a pezzi per contare il progresso; se non c'è un flusso da
      // leggere (test, o risposte senza body streamabile), si ripiega su un colpo solo.
      const totale = Number(r.headers.get('content-length') ?? '0')
      if (r.body === null) {
        return { blocco: Buffer.from(await r.arrayBuffer()), versione: file.version }
      }
      const lettore = r.body.getReader()
      const pezzi: Buffer[] = []
      let ricevuti = 0
      for (;;) {
        const { done, value } = await lettore.read()
        if (done) break
        const b = Buffer.from(value)
        pezzi.push(b)
        ricevuti += b.length
        onProgresso?.(ricevuti, totale > 0 ? totale : ricevuti)
      }
      return { blocco: Buffer.concat(pezzi), versione: file.version }
    },

    async carica(blocco: Buffer, seVersione?: string, onProgresso?: SegnaProgresso): Promise<{ versione: string }> {
      const tk = await deps.token()
      const file = await trovaFile(tk)
      if (file === undefined) {
        // Primo caricamento: ci si aspetta un magazzino vuoto. Se invece un file
        // c'è già (un altro PC), `seVersione` sarebbe definito → conflitto.
        if (seVersione !== undefined) throw new ConflittoMagazzino(undefined)
        const sessione = await iniziaSessione(
          tk, `${UPLOAD}/files?uploadType=resumable&fields=version`, 'POST', blocco.length,
          { name: nomeFile, parents: ['appDataFolder'] }
        )
        return caricaSessione(sessione, blocco, onProgresso)
      }
      // Esiste: si riscrive solo se la versione combacia con quella vista.
      if (seVersione !== file.version) throw new ConflittoMagazzino(file.version)
      const sessione = await iniziaSessione(
        tk, `${UPLOAD}/files/${file.id}?uploadType=resumable&fields=version`, 'PATCH', blocco.length
      )
      return caricaSessione(sessione, blocco, onProgresso)
    }
  }
}

/**
 * L'**archivio** su Drive: molti file dentro appDataFolder, indirizzati per nome.
 * È ciò che serve alla sincronizzazione incrementale — un file cifrato per
 * trascrizione, più il manifesto — dove `creaMagazzinoDrive` (un blocco solo) non
 * basta. Upload semplice (`uploadType=media`) col Buffer come corpo: la lunghezza
 * la mette fetch, e i singoli file sono piccoli (una trascrizione, non i GB
 * interi), quindi niente flusso ripristinabile qui.
 */
export function creaArchivioDrive(deps: DriveDeps): Archivio {
  const f: Fetch = deps.fetch ?? fetch
  const intestazioni = (tk: string): Record<string, string> => ({ Authorization: `Bearer ${tk}` })

  const errore = async (r: Response, cosa: string): Promise<Error & { stato?: number }> => {
    let dettaglio = ''
    try {
      const testo = (await r.text()).trim()
      try {
        const j = JSON.parse(testo) as { error?: { message?: string } }
        dettaglio = j.error?.message ?? testo
      } catch { dettaglio = testo }
    } catch { /* niente corpo */ }
    const e: Error & { stato?: number } = new Error(`Drive: ${cosa} fallito (${r.status})${dettaglio !== '' ? ` — ${dettaglio.slice(0, 300)}` : ''}`)
    e.stato = r.status
    return e
  }

  const pausa = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
  const transitorio = (stato: number): boolean => stato === 429 || stato === 408 || stato >= 500
  const RITENTI = 4

  // Con migliaia di file, un intoppo di rete o un limite momentaneo di Drive
  // capitano: si riprova con attesa che raddoppia. Solo per le chiamate
  // idempotenti (ricerca, download, scrittura per id, cancellazione): rifarle non
  // crea doppioni. La creazione (POST) no — quella la protegge `carica`.
  const conRitenta = async (fai: () => Promise<Response>, cosa: string): Promise<Response> => {
    let attesa = 600
    for (let i = 0; ; i += 1) {
      let r: Response
      try {
        r = await fai()
      } catch (e) {
        if (i >= RITENTI) throw e
        await pausa(attesa); attesa *= 2; continue
      }
      if (!r.ok && transitorio(r.status) && i < RITENTI) { await pausa(attesa); attesa *= 2; continue }
      if (!r.ok) throw await errore(r, cosa)
      return r
    }
  }

  const trovaPerNome = async (tk: string, nome: string): Promise<{ id: string } | undefined> => {
    const q = encodeURIComponent(`name='${nome}'`)
    const url = `${API}/files?spaces=appDataFolder&fields=${encodeURIComponent('files(id)')}&q=${q}`
    const r = await conRitenta(() => f(url, { headers: intestazioni(tk) }), 'ricerca')
    const j = (await r.json()) as { files?: Array<{ id?: string }> }
    const id = j.files?.[0]?.id
    return id === undefined ? undefined : { id }
  }

  const scriviMediaSu = async (tk: string, id: string, blocco: Buffer): Promise<void> => {
    await conRitenta(() => f(`${UPLOAD}/files/${id}?uploadType=media`, {
      method: 'PATCH',
      headers: { ...intestazioni(tk), 'Content-Type': 'application/octet-stream' },
      body: blocco as unknown as BodyInit
    }), 'scrittura')
  }

  return {
    async elenca() {
      const tk = await deps.token()
      const mappa = new Map<string, VoceArchivio>()
      let pageToken: string | undefined
      do {
        const campi = encodeURIComponent('nextPageToken,files(id,name,version)')
        const url = `${API}/files?spaces=appDataFolder&pageSize=1000&fields=${campi}${pageToken !== undefined ? `&pageToken=${pageToken}` : ''}`
        const r = await conRitenta(() => f(url, { headers: intestazioni(tk) }), 'elenco')
        const j = (await r.json()) as { nextPageToken?: string; files?: Array<{ id?: string; name?: string; version?: string | number }> }
        for (const file of j.files ?? []) {
          if (file.id !== undefined && file.name !== undefined) {
            mappa.set(file.name, { id: file.id, versione: String(file.version ?? '') })
          }
        }
        pageToken = j.nextPageToken
      } while (pageToken !== undefined)
      return mappa
    },

    async scarica(nome, onProgresso) {
      const tk = await deps.token()
      const file = await trovaPerNome(tk, nome)
      if (file === undefined) return undefined
      const r = await conRitenta(() => f(`${API}/files/${file.id}?alt=media`, { headers: intestazioni(tk) }), 'scaricamento')
      const b = Buffer.from(await r.arrayBuffer())
      onProgresso?.(b.length, b.length)
      return b
    },

    async carica(nome, blocco, onProgresso) {
      const tk = await deps.token()
      // La creazione (POST) non è idempotente: rifarla creerebbe un doppione. Per
      // questo il ritentativo è QUI, attorno a «cerca → crea/scrivi»: a ogni giro
      // si ricerca, così un POST andato a metà viene ritrovato e aggiornato invece
      // di duplicato.
      let attesa = 600
      for (let i = 0; ; i += 1) {
        try {
          const file = await trovaPerNome(tk, nome)
          if (file !== undefined) {
            await scriviMediaSu(tk, file.id, blocco)
          } else {
            const r = await f(`${API}/files?fields=id`, {
              method: 'POST',
              headers: { ...intestazioni(tk), 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: nome, parents: ['appDataFolder'] })
            })
            if (!r.ok) throw await errore(r, 'creazione')
            const { id } = (await r.json()) as { id?: string }
            if (id === undefined) throw new Error('Drive: creazione senza id')
            await scriviMediaSu(tk, id, blocco)
          }
          onProgresso?.(blocco.length, blocco.length)
          return
        } catch (e) {
          const stato = (e as { stato?: number }).stato
          if (i >= RITENTI || stato === undefined || !transitorio(stato)) throw e
          await pausa(attesa); attesa *= 2
        }
      }
    },

    async cancella(nome) {
      const tk = await deps.token()
      const file = await trovaPerNome(tk, nome)
      if (file === undefined) return
      try {
        await conRitenta(() => f(`${API}/files/${file.id}`, { method: 'DELETE', headers: intestazioni(tk) }), 'cancellazione')
      } catch (e) {
        // Un 404 va bene: era già sparito. Il resto risale.
        if ((e as { stato?: number }).stato !== 404) throw e
      }
    }
  }
}
