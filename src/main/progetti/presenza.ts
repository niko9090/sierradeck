import type { ProgettoDrive, RegistroProgettiStore } from './registro'

/**
 * Chi sta lavorando a un progetto sul Drive, e il passaggio di testimone.
 *
 * Due PC sullo stesso progetto senza saperlo e' il modo sicuro di perdere
 * lavoro: l'ultimo che salva vince, in silenzio. Qui ogni PC che ha una chat
 * viva dentro un progetto lascia sul Drive una **presenza** — chi, da quando,
 * un battito ogni tanto — e chi apre quel progetto da un altro PC lo viene a
 * sapere prima di scrivere una riga.
 *
 * Il passaggio e' obbligatorio (deciso da Nicholas, 2026-09-04): per lavorare
 * su un progetto in mano a un altro PC si **prende il testimone**. Si scrive
 * una richiesta (la staffetta), l'altro PC la vede al suo giro, salva, iberna
 * le sue chat di quel progetto e lascia la presenza; chi ha chiesto scarica
 * l'ultimo stato e la prende. Se l'altro non risponde — e' spento — si puo'
 * forzare, e lo si dice chiaro: si prende quello che c'e' sul Drive.
 *
 * Tutto vive in due piccoli file cifrati per progetto nell'archivio del
 * Drive, accanto ai dati: `presenza-<id>` e `staffetta-<id>`.
 */
export type Presenza = { pcId: string; pcNome: string; da: string; battito: string }
export type Staffetta = { daPc: string; daNome: string; quando: string }

/** Un battito piu' vecchio di cosi' e' un PC spento, o senza rete: la presenza non vale piu'. */
export const PRESENZA_SCADUTA_MS = 10 * 60_000
/** Ogni quanto si rinnova il battito mentre si lavora. */
export const BATTITO_OGNI_MS = 2 * 60_000
/** Senza chat vive per tanto cosi', si lascia la presenza da soli. */
export const RILASCIO_DOPO_MS = 5 * 60_000
/** Quanto si aspetta l'altro PC prima di dire che non risponde. */
export const ATTESA_TESTIMONE_MS = 90_000
export const CONTROLLO_TESTIMONE_MS = 3_000

export function nomePresenza(id: string): string { return `presenza-${id}` }
export function nomeStaffetta(id: string): string { return `staffetta-${id}` }
export function nomeCoda(id: string): string { return `coda-${id}` }

/**
 * La coda condivisa dei comandi di un progetto.
 *
 * Da qualunque PC si mettono in fila istruzioni per un progetto; le consegna
 * il PC che ha il testimone, alla prima chat del progetto che aspetta (o a
 * quella scelta), una per giro. E' il modo di dire a una chat che gira su un
 * altro computer «poi fai questo», senza essere davanti a quel computer e
 * senza aspettare che sia libera. Vive sul Drive, cifrata come le presenze.
 */
export type VoceCoda = {
  id: string
  testo: string
  creataIl: string
  daNome: string
  /** La chat a cui e' destinata (la sua conversazione); senza, la prima libera del progetto. */
  sessione?: string
  stato: 'attesa' | 'consegnata'
  consegnataIl?: string
  aNome?: string
  aSessione?: string
}
export type Coda = { voci: VoceCoda[] }

export function presenzaViva(p: Presenza | undefined, adesso: number): p is Presenza {
  if (p === undefined) return false
  const battito = Date.parse(p.battito)
  return !Number.isNaN(battito) && adesso - battito < PRESENZA_SCADUTA_MS
}

/** Un posto dove leggere e scrivere piccoli oggetti cifrati sul Drive. */
export type Scatola = {
  leggi: <T>(nome: string) => Promise<T | undefined>
  scrivi: (nome: string, oggetto: unknown) => Promise<void>
  cancella: (nome: string) => Promise<void>
}

export type StatoProgetto = {
  id: string
  nome: string
  /** `io`: la presenza e' di questo PC. `altro`: di un altro, viva. `libero`: nessuna, o scaduta. */
  chi: 'io' | 'altro' | 'libero'
  pcNome?: string
  da?: string
  /** Qualcuno ha chiesto il testimone a chi lo ha. */
  staffettaDa?: string
  /** Quanti comandi aspettano nella coda condivisa. */
  inCoda?: number
}

export type AvvisoProgetto =
  | { tipo: 'occupato'; progettoId: string; nome: string; pcNome: string; da: string }
  | { tipo: 'ceduto'; progettoId: string; nome: string; aNome: string; sessioni: string[] }

export type EsitoTestimone =
  | { ok: true; conflitti?: number }
  | { ok: false; nonRisponde: true; pcNome: string }
  | { ok: false; messaggio: string }

export type Ronda = {
  /** Un giro: presenze, battiti, richieste. Da chiamare ogni mezzo minuto. */
  giro: () => Promise<void>
  stati: () => StatoProgetto[]
  statoDi: (id: string) => StatoProgetto | undefined
  /** Il progetto in cui sta una cartella di questo PC, e il suo stato. */
  statoDiCwd: (cwd: string) => StatoProgetto | undefined
  /** Prima di aprire una chat: se il progetto e' in mano a un altro PC, avvisa (una volta). */
  primaDiAprire: (cwd: string) => void
  prendiTestimone: (id: string, forza?: boolean) => Promise<EsitoTestimone>
  /** I progetti in mano a un altro PC: non si salvano da qui, o si sovrascriverebbe il suo lavoro. */
  inManoAdAltri: () => Set<string>
  /** La coda condivisa di un progetto, com'e' sul Drive. */
  coda: (id: string) => Promise<Coda | undefined>
  aggiungiInCoda: (id: string, testo: string, sessione?: string) => Promise<Coda | undefined>
  modificaInCoda: (id: string, voceId: string, testo: string, sessione?: string) => Promise<Coda | undefined>
  togliDallaCoda: (id: string, voceId: string) => Promise<Coda | undefined>
  /** Toglie le voci gia' consegnate. */
  pulisciCoda: (id: string) => Promise<Coda | undefined>
}

export function creaRonda(deps: {
  scatola: () => Scatola | undefined
  registro: RegistroProgettiStore
  pcId: () => string
  pcNome: () => string
  /** Le sessioni delle chat vive di questo PC dentro quel progetto. */
  vive: (p: ProgettoDrive) => string[]
  progettoDi: (cwd: string) => ProgettoDrive | undefined
  salva: () => Promise<{ ok: boolean; messaggio?: string }>
  ripristinaProgetto: (id: string) => Promise<{ ok: boolean; messaggio?: string; conflitti?: number }>
  iberna: (sessioni: string[]) => void
  avvisa: (a: AvvisoProgetto) => void
  /**
   * Consegna un comando della coda a una chat del progetto che aspetta:
   * la prima libera, o quella indicata. Torna a chi l'ha dato, o `undefined`
   * se in questo momento nessuna chat puo' riceverlo.
   */
  consegna?: (p: ProgettoDrive, voce: VoceCoda) => Promise<{ sessione?: string } | undefined>
  nuovoId?: () => string
  adesso?: () => number
  aspetta?: (ms: number) => Promise<void>
  log?: (m: string) => void
}): Ronda {
  const adesso = deps.adesso ?? ((): number => Date.now())
  const aspetta = deps.aspetta ?? ((ms: number): Promise<void> => new Promise((r) => { setTimeout(r, ms) }))
  const log = deps.log ?? ((): void => {})
  const stati = new Map<string, StatoProgetto>()
  const avvisati = new Set<string>()
  const inCoda = new Map<string, number>()
  let inGiro = false
  const nuovoId = deps.nuovoId ?? ((): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`)

  const leggiCoda = async (s: Scatola, id: string): Promise<Coda> => {
    const c = await s.leggi<Coda>(nomeCoda(id))
    return c !== undefined && Array.isArray(c.voci) ? c : { voci: [] }
  }
  const scriviCoda = async (s: Scatola, id: string, c: Coda): Promise<Coda> => {
    if (c.voci.length === 0) await s.cancella(nomeCoda(id))
    else await s.scrivi(nomeCoda(id), c)
    inCoda.set(id, c.voci.filter((v) => v.stato === 'attesa').length)
    return c
  }
  const conCoda = async (id: string, cambia: (c: Coda) => Coda): Promise<Coda | undefined> => {
    const s = deps.scatola()
    if (s === undefined) return undefined
    return scriviCoda(s, id, cambia(await leggiCoda(s, id)))
  }
  /**
   * Un comando dalla coda alla chat: uno per giro, cosi' la chat lo lavora
   * prima di riceverne un altro. Se nessuna chat aspetta, resta in coda.
   */
  const consegnaDallaCoda = async (s: Scatola, p: ProgettoDrive): Promise<void> => {
    if (deps.consegna === undefined) return
    const coda = await leggiCoda(s, p.id)
    const prossima = coda.voci.find((v) => v.stato === 'attesa')
    if (prossima === undefined) return
    const esito = await deps.consegna(p, prossima)
    if (esito === undefined) return
    const consegnata: VoceCoda = {
      ...prossima, stato: 'consegnata', consegnataIl: iso(), aNome: deps.pcNome(),
      ...(esito.sessione !== undefined ? { aSessione: esito.sessione } : {})
    }
    await scriviCoda(s, p.id, { voci: coda.voci.map((v) => (v.id === prossima.id ? consegnata : v)) })
    log(`[progetti] «${p.nome}»: comando consegnato dalla coda${esito.sessione !== undefined ? ` a ${esito.sessione}` : ''} (da ${prossima.daNome})`)
  }

  const iso = (): string => new Date(adesso()).toISOString()
  const mia = (): Presenza => ({ pcId: deps.pcId(), pcNome: deps.pcNome(), da: iso(), battito: iso() })

  const giroDi = async (s: Scatola, p: ProgettoDrive): Promise<void> => {
    const me = deps.pcId()
    const presenza = await s.leggi<Presenza>(nomePresenza(p.id))
    const staffetta = await s.leggi<Staffetta>(nomeStaffetta(p.id))
    const vive = deps.vive(p)
    const ora = adesso()
    inCoda.set(p.id, (await leggiCoda(s, p.id)).voci.filter((v) => v.stato === 'attesa').length)

    if (presenzaViva(presenza, ora) && presenza.pcId === me) {
      if (staffetta !== undefined && staffetta.daPc !== me) {
        // Qualcuno vuole il testimone: si salva, si mettono a dormire le chat
        // di questo progetto, e si lascia. Nell'ordine: prima il salvataggio,
        // o l'altro scaricherebbe uno stato vecchio.
        log(`[progetti] «${p.nome}»: ${staffetta.daNome} chiede il testimone, salvo e cedo`)
        const esito = await deps.salva()
        if (!esito.ok) {
          log(`[progetti] «${p.nome}»: salvataggio prima di cedere non riuscito (${esito.messaggio ?? '?'}), cedo lo stesso`)
        }
        deps.iberna(vive)
        await s.cancella(nomePresenza(p.id))
        await s.cancella(nomeStaffetta(p.id))
        stati.set(p.id, { id: p.id, nome: p.nome, chi: 'libero' })
        deps.avvisa({ tipo: 'ceduto', progettoId: p.id, nome: p.nome, aNome: staffetta.daNome, sessioni: vive })
        return
      }
      if (vive.length > 0) {
        if (ora - Date.parse(presenza.battito) >= BATTITO_OGNI_MS) {
          await s.scrivi(nomePresenza(p.id), { ...presenza, battito: iso() })
        }
        stati.set(p.id, { id: p.id, nome: p.nome, chi: 'io', da: presenza.da })
        await consegnaDallaCoda(s, p)
        return
      }
      if (ora - Date.parse(presenza.battito) >= RILASCIO_DOPO_MS) {
        await s.cancella(nomePresenza(p.id))
        stati.set(p.id, { id: p.id, nome: p.nome, chi: 'libero' })
        log(`[progetti] «${p.nome}»: nessuna chat viva da un po', lascio la presenza`)
        return
      }
      stati.set(p.id, { id: p.id, nome: p.nome, chi: 'io', da: presenza.da })
      return
    }

    if (presenzaViva(presenza, ora)) {
      stati.set(p.id, {
        id: p.id, nome: p.nome, chi: 'altro', pcNome: presenza.pcNome, da: presenza.da,
        ...(staffetta !== undefined ? { staffettaDa: staffetta.daNome } : {})
      })
      if (vive.length > 0 && !avvisati.has(p.id)) {
        avvisati.add(p.id)
        deps.avvisa({ tipo: 'occupato', progettoId: p.id, nome: p.nome, pcNome: presenza.pcNome, da: presenza.da })
      }
      return
    }

    // Libera, o scaduta. Con una chat viva, e' mia.
    if (vive.length > 0) {
      await s.scrivi(nomePresenza(p.id), mia())
      stati.set(p.id, { id: p.id, nome: p.nome, chi: 'io', da: iso() })
      avvisati.delete(p.id)
      log(`[progetti] «${p.nome}»: presenza presa`)
      await consegnaDallaCoda(s, p)
      return
    }
    stati.set(p.id, { id: p.id, nome: p.nome, chi: 'libero' })
  }

  const statoDiCwd = (cwd: string): StatoProgetto | undefined => {
    const p = deps.progettoDi(cwd)
    return p === undefined ? undefined : stati.get(p.id)
  }

  return {
    async giro() {
      if (inGiro) return
      const s = deps.scatola()
      if (s === undefined) return
      inGiro = true
      try {
        const progetti = deps.registro.leggi().progetti
        for (const id of [...stati.keys()]) {
          if (!progetti.some((p) => p.id === id)) stati.delete(id)
        }
        for (const p of progetti) {
          try {
            await giroDi(s, p)
          } catch (err) {
            log(`[progetti] giro su «${p.nome}» fallito: ${String(err)}`)
          }
        }
      } finally {
        inGiro = false
      }
    },

    stati: () => [...stati.values()].map((x) => ({ ...x, inCoda: inCoda.get(x.id) ?? 0 })),
    statoDi: (id) => {
      const x = stati.get(id)
      return x === undefined ? undefined : { ...x, inCoda: inCoda.get(id) ?? 0 }
    },
    statoDiCwd,

    primaDiAprire(cwd) {
      const p = deps.progettoDi(cwd)
      if (p === undefined) return
      const s = stati.get(p.id)
      if (s === undefined || s.chi !== 'altro' || avvisati.has(p.id)) return
      avvisati.add(p.id)
      deps.avvisa({ tipo: 'occupato', progettoId: p.id, nome: p.nome, pcNome: s.pcNome ?? '?', da: s.da ?? '' })
    },

    async prendiTestimone(id, forza = false) {
      const s = deps.scatola()
      if (s === undefined) return { ok: false, messaggio: 'Sblocca la cassaforte e collega il Drive.' }
      const p = deps.registro.leggi().progetti.find((x) => x.id === id)
      if (p === undefined) return { ok: false, messaggio: 'Progetto sconosciuto.' }
      const me = deps.pcId()
      let presenza = await s.leggi<Presenza>(nomePresenza(id))
      if (presenzaViva(presenza, adesso()) && presenza.pcId !== me && !forza) {
        log(`[progetti] «${p.nome}»: chiedo il testimone a ${presenza.pcNome}`)
        await s.scrivi(nomeStaffetta(id), { daPc: me, daNome: deps.pcNome(), quando: iso() } satisfies Staffetta)
        const scade = adesso() + ATTESA_TESTIMONE_MS
        while (adesso() < scade) {
          await aspetta(CONTROLLO_TESTIMONE_MS)
          presenza = await s.leggi<Presenza>(nomePresenza(id))
          if (!presenzaViva(presenza, adesso()) || presenza.pcId === me) break
        }
        if (presenzaViva(presenza, adesso()) && presenza.pcId !== me) {
          log(`[progetti] «${p.nome}»: ${presenza.pcNome} non risponde`)
          return { ok: false, nonRisponde: true, pcNome: presenza.pcNome }
        }
      }
      const r = await deps.ripristinaProgetto(id)
      if (!r.ok) return { ok: false, messaggio: r.messaggio ?? 'ripristino non riuscito' }
      await s.scrivi(nomePresenza(id), mia())
      await s.cancella(nomeStaffetta(id))
      avvisati.delete(id)
      stati.set(id, { id, nome: p.nome, chi: 'io', da: iso() })
      log(`[progetti] «${p.nome}»: testimone preso${forza ? ' (forzato)' : ''}${r.conflitti !== undefined ? `, ${r.conflitti} conflitti` : ''}`)
      return { ok: true, ...(r.conflitti !== undefined ? { conflitti: r.conflitti } : {}) }
    },

    inManoAdAltri() {
      const fuori = new Set<string>()
      for (const s of stati.values()) if (s.chi === 'altro') fuori.add(s.id)
      return fuori
    },

    async coda(id) {
      const s = deps.scatola()
      return s === undefined ? undefined : leggiCoda(s, id)
    },
    aggiungiInCoda(id, testo, sessione) {
      const pulito = testo.trim()
      if (pulito === '') return Promise.resolve(undefined)
      return conCoda(id, (c) => ({
        voci: [...c.voci, {
          id: nuovoId(), testo: pulito, creataIl: iso(), daNome: deps.pcNome(), stato: 'attesa',
          ...(sessione !== undefined && sessione !== '' ? { sessione } : {})
        }]
      }))
    },
    modificaInCoda(id, voceId, testo, sessione) {
      const pulito = testo.trim()
      return conCoda(id, (c) => ({
        voci: c.voci.map((v) => (v.id === voceId && v.stato === 'attesa'
          ? { ...v, testo: pulito === '' ? v.testo : pulito, ...(sessione !== undefined ? (sessione === '' ? { sessione: undefined } : { sessione }) : {}) }
          : v))
      }))
    },
    togliDallaCoda(id, voceId) {
      return conCoda(id, (c) => ({ voci: c.voci.filter((v) => v.id !== voceId) }))
    },
    pulisciCoda(id) {
      return conCoda(id, (c) => ({ voci: c.voci.filter((v) => v.stato !== 'consegnata') }))
    }
  }
}
