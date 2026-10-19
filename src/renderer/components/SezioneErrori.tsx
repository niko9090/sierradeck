import { useEffect, useState } from 'react'
import { oraBreve, type VoceErrore } from '@shared/storico-errori'
import { Aiuto } from './Aiuto'

/** Quante voci si vedono prima di «Mostra tutti». */
const PRIME = 5

/**
 * La voce «Errori» delle Impostazioni (0.81.0): lo storico degli errori di
 * questo PC, programma e servizio insieme, e «Copia» per incollarlo a una chat.
 * Testi corti, il resto dietro i «?».
 */
export function SezioneErrori(): React.JSX.Element {
  const [storico, setStorico] = useState<{ voci: VoceErrore[]; testo: string } | undefined>(undefined)
  const [tutti, setTutti] = useState(false)
  const [nota, setNota] = useState<string | undefined>(undefined)
  const rileggi = (): void => { void window.gestore.errori.storico().then(setStorico).catch(() => setNota('Lo storico non si legge adesso: riprova tra poco.')) }
  useEffect(rileggi, [])
  const copia = (): void => {
    if (storico === undefined) return
    void navigator.clipboard.writeText(storico.testo)
      .then(() => setNota('Copiato: incollalo nella chat che deve correggerli.'))
      .catch(() => setNota('Non riesco a copiare: riprova.'))
  }
  const voci = storico?.voci ?? []
  const volte = voci.reduce((s, v) => s + v.volte, 0)
  const mostrate = tutti ? voci : voci.slice(0, PRIME)
  return (
    <div className="errori">
      <div className="impostazioni__riga">
        <span className="con-aiuto">
          {storico === undefined ? 'Errori…' : voci.length === 0 ? 'Nessun errore registrato' : `${voci.length} ${voci.length === 1 ? 'errore' : 'errori diversi'}, ${volte} ${volte === 1 ? 'volta' : 'volte'}`}
          <Aiuto di="Errori">Gli errori del programma e del servizio degli autopiloti su questo PC: quando, dove, cosa si stava facendo, il messaggio e il punto del codice. Gli stessi errori ripetuti sono una riga sola con il conteggio. Password, chiavi, gettoni e il nome del PC sono tolti prima di salvare.</Aiuto>
        </span>
        <button className="tasto" onClick={rileggi}>Aggiorna</button>
        <button className="tasto" onClick={copia} disabled={voci.length === 0}>Copia</button>
        <Aiuto di="Copia">Copia tutto lo storico in un testo pronto da incollare in una chat: chi lo legge sa cosa è successo e dove guardare.</Aiuto>
      </div>
      {mostrate.length > 0 ? (
        <ul className="errori__elenco">
          {mostrate.map((v) => (
            <li key={`${v.dove}|${v.quando}|${v.messaggio}`} className="errori__voce" title={[v.cosa !== undefined ? `Cosa si faceva: ${v.cosa}` : '', v.punto !== undefined ? `Punto: ${v.punto}` : ''].filter(Boolean).join('\n')}>
              <span className="errori__quando">{oraBreve(v.ultima)}{v.volte > 1 ? ` · ${v.volte} volte` : ''}</span>
              <span className="errori__messaggio">{v.messaggio}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {voci.length > PRIME ? <button className="tasto" onClick={() => setTutti(!tutti)}>{tutti ? 'Mostra meno' : `Mostra tutti (${voci.length})`}</button> : null}
      {nota !== undefined ? <div className="impostazioni__nota">{nota}</div> : null}
    </div>
  )
}
