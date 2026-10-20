import type { Autopilota } from '@shared/autopilota'
import { specialistiDi } from '@shared/specialisti'
import { coloreAttivita, parolaStato } from '@shared/colori-attivita'
import { Aiuto } from './Aiuto'
import { LegendaAttivita, SegnoAttivita } from './SegnoAttivita'

/**
 * Gli specialisti dell'autopilota (0.73.0): una riga per come è organizzato il
 * lavoro, poi uno per chat — il ruolo con il suo colore, il compito, lo stato,
 * l'ultima cosa detta e «Guarda», che porta al suo riquadro nel workspace.
 * 0.82.0: una riga per agente con il colore fisso di cosa fa (simbolo e
 * parola, legenda dietro «?»), il ruolo, cosa fa in parole semplici e da quanto.
 */
export function SpecialistiVista({ autopilota: a, onGuarda }: { autopilota: Autopilota; onGuarda?: () => void }): React.JSX.Element {
  const s = specialistiDi(a, Date.now())
  return (
    <div className="progetti__sezione specialisti">
      <span className="serigrafia con-aiuto">
        {s.elenco.length > 1 ? `Specialisti (${s.elenco.length})` : 'La sua chat'}
        <Aiuto di="gli specialisti">
          Quando parte, l’autopilota decide se dividere il lavoro: ogni specialista (Sviluppo, Interfaccia, Collaudo, Revisione, Rilascio) lavora in una chat sua, nella sua cartella, e il suo riquadro sta nel workspace del progetto con il ruolo nel nome. Il lavoro di una chat entra solo dopo l’ok della Revisione. Per un lavoro piccolo resta una chat sola, che fa tutto. «Guarda» porta la finestra al riquadro di quella chat.
        </Aiuto>
        <LegendaAttivita />
      </span>
      <div className="progetti__quieto">{s.riga}</div>
      {s.elenco.map((x) => (
        <div key={x.id} className="specialisti__voce">
          <SegnoAttivita attivita={x.attivita} />
          <b style={{ color: coloreAttivita(x.attivita) }}>{x.ruolo}</b>
          <span className="specialisti__stato" title={x.stato}>
            {[parolaStato(x.attivita), x.quanto].filter((t) => t !== '').join(' · ')}
          </span>
          {x.sessionId !== undefined ? (
            <button
              className="tasto tasto--mini"
              title="Porta la finestra al riquadro di questa chat"
              onClick={() => {
                // Un pannello sopra il mosaico si chiude: il riquadro va visto (0.73.0).
                onGuarda?.()
                window.dispatchEvent(new CustomEvent('sierradeck:guarda-chat', { detail: { sessionId: x.sessionId, workspace: x.workspace } }))
              }}
            >Guarda</button>
          ) : null}
          <div className="specialisti__compito" title={x.compito}>{x.cosa}</div>
          {x.ultimaAzione !== '' ? <div className="progetti__quieto specialisti__ultima" title={x.ultimaAzione}>{x.ultimaAzione}</div> : null}
        </div>
      ))}
    </div>
  )
}
