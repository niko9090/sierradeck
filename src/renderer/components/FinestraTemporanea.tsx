import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'
import { TerminaleSemplice } from './TerminaleSemplice'

type Props = {
  titolo: string
  sottotitolo?: string
  /** Il terminale da mostrare, quando c'e'. */
  ptyId?: string
  /** Un messaggio al posto del terminale (errore, attesa). */
  nota?: string
  onChiudi: () => void
}

/**
 * Una mini finestra temporanea, sopra il mosaico.
 *
 * Nicholas (23/09): «una risoluzione avanzata dove un agente valuta bene il
 * caso, in una mini finestra temporanea». Non e' una finestra di Electron: il
 * Core tratta ogni finestra come una finestra di chat (layout, slot, tray),
 * e una seconda `BrowserWindow` andrebbe esclusa in quaranta posti. E' un
 * pannello galleggiante dentro la finestra, con dentro un terminale
 * agganciato a un pty che il Core ha avviato apposta. Non entra nei layout,
 * non si salva: chiuderla chiude anche il suo processo.
 */
export function FinestraTemporanea({ titolo, sottotitolo, ptyId, nota, onChiudi }: Props): React.JSX.Element {
  const [grande, setGrande] = useState(false)
  useEffect(() => {
    const suTasto = (e: KeyboardEvent): void => { if (e.key === 'Escape') chiudi() }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  })
  const chiudi = (): void => {
    // Il processo muore con la finestra: e' un assistente di passaggio, non
    // una chat, e un claude.exe lasciato acceso senza nessuno che lo guarda e'
    // esattamente quello che questa finestra non deve lasciare.
    if (ptyId !== undefined) window.gestore.pty.kill(ptyId)
    onChiudi()
  }
  return createPortal(
    <div className={grande ? 'mini-finestra mini-finestra--grande' : 'mini-finestra'} role="dialog" aria-label={titolo}>
      <div className="mini-finestra__testa">
        <div className="mini-finestra__titoli">
          <span className="mini-finestra__titolo">{titolo}</span>
          {sottotitolo !== undefined ? <span className="mini-finestra__sotto">{sottotitolo}</span> : null}
        </div>
        <button className="comando-riquadro" onClick={() => setGrande((g) => !g)} title={grande ? 'Rimpicciolisci' : 'Ingrandisci'} aria-label="Ridimensiona">{grande ? '▣' : '▢'}</button>
        <button className="comando-riquadro" onClick={chiudi} title="Chiude la finestra e ferma l’assistente" aria-label="Chiudi">×</button>
      </div>
      <div className="mini-finestra__corpo">
        {ptyId !== undefined ? <TerminaleSemplice ptyId={ptyId} altezza={grande ? 560 : 360} /> : null}
        {nota !== undefined ? <div className="mini-finestra__nota">{nota}</div> : null}
      </div>
      <div className="mini-finestra__pie">
        Scrivi qui dentro come in una chat. Esc o × chiude la finestra e ferma l’assistente; la chat di partenza non viene toccata finché non premi tu «Riprova».
      </div>
    </div>,
    document.body
  )
}
