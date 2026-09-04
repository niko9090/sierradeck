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
}

export type AvvisoProgetto =
  | { tipo: 'occupato'; progettoId: string; nome: string; pcNome: string; da: string }
  | { tipo: 'ceduto'; progettoId: string; nome: string; aNome: string; sessioni: string[] }

export type EsitoTestimone =
  | { ok: true }
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
  ripristinaProgetto: (id: string) => Promise<{ ok: boolean; messaggio?: string }>
  iberna: (sessioni: string[]) => void
  avvisa: (a: AvvisoProgetto) => void
  adesso?: () => number
  aspetta?: (ms: number) => Promise<void>
  log?: (m: string) => void
}): Ronda {
  const adesso = deps.adesso ?? ((): number => Date.now())
  const aspetta = deps.aspetta ?? ((ms: number): Promise<void> => new Promise((r) => { setTimeout(r, ms) }))
  const log = deps.log ?? ((): void => {})
  const stati = new Map<string, StatoProgetto>()
  const avvisati = new Set<string>()
  let inGiro = false

  const iso = (): string => new Date(adesso()).toISOString()
  const mia = (): Presenza => ({ pcId: deps.pcId(), pcNome: deps.pcNome(), da: iso(), battito: iso() })

  const giroDi = async (s: Scatola, p: ProgettoDrive): Promise<void> => {
    const me = deps.pcId()
    const presenza = await s.leggi<Presenza>(nomePresenza(p.id))
    const staffetta = await s.leggi<Staffetta>(nomeStaffetta(p.id))
    const vive = deps.vive(p)
    const ora = adesso()

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

    stati: () => [...stati.values()],
    statoDi: (id) => stati.get(id),
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
      log(`[progetti] «${p.nome}»: testimone preso${forza ? ' (forzato)' : ''}`)
      return { ok: true }
    },

    inManoAdAltri() {
      const fuori = new Set<string>()
      for (const s of stati.values()) if (s.chi === 'altro') fuori.add(s.id)
      return fuori
    }
  }
}
