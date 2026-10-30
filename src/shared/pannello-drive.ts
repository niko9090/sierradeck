import type { VistaProgetto } from './progetti-vista'
import { eSessioneInterna } from './workspace-riparazioni'
import type { StatoSpazio } from './spazio-drive'
import { dentroCartella, eNomeDiSistema, eSenzaNome } from './progetti-unificati'
import type { VistaSposta } from './sposta'

/**
 * Il pannello dei progetti e delle chat (0.58.0; modello semplice dalla 0.88.0).
 *
 * **Un progetto, un PC**: ogni progetto ha un proprietario, l'unico PC con la
 * sua cartella; il Drive ne tiene la copia di sicurezza. Dagli altri PC il
 * progetto si apre dal vivo sul proprietario («su <PC>»), e si porta qui solo
 * con «Sposta su questo PC». Le chat sono del proprietario del loro progetto.
 *
 * Le regole stanno qui, pure: le usano il pannello del PC, la pagina e l'app
 * (ricevono il risultato già calcolato dal PC).
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
  /** I PC dove sta lavorando adesso (0.69.0): aperta e non ferma ad aspettare. */
  alLavoro?: string[]
}

export type ProgettoIngresso = { id: string; nome: string; proprietario?: string; percorso?: string; aggiuntoIl?: string }

export type TipoProblema = 'progetto-senza-casa' | 'casa-sconosciuta' | 'casa-assente'

export type Problema = { tipo: TipoProblema; titolo: string; spiega: string; cosaFare: string }

/** Il PC dove vive: per un progetto il proprietario, per una chat il proprietario del suo progetto. */
export type Residente = { pc: string; nome: string; qui: boolean }

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
  /** Sta lavorando adesso (0.69.0), e su quali PC. */
  alLavoroSu?: string[]
  problemi: Problema[]
}

/**
 * Lo spazio sul Drive di ogni riga (0.69.0), sommando tutti i suoi id, con i
 * file grandi come avviso. Lo calcola il PC; pagina e app lo mostrano.
 */
export function conSpazioDrive<R extends { ids: string[] }>(righe: R[], perProgetto: Record<string, { file: number; byte: number; grandi: { percorso: string; byte: number }[] }> | undefined): Array<R & { spazioDrive?: { byte: number; file: number; grandi: { percorso: string; byte: number }[] } }> {
  if (perProgetto === undefined) return righe
  return righe.map((r) => {
    const parti = r.ids.map((id) => perProgetto[id]).filter((x): x is NonNullable<typeof x> => x !== undefined)
    if (parti.length === 0) return r
    return { ...r, spazioDrive: { byte: parti.reduce((t, x) => t + x.byte, 0), file: parti.reduce((t, x) => t + x.file, 0), grandi: parti.flatMap((x) => x.grandi).sort((a, b) => b.byte - a.byte).slice(0, 5) } }
  })
}

export type RigaProgetto = {
  /** Lo spazio sul Drive (0.69.0), dal PC; con i file grandi come avviso. */
  spazioDrive?: { byte: number; file: number; grandi: { percorso: string; byte: number }[] }
  id: string
  /** Gli id del progetto: uno solo dalla 0.88.0 (i doppioni li ha uniti la migrazione). */
  ids: string[]
  nome: string
  /** Il proprietario. */
  residente?: Residente
  /** Sempre vero dalla 0.88.0: il proprietario è una scelta, non una maggioranza. */
  voluto: boolean
  /** La cartella sul proprietario (una sola). */
  cartelle: { pc: string; nome: string; percorso: string }[]
  /** Questo PC è il proprietario (ha la cartella). */
  cartellaQui: boolean
  cartellaTrovata?: string
  /** I workspace di questo PC con lo stesso nome. */
  workspace: string[]
  /** Copie da unire: zero dalla 0.88.0. */
  daUnire: number
  /** Il proprietario risponde adesso (battito recente). */
  proprietarioAcceso?: boolean
  /** Le azioni da questo PC, con i loro testi. */
  azioni: AzioneProgetto[]
  chat: number
  /** Di cui senza nome: nascoste dagli elenchi, contate qui (0.60.0). */
  chatSenzaNome: number
  ultimoUso?: string
  stato: StatoRiga
  problemi: Problema[]
  /** Le chat con nome che lavorano adesso (0.69.0). */
  alLavoro?: number
  /** Come si mostra (0.69.0): lo calcola il PC, pagina e app lo disegnano. Vedi `@shared/progetti-vista`. */
  vista?: VistaProgetto
}

export type Pannello = {
  io: PcNoto
  pc: PcNoto[]
  chat: RigaChat[]
  progetti: RigaProgetto[]
  letto: string
  /** I PC il cui battito non dice ancora le copie locali: vanno aggiornati (0.58.0). */
  pcDaAggiornare: string[]
  /** Lo spazio sul Drive e le pulizie (0.65.0). Assente mentre la prima misura è in corso. */
  spazio?: StatoSpazio
  /** «Sposta su questo PC» in corso o appena finito (0.88.0). */
  sposta?: VistaSposta
}

/** Oltre questo un PC senza battito si considera assente. */
export const ASSENTE_DOPO_MS = 30 * 86_400_000
/** Un PC si dice acceso se il suo ultimo battito è più recente di così. */
export const ACCESO_ENTRO_MS = 5 * 60_000

const iso = (ms: number | undefined): string | undefined => (ms === undefined || !Number.isFinite(ms) ? undefined : new Date(ms).toISOString())
const giorni = (ms: number): number => Math.floor(ms / 86_400_000)
const norma = (p: string): string => p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
const dentro = (cwd: string, radice: string): boolean => norma(cwd) === norma(radice) || norma(cwd).startsWith(`${norma(radice)}\\`)

/** Il progetto della cartella di una chat (sul suo proprietario). */
export function progettoDellaChat(cwd: string | undefined, progetti: ProgettoIngresso[]): ProgettoIngresso | undefined {
  if (cwd === undefined) return undefined
  // La cartella più lunga vince: un progetto dentro un altro.
  return progetti
    .filter((p) => p.percorso !== undefined && dentro(cwd, p.percorso))
    .sort((a, b) => (b.percorso?.length ?? 0) - (a.percorso?.length ?? 0))[0]
}

export function costruisciPannello(p: {
  io: PcNoto
  pc: PcNoto[]
  chat: ChatIngresso[]
  progetti: ProgettoIngresso[]
  adesso: number
  /** I nomi dei workspace di questo PC (0.60.0). */
  workspaceQui?: string[]
  sposta?: VistaSposta
}): Pannello {
  const tutti = [p.io, ...p.pc.filter((x) => x.id !== p.io.id)]
  const nomeDi = (id: string): string => tutti.find((x) => x.id === id)?.nome ?? `PC ${id.slice(0, 6)}`
  // Un progetto con il nome di una cartella di sistema non si mostra (0.67.4).
  const progettiVisti = p.progetti.filter((x) => !eNomeDiSistema(x.nome))
  const chat = p.chat.map((c) => rigaChat(c, progettiVisti, p, nomeDi))
  const progetti = progettiVisti.map((g) => rigaProgetto(g, chat.filter((c) => c.progetto === g.id), p, nomeDi))
  chat.sort((a, b) => (b.ultimoUso ?? '').localeCompare(a.ultimoUso ?? ''))
  progetti.sort((a, b) => (b.problemi.length > 0 ? 1 : 0) - (a.problemi.length > 0 ? 1 : 0) || a.nome.localeCompare(b.nome))
  return {
    io: p.io, pc: p.pc, chat, progetti, letto: new Date(p.adesso).toISOString(),
    pcDaAggiornare: p.pc.filter((x) => x.diceLocali === false).map((x) => x.nome),
    ...(p.sposta !== undefined ? { sposta: p.sposta } : {})
  }
}

function rigaChat(c: ChatIngresso, progetti: ProgettoIngresso[], p: { io: PcNoto }, nomeDi: (id: string) => string): RigaChat {
  const progetto = c.progetto !== undefined ? progetti.find((x) => x.id === c.progetto) : progettoDellaChat(c.cwd, progetti)
  // Una chat è del proprietario del suo progetto; fuori dai progetti, del PC dove sta sul disco.
  const casa = progetto?.proprietario
    ?? (c.copie.some((x) => x.dove === 'qui') ? p.io.id : c.copie.find((x) => x.dove === 'disco')?.pc ?? c.copie.find((x) => x.dove === 'drive')?.pc)
  const residente: Residente | undefined = casa === undefined || casa === '' ? undefined : { pc: casa, nome: nomeDi(casa), qui: casa === p.io.id }
  const copie = c.copie.map((x) => ({ pc: x.pc, nome: nomeDi(x.pc), dove: x.dove, ...(iso(x.mtime) !== undefined ? { quando: iso(x.mtime) as string } : {}) }))
  const ultimo = Math.max(0, ...c.copie.map((x) => x.mtime ?? 0))
  return {
    sessione: c.sessione, titolo: c.titolo,
    ...(c.cwd !== undefined ? { cwd: c.cwd } : {}), ...(progetto !== undefined ? { progetto: progetto.id } : {}),
    ...(residente !== undefined ? { residente } : {}),
    copie,
    ...(ultimo > 0 ? { ultimoUso: iso(ultimo) as string } : {}),
    stato: residente !== undefined && c.copie.some((x) => x.pc === residente.pc) ? 'residente' : 'solo-cloud',
    copiaQui: c.copie.some((x) => x.dove === 'qui'),
    ...(c.alLavoro !== undefined && c.alLavoro.length > 0 ? { alLavoroSu: c.alLavoro.map(nomeDi) } : {}),
    // Le sessioni interne degli autopiloti (0.67.3) non sono chat da elencare né da aprire.
    ...(eSenzaNome(c.titolo, c.sessione) || eSessioneInterna({ titolo: c.titolo }, new Set()) ? { senzaNome: true } : {}),
    problemi: []
  }
}

/** I problemi di un progetto: senza proprietario, o con un proprietario che non c'è. */
export function problemiProgetto(g: ProgettoIngresso, p: { io: PcNoto; pc: PcNoto[]; adesso: number }, nomeDi: (id: string) => string): Problema[] {
  if (g.proprietario === undefined) {
    return [{
      tipo: 'progetto-senza-casa', titolo: 'Senza proprietario',
      spiega: 'Nessun PC risulta proprietario: la sistemazione del primo avvio non l’ha ancora assegnato (il suo PC non si è ancora fatto vivo sul Drive).',
      cosaFare: 'Accendi il PC dove sta il progetto con SierraDeck aggiornato: al primo avvio lo assegna.'
    }]
  }
  if (g.proprietario === p.io.id) return []
  const pc = p.pc.find((x) => x.id === g.proprietario)
  if (pc === undefined) {
    return [{
      tipo: 'casa-sconosciuta', titolo: 'Proprietario sconosciuto',
      spiega: `Il proprietario (${nomeDi(g.proprietario)}) non ha mai lasciato un battito sul Drive: forse è stato reinstallato con un’identità nuova.`,
      cosaFare: 'Se il progetto è sul Drive, «Sposta su questo PC» lo porta qui.'
    }]
  }
  if (pc.battito !== undefined && p.adesso - Date.parse(pc.battito) > ASSENTE_DOPO_MS) {
    return [{
      tipo: 'casa-assente', titolo: `Proprietario assente da ${giorni(p.adesso - Date.parse(pc.battito))} giorni`,
      spiega: `${pc.nome} non si fa vivo sul Drive da più di 30 giorni: il progetto si apre solo dal vivo su di lui, e non risponde.`,
      cosaFare: 'Se non usi più quel PC, «Sposta su questo PC» porta qui il progetto dal Drive (la richiesta aspetta nella sua posta).'
    }]
  }
  return []
}

function rigaProgetto(
  g: ProgettoIngresso, chat: RigaChat[],
  p: { io: PcNoto; pc: PcNoto[]; adesso: number; workspaceQui?: string[] },
  nomeDi: (id: string) => string
): RigaProgetto {
  const qui = g.proprietario !== undefined && g.proprietario === p.io.id
  const residente: Residente | undefined = g.proprietario === undefined ? undefined : { pc: g.proprietario, nome: nomeDi(g.proprietario), qui }
  const battito = p.pc.find((x) => x.id === g.proprietario)?.battito
  const acceso = qui || (battito !== undefined && p.adesso - Date.parse(battito) < ACCESO_ENTRO_MS)
  const ultimo = chat.map((c) => c.ultimoUso ?? '').sort().pop()
  const workspace = (p.workspaceQui ?? []).filter((w) => w.trim().toLowerCase() === g.nome.trim().toLowerCase())
  const riga: RigaProgetto = {
    id: g.id, ids: [g.id], nome: g.nome,
    ...(residente !== undefined ? { residente } : {}),
    voluto: true,
    cartelle: g.proprietario !== undefined && g.percorso !== undefined ? [{ pc: g.proprietario, nome: nomeDi(g.proprietario), percorso: g.percorso }] : [],
    cartellaQui: qui && g.percorso !== undefined,
    workspace,
    daUnire: 0,
    proprietarioAcceso: acceso,
    chat: chat.length,
    chatSenzaNome: chat.filter((c) => c.senzaNome === true).length,
    alLavoro: chat.filter((c) => c.senzaNome !== true && (c.alLavoroSu?.length ?? 0) > 0).length,
    ...(ultimo !== undefined && ultimo !== '' ? { ultimoUso: ultimo } : {}),
    stato: residente !== undefined ? 'residente' : 'solo-cloud',
    problemi: problemiProgetto(g, p, nomeDi),
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

/* ------------------------------------------------------------------ */
/* Le azioni di un progetto da questo PC.                              */
/* ------------------------------------------------------------------ */

export type IdAzioneProgetto = 'apri' | 'apri-remoto' | 'sposta-qui'

/**
 * Un'azione su un progetto, con i testi già scritti dal PC: il pannello, la
 * pagina e l'app li mostrano uguali. `conferma` = chiede prima di fare.
 */
export type AzioneProgetto = { id: IdAzioneProgetto; titolo: string; testo: string; conferma?: string }

/**
 * Le azioni (0.88.0), poche e chiare:
 * - sul proprietario, «Apri»: una chat nuova nella cartella del progetto;
 * - sugli altri PC, «Apri su <PC>»: una chat nella cartella là, dal vivo;
 *   e «Sposta su questo PC»: il progetto cambia proprietario (vedi `sposta.ts`).
 */
export function azioniProgetto(r: RigaProgetto, io: PcNoto): AzioneProgetto[] {
  if (r.residente === undefined) return []
  if (r.residente.qui) {
    return r.cartellaQui ? [{ id: 'apri', titolo: 'Apri', testo: `Una chat nuova nella cartella del progetto su questo PC${r.cartelle[0] !== undefined ? ` (${r.cartelle[0].percorso})` : ''}.` }] : []
  }
  const la = r.residente.nome
  return [
    { id: 'apri-remoto', titolo: `Apri su ${la}`, testo: `Il progetto vive su ${la}: una chat nella sua cartella là, che guardi e usi da qui dal vivo. Se ${la} è spento, quello che scrivi aspetta nella sua posta.` },
    {
      id: 'sposta-qui', titolo: 'Sposta su questo PC',
      testo: `«${r.nome}» diventa di ${io.nome}. ${la} ferma le chat del progetto e carica tutto sul Drive; questo PC scarica file e chat, controlla le impronte, e solo allora il progetto cambia PC. La copia di ${la} va nel recupero per 30 giorni.`,
      conferma: `Sposta su ${io.nome}`
    }
  ]
}

/* ------------------------------------------------------------------ */
/* Le chat di un progetto, e come si aprono (0.67.0).                  */
/* ------------------------------------------------------------------ */

/** Le chat di un progetto, con nome, le più recenti prima. */
export function chatDelProgetto(chat: RigaChat[], r: { ids: string[] }): RigaChat[] {
  return chat
    .filter((c) => c.progetto !== undefined && r.ids.includes(c.progetto) && c.senzaNome !== true)
    .sort((a, b) => (b.ultimoUso ?? '').localeCompare(a.ultimoUso ?? ''))
}

/**
 * Come si apre una chat dal pannello (0.67.0): qui, se vive qui; altrimenti
 * dal vivo sul PC dove vive, nella sua cartella di là.
 */
export function comeAprireChat(c: RigaChat, r: { cartelle: { pc: string; percorso: string }[] } | undefined): { tipo: 'qui'; cwd: string } | { tipo: 'altrove'; pc: string; nome: string; cwd: string } | undefined {
  const res = c.residente
  if (res === undefined || res.qui) return c.cwd !== undefined && (res !== undefined || c.copiaQui) ? { tipo: 'qui', cwd: c.cwd } : undefined
  // La cartella là: quella della chat se sta dentro la cartella del progetto
  // sul suo PC; se no (una copia di prima, altrove) quella del progetto.
  const la = r?.cartelle.find((x) => x.pc === res.pc)?.percorso
  const dentro = c.cwd !== undefined && la !== undefined && dentroCartella(c.cwd, la)
  const cwd = dentro || la === undefined ? c.cwd : la
  return cwd === undefined ? undefined : { tipo: 'altrove', pc: res.pc, nome: res.nome, cwd }
}
