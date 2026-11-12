import { LAVORO_MAX_MS } from '@shared/aiuto-rete'
import { attesaLimiteMs, azzeramentoDalTesto, eLimiteDelPiano } from '@shared/limite-del-piano'
import { postiDalPc, type MisuraPc, type RegolazionePosti } from '@shared/posti-chat'

/**
 * **SierraDeck Aiutante**: le regole, tutte pure (si provano senza Electron,
 * senza Drive, senza processi).
 *
 * Nicholas, 12/11: «un mini programma che faccia solo questo compito (gestire
 * agenti di altri PC) così che sia ancora più efficiente, con l'abilitazione
 * agli aggiornamenti automatici». Ha le stesse impostazioni del programma
 * completo ma nessuna chat sua: presta i suoi posti agli altri PC come fa il
 * programma completo quando ha posti liberi, e gli altri lo preferiscono.
 */

/** La porta del collegamento fra i PC: diversa dal programma completo (47640), così stanno insieme sullo stesso PC. */
export const PORTA_AIUTANTE = 47641

/** Dove l'Aiutante cerca gli aggiornamenti: una pubblicazione FISSA, mai l'«ultima» del programma completo. */
export const TAG_AIUTANTE = 'aiutante'
export const FEED_AIUTANTE = `https://github.com/niko9090/sierradeck/releases/download/${TAG_AIUTANTE}/`

/** Ogni quanto si cercano aggiornamenti (anche all'avvio). */
export const CERCA_AGGIORNAMENTI_MS = 60 * 60_000

/**
 * Oltre quanto, con un aggiornamento pronto, si installa anche se un lavoro
 * gira ancora: il lavoro più lungo che si lascia fare (3 ore) più un quarto
 * d'ora. In quel tempo l'Aiutante non prende lavori nuovi.
 */
export const SCARICO_MAX_MS = LAVORO_MAX_MS + 15 * 60_000

/** Lo spazio libero sotto il quale l'Aiutante non prende lavori (un `node_modules` grande pesa qualche giga). */
export const DISCO_MINIMO_BYTE = 5 * 1024 ** 3

// ---------------------------------------------------------------- posti

export type PerchePosti = 'pronto' | 'requisiti' | 'aggiornamento' | 'limite' | 'pieno'

/**
 * Quanti posti l'Aiutante dà agli altri PC adesso. Il tetto lo calcola il PC
 * come per le chat del programma completo (`postiDalPc`, con la stessa
 * regolazione «più/meno» e il numero scelto a mano); i liberi sono il tetto
 * meno i lavori in corso. Zero quando non è pronto (manca Claude, git…),
 * quando aspetta di installare un aggiornamento, o quando il piano di Claude
 * ha finito la quota (fino all'azzeramento).
 */
export function postiAiutante(p: {
  misura: MisuraPc
  inCorso: number
  regolazione?: RegolazionePosti
  scelti?: number
  pronto: boolean
  inScarico: boolean
  limiteFino?: number
  adesso: number
}): { liberi: number; tetto: number; perche: PerchePosti } {
  const tetto = postiDalPc(p.misura, p.inCorso, p.regolazione ?? 0, p.scelti).posti
  if (!p.pronto) return { liberi: 0, tetto, perche: 'requisiti' }
  if (p.inScarico) return { liberi: 0, tetto, perche: 'aggiornamento' }
  if (p.limiteFino !== undefined && p.limiteFino > p.adesso) return { liberi: 0, tetto, perche: 'limite' }
  const liberi = Math.max(0, tetto - Math.max(0, p.inCorso))
  return { liberi, tetto, perche: liberi > 0 ? 'pronto' : 'pieno' }
}

/**
 * Un lavoro finito con il piano di Claude esaurito: fino a quando l'Aiutante
 * dice 0 posti. `undefined`: non è il limite. L'ora la si legge dal testo
 * («resets 3pm»), altrimenti si riprova fra un quarto d'ora; mai più di un'ora
 * senza riguardare (`attesaLimiteMs`).
 */
export function limiteDaFine(f: { stato: string; testo: string; motivo?: string }, adesso: number): number | undefined {
  if (f.stato !== 'fallito') return undefined
  const testo = `${f.testo}\n${f.motivo ?? ''}`
  if (!eLimiteDelPiano(testo)) return undefined
  return adesso + attesaLimiteMs(azzeramentoDalTesto(testo, adesso), adesso)
}

// ---------------------------------------------------------------- aggiornamenti

export type FaseAggiornamento = 'niente' | 'scarico' | 'pronto'

/**
 * Cosa fare con un aggiornamento. Scaricato (`pronto`): l'Aiutante smette di
 * prendere lavori; installa appena non ne gira nessuno, o comunque dopo
 * `SCARICO_MAX_MS` (un lavoro bloccato non tiene fermo l'aggiornamento per
 * sempre). Con gli aggiornamenti automatici spenti non si installa da soli.
 */
export function decidiInstallazione(p: { fase: FaseAggiornamento; automatici: boolean; inCorso: number; prontoDa?: number; adesso: number }): 'aspetta' | 'installa' {
  if (p.fase !== 'pronto' || !p.automatici) return 'aspetta'
  if (p.inCorso <= 0) return 'installa'
  if (p.prontoDa !== undefined && p.adesso - p.prontoDa >= SCARICO_MAX_MS) return 'installa'
  return 'aspetta'
}

/** Con un aggiornamento pronto (e gli automatici accesi) l'Aiutante non prende lavori nuovi. */
export function inScarico(p: { fase: FaseAggiornamento; automatici: boolean }): boolean {
  return p.fase === 'pronto' && p.automatici
}

// ---------------------------------------------------------------- requisiti

export type MisureRequisiti = {
  /** `claude --version`, o il motivo per cui non risponde. */
  claude: { ok: true; versione: string } | { ok: false; motivo: string }
  /** Le credenziali di Claude Code ci sono (file delle credenziali o chiave nell'ambiente). */
  claudeAccesso: boolean
  git: { ok: true; versione: string } | { ok: false; motivo: string }
  node: { ok: true; versione: string } | { ok: false; motivo: string }
  npm: { ok: true; versione: string } | { ok: false; motivo: string }
  /** Byte liberi dove l'Aiutante lavora; `undefined` se non si sa. */
  discoLibero?: number
}

export type VoceRequisito = { chiave: 'claude' | 'accesso' | 'git' | 'node' | 'npm' | 'disco'; nome: string; ok: boolean; dettaglio: string }

const gb = (b: number): string => `${(b / 1024 ** 3).toFixed(1)} GB`

/** La lista da mostrare, e se l'Aiutante può prendere lavori. */
export function valutaRequisiti(m: MisureRequisiti): { pronto: boolean; voci: VoceRequisito[] } {
  const voci: VoceRequisito[] = [
    { chiave: 'claude', nome: 'Claude Code installato', ok: m.claude.ok, dettaglio: m.claude.ok ? m.claude.versione : m.claude.motivo },
    { chiave: 'accesso', nome: 'Claude Code con l’accesso fatto', ok: m.claudeAccesso, dettaglio: m.claudeAccesso ? 'credenziali trovate' : 'apri un terminale e scrivi «claude», poi fai l’accesso' },
    { chiave: 'git', nome: 'Git', ok: m.git.ok, dettaglio: m.git.ok ? m.git.versione : m.git.motivo },
    { chiave: 'node', nome: 'Node.js', ok: m.node.ok, dettaglio: m.node.ok ? m.node.versione : m.node.motivo },
    { chiave: 'npm', nome: 'npm', ok: m.npm.ok, dettaglio: m.npm.ok ? m.npm.versione : m.npm.motivo },
    {
      chiave: 'disco', nome: 'Spazio sul disco',
      ok: m.discoLibero === undefined || m.discoLibero >= DISCO_MINIMO_BYTE,
      dettaglio: m.discoLibero === undefined ? 'non misurato' : m.discoLibero >= DISCO_MINIMO_BYTE ? `${gb(m.discoLibero)} liberi` : `solo ${gb(m.discoLibero)} liberi (ne servono almeno ${gb(DISCO_MINIMO_BYTE)})`
    }
  ]
  return { pronto: voci.every((v) => v.ok), voci }
}

/** Le voci che sono diventate «mancanti» da un controllo all'altro: vanno nello storico degli errori una volta sola. */
export function requisitiPersi(prima: readonly VoceRequisito[] | undefined, adesso: readonly VoceRequisito[]): VoceRequisito[] {
  return adesso.filter((v) => !v.ok && (prima === undefined || prima.find((p) => p.chiave === v.chiave)?.ok !== false))
}

// ---------------------------------------------------------------- collegamento

export type StatoRete = { driveConnesso: boolean; cassaforteAperta: boolean; inAscolto: boolean; errorePorta?: string }

/**
 * I blocchi del collegamento appena comparsi (Drive scollegato, cassaforte
 * chiusa, porta occupata): una riga nello storico degli errori al cambio, non
 * a ogni giro. Il primo giro (`prima` assente) conta solo se c'è già un guaio
 * dopo che l'Aiutante era stato collegato almeno una volta (`giaCollegato`).
 */
export function blocchiRete(prima: StatoRete | undefined, adesso: StatoRete, giaCollegato: boolean): string[] {
  const out: string[] = []
  const caduto = (k: 'driveConnesso' | 'cassaforteAperta' | 'inAscolto'): boolean => !adesso[k] && (prima === undefined ? giaCollegato : prima[k])
  if (caduto('driveConnesso')) out.push('[rete] il Drive è scollegato: gli altri PC non vedono più questo Aiutante (va ricollegato dalla finestra dell’Aiutante)')
  if (caduto('cassaforteAperta')) out.push('[rete] la cassaforte è chiusa: senza la chiave di casa gli altri PC non entrano (serve la passphrase nella finestra dell’Aiutante)')
  if (caduto('inAscolto')) out.push(`[rete] il collegamento fra i PC non è in ascolto${adesso.errorePorta !== undefined ? `: ${adesso.errorePorta}` : ''}`)
  return out
}
