import { haDomandaAperta } from '@shared/chat-autopilota'
import { vistaAutopilota, ordinaAutopiloti, type VistaAutopilota } from '@shared/autopiloti-vista'
import type { Autopilota } from '@shared/autopilota'
import type { AutopilotiDiPc } from '@shared/autopiloti-altri'
import { stato, type Colore } from '@shared/stato-vista'
import { vocePc, type VoceStatoPc } from '@shared/vocabolario-stati-pc'
import { nomeODi } from '@shared/nome-autopilota'
import { Aiuto } from './Aiuto'

/**
 * **La pagina Autopiloti, una sola** (k-u3). Tre schede: Chat · Specialisti ·
 * Fila. Gli autopiloti di questo PC e quelli degli altri PC stanno nella stessa
 * tabella, con gli stessi stati e le stesse parole (`vistaAutopilota`); i PC
 * dicono come stanno con le parole di `vocePc` (le stesse di Computer).
 *
 * Qui c'è solo la parte pura (righe, schede, tabella): niente stato, la
 * provano i test senza DOM. La pagina vera è `PannelloAutopiloti`.
 */

export type SchedaAutopiloti = 'chat' | 'specialisti' | 'fila'

export const SCHEDE_AUTOPILOTI: readonly { id: SchedaAutopiloti; nome: string; aiuto: string }[] = [
  { id: 'chat', nome: 'Chat', aiuto: 'La conversazione con l’autopilota scelto: gli scrivi, mette ogni richiesta in coda e ti fa le domande.' },
  { id: 'specialisti', nome: 'Specialisti', aiuto: 'Chi lavora per l’autopilota scelto, una riga per chat: il ruolo, cosa fa e da quanto. «Guarda» porta al suo riquadro.' },
  { id: 'fila', nome: 'Fila', aiuto: 'I posti di questo PC e chi aspetta il suo turno. Con ↑, ↓ e «In cima» cambi l’ordine; «Togli» fa uscire la richiesta dalla fila.' }
]

/** Il colore di ogni stato, uguale per autopiloti e PC. */
export const COLORE_AP: Record<Colore, string> = { verde: 'var(--verde)', ambra: 'var(--ambra)', rosso: 'var(--rosso)', blu: 'var(--blu)', quieto: 'var(--testo-quieto)' }

/** Una riga della tabella: di questo PC o di un altro, con le stesse parole. */
export type RigaAutopiloti = {
  /** `locale:<id>` o `<pcId>:<id>`: unica fra tutti i PC. */
  chiave: string
  id: string
  nome: string
  cwd: string
  workspace?: string
  /** Assente = questo PC. */
  pc?: { id: string; nome: string }
  vista: VistaAutopilota
}

export type GruppoPc = {
  /** `undefined` = questo PC. */
  pc?: { id: string; nome: string }
  stato: VoceStatoPc
  /** Il perché non risponde, se non risponde. */
  errore?: string
  righe: RigaAutopiloti[]
}

/** Il nome con cui si mostra un autopilota: il workspace, poi il nome, poi l’ultima cartella. */
export function nomeAutopilota(a: { workspace?: string | undefined; nome: string; cwd: string }): string {
  if (a.workspace !== undefined && a.workspace !== '') return a.workspace
  const n = nomeODi(a, '')
  if (n !== '') return n
  return a.cwd.split(/[\\/]/).filter((x) => x !== '').pop() ?? a.cwd
}

/** La vista di un autopilota (anche quello letto da un altro PC): mai un’eccezione, al peggio «stato non leggibile». */
export function vistaDiRiga(a: Autopilota, ora: number): VistaAutopilota {
  try {
    const segno = Date.parse((a as unknown as { ultimoSegno?: string }).ultimoSegno ?? '')
    return vistaAutopilota({ ...a, ...(haDomandaAperta(a) ? { domanda: true } : {}) }, ora, Number.isNaN(segno) ? undefined : segno)
  } catch {
    return {
      stato: stato('illeggibile', 'stato non leggibile', 'ambra', 'non riesco a leggere lo stato: riprova fra poco'),
      gruppi: ['aspettano'], criteri: { fatti: 0, totali: 0, testo: '—' }, chat: { totali: 0, alLavoro: 0, testo: '—' }, ultima: '', da: '', azione: 'riprendi'
    }
  }
}

/** Gli autopiloti di questo PC, dal più importante. */
export function righeQuestoPc(elenco: readonly Autopilota[], ora: number): RigaAutopiloti[] {
  return ordinaAutopiloti(elenco.map((a) => ({
    chiave: `locale:${a.id}`, id: a.id, nome: a.nome, cwd: a.cwd, ...(a.workspace !== undefined ? { workspace: a.workspace } : {}), vista: vistaDiRiga(a, ora)
  })))
}

/**
 * Gli altri PC: un gruppo per PC. Il PC che risponde è «acceso», quello che
 * non risponde «acceso, ma non risponde» (le parole di `vocePc`) con il perché
 * dietro il «?»; i suoi autopiloti restano quelli dell’ultima lettura.
 */
export function gruppiAltriPc(altri: readonly AutopilotiDiPc[], ora: number): GruppoPc[] {
  return altri.map((g) => ({
    pc: { id: g.pcId, nome: g.nome },
    stato: vocePc(g.errore !== undefined ? 'irraggiungibile' : 'acceso'),
    ...(g.errore !== undefined ? { errore: g.errore } : {}),
    righe: ordinaAutopiloti(g.autopiloti.map((r) => {
      const a = { cwd: '', obiettivo: '', ...r } as unknown as Autopilota
      return {
        chiave: `${g.pcId}:${r.id}`, id: r.id, nome: r.nome, cwd: typeof a.cwd === 'string' ? a.cwd : '',
        ...(typeof a.workspace === 'string' ? { workspace: a.workspace } : {}),
        pc: { id: g.pcId, nome: g.nome }, vista: vistaDiRiga(a, ora)
      }
    }))
  }))
}

/** Questo PC e gli altri, nello stesso ordine di lettura: prima qui. */
export function tuttiIGruppi(locali: readonly Autopilota[], altri: readonly AutopilotiDiPc[], ora: number): GruppoPc[] {
  return [{ stato: vocePc('acceso'), righe: righeQuestoPc(locali, ora) }, ...gruppiAltriPc(altri, ora)]
}

/** Quanti autopiloti ci sono in tutto, per il numero accanto alla scheda. */
export function quantiAutopiloti(gruppi: readonly GruppoPc[]): number {
  return gruppi.reduce((n, g) => n + g.righe.length, 0)
}

/** Il testo del tasto di una scheda: il nome e, se serve, un numero. */
export function etichettaScheda(s: SchedaAutopiloti, conta: { specialisti?: number; fila?: number } = {}): string {
  const voce = SCHEDE_AUTOPILOTI.find((x) => x.id === s)?.nome ?? s
  const n = s === 'specialisti' ? conta.specialisti : s === 'fila' ? conta.fila : undefined
  return n !== undefined && n > 0 ? `${voce} (${n})` : voce
}

/** Le tre schede, con la spiegazione dietro un solo «?». */
export function BarraSchede({ scheda, onScheda, conta }: { scheda: SchedaAutopiloti; onScheda: (s: SchedaAutopiloti) => void; conta?: { specialisti?: number; fila?: number } }): React.JSX.Element {
  return (
    <div className="progetti__testa autopiloti__schede" role="tablist" aria-label="Autopiloti">
      {SCHEDE_AUTOPILOTI.map((s) => (
        <button key={s.id} role="tab" aria-selected={scheda === s.id} className={`tasto tasto--mini${scheda === s.id ? ' tasto--attivo' : ''}`} onClick={() => onScheda(s.id)}>
          {etichettaScheda(s.id, conta)}
        </button>
      ))}
      <Aiuto di="le schede">
        {SCHEDE_AUTOPILOTI.map((s) => `${s.nome}: ${s.aiuto}`).join(' ')}
      </Aiuto>
    </div>
  )
}

/** La tabella: una riga per autopilota, di qui e degli altri PC, con le stesse colonne e le stesse parole. */
export function TabellaAutopiloti({ gruppi, scelta, onScegli, onMenu, errore }: {
  gruppi: readonly GruppoPc[]
  scelta?: string | undefined
  onScegli: (r: RigaAutopiloti) => void
  onMenu?: (e: React.MouseEvent, r: RigaAutopiloti) => void
  errore?: string | undefined
}): React.JSX.Element {
  const vuota = quantiAutopiloti(gruppi) === 0
  return (
    <div className="progetti__tabella" role="grid">
      <div className="progetti__riga progetti__riga--testa" role="row">
        <span className="progetti__cella">Workspace</span>
        <span className="progetti__cella">Chat</span>
        <span className="progetti__cella">Ultima azione</span>
        <span className="progetti__cella">Da</span>
        <span className="progetti__cella">Stato</span>
      </div>
      {vuota && errore === undefined && gruppi.every((g) => g.errore === undefined) ? <div className="progetti__vuoto">Nessun autopilota ancora: nasce con il primo messaggio che gli scrivi.</div> : null}
      {gruppi.map((g) => (
        <div key={g.pc?.id ?? 'locale'} role="rowgroup">
          {g.pc !== undefined ? (
            <div className="progetti__riga progetti__riga--gruppo" role="row">
              <span className="progetti__cella"><b>{g.pc.nome}</b></span>
              <span className="progetti__cella" title={g.errore} style={{ gridColumn: 'span 4', color: COLORE_AP[g.stato.colore] }}>● {g.stato.etichetta}{g.errore !== undefined ? <Aiuto di={`${g.pc.nome} non risponde`}>{g.errore}</Aiuto> : null}</span>
            </div>
          ) : null}
          {g.righe.map((r) => {
            const acceso = r.chiave === scelta
            return (
              <div key={r.chiave} role="row" tabIndex={0} aria-selected={acceso}
                className={`progetti__riga${acceso ? ' progetti__riga--scelta' : ''}`}
                onClick={() => onScegli(r)}
                {...(onMenu !== undefined ? { onContextMenu: (e: React.MouseEvent) => onMenu(e, r) } : {})}>
                <span className="progetti__cella" title={r.cwd}><b>{nomeAutopilota(r)}</b> <span className="progetti__quieto">{r.cwd.split(/[\\/]/).filter((x) => x !== '').pop() ?? ''}</span></span>
                <span className="progetti__cella">{r.vista.chat.testo}</span>
                <span className="progetti__cella progetti__quieto" title={r.vista.ultima}>{r.vista.ultima}</span>
                <span className="progetti__cella progetti__quieto">{r.vista.da}</span>
                <span className="progetti__cella" title={r.vista.stato.ragione}><span style={{ color: COLORE_AP[r.vista.stato.colore] }}>● {r.vista.stato.parola}</span></span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/** Cerca la riga scelta; senza scelta, quella del workspace davanti (solo di questo PC). */
export function rigaScelta(gruppi: readonly GruppoPc[], scelto: string | undefined, workspaceAttivo: string): RigaAutopiloti | undefined {
  const tutte = gruppi.flatMap((g) => g.righe)
  if (scelto !== undefined) return tutte.find((r) => r.chiave === scelto)
  return tutte.find((r) => r.pc === undefined && r.workspace === workspaceAttivo)
}
