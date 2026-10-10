import type { CaseChat, FonteCasa } from './una-casa'

/**
 * Il pannello delle chat e dei progetti del Drive (0.58.0, tappa 1).
 *
 * Una riga per chat e per progetto: dove vive (il **residente**), chi ne ha
 * una copia, quando è stata usata, e se l'assegnazione è sbagliata. Le regole
 * stanno qui, pure: le usano il pannello del PC, e nella tappa 4 la pagina e
 * l'app (ricevono il risultato già calcolato dal PC).
 *
 * Le case vengono da `case-chat` (src/shared/una-casa.ts), le copie dal
 * manifesto del Drive e dall'indice di questo PC, le chat aperte dai battiti.
 * Il cambio di residente non è qui: è `ospite.scegli` (chat) e «Sposta
 * progetto» (progetti). Vedi la scheda `pannello-chat-drive-0-58.md`.
 */

export type PcNoto = { id: string; nome: string; battito?: string }

/** Una copia di una chat: sul disco di questo PC, o caricata sul Drive da un PC. */
export type CopiaChat = { pc: string; dove: 'qui' | 'drive'; mtime?: number }

export type ChatIngresso = {
  sessione: string
  titolo: string
  cwd?: string
  progetto?: string
  copie: CopiaChat[]
  /** I PC dove è aperta adesso. */
  aperta?: string[]
}

export type ProgettoIngresso = { id: string; nome: string; percorsi: Record<string, string> }

export type TipoProblema =
  | 'senza-casa' | 'due-case' | 'casa-sconosciuta' | 'casa-assente' | 'copia-piu-recente'
  | 'progetto-senza-casa' | 'progetto-diviso'

export type Problema = { tipo: TipoProblema; titolo: string; spiega: string; cosaFare: string }

export type Residente = { pc: string; nome: string; fonte: FonteCasa; motivo: string; qui: boolean }

export type StatoRiga = 'residente' | 'solo-cloud' | 'conflitto'

export type RigaChat = {
  sessione: string
  titolo: string
  cwd?: string
  progetto?: string
  residente?: Residente
  copie: { pc: string; nome: string; dove: 'qui' | 'drive'; quando?: string }[]
  ultimoUso?: string
  stato: StatoRiga
  /** Questo PC ne ha una copia sul disco. */
  copiaQui: boolean
  problemi: Problema[]
}

export type RigaProgetto = {
  id: string
  nome: string
  residente?: { pc: string; nome: string; qui: boolean }
  /** I PC che hanno la cartella del progetto. */
  cartelle: { pc: string; nome: string; percorso: string }[]
  /** Questo PC ha la cartella. */
  cartellaQui: boolean
  chat: number
  ultimoUso?: string
  stato: StatoRiga
  problemi: Problema[]
}

export type Pannello = { io: PcNoto; pc: PcNoto[]; chat: RigaChat[]; progetti: RigaProgetto[]; letto: string }

/** Oltre questo un PC senza battito si considera assente. */
export const ASSENTE_DOPO_MS = 30 * 86_400_000

const iso = (ms: number | undefined): string | undefined => (ms === undefined || !Number.isFinite(ms) ? undefined : new Date(ms).toISOString())
const giorni = (ms: number): number => Math.floor(ms / 86_400_000)

export function costruisciPannello(p: {
  io: PcNoto
  pc: PcNoto[]
  case: CaseChat
  chat: ChatIngresso[]
  progetti: ProgettoIngresso[]
  adesso: number
}): Pannello {
  const tutti = [p.io, ...p.pc.filter((x) => x.id !== p.io.id)]
  const nomeDi = (id: string): string => tutti.find((x) => x.id === id)?.nome ?? `PC ${id.slice(0, 6)}`
  const chat = p.chat.map((c) => rigaChat(c, p, nomeDi))
  const progetti = p.progetti.map((g) => rigaProgetto(g, chat.filter((c) => c.progetto === g.id), p, nomeDi))
  // Le chat in ordine: prima le sbagliate, poi le più recenti.
  chat.sort((a, b) => (b.problemi.length > 0 ? 1 : 0) - (a.problemi.length > 0 ? 1 : 0) || (b.ultimoUso ?? '').localeCompare(a.ultimoUso ?? ''))
  progetti.sort((a, b) => (b.problemi.length > 0 ? 1 : 0) - (a.problemi.length > 0 ? 1 : 0) || a.nome.localeCompare(b.nome))
  return { io: p.io, pc: p.pc, chat, progetti, letto: new Date(p.adesso).toISOString() }
}

function rigaChat(c: ChatIngresso, p: { io: PcNoto; pc: PcNoto[]; case: CaseChat; adesso: number }, nomeDi: (id: string) => string): RigaChat {
  const casa = p.case.case[c.sessione]
  const residente: Residente | undefined = casa === undefined ? undefined : {
    pc: casa.pc, nome: casa.pcNome !== '' ? casa.pcNome : nomeDi(casa.pc), fonte: casa.da, motivo: casa.motivo, qui: casa.pc === p.io.id
  }
  const copie = c.copie.map((x) => ({ pc: x.pc, nome: nomeDi(x.pc), dove: x.dove, ...(iso(x.mtime) !== undefined ? { quando: iso(x.mtime) as string } : {}) }))
  const ultimo = Math.max(...c.copie.map((x) => x.mtime ?? 0))
  const problemi = problemiChat(c, casa === undefined ? undefined : { pc: casa.pc, nome: residente?.nome ?? casa.pc, decisaIl: casa.decisaIl }, p, nomeDi)
  const copiaResidente = residente !== undefined && c.copie.some((x) => x.pc === residente.pc)
  const conflitto = problemi.some((x) => x.tipo === 'due-case' || x.tipo === 'copia-piu-recente')
  return {
    sessione: c.sessione, titolo: c.titolo,
    ...(c.cwd !== undefined ? { cwd: c.cwd } : {}), ...(c.progetto !== undefined ? { progetto: c.progetto } : {}),
    ...(residente !== undefined ? { residente } : {}),
    copie,
    ...(ultimo > 0 ? { ultimoUso: iso(ultimo) as string } : {}),
    stato: conflitto ? 'conflitto' : copiaResidente ? 'residente' : 'solo-cloud',
    copiaQui: c.copie.some((x) => x.dove === 'qui'),
    problemi
  }
}

/** Le assegnazioni sbagliate di una chat, ognuna spiegata. */
export function problemiChat(
  c: ChatIngresso,
  casa: { pc: string; nome: string; decisaIl: string } | undefined,
  p: { io: PcNoto; pc: PcNoto[]; adesso: number },
  nomeDi: (id: string) => string
): Problema[] {
  const fuori: Problema[] = []
  const conCopia = [...new Set(c.copie.map((x) => x.pc))]
  if (casa === undefined) {
    fuori.push({
      tipo: 'senza-casa',
      titolo: 'Senza casa',
      spiega: conCopia.length > 1
        ? `Nessun PC è la sua casa, e ne hanno una copia ${conCopia.map(nomeDi).join(' e ')}: ognuno può farla girare e caricarla, e le due copie possono andare in direzioni diverse.`
        : 'Nessun PC è la sua casa: qualunque PC la apra la fa girare e la carica sul Drive.',
      cosaFare: 'Scegli il PC residente qui sotto: diventa la sua casa, e gli altri la aprono dal vivo guardando quello.'
    })
    return fuori
  }
  const pc = p.pc.find((x) => x.id === casa.pc)
  if (casa.pc !== p.io.id && pc === undefined) {
    fuori.push({
      tipo: 'casa-sconosciuta',
      titolo: 'Casa su un PC sconosciuto',
      spiega: `La sua casa è «${casa.nome}», ma nessun PC con quell'identità ha lasciato un battito sul Drive. Succede se quel PC è stato reinstallato o ha perso la sua identità (un id nuovo): la casa vecchia resta orfana, e la chat non la apre davvero nessuno.`,
      cosaFare: 'Scegli come residente un PC che esiste: quello dove la usi adesso.'
    })
  } else if (pc?.battito !== undefined && p.adesso - Date.parse(pc.battito) > ASSENTE_DOPO_MS) {
    fuori.push({
      tipo: 'casa-assente',
      titolo: `Casa su un PC assente da ${giorni(p.adesso - Date.parse(pc.battito))} giorni`,
      spiega: `La sua casa è «${casa.nome}», che non si fa vivo sul Drive da più di 30 giorni: finché resta lì, sugli altri PC si apre solo dal vivo, e quel PC non risponde.`,
      cosaFare: 'Se quel PC non lo usi più, scegli come residente quello dove lavori adesso.'
    })
  }
  const aperteAltrove = (c.aperta ?? []).filter((x) => x !== casa.pc)
  const decisa = Date.parse(casa.decisaIl)
  const caricateDopo = [...new Set(c.copie.filter((x) => x.dove === 'drive' && (x.mtime ?? 0) > decisa).map((x) => x.pc))]
  if (aperteAltrove.length > 0 || caricateDopo.length > 1) {
    fuori.push({
      tipo: 'due-case',
      titolo: 'Due case',
      spiega: aperteAltrove.length > 0
        ? `La sua casa è «${casa.nome}», ma adesso è aperta anche su ${aperteAltrove.map(nomeDi).join(' e ')}: due PC la fanno girare insieme.`
        : `La sua casa è «${casa.nome}», ma dopo quella scelta l'hanno caricata sul Drive ${caricateDopo.map(nomeDi).join(' e ')}: lavora su due PC.`,
      cosaFare: 'Conferma il residente (o scegline un altro): gli altri PC chiudono la loro copia a fine turno e la mettono nella cartella di recupero, senza cancellarla.'
    })
  }
  const delResidente = Math.max(0, ...c.copie.filter((x) => x.pc === casa.pc).map((x) => x.mtime ?? 0))
  const piuNuova = c.copie.filter((x) => x.pc !== casa.pc && (x.mtime ?? 0) > delResidente && delResidente > 0)
  if (piuNuova.length > 0) {
    const chi = [...new Set(piuNuova.map((x) => (x.dove === 'qui' ? `questo PC (${nomeDi(p.io.id)})` : nomeDi(x.pc))))]
    fuori.push({
      tipo: 'copia-piu-recente',
      titolo: 'Copia più recente fuori dalla casa',
      spiega: `La copia di ${chi.join(' e ')} è più nuova di quella di «${casa.nome}», che è la sua casa: il lavoro più avanti non sta dove dovrebbe.`,
      cosaFare: `Rendi residente il PC con la copia più nuova, oppure, se è quella di «${casa.nome}» a valere, lascia così: la copia più nuova va nella cartella di recupero e si può riprendere.`
    })
  }
  return fuori
}

function rigaProgetto(g: ProgettoIngresso, chat: RigaChat[], p: { io: PcNoto; adesso: number }, nomeDi: (id: string) => string): RigaProgetto {
  const conta = new Map<string, number>()
  for (const c of chat) if (c.residente !== undefined) conta.set(c.residente.pc, (conta.get(c.residente.pc) ?? 0) + 1)
  const ordinati = [...conta.entries()].sort((a, b) => b[1] - a[1])
  const primo = ordinati[0]
  const problemi: Problema[] = []
  if (chat.length > 0 && primo === undefined) {
    problemi.push({
      tipo: 'progetto-senza-casa',
      titolo: 'Progetto senza casa',
      spiega: 'Nessuna delle sue chat ha un PC residente: ogni PC che ha la cartella può farle girare.',
      cosaFare: 'Scegli il PC residente del progetto: diventa la casa di tutte le sue chat.'
    })
  }
  if (ordinati.length > 1) {
    problemi.push({
      tipo: 'progetto-diviso',
      titolo: 'Progetto diviso fra più PC',
      spiega: `Le sue chat vivono su PC diversi: ${ordinati.map(([pc, n]) => `${nomeDi(pc)} (${n})`).join(', ')}.`,
      cosaFare: 'Scegli un PC residente per tutto il progetto, se lo usi da uno solo.'
    })
  }
  for (const c of chat) {
    for (const x of c.problemi) {
      if ((x.tipo === 'casa-sconosciuta' || x.tipo === 'casa-assente') && !problemi.some((y) => y.tipo === x.tipo)) problemi.push(x)
    }
  }
  const ultimo = chat.map((c) => c.ultimoUso ?? '').sort().pop()
  const conflitto = chat.some((c) => c.stato === 'conflitto')
  return {
    id: g.id, nome: g.nome,
    ...(primo !== undefined ? { residente: { pc: primo[0], nome: nomeDi(primo[0]), qui: primo[0] === p.io.id } } : {}),
    cartelle: Object.entries(g.percorsi).map(([pc, percorso]) => ({ pc, nome: nomeDi(pc), percorso })),
    cartellaQui: g.percorsi[p.io.id] !== undefined,
    chat: chat.length,
    ...(ultimo !== undefined && ultimo !== '' ? { ultimoUso: ultimo } : {}),
    stato: conflitto ? 'conflitto' : primo !== undefined && g.percorsi[primo[0]] !== undefined ? 'residente' : 'solo-cloud',
    problemi
  }
}

export type FiltroPannello = 'tutti' | 'sbagliati' | 'questo-pc' | 'solo-cloud'

/** Le righe di un filtro e di una ricerca (titolo, cartella, PC). */
export function filtraChat(righe: RigaChat[], filtro: FiltroPannello, q = ''): RigaChat[] {
  const parole = q.toLowerCase().split(/\s+/).filter((x) => x !== '')
  return righe.filter((r) => {
    if (filtro === 'sbagliati' && r.problemi.length === 0) return false
    if (filtro === 'questo-pc' && r.residente?.qui !== true) return false
    if (filtro === 'solo-cloud' && (r.copiaQui || r.residente?.qui === true)) return false
    const testo = `${r.titolo} ${r.cwd ?? ''} ${r.residente?.nome ?? ''} ${r.copie.map((c) => c.nome).join(' ')}`.toLowerCase()
    return parole.every((p) => testo.includes(p))
  })
}

export function filtraProgetti(righe: RigaProgetto[], filtro: FiltroPannello, q = ''): RigaProgetto[] {
  const parole = q.toLowerCase().split(/\s+/).filter((x) => x !== '')
  return righe.filter((r) => {
    if (filtro === 'sbagliati' && r.problemi.length === 0) return false
    if (filtro === 'questo-pc' && r.residente?.qui !== true) return false
    if (filtro === 'solo-cloud' && (r.cartellaQui || r.residente?.qui === true)) return false
    const testo = `${r.nome} ${r.residente?.nome ?? ''} ${r.cartelle.map((c) => `${c.nome} ${c.percorso}`).join(' ')}`.toLowerCase()
    return parole.every((p) => testo.includes(p))
  })
}

/** I testi della conferma del cambio di residente: cosa succede, cosa no, cosa fare se non torna. */
export function testiCambioResidente(p: {
  cosa: 'chat' | 'progetto'
  nome: string
  da?: { pc: string; nome: string }
  verso: { pc: string; nome: string }
  io: string
  chat: number
  /** Per un progetto: il PC nuovo ha la cartella. */
  cartellaLa?: boolean
}): { titolo: string; succede: string[]; nonSuccede: string[]; seNonTorna: string[] } {
  const verso = p.verso.pc === p.io ? `questo PC (${p.verso.nome})` : p.verso.nome
  const da = p.da === undefined ? 'nessun PC' : p.da.pc === p.io ? `questo PC (${p.da.nome})` : p.da.nome
  const quante = p.cosa === 'chat' ? `la chat «${p.nome}»` : `le ${p.chat} chat del progetto «${p.nome}»`
  const succede = [
    `${quante.charAt(0).toUpperCase()}${quante.slice(1)} lavoreranno su ${verso}: il loro claude.exe parte solo lì. Sugli altri PC si aprono dal vivo, guardando quello.`,
    'La scelta vale subito qui, parte verso gli altri PC della tua cassaforte e arriva sul Drive: chi non la riceve subito la trova entro due minuti.',
    p.da !== undefined && p.da.pc !== p.verso.pc
      ? `Su ${da}, che era la casa, ogni chat aperta viene chiusa a fine turno (mai a metà) e la sua copia va nella cartella di recupero di SierraDeck.`
      : 'Su ogni altro PC che ne ha una copia, la copia va nella cartella di recupero di SierraDeck a fine turno.',
    `Se la casa era su questo PC, prima di cambiarla salvo sul Drive, così ${verso} trova la copia più avanti.`
  ]
  const nonSuccede = [
    'Non si cancella niente: le copie tolte restano nella cartella di recupero, e la scelta si annulla da «Dove vive ogni chat».',
    p.cosa === 'progetto'
      ? `La cartella del progetto non si copia e non si tocca su nessun PC.${p.cartellaLa === false ? ` Su ${verso} la cartella non c'è: le chat partiranno, ma senza i file del progetto finché non ce li porti (da quel PC, «Sposta progetto»).` : ''}`
      : 'La cartella di lavoro della chat non si tocca.',
    'Le chat che stanno lavorando non vengono interrotte.'
  ]
  const seNonTorna = [
    `Se ${verso} è spento, la scelta vale lo stesso: la chat parte lì quando si riaccende.`,
    'Se una copia non arriva dove ti aspetti, guarda «Dove vive ogni chat» e la Salute: dicono dove sta e cosa è successo.',
    'Per tornare indietro, scegli di nuovo il PC di prima: le copie si riprendono dalla cartella di recupero.'
  ]
  return { titolo: `Rendi ${verso} residente`, succede, nonSuccede, seNonTorna }
}
