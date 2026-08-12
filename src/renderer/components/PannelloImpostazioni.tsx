import { useEffect, useState } from 'react'
import {
  coloreValido, portaValida, PREFERENZE_PREDEFINITE, type Preferenze
} from '@shared/preferenze'

type Props = { onChiudi: () => void }

/** I colori proposti: chi non ha voglia di sceglierne uno preme e va avanti. */
const ACCENTI = ['#4aa3ff', '#54c07a', '#e0a33c', '#dc5f5f', '#b18cf0', '#37c8c3']

/**
 * Le impostazioni: quello che finora decideva il codice.
 *
 * Ogni valore aveva un predefinito scelto da chi ha scritto il programma — che
 * va benissimo finché la porta non è occupata o il grigio non stanca gli occhi.
 * Le modifiche si applicano mentre le fai: cambiare colore e dover premere
 * «Salva» per vedere com'è significa sceglierlo alla cieca.
 */
export function PannelloImpostazioni({ onChiudi }: Props): React.JSX.Element {
  const [p, setP] = useState<Preferenze>(PREFERENZE_PREDEFINITE)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const [salvato, setSalvato] = useState(false)

  useEffect(() => {
    window.gestore.preferenze.leggi().then(setP).catch(() => undefined)
  }, [])

  const cambia = (parziale: Partial<Preferenze>): void => {
    const nuove = { ...p, ...parziale }
    setP(nuove)
    setSalvato(false)
    // Le porte si scrivono una cifra per volta: mentre «476» non è ancora una
    // porta valida, salvarla sarebbe rifiutarla in faccia a chi sta digitando.
    if (!portaValida(nuove.portaClient) || !portaValida(nuove.portaAutopiloti)) {
      setErrore('Le porte vanno da 1024 a 65535.')
      return
    }
    if (!coloreValido(nuove.accento)) return
    setErrore(undefined)
    window.gestore.preferenze
      .imposta(nuove)
      .then(() => setSalvato(true))
      .catch((e: unknown) => setErrore(String(e)))
  }

  return (
    <div className="pannello pannello--impostazioni">
      <div className="pannello__testa">
        <strong>Impostazioni</strong>
        {salvato ? <span className="riga__stato">salvate</span> : null}
        <span style={{ flex: 1 }} />
        <button className="tasto" onClick={() => cambia(PREFERENZE_PREDEFINITE)}>
          Torna ai valori di fabbrica
        </button>
        <button className="tasto" onClick={onChiudi}>Chiudi</button>
      </div>

      {errore !== undefined ? <div className="riga__stato" style={{ color: 'var(--ambra)' }}>{errore}</div> : null}

      <div className="impostazioni">
        <section className="impostazioni__gruppo">
          <h4>Aspetto</h4>
          <label className="impostazioni__riga">
            <span>Colore</span>
            <span className="accenti">
              {ACCENTI.map((c) => (
                <button
                  key={c}
                  className={c === p.accento ? 'accento accento--scelto' : 'accento'}
                  style={{ background: c }}
                  onClick={() => cambia({ accento: c })}
                  aria-label={`colore ${c}`}
                />
              ))}
              <input
                type="color"
                className="accento accento--libero"
                value={p.accento}
                onChange={(e) => cambia({ accento: e.target.value })}
                aria-label="scegli un colore qualunque"
              />
            </span>
          </label>
          <label className="impostazioni__riga">
            <span>Chiarore del fondo</span>
            <input
              type="range"
              min={0}
              max={100}
              value={p.chiarore}
              onChange={(e) => cambia({ chiarore: Number(e.target.value) })}
            />
          </label>
        </section>

        <section className="impostazioni__gruppo">
          <h4>Rete</h4>
          <label className="impostazioni__riga">
            <span>Porta del Client</span>
            <input
              type="number"
              value={p.portaClient}
              onChange={(e) => cambia({ portaClient: Number(e.target.value) })}
            />
          </label>
          <label className="impostazioni__riga">
            <span>Porta degli autopiloti</span>
            <input
              type="number"
              value={p.portaAutopiloti}
              onChange={(e) => cambia({ portaAutopiloti: Number(e.target.value) })}
            />
          </label>
          <div className="impostazioni__nota">
            Le porte cambiate valgono al prossimo avvio: un servizio in ascolto non
            cambia porta mentre qualcuno ci sta parlando.
          </div>
        </section>

        <section className="impostazioni__gruppo">
          <h4>Comportamento</h4>
          <label className="impostazioni__riga impostazioni__riga--spunta">
            <input
              type="checkbox"
              checked={p.salvaAllaChiusura}
              onChange={(e) => cambia({ salvaAllaChiusura: e.target.checked })}
            />
            <span>Salva le chat aperte quando chiudo — saltando quelle già salvate</span>
          </label>
          <label className="impostazioni__riga impostazioni__riga--spunta">
            <input
              type="checkbox"
              checked={p.mostraAttesaChat}
              onChange={(e) => cambia({ mostraAttesaChat: e.target.checked })}
            />
            <span>Mostra l’avanzamento mentre una chat lunga si apre</span>
          </label>
        </section>
      </div>
    </div>
  )
}
