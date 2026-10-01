import { useEffect, useState } from 'react'
import type { Autopilota } from '@shared/autopilota'
import { etichettaOrigine, richiestaScheda, type DomandaScheda } from '@shared/domande-autopilota'

/**
 * La linguetta «Domande» della scheda dell'autopilota (0.38.0).
 *
 * Nicholas (01/10): le domande di un autopilota si vedono qui, **una per
 * volta**, come scheda singola — il testo intero, le opzioni da toccare, la
 * casella libera, «1 di N» — e non nella chat. Quando rispondi, la risposta
 * va al servizio come sempre e nella chat con lui entrano la domanda e la
 * risposta, una sotto l'altra; la linguetta passa alla successiva o, finite,
 * si chiude e torna dov'eri.
 */
export function DomandeAutopilota({
  autopilota,
  domande,
  onRisposto
}: {
  autopilota: Autopilota
  domande: DomandaScheda[]
  /** Dopo una risposta: chi ci sta sopra rilegge domande e stato adesso. */
  onRisposto: () => void
}): React.JSX.Element {
  const [indice, setIndice] = useState(0)
  const [testo, setTesto] = useState('')
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const i = Math.min(indice, Math.max(0, domande.length - 1))
  const d = domande[i]
  // Cambiando domanda il campo si svuota: rispondere alla domanda sbagliata
  // con il testo di un'altra sarebbe peggio che non rispondere.
  useEffect(() => { setTesto(''); setErrore(undefined) }, [d?.chiave])

  if (d === undefined) {
    return <p className="diario__vuoto">Nessuna domanda aperta: quando l’autopilota te ne fa una, compare qui.</p>
  }

  const manda = (risposta: string): void => {
    const r = risposta.trim()
    if (r === '' || inCorso) return
    setInCorso(true)
    setErrore(undefined)
    const q = richiestaScheda(d, autopilota.id, r)
    window.gestore.domande
      .chiama(q.percorso, q.corpo)
      .then((esito) => {
        if (esito.stato >= 400) throw new Error((esito.corpo as { errore?: string })?.errore ?? `errore ${esito.stato}`)
        setTesto('')
        setIndice(0)
        onRisposto()
      })
      .catch((e: unknown) => setErrore(e instanceof Error ? e.message : String(e)))
      .finally(() => setInCorso(false))
  }

  return (
    <div className="domande-ap" aria-label="Domande dell’autopilota">
      <div className="domande-ap__testa">
        <span className="misura">{etichettaOrigine(d)}</span>
        <span style={{ flex: 1 }} />
        {domande.length > 1 ? (
          <span className="domande-ap__conto">
            <button className="tasto tasto--mini" disabled={i === 0} onClick={() => setIndice(i - 1)} aria-label="Domanda precedente">‹</button>
            {' '}{i + 1} di {domande.length}{' '}
            <button className="tasto tasto--mini" disabled={i >= domande.length - 1} onClick={() => setIndice(i + 1)} aria-label="Domanda successiva">›</button>
          </span>
        ) : null}
      </div>
      <div className="domande-ap__testo">{d.testo}</div>
      {d.opzioni.length > 0 ? (
        <div className="domande-ap__opzioni">
          {d.opzioni.map((o) => (
            <button key={o} className="tasto tasto--primario" disabled={inCorso} onClick={() => manda(o)} title="Risponde con questo testo">
              {o}
            </button>
          ))}
        </div>
      ) : null}
      <textarea
        className="campo domande-ap__campo"
        rows={3}
        value={testo}
        placeholder={d.tipo === 'via' ? 'Oppure scrivigli cosa cambiare prima di partire' : 'La tua risposta, con parole tue — Ctrl+Invio manda'}
        onChange={(e) => setTesto(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) manda(testo) }}
      />
      <div className="domande-ap__tasti">
        <button className="tasto tasto--primario" disabled={inCorso || testo.trim() === ''} onClick={() => manda(testo)}>
          {inCorso ? 'Mando…' : d.tipo === 'via' ? 'Manda' : 'Rispondi'}
        </button>
      </div>
      {errore !== undefined ? <div className="avviso">⚠ {errore}</div> : null}
      <p className="misura domande-ap__nota">
        {d.tipo === 'via'
          ? '«Vai» lo fa partire con i criteri e i compiti che vedi nelle linguette; se scrivi altro gli arriva come messaggio e ti risponde nella chat qui sopra.'
          : 'La risposta arriva subito all’autopilota, che riparte da lì. Nella chat qui sopra restano la domanda e la tua risposta, una sotto l’altra. Se ce ne sono altre, la linguetta passa alla successiva; finite, si chiude.'}
      </p>
    </div>
  )
}
