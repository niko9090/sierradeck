/**
 * **I workspace degli altri PC** (sezione «Altri PC»), le regole pure.
 *
 * Nicholas, 13/11: «quando mi collego a un altro PC per una sessione remota a
 * volte non c'è l'autopilota e posso scrivere direttamente nelle chat, cosa
 * che abbiamo tolto anche in locale. E voglio che le sessioni remote abbiano
 * una sezione dedicata, separata e ben visibile».
 *
 * Un workspace aperto da un altro PC resta nell'archivio di qui (così
 * riquadri, Panoramica e memoria funzionano come sempre), ma il suo PC sta
 * scritto in `workspace-su-pc.json`: è quello, e non il primo riquadro, a dire
 * dove vive. I workspace segnati lì non stanno fra quelli di questo PC: stanno
 * nella sezione «Altri PC», raggruppati per PC, e si aprono sempre con
 * l'autopilota di là.
 */

/** Il PC dove vive un workspace. */
export type SuPc = { pcId: string; pcNome: string }
/** `workspace-su-pc.json`: nome del workspace → il suo PC. */
export type RegistroSuPc = Record<string, SuPc>
/** Un workspace di qui che vive su un altro PC. `sparito`: quel PC non lo elenca più. */
export type WorkspaceRemoto = SuPc & { sparito?: boolean }

/** Il registro come sta sul disco: solo voci con un pcId, il resto si scarta. */
export function registroSuPcValido(x: unknown): RegistroSuPc {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return {}
  const fuori: RegistroSuPc = {}
  for (const [nome, v] of Object.entries(x as Record<string, unknown>)) {
    if (nome === '' || typeof v !== 'object' || v === null) continue
    const o = v as Record<string, unknown>
    if (typeof o.pcId !== 'string' || o.pcId === '') continue
    fuori[nome] = { pcId: o.pcId, pcNome: typeof o.pcNome === 'string' && o.pcNome !== '' ? o.pcNome : o.pcId.slice(0, 8) }
  }
  return fuori
}

/** Un workspace rinominato resta dello stesso PC. Senza cambi torna lo stesso oggetto. */
export function rinominaInRegistro(r: RegistroSuPc, vecchio: string, nuovo: string): RegistroSuPc {
  const v = r[vecchio]
  if (v === undefined || vecchio === nuovo) return r
  const { [vecchio]: _via, ...resto } = r
  return { ...resto, [nuovo]: v }
}

/** Un workspace eliminato esce dal registro. Senza cambi torna lo stesso oggetto. */
export function togliDaRegistro(r: RegistroSuPc, nome: string): RegistroSuPc {
  if (r[nome] === undefined) return r
  const { [nome]: _via, ...resto } = r
  return resto
}

type BattitoPc = { pcId: string; nome: string; workspace?: readonly string[] | undefined }

/**
 * I workspace di questo archivio che vivono su un altro PC.
 *
 * Vale il registro, non il battito: un battito vecchio o senza quel nome non
 * fa diventare «di qui» un workspace remoto (prima `workspace:suPc` tornava
 * vuoto e la finestra creava un autopilota locale al primo messaggio). Se quel
 * PC non lo elenca più, resta remoto e si dice `sparito`.
 */
export function remotiDiQui(nomi: readonly string[], registro: RegistroSuPc, battiti: readonly BattitoPc[]): Record<string, WorkspaceRemoto> {
  const fuori: Record<string, WorkspaceRemoto> = {}
  for (const nome of nomi) {
    const v = registro[nome]
    if (v === undefined) continue
    const b = battiti.find((x) => x.pcId === v.pcId)
    const sparito = b?.workspace !== undefined && !b.workspace.includes(nome)
    fuori[nome] = { pcId: v.pcId, pcNome: b !== undefined && b.nome !== '' ? b.nome : v.pcNome, ...(sparito ? { sparito: true } : {}) }
  }
  return fuori
}

type RiquadroPerMigrare = { remoto?: { pcId: string; pcNome: string } | undefined }

/**
 * La migrazione delle linguette remote di prima: un workspace non ancora nel
 * registro le cui chat (almeno una) guardano **tutte** lo stesso altro PC era
 * un workspace aperto da là. Va nella sezione «Altri PC». Un workspace con
 * anche una sola chat di qui resta di qui. Torna solo le voci da aggiungere.
 */
export function remotiDaMigrare(workspace: readonly { nome: string; panes: readonly RiquadroPerMigrare[] }[], registro: RegistroSuPc, ioId: string): RegistroSuPc {
  const fuori: RegistroSuPc = {}
  for (const w of workspace) {
    if (registro[w.nome] !== undefined || w.panes.length === 0) continue
    const primo = w.panes[0]?.remoto
    if (primo === undefined || primo.pcId === '' || primo.pcId === ioId) continue
    if (!w.panes.every((p) => p.remoto !== undefined && p.remoto.pcId === primo.pcId)) continue
    fuori[w.nome] = { pcId: primo.pcId, pcNome: primo.pcNome }
  }
  return fuori
}

/** I nomi della fascia «Workspace» (di qui) e quelli della sezione «Altri PC», nell'ordine di sempre. */
export function separaWorkspace(nomi: readonly string[], remoti: Readonly<Record<string, unknown>>): { locali: string[]; remoti: string[] } {
  return { locali: nomi.filter((n) => remoti[n] === undefined), remoti: nomi.filter((n) => remoti[n] !== undefined) }
}

/** Una riga della sezione: un workspace di quel PC, già aperto qui o da aprire. */
export type VoceAltroPc = { nome: string; aperto: boolean; davanti: boolean; sparito?: boolean }
/**
 * Un PC della sezione, con i suoi workspace. `versione` e `visto` (l'ultimo
 * battito, ISO) ci sono solo se il battito li porta.
 */
export type GruppoAltroPc = { pcId: string; nome: string; vivo: boolean; voci: VoceAltroPc[]; versione?: string; visto?: string }

/** Un PC come lo dà il battito, per la sezione. `aiutante`: SierraDeck Aiutante, che qui non compare. */
export type PcPerSezione = {
  pcId: string
  nome: string
  vivo: boolean
  workspace?: readonly string[] | undefined
  aiutante?: boolean | undefined
  versione?: string | undefined
  /** L'ultimo battito (ISO). */
  visto?: string | undefined
}

/**
 * La sezione «Altri PC»: un gruppo per PC (prima gli accesi, poi per nome),
 * dentro i suoi workspace in ordine di nome. Un workspace già aperto qui si
 * apre al clic; uno solo di là si apre portandolo nella sezione. Un nome che
 * qui c'è già come workspace di questo PC non si propone: due omonimi non si
 * distinguerebbero. Anche un PC senza workspace compare: si vede se è acceso.
 */
export function gruppiAltriPc(p: {
  nomiQui: readonly string[]
  remoti: Readonly<Record<string, WorkspaceRemoto>>
  pc: readonly PcPerSezione[]
  attivo: string
}): GruppoAltroPc[] {
  const qui = new Set(p.nomiQui.map((n) => n.toLowerCase()))
  const gruppi = new Map<string, GruppoAltroPc>()
  // Gli Aiutanti (13/11, Nicholas: «non elencare gli Aiutanti») non hanno workspace: stanno in «Altri computer».
  const pcs = p.pc.filter((pc) => pc.aiutante !== true)
  for (const pc of pcs) {
    if (gruppi.has(pc.pcId)) continue
    gruppi.set(pc.pcId, {
      pcId: pc.pcId, nome: pc.nome, vivo: pc.vivo, voci: [],
      ...(pc.versione !== undefined && pc.versione !== '' ? { versione: pc.versione } : {}),
      ...(pc.visto !== undefined && pc.visto !== '' ? { visto: pc.visto } : {})
    })
  }
  for (const [nome, r] of Object.entries(p.remoti)) {
    let g = gruppi.get(r.pcId)
    if (g === undefined) { g = { pcId: r.pcId, nome: r.pcNome, vivo: false, voci: [] }; gruppi.set(r.pcId, g) }
    g.voci.push({ nome, aperto: true, davanti: nome === p.attivo, ...(r.sparito === true ? { sparito: true } : {}) })
  }
  for (const pc of pcs) {
    const g = gruppi.get(pc.pcId)
    if (g === undefined) continue
    for (const nome of new Set(pc.workspace ?? [])) {
      if (nome === '' || qui.has(nome.toLowerCase()) || p.remoti[nome] !== undefined) continue
      g.voci.push({ nome, aperto: false, davanti: false })
    }
  }
  const fuori = [...gruppi.values()].map((g) => ({ ...g, voci: [...g.voci].sort((a, b) => a.nome.localeCompare(b.nome)) }))
  return fuori.sort((a, b) => (a.vivo === b.vivo ? a.nome.localeCompare(b.nome) : a.vivo ? -1 : 1))
}

/** Da quanti PC in su la tendina «Altri PC» mostra la casella per cercare. */
export const ALTRI_PC_CON_RICERCA = 6

/**
 * Il riassunto del tasto «Altri PC · N» nella fascia: quanti PC, quanti
 * accesi, il workspace davanti (se è di un altro PC) e se qualcosa chiede di
 * guardare: un workspace aperto qui che là non c'è più, o il cui PC è spento.
 */
export function riassuntoAltriPc(gruppi: readonly GruppoAltroPc[], attivo: string): {
  totale: number
  accesi: number
  davanti?: { pc: string; nome: string }
  attenzione?: string
} {
  let davanti: { pc: string; nome: string } | undefined
  const motivi: string[] = []
  for (const g of gruppi) {
    for (const v of g.voci) {
      if (!v.aperto) continue
      if (v.nome === attivo && davanti === undefined) davanti = { pc: g.nome, nome: v.nome }
      if (v.sparito === true) motivi.push(`«${v.nome}» non c’è più su ${g.nome}`)
      else if (!g.vivo) motivi.push(`${g.nome} è spento: «${v.nome}» aspetta`)
    }
  }
  return {
    totale: gruppi.length,
    accesi: gruppi.filter((g) => g.vivo).length,
    ...(davanti !== undefined ? { davanti } : {}),
    ...(motivi.length > 0 ? { attenzione: motivi.join(' · ') } : {})
  }
}

/** Minuscole e senza accenti: «Ufficio» si trova anche scrivendo «uffi». */
function pieghi(t: string): string {
  return t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

/**
 * Il filtro della tendina: un PC resta se il testo sta nel suo nome (con tutti
 * i suoi workspace) o in quello di almeno un suo workspace (con solo quelli).
 * `trovatiDentro`: i PC rimasti per un workspace, da mostrare aperti.
 */
export function filtraAltriPc(gruppi: readonly GruppoAltroPc[], testo: string): { gruppi: GruppoAltroPc[]; trovatiDentro: Set<string> } {
  const q = pieghi(testo)
  const trovatiDentro = new Set<string>()
  if (q === '') return { gruppi: [...gruppi], trovatiDentro }
  const fuori: GruppoAltroPc[] = []
  for (const g of gruppi) {
    if (pieghi(g.nome).includes(q)) { fuori.push(g); continue }
    const voci = g.voci.filter((v) => pieghi(v.nome).includes(q))
    if (voci.length === 0) continue
    trovatiDentro.add(g.pcId)
    fuori.push({ ...g, voci })
  }
  return { gruppi: fuori, trovatiDentro }
}

/**
 * La riga di stato di un PC nella tendina: «acceso», «spento · visto 3 ore fa»,
 * con la versione se c'è. `quantoFa` è quello della Salute.
 */
export function statoPcBreve(g: Pick<GruppoAltroPc, 'vivo' | 'visto' | 'versione'>, quantoFa: (iso: string) => string): string {
  const stato = g.vivo ? 'acceso' : g.visto !== undefined ? `spento · visto ${quantoFa(g.visto)}` : 'spento'
  return g.versione !== undefined ? `${stato} · v${g.versione}` : stato
}

/**
 * Si può scrivere direttamente in una chat di un altro PC? Mai in un
 * workspace che vive là (si parla col suo autopilota, come qui), e mai in un
 * workspace che ha un autopilota: le chat le comanda lui.
 */
export function chatRemotaScrivibile(p: { workspaceRemoto: boolean; conAutopilota: boolean }): boolean {
  return !p.workspaceRemoto && !p.conAutopilota
}

/**
 * La cartella dove nascerebbe l'autopilota **di questo PC** al primo
 * messaggio. Per un workspace che vive su un altro PC: nessuna (l'autopilota
 * è là; prima nasceva qui con la cartella di una chat di là e da allora il
 * remoto era ignorato). Per uno di qui: la cartella di una sua chat di qui,
 * mai quella di una chat che guarda un altro PC.
 */
export function cartellaAutopilotaLocale(p: { workspaceRemoto: boolean; riquadri: readonly { cwd: string; remoto?: unknown }[]; dormiente?: string | undefined }): string | undefined {
  if (p.workspaceRemoto) return undefined
  if (p.dormiente !== undefined && p.dormiente !== '') return p.dormiente
  return p.riquadri.find((r) => r.remoto === undefined && r.cwd !== '')?.cwd
}

/** Come sta l'autopilota di un workspace remoto, in una riga: mai un campo che lo crea qui. */
export type StatoRemoto =
  | { tipo: 'pronto' }
  | { tipo: 'cerco'; testo: string }
  | { tipo: 'giu'; testo: string }
  | { tipo: 'nessuno'; testo: string }

export function statoAutopilotaRemoto(s: { autopilota?: unknown; nessuno?: boolean | undefined; giu: boolean }, pcNome: string): StatoRemoto {
  if (s.autopilota !== undefined) return { tipo: 'pronto' }
  if (s.giu) return { tipo: 'giu', testo: `${pcNome} non risponde: riprovo da solo.` }
  if (s.nessuno === true) return { tipo: 'nessuno', testo: `Su ${pcNome} questo workspace non ha ancora un autopilota.` }
  return { tipo: 'cerco', testo: `Mi collego a ${pcNome}…` }
}
