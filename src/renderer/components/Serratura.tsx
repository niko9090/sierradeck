import { useEffect, useRef, useState } from 'react'

type Props = {
  /** Il nome del workspace da aprire, se la serratura è di un workspace. */
  workspace?: string
  onAperto: () => void
  /** Presente quando si può rinunciare: aprire un workspace, non il programma. */
  onRinuncia?: () => void
}

/**
 * La richiesta della parola d'ordine.
 *
 * Dice cosa protegge davvero — l'accesso all'interfaccia, non i file sul disco —
 * perché una serratura che promette più di quanto tiene cambia il comportamento
 * di chi ci conta, ed è peggio di nessuna serratura.
 *
 * Nessun conteggio di tentativi e nessun blocco progressivo: chi ha accesso al
 * computer può leggere i file comunque, quindi un blocco non aggiungerebbe
 * sicurezza — aggiungerebbe solo il modo di chiudere fuori il proprietario.
 * A rendere lento chi prova a indovinare ci pensa `scrypt`.
 */
export function Serratura({ workspace, onAperto, onRinuncia }: Props): React.JSX.Element {
  const [parola, setParola] = useState('')
  const [sbagliata, setSbagliata] = useState(false)
  const [inCorso, setInCorso] = useState(false)
  const campo = useRef<HTMLInputElement>(null)

  useEffect(() => { campo.current?.focus() }, [])

  const prova = (e: React.FormEvent): void => {
    e.preventDefault()
    if (inCorso) return
    setInCorso(true)
    window.gestore.chiavi
      .verifica(parola, workspace)
      .then((giusta) => {
        if (giusta) { onAperto(); return }
        setSbagliata(true)
        setParola('')
        campo.current?.focus()
      })
      // Una verifica che non risponde non deve lasciare il campo bloccato per
      // sempre: si torna a poter riprovare, e lo si dice.
      .catch(() => setSbagliata(true))
      .finally(() => setInCorso(false))
  }

  return (
    <div className="serratura">
      <form className="serratura__scheda" onSubmit={prova}>
        <div className="serratura__titolo">
          {workspace === undefined ? 'SierraDeck è chiuso a chiave' : `«${workspace}» è chiuso a chiave`}
        </div>
        <input
          ref={campo}
          className="serratura__campo"
          type="password"
          value={parola}
          onChange={(e) => { setParola(e.target.value); setSbagliata(false) }}
          placeholder="parola d'ordine"
          aria-label="parola d'ordine"
          autoComplete="off"
        />
        {sbagliata ? <div className="serratura__errore">Non è questa.</div> : null}
        <div className="serratura__tasti">
          {onRinuncia !== undefined ? (
            <button type="button" className="tasto" onClick={onRinuncia}>Lascia stare</button>
          ) : null}
          <button type="submit" className="tasto tasto--primario" disabled={inCorso || parola === ''}>
            {inCorso ? 'Controllo…' : 'Apri'}
          </button>
        </div>
        <div className="serratura__nota">
          Chiude l’accesso a questa finestra. Non cifra i file: chi entra nel tuo utente di
          Windows può leggerli comunque.
        </div>
      </form>
    </div>
  )
}
