/**
 * **Controllo e coordinazione** (0.84.0).
 *
 * Nicholas (21/10): ogni chat manda all'autopilota un segnale breve — parto,
 * fatto, bloccata (con il motivo), aspetto X — e l'autopilota tiene in un solo
 * punto lo stato di tutte le sue chat, e decide lui. Lo stesso compito non va
 * mai a due chat: si controlla prima di aprirne una.
 *
 * Il segnale sta sulla chat (`ChatGovernata.segnale`), l'ultimo e basta: è
 * lo stato, non la storia (quella è nelle decisioni). Arriva per due strade:
 * - **parto**: il primo hook della chat (la prova che è partita davvero);
 * - **fatto / bloccata / aspetto / avanti**: la riga `SEGNALE: …` con cui la
 *   chat chiude il turno. Senza la riga, un «aspetto c-12» detto a parole vale
 *   lo stesso (`attese-chat`), altrimenti la chat va avanti.
 *
 * Funzioni pure, uguali per il servizio, la pagina e l'app.
 */

export type TipoSegnale = 'parto' | 'avanti' | 'fatto' | 'bloccata' | 'aspetto'

export type SegnaleChat = {
  tipo: TipoSegnale
  /** ISO: quando è arrivato. */
  quando: string
  /** bloccata: il motivo; fatto/avanti: la nota (una riga). */
  motivo?: string
  /** aspetto: l'id della chat sorella, se aspetta una chat. */
  di?: string
  /** aspetto: cosa aspetta, a parole, se non è una chat. */
  cosa?: string
  /** La chat l'ha scritto con la riga `SEGNALE:`; falso = dedotto dal programma. */
  dichiarato: boolean
}

const TIPI: readonly TipoSegnale[] = ['parto', 'avanti', 'fatto', 'bloccata', 'aspetto']

/** Il segnale letto dall'archivio su disco: una forma sconosciuta non c'è. */
export function leggiSegnaleChat(x: unknown): SegnaleChat | undefined {
  if (typeof x !== 'object' || x === null) return undefined
  const o = x as Record<string, unknown>
  if (!(TIPI as readonly unknown[]).includes(o.tipo) || typeof o.quando !== 'string') return undefined
  const t = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.slice(0, 200) : undefined)
  const motivo = t(o.motivo)
  const di = t(o.di)
  const cosa = t(o.cosa)
  return {
    tipo: o.tipo as TipoSegnale, quando: o.quando, dichiarato: o.dichiarato === true,
    ...(motivo !== undefined ? { motivo } : {}), ...(di !== undefined ? { di } : {}), ...(cosa !== undefined ? { cosa } : {})
  }
}

/** La regola che la chat riceve nel primo messaggio. */
export const REGOLA_SEGNALE = [
  'Chiudi ogni turno con una riga sola, l’ultima del messaggio, che dice all’autopilota come sei messa:',
  'SEGNALE: avanti — cosa fai al prossimo turno',
  'SEGNALE: fatto — il tuo compito è finito e salvato',
  'SEGNALE: bloccata — il motivo, in parole semplici',
  'SEGNALE: aspetto c-N (la chat che aspetti) oppure SEGNALE: aspetto — cosa aspetti',
  'L’autopilota vede i segnali di tutte le chat e decide lui: non aspettare in silenzio.'
]

const pulisci = (r: string): string => r.replace(/^[*_`>\s•-]+|[*_`\s]+$/g, '').trim()
const nota = (t: string | undefined): string | undefined => {
  const n = (t ?? '').replace(/^[\s—–:-]+/, '').trim()
  return n === '' ? undefined : n.slice(0, 200)
}

/** La riga `SEGNALE: …` fra le ultime del messaggio, letta. */
export function rigaSegnale(messaggio: string, sorelle: string[], me: string | undefined): Omit<SegnaleChat, 'quando'> | undefined {
  const righe = messaggio.split(/\r?\n/).map(pulisci).filter((r) => r !== '')
  for (let i = righe.length - 1; i >= Math.max(0, righe.length - 6); i -= 1) {
    const m = /^SEGNALE[*_`\s]*:[*_`\s]*(parto|partit[ao]|avanti|continuo|prosegu\w*|fatto|finit[ao]|bloccat[ao]|aspett\w*)(?![\p{L}\d])\s*(.*)$/iu.exec(righe[i] ?? '')
    if (m === null) continue
    const parola = (m[1] ?? '').toLowerCase()
    const resto = m[2] ?? ''
    const n = nota(resto)
    if (parola.startsWith('part')) return { tipo: 'parto', dichiarato: true, ...(n !== undefined ? { motivo: n } : {}) }
    if (parola === 'fatto' || parola.startsWith('finit')) return { tipo: 'fatto', dichiarato: true, ...(n !== undefined ? { motivo: n } : {}) }
    if (parola.startsWith('bloccat')) return { tipo: 'bloccata', dichiarato: true, motivo: n ?? 'non ha detto il motivo' }
    if (parola.startsWith('aspett')) {
      const id = /\b(c-\d+[a-z0-9-]*)/i.exec(resto)?.[1]?.toLowerCase()
      if (id !== undefined && id !== me && sorelle.includes(id)) return { tipo: 'aspetto', dichiarato: true, di: id }
      return { tipo: 'aspetto', dichiarato: true, cosa: n ?? 'non ha detto cosa' }
    }
    return { tipo: 'avanti', dichiarato: true, ...(n !== undefined ? { motivo: n } : {}) }
  }
  return undefined
}

/**
 * Il messaggio senza le righe `SEGNALE:` in fondo: la domanda prima del
 * segnale resta l'ultima cosa detta (`domandaInFondo`).
 */
export function senzaRigaSegnale(messaggio: string): string {
  const righe = messaggio.replace(/\r/g, '').split('\n')
  if (!righe.some((r) => /^SEGNALE[*_`\s]*:/i.test(pulisci(r)))) return messaggio
  while (righe.length > 0 && (righe[righe.length - 1]?.trim() === '' || /^SEGNALE[*_`\s]*:/i.test(pulisci(righe[righe.length - 1] ?? '')))) righe.pop()
  return righe.join('\n')
}

/**
 * Il segnale di fine turno: la riga `SEGNALE:` se c'è; se no, la chat sorella
 * che dice di aspettare (`aspettaDi`, da `chatAttesa`); se no, «avanti».
 */
export function segnaleDiFineTurno(messaggio: string, p: { sorelle: string[]; me?: string; quando: string; aspettaDi?: string }): SegnaleChat {
  const r = rigaSegnale(messaggio, p.sorelle, p.me)
  if (r !== undefined) return { ...r, quando: p.quando }
  if (p.aspettaDi !== undefined) return { tipo: 'aspetto', di: p.aspettaDi, quando: p.quando, dichiarato: false }
  return { tipo: 'avanti', quando: p.quando, dichiarato: false }
}

/** La chat che il segnale dice di aspettare, se è una sorella. */
export function attesaDalSegnale(s: SegnaleChat | undefined): string | undefined {
  return s?.tipo === 'aspetto' ? s.di : undefined
}

/** Il segnale cambia davvero (da annotare una volta sola, non a ogni giro). */
export function segnaleNuovo(prima: SegnaleChat | undefined, dopo: SegnaleChat): boolean {
  return prima === undefined || prima.tipo !== dopo.tipo || prima.di !== dopo.di || prima.motivo !== dopo.motivo || prima.cosa !== dopo.cosa
}

/** Il segnale in parole, per il quadro e le schede: «bloccata: manca la chiave». */
export function parolaSegnale(s: SegnaleChat | undefined): string {
  if (s === undefined) return 'nessun segnale ancora'
  switch (s.tipo) {
    case 'parto': return 'partita'
    case 'avanti': return s.motivo !== undefined ? `va avanti: ${s.motivo}` : 'va avanti'
    case 'fatto': return s.motivo !== undefined ? `dice di aver finito: ${s.motivo}` : 'dice di aver finito'
    case 'bloccata': return `bloccata: ${s.motivo ?? 'non ha detto il motivo'}`
    case 'aspetto': return s.di !== undefined ? `aspetta la chat ${s.di}` : `aspetta: ${s.cosa ?? 'non ha detto cosa'}`
  }
}

type ChatNelQuadro = { id: string; compito: string; stato: string; cicli: number; segnale?: SegnaleChat; ruolo?: string }

const STATI: Record<string, string> = { lavoro: 'al lavoro', bloccata: 'ferma su una domanda', pausa: 'in pausa per i limiti', finita: 'chiusa' }

function da(quando: string | undefined, adesso: number): string {
  const t = quando !== undefined ? Date.parse(quando) : Number.NaN
  if (Number.isNaN(t) || Number.isNaN(adesso)) return ''
  const min = Math.max(0, Math.round((adesso - t) / 60_000))
  return min < 1 ? ' (adesso)' : min < 60 ? ` (${min} min fa)` : ` (${Math.round(min / 60)} h fa)`
}

/**
 * **Il quadro della flotta**: lo stato di tutte le chat in un punto solo, per
 * il supervisore. Le chiuse si contano e basta; quelle che chiedono una
 * decisione (bloccata, aspetto, fatto) vengono prima.
 */
export function quadroFlotta(chats: ChatNelQuadro[], adesso: number, questa?: string): string[] {
  if (chats.length === 0) return []
  const aperte = chats.filter((c) => c.stato !== 'finita')
  const peso = (c: ChatNelQuadro): number => (c.segnale?.tipo === 'bloccata' ? 0 : c.segnale?.tipo === 'aspetto' ? 1 : c.segnale?.tipo === 'fatto' ? 2 : 3)
  const righe = ['## Le tue chat, in un punto solo (i loro segnali)']
  for (const c of [...aperte].sort((x, y) => peso(x) - peso(y) || x.id.localeCompare(y.id))) {
    const chi = `${c.id}${c.id === questa ? ' (questa)' : ''}${c.ruolo !== undefined ? `, ${c.ruolo}` : ''}`
    righe.push(`- ${chi}, ${STATI[c.stato] ?? c.stato}, ${c.cicli} ${c.cicli === 1 ? 'giro' : 'giri'}: ${parolaSegnale(c.segnale)}${da(c.segnale?.quando, adesso)}. Compito: ${c.compito.slice(0, 80)}`)
  }
  const chiuse = chats.length - aperte.length
  if (chiuse > 0) righe.push(`- Chiuse: ${chiuse}.`)
  if (aperte.some((c) => c.segnale?.tipo === 'fatto' || c.segnale?.tipo === 'bloccata' || c.segnale?.tipo === 'aspetto')) {
    righe.push('Decidi tu: una chat che dice di aver finito si controlla e si chiude con `chiudiChat`; una bloccata la sblocchi con le istruzioni, le sposti il lavoro o la chiudi; a Nicholas si chiede solo quello che può sapere lui.')
  }
  return righe
}

// ─── Nessun lavoro dato due volte ──────────────────────────────────────────

/** Il compito ridotto all'osso: maiuscole, accenti, punteggiatura e spazi non contano. */
export function chiaveCompito(t: string): string {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * La chat che ha già questo compito, se c'è: una chat aperta (al lavoro,
 * ferma su una domanda, in pausa) oppure una chiusa che ci ha lavorato (fatto,
 * o in attesa della Revisione). Non contano le chat mai partite (avvio
 * fallito: il compito si ritenta) né le Revisioni chiuse, che per lo stesso
 * ramo si riusano.
 */
export function chiHaGia(compito: string, chats: ChatNelQuadro[]): string | undefined {
  const k = chiaveCompito(compito)
  if (k === '') return undefined
  return chats.find((c) => chiaveCompito(c.compito) === k && (c.stato !== 'finita' || (c.cicli > 0 && c.ruolo !== 'revisione')))?.id
}

export type Doppione = { compito: string; chi: string }

/**
 * La coda senza doppioni, prima di aprire chat: un compito che una chat ha già
 * esce dalla coda, e uno scritto due volte resta una volta sola.
 */
export function codaSenzaDoppioni(compiti: string[], chats: ChatNelQuadro[]): { compiti: string[]; tolti: Doppione[] } {
  const visti = new Set<string>()
  const tenuti: string[] = []
  const tolti: Doppione[] = []
  for (const t of compiti) {
    const k = chiaveCompito(t)
    const chi = chiHaGia(t, chats)
    if (chi !== undefined) { tolti.push({ compito: t, chi }); continue }
    if (k !== '' && visti.has(k)) { tolti.push({ compito: t, chi: 'coda' }); continue }
    visti.add(k)
    tenuti.push(t)
  }
  return { compiti: tenuti, tolti }
}

/** Il motivo, in una riga, per cui un compito non va a una chat nuova (per le decisioni). */
export function rigaDoppione(d: Doppione): string {
  return d.chi === 'coda'
    ? `non apro una seconda chat per «${d.compito.slice(0, 100)}»: è già in coda`
    : `non apro una chat per «${d.compito.slice(0, 100)}»: ce l'ha già la chat ${d.chi}`
}
