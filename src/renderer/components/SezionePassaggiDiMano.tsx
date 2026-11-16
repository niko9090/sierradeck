import { useEffect, useState } from 'react'
import { oraBreve } from '@shared/storico-errori'
import type { EventoAiuto, TipoEventoAiuto } from '@shared/eventi-aiuto'
import { Aiuto } from './Aiuto'

/** Quante voci si vedono prima di «Mostra tutti». */
const PRIME = 5

const ETICHETTA: Record<TipoEventoAiuto, string> = {
  affidato: 'Affidato',
  'risorsa-mancante': 'Manca qualcosa',
  rifiutato: 'Rifiutato',
  riassegnato: 'Passato ad altro PC',
  arreso: 'Lasciato'
}

/**
 * «Passaggi di mano»: i lavori mandati a un altro PC della rete («Aiuta la
 * rete») che sono stati affidati, rifiutati, passati ad altri o lasciati, e
 * quelli fermi per una risorsa mancante. I più recenti in cima, testi corti,
 * il resto dietro il «?».
 */
export function SezionePassaggiDiMano(): React.JSX.Element {
  const [eventi, setEventi] = useState<EventoAiuto[] | undefined>(undefined)
  const [tutti, setTutti] = useState(false)
  const [nota, setNota] = useState<string | undefined>(undefined)
  const rileggi = (): void => {
    void window.gestore.aiutoEventi.leggi()
      .then((e) => { setEventi(e); setNota(undefined) })
      .catch(() => setNota('I passaggi di mano non si leggono adesso: riprova tra poco.'))
  }
  useEffect(rileggi, [])
  const elenco = eventi ?? []
  const mostrati = tutti ? elenco : elenco.slice(0, PRIME)
  return (
    <div className="errori">
      <div className="impostazioni__riga">
        <span className="con-aiuto">
          {eventi === undefined ? 'Passaggi di mano…' : elenco.length === 0 ? 'Nessun passaggio di mano' : `Passaggi di mano: ${elenco.length}`}
          <Aiuto di="Passaggi di mano">Quando un lavoro è mandato a un altro PC della rete e quel PC non può farlo (per esempio gli manca il progetto), o lo rifiuta, o lo passa a un altro PC, o si arrende, qui resta scritto: quando, quale lavoro, da che PC a che PC e perché. I più recenti sono in cima. Si tengono gli ultimi 500.</Aiuto>
        </span>
        <button className="tasto" onClick={rileggi}>Aggiorna</button>
      </div>
      {mostrati.length > 0 ? (
        <ul className="errori__elenco">
          {mostrati.map((e, i) => (
            <li key={`${e.lavoroId}|${e.quando}|${e.tipo}|${i}`} className="errori__voce" title={`${e.compito}\n${e.daPc} → ${e.aPc}${e.risorsa !== undefined ? `\nManca: ${e.risorsa}` : ''}`}>
              <span className="errori__quando">{oraBreve(e.quando)} · {ETICHETTA[e.tipo]}</span>
              <span className="errori__messaggio">{e.compito}: {e.motivo}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {elenco.length > PRIME ? <button className="tasto" onClick={() => setTutti(!tutti)}>{tutti ? 'Mostra meno' : `Mostra tutti (${elenco.length})`}</button> : null}
      {nota !== undefined ? <div className="impostazioni__nota">{nota}</div> : null}
    </div>
  )
}
