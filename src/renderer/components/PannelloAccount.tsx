import { useEffect, useState } from 'react'
import {
  registra, entra, esci, utenteCorrente, suCambioAccesso, type Utente
} from '../accesso-supabase'

type Props = { onChiudi: () => void }

/**
 * L'accesso, e cosa sblocca.
 *
 * Non blocca il programma: è un pannello come gli altri. Da qui ci si registra e
 * si entra; da entrato, l'account è la chiave del recupero fra PC — la
 * sincronizzazione cifrata dei propri dati — che si aggancia qui man mano.
 */
export function PannelloAccount({ onChiudi }: Props): React.JSX.Element {
  const [utente, setUtente] = useState<Utente | undefined>(undefined)
  const [modo, setModo] = useState<'entra' | 'registra'>('entra')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [messaggio, setMessaggio] = useState<string | undefined>(undefined)
  const [inCorso, setInCorso] = useState(false)

  useEffect(() => {
    utenteCorrente().then(setUtente).catch(() => setUtente(undefined))
    return suCambioAccesso(setUtente)
  }, [])

  const invia = (): void => {
    if (inCorso || email.trim() === '' || password === '') return
    setInCorso(true)
    setMessaggio(undefined)
    const azione = modo === 'registra' ? registra : entra
    void azione(email.trim(), password)
      .then((esito) => {
        if (esito.stato === 'entrato') { setUtente(esito.utente); setPassword('') }
        else if (esito.stato === 'confermaEmail') {
          setMessaggio('Ti abbiamo scritto: conferma l’email dal link, poi entra.')
        } else setMessaggio(esito.messaggio)
      })
      .catch((e: unknown) => setMessaggio(String(e)))
      .finally(() => setInCorso(false))
  }

  return (
    <div className="pannello pannello--account">
      <div className="pannello__testa">
        <strong>Account</strong>
        <span className="sezione--vuota" style={{ flex: 1 }} />
        <button className="tasto" onClick={onChiudi}>Chiudi</button>
      </div>

      {utente !== undefined ? (
        <div className="account">
          <p className="account__chi">
            Sei entrato come <strong>{utente.email}</strong>.
          </p>
          <p className="riga__stato">
            Il tuo account è la chiave del recupero fra computer: presto, da qui, i tuoi dati
            (chat, quaderno, workspace) si sincronizzano cifrati, così su un altro PC accedi e
            ritrovi tutto. La cifratura è tua: nemmeno noi possiamo leggerli.
          </p>
          <div className="account__tasti">
            <button className="tasto" onClick={() => void esci()}>Esci</button>
          </div>
        </div>
      ) : (
        <div className="account">
          <div className="account__scelta">
            <button
              className={modo === 'entra' ? 'tasto tasto--primario' : 'tasto'}
              onClick={() => { setModo('entra'); setMessaggio(undefined) }}
            >
              Entra
            </button>
            <button
              className={modo === 'registra' ? 'tasto tasto--primario' : 'tasto'}
              onClick={() => { setModo('registra'); setMessaggio(undefined) }}
            >
              Registrati
            </button>
          </div>

          <input
            className="account__campo"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email"
            aria-label="email"
            autoComplete="email"
          />
          <input
            className="account__campo"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') invia() }}
            placeholder="password"
            aria-label="password"
            autoComplete={modo === 'registra' ? 'new-password' : 'current-password'}
          />

          {messaggio !== undefined ? <div className="riga__stato">{messaggio}</div> : null}

          <div className="account__tasti">
            <button
              className="tasto tasto--primario"
              onClick={invia}
              disabled={inCorso || email.trim() === '' || password === ''}
            >
              {inCorso ? 'un attimo…' : modo === 'registra' ? 'Crea l’account' : 'Entra'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
