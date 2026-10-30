import { memo, useEffect, useRef, useState } from 'react'
import { Aiuto } from './Aiuto'
import { TastoMicrofono } from './TastoMicrofono'

type Props = {
  autopilotaId: string
  /** Qualcosa è cambiato: chi ci sta sopra deve rileggere lo stato adesso. */
  onCambiato: () => void
  /** Prende il fuoco quando si apre, se nessun altro campo lo ha già (0.79.0). */
  campoPronto: boolean
}

/**
 * Il campo per scrivere all'autopilota (0.85.1, Nicholas 23/10: «il testo non
 * scorre fluido»). Il testo sta qui, non nella chat intera: una lettera
 * ridisegna solo il campo, non la conversazione con centinaia di righe. Una
 * rilettura dal servizio (ogni 5 s mentre lavora) non ridisegna il campo:
 * conta solo se cambia l'autopilota o il fuoco — vedi `stessoCampo`.
 */
function CampoChatAutopilotaVero({ autopilotaId, onCambiato, campoPronto }: Props): React.JSX.Element {
  const [messaggio, setMessaggio] = useState('')
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  // Il campo, per il microfono (0.75.0): la dettatura scrive dove c'è il fuoco.
  const campo = useRef<HTMLTextAreaElement | null>(null)
  // La funzione di chi sta sopra cambia a ogni suo disegno: si usa l'ultima, senza ridisegnare il campo.
  const cambiato = useRef(onCambiato)
  cambiato.current = onCambiato

  useEffect(() => {
    if (!campoPronto) return
    const attivo = document.activeElement
    if (attivo === null || attivo === document.body) campo.current?.focus()
  }, [campoPronto])

  const esegui = (che: () => Promise<unknown>): void => {
    setInCorso(true)
    setErrore(undefined)
    che()
      .then(() => { setMessaggio(''); cambiato.current() })
      .catch((e: unknown) => setErrore(String(e instanceof Error ? e.message : e)))
      .finally(() => setInCorso(false))
  }

  /**
   * Manda quello che hai scritto: a una domanda aperta si risponde, altrimenti
   * gli si parla. La risposta a una domanda arriva subito alla chat ferma; la
   * risposta a una battuta la scrive il supervisore, in qualche minuto.
   */
  const manda = (): void => {
    const testo = messaggio.trim()
    if (testo === '' || inCorso) return
    esegui(() => window.gestore.autopilota.dialoga(autopilotaId, testo))
  }

  return (
    <div className="chatap__scrivi">
      <textarea
        ref={campo}
        className="campo chatap__campo"
        rows={3}
        style={{ resize: 'vertical' }}
        value={messaggio}
        // 0.81.0: corto, perché nella colonna stretta la parte fra parentesi veniva tagliata;
        // dove stanno le sue domande lo dice il «?» qui sotto.
        placeholder="scrivigli: una domanda, un vincolo, un compito in più, «fermati», «riprendi»…"
        aria-label="scrivi all autopilota"
        onChange={(e) => setMessaggio(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) manda()
        }}
      />
      <div className="chatap__tasti">
        <button
          className="tasto tasto--primario"
          disabled={inCorso || messaggio.trim() === ''}
          onClick={manda}
          title="Ctrl+Invio manda"
        >
          {inCorso ? 'Mando…' : 'Manda'}
        </button>
        <TastoMicrofono campo={campo} />
        <Aiuto di="come parlare all’autopilota">Qui parli con l’autopilota del workspace, non con le chat che lavorano. Ogni cosa che gli chiedi va nella sua coda: la unisce alle richieste sulla stessa cosa, fa il piano e lancia gli specialisti. Ti risponde con parole sue, di solito entro qualche minuto. Le sue domande non stanno qui: stanno nella colonna Domande, e dopo la risposta domanda e risposta compaiono in questa chat.</Aiuto>
      </div>
      {errore !== undefined ? <div className="avviso">⚠ {errore}</div> : null}
    </div>
  )
}

/** Il campo si ridisegna solo se cambia qualcosa che mostra: mai per la sola funzione nuova di chi sta sopra. */
export function stessoCampo(a: Props, b: Props): boolean {
  return a.autopilotaId === b.autopilotaId && a.campoPronto === b.campoPronto
}

export const CampoChatAutopilota = memo(CampoChatAutopilotaVero, stessoCampo)
