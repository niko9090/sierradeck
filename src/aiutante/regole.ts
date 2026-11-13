import { LAVORO_MAX_MS } from '@shared/aiuto-rete'
import { attesaLimiteMs, azzeramentoDalTesto, eLimiteDelPiano } from '@shared/limite-del-piano'
import { postiDalPc, type MisuraPc, type RegolazionePosti } from '@shared/posti-chat'
import type { StatoAggiornamento as StatoFinestraAggiornamenti } from '../main/aggiornamenti'

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

/**
 * Dove l'Aiutante cerca gli aggiornamenti (13/11, regola di Nicholas: «l'Aiutante
 * deve SEMPRE essere allegato alla release del programma completo»): l'ultima
 * pubblicazione del programma completo, la stessa da cui si aggiorna il
 * programma, ma con un file suo, `aiutante.yml` (il canale `aiutante`). Il
 * programma completo legge solo `latest.yml`, l'Aiutante solo `aiutante.yml`:
 * nessuno dei due prende l'installer dell'altro. Prima del 13/11 stava sulla
 * pubblicazione fissa «aiutante», che non si usa più.
 */
export const FEED_AIUTANTE = 'https://github.com/niko9090/sierradeck/releases/latest/download/'
/** Il canale: electron-updater (provider generic) legge `${CANALE_AIUTANTE}.yml` su Windows. */
export const CANALE_AIUTANTE = 'aiutante'

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

export type PerchePosti = 'pronto' | 'claude' | 'requisiti' | 'aggiornamento' | 'limite' | 'pieno'

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
  /** 13/11 (1.0.3): Claude Code non va davvero (accesso scaduto, limite, CLI mancante): il motivo. */
  claudeBloccato?: string
  inScarico: boolean
  limiteFino?: number
  adesso: number
}): { liberi: number; tetto: number; perche: PerchePosti } {
  const tetto = postiDalPc(p.misura, p.inCorso, p.regolazione ?? 0, p.scelti).posti
  if (p.claudeBloccato !== undefined) return { liberi: 0, tetto, perche: 'claude' }
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

/**
 * `disponibile`: c'è una versione nuova ma gli aggiornamenti automatici sono
 * spenti (non si scarica da sola); `installo`: si sta chiudendo per installare.
 */
export type FaseAggiornamento = 'niente' | 'disponibile' | 'scarico' | 'pronto' | 'installo'

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
  // «Installa adesso» (1.0.3): da quel momento niente lavori nuovi, automatici o no.
  if (p.fase === 'installo') return true
  return p.fase === 'pronto' && p.automatici
}

/**
 * «Installa adesso» (13/11, 1.0.3), a mano dalla finestra: anche con lavori in
 * corso, dopo una conferma (quei lavori li riprende un altro PC: chi li ha
 * chiesti vede l'Aiutante sparire e li riaffida). Solo con il file già
 * scaricato.
 */
export function installaAdesso(p: { fase: FaseAggiornamento; inCorso: number; confermato: boolean }): { esito: 'installa' } | { esito: 'conferma'; domanda: string } | { esito: 'no'; motivo: string } {
  if (p.fase === 'installo') return { esito: 'no', motivo: 'Sto già installando.' }
  if (p.fase !== 'pronto') return { esito: 'no', motivo: 'Nessun aggiornamento scaricato da installare.' }
  if (p.inCorso > 0 && !p.confermato) {
    return { esito: 'conferma', domanda: p.inCorso === 1 ? '1 lavoro in corso verrà ripreso da un altro PC. Installo adesso?' : `${p.inCorso} lavori in corso verranno ripresi da un altro PC. Installo adesso?` }
  }
  return { esito: 'installa' }
}

/** I numeri di electron-updater mentre scarica (`download-progress`). */
export type ProgressoScarico = { percento: number; scaricati: number; totale: number; velocita: number }

/**
 * Lo stato dell'Aiutante nella forma che legge la finestra degli
 * aggiornamenti del programma completo (`FinestraAggiornamenti.tsx`): la
 * stessa finestra, con le stesse fasi. `aggiornato` dopo una ricerca senza
 * niente di nuovo, `cerco` mentre cerca, `errore` con l'ultimo errore.
 */
export function perLaFinestra(s: {
  fase: FaseAggiornamento
  versione?: string
  errore?: string
  cercando?: boolean
  ultimaRicerca?: number
  progresso?: ProgressoScarico
}): StatoFinestraAggiornamenti {
  const v = s.versione !== undefined ? { versione: s.versione } : {}
  switch (s.fase) {
    case 'disponibile': return { fase: 'disponibile', ...v }
    case 'scarico': {
      const p = s.progresso
      return {
        fase: 'scarico', ...v,
        percento: p !== undefined ? Math.max(0, Math.min(100, Math.floor(p.percento))) : 0,
        ...(p !== undefined && p.totale > 0 ? { scaricati: p.scaricati, totale: p.totale } : {}),
        ...(p !== undefined && p.velocita > 0 ? { velocita: p.velocita } : {})
      }
    }
    case 'pronto': return { fase: 'pronto', ...v }
    case 'installo': return { fase: 'installo', ...v }
    default:
      if (s.cercando === true) return { fase: 'cerco' }
      if (s.errore !== undefined) return { fase: 'errore', errore: s.errore }
      return { fase: s.ultimaRicerca !== undefined ? 'aggiornato' : 'fermo' }
  }
}

/** La riga corta nella finestra principale dell'Aiutante (il resto è nella finestra degli aggiornamenti). */
export function rigaAggiornamento(s: { fase: FaseAggiornamento; versione?: string; progresso?: ProgressoScarico; cercando?: boolean }): string | undefined {
  const v = s.versione ?? 'nuova versione'
  switch (s.fase) {
    case 'disponibile': return `C’è la ${v}`
    case 'scarico': return `Aggiornamento in corso: ${v}, ${Math.floor(s.progresso?.percento ?? 0)}%`
    case 'pronto': return `La ${v} è pronta da installare`
    case 'installo': return `Installo la ${v}…`
    default: return s.cercando === true ? 'Cerco aggiornamenti…' : undefined
  }
}

/** Il tooltip dell'icona vicino all'orologio, con l'aggiornamento se c'è. */
export function tooltipIcona(p: { lavori: number; liberi: number; claude?: string; aggiornamento?: { fase: FaseAggiornamento; percento?: number; versione?: string } }): string {
  const a = p.aggiornamento
  const parti = ['SierraDeck Aiutante']
  if (p.claude !== undefined) parti.push(p.claude)
  else parti.push(`${p.lavori} lavori, ${p.liberi} posti liberi`)
  if (a?.fase === 'scarico') parti.push(`scarico ${a.versione ?? ''} ${Math.floor(a.percento ?? 0)}%`.replace(/\s+/gu, ' '))
  else if (a?.fase === 'pronto') parti.push(`${a.versione ?? 'aggiornamento'} pronta`)
  else if (a?.fase === 'installo') parti.push('installo l’aggiornamento')
  // Windows taglia il tooltip a 127 caratteri.
  return parti.join(' — ').slice(0, 127)
}

// ---------------------------------------------------------------- requisiti

export type MisureRequisiti = {
  /** `claude --version`, o il motivo per cui non risponde. */
  claude: { ok: true; versione: string } | { ok: false; motivo: string }
  git: { ok: true; versione: string } | { ok: false; motivo: string }
  node: { ok: true; versione: string } | { ok: false; motivo: string }
  npm: { ok: true; versione: string } | { ok: false; motivo: string }
  /** Byte liberi dove l'Aiutante lavora; `undefined` se non si sa. */
  discoLibero?: number
}

export type VoceRequisito = { chiave: 'claude' | 'git' | 'node' | 'npm' | 'disco'; nome: string; ok: boolean; dettaglio: string }

const gb = (b: number): string => `${(b / 1024 ** 3).toFixed(1)} GB`

/** La lista da mostrare, e se l'Aiutante può prendere lavori. */
export function valutaRequisiti(m: MisureRequisiti): { pronto: boolean; voci: VoceRequisito[] } {
  const voci: VoceRequisito[] = [
    { chiave: 'claude', nome: 'Claude Code installato', ok: m.claude.ok, dettaglio: m.claude.ok ? m.claude.versione : m.claude.motivo },
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
