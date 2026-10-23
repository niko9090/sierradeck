import type { Autopilota, ChatGovernata } from './autopilota'
import type { SegnaleChat } from './segnali-flotta'

/**
 * **Le chat riferiscono sempre all'autopilota** (0.85.1).
 *
 * Nicholas, 23/10 sera: «le chat devono SEMPRE interfacciarsi con te, tu
 * dovresti sempre sapere cosa succede e perché». Il segnale di fine turno
 * (`segnali-flotta`) arriva una volta per turno, e un turno può durare
 * un'ora: in mezzo l'autopilota non sapeva niente. Adesso la chat scrive un
 * **rapporto breve a ogni passo**, una riga `RAPPORTO: …` nel suo testo:
 * partita, piano, passo fatto, provo, bloccata perché, mi serve, finita con
 * commit e test. Il servizio la legge dalla trascrizione a ogni strumento
 * usato (hook `PostToolUse`) e a fine turno, e tiene **l'ultimo** sulla chat
 * (`ChatGovernata.rapporto`), nel file dell'autopilota.
 *
 * Da qui nasce anche il **quadro per chat** (compito, ultimo passo, ultimo
 * segnale vero e da quanto, motivo se è ferma), lo stesso nel prompt delle
 * risposte dalla scheda e nel «?» dell'indicatore su PC, pagina e app.
 *
 * Funzioni pure, uguali per il servizio, la pagina e l'app.
 */

export type TipoRapporto = 'partita' | 'piano' | 'passo' | 'provo' | 'bloccata' | 'serve' | 'finita'

export type RapportoChat = {
  tipo: TipoRapporto
  /** Una riga: cosa ha fatto, cosa prova, perché è bloccata, cosa le serve. */
  testo: string
  /** ISO: quando il servizio l'ha letto. */
  quando: string
  /** Scritto dalla chat con la riga `RAPPORTO:`; falso = dedotto dal segnale di fine turno. */
  dichiarato: boolean
}

const TIPI: readonly TipoRapporto[] = ['partita', 'piano', 'passo', 'provo', 'bloccata', 'serve', 'finita']
/** Oltre così un rapporto non è più breve: si taglia. */
export const RAPPORTO_MAX = 240

/** La regola che la chat riceve nel primo messaggio, prima di quella del segnale. */
export const REGOLA_RAPPORTO = [
  'A ogni passo scrivi all’autopilota un rapporto breve, una riga sola che comincia con RAPPORTO: nel tuo testo (non serve chiudere il turno):',
  'RAPPORTO: partita — cosa hai capito del compito',
  'RAPPORTO: piano — i passi che farai, in breve',
  'RAPPORTO: passo fatto — cosa hai appena finito',
  'RAPPORTO: provo — cosa stai provando (test, compilazione, misura)',
  'RAPPORTO: bloccata perché — il motivo',
  'RAPPORTO: mi serve — cosa ti serve per andare avanti',
  'RAPPORTO: finita — il commit e i test che passano',
  'Fermarsi senza motivo non è ammesso: se ti fermi, il rapporto dice perché. Se l’autopilota ti chiede «dimmi il punto», rispondi subito con un RAPPORTO.'
]

const pulisci = (r: string): string => r.replace(/^[*_`>\s•-]+|[*_`\s]+$/g, '').trim()

const RIGA = /^RAPPORTO[*_`\s]*:[*_`\s]*(partit[ao]|parto|piano|passo(?:\s+fatto)?|fatto|provo|sto\s+provando|bloccat[ao](?:\s+perch[eé])?|mi\s+serve|serve|finit[ao])(?![\p{L}\d])\s*(.*)$/iu

function tipoDa(parola: string): TipoRapporto {
  const p = parola.toLowerCase()
  if (p.startsWith('part')) return 'partita'
  if (p === 'piano') return 'piano'
  if (p.startsWith('passo') || p === 'fatto') return 'passo'
  if (p === 'provo' || p.startsWith('sto')) return 'provo'
  if (p.startsWith('bloccat')) return 'bloccata'
  if (p.includes('serve')) return 'serve'
  return 'finita'
}

/** L'ultima riga `RAPPORTO: …` di un testo, letta; `undefined` se non ce n'è. */
export function rigaRapporto(testo: string): Omit<RapportoChat, 'quando'> | undefined {
  const righe = testo.split(/\r?\n/).map(pulisci)
  for (let i = righe.length - 1; i >= 0; i -= 1) {
    const m = RIGA.exec(righe[i] ?? '')
    if (m === null) continue
    const tipo = tipoDa(m[1] ?? '')
    const resto = (m[2] ?? '').replace(/^[\s—–:,-]+/, '').trim()
    const vuoto = tipo === 'bloccata' ? 'non ha detto il motivo' : tipo === 'serve' ? 'non ha detto cosa' : ''
    return { tipo, testo: (resto !== '' ? resto : vuoto).slice(0, RAPPORTO_MAX), dichiarato: true }
  }
  return undefined
}

/**
 * Il rapporto di fine turno: la riga `RAPPORTO:` del messaggio se c'è; se no
 * quello che dice il segnale (fatto → finita, bloccata, aspetto → mi serve,
 * avanti → passo), segnato come dedotto.
 */
export function rapportoDiFineTurno(messaggio: string, segnale: SegnaleChat | undefined, quando: string): RapportoChat | undefined {
  const r = rigaRapporto(messaggio)
  if (r !== undefined) return { ...r, quando }
  if (segnale === undefined) return undefined
  const dichiarato = segnale.dichiarato
  switch (segnale.tipo) {
    case 'parto': return { tipo: 'partita', testo: segnale.motivo ?? '', quando, dichiarato }
    case 'avanti': return { tipo: 'passo', testo: segnale.motivo ?? 'turno chiuso, va avanti', quando, dichiarato }
    case 'fatto': return { tipo: 'finita', testo: segnale.motivo ?? 'dice di aver finito', quando, dichiarato }
    case 'bloccata': return { tipo: 'bloccata', testo: segnale.motivo ?? 'non ha detto il motivo', quando, dichiarato }
    case 'aspetto': return { tipo: 'serve', testo: segnale.di !== undefined ? `aspetta la chat ${segnale.di}` : (segnale.cosa ?? 'non ha detto cosa'), quando, dichiarato }
  }
}

/** Il rapporto letto dall'archivio su disco: una forma sconosciuta non c'è. */
export function leggiRapportoChat(x: unknown): RapportoChat | undefined {
  if (typeof x !== 'object' || x === null) return undefined
  const o = x as Record<string, unknown>
  if (!(TIPI as readonly unknown[]).includes(o.tipo) || typeof o.quando !== 'string' || typeof o.testo !== 'string') return undefined
  return { tipo: o.tipo as TipoRapporto, testo: o.testo.slice(0, RAPPORTO_MAX), quando: o.quando, dichiarato: o.dichiarato === true }
}

/** Il rapporto è nuovo (da scrivere nel diario una volta sola). */
export function rapportoNuovo(prima: RapportoChat | undefined, dopo: RapportoChat): boolean {
  return prima === undefined || prima.tipo !== dopo.tipo || prima.testo !== dopo.testo
}

const PAROLA: Record<TipoRapporto, string> = {
  partita: 'partita', piano: 'piano', passo: 'passo fatto', provo: 'prova', bloccata: 'bloccata', serve: 'le serve', finita: 'finita'
}

/** Il rapporto in parole: «passo fatto: scritto il test». */
export function parolaRapporto(r: RapportoChat): string {
  return r.testo !== '' ? `${PAROLA[r.tipo]}: ${r.testo}` : PAROLA[r.tipo]
}

// ─── Il quadro per chat ─────────────────────────────────────────────────────

/** L'ultimo segnale vero di una chat (commit, test, file, terminale), come lo tiene il servizio. */
export type SegnoVero = { tipo: string; quando: string }

const PAROLA_VERO: Record<string, string> = { commit: 'commit', test: 'test', file: 'file cambiati', terminale: 'terminale' }

function fa(quando: string | undefined, ora: number): string | undefined {
  const t = Date.parse(quando ?? '')
  if (Number.isNaN(t)) return undefined
  const min = Math.max(0, Math.round((ora - t) / 60_000))
  return min < 1 ? 'adesso' : min < 60 ? `${min} min fa` : min < 48 * 60 ? `${Math.round(min / 60)} h fa` : `${Math.round(min / 1440)} giorni fa`
}

export type QuadroChat = {
  id: string
  ruolo?: string
  compito: string
  /** L'ultimo passo che ha riferito (o, senza rapporti, l'ultima cosa detta a fine turno). */
  passo: string
  /** L'ultimo segnale vero e da quanto: «commit 3 min fa», o «nessuno». */
  vero: string
  /** Il motivo, se è ferma; assente se lavora. */
  ferma?: string
}

/** Il quadro di una chat; `vero` è il suo ultimo segnale vero, se il servizio ne ha uno. */
export function quadroDellaChat(c: ChatGovernata, ora: number, vero?: SegnoVero): QuadroChat {
  // Senza rapporti (una chat partita prima della 0.85.1) vale il segnale di fine turno, dedotto.
  const r = c.rapporto ?? (c.segnale !== undefined && c.segnale.tipo !== 'parto' ? rapportoDiFineTurno('', { ...c.segnale, dichiarato: false }, c.segnale.quando) : undefined)
  const passoDa = (): string => {
    if (r !== undefined) return `${parolaRapporto(r)}${fa(r.quando, ora) !== undefined ? ` (${fa(r.quando, ora)})` : ''}${r.dichiarato ? '' : ', dedotto dal segnale'}`
    if (c.ultimaAzione !== undefined) return `a fine turno: ${c.ultimaAzione.slice(0, 160)}`
    return 'non ha ancora riferito niente'
  }
  const veroDa = (): string => {
    if (vero === undefined) return 'nessuno ancora'
    const quanto = fa(vero.quando, ora)
    return `${PAROLA_VERO[vero.tipo] ?? vero.tipo}${quanto !== undefined ? ` ${quanto}` : ''}`
  }
  const fermaDa = (): string | undefined => {
    if (c.stato === 'finita') return c.conclusa !== undefined ? `chiusa, ramo ${c.conclusa.come === 'unito' ? 'unito' : 'tolto'}` : 'chiusa'
    if (c.stato === 'bloccata') return 'aspetta una risposta di Nicholas'
    if (c.stato === 'pausa') return 'in pausa per i limiti del piano'
    if (r?.tipo === 'bloccata') return `bloccata: ${r.testo}`
    if (r?.tipo === 'serve') return `le serve: ${r.testo}`
    if (c.segnale?.tipo === 'bloccata') return `bloccata: ${c.segnale.motivo ?? 'non ha detto il motivo'}`
    if (c.segnale?.tipo === 'aspetto') return c.segnale.di !== undefined ? `aspetta la chat ${c.segnale.di}` : `aspetta: ${c.segnale.cosa ?? 'non ha detto cosa'}`
    if (c.segnale?.tipo === 'fatto' || r?.tipo === 'finita') return 'dice di aver finito: da controllare e chiudere'
    if (c.ripresa !== undefined) return `muta: richiamata con «dimmi il punto» ${fa(c.ripresa.il, ora) ?? ''}`.trim()
    return undefined
  }
  const ferma = fermaDa()
  return {
    id: c.id,
    ...(c.ruolo !== undefined ? { ruolo: c.ruolo } : {}),
    compito: c.compito,
    passo: passoDa(),
    vero: veroDa(),
    ...(ferma !== undefined ? { ferma } : {})
  }
}

/** Il quadro in una riga, per il «?» dell'indicatore e per il prompt. */
export function rigaQuadro(q: QuadroChat, compitoMax = 80): string {
  const compito = q.compito.length > compitoMax ? `${q.compito.slice(0, compitoMax - 1)}…` : q.compito
  return `${q.id}${q.ruolo !== undefined ? ` (${q.ruolo})` : ''} — compito: ${compito} · ultimo passo: ${q.passo} · ultimo segnale vero: ${q.vero}${q.ferma !== undefined ? ` · ferma: ${q.ferma}` : ''}`
}

/**
 * Il quadro intero per il prompt delle risposte dalla scheda: ogni chat aperta,
 * con compito, ultimo passo, ultimo segnale vero e motivo se è ferma. Le
 * chiuse si contano e basta.
 */
export function righeQuadroChat(a: Autopilota & { segniVeri?: Record<string, SegnoVero> }, ora: number): string[] {
  if (a.chats.length === 0) return []
  const aperte = a.chats.filter((c) => c.stato !== 'finita')
  const righe = ['', '## Le tue chat, una per una (il quadro intero)']
  for (const c of aperte) righe.push(`- ${rigaQuadro(quadroDellaChat(c, ora, a.segniVeri?.[c.id]), 200)}`)
  const chiuse = a.chats.length - aperte.length
  if (aperte.length === 0) righe.push('- Nessuna chat aperta.')
  if (chiuse > 0) righe.push(`- Chiuse: ${chiuse}.`)
  righe.push('Rispondi da questo quadro: per ogni chat sai cosa fa, l’ultimo passo e perché è ferma. «Ultimo segnale vero» viene dai fatti (commit, test, file), non da quello che la chat dice di sé.')
  return righe
}
