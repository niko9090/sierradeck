import { createHash, randomBytes } from 'node:crypto'
import {
  appendFileSync, copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync,
  renameSync, rmSync, statSync, writeFileSync
} from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import {
  accettaPezzo, CARTELLA_ALLEGATI, giornoCartella, GITIGNORE_ALLEGATI, idInvioValido, INVIO_SCADE_MS,
  PEZZO_BYTE, percorsoAllegato, percorsoInCartella
} from '@shared/allegati'
import { conBarre } from '@shared/file-telefono'

/**
 * I file dal telefono, dal lato del disco (0.50.0).
 *
 * Un invio vive in due file nella cartella di lavoro di SierraDeck (mai nel
 * progetto finché non è intero): `<id>.json` con chi lo manda, dove va e
 * quanto è grande, e `<id>.part` con i byte arrivati. La grandezza del
 * `.part` è la verità su quanto è arrivato: dopo una caduta di rete, o un
 * riavvio del PC, si riparte da lì.
 *
 * Quando è intero si controlla l'impronta (se il telefono l'ha mandata), si
 * sposta in `<cartella>/.sierradeck/allegati/AAAA-MM-GG/<nome>` con un nome
 * che non schiaccia niente, si scrive il `.gitignore` della cartella (solo se
 * non c'è: se il progetto lo vuole diverso, lo cambia lui) e si marca il file
 * «scaricato da Internet» (Zone.Identifier), così Windows avvisa prima di
 * eseguirlo. SierraDeck non lo apre e non lo esegue mai.
 */

export type Invio = {
  id: string
  /** Chi lo manda: `tel:<dispositivo>`, `pc:<visore>`, `locale`. Solo lui può continuarlo. */
  chi: string
  nome: string
  byte: number
  sha256?: string
  tipo: 'chat' | 'autopilota' | 'cartella'
  /** L'id della chat o dell'autopilota; per una cartella, il progetto. */
  a: string
  /** Solo per una cartella (0.54.0): dove, relativo al progetto (`''` = il progetto). */
  sotto?: string
  titolo: string
  cwd: string
  nota?: string
  iniziato: string
}

export type Arrivato = { nome: string; relativo: string; assoluto: string; invio: Invio }

export type Allegati = {
  inizia: (i: Omit<Invio, 'iniziato'>) => { ok: true; ricevuti: number } | { ok: false; stato: number; errore: string }
  pezzo: (id: string, chi: string, da: number, dati: Buffer) => { ok: true; ricevuti: number } | { ok: false; stato: number; errore: string; ricevuti?: number }
  stato: (id: string, chi: string) => { ok: true; ricevuti: number; byte: number } | { ok: false; stato: number; errore: string }
  /** Il file intero, al suo posto nel progetto. */
  finisci: (id: string, chi: string) => Promise<{ ok: true; arrivato: Arrivato } | { ok: false; stato: number; errore: string }>
  annulla: (id: string, chi: string) => boolean
  /** L'invio, per chi deve ricontrollare il PIN prima di finirlo. */
  leggi: (id: string) => Invio | undefined
}

/** Il file è dentro la cartella? Su Windows senza badare a maiuscole. */
export function dentro(radice: string, file: string): boolean {
  const r = resolve(radice) + sep
  const f = resolve(file)
  return process.platform === 'win32' ? f.toLowerCase().startsWith(r.toLowerCase()) : f.startsWith(r)
}

function impronta(file: string): Promise<string> {
  return new Promise((ok, ko) => {
    const h = createHash('sha256')
    createReadStream(file).on('data', (c) => h.update(c)).on('error', ko).on('end', () => ok(h.digest('hex')))
  })
}

export function apriAllegati(deps: { cartella: string; adesso?: () => number; segnaInternet?: boolean }): Allegati {
  const adesso = deps.adesso ?? (() => Date.now())
  mkdirSync(deps.cartella, { recursive: true })
  const meta = (id: string): string => join(deps.cartella, `${id}.json`)
  const parte = (id: string): string => join(deps.cartella, `${id}.part`)
  const leggi = (id: string): Invio | undefined => {
    if (!idInvioValido(id)) return undefined
    try { return JSON.parse(readFileSync(meta(id), 'utf8')) as Invio } catch { return undefined }
  }
  const ricevutiDi = (id: string): number => { try { return statSync(parte(id)).size } catch { return 0 } }
  const togli = (id: string): void => {
    rmSync(meta(id), { force: true })
    rmSync(parte(id), { force: true })
  }
  /** Gli invii lasciati a metà da più di un giorno: via. */
  const pulisci = (): void => {
    try {
      for (const n of readdirSync(deps.cartella)) {
        if (!n.endsWith('.json') && !n.endsWith('.part')) continue
        const p = join(deps.cartella, n)
        try { if (adesso() - statSync(p).mtimeMs > INVIO_SCADE_MS) rmSync(p, { force: true }) } catch { /* sparito */ }
      }
    } catch { /* la cartella non si legge: niente da pulire */ }
  }
  const suo = (id: string, chi: string): { ok: true; i: Invio } | { ok: false; stato: number; errore: string } => {
    const i = leggi(id)
    if (i === undefined) return { ok: false, stato: 404, errore: 'Questo invio non c’è (più) sul computer: ricomincia da capo.' }
    if (i.chi !== chi) return { ok: false, stato: 403, errore: 'Questo invio l’ha cominciato un altro dispositivo.' }
    return { ok: true, i }
  }

  return {
    leggi,

    inizia(i) {
      pulisci()
      if (!idInvioValido(i.id)) return { ok: false, stato: 400, errore: 'Id dell’invio non valido.' }
      const prima = leggi(i.id)
      if (prima !== undefined) {
        // Lo stesso invio ripreso (il telefono ha perso la risposta, o la rete è caduta): si riparte da dove era.
        if (prima.chi === i.chi && prima.nome === i.nome && prima.byte === i.byte && prima.a === i.a) return { ok: true, ricevuti: ricevutiDi(i.id) }
        return { ok: false, stato: 409, errore: 'Esiste già un invio con questo id, diverso da questo.' }
      }
      writeFileSync(meta(i.id), JSON.stringify({ ...i, iniziato: new Date(adesso()).toISOString() }), 'utf8')
      writeFileSync(parte(i.id), Buffer.alloc(0))
      return { ok: true, ricevuti: 0 }
    },

    pezzo(id, chi, da, dati) {
      const s = suo(id, chi)
      if (!s.ok) return s
      const e = accettaPezzo({ ricevuti: ricevutiDi(id), byte: s.i.byte }, da, dati.length, PEZZO_BYTE)
      if (!e.ok) return e
      if (e.doppio !== true) appendFileSync(parte(id), dati)
      return { ok: true, ricevuti: ricevutiDi(id) }
    },

    stato(id, chi) {
      const s = suo(id, chi)
      return s.ok ? { ok: true, ricevuti: ricevutiDi(id), byte: s.i.byte } : s
    },

    async finisci(id, chi) {
      const s = suo(id, chi)
      if (!s.ok) return s
      const i = s.i
      const ricevuti = ricevutiDi(id)
      if (ricevuti !== i.byte) return { ok: false, stato: 409, errore: `Il file non è ancora intero: ${ricevuti} byte su ${i.byte}.` }
      if (i.sha256 !== undefined && i.sha256 !== '') {
        const h = await impronta(parte(id))
        if (h !== i.sha256.toLowerCase()) {
          togli(id)
          return { ok: false, stato: 422, errore: 'Il file è arrivato diverso da com’era sul telefono (l’impronta non torna): rimandalo.' }
        }
      }
      if (!existsSync(i.cwd)) return { ok: false, stato: 409, errore: `La cartella del progetto (${i.cwd}) non c’è più su questo computer.` }
      const radice = resolve(i.cwd)
      const inCartella = i.tipo === 'cartella'
      // Una cartella scelta dalla sezione File (0.54.0), o quella degli allegati della chat.
      const contenitore = inCartella ? resolve(radice, i.sotto ?? '') : resolve(radice, CARTELLA_ALLEGATI)
      if (inCartella && !existsSync(contenitore)) return { ok: false, stato: 409, errore: 'La cartella dove caricarlo non c’è più.' }
      const relativo = inCartella
        ? percorsoInCartella(conBarre(i.sotto ?? ''), i.nome, (rel) => existsSync(resolve(radice, rel)))
        : percorsoAllegato(i.nome, giornoCartella(new Date(adesso())), (rel) => existsSync(resolve(radice, rel)))
      const assoluto = resolve(radice, relativo)
      // Cintura e bretelle: il nome è già ripulito, ma il file deve stare dentro la sua cartella (e nel progetto).
      if (!dentro(contenitore, assoluto) || !dentro(radice, assoluto)) return { ok: false, stato: 400, errore: 'Percorso non valido.' }
      mkdirSync(dirname(assoluto), { recursive: true })
      if (!inCartella) {
        const ignora = join(contenitore, '.gitignore')
        if (!existsSync(ignora)) writeFileSync(ignora, GITIGNORE_ALLEGATI, 'utf8')
      }
      try {
        renameSync(parte(id), assoluto)
      } catch {
        // Un altro disco: si copia e si toglie.
        copyFileSync(parte(id), assoluto)
        rmSync(parte(id), { force: true })
      }
      rmSync(meta(id), { force: true })
      if (deps.segnaInternet ?? process.platform === 'win32') {
        // «Scaricato da Internet»: Windows chiede prima di eseguirlo. Solo su NTFS; altrove non c'è e va bene così.
        try { writeFileSync(`${assoluto}:Zone.Identifier`, '[ZoneTransfer]\r\nZoneId=3\r\n', 'utf8') } catch { /* disco senza flussi alternativi */ }
      }
      return { ok: true, arrivato: { nome: assoluto.slice(dirname(assoluto).length + 1), relativo, assoluto, invio: i } }
    },

    annulla(id, chi) {
      const s = suo(id, chi)
      if (!s.ok) return false
      togli(id)
      return true
    }
  }
}

/** Un id a caso, per chi manda dal PC stesso (i test, la pagina ne fa uno suo). */
export function nuovoIdInvio(): string {
  return randomBytes(12).toString('base64url')
}
