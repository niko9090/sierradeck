import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  daSvuotare, indiceConDiNuovo, propostaChatEliminate, indiceSenza, leggiPulizie, misura, nuovaPulizia, NOME_PULIZIE, proposteDiPulizia, puliziaVuota, restaFuori, byteLeggibili,
  type Proposta, type Pulizia, type RegistroPulizie, type StatoSpazio, type TipoProposta, PULIZIA_DA_SOLA_OGNI_MS, pulizieDaSole,
  idInRecupero, nomiInRecupero, percorsiPerNome, tipoDi, versioniDaTenere, revisioniDaCancellare, stimaVersioni, propostaVersioni,
  chatDi, quotaMisurata, rigaQuota, RECUPERO_DRIVE_PIENO_DEFAULT,
  type StimaVersioni, type VersioniDiFile, type IndiceDrive, type QuotaMisurata, type RecuperoDrivePieno, type VocePulita
} from '@shared/spazio-drive'
import { eSpazioPieno, MESSAGGIO_DRIVE_PIENO } from './cassaforte/freno-drive'
import { proposteChatSulDrive, sessioniDelleVoci, spazioPoco } from '@shared/chat-sul-drive'
import type { Archivio } from './cassaforte/archivio'
import type { Manifesto } from './cassaforte/incrementale'
import type { Scatola } from './progetti/posta'

/**
 * Lo spazio sul Drive (0.65.0): la misura vera (quota dell'account e file di
 * SierraDeck per tipo), le proposte di pulizia, e le pulizie confermate da
 * Nicholas, in recupero per 30 giorni e annullabili. Le regole stanno in
 * `src/shared/spazio-drive.ts`.
 *
 * L'ordine di una pulizia, perché niente si perda a metà: prima la pulizia
 * si scrive nel registro (con ogni voce del manifesto che toglie), poi le
 * voci escono dal manifesto. Se il manifesto non si scrive, la pulizia si
 * segna annullata subito. I file restano sul Drive fino alla scadenza.
 */

export type { StatoSpazio, QuotaMisurata, RecuperoDrivePieno }

/**
 * **Drive pieno** (0.99). A Drive pieno il registro delle pulizie non si scrive
 * (il freno blocca POST/PUT/PATCH, non DELETE) e quindi nessuna pulizia partiva.
 * In questa modalita' l'ordine e':
 *   1. l'intenzione si annota in un file LOCALE (scrittura atomica);
 *   2. si cancella sul Drive (DELETE: libera spazio davvero) — solo le chat che
 *      hanno una copia intera su un PC, ricontrollato a ogni tentativo;
 *   3. l'indice (manifesto) e il registro si aggiornano quando il Drive accetta
 *      di nuovo scritture: se non riesce, l'intenzione resta in sospeso in
 *      locale e `giro()` la riprende (anche dopo un riavvio).
 * Fra l'intenzione e il registro sul Drive, `fuoriDalDrive` e le proposte
 * guardano anche le intenzioni in sospeso, cosi' niente risale o si ripropone.
 */
export type IntenzionePulizia = {
  /** L'id della pulizia. */
  id: string
  creataIl: string
  recupero: RecuperoDrivePieno
  /** La pulizia com'e' (o come sara') nel registro; con `salta`, `svuotataIl` si mette a cancellazione fatta. */
  pulizia: Pulizia
  /** Le chat da cancellare con la copia intera che deve esserci su un PC (`salta`). */
  controlli: { nome: string; sessione: string; size: number }[]
  fatto: { file: boolean; indice: boolean; registro: boolean }
}

/** Dove stanno le intenzioni in sospeso: un file locale, mai sul Drive. */
export type ArchivioIntenzioni = {
  leggi: () => IntenzionePulizia[]
  /** Deve essere atomica: o c'e' tutto o resta il file di prima. Puo' lanciare. */
  scrivi: (l: IntenzionePulizia[]) => void
}

/** Il file locale delle intenzioni: scrive in un temporaneo e lo rinomina. */
export function intenzioniSuDisco(percorso: string): ArchivioIntenzioni {
  return {
    leggi: () => {
      try {
        const j = JSON.parse(readFileSync(percorso, 'utf8')) as { intenzioni?: unknown }
        return Array.isArray(j.intenzioni) ? (j.intenzioni as IntenzionePulizia[]).filter((i) => typeof i?.id === 'string' && typeof i.pulizia?.id === 'string' && Array.isArray(i.pulizia.voci)) : []
      } catch { return [] }
    },
    scrivi: (l) => {
      mkdirSync(dirname(percorso), { recursive: true })
      const tmp = `${percorso}.${process.pid}.tmp`
      writeFileSync(tmp, JSON.stringify({ versione: 1, intenzioni: l }), 'utf8')
      renameSync(tmp, percorso)
    }
  }
}

/** Come si fa una pulizia: `drivePieno` forza la modalita' (di base: la decide il freno), `recupero` la scelta di sempre/definitiva. */
export type OpzioniPulizia = { drivePieno?: boolean; recupero?: RecuperoDrivePieno }
export type EsitoPulizia = { ok: boolean; messaggio: string; pulizia?: Pulizia; drivePieno?: boolean; inSospeso?: boolean }

/** Le pulizie che tolgono dal Drive l'unica copia «per scelta»: non chiedono la copia sul PC. */
const SENZA_CONTROLLO_COPIA: readonly TipoProposta[] = ['chat-eliminate', 'doppie']

const eErroreDrivePieno = (err: unknown): boolean => {
  const m = err instanceof Error ? err.message : String(err)
  return m === MESSAGGIO_DRIVE_PIENO || m.includes('Drive pieno:') || eSpazioPieno(m) || (err as { drivePieno?: boolean } | null)?.drivePieno === true
}

/** Ogni quanto il giro rivede quali chat stanno sul Drive. */
const GIRO_CHAT_OGNI_MS = 6 * 60 * 60_000
const GIRO_VERSIONI_OGNI_MS = 6 * 60 * 60_000

export type SpazioDrive = {
  stato: (forza?: boolean) => Promise<StatoSpazio>
  /**
   * Per il pannello (che si rilegge spesso, anche attraverso il ponte): la
   * misura già fatta se c'è, e intanto ne parte una nuova se è vecchia.
   * `undefined` = la prima misura è in corso.
   */
  subito: () => StatoSpazio | undefined
  /** `chi` (0.69.0): chi la fa quando non è Nicholas («automatico»). */
  pulisci: (tipo: TipoProposta, chi?: string, opz?: OpzioniPulizia) => Promise<EsitoPulizia>
  /**
   * «Elimina dal PC … anche dal Drive» (0.79.0): le copie di quelle chat
   * escono dall'indice del Drive e vanno nel recupero (30 giorni, annullabile).
   * A Drive pieno vedi `OpzioniPulizia` e `IntenzionePulizia`.
   */
  togliChat: (sessioni: string[], titolo: string, opz?: OpzioniPulizia) => Promise<EsitoPulizia>
  /**
   * La misura per la procedura guidata (0.99): quota dell'account (limite, usato,
   * percentuale, usatoNelDrive, nelCestino) e quanto occupa SierraDeck, per tipo.
   * `forza` salta la memoria di 5 minuti. Scrive una riga di log con la quota.
   * `undefined` se il Drive non e' collegato o la quota non si legge.
   */
  quota: (forza?: boolean) => Promise<QuotaMisurata | undefined>
  /**
   * Le pulizie annotate in locale e non ancora complete (file cancellati,
   * indice e registro riallineati): per dire a Nicholas «in sospeso».
   */
  inSospeso: () => IntenzionePulizia[]
  /** Riprende ora le intenzioni in sospeso (il giro lo fa da solo ogni 30 minuti e dopo un riavvio). */
  riprendiInSospeso: () => Promise<{ riprese: number; ancoraInSospeso: number }>
  /**
   * Le versioni vecchie (0.95.6): conta quante se ne possono togliere (una
   * richiesta per file: solo su richiesta), e le toglie. `libera` non parte
   * mai da sola: lo chiama solo la conferma di Nicholas, e rilegge le
   * versioni di ogni file prima di cancellare.
   */
  contaVersioni: () => Promise<{ ok: boolean; messaggio: string }>
  liberaVersioni: () => Promise<{ ok: boolean; messaggio: string }>
  annulla: (id: string) => Promise<{ ok: boolean; messaggio: string }>
  svuota: (id: string) => Promise<{ ok: boolean; messaggio: string }>
  /** Per il salvataggio: una voce tolta con una pulizia e uguale a com'era non risale. */
  fuoriDalDrive: (percorso: string, size?: number) => boolean
  /**
   * Le chat sul Drive (0.96.0): toglie dal Drive quelle non usate da troppo,
   * quelle dei workspace «solo su questo PC» e, con poco spazio, le più
   * grosse. Mai niente dal PC. Va da sola nel giro; qui per chiamarla subito
   * (per esempio quando si cambia l'impostazione di un workspace).
   */
  chatSulDrive: () => Promise<{ ok: boolean; messaggio: string; tolte: number }>
  /** Rilegge il registro e svuota le pulizie scadute. */
  giro: () => Promise<void>
}

export function creaSpazioDrive(deps: {
  archivio: () => Archivio | undefined
  scatola: () => Scatola | undefined
  manifestoDrive: () => Promise<Manifesto | undefined>
  modificaManifesto: (cambia: (m: Manifesto) => Manifesto | undefined, cosa: string) => Promise<{ ok: boolean; messaggio?: string }>
  /** Per conversazione: i PC che la hanno sul disco, e quanto è lunga lì. */
  copieSuiPc: () => Map<string, { nome: string; size: number }[]>
  io: () => { id: string; nome: string }
  log: (m: string) => void
  adesso?: () => number
  /** Questo percorso e' una chat di un workspace «solo su questo PC»? */
  soloQui?: (percorso: string) => boolean
  /** Le chat gia' diventate solo locali per lo spazio (minuscole). */
  sessioniSoloLocali?: () => ReadonlySet<string>
  /** Segna queste chat «solo locali»: da qui non salgono piu'. */
  segnaSoloLocali?: (sessioni: string[]) => void
  /** Il Drive e' pieno adesso (il freno)? */
  pieno?: () => boolean
  /** Google ha chiesto di rallentare: il giro aspetta. */
  inAttesa?: () => boolean
  /** Il Drive ha detto «pieno» e lo spazio non e' ancora tornato (anche dopo il ricontrollo del freno). */
  pienoDetto?: () => boolean
  /** Le intenzioni di pulizia a Drive pieno, su un file locale (`intenzioniSuDisco`). Senza, a Drive pieno non si pulisce. */
  intenzioni?: ArchivioIntenzioni
  /** `salta` o `tieni` per le pulizie a Drive pieno; di base `RECUPERO_DRIVE_PIENO_DEFAULT`. */
  recuperoDrivePieno?: () => RecuperoDrivePieno
}): SpazioDrive {
  const adesso = deps.adesso ?? Date.now
  let registro: RegistroPulizie | undefined
  let pendenti: IntenzionePulizia[] | undefined
  let riprendendo = false
  let ultimo: { il: number; stato: StatoSpazio } | undefined
  let ultimaPuliziaDaSola = 0
  let ultimoGiroChat = 0
  let ultimoGiroVersioni = 0
  let chatInCorso = false
  let inCorso: Promise<StatoSpazio> | undefined
  let stimaVersioniFatta: StimaVersioni | undefined
  let versioniInCorso = false

  /* Le intenzioni in sospeso: in memoria, riscritte sul file locale a ogni passo. */
  const elenco = (): IntenzionePulizia[] => (pendenti ??= deps.intenzioni?.leggi() ?? [])
  const salvaElenco = (l: IntenzionePulizia[]): void => {
    deps.intenzioni?.scrivi(l)
    pendenti = l
  }
  /** Dopo la prima annotazione un file locale che non si scrive non ferma il lavoro: resta in memoria. */
  const aggiorna = (id: string, cambia: (i: IntenzionePulizia) => IntenzionePulizia): IntenzionePulizia | undefined => {
    const attuale = elenco().find((x) => x.id === id)
    if (attuale === undefined) return undefined
    const nuova = cambia(attuale)
    const l = elenco().map((x) => (x.id === id ? nuova : x))
    try { salvaElenco(l) } catch (err) { pendenti = l; deps.log(`[spazio] intenzione ${id}: file locale non scritto (${err instanceof Error ? err.message : String(err)})`) }
    return nuova
  }
  const togliIntenzione = (id: string): void => {
    const l = elenco().filter((x) => x.id !== id)
    try { salvaElenco(l) } catch (err) { pendenti = l; deps.log(`[spazio] intenzione ${id}: file locale non scritto (${err instanceof Error ? err.message : String(err)})`) }
  }
  /** Il registro com'e' sul Drive, con sopra le pulizie annotate in locale e non ancora scritte sul Drive. */
  const conPendenti = (r: RegistroPulizie): RegistroPulizie => {
    const da = elenco().filter((i) => !i.fatto.registro)
    if (da.length === 0) return r
    const ids = new Set(da.map((i) => i.id))
    return { ...r, pulizie: [...r.pulizie.filter((x) => !ids.has(x.id)), ...da.map((i) => i.pulizia)] }
  }
  /** L'indice senza le voci di pulizie gia' decise e non ancora tolte dall'indice (in sospeso): non si riproporrebbero due volte. */
  const indiceVisto = (indice: IndiceDrive): IndiceDrive => {
    const fuori = new Set(elenco().filter((i) => !i.fatto.indice).flatMap((i) => i.pulizia.voci.map((v) => v.percorso).filter((x): x is string => x !== undefined)))
    return fuori.size === 0 ? indice : Object.fromEntries(Object.entries(indice).filter(([p]) => !fuori.has(p)))
  }
  const leggiRegistroDrive = async (): Promise<RegistroPulizie> => {
    const s = deps.scatola()
    if (s === undefined) return registro ?? puliziaVuota()
    registro = leggiPulizie(await s.leggi<unknown>(NOME_PULIZIE))
    return registro
  }
  const leggiRegistro = async (): Promise<RegistroPulizie> => conPendenti(await leggiRegistroDrive())
  const scriviRegistro = async (r: RegistroPulizie): Promise<void> => {
    const s = deps.scatola()
    if (s === undefined) throw new Error('Drive non collegato o cassaforte chiusa')
    await s.scrivi(NOME_PULIZIE, r)
    registro = r
    ultimo = undefined
  }
  const cambiaPulizia = async (id: string, cambia: (p: Pulizia) => Pulizia): Promise<void> => {
    const r = await leggiRegistro()
    await scriviRegistro({ ...r, pulizie: r.pulizie.map((p) => (p.id === id ? cambia(p) : p)) })
  }

  const leggiTutto = async (): Promise<StatoSpazio> => {
    const a = deps.archivio()
    if (a?.elencaConDimensioni === undefined) return { proposte: [], pulizie: [], errore: 'Il Drive non è collegato, o la cassaforte è chiusa.' }
    const [file, quota, manifesto, r] = await Promise.all([
      a.elencaConDimensioni(),
      a.quota?.().catch((err: unknown) => { deps.log(`[spazio] quota non letta: ${err instanceof Error ? err.message : String(err)}`); return undefined }),
      deps.manifestoDrive(),
      leggiRegistro()
    ])
    if (manifesto === undefined) return { proposte: [], pulizie: r.pulizie, errore: 'L’indice del Drive non si apre adesso: riprovo dopo.' }
    const m = misura({ file, indice: manifesto.file, ...(quota !== undefined ? { quota } : {}), pulizie: r, adesso: adesso() })
    const qm = quotaMisurata(m)
    if (qm !== undefined) deps.log(rigaQuota(qm))
    const proposte = proposteDiPulizia({ file, indice: indiceVisto(manifesto.file), copieSuiPc: deps.copieSuiPc(), pulizie: r, adesso: adesso() })
    if (stimaVersioniFatta !== undefined && stimaVersioniFatta.revisioni > 0) proposte.push(propostaVersioni(stimaVersioniFatta))
    return { misura: m, proposte, pulizie: [...r.pulizie].sort((x, y) => y.quando.localeCompare(x.quando)) }
  }

  const togliFile = async (p: Pulizia): Promise<{ tolti: number; errori: number }> => {
    const a = deps.archivio()
    if (a === undefined) throw new Error('Drive non collegato')
    let tolti = 0
    let errori = 0
    for (const v of p.voci) {
      try {
        // Un doppione per nome si toglie per id: il nome e' anche quello del file che resta.
        if (v.id !== undefined) {
          if (a.cancellaId === undefined) throw new Error('questo Drive non cancella per id')
          await a.cancellaId(v.id)
        } else await a.cancella(v.nome)
        tolti += 1
      } catch (err) { errori += 1; deps.log(`[spazio] ${v.nome} non cancellato dal Drive: ${err instanceof Error ? err.message : String(err)}`) }
    }
    return { tolti, errori }
  }

  /** Un passo alla volta sulle intenzioni: il giro e una pulizia di Nicholas non lavorano sulla stessa insieme. */
  let fila: Promise<unknown> = Promise.resolve()
  const inFila = <T>(f: () => Promise<T>): Promise<T> => {
    const p = fila.then(f, f)
    fila = p.catch(() => undefined)
    return p
  }

  const sommaByte = (v: VocePulita[]): number => v.reduce((t, x) => t + x.byte, 0)
  const messaggioErrore = (err: unknown): string => (err instanceof Error ? err.message : String(err))

  /**
   * Porta avanti un'intenzione: cancella sul Drive (`salta`), toglie le voci
   * dall'indice, riporta la pulizia nel registro. Ogni passo si ricorda in
   * locale e si puo' ripetere. Le scritture sul Drive si provano solo se il
   * freno non dice «pieno»; se falliscono resta tutto in sospeso.
   */
  const esegui = (id: string): Promise<{ completa: boolean; tolti: number; errori: number; int?: IntenzionePulizia }> => inFila(async () => {
    let int = elenco().find((x) => x.id === id)
    if (int === undefined) return { completa: true, tolti: 0, errori: 0 }
    let tolti = 0
    let errori = 0
    if (!int.fatto.file) {
      if (int.recupero === 'salta') {
        // Mai perdere lavoro: la copia intera sul PC si ricontrolla adesso, non quando e' stata annotata.
        const copie = deps.copieSuiPc()
        const mancano = new Set(int.controlli.filter((c) => !(copie.get(c.sessione) ?? []).some((x) => x.size >= c.size)).map((c) => c.nome))
        if (mancano.size > 0) {
          deps.log(`[spazio] pulizia «${int.pulizia.titolo}»: ${mancano.size} file lasciati sul Drive, la copia intera sul PC non c'e' piu'`)
          int = aggiorna(id, (i) => {
            const voci = i.pulizia.voci.filter((v) => !mancano.has(v.nome))
            return { ...i, controlli: i.controlli.filter((c) => !mancano.has(c.nome)), pulizia: { ...i.pulizia, voci, byte: sommaByte(voci) } }
          }) as IntenzionePulizia
        }
        // Niente piu' da togliere (nessuna copia intera sul PC): non c'e' nulla da portare avanti.
        if (int.pulizia.voci.length === 0) { togliIntenzione(id); return { completa: true, tolti: 0, errori: 0 } }
        const r = await togliFile(int.pulizia)
        tolti = r.tolti
        errori = r.errori
        if (errori > 0) return { completa: false, tolti, errori, int }
        int = aggiorna(id, (i) => ({ ...i, fatto: { ...i.fatto, file: true }, pulizia: { ...i.pulizia, svuotataIl: i.pulizia.svuotataIl ?? new Date(adesso()).toISOString() } })) as IntenzionePulizia
        // Il Drive dice com'e' messo adesso (e, se lo spazio e' tornato, il freno lo sa subito): una riga di quota.
        const q = await deps.archivio()?.quota?.().catch(() => undefined)
        if (q !== undefined) deps.log(`[spazio] dopo la cancellazione: usato ${byteLeggibili(q.usato)}${q.limite !== undefined ? ` di ${byteLeggibili(q.limite)}` : ''}`)
      } else {
        int = aggiorna(id, (i) => ({ ...i, fatto: { ...i.fatto, file: true } })) as IntenzionePulizia
      }
    }
    const scrittura = deps.pieno?.() !== true
    if (!int.fatto.indice && scrittura) {
      const conVoce = int.pulizia.voci.filter((v) => v.percorso !== undefined)
      if (conVoce.length === 0) int = aggiorna(id, (i) => ({ ...i, fatto: { ...i.fatto, indice: true } })) as IntenzionePulizia
      else {
        const e = await deps.modificaManifesto((m) => ({ ...m, file: indiceSenza(m.file, conVoce) }), `PULIZIA ${int!.id} («${int!.pulizia.titolo}»)`)
        if (e.ok) int = aggiorna(id, (i) => ({ ...i, fatto: { ...i.fatto, indice: true } })) as IntenzionePulizia
        else deps.log(`[spazio] pulizia «${int.pulizia.titolo}»: l'indice non si aggiorna adesso (${e.messaggio ?? '?'}): in sospeso`)
      }
    }
    if (!int.fatto.registro && scrittura) {
      try {
        const attuale = int.pulizia
        const r = await leggiRegistroDrive()
        await scriviRegistro({ ...r, pulizie: [...r.pulizie.filter((x) => x.id !== attuale.id), attuale] })
        int = aggiorna(id, (i) => ({ ...i, fatto: { ...i.fatto, registro: true } })) as IntenzionePulizia
      } catch (err) {
        deps.log(`[spazio] pulizia «${int.pulizia.titolo}»: il registro non si scrive adesso (${messaggioErrore(err)}): in sospeso`)
      }
    }
    const completa = int.fatto.file && int.fatto.indice && int.fatto.registro
    if (completa) togliIntenzione(id)
    return { completa, tolti, errori, int }
  })

  /** Riprende le intenzioni annotate e non finite (dopo un riavvio, o al primo giro con spazio). */
  const riprendi = async (): Promise<{ riprese: number; ancoraInSospeso: number }> => {
    if (riprendendo) return { riprese: 0, ancoraInSospeso: elenco().length }
    riprendendo = true
    try {
      let riprese = 0
      for (const i of [...elenco()]) {
        const e = await esegui(i.id)
        if (e.completa) { riprese += 1; deps.log(`[spazio] pulizia «${i.pulizia.titolo}» ripresa e completata (cancellazione, indice e registro)`) }
      }
      return { riprese, ancoraInSospeso: elenco().length }
    } finally {
      riprendendo = false
    }
  }

  /** «Svuota» di una pulizia in recupero: stessa intenzione locale, cosi' un registro che non si scrive non lascia l'incoerenza. */
  const svuotaPulizia = async (p: Pulizia): Promise<{ tolti: number; errori: number; sospeso: boolean }> => {
    const gia = elenco().find((x) => x.id === p.id)
    const int: IntenzionePulizia = gia !== undefined
      ? { ...gia, recupero: 'salta', fatto: { ...gia.fatto, file: gia.recupero === 'salta' ? gia.fatto.file : false } }
      : { id: p.id, creataIl: new Date(adesso()).toISOString(), recupero: 'salta', pulizia: p, controlli: [], fatto: { file: false, indice: true, registro: false } }
    salvaElenco([...elenco().filter((x) => x.id !== p.id), int])
    const e = await esegui(p.id)
    return { tolti: e.tolti, errori: e.errori, sospeso: !e.completa && e.errori === 0 }
  }

  /**
   * Una pulizia a Drive pieno: l'intenzione prima in locale, poi la cancellazione
   * sul Drive (`salta`) o il recupero (`tieni`), poi indice e registro appena si puo'.
   */
  const applicaPiena = async (pr: Proposta, chi: string | undefined, recuperoOpz: RecuperoDrivePieno | undefined): Promise<EsitoPulizia> => {
    const io = deps.io()
    const recupero = recuperoOpz ?? deps.recuperoDrivePieno?.() ?? RECUPERO_DRIVE_PIENO_DEFAULT
    if (deps.intenzioni === undefined) return { ok: false, messaggio: 'Drive pieno: non riesco ad annotare la pulizia su questo PC, quindi non cancello niente.', drivePieno: true }
    let voci = pr.voci
    let controlli: IntenzionePulizia['controlli'] = []
    let lasciate = 0
    if (recupero === 'salta' && !SENZA_CONTROLLO_COPIA.includes(pr.tipo)) {
      // La stessa regola delle chat sul Drive: si toglie solo con una copia intera su un PC.
      const copie = deps.copieSuiPc()
      const principale = new Map<string, number>()
      for (const v of pr.voci) {
        const c = v.percorso === undefined ? undefined : chatDi(v.percorso)
        if (c?.principale === true && v.voce !== undefined) principale.set(c.sessione, v.voce.size)
      }
      const buone: VocePulita[] = []
      for (const v of pr.voci) {
        if (v.percorso === undefined) { buone.push(v); continue }
        const c = chatDi(v.percorso)
        // Un file con voce nell'indice che non e' una chat (un progetto) non si cancella mai cosi'.
        if (c === undefined) { lasciate += 1; continue }
        const size = principale.get(c.sessione) ?? 1
        if ((copie.get(c.sessione) ?? []).some((x) => x.size >= size)) { buone.push(v); controlli.push({ nome: v.nome, sessione: c.sessione, size }) } else lasciate += 1
      }
      voci = buone
    }
    if (voci.length === 0) return { ok: false, messaggio: 'Drive pieno: niente da togliere, nessuna di queste chat ha una copia intera su un PC. Sul Drive non ho cancellato niente.', drivePieno: true }
    const p = nuovaPulizia({ ...pr, voci, byte: sommaByte(voci) }, { id: `pulizia-${new Date(adesso()).toISOString().replace(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}`, chi: chi ?? io.nome, adesso: adesso() })
    const int: IntenzionePulizia = { id: p.id, creataIl: new Date(adesso()).toISOString(), recupero, pulizia: p, controlli, fatto: { file: false, indice: false, registro: false } }
    try { salvaElenco([...elenco(), int]) } catch (err) {
      pendenti = undefined
      return { ok: false, messaggio: `Drive pieno: non riesco ad annotare la pulizia su questo PC (${messaggioErrore(err)}): non ho cancellato niente.`, drivePieno: true }
    }
    deps.log(`[spazio] Drive pieno: pulizia «${p.titolo}» annotata in locale (${voci.length} file, ${byteLeggibili(p.byte)}, recupero: ${recupero})`)
    const e = await esegui(p.id)
    const attuale = e.int?.pulizia ?? p
    const sospeso = !e.completa
    const nota = `${lasciate > 0 ? ` ${lasciate} file lasciati sul Drive: non hanno una copia intera sul PC.` : ''}${sospeso ? ' Indice e registro si aggiornano da soli appena il Drive accetta scritture.' : ''}`
    if (recupero === 'tieni') {
      deps.log(`[spazio] Drive pieno: pulizia «${p.titolo}» nel recupero (${voci.length} file): non libera spazio fino alla scadenza${sospeso ? ', registro in sospeso' : ''}`)
      return { ok: true, messaggio: `${voci.length} file nel recupero per 30 giorni (${byteLeggibili(p.byte)}): a Drive pieno non libera spazio.${nota}`, pulizia: attuale, drivePieno: true, inSospeso: sospeso }
    }
    if (e.errori > 0) return { ok: false, messaggio: `Drive pieno: ${e.tolti} file cancellati dal Drive, ${e.errori} no. Riprovo da solo.${nota}`, pulizia: attuale, drivePieno: true, inSospeso: true }
    deps.log(`[spazio] Drive pieno: pulizia «${p.titolo}» cancellata dal Drive: ${voci.length} file (${byteLeggibili(p.byte)}), sul PC restano${sospeso ? ', registro in sospeso' : ''}`)
    return { ok: true, messaggio: `${voci.length} file cancellati dal Drive (${byteLeggibili(p.byte)} liberati). Sul PC restano le copie.${nota}`, pulizia: attuale, drivePieno: true, inSospeso: sospeso }
  }

  /** Una pulizia confermata: a Drive pieno vedi `applicaPiena`, se no `applicaNormale`. */
  const applica = async (pr: Proposta, chi?: string, opz?: OpzioniPulizia): Promise<EsitoPulizia> => {
    const piena = opz?.drivePieno ?? (deps.pieno?.() === true || deps.pienoDetto?.() === true)
    if (piena) return applicaPiena(pr, chi, opz?.recupero)
    try { return await applicaNormale(pr, chi) } catch (err) {
      // Il freno non lo sapeva ancora: e' il Drive a dire «pieno» alla prima scrittura.
      if (eErroreDrivePieno(err)) { deps.log('[spazio] il Drive e\' pieno: passo alla pulizia a Drive pieno'); return applicaPiena(pr, chi, opz?.recupero) }
      throw err
    }
  }

  /** Una pulizia confermata: prima nel registro, poi fuori dall'indice; se l'indice non si scrive, annullata subito. */
  const applicaNormale = async (pr: Proposta, chi?: string): Promise<EsitoPulizia> => {
    const io = deps.io()
    const p = nuovaPulizia(pr, { id: `pulizia-${new Date(adesso()).toISOString().replace(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}`, chi: chi ?? io.nome, adesso: adesso() })
    const r = await leggiRegistro()
    await scriviRegistro({ ...r, pulizie: [...r.pulizie, p] })
    const conVoce = p.voci.filter((v) => v.percorso !== undefined)
    if (conVoce.length > 0) {
      const e = await deps.modificaManifesto((m) => ({ ...m, file: indiceSenza(m.file, conVoce) }), `PULIZIA ${p.id} («${p.titolo}»)`)
      if (!e.ok) {
        // Se nemmeno questo si scrive, la pulizia resterebbe attiva su file ancora nell'indice: lo si dice forte.
        await cambiaPulizia(p.id, (x) => ({ ...x, annullataIl: new Date(adesso()).toISOString() })).catch((err: unknown) => deps.log(`[spazio] ATTENZIONE: pulizia ${p.id} non annullata nel registro (${err instanceof Error ? err.message : String(err)}): annullala da «Spazio sul Drive» prima che scada`))
        deps.log(`[spazio] pulizia «${p.titolo}» non fatta: ${e.messaggio ?? '?'}`)
        return { ok: false, messaggio: `Non fatta: ${e.messaggio ?? 'il Drive non ha risposto'}. Niente è cambiato.` }
      }
    }
    deps.log(`[spazio] pulizia «${p.titolo}» ${chi !== undefined ? `fatta da sola (${chi})` : `confermata da ${io.nome}`}: ${p.voci.length} file (${byteLeggibili(p.byte)}) nel recupero fino al ${p.scadeIl.slice(0, 10)}`)
    return { ok: true, messaggio: `${p.voci.length} file nel recupero per 30 giorni (${byteLeggibili(p.byte)}). «Annulla» li rimette.`, pulizia: p }
  }

  /**
   * I file con delle versioni da togliere: i dati delle chat, l'indice, i
   * battiti. Mai le lapidi, il registro delle pulizie, i workspace, la
   * cassaforte, i file dei progetti, le copie di sicurezza, i file in recupero.
   */
  const candidatiVersioni = async (a: Archivio): Promise<{ nome: string; id: string; tenere: number }[]> => {
    const [file, manifesto, r] = await Promise.all([a.elencaConDimensioni?.() ?? Promise.resolve([]), deps.manifestoDrive(), leggiRegistro()])
    if (manifesto === undefined) throw new Error('l’indice del Drive non si apre adesso')
    const perNome = percorsiPerNome(manifesto.file)
    const nomiFuori = nomiInRecupero(r)
    const idFuori = idInRecupero(r)
    const fuori: { nome: string; id: string; tenere: number }[] = []
    for (const f of file) {
      if (f.id === undefined || nomiFuori.has(f.nome) || idFuori.has(f.id)) continue
      const tenere = versioniDaTenere(f.nome, tipoDi(f.nome, perNome.get(f.nome)))
      if (tenere !== undefined) fuori.push({ nome: f.nome, id: f.id, tenere })
    }
    return fuori
  }

  /** Quattro alla volta: sono richieste al Drive, con il suo limite al minuto. */
  const inParallelo = async <T>(voci: T[], quanti: number, fai: (v: T) => Promise<void>): Promise<void> => {
    let i = 0
    const lavora = async (): Promise<void> => { while (i < voci.length) { const v = voci[i++] as T; await fai(v) } }
    await Promise.all(Array.from({ length: Math.min(quanti, voci.length) }, lavora))
  }

  return {
    async contaVersioni() {
      const a = deps.archivio()
      if (a?.elencaRevisioni === undefined) return { ok: false, messaggio: 'Il Drive non è collegato, o la cassaforte è chiusa.' }
      if (versioniInCorso) return { ok: false, messaggio: 'Le versioni si stanno già contando.' }
      versioniInCorso = true
      try {
        const lette: VersioniDiFile[] = []
        let errori = 0
        let primoErrore: string | undefined
        // Diagnosi (0.99): quante revisioni il Drive mostra in tutto, e per quanti file ne mostra piu' di una.
        // Se «0 da togliere» viene da qui (il Drive ne mostra una sola per file), il log lo dice.
        let viste = 0
        let conPiuDiUna = 0
        const cand = await candidatiVersioni(a)
        await inParallelo(cand, 4, async (c) => {
          try {
            const tutte = await a.elencaRevisioni!(c.id)
            viste += tutte.length
            if (tutte.length > 1) conPiuDiUna += 1
            lette.push({ nome: c.nome, id: c.id, revisioni: revisioniDaCancellare(tutte, c.tenere) })
          } catch (err) { errori += 1; primoErrore ??= messaggioErrore(err) }
        })
        stimaVersioniFatta = stimaVersioni(lette, adesso())
        ultimo = undefined
        deps.log(`[spazio] versioni vecchie contate: ${stimaVersioniFatta.revisioni} in ${stimaVersioniFatta.file.length} file su ${cand.length} (${byteLeggibili(stimaVersioniFatta.byte)}); il Drive mostra ${viste} revisioni in tutto, ${conPiuDiUna} file ne hanno piu' di una${errori > 0 ? `, ${errori} file non letti (${primoErrore ?? '?'})` : ''}`)
        return { ok: true, messaggio: stimaVersioniFatta.revisioni === 0 ? 'Nessuna versione vecchia da togliere.' : `${stimaVersioniFatta.revisioni} versioni vecchie, circa ${byteLeggibili(stimaVersioniFatta.byte)}.` }
      } catch (err) {
        return { ok: false, messaggio: `Non riesco a contare le versioni: ${err instanceof Error ? err.message : String(err)}` }
      } finally {
        versioniInCorso = false
      }
    },

    async liberaVersioni() {
      const a = deps.archivio()
      if (a?.elencaRevisioni === undefined || a.cancellaRevisione === undefined) return { ok: false, messaggio: 'Il Drive non è collegato, o la cassaforte è chiusa.' }
      if (versioniInCorso) return { ok: false, messaggio: 'Le versioni si stanno già contando.' }
      versioniInCorso = true
      let tolte = 0
      let rifiutate = 0
      let errori = 0
      let byte = 0
      try {
        const cand = await candidatiVersioni(a)
        await inParallelo(cand, 4, async (c) => {
          let daTogliere
          // Si rilegge adesso: quello che si cancella e' quello che c'e' ora, non la stima di prima.
          try { daTogliere = revisioniDaCancellare(await a.elencaRevisioni!(c.id), c.tenere) } catch { errori += 1; return }
          for (const rev of daTogliere) {
            try {
              if (await a.cancellaRevisione!(c.id, rev.id) === 'ok') { tolte += 1; byte += rev.byte }
              else { rifiutate += 1; deps.log(`[spazio] versione ${rev.id} di ${c.nome}: il Drive non la cancella, la salto`) }
            } catch (err) {
              errori += 1
              deps.log(`[spazio] versione ${rev.id} di ${c.nome} non cancellata: ${err instanceof Error ? err.message : String(err)}`)
            }
          }
        })
      } catch (err) {
        return { ok: false, messaggio: `Non riesco a togliere le versioni: ${err instanceof Error ? err.message : String(err)}` }
      } finally {
        versioniInCorso = false
        stimaVersioniFatta = undefined
        ultimo = undefined
      }
      deps.log(`[spazio] versioni vecchie tolte su conferma: ${tolte} (${byteLeggibili(byte)}), ${rifiutate} rifiutate dal Drive, ${errori} errori`)
      const saltate = rifiutate + errori
      return { ok: true, messaggio: `Tolte ${tolte} versioni vecchie (circa ${byteLeggibili(byte)} liberati)${saltate > 0 ? `; ${saltate} saltate, il Drive non le ha cancellate` : ''}.` }
    },

    async stato(forza = false) {
      if (!forza && ultimo !== undefined && adesso() - ultimo.il < 5 * 60_000) return ultimo.stato
      if (inCorso !== undefined) return inCorso
      inCorso = (async (): Promise<StatoSpazio> => {
        try {
          const st = await leggiTutto()
          if (st.errore === undefined) ultimo = { il: adesso(), stato: st }
          return st
        } catch (err) {
          return { proposte: [], pulizie: registro?.pulizie ?? [], errore: `Non riesco a misurare il Drive: ${err instanceof Error ? err.message : String(err)}` }
        } finally {
          inCorso = undefined
        }
      })()
      return inCorso
    },

    subito() {
      if (ultimo === undefined || adesso() - ultimo.il >= 5 * 60_000) void this.stato().catch(() => undefined)
      return ultimo?.stato
    },

    async quota(forza = false) {
      const st = await this.stato(forza)
      return st.misura === undefined ? undefined : quotaMisurata(st.misura)
    },

    inSospeso: () => [...elenco()],

    riprendiInSospeso: () => riprendi(),

    async pulisci(tipo, chi, opz) {
      // Le versioni non passano dal recupero e non partono mai da sole: hanno la loro conferma.
      if (tipo === 'versioni') return { ok: false, messaggio: 'Le versioni vecchie si tolgono con la loro conferma.' }
      // Le proposte si rifanno adesso: quello che si toglie è quello che c'è ora.
      const st = await leggiTutto()
      if (st.errore !== undefined) return { ok: false, messaggio: st.errore }
      const pr = st.proposte.find((x) => x.tipo === tipo)
      if (pr === undefined || pr.voci.length === 0) return { ok: false, messaggio: 'Non c’è più niente da pulire qui.' }
      return applica(pr, chi, opz)
    },

    async togliChat(sessioni, titolo, opz) {
      const a = deps.archivio()
      if (a?.elencaConDimensioni === undefined) return { ok: false, messaggio: 'Il Drive non è collegato, o la cassaforte è chiusa.' }
      const [file, manifesto, r] = await Promise.all([a.elencaConDimensioni(), deps.manifestoDrive(), leggiRegistro()])
      if (manifesto === undefined) return { ok: false, messaggio: 'L’indice del Drive non si apre adesso.' }
      const pr = propostaChatEliminate({ file, indice: indiceVisto(manifesto.file), sessioni, titolo, pulizie: r })
      if (pr.voci.length === 0) return { ok: true, messaggio: 'Sul Drive non c’erano copie di queste chat.' }
      return applica(pr, undefined, opz)
    },

    async annulla(id) {
      const r = await leggiRegistro()
      const p = r.pulizie.find((x) => x.id === id)
      if (p === undefined) return { ok: false, messaggio: 'Pulizia non trovata.' }
      if (p.annullataIl !== undefined) return { ok: false, messaggio: 'Già annullata.' }
      if (p.svuotataIl !== undefined) return { ok: false, messaggio: 'Il recupero è già stato svuotato: i file non ci sono più.' }
      const a = deps.archivio()
      const esistono = new Set((await a?.elencaConDimensioni?.() ?? []).map((f) => f.nome))
      let rimesse = 0
      let restano = 0
      const e = await deps.modificaManifesto((m) => {
        const x = indiceConDiNuovo(m.file, p.voci, (n) => esistono.has(n))
        rimesse = x.rimesse
        restano = x.restano
        return x.rimesse === 0 ? undefined : { ...m, file: x.indice }
      }, `ANNULLA PULIZIA ${p.id}`)
      if (!e.ok) return { ok: false, messaggio: `Non annullata: ${e.messaggio ?? '?'}` }
      await cambiaPulizia(id, (x) => ({ ...x, annullataIl: new Date(adesso()).toISOString() }))
      deps.log(`[spazio] pulizia «${p.titolo}» annullata: ${rimesse} voci rimesse nell’indice${restano > 0 ? `, ${restano} lasciate (una copia più nuova le ha sostituite)` : ''}`)
      return { ok: true, messaggio: `Annullata: ${rimesse} file di nuovo al loro posto${restano > 0 ? ` (${restano} hanno già una copia più nuova)` : ''}.` }
    },

    async svuota(id) {
      const r = await leggiRegistro()
      const p = r.pulizie.find((x) => x.id === id)
      if (p === undefined || p.annullataIl !== undefined || p.svuotataIl !== undefined) return { ok: false, messaggio: 'Non c’è niente da svuotare.' }
      // L'intenzione si annota prima di cancellare: se il registro non si scrive (Drive pieno) resta in sospeso e si riallinea dopo.
      const e = await svuotaPulizia(p)
      deps.log(`[spazio] recupero «${p.titolo}» svuotato su richiesta: ${e.tolti} file cancellati${e.errori > 0 ? `, ${e.errori} non riusciti` : ''}${e.sospeso ? ', registro in sospeso' : ''}`)
      // Svuotata solo se è andato via tutto: altrimenti resta, e il giro (o un nuovo «Svuota») riprova.
      if (e.errori > 0) return { ok: false, messaggio: `${e.tolti} file cancellati, ${e.errori} no: riprova più tardi` }
      return { ok: true, messaggio: `Svuotato: ${byteLeggibili(p.byte)} liberati.${e.sospeso ? ' Il registro si aggiorna da solo appena il Drive accetta scritture.' : ''}` }
    },

    fuoriDalDrive: (percorso, size) => restaFuori(registro === undefined ? undefined : conPendenti(registro), percorso, size),

    async chatSulDrive() {
      if (deps.inAttesa?.() === true) return { ok: false, messaggio: 'Il Drive chiede di rallentare: riprovo dopo.', tolte: 0 }
      if (chatInCorso) return { ok: false, messaggio: 'Le chat sul Drive si stanno già sistemando.', tolte: 0 }
      chatInCorso = true
      try {
        const st = await leggiTutto()
        if (st.errore !== undefined || st.misura === undefined) return { ok: false, messaggio: st.errore ?? 'Il Drive non risponde.', tolte: 0 }
        const r = await leggiRegistro()
        const a = deps.archivio()
        const [file, manifesto] = await Promise.all([a?.elencaConDimensioni?.() ?? Promise.resolve([]), deps.manifestoDrive()])
        if (manifesto === undefined) return { ok: false, messaggio: 'L’indice del Drive non si apre adesso.', tolte: 0 }
        const pieno = deps.pieno?.() === true
        const poco = spazioPoco(st.misura.quota) || pieno
        const proposte = proposteChatSulDrive({
          file, indice: indiceVisto(manifesto.file), copieSuiPc: deps.copieSuiPc(), pulizie: r, adesso: adesso(),
          soloQui: deps.soloQui ?? (() => false),
          ...(deps.sessioniSoloLocali !== undefined ? { sessioniSoloLocali: deps.sessioniSoloLocali() } : {}),
          ...(st.misura.quota !== undefined ? { quota: st.misura.quota } : {}),
          pieno
        })
        let tolte = 0
        for (const pr of proposte) {
          if (pr.voci.length === 0) continue
          // Prima «solo locali», poi via dal Drive: cosi' un salvataggio in mezzo non le rimanda su.
          if (pr.tipo === 'chat-spazio-poco') deps.segnaSoloLocali?.(sessioniDelleVoci(pr.voci))
          const esito = await applica(pr, 'automatico')
          if (!esito.ok || esito.pulizia === undefined) { deps.log(`[spazio] chat sul Drive: «${pr.titolo}» non fatta (${esito.messaggio})`); continue }
          tolte += sessioniDelleVoci(esito.pulizia.voci).length
          // Con poco spazio il recupero di 30 giorni non libera niente: si svuota subito. Sul PC le chat restano.
          // A Drive pieno lo ha gia' deciso la pulizia (`salta` cancella, `tieni` no).
          if (poco && esito.drivePieno !== true) await this.svuota(esito.pulizia.id)
        }
        return { ok: true, messaggio: tolte === 0 ? 'Niente da togliere dal Drive.' : `${tolte} chat tolte dal Drive (sul PC restano).`, tolte }
      } catch (err) {
        return { ok: false, messaggio: `Chat sul Drive non sistemate: ${err instanceof Error ? err.message : String(err)}`, tolte: 0 }
      } finally {
        chatInCorso = false
      }
    },

    async giro() {
      if (deps.scatola() === undefined) return
      // Google ha chiesto di rallentare (k-192): niente giro, e' fatto di elenchi e cancellazioni.
      if (deps.inAttesa?.() === true) return
      try {
        // Prima le pulizie annotate in locale e rimaste a meta' (Drive pieno, o un riavvio).
        if (elenco().length > 0) {
          const r0 = await riprendi()
          if (r0.riprese > 0 || r0.ancoraInSospeso > 0) deps.log(`[spazio] pulizie in sospeso: ${r0.riprese} completate, ${r0.ancoraInSospeso} ancora in attesa`)
        }
        const r = await leggiRegistro()
        for (const p of daSvuotare(r, adesso())) {
          if (elenco().some((x) => x.id === p.id)) continue
          const e = await svuotaPulizia(p)
          deps.log(`[spazio] recupero «${p.titolo}» scaduto: ${e.tolti} file cancellati dal Drive (${byteLeggibili(p.byte)})${e.errori > 0 ? `, ${e.errori} non riusciti: riprovo al prossimo giro` : ''}${e.sospeso ? ', registro in sospeso' : ''}`)
        }
        // Il recupero scaduto va nel recupero da solo (0.69.0), una volta al giorno.
        if (adesso() - ultimaPuliziaDaSola >= PULIZIA_DA_SOLA_OGNI_MS) {
          ultimaPuliziaDaSola = adesso()
          const st = await leggiTutto()
          for (const pr of pulizieDaSole(st.proposte)) await this.pulisci(pr.tipo, 'automatico')
        }
        // Le chat sul Drive (0.96.0): ogni 6 ore, e subito se lo spazio e' finito.
        if (adesso() - ultimoGiroChat >= GIRO_CHAT_OGNI_MS || deps.pieno?.() === true) {
          ultimoGiroChat = adesso()
          const e = await this.chatSulDrive()
          if (e.tolte > 0 || !e.ok) deps.log(`[spazio] chat sul Drive: ${e.messaggio}`)
        }
        // Spazio finito (k-192): le versioni vecchie dei file che SierraDeck stesso ha scritto
        // (chat, indice, battiti) pesano quanto il file e non servono a nessuno. Si tolgono da
        // sole, tenendo quelle che `versioniDaTenere` dice, ogni 6 ore al piu'.
        if (deps.pieno?.() === true && adesso() - ultimoGiroVersioni >= GIRO_VERSIONI_OGNI_MS) {
          ultimoGiroVersioni = adesso()
          const e = await this.liberaVersioni()
          deps.log(`[spazio] Drive pieno, versioni vecchie: ${e.messaggio}`)
        }
      } catch (err) {
        deps.log(`[spazio] giro non riuscito: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }
}
