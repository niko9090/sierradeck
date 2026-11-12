import type { StimaVoce, VistaAttesa } from './attesa-specialisti'
import type { VistaAutopilota } from './autopiloti-vista'
import { COLORI } from './colori-attivita'
import { fraseStatoOrchestratore, quandoSveglia, type VistaOrchestratore } from './piano-orchestratore'
import { RUOLI } from './ruoli-agenti'
import { inParole } from './titoli-in-parole'

/**
 * **Lo stato che serve alle schermate del telefono** (11/11, rifacimento
 * dell'app). Per ogni autopilota, in `/api/stato`, quattro campi già pronti
 * da disegnare: l'app non ricalcola niente e non deve aprire la scheda per
 * sapere se si lavora.
 *
 * - `adesso`: la frase di cosa succede, con il tono per il colore. Il tono è
 *   **quello di `fraseStatoOrchestratore`** (la riga sotto la percentuale sul
 *   PC): le parole sono più corte e senza sigle né «(nelle Domande)».
 * - `avanzamento`: la percentuale del workspace e quanti minuti mancano a
 *   svuotare la sua lista d'attesa (la stima degli specialisti).
 * - `ruoli`: chi lavora adesso, con il colore della tabella unica (`#rrggbb`).
 * - `domande`: quante domande dell'autopilota aspettano Nicholas.
 *
 * Senza la vista dell'orchestratore (un servizio vecchio, che non risponde, un
 * autopilota di prima dell'autopilota unico) si ripiega sulla vista in una
 * parola dell'autopilota: i campi ci sono sempre.
 */

export type TonoAdesso = 'lavora' | 'aspetta' | 'fermo' | 'riposo'
export type AdessoTelefono = { testo: string; tono: TonoAdesso }
export type AvanzamentoTelefono = { percento?: number; mancaMin?: number }
export type RuoloTelefono = { ruolo: string; colore: string; cosa?: string }
export type StatoTelefono = { adesso: AdessoTelefono; avanzamento: AvanzamentoTelefono; ruoli: RuoloTelefono[]; domande: number }

/** Quanti ruoli al più nell'elenco `ruoli` (la frase li dice tutti, senza ripetere lo stesso nome). */
export const RUOLI_MAX = 6
/** Quanto è lunga al più la cosa che fa uno specialista. */
export const COSA_MAX = 80

/**
 * Il ruolo in una parola, con il suo colore. Arrivano due nomi: il tipo dello
 * specialista dell'autopilota unico (`sviluppatore`, `verificatore`…) e il nome
 * del ruolo di una chat adottata (`Sviluppo`, `Collaudo`…).
 */
const PER_RUOLO: Record<string, { ruolo: string; colore: string }> = {
  sviluppatore: { ruolo: RUOLI.sviluppo.nome, colore: COLORI[RUOLI.sviluppo.colore] },
  sviluppo: { ruolo: RUOLI.sviluppo.nome, colore: COLORI[RUOLI.sviluppo.colore] },
  interfaccia: { ruolo: RUOLI.interfaccia.nome, colore: COLORI[RUOLI.interfaccia.colore] },
  android: { ruolo: 'Android', colore: COLORI[RUOLI.interfaccia.colore] },
  verificatore: { ruolo: RUOLI.collaudo.nome, colore: COLORI[RUOLI.collaudo.colore] },
  collaudo: { ruolo: RUOLI.collaudo.nome, colore: COLORI[RUOLI.collaudo.colore] },
  revisore: { ruolo: RUOLI.revisione.nome, colore: COLORI[RUOLI.revisione.colore] },
  revisione: { ruolo: RUOLI.revisione.nome, colore: COLORI[RUOLI.revisione.colore] },
  esploratore: { ruolo: 'Analisi', colore: COLORI.verde },
  rilascio: { ruolo: RUOLI.rilascio.nome, colore: COLORI[RUOLI.rilascio.colore] }
}

/** Il ruolo come lo legge Nicholas: «Sviluppo», «Collaudo»; un nome che non si conosce resta, con il grigio. */
export function ruoloTelefono(ruolo: string | undefined): { ruolo: string; colore: string } {
  const r = (ruolo ?? '').trim()
  const noto = PER_RUOLO[r.toLowerCase()]
  if (noto !== undefined) return noto
  return { ruolo: r === '' ? 'Specialista' : r.charAt(0).toLocaleUpperCase('it-IT') + r.slice(1), colore: COLORI.quieto }
}

const alLavoro = (stato: string): boolean => stato === 'lavoro' || stato === 'avviato'
const da = (n: number, uno: string, piu: string): string => (n === 1 ? `1 ${uno}` : `${n} ${piu}`)

/** «Sviluppo», «Sviluppo e Revisione», «Sviluppo, Collaudo e Revisione». */
function elenco(nomi: string[]): string {
  const unici = [...new Set(nomi)]
  if (unici.length <= 1) return unici[0] ?? ''
  return `${unici.slice(0, -1).join(', ')} e ${unici[unici.length - 1]!}`
}

type PerFrase = Pick<VistaOrchestratore, 'pensa' | 'specialisti' | 'piano' | 'richieste' | 'domandeAperte' | 'vivo' | 'sveglia'>

/** La frase di adesso dalla vista dell'orchestratore: tono uguale al PC, parole corte e senza sigle. */
export function fraseAdesso(v: PerFrase): AdessoTelefono {
  const { tono } = fraseStatoOrchestratore(v)
  const lavorano = v.specialisti.filter((s) => alLavoro(s.stato))
  const domande = v.domandeAperte ?? 0
  const aperte = v.richieste?.aperte ?? 0
  const daPianificare = v.richieste?.daPianificare ?? 0
  const daFare = v.piano.totale - v.piano.uniti
  if (lavorano.length > 0) {
    const chi = elenco(lavorano.map((s) => ruoloTelefono(s.ruolo).ruolo))
    return { testo: `Al lavoro: ${chi}${v.pensa ? ' · l’autopilota pensa' : ''}`, tono }
  }
  if (v.pensa) return { testo: 'L’autopilota sta pensando', tono }
  if (domande > 0) return { testo: `Fermo: aspetta ${domande === 1 ? 'una tua risposta' : `${domande} tue risposte`}`, tono }
  if (v.sveglia !== undefined && Date.parse(v.sveglia.il) > Date.now()) return { testo: `In pausa: riprende ${quandoSveglia(v.sveglia.il)}`, tono }
  if (aperte > 0 && daFare > 0) return { testo: `Fermo: ${da(daFare, 'compito', 'compiti')} da fare e nessuno al lavoro`, tono }
  if (aperte > 0 || daPianificare > 0) return { testo: `Fermo: ${da(aperte + daPianificare, 'richiesta', 'richieste')} senza piano`, tono }
  return { testo: 'A riposo: tutto fatto', tono }
}

/** Senza la vista dell'orchestratore: la vista in una parola dell'autopilota. */
export function adessoDaVista(v: Pick<VistaAutopilota, 'stato'>, domande: number): AdessoTelefono {
  switch (v.stato.id) {
    case 'al-lavoro': return { testo: 'Al lavoro', tono: 'lavora' }
    case 'prepara': return { testo: 'Si prepara', tono: 'lavora' }
    case 'aspetta': return { testo: domande > 1 ? `Fermo: aspetta ${domande} tue risposte` : 'Fermo: aspetta una tua risposta', tono: 'aspetta' }
    case 'pronto': return { testo: 'Aspetta il tuo via', tono: 'aspetta' }
    case 'senza-segni': return { testo: 'Nessun segno da un po’', tono: 'fermo' }
    case 'guasto': return { testo: 'Fermo per un errore', tono: 'fermo' }
    case 'finito': return { testo: 'A riposo: tutto fatto', tono: 'riposo' }
    default: return { testo: 'Fermo', tono: 'fermo' }
  }
}

/** Le voci della lista d'attesa di un workspace (chi lavora e chi aspetta). */
type VoceStimata = { workspace: string; compito?: string; descrizione: string; tipo: string } & StimaVoce

function vociDel(attesa: VistaAttesa | undefined, ws: string): { alLavoro: VoceStimata[]; inFila: VoceStimata[] } {
  const nel = (x: VoceStimata): boolean => x.workspace === ws
  return { alLavoro: (attesa?.alLavoro ?? []).filter(nel), inFila: (attesa?.inFila ?? []).filter(nel) }
}

/** La lista d'attesa letta da `/api/specialisti/attesa`, o niente se la forma non torna. */
export function leggiAttesa(x: unknown): VistaAttesa | undefined {
  if (typeof x !== 'object' || x === null) return undefined
  const o = x as Partial<VistaAttesa>
  return Array.isArray(o.alLavoro) && Array.isArray(o.inFila) ? (o as VistaAttesa) : undefined
}

const minuti = (n: unknown): number | undefined => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.max(1, Math.round(n)) : undefined)
const percento = (n: unknown): number | undefined => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : undefined)

export type FontiStatoTelefono = {
  /** La chiave del workspace (`chiaveWorkspace`). */
  workspace: string
  /** L'id dell'autopilota: la vista dell'orchestratore vale se è la sua. */
  autopilota: string
  orchestratore?: VistaOrchestratore
  attesa?: VistaAttesa
  vista: Pick<VistaAutopilota, 'stato'>
  /** Le sue domande aperte contate dall'elenco delle domande (riserva). */
  domande: number
}

/** I quattro campi di un autopilota per il telefono. */
export function statoTelefono(f: FontiStatoTelefono): StatoTelefono {
  const o = f.orchestratore !== undefined && (f.orchestratore.autopilota === undefined || f.orchestratore.autopilota === f.autopilota) ? f.orchestratore : undefined
  const lista = vociDel(f.attesa, f.workspace)
  const domande = o?.domandeAperte ?? f.domande
  // Quanto manca: la voce più lunga del workspace (chi è in fila conta anche l'attesa del posto).
  const stime = [...lista.alLavoro, ...lista.inFila].map((v) => minuti(v.minutiStimati)).filter((n): n is number => n !== undefined)
  const mancaMin = stime.length > 0 ? Math.max(...stime) : undefined
  const pc = percento(o?.percento)
  const avanzamento: AvanzamentoTelefono = { ...(pc !== undefined ? { percento: pc } : {}), ...(mancaMin !== undefined ? { mancaMin } : {}) }
  const conCosa = (r: { ruolo: string; colore: string }, cosa: string): RuoloTelefono => (cosa !== '' ? { ...r, cosa } : r)
  const ruoli: RuoloTelefono[] = o !== undefined
    ? o.specialisti.filter((s) => alLavoro(s.stato)).map((s) => conCosa(ruoloTelefono(s.ruolo), inParole(s.compito, { max: COSA_MAX, sigle: [s.compitoId] })))
    : lista.alLavoro.map((v) => conCosa(ruoloTelefono(v.tipo), inParole(v.titolo ?? v.descrizione, { max: COSA_MAX, sigle: [v.compito] })))
  const adesso = o !== undefined ? fraseAdesso({ ...o, domandeAperte: domande }) : ruoli.length > 0 ? { testo: `Al lavoro: ${elenco(ruoli.map((r) => r.ruolo))}`, tono: 'lavora' as const } : adessoDaVista(f.vista, domande)
  return { adesso, avanzamento, ruoli: ruoli.slice(0, RUOLI_MAX), domande }
}
