import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, copyFileSync, unlinkSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import {
  casaDa, caseVuote, decidiCasa, fuoriCasa, leggiCase, perCasa, pianoAnnulla, pianoRiordino, unisciCase,
  type CasaChat, type CaseChat, type ChatQui, type Decisione, type FuoriCasa, type IndiziChat, type RegistroRiordino, type Spostamento
} from '@shared/una-casa'
import type { BattitoPc } from '@shared/posta'
import type { Scatola } from './progetti/presenza'

/**
 * «Una chat, una casa» (0.42.0): le case memorizzate, il riordino e il suo
 * annullamento, sul disco di questo PC. Le regole stanno in
 * `src/shared/una-casa.ts`; il progetto nel quaderno
 * (`2026-10-02-una-chat-una-casa-progetto.md`).
 *
 * Mai una chat cancellata: il riordino **sposta** le copie fuori casa nella
 * cartella di recupero (`recupero-riordino/<id>/<slug>/<file>`), con un
 * registro per tornare indietro.
 */

export const OGGETTO_CASE = 'case-chat'
const FILE_CASE = 'case-chat.json'

export type ChatLocale = { sessione: string; slug: string; titolo: string; cwd?: string; jsonl: string; ultimoMessaggio?: string }

export type UnaCasa = {
  case: () => CaseChat
  casaDi: (sessione: string) => CasaChat | undefined
  /** Le case di qui e quelle sul Drive, unite (e riscritte dove manca qualcosa). */
  sincronizza: () => Promise<void>
  memorizza: (nuove: Record<string, CasaChat>) => Promise<void>
  /** Le chat di qui che hanno casa altrove, con la casa proposta e il motivo (per «Riordina le chat»). */
  proposte: () => Promise<{ gruppi: { pc: string; nome: string; chat: FuoriCasa[] }[]; quante: number; aperte: number; qui: number }>
  /** Le case di tutte le chat di qui, decise con la regola (per la migrazione). */
  decidiTutte: () => Promise<Record<string, CasaChat>>
  /** Le chat nuove (senza casa e mai sul Drive): casa qui, per nascita. */
  nascite: (sulDrive: (sessione: string) => boolean) => Promise<number>
  riordina: (sessioni: string[], opz?: { tipo?: 'riordino' | 'sposta' | 'ospite'; verso?: { pc: string; nome: string; cwd?: string }; casaNuova?: (s: string) => CasaChat }) => Promise<RegistroRiordino>
  riordini: () => RegistroRiordino[]
  annulla: (id: string) => Promise<{ ok: boolean; rimessi: number; restano: { sessione: string; perche: string; dove: string }[]; messaggio?: string }>
}

export function creaUnaCasa(deps: {
  dati: string
  radiceProgetti: string
  io: () => { id: string; nome: string }
  scatola: () => Scatola | undefined
  battiti: () => BattitoPc[]
  chatLocali: () => ChatLocale[]
  /** Le chat aperte qui adesso (riquadri), con la sessione e la cartella. */
  aperte: () => { sessione?: string; cwd: string }[]
  /** La copia sul Drive di una conversazione, dall'ultimo manifesto noto. */
  sulDrive: (sessione: string) => { size: number; pc?: string } | undefined
  adesso?: () => string
  log?: (m: string) => void
}): UnaCasa {
  const adesso = deps.adesso ?? ((): string => new Date().toISOString())
  const log = deps.log ?? ((): void => {})
  const fileCase = join(deps.dati, FILE_CASE)
  const cartellaRiordini = join(deps.dati, 'riordini')
  const recupero = join(deps.dati, 'recupero-riordino')
  let cache: CaseChat | undefined

  const leggiLocali = (): CaseChat => {
    if (cache !== undefined) return cache
    try { cache = leggiCase(JSON.parse(readFileSync(fileCase, 'utf8'))) } catch { cache = caseVuote() }
    return cache
  }
  const scriviLocali = (c: CaseChat): void => {
    cache = c
    try { mkdirSync(deps.dati, { recursive: true }); scriviJsonAtomico(fileCase, c, 'case-chat') } catch (err) { log(`[casa] case non salvate su disco: ${String(err)}`) }
  }
  const memorizza = async (nuove: Record<string, CasaChat>): Promise<void> => {
    const unite = unisciCase(leggiLocali(), { versione: 1, case: nuove })
    scriviLocali(unite)
    const s = deps.scatola()
    if (s === undefined) return
    try {
      const sulDrive = leggiCase(await s.leggi<unknown>(OGGETTO_CASE))
      const tutte = unisciCase(sulDrive, unite)
      await s.scrivi(OGGETTO_CASE, tutte)
      scriviLocali(unisciCase(unite, tutte))
    } catch (err) { log(`[casa] case non scritte sul Drive (riprovo al prossimo giro): ${String(err)}`) }
  }

  const indizi = (c: ChatLocale, apertaQui: boolean): IndiziChat => {
    let size = 0
    try { size = statSync(c.jsonl).size } catch { size = 0 }
    const altri = deps.battiti().filter((b) => b.pcId !== deps.io().id).map((b) => ({
      pcId: b.pcId,
      nome: b.nome,
      haCartella: c.cwd !== undefined && (b.cartelle.some((x) => uguale(x, c.cwd as string) || dentro(c.cwd as string, x)) || b.chat.some((x) => uguale(x.cwd, c.cwd as string))),
      aperta: b.chat.some((x) => x.sessione === c.sessione)
    }))
    const d = deps.sulDrive(c.sessione)
    return {
      sessione: c.sessione,
      ...(c.cwd !== undefined ? { cwd: c.cwd } : {}),
      qui: { size, ...(c.ultimoMessaggio !== undefined ? { ultimoMessaggio: c.ultimoMessaggio } : {}) },
      cartellaQui: c.cwd !== undefined && esisteCartella(c.cwd),
      apertaQui,
      altri,
      ...(d !== undefined ? { drive: d } : {})
    }
  }
  const sessioniAperte = (): Set<string> => new Set(deps.aperte().map((a) => a.sessione).filter((s): s is string => s !== undefined))

  const decidiQui = (c: ChatLocale, aperte: Set<string>): Decisione => decidiCasa(indizi(c, aperte.has(c.sessione)), deps.io(), leggiLocali().case[c.sessione])

  /** I file di una conversazione dentro la cartella dei progetti: il `.jsonl` e la cartella dei sotto-agenti. */
  const fileDi = (c: ChatLocale): { sessione: string; relativo: string }[] => {
    const fuori: { sessione: string; relativo: string }[] = []
    const rel = relative(deps.radiceProgetti, c.jsonl).replace(/\\/g, '/')
    if (!rel.startsWith('..') && existsSync(c.jsonl)) fuori.push({ sessione: c.sessione, relativo: rel })
    const cartella = c.jsonl.replace(/\.jsonl$/, '')
    if (existsSync(cartella)) {
      for (const f of elencaFile(cartella)) {
        const r = relative(deps.radiceProgetti, f).replace(/\\/g, '/')
        if (!r.startsWith('..')) fuori.push({ sessione: c.sessione, relativo: r })
      }
    }
    return fuori
  }

  const leggiRegistri = (): RegistroRiordino[] => {
    if (!existsSync(cartellaRiordini)) return []
    const fuori: RegistroRiordino[] = []
    for (const n of readdirSync(cartellaRiordini)) {
      if (!n.endsWith('.json')) continue
      try { fuori.push(JSON.parse(readFileSync(join(cartellaRiordini, n), 'utf8')) as RegistroRiordino) } catch { /* illeggibile: resta li' */ }
    }
    return fuori.sort((a, b) => b.quando.localeCompare(a.quando))
  }

  /** Sposta un file senza mai cancellare l'originale prima che la copia sia intera. */
  const muovi = (s: Spostamento): boolean => {
    try {
      mkdirSync(dirname(s.a), { recursive: true })
      if (existsSync(s.a)) return false
      try { renameSync(s.da, s.a) } catch {
        // Su dischi diversi rename non va: copia, controlla, poi togli l'originale.
        copyFileSync(s.da, s.a)
        if (statSync(s.a).size !== statSync(s.da).size) { unlinkSync(s.a); return false }
        unlinkSync(s.da)
      }
      return true
    } catch (err) {
      log(`[casa] non sono riuscito a spostare ${s.da}: ${String(err)}`)
      return false
    }
  }

  return {
    case: leggiLocali,
    casaDi: (s) => leggiLocali().case[s],
    async sincronizza() {
      const s = deps.scatola()
      if (s === undefined) return
      try {
        const sulDrive = leggiCase(await s.leggi<unknown>(OGGETTO_CASE))
        const locali = leggiLocali()
        const unite = unisciCase(sulDrive, locali)
        if (JSON.stringify(unite) !== JSON.stringify(locali)) scriviLocali(unite)
        if (JSON.stringify(unite) !== JSON.stringify(sulDrive)) await s.scrivi(OGGETTO_CASE, unite)
      } catch (err) { log(`[casa] case non sincronizzate (riprovo): ${String(err)}`) }
    },
    memorizza,
    async proposte() {
      const aperte = sessioniAperte()
      const chat = deps.chatLocali()
      const qui: ChatQui[] = chat.map((c) => {
        let byte = 0
        try { byte = statSync(c.jsonl).size } catch { byte = 0 }
        return { sessione: c.sessione, slug: c.slug, titolo: c.titolo, ...(c.cwd !== undefined ? { cwd: c.cwd } : {}), byte, aperta: aperte.has(c.sessione) }
      })
      const perSessione = new Map(chat.map((c) => [c.sessione, c]))
      const fuori = fuoriCasa(qui, (c) => decidiQui(perSessione.get(c.sessione) as ChatLocale, aperte), deps.io().id)
      return { gruppi: perCasa(fuori), quante: fuori.length, aperte: fuori.filter((c) => c.aperta).length, qui: qui.length }
    },
    async decidiTutte() {
      const aperte = sessioniAperte()
      const fuori: Record<string, CasaChat> = {}
      const quando = adesso()
      for (const c of deps.chatLocali()) {
        if (leggiLocali().case[c.sessione] !== undefined) continue
        const d = decidiQui(c, aperte)
        fuori[c.sessione] = casaDa(d, d.regola === 'nascita' ? 'nascita' : 'regola', quando)
      }
      return fuori
    },
    async nascite(sulDrive) {
      const nuove: Record<string, CasaChat> = {}
      const io = deps.io()
      for (const c of deps.chatLocali()) {
        if (leggiLocali().case[c.sessione] !== undefined || sulDrive(c.sessione)) continue
        nuove[c.sessione] = { pc: io.id, pcNome: io.nome, motivo: `è nata su ${io.nome}`, decisaIl: adesso(), da: 'nascita' }
      }
      if (Object.keys(nuove).length > 0) await memorizza(nuove)
      return Object.keys(nuove).length
    },
    async riordina(sessioni, opz = {}) {
      const id = `${opz.tipo ?? 'riordino'}-${adesso().replace(/[:.]/g, '-')}`
      const chat = deps.chatLocali().filter((c) => sessioni.includes(c.sessione))
      const aperte = sessioniAperte()
      const spostabili = chat.filter((c) => !aperte.has(c.sessione))
      const piano = pianoRiordino({ id, radiceProgetti: deps.radiceProgetti, recupero, file: spostabili.flatMap(fileDi) })
      const casePrima: Record<string, CasaChat | null> = {}
      for (const c of spostabili) casePrima[c.sessione] = leggiLocali().case[c.sessione] ?? null
      const fatti = piano.filter((s) => muovi(s))
      const registro: RegistroRiordino = {
        id, tipo: opz.tipo ?? 'riordino', quando: adesso(), ...(opz.verso !== undefined ? { verso: opz.verso } : {}),
        spostamenti: fatti, casePrima
      }
      mkdirSync(cartellaRiordini, { recursive: true })
      scriviJsonAtomico(join(cartellaRiordini, `${id}.json`), registro, 'riordino')
      // Le case confermate: quelle proposte (riordino) o quella nuova (sposta).
      const nuove: Record<string, CasaChat> = {}
      for (const c of spostabili) {
        if (opz.casaNuova !== undefined) { nuove[c.sessione] = opz.casaNuova(c.sessione); continue }
        const d = decidiQui(c, aperte)
        nuove[c.sessione] = casaDa(d, 'nicholas', adesso())
      }
      await memorizza(nuove)
      log(`[casa] ${registro.tipo} ${id}: ${fatti.length} file di ${spostabili.length} chat nella cartella di recupero${chat.length > spostabili.length ? ` (${chat.length - spostabili.length} aperte, lasciate)` : ''}`)
      return registro
    },
    riordini: leggiRegistri,
    async annulla(id) {
      const r = leggiRegistri().find((x) => x.id === id)
      if (r === undefined) return { ok: false, rimessi: 0, restano: [], messaggio: 'Riordino non trovato.' }
      if (r.annullatoIl !== undefined) return { ok: false, rimessi: 0, restano: [], messaggio: 'Questo riordino è già stato annullato.' }
      const p = pianoAnnulla(r, (x) => existsSync(x))
      const rimessi = p.rimetti.filter((s) => muovi(s))
      // Le case di prima tornano, con la forza di una scelta di Nicholas
      // (sono una scelta: annullare).
      const nuove: Record<string, CasaChat> = {}
      // Una scelta dopo quella che annulla, anche nello stesso millisecondo:
      // fra due scelte vince la più recente (0.52.0).
      const dopoDi = (s: string): string => {
        const prima = leggiLocali().case[s]?.decisaIl
        const ora = adesso()
        return prima !== undefined && ora <= prima ? new Date(Date.parse(prima) + 1).toISOString() : ora
      }
      for (const [s, c] of Object.entries(r.casePrima)) {
        // Annullare uno spostamento riporta la casa qui: il registro e' nato
        // dopo il cambio di casa, e la casa «di prima» li' e' gia' quella nuova.
        if (r.tipo === 'sposta' || r.tipo === 'ospite') { nuove[s] = { pc: deps.io().id, pcNome: deps.io().nome, motivo: `annullato ${r.tipo === 'ospite' ? 'il cambio di ospite' : 'lo spostamento'} verso ${r.verso?.nome ?? 'l’altro PC'}: torna su questo PC`, decisaIl: dopoDi(s), da: 'nicholas', sceltaDa: deps.io().id }; continue }
        if (c !== null) nuove[s] = { ...c, decisaIl: dopoDi(s), da: 'nicholas', motivo: `riportata com'era: ${c.motivo}` }
        else nuove[s] = { pc: deps.io().id, pcNome: deps.io().nome, motivo: 'annullato il riordino: torna su questo PC', decisaIl: dopoDi(s), da: 'nicholas' }
      }
      await memorizza(nuove)
      scriviJsonAtomico(join(cartellaRiordini, `${id}.json`), { ...r, annullatoIl: adesso() }, 'riordino')
      log(`[casa] annullato ${id}: ${rimessi.length} file rimessi al loro posto${p.restano.length > 0 ? `, ${p.restano.length} lasciati nel recupero` : ''}`)
      return { ok: true, rimessi: rimessi.length, restano: p.restano }
    }
  }
}

function uguale(a: string, b: string): boolean {
  const n = (x: string): string => x.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
  return n(a) === n(b)
}
function dentro(cwd: string, radice: string): boolean {
  const n = (x: string): string => x.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
  return n(cwd).startsWith(`${n(radice)}\\`)
}
function esisteCartella(p: string): boolean {
  try { return statSync(p).isDirectory() } catch { return false }
}
function elencaFile(cartella: string): string[] {
  const fuori: string[] = []
  const giro = (d: string): void => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      try { if (statSync(p).isDirectory()) giro(p); else fuori.push(p) } catch { /* sparito */ }
    }
  }
  try { giro(cartella) } catch { /* niente */ }
  return fuori
}
