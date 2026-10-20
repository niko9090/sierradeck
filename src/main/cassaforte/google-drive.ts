import { ConflittoMagazzino, type Contenuto, type Magazzino, type SegnaProgresso } from './magazzino'
import type { Archivio, VoceArchivio } from './archivio'
import { conConteggio } from '../risorse'

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
/**
 * Quanto vale un «non c'è» per chi legge. 0.68.0: tre minuti, ma l'archivio
 * si ricreava a ogni chiamata e non valeva quasi mai. Dalla 0.69.0 l'archivio
 * è uno per collegamento: 20 secondi, perché chi aspetta che un file compaia
 * (offerta e risposta WebRTC, posta, schermo) lo vede ancora in tempo.
 */
export const ASSENTE_PER_MS = 20_000

type Fetch = typeof fetch

export type DriveDeps = {
  /** Un access token valido per lo scope drive.appdata. Chi lo dà lo rinnova. */
  token: () => Promise<string>
  /**
   * Rinnovo forzato dopo un 401 (0.56.3): riceve il token rifiutato e ne dà uno
   * nuovo. Senza, un 401 resta un errore come prima.
   */
  rinnova?: (fallito: string) => Promise<string>
  /** Quale file dentro appDataFolder: i dati cifrati, o le chiavi. Predefinito: i dati. */
  nomeFile?: string
  /** Iniettabile per i test; di default il `fetch` dell'ambiente. */
  fetch?: Fetch
}

type FileDrive = { id: string; version: string }

/**
 * Un 401 di Google con un token che per il nostro orologio è ancora valido
 * (0.56.3, caso del 09/10): si rinnova adesso e si ripete la stessa chiamata,
 * una volta. Prima si ritentava con lo stesso token per un'ora, finché non
 * scadeva da sé: il Drive risultava fermo senza che nessuno lo sapesse.
 * Solo per le chiamate che portano `Authorization: Bearer`.
 */
export function conRinnovo(f: Fetch, rinnova?: (fallito: string) => Promise<string>): Fetch {
  if (rinnova === undefined) return f
  return (async (input: Parameters<Fetch>[0], init?: Parameters<Fetch>[1]): Promise<Response> => {
    const r = await f(input, init)
    if (r.status !== 401) return r
    const h = new Headers(init?.headers)
    const auth = h.get('Authorization') ?? ''
    if (!auth.startsWith('Bearer ')) return r
    let nuovo: string
    try {
      nuovo = await rinnova(auth.slice('Bearer '.length))
    } catch (e) {
      // Il rinnovo stesso non riesce (autorizzazione revocata, nessun refresh
      // token): ritentare la chiamata non serve, e si scollegherebbe di nuovo.
      if (e instanceof Error) (e as Error & { definitivo?: boolean }).definitivo = true
      throw e
    }
    h.set('Authorization', `Bearer ${nuovo}`)
    const intestazioni: Record<string, string> = {}
    h.forEach((v, k) => { intestazioni[k] = v })
    return f(input, { ...init, headers: intestazioni })
  }) as Fetch
}

export function creaMagazzinoDrive(deps: DriveDeps): Magazzino {
  // Ogni richiesta che parte davvero si conta (0.69.0): quanto lavora il PC.
  const f: Fetch = conRinnovo(conConteggio(deps.fetch ?? fetch), deps.rinnova)
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
  // Ogni richiesta che parte davvero si conta (0.69.0): quanto lavora il PC.
  const f: Fetch = conRinnovo(conConteggio(deps.fetch ?? fetch), deps.rinnova)
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
  // Google risponde 403 (non 429) anche per «troppe richieste»: rateLimitExceeded,
  // userRateLimitExceeded, o la quota al minuto del 12/10. Quelli passano da soli
  // aspettando; un 403 vero (permesso negato) no, e risale subito.
  const limiteDiVelocita = async (r: Response): Promise<boolean> => {
    if (r.status !== 403) return false
    const testo = await r.clone().text().catch(() => '')
    // Non «storageQuotaExceeded» (Drive pieno): quello non passa aspettando.
    return /\b(user)?rateLimitExceeded\b|Quota exceeded for quota metric|per minute/i.test(testo)
  }

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
        if (i >= RITENTI || (e as { definitivo?: boolean }).definitivo === true) throw e
        await pausa(attesa); attesa *= 2; continue
      }
      if (!r.ok && (transitorio(r.status) || await limiteDiVelocita(r)) && i < RITENTI) { await pausa(attesa); attesa *= 2; continue }
      if (!r.ok) throw await errore(r, cosa)
      return r
    }
  }

  // Nome → id, imparato strada facendo (ricerche, creazioni, elenco). Con
  // centinaia di file, cercare per nome a ogni scaricamento era una chiamata
  // in piu' per file: la fusione di 750 voci ci ha messo mezz'ora, e ogni
  // chiamata in piu' e' un'occasione in piu' per il limite di Drive. Un id
  // vecchio (file cancellato e ricreato altrove) si scopre con un 404 e si
  // dimentica.
  const idPerNome = new Map<string, string>()
  /**
   * I nomi cercati e non trovati, con quando (0.68.0). Il 12/10 Google ha
   * risposto per ore «403 Quota exceeded … Total Query Cost per minute»: ogni
   * giro rileggeva file che non esistono (presenze dei progetti, posta), e un
   * file che non c'è non si ricordava, quindi si ricercava ogni volta.
   */
  const assenti = new Map<string, number>()
  const trovaPerNome = async (tk: string, nome: string, fresco = false): Promise<{ id: string } | undefined> => {
    const noto = idPerNome.get(nome)
    if (noto !== undefined) return { id: noto }
    const visto = assenti.get(nome)
    if (!fresco && visto !== undefined && Date.now() - visto < ASSENTE_PER_MS) return undefined
    const q = encodeURIComponent(`name='${nome}'`)
    const url = `${API}/files?spaces=appDataFolder&fields=${encodeURIComponent('files(id)')}&q=${q}`
    const r = await conRitenta(() => f(url, { headers: intestazioni(tk) }), 'ricerca')
    const j = (await r.json()) as { files?: Array<{ id?: string }> }
    const id = j.files?.[0]?.id
    if (id !== undefined) { idPerNome.set(nome, id); assenti.delete(nome) } else assenti.set(nome, Date.now())
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
            idPerNome.set(file.name, file.id)
            assenti.delete(file.name)
          }
        }
        pageToken = j.nextPageToken
      } while (pageToken !== undefined)
      return mappa
    },

    async scarica(nome, onProgresso) {
      const tk = await deps.token()
      for (let giro = 0; giro < 2; giro += 1) {
        const file = await trovaPerNome(tk, nome)
        if (file === undefined) return undefined
        try {
          const r = await conRitenta(() => f(`${API}/files/${file.id}?alt=media`, { headers: intestazioni(tk) }), 'scaricamento')
          const b = Buffer.from(await r.arrayBuffer())
          onProgresso?.(b.length, b.length)
          return b
        } catch (e) {
          // Un id ricordato che non c'e' piu': si dimentica e si ricerca una volta.
          if ((e as { stato?: number }).stato === 404 && giro === 0) { idPerNome.delete(nome); continue }
          throw e
        }
      }
      return undefined
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
          // Fresco: mai creare un doppione perché «non c'era» tre minuti fa.
          const file = await trovaPerNome(tk, nome, true)
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
            idPerNome.set(nome, id)
            assenti.delete(nome)
            await scriviMediaSu(tk, id, blocco)
          }
          onProgresso?.(blocco.length, blocco.length)
          return
        } catch (e) {
          const stato = (e as { stato?: number }).stato
          // Un id ricordato che non c'e' piu': si dimentica e si rifa' il giro.
          if (stato === 404 && idPerNome.has(nome) && i < RITENTI) { idPerNome.delete(nome); continue }
          if (i >= RITENTI || stato === undefined || !(transitorio(stato) || (stato === 403 && /rate ?limit exceeded|quota exceeded for quota metric/i.test(String((e as Error).message))))) throw e
          await pausa(attesa); attesa *= 2
        }
      }
    },

    async elencaConDimensioni() {
      const tk = await deps.token()
      const fuori: { nome: string; byte: number; modificato?: string }[] = []
      let pageToken: string | undefined
      do {
        const campi = encodeURIComponent('nextPageToken,files(id,name,size,modifiedTime)')
        const url = `${API}/files?spaces=appDataFolder&pageSize=1000&fields=${campi}${pageToken !== undefined ? `&pageToken=${pageToken}` : ''}`
        const r = await conRitenta(() => f(url, { headers: intestazioni(tk) }), 'elenco con le dimensioni')
        const j = (await r.json()) as { nextPageToken?: string; files?: Array<{ id?: string; name?: string; size?: string; modifiedTime?: string }> }
        for (const file of j.files ?? []) {
          if (file.name === undefined) continue
          if (file.id !== undefined) idPerNome.set(file.name, file.id)
          fuori.push({ nome: file.name, byte: Number.parseInt(file.size ?? '0', 10) || 0, ...(file.modifiedTime !== undefined ? { modificato: file.modifiedTime } : {}) })
        }
        pageToken = j.nextPageToken
      } while (pageToken !== undefined)
      return fuori
    },

    async quota() {
      // Lo spazio dell'account (0.65.0): basta il permesso drive.appdata.
      const tk = await deps.token()
      const r = await conRitenta(() => f(`${API}/about?fields=${encodeURIComponent('storageQuota')}`, { headers: intestazioni(tk) }), 'quota')
      const j = (await r.json()) as { storageQuota?: { limit?: string; usage?: string; usageInDrive?: string; usageInDriveTrash?: string } }
      const n = (x: string | undefined): number | undefined => (x === undefined ? undefined : Number.parseInt(x, 10))
      const q = j.storageQuota ?? {}
      const limite = n(q.limit)
      const nelDrive = n(q.usageInDrive)
      const cestino = n(q.usageInDriveTrash)
      return { usato: n(q.usage) ?? 0, ...(limite !== undefined ? { limite } : {}), ...(nelDrive !== undefined ? { usatoNelDrive: nelDrive } : {}), ...(cestino !== undefined ? { nelCestino: cestino } : {}) }
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
      } finally {
        idPerNome.delete(nome)
      }
    }
  }
}
