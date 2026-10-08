import { createHash, randomBytes } from 'node:crypto'
import { closeSync, createReadStream, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, rmSync, statSync } from 'node:fs'
import { copyFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import {
  FILE_PEZZO_BYTE, controllaConsegna, daRitirare, idConsegnaValido, inCorso, leggiTelefonoDelPonte, nomeCartella, potaCoda,
  type Consegna, type TelefonoNoto
} from '@shared/file-telefono'

/**
 * La coda dei file dal PC al telefono (0.54.0).
 *
 * «📱 Manda al telefono» (dal pannello dei file, dalla linguetta File di un
 * autopilota, o dalla chat con lo strumento `manda_al_telefono`) mette qui una
 * **copia** del file, per un telefono preciso: il file sul PC può cambiare o
 * sparire, quello che arriva è quello che si è mandato. Il telefono la ritira
 * quando si collega (app aperta, o il controllo in sottofondo), a pezzi da
 * 96 KB, chiedendo da dove riprendere; alla fine manda l'impronta, e solo se
 * torna la consegna è fatta e la copia si toglie.
 *
 * La coda sta su disco (`coda.json` + `<id>.bin` nella cartella dei dati):
 * regge un riavvio del PC e un telefono spento per giorni. Le consegne mai
 * ritirate scadono dopo due settimane; il PC le può annullare quando vuole.
 *
 * Chi è il telefono: la chiave con cui si presenta alle rotte (`tel:<id>` se
 * è accoppiato qui, `pc:tel:<id>@<PC>` se passa dal ponte di un altro PC).
 * Solo lui vede e scarica le sue consegne.
 */

export type Rifiuto = { ok: false; stato: number; errore: string }

export type AlTelefono = {
  /** Tutte, le più nuove prima: per l'elenco del PC. */
  elenco: () => Consegna[]
  leggi: (id: string) => Consegna | undefined
  /** I telefoni a cui si può mandare: accoppiati qui, o visti passare dal ponte. */
  telefoni: () => TelefonoNoto[]
  /** Un telefono che passa dal ponte si è fatto vivo: da qui in poi gli si può mandare. */
  visto: (visore: string, nome?: string, tramite?: string) => void
  /**
   * Mette un file in coda. `conferma` = va prima chiesto (un file fuori dalla
   * cartella della chat): resta in `conferma` senza copia finché non arriva il sì.
   */
  metti: (p: { file: string; a: string; nota?: string; da: 'pc' | 'chat'; daChat?: string; daSessione?: string; conferma?: boolean }) => Promise<{ ok: true; c: Consegna } | Rifiuto>
  /** Il sì o il no nelle Domande. */
  conferma: (id: string, si: boolean) => Promise<{ ok: true; c: Consegna } | Rifiuto>
  /** Quelle che quel telefono deve ritirare. */
  perTelefono: (a: string) => Consegna[]
  pezzo: (id: string, a: string, da: number) => { ok: true; dati: Buffer; byte: number } | Rifiuto
  ricevuta: (id: string, a: string, sha256: string) => { ok: true; c: Consegna } | Rifiuto
  annulla: (id: string) => Consegna | undefined
  /** Le consegne finite si possono togliere dall'elenco. */
  pulisci: () => void
  /** Chiamata a ogni cambiamento: il PC aggiorna il pannello, la chat che aspetta l'esito lo legge. */
  quandoCambia: (f: (c: Consegna) => void) => () => void
}

type Dispositivo = { id: string; nome: string; ultimoAccesso?: string }

export function apriAlTelefono(deps: {
  cartella: string
  /** I dispositivi accoppiati a questo PC. */
  dispositivi: () => Dispositivo[]
  /** Il nome di questo PC, scritto nella notifica del telefono. */
  nomePc: () => string
  adesso?: () => number
}): AlTelefono {
  const adesso = deps.adesso ?? (() => Date.now())
  mkdirSync(deps.cartella, { recursive: true })
  const fileCoda = join(deps.cartella, 'coda.json')
  const filePonte = join(deps.cartella, 'telefoni-dal-ponte.json')
  const copia = (id: string): string => join(deps.cartella, `${id}.bin`)
  const ascolti = new Set<(c: Consegna) => void>()

  const leggiJson = <T>(f: string, ripiego: T): T => {
    try { return JSON.parse(readFileSync(f, 'utf8')) as T } catch { return ripiego }
  }
  let coda: Consegna[] = (leggiJson<Consegna[]>(fileCoda, [])).filter((c) => typeof c === 'object' && c !== null && idConsegnaValido(c.id))
  let dalPonte: TelefonoNoto[] = leggiJson<TelefonoNoto[]>(filePonte, []).filter((t) => typeof t?.chiave === 'string')

  const salva = (): void => { scriviJsonAtomico(fileCoda, coda, 'al-telefono') }
  const cambia = (c: Consegna): void => {
    coda = coda.map((x) => (x.id === c.id ? c : x))
    salva()
    for (const f of ascolti) { try { f(c) } catch { /* chi ascolta non ferma la coda */ } }
  }
  const togliCopia = (id: string): void => { rmSync(copia(id), { force: true }) }
  const pota = (): void => {
    const p = potaCoda(coda, adesso())
    if (p.scadute.length === 0 && p.tolte.length === 0) return
    coda = p.coda
    for (const c of [...p.scadute, ...p.tolte]) togliCopia(c.id)
    salva()
    for (const c of p.scadute) for (const f of ascolti) { try { f(c) } catch { /* idem */ } }
  }
  /** Le copie senza consegna (un riavvio a metà di una scrittura): via. */
  const orfane = (): void => {
    try {
      const vive = new Set(coda.filter(inCorso).map((c) => `${c.id}.bin`))
      for (const n of readdirSync(deps.cartella)) {
        if (n.endsWith('.bin') && !vive.has(n)) rmSync(join(deps.cartella, n), { force: true })
        if (n.endsWith('.tmp')) rmSync(join(deps.cartella, n), { force: true })
      }
    } catch { /* cartella non leggibile: niente da pulire */ }
  }
  orfane()

  const telefoni = (): TelefonoNoto[] => {
    const qui: TelefonoNoto[] = deps.dispositivi().map((d) => ({
      chiave: `tel:${d.id}`, nome: d.nome, via: 'accoppiato' as const, ...(d.ultimoAccesso !== undefined ? { ultimoAccesso: d.ultimoAccesso } : {})
    }))
    return [...qui, ...dalPonte]
  }
  const nomeDi = (a: string): string => telefoni().find((t) => t.chiave === a)?.nome ?? 'il telefono'

  /** Copia il file e ne calcola l'impronta: quello che arriva è quello che si è mandato. */
  const preparaCopia = async (id: string, file: string): Promise<{ byte: number; sha256: string }> => {
    const tmp = `${copia(id)}.tmp`
    await copyFile(file, tmp)
    const sha256 = await new Promise<string>((ok, ko) => {
      const h = createHash('sha256')
      createReadStream(tmp).on('data', (b) => h.update(b)).on('error', ko).on('end', () => ok(h.digest('hex')))
    })
    renameSync(tmp, copia(id))
    return { byte: statSync(copia(id)).size, sha256 }
  }

  const suo = (id: string, a: string): { ok: true; c: Consegna } | Rifiuto => {
    const c = coda.find((x) => x.id === id)
    if (c === undefined || c.a !== a) return { ok: false, stato: 404, errore: 'Questo file non è (più) in coda per questo telefono.' }
    if (c.stato === 'annullata') return { ok: false, stato: 410, errore: 'Il PC ha annullato l’invio di questo file.' }
    if (c.stato === 'scaduta') return { ok: false, stato: 410, errore: c.motivo ?? 'Questo invio è scaduto.' }
    if (c.stato === 'consegnata') return { ok: false, stato: 410, errore: 'Questo file è già stato consegnato.' }
    if (c.stato !== 'attesa' && c.stato !== 'viaggio') return { ok: false, stato: 409, errore: 'Questo file non è ancora pronto da ritirare.' }
    return { ok: true, c }
  }

  return {
    elenco: () => { pota(); return [...coda].sort((x, y) => y.creata.localeCompare(x.creata)) },
    leggi: (id) => coda.find((c) => c.id === id),
    telefoni,

    visto(visore, nome, tramite) {
      if (leggiTelefonoDelPonte(visore) === undefined) return
      const ora = new Date(adesso()).toISOString()
      const prima = dalPonte.find((t) => t.chiave === visore)
      const nuovo: TelefonoNoto = {
        chiave: visore,
        nome: nome !== undefined && nome.trim() !== '' ? nome.trim().slice(0, 60) : prima?.nome ?? 'Telefono',
        via: 'ponte',
        ...(tramite !== undefined ? { tramite } : prima?.tramite !== undefined ? { tramite: prima.tramite } : {}),
        ultimoAccesso: ora
      }
      // Si riscrive solo se cambia qualcosa di più del minuto: il telefono chiede spesso.
      if (prima !== undefined && prima.nome === nuovo.nome && adesso() - Date.parse(prima.ultimoAccesso ?? '') < 60_000) return
      dalPonte = [...dalPonte.filter((t) => t.chiave !== visore), nuovo].slice(-20)
      scriviJsonAtomico(filePonte, dalPonte, 'al-telefono')
    },

    async metti(p) {
      pota()
      let s
      try { s = await stat(p.file) } catch { return { ok: false, stato: 404, errore: `Il file non c’è: ${p.file}` } }
      const nome = nomeCartella(p.file)
      const k = controllaConsegna({ nome, byte: s.size, cartella: s.isDirectory() }, coda, p.a)
      if (!k.ok) return k
      if (!s.isFile()) return { ok: false, stato: 400, errore: 'Si mandano solo file.' }
      if (!telefoni().some((t) => t.chiave === p.a)) return { ok: false, stato: 404, errore: 'Questo telefono non è (più) accoppiato a questo PC.' }
      const id = randomBytes(12).toString('base64url')
      const base: Consegna = {
        id, a: p.a, aNome: nomeDi(p.a), nome, byte: s.size, origine: p.file, da: p.da,
        ...(p.daChat !== undefined ? { daChat: p.daChat } : {}),
        ...(p.daSessione !== undefined ? { daSessione: p.daSessione } : {}),
        daPc: deps.nomePc(),
        ...(p.nota !== undefined && p.nota.trim() !== '' ? { nota: p.nota.trim().slice(0, 500) } : {}),
        creata: new Date(adesso()).toISOString(),
        stato: p.conferma === true ? 'conferma' : 'attesa'
      }
      if (p.conferma === true) {
        coda = [...coda, base]
        salva()
        for (const f of ascolti) { try { f(base) } catch { /* idem */ } }
        return { ok: true, c: base }
      }
      try {
        const { byte, sha256 } = await preparaCopia(id, p.file)
        const c: Consegna = { ...base, byte, sha256 }
        coda = [...coda, c]
        salva()
        for (const f of ascolti) { try { f(c) } catch { /* idem */ } }
        return { ok: true, c }
      } catch (e) {
        togliCopia(id)
        return { ok: false, stato: 500, errore: `Non sono riuscito a copiare il file per il telefono: ${e instanceof Error ? e.message : String(e)}` }
      }
    },

    async conferma(id, si) {
      const c = coda.find((x) => x.id === id)
      if (c === undefined) return { ok: false, stato: 404, errore: 'Questa richiesta non c’è più.' }
      if (c.stato !== 'conferma') return { ok: false, stato: 409, errore: 'Questa richiesta ha già avuto una risposta.' }
      if (!si) {
        const r: Consegna = { ...c, stato: 'rifiutata', finitaIl: new Date(adesso()).toISOString(), motivo: 'Nicholas ha risposto no nelle Domande: il file non è partito.' }
        cambia(r)
        return { ok: true, c: r }
      }
      // Il sì: il file si ricontrolla adesso (può essere cambiato o sparito nel frattempo).
      let s
      try { s = statSync(c.origine) } catch {
        const r: Consegna = { ...c, stato: 'rifiutata', finitaIl: new Date(adesso()).toISOString(), motivo: 'Il file non c’era più quando è arrivato il sì.' }
        cambia(r)
        return { ok: true, c: r }
      }
      const k = controllaConsegna({ nome: c.nome, byte: s.size, cartella: s.isDirectory() }, coda.filter((x) => x.id !== id), c.a)
      if (!k.ok) {
        const r: Consegna = { ...c, stato: 'rifiutata', finitaIl: new Date(adesso()).toISOString(), motivo: k.errore }
        cambia(r)
        return { ok: true, c: r }
      }
      try {
        const { byte, sha256 } = await preparaCopia(id, c.origine)
        const r: Consegna = { ...c, byte, sha256, stato: 'attesa' }
        cambia(r)
        return { ok: true, c: r }
      } catch (e) {
        togliCopia(id)
        const r: Consegna = { ...c, stato: 'rifiutata', finitaIl: new Date(adesso()).toISOString(), motivo: `Non sono riuscito a copiare il file: ${e instanceof Error ? e.message : String(e)}` }
        cambia(r)
        return { ok: true, c: r }
      }
    },

    perTelefono(a) { pota(); return daRitirare(coda, a) },

    pezzo(id, a, da) {
      const s = suo(id, a)
      if (!s.ok) return s
      const c = s.c
      if (!existsSync(copia(id))) {
        cambia({ ...c, stato: 'scaduta', finitaIl: new Date(adesso()).toISOString(), motivo: 'La copia sul PC è sparita: rimandalo.' })
        return { ok: false, stato: 410, errore: 'La copia sul PC è sparita: chiedi di rimandarlo.' }
      }
      if (!Number.isInteger(da) || da < 0 || da > c.byte) return { ok: false, stato: 416, errore: `Fuori dal file: è di ${c.byte} byte.` }
      const n = Math.min(FILE_PEZZO_BYTE, c.byte - da)
      const dati = Buffer.alloc(Math.max(0, n))
      if (n > 0) {
        const fd = openSync(copia(id), 'r')
        try { readSync(fd, dati, 0, n, da) } finally { closeSync(fd) }
      }
      // L'avanzamento lo dice chi scarica: si scrive al più ogni mega, non a ogni pezzo.
      const prima = c.ricevuti ?? -1
      const dopo = da + n
      if (c.stato === 'attesa' || dopo >= c.byte || Math.floor(dopo / (1024 * 1024)) !== Math.floor(prima / (1024 * 1024))) {
        cambia({ ...c, stato: 'viaggio', ricevuti: dopo })
      }
      return { ok: true, dati, byte: c.byte }
    },

    ricevuta(id, a, sha256) {
      const s = suo(id, a)
      if (!s.ok) return s
      const c = s.c
      if (c.sha256 !== undefined && c.sha256 !== sha256.toLowerCase()) {
        // Arrivato diverso: il telefono ricomincia da capo.
        cambia({ ...c, stato: 'attesa', ricevuti: 0 })
        return { ok: false, stato: 422, errore: 'Il file è arrivato diverso da com’era sul PC (l’impronta non torna): lo riscarico da capo.' }
      }
      const r: Consegna = { ...c, stato: 'consegnata', ricevuti: c.byte, finitaIl: new Date(adesso()).toISOString() }
      togliCopia(id)
      cambia(r)
      return { ok: true, c: r }
    },

    annulla(id) {
      const c = coda.find((x) => x.id === id)
      if (c === undefined || !inCorso(c)) return c
      const r: Consegna = { ...c, stato: 'annullata', finitaIl: new Date(adesso()).toISOString() }
      togliCopia(id)
      cambia(r)
      return r
    },

    pulisci() {
      for (const c of coda.filter((x) => !inCorso(x))) togliCopia(c.id)
      coda = coda.filter(inCorso)
      salva()
    },

    quandoCambia(f) { ascolti.add(f); return () => { ascolti.delete(f) } }
  }
}
