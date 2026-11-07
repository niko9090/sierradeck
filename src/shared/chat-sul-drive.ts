import { chatDi, nomiInRecupero, type FileDrive, type IndiceDrive, type Proposta, type QuotaDrive, type RegistroPulizie, type VocePulita, type VoceIndice } from './spazio-drive'

/**
 * Quali chat stanno sul Drive (0.96.0). Decisione di Nicholas: «Sul drive
 * stanno quelle che vengono usate, le altre si eliminano. Se vedi poi che ho
 * poco spazio quelle più grosse stanno solo locali.»
 *
 * Tre regole, tutte pure (niente rete, niente disco):
 *  1. sul Drive solo le chat usate negli ultimi `CHAT_SUL_DRIVE_GIORNI` giorni;
 *  2. le chat di un workspace «solo su questo PC» non ci vanno mai;
 *  3. con poco spazio, le piu' grosse diventano solo locali, dalla piu' grossa.
 *
 * **Tolta dal Drive non vuol dire cancellata.** Il file sul PC non si tocca
 * mai: una chat esce dal Drive solo se un PC ne ha una copia intera
 * (`copieSuiPc`). Se una chat tolta torna a essere usata, la regola 1 la
 * lascia salire di nuovo da sola.
 */

/** Una chat non usata da piu' di cosi' non sta sul Drive. */
export const CHAT_SUL_DRIVE_GIORNI = 30
export const CHAT_SUL_DRIVE_MS = CHAT_SUL_DRIVE_GIORNI * 86_400_000
/** Il Drive e' «con poco spazio» quando l'usato supera questa parte del limite. */
export const SOGLIA_SPAZIO_POCO = 0.9

/** Un workspace in piu' o in meno nell'elenco «solo su questo PC» (per nome, come le altre preferenze). */
export function cambiaSoloQui(lista: readonly string[], nome: string, si: boolean): string[] {
  const resto = lista.filter((n) => n !== nome)
  return si ? [...resto, nome] : resto
}

/** Poco spazio: quota sopra la soglia (e un limite noto). */
export function spazioPoco(quota: QuotaDrive | undefined, soglia = SOGLIA_SPAZIO_POCO): boolean {
  return quota?.limite !== undefined && quota.limite > 0 && quota.usato / quota.limite >= soglia
}

/** La sessione di un percorso di chat (`chat/<slug>/<uuid>.jsonl` o un suo sotto-file), in minuscolo. */
export function sessioneDelPercorso(percorso: string): string | undefined {
  return chatDi(percorso)?.sessione.toLowerCase()
}

const slugDi = (cwd: string): string => cwd.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()

/**
 * «Questo percorso e' una chat di un workspace solo-su-questo-PC?» Le chat di
 * un workspace sono quelle dei suoi riquadri (per sessione) e quelle della
 * cartella di lavoro dei riquadri, comprese le copie degli autopiloti
 * (`-sierradeck-wt…`) e dei worktree (`--claude-worktrees…`).
 */
export function chatDiWorkspaceSoloQui(p: {
  soloQui: readonly string[]
  workspace: readonly { nome: string; perSlot: Record<string, { panes: readonly { sessionUuid: string; cwd: string }[] }> }[]
}): (percorso: string) => boolean {
  const sessioni = new Set<string>()
  const cartelle = new Set<string>()
  for (const w of p.workspace) {
    if (!p.soloQui.includes(w.nome)) continue
    for (const l of Object.values(w.perSlot)) {
      for (const pane of l.panes) {
        if (pane.sessionUuid !== '') sessioni.add(pane.sessionUuid.toLowerCase())
        if (pane.cwd !== '') cartelle.add(slugDi(pane.cwd))
      }
    }
  }
  if (sessioni.size === 0 && cartelle.size === 0) return () => false
  return (percorso) => {
    const c = chatDi(percorso)
    if (c === undefined) return false
    if (sessioni.has(c.sessione.toLowerCase())) return true
    const slug = c.slug.toLowerCase()
    for (const base of cartelle) {
      if (slug === base || slug.startsWith(`${base}-sierradeck-wt`) || slug.startsWith(`${base}--claude-worktrees`)) return true
    }
    return false
  }
}

/**
 * La regola di salita, per `escludi` del salvataggio: questo percorso **non
 * sale** sul Drive. Vale per le chat ferme da piu' di `CHAT_SUL_DRIVE_GIORNI`
 * (da `mtime` del file sul PC), per quelle di un workspace solo-qui e per
 * quelle diventate solo locali per lo spazio. Un file che non e' una chat sale.
 */
export function chatNonSale(p: {
  adesso: () => number
  soloQui: (percorso: string) => boolean
  sessioniSoloLocali: () => ReadonlySet<string>
}): (percorso: string, f?: { mtime?: number }) => boolean {
  return (percorso, f) => {
    const c = chatDi(percorso)
    if (c === undefined) return false
    if (f?.mtime !== undefined && p.adesso() - f.mtime > CHAT_SUL_DRIVE_MS) return true
    if (p.soloQui(percorso)) return true
    return p.sessioniSoloLocali().has(c.sessione.toLowerCase())
  }
}

type Gruppo = { sessione: string; principale: [string, VoceIndice]; voci: VocePulita[]; byte: number }

/**
 * Le proposte automatiche di questo giro, ognuna disgiunta dalle altre: prima
 * le chat dei workspace solo-qui, poi quelle non usate, poi (se serve) le piu'
 * grosse. Una chat e' candidata solo se un PC ne ha una copia intera; quelle
 * senza copia restano sul Drive qualunque cosa dicano le regole.
 */
export function proposteChatSulDrive(p: {
  file: FileDrive[]
  indice: IndiceDrive
  copieSuiPc: Map<string, { nome: string; size: number }[]>
  pulizie?: RegistroPulizie
  adesso: number
  soloQui: (percorso: string) => boolean
  sessioniSoloLocali?: ReadonlySet<string>
  quota?: QuotaDrive
  /** Il Drive ha detto «pieno» (anche senza una quota nota). */
  pieno?: boolean
  soglia?: number
}): Proposta[] {
  const byteDi = new Map(p.file.map((f) => [f.nome, f.byte]))
  const giaFuori = nomiInRecupero(p.pulizie)
  const locali = p.sessioniSoloLocali ?? new Set<string>()
  const gruppi = new Map<string, Gruppo & { solo: boolean }>()
  const senzaPrincipale = new Map<string, VocePulita[]>()
  for (const [percorso, v] of Object.entries(p.indice)) {
    const c = chatDi(percorso)
    if (c === undefined || giaFuori.has(v.nome)) continue
    const chiave = `${c.slug}\u0000${c.sessione}`
    const voce: VocePulita = { nome: v.nome, byte: byteDi.get(v.nome) ?? v.size, percorso, voce: v }
    if (!c.principale) { senzaPrincipale.set(chiave, [...(senzaPrincipale.get(chiave) ?? []), voce]); continue }
    gruppi.set(chiave, { sessione: c.sessione, principale: [percorso, v], voci: [voce], byte: voce.byte, solo: p.soloQui(percorso) || locali.has(c.sessione.toLowerCase()) })
  }
  const candidati: (Gruppo & { solo: boolean })[] = []
  for (const [chiave, g] of gruppi) {
    // Mai togliere dal Drive l'unica copia: serve un PC con la chat intera.
    if (!(p.copieSuiPc.get(g.sessione) ?? []).some((c) => c.size >= g.principale[1].size)) continue
    for (const a of senzaPrincipale.get(chiave) ?? []) { g.voci.push(a); g.byte += a.byte }
    candidati.push(g)
  }
  const somma = (g: Gruppo[]): number => g.reduce((t, x) => t + x.byte, 0)
  const voci = (g: Gruppo[]): VocePulita[] => g.flatMap((x) => x.voci)
  const proposta = (tipo: 'chat-solo-qui' | 'chat-non-usate' | 'chat-spazio-poco', g: Gruppo[], testi: { titolo: string; breve: string; spiega: string }): Proposta => ({
    tipo, titolo: testi.titolo, breve: testi.breve, spiega: testi.spiega, voci: voci(g), byte: somma(g)
  })
  const fuori: Proposta[] = []
  const quante = (n: number): string => (n === 1 ? '1 chat' : `${n} chat`)

  const soloQui = candidati.filter((g) => g.solo)
  if (soloQui.length > 0) {
    fuori.push(proposta('chat-solo-qui', soloQui, {
      titolo: 'Chat solo su questo PC',
      breve: `${quante(soloQui.length)} di workspace «solo su questo PC», tolte dal Drive`,
      spiega: 'Le chat di un workspace segnato «solo su questo PC» non stanno sul Drive. Restano intatte sul PC; qui si toglie solo la copia sul Drive.'
    }))
  }
  const resto = candidati.filter((g) => !g.solo)
  const vecchie = resto.filter((g) => p.adesso - g.principale[1].mtime > CHAT_SUL_DRIVE_MS)
  if (vecchie.length > 0) {
    fuori.push(proposta('chat-non-usate', vecchie, {
      titolo: 'Chat non usate',
      breve: `${quante(vecchie.length)} non usate da più di ${CHAT_SUL_DRIVE_GIORNI} giorni, tolte dal Drive`,
      spiega: `Sul Drive stanno le chat usate negli ultimi ${CHAT_SUL_DRIVE_GIORNI} giorni. Le altre restano intatte sul PC e, se una torna a essere usata, risale da sola.`
    }))
  }

  // Poco spazio: le piu' grosse tra quelle che restano, dalla piu' grossa,
  // finche' l'usato torna sotto la soglia. Le tolte qui sopra liberano spazio
  // anch'esse (in questo caso si svuotano subito).
  const soglia = p.soglia ?? SOGLIA_SPAZIO_POCO
  const poco = spazioPoco(p.quota, soglia)
  if (poco || p.pieno === true) {
    const rimaste = resto.filter((g) => !vecchie.includes(g)).sort((a, b) => b.byte - a.byte)
    const limite = p.quota?.limite
    const usato = p.quota?.usato
    let liberati = somma(soloQui) + somma(vecchie)
    const scelte: Gruppo[] = []
    const quotaNota = limite !== undefined && limite > 0 && usato !== undefined
    for (const g of rimaste) {
      if (quotaNota) {
        // Sotto la soglia ci si ferma; a Drive pieno, se ancora non si e' liberato niente, almeno la piu' grossa.
        if (usato - liberati <= limite * soglia && (liberati > 0 || scelte.length > 0 || p.pieno !== true)) break
      } else if (scelte.length > 0 || liberati > 0) break
      scelte.push(g)
      liberati += g.byte
    }
    if (scelte.length > 0) {
      fuori.push(proposta('chat-spazio-poco', scelte, {
        titolo: 'Chat grosse solo locali',
        breve: `Poco spazio sul Drive: ${quante(scelte.length)} tra le più grosse restano solo su questo PC`,
        spiega: `Quando il Drive supera il ${Math.round(soglia * 100)}% dello spazio (o è pieno), le chat più grosse restano solo sul PC, cominciando dalla più grossa. Sul PC non si tocca niente; qui non risalgono più.`
      }))
    }
  }
  return fuori
}

/** Le sessioni (minuscole) delle voci di una proposta: per segnarle «solo locali». */
export function sessioniDelleVoci(voci: readonly VocePulita[]): string[] {
  return [...new Set(voci.map((v) => (v.percorso === undefined ? undefined : sessioneDelPercorso(v.percorso))).filter((s): s is string => s !== undefined))]
}
