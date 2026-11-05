import { Terminal } from '@xterm/xterm'
import type { HostToCore } from '@shared/protocol'
import { dimenticaSchermo, haSchermo, misureDi, registraSchermo } from './schermo-terminale'

/**
 * Lo schermo delle chat dei workspace che stanno dietro (0.92.1).
 *
 * Nicholas, 05/11: «è aperta e sta andando ma non la sto visualizzando … perché
 * c'è aperto un altro workspace. ma deve poter andare lo stesso». Cambiando
 * workspace la chat continua a lavorare, ma il suo riquadro si smonta e con lui
 * l'xterm che disegna lo schermo: da un altro PC (e dal telefono) arrivava una
 * riga sola. Qui ogni chat di dietro ha un terminale senza finestra, nutrito
 * dallo stesso flusso, con la cronologia del PTY host al primo aggancio.
 * Quando il riquadro torna, il suo xterm prende il posto e questo si spegne.
 */

export type DipendenzeDietro = {
  ascolta: (id: string, cb: (msg: HostToCore) => void) => unknown
  attach: (id: string) => void
  /** Per i test: un terminale finto. */
  crea?: (colonne: number, righe: number) => TerminaleDietro
}

export type TerminaleDietro = {
  write: (dati: string) => void
  dispose: () => void
  rows: number
  cols: number
  buffer: { active: unknown }
}

const dietro = new Map<string, { term: TerminaleDietro; vivo: boolean }>()

const creaVero = (cols: number, rows: number): TerminaleDietro =>
  new Terminal({ cols, rows, scrollback: 2000, allowProposedApi: true }) as unknown as TerminaleDietro

/** Tiene uno schermo per ogni terminale di dietro che non ne ha; spegne quelli non più di dietro. */
export function tieniSchermiDietro(ptyIds: string[], d: DipendenzeDietro): void {
  const voluti = new Set(ptyIds)
  for (const id of voluti) {
    if (dietro.has(id) || haSchermo(id)) continue
    const m = misureDi(id) ?? { colonne: 120, righe: 30 }
    const term = (d.crea ?? creaVero)(m.colonne, m.righe)
    const voce = { term, vivo: true }
    dietro.set(id, voce)
    d.ascolta(id, (msg) => {
      if (!voce.vivo) return
      if (msg.kind === 'data' || msg.kind === 'scrollback') term.write(msg.data)
    })
    const spegni = (): void => { if (!voce.vivo) return; voce.vivo = false; dietro.delete(id); try { term.dispose() } catch { /* già spento */ } }
    registraSchermo(id, () => term.buffer.active as never, () => term.rows, () => term.cols, spegni)
    d.attach(id)
  }
  for (const [id, v] of [...dietro]) {
    if (voluti.has(id)) continue
    // Chiusa, o tornata a schermo prima di registrarsi: lo schermo è nostro, si toglie.
    v.vivo = false
    dietro.delete(id)
    try { v.term.dispose() } catch { /* già spento */ }
    dimenticaSchermo(id)
  }
}

export const quantiDietro = (): number => dietro.size
