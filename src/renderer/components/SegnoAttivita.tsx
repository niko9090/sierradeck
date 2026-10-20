import { ATTIVITA, coloreAttivita, legendaAttivita, TITOLO_LEGENDA, type Attivita } from '@shared/colori-attivita'
import { Aiuto } from './Aiuto'

/**
 * Il segno di cosa fa una chat (0.82.0): il simbolo e, se serve, la parola,
 * nel colore fisso della tabella unica `@shared/colori-attivita`. Il colore
 * non è mai da solo: c'è sempre il simbolo, e il nome per chi legge con il
 * lettore dello schermo.
 */
export function SegnoAttivita({ attivita, parola = false }: { attivita: Attivita; parola?: boolean }): React.JSX.Element {
  const s = ATTIVITA[attivita]
  return (
    <span className="segno-attivita" style={{ color: coloreAttivita(attivita) }} title={`${s.nome}: ${s.spiega}`} aria-label={s.nome}>
      <span aria-hidden="true">{s.icona}</span>
      {parola ? <span className="segno-attivita__parola">{s.parola}</span> : null}
    </span>
  )
}

/** La legenda dei colori dietro «?»: una riga per attività, con simbolo, nome e cosa vuol dire. */
export function LegendaAttivita(): React.JSX.Element {
  return (
    <Aiuto di={TITOLO_LEGENDA.toLowerCase()}>
      <b>{TITOLO_LEGENDA}</b>
      <span className="legenda-attivita">
        {legendaAttivita().map((v) => (
          <span key={v.id} className="legenda-attivita__voce">
            <span style={{ color: v.colore }} aria-hidden="true">{v.icona}</span> <b style={{ color: v.colore }}>{v.nome}</b> — {v.spiega}
          </span>
        ))}
      </span>
    </Aiuto>
  )
}
