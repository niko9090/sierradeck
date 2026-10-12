import type { Trasloco } from './trasloco'
import type { StatoSpazio } from './spazio-drive'
import type { CaseChat, FonteCasa } from './una-casa'
import type { PianoAllineamento } from './allineamento'
import { casaDelGruppo, eSenzaNome, raggruppaProgetti, workspaceDelGruppo, type GruppoProgetti } from './progetti-unificati'
import type { StatoResidenza } from './residenza'

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

export type PcNoto = {
  id: string
  nome: string
  battito?: string
  /** Il suo battito dice le copie locali (0.58.0). `false`: PC da aggiornare. */
  diceLocali?: boolean
}

/**
 * Una copia di una chat: sul disco di questo PC (`qui`), sul disco di un altro
 * PC come lo dice il suo battito (`disco`, 0.58.0), o caricata sul Drive da un PC.
 */
export type CopiaChat = { pc: string; dove: 'qui' | 'disco' | 'drive'; mtime?: number }

export type ChatIngresso = {
  sessione: string
  titolo: string
  cwd?: string
  progetto?: string
  copie: CopiaChat[]
  /** I PC dove è aperta adesso. */
  aperta?: string[]
}

export type ProgettoIngresso = { id: string; nome: string; percorsi: Record<string, string>; aggiuntoIl?: string; unitoIn?: string }

export type TipoProblema =
  | 'senza-casa' | 'due-case' | 'casa-sconosciuta' | 'casa-assente' | 'copia-piu-recente'
  | 'progetto-senza-casa' | 'progetto-diviso' | 'progetto-doppio'

export type Problema = { tipo: TipoProblema; titolo: string; spiega: string; cosaFare: string }

export type Residente = { pc: string; nome: string; fonte: FonteCasa; motivo: string; qui: boolean }

export type StatoRiga = 'residente' | 'solo-cloud' | 'conflitto'

export type RigaChat = {
  sessione: string
  titolo: string
  cwd?: string
  progetto?: string
  residente?: Residente
  copie: { pc: string; nome: string; dove: 'qui' | 'disco' | 'drive'; quando?: string }[]
  ultimoUso?: string
  stato: StatoRiga
  /** Questo PC ne ha una copia sul disco. */
  copiaQui: boolean
  /** Senza nome (0.60.0): fuori dagli elenchi principali, contata nel suo progetto. */
  senzaNome?: boolean
  problemi: Problema[]
}

export type RigaProgetto = {
  /** L'id principale del gruppo (0.60.0: stesso nome = stesso progetto). */
  id: string
  /** Tutti gli id del registro con questo nome (normalizzato), il principale per primo. */
  ids: string[]
  nome: string
  residente?: { pc: string; nome: string; qui: boolean }
  /** Il residente è una scelta per il progetto (0.58.0), non la maggioranza delle sue chat. */
  voluto: boolean
  /** I PC che hanno la cartella del progetto. */
  cartelle: { pc: string; nome: string; percorso: string }[]
  /** Questo PC ha la cartella. */
  cartellaQui: boolean
  /**
   * Una cartella di qui con il nome del progetto ma non registrata (0.60.0):
   * per esempio il SierraDeck su cui si lavora, registrato solo dal portatile.
   */
  cartellaTrovata?: string
  /** I workspace di questo PC con lo stesso nome (normalizzato). */
  workspace: string[]
  /** Quante copie da unire: id doppi, cartelle di qui in più, workspace doppi. */
  daUnire: number
  /** Le azioni da questo PC, con i loro testi (0.58.0, tappa 4). */
  azioni: AzioneProgetto[]
  chat: number
  /** Di cui senza nome: nascoste dagli elenchi, contate qui (0.60.0). */
  chatSenzaNome: number
  ultimoUso?: string
  stato: StatoRiga
  problemi: Problema[]
}

export type Pannello = {
  io: PcNoto
  pc: PcNoto[]
  chat: RigaChat[]
  progetti: RigaProgetto[]
  letto: string
  /** I PC il cui battito non dice ancora le copie locali: vanno aggiornati (0.58.0). */
  pcDaAggiornare: string[]
  /** Il piano di allineamento di questo PC (0.58.0, tappa 2): si mostra e basta. */
  piano?: PianoAllineamento
  /** «Rendi residente» con analisi e unione (0.60.0): le analisi in corso e i riassunti da confermare. */
  residenza?: StatoResidenza[]
  /** Le unioni fatte negli ultimi 30 giorni: «Annulla l’unione» (0.60.0). */
  unioni?: UnioneFatta[]
  /** Lo spazio sul Drive e le pulizie (0.65.0). Assente mentre la prima misura è in corso. */
  spazio?: StatoSpazio
  /** I traslochi (0.65.0): quelli che girano su questo PC e quelli chiesti da qui a un altro. */
  traslochi?: Trasloco[]
}

export type UnioneFatta = { id: string; progetto: string; nome: string; quando: string; destinazione: string; scadeIl: string }

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
  /** I nomi dei workspace di questo PC (0.60.0). */
  workspaceQui?: string[]
  /** Per gruppo (id principale): una cartella di qui trovata per nome, non registrata. */
  cartelleTrovate?: Record<string, string>
  /** Per gruppo: quante cartelle di qui con il nome del progetto stanno accanto a quelle registrate. */
  altreCartelleQui?: Record<string, number>
}): Pannello {
  const tutti = [p.io, ...p.pc.filter((x) => x.id !== p.io.id)]
  const nomeDi = (id: string): string => tutti.find((x) => x.id === id)?.nome ?? `PC ${id.slice(0, 6)}`
  const chat = p.chat.map((c) => rigaChat(c, p, nomeDi))
  // Stesso nome = stesso progetto (0.60.0): una riga per gruppo.
  const gruppi = raggruppaProgetti(p.progetti, p.case)
  const progetti = gruppi.map((g) => rigaProgetto(g, chat.filter((c) => c.progetto !== undefined && g.ids.includes(c.progetto)), p, nomeDi, p.case))
  // Le chat in ordine: prima le sbagliate, poi le più recenti.
  chat.sort((a, b) => (b.problemi.length > 0 ? 1 : 0) - (a.problemi.length > 0 ? 1 : 0) || (b.ultimoUso ?? '').localeCompare(a.ultimoUso ?? ''))
  progetti.sort((a, b) => (b.problemi.length > 0 ? 1 : 0) - (a.problemi.length > 0 ? 1 : 0) || a.nome.localeCompare(b.nome))
  return {
    io: p.io, pc: p.pc, chat, progetti, letto: new Date(p.adesso).toISOString(),
    pcDaAggiornare: p.pc.filter((x) => x.diceLocali === false).map((x) => x.nome)
  }
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
    ...(eSenzaNome(c.titolo, c.sessione) ? { senzaNome: true } : {}),
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

function rigaProgetto(
  g: GruppoProgetti, chat: RigaChat[],
  p: { io: PcNoto; adesso: number; workspaceQui?: string[]; cartelleTrovate?: Record<string, string>; altreCartelleQui?: Record<string, number> },
  nomeDi: (id: string) => string, cc: CaseChat
): RigaProgetto {
  const voluto = casaDelGruppo(cc, g.ids)
  const conta = new Map<string, number>()
  for (const c of chat) if (c.residente !== undefined) conta.set(c.residente.pc, (conta.get(c.residente.pc) ?? 0) + 1)
  const ordinati = [...conta.entries()].sort((a, b) => b[1] - a[1])
  const primo: [string, number] | undefined = voluto !== undefined ? [voluto.pc, conta.get(voluto.pc) ?? 0] : ordinati[0]
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
  const qui = g.percorsi.filter((x) => x.pc === p.io.id)
  const trovata = qui.length === 0 ? p.cartelleTrovate?.[g.id] : undefined
  const workspace = workspaceDelGruppo(p.workspaceQui ?? [], g)
  // Le cartelle di qui: registrate, più quelle con lo stesso nome trovate dalle chat.
  const cartelleQui = qui.length + (p.altreCartelleQui?.[g.id] ?? 0)
  const daUnire = (g.ids.length - 1) + Math.max(0, cartelleQui - 1) + Math.max(0, workspace.length - 1)
  if (g.ids.length > 1) {
    problemi.push({
      tipo: 'progetto-doppio',
      titolo: `Registrato ${g.ids.length} volte`,
      spiega: `Lo stesso progetto («${g.nome}», stesso nome) è nel registro del Drive con ${g.ids.length} id diversi${qui.length > 1 ? `, e qui ha ${qui.length} cartelle (${qui.map((x) => x.percorso).join(', ')})` : ''}: sono nati salvando lo stesso progetto da PC diversi. Qui li vedi come uno solo.`,
      cosaFare: '«Rendi residente qui» (dal PC dove vuoi che viva) li unisce davvero: raccoglie tutte le copie, ti mostra cosa unisce, cosa tiene e cosa va in recupero, e fa solo dopo la tua conferma.'
    })
  }
  const residenteHa = primo !== undefined && g.percorsi.some((x) => x.pc === primo[0])
  const riga: RigaProgetto = {
    id: g.id, ids: g.ids, nome: g.nome,
    ...(primo !== undefined ? { residente: { pc: primo[0], nome: voluto?.pcNome ?? nomeDi(primo[0]), qui: primo[0] === p.io.id } } : {}),
    voluto: voluto !== undefined,
    cartelle: g.percorsi.map((x) => ({ pc: x.pc, nome: nomeDi(x.pc), percorso: x.percorso })),
    cartellaQui: qui.length > 0 || trovata !== undefined,
    ...(trovata !== undefined ? { cartellaTrovata: trovata } : {}),
    workspace,
    daUnire,
    chat: chat.length,
    chatSenzaNome: chat.filter((c) => c.senzaNome === true).length,
    ...(ultimo !== undefined && ultimo !== '' ? { ultimoUso: ultimo } : {}),
    stato: conflitto ? 'conflitto' : residenteHa || (primo?.[0] === p.io.id && trovata !== undefined) ? 'residente' : 'solo-cloud',
    problemi,
    azioni: []
  }
  return { ...riga, azioni: azioniProgetto(riga, p.io) }
}

export type FiltroPannello = 'tutti' | 'sbagliati' | 'questo-pc' | 'solo-cloud'

/**
 * Le righe di un filtro e di una ricerca (titolo, cartella, PC). Le chat
 * senza nome non ci sono (0.60.0), salvo con `senzaNome`: «mostra anche le senza nome».
 */
export function filtraChat(righe: RigaChat[], filtro: FiltroPannello, q = '', senzaNome = false): RigaChat[] {
  const parole = q.toLowerCase().split(/\s+/).filter((x) => x !== '')
  return righe.filter((r) => {
    if (!senzaNome && r.senzaNome === true) return false
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
    `Se la casa era su questo PC, prima di cambiarla salvo sul Drive, così ${verso} trova la copia più avanti.`,
    ...(p.cosa === 'progetto' && p.verso.pc !== p.io ? [`Le copie con lo stesso nome non si uniscono da qui: per unirle (file, chat, note, workspace, con riassunto e conferma) usa «Rendi residente qui» su ${verso}, dal suo pannello o dal telefono scegliendo quel PC.`] : []),
    ...(p.cosa === 'progetto' ? [`Il progetto diventa «residente su ${verso}, solo cloud sugli altri PC»: ${verso}, se non ce l’ha, lo porta giù dal Drive da solo quando la cartella non c’è (senza sovrascrivere niente); gli altri PC lo mettono nel loro piano come «da rendere solo cloud», ma non lo tolgono finché un controllo non ha recuperato quello che c’è solo lì e tu non hai confermato.`] : [])
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

/* ------------------------------------------------------------------ */
/* L'elenco dei progetti su ogni PC e le loro azioni (0.58.0, tappa 4). */
/* ------------------------------------------------------------------ */

export type IdAzioneProgetto = 'apri' | 'porta-qui' | 'residente-qui' | 'solo-cloud-qui'

/** Le azioni del riassunto di «Rendi residente» (0.60.0), dal pannello, dalla pagina e dall'app. */
export type IdAzioneResidenza = 'conferma-residenza' | 'annulla-residenza' | 'annulla-unione'

/**
 * Un'azione su un progetto, con i testi già scritti dal PC: il pannello, la
 * pagina e l'app li mostrano uguali. `conferma` = chiede prima di fare.
 */
export type AzioneProgetto = { id: IdAzioneProgetto; titolo: string; testo: string; conferma?: string }

/** Le azioni possibili di un progetto da questo PC, con cosa fanno e cosa no. */
export function azioniProgetto(r: RigaProgetto, io: PcNoto): AzioneProgetto[] {
  const fuori: AzioneProgetto[] = []
  const residente = r.residente?.nome ?? 'nessun PC'
  if (r.cartellaQui) {
    fuori.push({ id: 'apri', titolo: 'Apri', testo: `Apre una chat nuova nella cartella del progetto su questo PC (${io.nome})${r.cartellaTrovata !== undefined ? `: ${r.cartellaTrovata}` : ''}.` })
  } else {
    fuori.push({
      id: 'porta-qui', titolo: 'Porta qui',
      testo: `Scarica dal Drive il progetto «${r.nome}» su questo PC: le chat e i file salvati. Non sovrascrive niente: se qui ci sono file con lo stesso nome restano, e quelli del Drive arrivano accanto. Non cambia il residente.`,
      conferma: 'Porta qui il progetto'
    })
  }
  // «Rendi residente qui» (0.60.0): prima l'analisi di tutte le copie e un
  // riassunto, poi l'unione solo con la conferma. Resta anche quando questo
  // PC è già il residente ma ci sono copie da unire.
  if (r.residente?.qui !== true || r.daUnire > 0) {
    const gia = r.residente?.qui === true
    fuori.push({
      id: 'residente-qui', titolo: gia ? 'Unisci qui le copie' : 'Rendi residente qui',
      testo: `${gia ? `Questo PC (${io.nome}) è già il residente di «${r.nome}», ma ci sono copie da unire.` : `Questo PC (${io.nome}) diventa il residente di «${r.nome}» (adesso è ${residente}).`} Un passaggio solo, automatico (0.65.0): gli altri PC salvano la loro copia sul Drive; confronto tutte le copie per impronta${r.ids.length > 1 ? ` (registrato ${r.ids.length} volte)` : ''}; unisco qui i file che mancano, le chat${r.workspace.length > 1 ? ` e i workspace ${r.workspace.map((w) => `«${w}»`).join(', ')} in uno` : ''}, con le versioni diverse nei recuperati; solo alla fine le copie vecchie vanno nel recupero dei loro PC, dopo aver copiato qui quello che c’era solo là. Lo segui passo per passo; se un PC non risponde mi fermo e riprendo da lì. Niente si cancella: «Annulla tutto» per 30 giorni.`,
      conferma: 'Conferma: trasloca qui'
    })
  }
  if (r.cartellaQui && r.residente !== undefined && r.residente.qui !== true) {
    fuori.push({
      id: 'solo-cloud-qui', titolo: 'Rendi solo cloud qui',
      testo: `Toglie «${r.nome}» da questo PC, in sicurezza: ${residente} (il residente) confronta i file e le chat di qui con i suoi, copia da lui, nella sua cartella .sierradeck/recuperati, quello che c’è solo qui o è più nuovo, e ti mostra il riassunto. Solo con la tua conferma la cartella di qui va nella cartella di recupero di SierraDeck, per 30 giorni, e «Ripristina» la rimette dov’era. Se ${residente} non si raggiunge, non si toglie niente.`,
      conferma: 'Confronta e prepara il riassunto'
    })
  }
  return fuori
}
