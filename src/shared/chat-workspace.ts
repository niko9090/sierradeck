/**
 * k-u4: «Chat e workspace», l'unico posto dei comandi su chat e workspace.
 * Parti pure: l'elenco dei comandi (ognuno una volta sola, con il suo «?») e le
 * righe delle «chat degli altri PC» (ex «Usate da altri PC»), con lo stato del
 * PC che le usa preso da `statoPc`.
 */

import { statoPc, type StatoPc } from './stato-pc'
import type { FaseSottofondo, StatoSottofondo } from './sottofondo'

export type IdComando =
  | 'nuova-chat' | 'riprendi' | 'spazio'
  | 'workspace' | 'panoramica' | 'nuova-finestra' | 'negozio'

export type Comando = { id: IdComando; gruppo: 'chat' | 'workspace' | 'strumenti'; etichetta: string; spiega: string }

export const COMANDI_CHAT_WORKSPACE: readonly Comando[] = [
  { id: 'nuova-chat', gruppo: 'chat', etichetta: '+ Nuova chat', spiega: 'Apre una chat nuova in questo workspace: chiede la cartella e il nome, e se metterla sul Drive.' },
  { id: 'riprendi', gruppo: 'chat', etichetta: '↺ Riprendi una conversazione', spiega: 'Tutte le conversazioni, per cartella, anche chiuse o arrivate da altri PC. Chiudere una chat non la cancella: la ritrovi qui.' },
  { id: 'spazio', gruppo: 'chat', etichetta: 'Spazio delle chat', spiega: 'Quanto occupa ogni chat. Ne scegli una o più per Chiudere, Archiviare o Eliminare dal PC. Qui ci sono anche le archiviate e il recupero di 30 giorni.' },
  { id: 'workspace', gruppo: 'workspace', etichetta: 'Crea, rinomina, elimina…', spiega: 'Un workspace è una disposizione di chat. Cambiarlo non chiude le chat. Eliminarlo toglie la disposizione, non le conversazioni.' },
  { id: 'panoramica', gruppo: 'workspace', etichetta: 'Panoramica di questo workspace', spiega: 'Tutto il workspace in una vista.' },
  { id: 'nuova-finestra', gruppo: 'workspace', etichetta: 'Nuova finestra', spiega: 'Un’altra finestra di SierraDeck, con un workspace suo: utile con due schermi. Le chat restano una sola.' },
  { id: 'negozio', gruppo: 'strumenti', etichetta: 'Negozio…', spiega: 'Plugin, skill, agenti e server MCP: cosa usa ogni chat, cosa installare, cosa spegnere. Niente si installa senza un tuo clic.' }
]

export const GRUPPI_COMANDI: readonly { id: Comando['gruppo']; titolo: string }[] = [
  { id: 'chat', titolo: 'Le chat' },
  { id: 'workspace', titolo: 'I workspace' },
  { id: 'strumenti', titolo: 'Gli strumenti' }
]

export type PcVisto = { pcId: string; nome: string; battito?: string | undefined; inAggiornamento?: { versione: string } | undefined }

export type RigaAltroPc = {
  sessione: string
  titolo: string
  /** Il nome del PC che la usa. */
  pc: string
  fase: FaseSottofondo
  /** Una parola per la fase. */
  cosa: string
  /** Lo stato del PC che la usa; `undefined` se non lo si conosce (il telefono, o un PC fuori elenco). */
  statoPc?: StatoPc
}

const COSA: Record<FaseSottofondo, string> = {
  avvio: 'parte', pronta: 'pronta', consegna: 'riceve un testo', lavora: 'al lavoro',
  aspetta: 'aspetta', scelta: 'aspetta una scelta', lenta: 'lenta a partire', chiusa: 'chiusa'
}

/** Le chat usate da altri PC, ognuna con lo stato del PC che la usa. Puro. */
export function righeAltriPc(chat: readonly StatoSottofondo[], pc: readonly PcVisto[], adesso: number): RigaAltroPc[] {
  return chat.filter((c) => c.fase !== 'chiusa').map((c) => {
    const p = pc.find((x) => x.pcId === c.perChi.id)
    const riga: RigaAltroPc = { sessione: c.sessione, titolo: c.titolo, pc: c.perChi.nome, fase: c.fase, cosa: COSA[c.fase] }
    if (p !== undefined) riga.statoPc = statoPc(p.battito, adesso, p.inAggiornamento ?? null)
    return riga
  })
}

/** La riga di stato del PC per chi guarda: «acceso», «spento da…», «Computer in aggiornamento, attendere». */
export function fraseStatoAltroPc(r: RigaAltroPc): string {
  return r.statoPc?.frase ?? 'stato non noto'
}
