import { useEffect } from 'react'
import { voceMenu } from '@shared/menu-principale'
import { SottofondoQui } from './SottofondoQui'
import { Aiuto } from './Aiuto'
import type { PannelloAperto } from './Console'

type Props = {
  /** I workspace: quanti sono e dove sei. */
  workspace: { nomi: string[]; attivo: string }
  onApriSessioni: () => void
  onApri: (quale: PannelloAperto) => void
  onChiudi: () => void
}

/**
 * **Chat e workspace** (0.61.0), la quarta voce del menu principale.
 *
 * I gesti di ogni minuto (riprendere, aprire una chat, cambiare workspace)
 * restano anche nella riga sotto il menu. Qui ci sono tutti, insieme a quelli
 * più rari che prima avevano un tasto a testa nella barra (la finestra nuova,
 * il Negozio). Cosa fa ognuno si legge dal suo «?» (0.62.0).
 */
export function PannelloChat({ workspace, onApriSessioni, onApri, onChiudi }: Props): React.JSX.Element {
  useEffect(() => {
    const suTasto = (e: KeyboardEvent): void => { if (e.key === 'Escape') onChiudi() }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [onChiudi])
  const v = voceMenu('chat')
  const voce = (tasto: React.JSX.Element, spiega: string): React.JSX.Element => (
    <div className="hub__voce">
      {tasto}
      <Aiuto>{spiega}</Aiuto>
    </div>
  )
  return (
    <div className="pannello">
      <div className="pannello__testa">
        <span className="serigrafia">{v.icona} {v.nome}</span>
        <Aiuto di={v.nome}>{v.spiega}</Aiuto>
        <span className="misura">workspace «{workspace.attivo}» · {workspace.nomi.length} in tutto</span>
        <span style={{ flex: 1 }} />
        <button className="tasto" onClick={onChiudi}>Chiudi</button>
      </div>
      <div className="hub">
        <div className="hub__gruppo">
          <h4 className="hub__titolo">Le chat</h4>
          {voce(
            <button className="tasto tasto--primario" onClick={() => { onChiudi(); window.dispatchEvent(new Event('sierradeck:nuova-chat')) }}>+ Nuova chat</button>,
            'Apre una chat nuova in questo workspace: prima chiede in quale cartella lavorare e come chiamarla, e se metterla sul Drive. Il modello è quello scelto accanto a «+ Nuova chat», nella riga sotto il menu.'
          )}
          {voce(
            <button className="tasto" onClick={() => { onChiudi(); onApriSessioni() }}>↺ Riprendi una conversazione</button>,
            'L’elenco di tutte le conversazioni, per cartella, anche quelle chiuse e quelle arrivate da altri PC: una si riapre com’era, con la sua storia. Chiudere una chat non la cancella mai: la ritrovi qui.'
          )}
          {voce(
            <SottofondoQui vuoto={<button className="tasto" disabled title="Nessuna chat di questo PC è usata adesso da un altro PC o dal telefono">⇄ Usate da altri PC (nessuna)</button>} />,
            'Compare solo quando un altro PC o il telefono sta usando una chat di questo PC in sottofondo, senza riquadro. «Mostra qui» la porta in un riquadro senza riavviarla; «Chiudi» la ferma (la conversazione resta) e gli altri PC che la guardano chiudono il loro riquadro.'
          )}
        </div>

        <div className="hub__gruppo">
          <h4 className="hub__titolo">I workspace</h4>
          {voce(
            <button className="tasto" onClick={() => onApri('workspace')}>Crea, rinomina, elimina…</button>,
            'Un workspace è una disposizione di chat da riprendere quando vuoi: cambiarlo non chiude le chat di quello che lasci. Per passare da uno all’altro basta un clic sul suo nome nella riga sotto il menu. Eliminarlo toglie la disposizione, non le conversazioni.'
          )}
          {voce(
            <button className="tasto" onClick={() => window.gestore.finestre.nuova()}>Nuova finestra</button>,
            'Apre un’altra finestra di SierraDeck sul primo monitor libero, con un workspace suo: utile con due schermi. Le chat restano una sola: una chat aperta in una finestra non si apre anche nell’altra.'
          )}
        </div>

        <div className="hub__gruppo">
          <h4 className="hub__titolo">Gli strumenti delle chat</h4>
          {voce(
            <button className="tasto" onClick={() => onApri('negozio')}>Negozio…</button>,
            'Plugin, skill, agenti e server MCP di Claude Code: cosa usa ogni chat, cosa installare e cosa spegnere, per tutte le chat o solo per quella che hai davanti. Niente si installa senza un tuo clic.'
          )}
        </div>
      </div>
    </div>
  )
}
