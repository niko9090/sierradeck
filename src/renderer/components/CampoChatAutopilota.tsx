import { memo, useEffect, useRef, useState } from 'react'
import { invioManda, SUGGERIMENTO_INVIO } from '@shared/invio-manda'
import { Aiuto } from './Aiuto'
import { testoErroreDialogo } from '../errore-dialogo'
import { TastoMicrofono } from './TastoMicrofono'
import { comandoVocale, type ComandoVocale } from '@shared/voce-autopilota'
import { useImpostazioniVoce, voce } from '../voce'
import { ascolto } from '../ascolto'

type Props = {
  autopilotaId: string
  /** Qualcosa è cambiato: chi ci sta sopra deve rileggere lo stato adesso. */
  onCambiato: () => void
  /** Prende il fuoco quando si apre, se nessun altro campo lo ha già (0.79.0). */
  campoPronto: boolean
  /** k-60: come si manda il testo (autopilota di un altro PC); senza, al servizio di qui. Non fa ridisegnare il campo. */
  invia?: (testo: string) => Promise<unknown>
  /** 13/11: con la conversazione a voce, «riassunto» e «riassunto generale» detti nel campo. */
  suComando?: (c: ComandoVocale) => void
}

/**
 * Dopo quanta quiete nella dettatura si considera finito il tuo parlare (la
 * voce riprende). Il testo dettato NON parte mai da solo (Nicholas, 13/11:
 * in Normale si manda con «Manda»; a mani libere c'è Parlato).
 */
const QUIETE_ASCOLTO_MS = 30_000

/**
 * Il campo per scrivere all'autopilota (0.85.1, Nicholas 23/10: «il testo non
 * scorre fluido»). Il testo sta qui, non nella chat intera: una lettera
 * ridisegna solo il campo, non la conversazione con centinaia di righe. Una
 * rilettura dal servizio (ogni 5 s mentre lavora) non ridisegna il campo:
 * conta solo se cambia l'autopilota o il fuoco — vedi `stessoCampo`.
 */
function CampoChatAutopilotaVero({ autopilotaId, onCambiato, campoPronto, invia, suComando }: Props): React.JSX.Element {
  const [messaggio, setMessaggio] = useState('')
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  // Il campo, per il microfono (0.75.0): la dettatura scrive dove c'è il fuoco.
  const campo = useRef<HTMLTextAreaElement | null>(null)
  // La funzione di chi sta sopra cambia a ogni suo disegno: si usa l'ultima, senza ridisegnare il campo.
  const cambiato = useRef(onCambiato)
  cambiato.current = onCambiato
  const inviaRef = useRef(invia)
  inviaRef.current = invia
  const comandoRef = useRef(suComando)
  comandoRef.current = suComando
  // 13/11: la conversazione a voce. `dettando`: hai premuto 🎤 e non hai ancora mandato.
  const imp = useImpostazioniVoce()
  const [dettando, setDettando] = useState<{ prima: string } | undefined>(undefined)
  const finisciDettato = (): void => { setDettando(undefined); voce.fineAscolto(); ascolto.dettatura(false) }

  // Il campo che si chiude con la dettatura aperta non deve lasciare Parlato sordo.
  useEffect(() => () => { ascolto.dettatura(false) }, [])

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
      .catch((e: unknown) => setErrore(testoErroreDialogo(e)))
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
    if (dettando !== undefined) finisciDettato()
    // Con la conversazione a voce alcune parole sono comandi di qui, non messaggi.
    const comando = imp.conversazione ? comandoVocale(testo) : undefined
    if (comando !== undefined) {
      setMessaggio('')
      if (comando === 'zitto') voce.zitto()
      else if (comando === 'ripeti') voce.ripeti()
      else comandoRef.current?.(comando)
      return
    }
    esegui(() => (inviaRef.current !== undefined ? inviaRef.current(testo) : window.gestore.autopilota.dialoga(autopilotaId, testo)))
  }

  // Dettando: dopo una quiete lunga si considera finito il tuo parlare e la voce riprende.
  // Niente parte da solo: «Manda» lo premi tu (`regoleModo(...).dettatoParteDaSolo` è sempre falso).
  useEffect(() => {
    if (dettando === undefined) return
    const t = setTimeout(finisciDettato, QUIETE_ASCOLTO_MS)
    return () => clearTimeout(t)
  }, [messaggio, dettando])

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
          if (invioManda({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing, keyCode: e.nativeEvent.keyCode })) { e.preventDefault(); manda() }
        }}
      />
      <div className="chatap__tasti">
        <button
          className="tasto tasto--primario"
          disabled={inCorso || messaggio.trim() === ''}
          onClick={manda}
          title={SUGGERIMENTO_INVIO}
        >
          {inCorso ? 'Mando…' : 'Manda'}
        </button>
        <TastoMicrofono campo={campo} onApri={() => { voce.inizioAscolto(); ascolto.dettatura(true); setDettando({ prima: messaggio }) }} />
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
