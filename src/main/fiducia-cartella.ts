import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, posix, win32 } from 'node:path'
import { scriviAtomico } from '@shared/scrittura-atomica'
import { scelteDiTerminale, tastiPerRisposta } from '@shared/scelte-terminale'

/**
 * La domanda di fiducia di Claude Code (30/10).
 *
 * Una chat che parte in una cartella mai vista si ferma su «Do you trust the
 * files in this folder? ❯ 1. Yes, I trust this folder / 2. No, exit». Per un
 * autopilota che apre una chat in un worktree nuovo vuol dire restare fermo
 * finché Nicholas non torna al PC. Due strati:
 *
 * 1. **Prima dello spawn** (`fidatiPrimaDiAvviare`): la cartella si segna come
 *    fidata in `~/.claude.json` (`projects[<cartella>].hasTrustDialogAccepted`),
 *    con la stessa chiave che usa Claude Code: barre in avanti, la lettera del
 *    disco come è già scritta.
 * 2. **Nel terminale** (`creaFiduciaNelTerminale`): se la domanda compare lo
 *    stesso, si sceglie «Yes, I trust this folder» con frecce e Invio, una
 *    volta per chat, e si scrive una riga nel registro.
 *
 * Tutti e due **solo** per cartelle che SierraDeck conosce (`cartellaQualificata`):
 * quelle dei progetti e dei workspace, e i worktree `<repo>.sierradeck-wt/<nome>`
 * di un repository così. Mai la cartella di casa, la radice di un disco, una
 * cartella che contiene la casa, o una qualunque altra.
 *
 * `~/.claude.json` lo riscrivono di continuo i Claude Code accesi: si legge,
 * si cambia quella chiave sola, si scrive atomico (temporaneo + rinomina, con
 * le riprove di Windows). Un file che non si legge si lascia stare; un file che
 * non c'è non si crea.
 */

/** Le cartelle che SierraDeck conosce, da cui si decide. */
export type CartelleNote = {
  /** La cartella di casa: lei e le sue antenate non sono mai fidate. */
  casa: string
  /** Radici dei progetti: vale la radice e ogni sua sottocartella. */
  progetti: readonly string[]
  /** Cartelle aperte (le chat dei workspace, gli autopiloti): vale la cartella esatta. */
  cartelle: readonly string[]
}

const eWindows = (piattaforma: NodeJS.Platform): boolean => piattaforma === 'win32'

/** Il percorso assoluto, senza barra in fondo, con le barre del sistema. */
function assoluto(p: string, piattaforma: NodeJS.Platform): string {
  if (eWindows(piattaforma)) {
    const r = win32.resolve(p.replace(/\//g, '\\'))
    return /^[A-Za-z]:\\$/.test(r) ? r : r.replace(/\\+$/, '')
  }
  const r = posix.resolve(p)
  return r === '/' ? r : r.replace(/\/+$/, '')
}

/** Per confrontare: su Windows maiuscole e barre non contano. */
function confrontabile(p: string, piattaforma: NodeJS.Platform): string {
  const a = assoluto(p, piattaforma)
  return eWindows(piattaforma) ? a.replace(/\\/g, '/').toLowerCase() : a
}

function dentroOUguale(figlio: string, padre: string): boolean {
  if (figlio === padre) return true
  const conBarra = padre.endsWith('/') ? padre : `${padre}/`
  return figlio.startsWith(conBarra)
}

/**
 * La chiave di `projects` in `~/.claude.json` per una cartella, come la scrive
 * Claude Code: su Windows barre in avanti e la lettera del disco maiuscola
 * (quella di `process.cwd()`); altrove il percorso così com'è.
 */
export function chiaveProgetto(cwd: string, piattaforma: NodeJS.Platform = process.platform): string {
  const a = assoluto(cwd, piattaforma)
  if (!eWindows(piattaforma)) return a
  return a.replace(/\\/g, '/').replace(/^([a-z]):/, (_m, d: string) => `${d.toUpperCase()}:`)
}

/**
 * Una cartella che non si dichiara mai fidata: la radice di un disco (o di una
 * condivisione di rete), la radice `/`, la cartella di casa e ogni cartella
 * che la contiene. Fidarsi di lì vorrebbe dire fidarsi di tutto quello che
 * c'è sotto.
 */
export function cartellaPericolosa(cwd: string, casa: string, piattaforma: NodeJS.Platform = process.platform): boolean {
  if (cwd.trim() === '') return true
  // Un percorso relativo (anche `E:` senza barra) dipende dalla cartella del
  // processo: non è una cartella che SierraDeck abbia aperto.
  if (!(eWindows(piattaforma) ? win32.isAbsolute(cwd.replace(/\//g, '\\')) : posix.isAbsolute(cwd))) return true
  const a = assoluto(cwd, piattaforma)
  if (eWindows(piattaforma)) {
    if (/^[A-Za-z]:\\?$/.test(a)) return true
    // \\server\condivisione, senza altro sotto.
    if (/^\\\\[^\\]+(\\[^\\]+)?\\?$/.test(a)) return true
  } else if (a === '/') return true
  const c = confrontabile(a, piattaforma)
  const h = confrontabile(casa, piattaforma)
  return dentroOUguale(h, c)
}

/** `<repo>.sierradeck-wt/<nome>[/<resto>]` → il repository e il resto, se lo è. */
export function repoDelWorktree(cwd: string, piattaforma: NodeJS.Platform = process.platform): { repo: string; resto: string } | undefined {
  const a = assoluto(cwd, piattaforma).replace(/\\/g, '/')
  const m = /^(.+)\.sierradeck-wt\/[^/]+(?:\/(.*))?$/i.exec(a)
  if (m === null || m[1] === undefined) return undefined
  const repo = eWindows(piattaforma) ? m[1].replace(/\//g, '\\') : m[1]
  const resto = m[2] ?? ''
  return { repo, resto: eWindows(piattaforma) ? resto.replace(/\//g, '\\') : resto }
}

function notaDiretta(cwd: string, note: CartelleNote, piattaforma: NodeJS.Platform): boolean {
  if (cartellaPericolosa(cwd, note.casa, piattaforma)) return false
  const c = confrontabile(cwd, piattaforma)
  if (note.cartelle.some((x) => x.trim() !== '' && confrontabile(x, piattaforma) === c)) return true
  return note.progetti.some((r) => r.trim() !== '' && !cartellaPericolosa(r, note.casa, piattaforma) && dentroOUguale(c, confrontabile(r, piattaforma)))
}

/**
 * La regola sola: la cartella è di un progetto o di un workspace di
 * SierraDeck, oppure è un worktree di SierraDeck il cui repository lo è (o
 * contiene una cartella che lo è: un autopilota in una sottocartella).
 */
export function cartellaQualificata(cwd: string, note: CartelleNote, piattaforma: NodeJS.Platform = process.platform): boolean {
  if (cartellaPericolosa(cwd, note.casa, piattaforma)) return false
  if (notaDiretta(cwd, note, piattaforma)) return true
  const wt = repoDelWorktree(cwd, piattaforma)
  if (wt === undefined || cartellaPericolosa(wt.repo, note.casa, piattaforma)) return false
  const sep = eWindows(piattaforma) ? '\\' : '/'
  if (notaDiretta(wt.repo, note, piattaforma)) return true
  if (wt.resto !== '' && notaDiretta(`${wt.repo}${sep}${wt.resto}`, note, piattaforma)) return true
  // Il repository contiene una cartella aperta (l'autopilota lavora in una sua sottocartella).
  const r = confrontabile(wt.repo, piattaforma)
  return note.cartelle.some((x) => x.trim() !== '' && repoDelWorktree(x, piattaforma) === undefined && dentroOUguale(confrontabile(x, piattaforma), r))
}

/** Quello che un progetto nuovo ha in `~/.claude.json`: Claude Code legge questi campi senza controllarli. */
const PROGETTO_NUOVO = {
  allowedTools: [] as string[],
  mcpContextUris: [] as string[],
  mcpServers: {},
  enabledMcpjsonServers: [] as string[],
  disabledMcpjsonServers: [] as string[],
  hasTrustDialogAccepted: true,
  projectOnboardingSeenCount: 0,
  hasClaudeMdExternalIncludesApproved: false,
  hasClaudeMdExternalIncludesWarningShown: false
}

export type EsitoFiducia = 'scritta' | 'gia' | 'senza-file' | 'illeggibile' | 'non-scritta'

/**
 * Segna la cartella come fidata in `~/.claude.json`. Non solleva mai.
 *
 * Si cambia solo `projects[<chiave>].hasTrustDialogAccepted`: tutto il resto
 * torna com'era stato letto. Se c'è già una chiave per la stessa cartella con
 * maiuscole diverse (Windows), si usa quella. Se è già fidata non si scrive
 * niente: ogni scrittura è una corsa con i Claude Code accesi.
 */
export function segnaFidata(
  fileClaudeJson: string,
  cwd: string,
  opz: { piattaforma?: NodeJS.Platform; scrivi?: (percorso: string, contenuto: string) => boolean } = {}
): EsitoFiducia {
  const piattaforma = opz.piattaforma ?? process.platform
  if (!existsSync(fileClaudeJson)) return 'senza-file'
  let testo: string
  let dati: unknown
  try {
    testo = readFileSync(fileClaudeJson, 'utf8')
    dati = JSON.parse(testo)
  } catch {
    return 'illeggibile'
  }
  if (typeof dati !== 'object' || dati === null || Array.isArray(dati)) return 'illeggibile'
  const radice = dati as Record<string, unknown>
  const progetti = radice.projects
  if (progetti !== undefined && (typeof progetti !== 'object' || progetti === null || Array.isArray(progetti))) return 'illeggibile'
  const elenco = (progetti ?? {}) as Record<string, unknown>
  const voluta = chiaveProgetto(cwd, piattaforma)
  const uguale = (k: string): boolean => (eWindows(piattaforma) ? !k.includes('\\') && k.toLowerCase() === voluta.toLowerCase() : k === voluta)
  const trovate = Object.keys(elenco).filter(uguale)
  const chiavi = trovate.length > 0 ? trovate : [voluta]
  const daCambiare = chiavi.filter((k) => {
    const v = elenco[k]
    return !(typeof v === 'object' && v !== null && (v as Record<string, unknown>).hasTrustDialogAccepted === true)
  })
  if (daCambiare.length === 0) return 'gia'
  for (const k of daCambiare) {
    const v = elenco[k]
    elenco[k] = typeof v === 'object' && v !== null && !Array.isArray(v)
      ? { ...(v as Record<string, unknown>), hasTrustDialogAccepted: true }
      : { ...PROGETTO_NUOVO }
  }
  if (progetti === undefined) radice.projects = elenco
  const finale = /\r?\n$/.exec(testo)?.[0] ?? ''
  const contenuto = JSON.stringify(radice, null, 2) + finale
  const scrivi = opz.scrivi ?? ((p: string, c: string) => scriviAtomico(p, c, 'fiducia-cartella'))
  return scrivi(fileClaudeJson, contenuto) ? 'scritta' : 'non-scritta'
}

/**
 * Il primo strato, da chiamare un attimo prima dello spawn di `claude`.
 * Restituisce cosa è successo (o perché niente), per il registro.
 */
export function fidatiPrimaDiAvviare(p: {
  cwd: string
  attiva: boolean
  note: () => CartelleNote
  fileClaudeJson: string
  piattaforma?: NodeJS.Platform
  log?: (riga: string) => void
}): EsitoFiducia | 'spenta' | 'fuori' {
  if (!p.attiva) return 'spenta'
  const piattaforma = p.piattaforma ?? process.platform
  let note: CartelleNote
  try { note = p.note() } catch { return 'fuori' }
  if (!cartellaQualificata(p.cwd, note, piattaforma)) return 'fuori'
  const esito = segnaFidata(p.fileClaudeJson, p.cwd, { piattaforma })
  if (esito === 'scritta') p.log?.(`[fiducia] ${chiaveProgetto(p.cwd, piattaforma)}: segnata come fidata in .claude.json prima di avviare la chat`)
  else if (esito === 'illeggibile') p.log?.(`[fiducia] ${p.fileClaudeJson} non si legge come JSON: lasciato com'è, la chat potrebbe chiedere la fiducia`)
  else if (esito === 'non-scritta') p.log?.(`[fiducia] ${p.fileClaudeJson} non scritto: la chat potrebbe chiedere la fiducia`)
  return esito
}

/** L'opzione che dice sì, nella domanda di fiducia. */
const SI_FIDATI = /^(?:\d+\.\s*)?yes,?\s+i\s+trust\s+this\s+folder\b/i
const DOMANDA_FIDUCIA = /trust\s+this\s+folder|trust\s+the\s+files\s+in\s+this\s+folder/i

/** Per quanto una domanda di fiducia appena risposta resta fuori dalle Domande. */
export const NASCOSTA_PER_MS = 15_000

/** Una chat come la vede lo strato del terminale. */
export type ChatVista = { id: string; cwd: string; sessione?: string; titolo?: string; coda?: string[]; codaGrezza?: string[] }

/** Le righe di fondo dello schermo, se mostrano la domanda di fiducia con il sì fra le opzioni. */
export function tastiPerFidarsi(righe: readonly string[]): string[] | undefined {
  const testo = righe.join('\n')
  if (!DOMANDA_FIDUCIA.test(testo)) return undefined
  const s = scelteDiTerminale(testo)
  if (s === undefined) return undefined
  const si = s.opzioni.find((o) => SI_FIDATI.test(o.testo.trim()))
  if (si === undefined) return undefined
  const k = tastiPerRisposta(s, { tipo: 'opzione', testo: si.testo })
  return 'errore' in k ? undefined : k.pezzi
}

/**
 * Il secondo strato: guarda le chat aperte e, dove c'è la domanda di fiducia
 * in una cartella che si qualifica, preme «Yes, I trust this folder». Una
 * volta per chat (chiave: la sessione, o l'id del riquadro). Una cartella che
 * non si qualifica resta a Nicholas, e il registro lo dice una volta.
 *
 * `guarda` restituisce gli id delle chat che ha appena risposto (o a cui sta
 * per rispondere): chi la chiama le toglie dalle Domande.
 */
export function creaFiduciaNelTerminale(deps: {
  attiva: () => boolean
  qualificata: (cwd: string) => boolean
  tasti: (chat: string, pezzi: string[]) => void
  log: (riga: string) => void
  adesso?: () => number
}): { guarda: (chat: readonly ChatVista[]) => Set<string> } {
  const adesso = deps.adesso ?? (() => Date.now())
  /** Quando si è risposto, per chat: si risponde una volta sola. */
  const fatte = new Map<string, number>()
  const rifiutate = new Set<string>()
  return {
    guarda: (chat) => {
      const nascoste = new Set<string>()
      if (!deps.attiva()) return nascoste
      for (const c of chat) {
        const chiave = c.sessione ?? c.id
        const righe = (c.codaGrezza ?? c.coda ?? []).slice(-30)
        if (righe.length === 0 || !righe.some((r) => DOMANDA_FIDUCIA.test(r))) continue
        const quando = fatte.get(chiave)
        if (quando !== undefined) {
          // Lo schermo non si è ancora ridisegnato: per poco resta fuori dalle
          // Domande. Se la domanda è ancora lì dopo, la risposta non è stata
          // presa: non si ripreme, torna a Nicholas.
          if (adesso() - quando < NASCOSTA_PER_MS) nascoste.add(c.id)
          continue
        }
        const pezzi = tastiPerFidarsi(righe)
        if (pezzi === undefined) continue
        let ok = false
        try { ok = deps.qualificata(c.cwd) } catch { ok = false }
        if (!ok) {
          if (!rifiutate.has(chiave)) {
            rifiutate.add(chiave)
            deps.log(`[fiducia] «${c.titolo ?? c.id}» chiede la fiducia per ${c.cwd}: cartella che SierraDeck non conosce, la scelta resta a te`)
          }
          continue
        }
        fatte.set(chiave, adesso())
        nascoste.add(c.id)
        deps.tasti(c.id, pezzi)
        deps.log(`[fiducia] «${c.titolo ?? c.id}»: «Yes, I trust this folder» scelto da solo per ${c.cwd}`)
      }
      return nascoste
    }
  }
}

/**
 * Le cartelle degli autopiloti, dai loro file (`<dati>/autopiloti/ap-*.json`):
 * un autopilota nuovo apre la prima chat in un worktree prima che il suo
 * riquadro sia mai finito in un workspace.
 */
export function cartelleAutopiloti(cartella: string): string[] {
  const fuori: string[] = []
  try {
    for (const f of readdirSync(cartella)) {
      if (!/^ap-.*\.json$/.test(f)) continue
      try {
        const j = JSON.parse(readFileSync(join(cartella, f), 'utf8')) as { cwd?: unknown }
        if (typeof j.cwd === 'string' && j.cwd !== '') fuori.push(j.cwd)
      } catch { /* un file illeggibile non ferma gli altri */ }
    }
  } catch { /* nessuna cartella: nessun autopilota */ }
  return fuori
}
