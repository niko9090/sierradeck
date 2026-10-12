import type { CasaChat, CaseChat } from './una-casa'

/**
 * «Stesso nome = stesso progetto» (0.60.0, regola di Nicholas).
 *
 * Il registro dei progetti sul Drive ha un id per ogni volta che un PC ha
 * messo (o adottato) una cartella: lo stesso progetto è finito sotto più id —
 * «Wdeck» quattro volte, «SierraDeck» registrato solo con la cartella del
 * portatile — e il pannello li mostrava come progetti diversi. Peggio: il PC
 * residente di un doppione che qui «non c’era» lo riscaricava dal Drive in
 * una cartella nuova, accanto a quella vera (registro del 10/10, `[allinea]`).
 *
 * Qui, pure, le regole che li rimettono insieme:
 * - il nome si confronta normalizzato (maiuscole, spazi, trattini, punti,
 *   accenti e suffissi come «(2)» o «- copia» non contano);
 * - un id unito a mano (`unitoIn`, scritto da «Rendi residente») segue il suo
 *   principale anche se il nome è diverso;
 * - la casa del gruppo è la scelta più recente di Nicholas fra tutti i suoi id;
 * - una cartella appartiene al gruppo se sta dentro una sua cartella
 *   registrata, oppure se lei (o una cartella che la contiene) ha il nome
 *   del gruppo.
 * Gli id restano: i file sul Drive stanno sotto `progetto-<id>`, e niente si
 * riscrive. Si unisce la vista, e con la conferma di Nicholas il registro.
 */

export type MembroProgetto = {
  id: string
  nome: string
  percorsi: Record<string, string>
  aggiuntoIl?: string
  /** Unito a mano in un altro progetto (0.60.0): l'id del principale; vuoto = separato di nuovo. */
  unitoIn?: string
}

const unito = (p: MembroProgetto): string | undefined => (p.unitoIn !== undefined && p.unitoIn !== '' && p.unitoIn !== p.id ? p.unitoIn : undefined)

export type GruppoProgetti = {
  /** Il nome normalizzato: la chiave del gruppo. */
  chiave: string
  /** L'id principale: quello che si mostra e a cui si attaccano le chat. */
  id: string
  nome: string
  /** Tutti gli id, il principale per primo. */
  ids: string[]
  /** Le cartelle di ogni PC, senza doppioni (stesso PC e stesso percorso). */
  percorsi: { pc: string; percorso: string; id: string }[]
}

/**
 * I nomi delle cartelle di sistema (0.67.4): mai un progetto. Il 12/10 il
 * progetto «Documents» (nato da chat che lavoravano in Documenti) si prendeva
 * per nome ogni chat sotto `…\Documents\…`: 541 chat di «Portfolio» finite
 * nel suo workspace. Regola di Nicholas: mai la cartella utente, Documenti o
 * la radice di un disco come progetto.
 */
const NOMI_DI_SISTEMA = new Set(['documents', 'documenti', 'mydocuments', 'desktop', 'scrivania', 'downloads', 'download', 'users', 'utenti', 'onedrive', 'appdata', 'progettisierradeck'])
export function eNomeDiSistema(nome: string): boolean {
  return NOMI_DI_SISTEMA.has(nomeNormalizzato(nome))
}

/** I suffissi delle copie: «(2)», «[3]», «- copia», «copy 2», «_old» no (è un nome). */
const SUFFISSI = [/\s*\(\d+\)\s*$/, /\s*\[\d+\]\s*$/, /[\s_-]+(copia|copy)(\s*\(?\d+\)?)?\s*$/i]

/** Il nome senza i suffissi delle copie: «sito (2)» → «sito». */
export function senzaSuffissi(nome: string): string {
  let n = nome.trim()
  for (let giro = 0; giro < 4; giro += 1) {
    const prima = n
    for (const s of SUFFISSI) n = n.replace(s, '')
    if (n === prima) break
  }
  return n === '' ? nome.trim() : n
}

export function nomeNormalizzato(nome: string): string {
  const fuori = senzaSuffissi(nome.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')).toLowerCase().replace(/[\s._-]+/g, '')
  return fuori === '' ? nome.trim().toLowerCase() : fuori
}

const normaPercorso = (p: string): string => p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()

/** `cwd` è `radice` o una sua sottocartella (Windows: maiuscole e barre non contano). */
export function dentroCartella(cwd: string, radice: string): boolean {
  const c = normaPercorso(cwd)
  const r = normaPercorso(radice)
  return r !== '' && (c === r || c.startsWith(`${r}\\`))
}

/** Quanto pesa una scelta (come `unisciCase`): Nicholas e «Sposta» battono la regola. */
const peso = (c: CasaChat): number => (c.da === 'nicholas' || c.da === 'sposta' ? 2 : 1)

/** La casa voluta di un gruppo: fra le scelte dei suoi id, la più forte e poi la più recente. */
export function casaDelGruppo(cc: CaseChat, ids: string[]): CasaChat | undefined {
  let migliore: CasaChat | undefined
  for (const id of ids) {
    const c = cc.case[`progetto:${id}`]
    if (c === undefined) continue
    if (migliore === undefined || peso(c) > peso(migliore) || (peso(c) === peso(migliore) && c.decisaIl > migliore.decisaIl)) migliore = c
  }
  return migliore
}

/**
 * I progetti del registro raggruppati per nome normalizzato (e per `unitoIn`).
 * Il principale: quello unito da altri, poi quello con la scelta di Nicholas
 * più recente, poi il più vecchio.
 */
export function raggruppaProgetti(progetti: MembroProgetto[], cc?: CaseChat): GruppoProgetti[] {
  const perId = new Map(progetti.map((p) => [p.id, p]))
  // La chiave di un membro: quella del principale in cui è unito (al massimo tre salti, niente giri).
  const chiaveDi = (p: MembroProgetto): string => {
    let q = p
    for (let i = 0; i < 3 && unito(q) !== undefined; i += 1) {
      const su = perId.get(unito(q) as string)
      if (su === undefined) break
      q = su
    }
    return nomeNormalizzato(q.nome)
  }
  const gruppi = new Map<string, MembroProgetto[]>()
  for (const p of progetti) {
    const k = chiaveDi(p)
    gruppi.set(k, [...(gruppi.get(k) ?? []), p])
  }
  const fuori: GruppoProgetti[] = []
  for (const [chiave, membri] of gruppi) {
    const uniti = new Set(membri.map(unito).filter((x): x is string => x !== undefined))
    const scelta = (m: MembroProgetto): string => (cc === undefined ? '' : cc.case[`progetto:${m.id}`]?.decisaIl ?? '')
    const ordinati = [...membri].sort((a, b) =>
      (uniti.has(b.id) ? 1 : 0) - (uniti.has(a.id) ? 1 : 0) ||
      (unito(a) === undefined ? 0 : 1) - (unito(b) === undefined ? 0 : 1) ||
      scelta(b).localeCompare(scelta(a)) ||
      (a.aggiuntoIl ?? '').localeCompare(b.aggiuntoIl ?? '') ||
      a.id.localeCompare(b.id))
    const principale = ordinati[0] as MembroProgetto
    const visti = new Set<string>()
    const percorsi: GruppoProgetti['percorsi'] = []
    for (const m of ordinati) {
      for (const [pc, percorso] of Object.entries(m.percorsi)) {
        const k = `${pc}|${normaPercorso(percorso)}`
        if (visti.has(k)) continue
        visti.add(k)
        percorsi.push({ pc, percorso, id: m.id })
      }
    }
    // Il nome da mostrare: uno senza «(2)» o «- copia», prima quello del principale.
    const nome = [principale, ...ordinati].map((m) => m.nome).find((x) => senzaSuffissi(x) === x.trim()) ?? senzaSuffissi(principale.nome)
    fuori.push({ chiave, id: principale.id, nome, ids: ordinati.map((m) => m.id), percorsi })
  }
  return fuori.sort((a, b) => a.nome.localeCompare(b.nome))
}

/** Il gruppo di un id qualunque (principale o doppione). */
export function gruppoDiId(gruppi: GruppoProgetti[], id: string): GruppoProgetti | undefined {
  return gruppi.find((g) => g.ids.includes(id))
}

/**
 * Il gruppo di una cartella. Prima le cartelle registrate (la più profonda
 * che la contiene, su qualunque PC); poi il nome: la cartella stessa o la più
 * vicina delle cartelle che la contengono con il nome di un gruppo. Così una
 * chat in `…\Documenti\SierraDeck\android` va in «SierraDeck» anche se qui
 * quella cartella non è mai stata registrata.
 */
export function gruppoDiCartella(cwd: string, gruppi: GruppoProgetti[]): { gruppo: GruppoProgetti; radice: string; perNome: boolean } | undefined {
  let migliore: { gruppo: GruppoProgetti; radice: string } | undefined
  for (const g of gruppi) {
    for (const p of g.percorsi) {
      if (!dentroCartella(cwd, p.percorso)) continue
      if (migliore === undefined || normaPercorso(p.percorso).length > normaPercorso(migliore.radice).length) migliore = { gruppo: g, radice: p.percorso }
    }
  }
  if (migliore !== undefined) return { ...migliore, perNome: false }
  const parti = cwd.replace(/\//g, '\\').replace(/\\+$/, '').split('\\')
  // Mai la radice di un disco: «C:» non è il nome di un progetto.
  for (let i = parti.length - 1; i >= 1; i -= 1) {
    // Il nome di una cartella di sistema non porta a nessun progetto (0.67.4).
    if (eNomeDiSistema(parti[i] as string)) continue
    const k = nomeNormalizzato(parti[i] as string)
    const g = gruppi.find((x) => x.chiave === k)
    if (g !== undefined) return { gruppo: g, radice: parti.slice(0, i + 1).join('\\'), perNome: true }
  }
  return undefined
}

/** I workspace con il nome del gruppo (normalizzato): quello col nome esatto per primo. */
export function workspaceDelGruppo(nomi: string[], g: { chiave: string; nome: string }): string[] {
  return nomi.filter((n) => nomeNormalizzato(n) === g.chiave).sort((a, b) => (a === g.nome ? -1 : b === g.nome ? 1 : a.localeCompare(b)))
}

/* ------------------------------------------------------------------ */
/* Le chat senza nome (0.60.0).                                        */
/* ------------------------------------------------------------------ */

/**
 * Una chat senza nome: nessun titolo di Claude, nessuna domanda da cui
 * prenderlo, nessuna etichetta. Nicholas lavora per progetti e workspace:
 * queste spariscono dagli elenchi principali (non si cancellano) e restano
 * contate nel loro progetto. Il titolo di ripiego che il programma inventa
 * («chat 1a2b3c4d», l'id, «senza titolo») vale come nessun titolo.
 */
export function eSenzaNome(titolo: string | undefined, sessione?: string): boolean {
  const t = (titolo ?? '').trim()
  if (t === '') return true
  const l = t.toLowerCase()
  if (l === 'senza titolo' || l === 'senza nome' || l === '(senza titolo)') return true
  if (/^chat [0-9a-f]{6,8}$/.test(l)) return true
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(l)) return true
  if (sessione !== undefined && sessione !== '' && [sessione, sessione.slice(0, 8), `chat ${sessione.slice(0, 8)}`].some((x) => l === x.toLowerCase())) return true
  return false
}

/* ------------------------------------------------------------------ */
/* Le case armonizzate (0.60.0).                                       */
/* ------------------------------------------------------------------ */

/**
 * Con lo stesso nome è lo stesso progetto, quindi la casa è una sola: quella
 * scelta da Nicholas per il progetto. Le chat del gruppo con una casa diversa
 * decisa dalla regola o dalla nascita (il caso «MT5»: la regola aveva visto
 * una cartella «Trading» con lo stesso nome su un altro PC), o senza casa, o
 * con una scelta di Nicholas **più vecchia** di quella del progetto, prendono
 * la casa del progetto. Una scelta per la singola chat fatta dopo resta.
 */
export function armonizzaCase(
  cc: CaseChat,
  gruppi: GruppoProgetti[],
  chatDi: (g: GruppoProgetti) => string[]
): Record<string, CasaChat> {
  const nuove: Record<string, CasaChat> = {}
  for (const g of gruppi) {
    const voluta = casaDelGruppo(cc, g.ids)
    if (voluta === undefined || peso(voluta) < 2) continue
    for (const s of chatDi(g)) {
      const c = cc.case[s]
      if (c !== undefined && c.pc === voluta.pc) continue
      if (c !== undefined && peso(c) === 2 && c.decisaIl >= voluta.decisaIl) continue
      nuove[s] = {
        pc: voluta.pc, pcNome: voluta.pcNome, decisaIl: voluta.decisaIl, da: voluta.da,
        ...(voluta.sceltaDa !== undefined ? { sceltaDa: voluta.sceltaDa } : {}),
        motivo: `progetto «${g.nome}»: stesso nome, stesso progetto — vive su ${voluta.pcNome}, scelto da Nicholas`
      }
    }
  }
  return nuove
}
