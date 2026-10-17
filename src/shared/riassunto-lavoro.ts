import type { Autopilota, Decisione } from './autopilota'
import { RUOLI, RUOLI_ORDINE, type Ruolo, type SchedaRuolo } from './ruoli-agenti'
import { statoDaSegnali, type Segnale } from './segnali-chat'

/**
 * La dashboard dell'autopilota (0.79.0). Nicholas vuole vedere, accanto alla
 * conversazione con l'autopilota, un riassunto che si aggiorna da solo: una
 * riga per ogni chat al lavoro, con lo specialista, cosa fa adesso in parole
 * semplici, da quanto e se aspetta lui. E quando uno specialista finisce o la
 * Revisione decide, una riga corta nella conversazione.
 *
 * Le fonti sono due, mai il testo delle chat:
 * - i **segnali** degli hook di Claude Code (`segnali-chat.ts`): la fase del
 *   turno e l'ultimo strumento usato, letto come attività;
 * - il **registro** dell'autopilota: lo stato delle chat governate e le righe
 *   del diario che il servizio scrive quando una chat finisce o la Revisione
 *   decide (testi fissi, scritti da `autopilot-host/server.ts`).
 *
 * Pure: le usano il PC (per la pagina e l'app arrivano calcolate in
 * `/api/panoramica`) e i test.
 */

/** Una riga del riassunto: una chat al lavoro. */
export type RigaLavoro = {
  /** La chat della flotta, l'autopilota per la chat unica, `adottata:<sessione>` per un'adottata. */
  id: string
  ruolo?: Ruolo
  /** «Sviluppo», «Revisione», … «Chat unica», «Chat». */
  nomeRuolo: string
  colore: SchedaRuolo['colore'] | 'quieto'
  /** Il compito, in una riga corta. */
  compito: string
  /** Cosa fa adesso, in parole semplici: «fa girare i test», «modifica il codice (App.tsx)». */
  cosa: string
  /** Da quando lavora al compito (ISO): dal registro, altrimenti dai segnali. */
  dal?: string
  /** Aspetta Nicholas: un permesso, una domanda, una risposta. */
  aspettaTe: boolean
  sessione?: string
}

/** Il primo pezzo di un testo, in una riga corta. */
export function corto(testo: string, max = 60): string {
  const riga = testo.split(/\r?\n/).map((r) => r.trim()).find((r) => r !== '') ?? ''
  return riga.length > max ? `${riga.slice(0, max - 1).trimEnd()}…` : riga
}

const nomeFile = (p: string | undefined): string | undefined => {
  if (p === undefined) return undefined
  const n = p.replace(/\\/g, '/').split('/').filter((x) => x !== '').pop()
  return n !== undefined && n.length <= 40 && !/\s/.test(n) ? n : undefined
}

/**
 * Un comando della shell in parole semplici. Dal comando, non dalla
 * descrizione che scrive la chat: «Run tests» è parola sua, `npx vitest` no.
 */
export function attivitaComando(comando: string): string {
  const c = comando.toLowerCase()
  if (/\b(vitest|jest|pytest|mocha)\b|playwright test|\bnpm (run )?test\b|\b(pnpm|yarn) test\b|testdebugunittest|\bgradlew? .*\btest|\b(go|cargo) test\b/.test(c)) return 'fa girare i test'
  if (/\bnpm run pubblica\b|\bgh release\b|allega-apk|electron-builder/.test(c)) return 'prepara la release'
  if (/\b(tsc|typecheck)\b|\bnpm run (build|pacchetto)\b|electron-vite build|\bassemble(debug|release)?\b|\b(go|cargo) build\b/.test(c)) return 'compila il programma'
  if (/\bgit (merge|rebase|cherry-pick)\b/.test(c)) return 'unisce il lavoro delle altre chat'
  if (/\bgit (commit|add)\b/.test(c)) return 'salva il lavoro'
  if (/\bgit (status|diff|log|show|blame)\b/.test(c)) return 'guarda le modifiche'
  if (/\b(npm|pnpm|yarn) (i|install|ci|add)\b|\bpip install\b/.test(c)) return 'installa i pacchetti'
  if (/sierradeck_prova|\belectron\b|\bnpm run (dev|start)\b/.test(c)) return 'prova il programma'
  if (/^\s*(cd [^&;]+(&&|;)\s*)?(cat|head|tail|ls|dir|grep|rg|find|sed -n|wc|type)\b/.test(c)) return 'legge il codice'
  return 'esegue un comando'
}

/** Uno strumento di Claude Code in parole semplici. */
export function attivitaStrumento(strumento: string, dettaglio?: string, comando?: string): string {
  const s = strumento
  if (s === 'Bash' || s === 'PowerShell') return attivitaComando(comando ?? dettaglio ?? '')
  if (s === 'Edit' || s === 'Write' || s === 'MultiEdit' || s === 'NotebookEdit') {
    const f = nomeFile(dettaglio)
    return f !== undefined ? `modifica il codice (${f})` : 'modifica il codice'
  }
  if (s === 'Read' || s === 'Grep' || s === 'Glob' || s === 'LS' || s === 'NotebookRead') return 'legge il codice'
  if (s === 'Task' || s === 'Agent') return 'si fa aiutare da un agente'
  if (s === 'WebFetch' || s === 'WebSearch') return 'cerca informazioni in rete'
  if (s === 'TodoWrite' || s === 'TaskCreate' || s === 'TaskUpdate') return 'organizza il lavoro'
  if (s === 'AskUserQuestion') return 'ti fa una domanda'
  if (s === 'Skill') return 'segue una procedura'
  if (/chrome|devtools|browser|playwright/i.test(s)) return 'prova nel browser'
  if (/manda_al_telefono/.test(s)) return 'manda un file al telefono'
  return 'lavora'
}

/** Cosa dice di una chat il suo ultimo giro di segnali. */
export type DaiSegnali = { cosa: string; dal: string; aspettaTe: boolean; lavora: boolean }

/**
 * Cosa fa una chat secondo i segnali: la fase del turno decide se lavora o
 * aspetta; mentre lavora, l'ultimo strumento del turno dice che cosa fa.
 * `undefined` se non c'è nessun segnale.
 */
export function cosaFaDaSegnali(segnali: readonly Segnale[]): DaiSegnali | undefined {
  const st = statoDaSegnali([...segnali])
  if (st === undefined) return undefined
  if (st.fase === 'chiede') {
    if (st.chiede?.tipo === 'domanda') return { cosa: 'ti fa una domanda', dal: st.dal, aspettaTe: true, lavora: false }
    const per = st.chiede?.strumento !== undefined ? attivitaStrumento(st.chiede.strumento, st.chiede.dettaglio) : undefined
    return { cosa: per !== undefined && per !== 'lavora' ? `aspetta il tuo permesso: ${per}` : 'aspetta il tuo permesso', dal: st.dal, aspettaTe: true, lavora: false }
  }
  if (st.fase === 'errore') return { cosa: 'si è fermata per un errore', dal: st.dal, aspettaTe: false, lavora: false }
  if (st.fase === 'chiusa') return { cosa: 'chiusa', dal: st.dal, aspettaTe: false, lavora: false }
  if (st.fase === 'aspetta') return { cosa: 'ha finito il turno', dal: st.dal, aspettaTe: false, lavora: false }
  // Al lavoro: l'ultimo strumento dopo l'inizio del turno.
  let inizio = -1
  for (let i = segnali.length - 1; i >= 0; i--) if (segnali[i]!.evento === 'UserPromptSubmit') { inizio = i; break }
  const strumento = [...segnali.slice(inizio + 1)].reverse().find((g) => (g.evento === 'PreToolUse' || g.evento === 'PostToolUse') && g.strumento !== undefined)
  const cosa = strumento !== undefined ? attivitaStrumento(strumento.strumento!, strumento.dettaglio, strumento.comando) : 'ci pensa'
  return { cosa, dal: st.dal, aspettaTe: false, lavora: true }
}

// ─── Il registro: quando una chat è nata e cosa è successo ──────────────────
// I testi qui sotto li scrive il servizio (`autopilot-host/server.ts`, con
// `annota`). Sono fissi: se cambiano là, cambiano qui (c'è un test per ognuno).

const APERTA = /^(?:apro|riuso) la chat (c-\d+)\b/
const FINITA_REVISIONE = /^(c-\d+) ha finito il suo compito: il ramo .* passa alla Revisione/
const CHIUSA = /^chiudo la chat (c-\d+): il suo pezzo è fatto/
const REV_OK = /^Revisione (c-\d+): OK per (c-\d+)\b/
const REV_RIFARE = /^Revisione (c-\d+): da rifare per (c-\d+)\b/
const REV_A_TE = /^Revisione (c-\d+): (c-\d+) rimandato indietro (\d+) volte, chiedo a te/

/** Da quando una chat della flotta lavora al suo compito: l'ultima apertura o l'ultimo «da rifare». */
export function dalDelCompito(decisioni: readonly Decisione[], chat: string): string | undefined {
  for (let i = decisioni.length - 1; i >= 0; i--) {
    const d = decisioni[i]!
    if (APERTA.exec(d.cosa)?.[1] === chat || REV_RIFARE.exec(d.cosa)?.[2] === chat) return d.quando
  }
  return undefined
}

/** Un esito: uno specialista ha finito, o la Revisione ha deciso. */
export type EsitoLavoro = {
  quando: string
  tipo: 'finito' | 'alla-revisione' | 'approvato' | 'da-rifare' | 'decidi-tu'
  /** La chat che ha fatto il lavoro. */
  chat: string
  ruolo?: Ruolo
  compito: string
  giri?: number
}

/** Gli esiti dal diario dell'autopilota, nell'ordine in cui sono successi. */
export function esitiDalRegistro(a: Autopilota): EsitoLavoro[] {
  const chat = new Map(a.chats.map((c) => [c.id, c]))
  const fuori: EsitoLavoro[] = []
  const metti = (quando: string, tipo: EsitoLavoro['tipo'], id: string, giri?: number): void => {
    const c = chat.get(id)
    fuori.push({ quando, tipo, chat: id, compito: c !== undefined ? corto(c.compito) : '', ...(c?.ruolo !== undefined ? { ruolo: c.ruolo } : {}), ...(giri !== undefined ? { giri } : {}) })
  }
  for (const d of a.decisioni) {
    let m: RegExpExecArray | null
    if ((m = FINITA_REVISIONE.exec(d.cosa)) !== null) metti(d.quando, 'alla-revisione', m[1]!)
    else if ((m = CHIUSA.exec(d.cosa)) !== null) metti(d.quando, 'finito', m[1]!)
    else if ((m = REV_OK.exec(d.cosa)) !== null) metti(d.quando, 'approvato', m[2]!)
    else if ((m = REV_RIFARE.exec(d.cosa)) !== null) metti(d.quando, 'da-rifare', m[2]!)
    else if ((m = REV_A_TE.exec(d.cosa)) !== null) metti(d.quando, 'decidi-tu', m[2]!, Number(m[3]))
  }
  return fuori
}

/** La riga corta di un esito, per la conversazione: niente rami, niente id, niente righe tecniche. */
export function rigaEsito(e: EsitoLavoro): string {
  const chi = e.ruolo !== undefined ? RUOLI[e.ruolo].nome : 'Una chat'
  const che = e.compito !== '' ? `«${e.compito}»` : 'il suo compito'
  switch (e.tipo) {
    case 'alla-revisione': return `${chi} ha finito ${che}: ora lo controlla la Revisione.`
    case 'finito': return `${chi} ha finito ${che}.`
    case 'approvato': return `Revisione: ${che} va bene, unito al resto.`
    case 'da-rifare': return `Revisione: ${che} da correggere, ${chi} lo rifà.`
    case 'decidi-tu': return `Revisione: ${che} rimandato ${e.giri ?? 2} volte. Decidi tu, fra le domande.`
  }
}

const postoRuolo = (r: Ruolo | undefined): number => (r === undefined ? RUOLI_ORDINE.length : RUOLI_ORDINE.indexOf(r))
const numero = (id: string): number => { const n = Number(/(\d+)$/.exec(id)?.[1] ?? NaN); return Number.isFinite(n) ? n : 0 }

/**
 * Il riassunto: una riga per ogni chat al lavoro, in ordine fisso (per ruolo,
 * poi come sono nate), così le righe non saltano a ogni aggiornamento. Una
 * chat governata conta finché non è finita; un'adottata solo quando i segnali
 * dicono che lavora o aspetta Nicholas.
 */
export function righeLavoro(a: Autopilota, segnaliDi: (sessione: string) => readonly Segnale[]): RigaLavoro[] {
  const fuori: RigaLavoro[] = []
  const daSegnali = (sessione: string | undefined): DaiSegnali | undefined => (sessione === undefined ? undefined : cosaFaDaSegnali(segnaliDi(sessione)))
  if (a.chats.length === 0 && a.sessionId !== undefined && (a.stato === 'lavoro' || a.stato === 'attesa')) {
    const g = daSegnali(a.sessionId)
    fuori.push({
      id: a.id, nomeRuolo: 'Chat unica', colore: 'quieto', compito: corto(a.nome.trim() !== '' ? a.nome : a.obiettivo),
      cosa: a.stato === 'attesa' && g?.aspettaTe !== true ? 'aspetta una tua risposta' : g?.cosa ?? 'al lavoro',
      dal: a.iniziatoIl, aspettaTe: a.stato === 'attesa' || g?.aspettaTe === true, sessione: a.sessionId
    })
  }
  const governate = a.chats.filter((c) => c.stato !== 'finita')
    .sort((x, y) => postoRuolo(x.ruolo) - postoRuolo(y.ruolo) || numero(x.id) - numero(y.id))
  for (const c of governate) {
    const g = daSegnali(c.sessionId)
    const cosa = c.stato === 'pausa' ? 'in pausa per i limiti del piano'
      : c.stato === 'bloccata' && g?.aspettaTe !== true ? 'aspetta una tua risposta'
        : g?.cosa ?? 'al lavoro'
    const dal = dalDelCompito(a.decisioni, c.id) ?? g?.dal
    fuori.push({
      id: c.id, ...(c.ruolo !== undefined ? { ruolo: c.ruolo } : {}),
      nomeRuolo: c.ruolo !== undefined ? RUOLI[c.ruolo].nome : 'Chat', colore: c.ruolo !== undefined ? RUOLI[c.ruolo].colore : 'quieto',
      compito: corto(c.compito), cosa, ...(dal !== undefined ? { dal } : {}), aspettaTe: c.stato === 'bloccata' || g?.aspettaTe === true,
      ...(c.sessionId !== undefined ? { sessione: c.sessionId } : {})
    })
  }
  for (const ad of (a.adottate ?? []).filter((x) => x.soloMia !== true)) {
    const g = daSegnali(ad.sessionId)
    if (g === undefined || (!g.lavora && !g.aspettaTe)) continue
    fuori.push({
      id: `adottata:${ad.sessionId}`, ...(ad.ruolo !== undefined ? { ruolo: ad.ruolo } : {}),
      nomeRuolo: ad.ruolo !== undefined ? RUOLI[ad.ruolo].nome : 'Chat', colore: ad.ruolo !== undefined ? RUOLI[ad.ruolo].colore : 'quieto',
      compito: corto(ad.titolo), cosa: g.cosa, dal: g.dal, aspettaTe: g.aspettaTe, sessione: ad.sessionId
    })
  }
  return fuori
}

/** I testi del riassunto, uguali su PC, pagina e app. */
export const TESTI_RIASSUNTO = {
  titolo: 'Al lavoro adesso',
  vuoto: 'Nessuna chat al lavoro.',
  aspettaTe: 'aspetta te',
  aiuto: 'Una riga per ogni chat al lavoro: chi è, cosa fa adesso, da quanto. ◆ vuol dire che aspetta te. Si aggiorna da solo, dai segnali delle chat e dal registro dell’autopilota. Tocca una riga per aprire la chat.'
} as const

/** «Sviluppo · fa girare i test · da 12 min · aspetta te»: la riga intera in testo. */
export function testoRigaLavoro(r: RigaLavoro, quanto: string): string {
  return [r.nomeRuolo, r.cosa, quanto, r.aspettaTe ? TESTI_RIASSUNTO.aspettaTe : ''].filter((x) => x !== '').join(' · ')
}
