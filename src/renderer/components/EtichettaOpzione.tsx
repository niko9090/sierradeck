/**
 * Un'opzione da toccare (0.52.5): il numero, la casella di una scelta
 * multipla, il testo e, piccola sotto, la spiegazione che Claude Code mette a
 * ogni opzione. «Type something.» dice di scrivere; «Submit» manda le spunte.
 */
export function EtichettaOpzione({ o }: { o: { numero: number; testo: string; descrizione?: string; libera?: boolean; spuntata?: boolean; invio?: boolean; etichetta?: string } }): React.JSX.Element {
  const casella = o.spuntata === true ? '☑ ' : o.spuntata === false ? '☐ ' : ''
  // `etichetta` (0.84.1): l'opzione fissa di Claude Code detta in italiano dal PC.
  const testo = o.invio === true ? 'Manda le scelte spuntate (Submit)' : o.libera === true ? 'Scrivo io la risposta: scrivila qui sotto' : (o.etichetta ?? o.testo)
  const sotto = o.libera === true ? `arriva a Claude come risposta libera («${o.testo}»)` : o.descrizione
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left' }}>
      <span>{o.invio === true ? '↵' : `${o.numero}.`} {casella}{testo}</span>
      {sotto !== undefined && sotto !== '' ? <small className="misura">{sotto}</small> : null}
    </span>
  )
}
