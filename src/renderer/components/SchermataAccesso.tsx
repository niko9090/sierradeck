import { useState } from 'react'
import { registra, entra } from '../accesso-supabase'

type Props = {
  /** Chiamata quando l'utente ha deciso: è entrato, oppure ha scelto di usare senza account. */
  onDentro: () => void
}

/**
 * La schermata dell'accesso, all'avvio.
 *
 * Compare prima del programma quando non c'è una sessione: così l'account non è
 * una cosa nascosta in un pannello che nessuno apre, ma una **scelta** che si fa
 * ogni volta finché non si ha un account. Non obbliga: si può entrare,
 * registrarsi, oppure proseguire **senza account** — l'utente decide, ma
 * consapevolmente. Chi ha già fatto l'accesso non la vede: entra dritto.
 */
export function SchermataAccesso({ onDentro }: Props): React.JSX.Element {
  const [modo, setModo] = useState<'entra' | 'registra'>('entra')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [messaggio, setMessaggio] = useState<string | undefined>(undefined)
  const [inCorso, setInCorso] = useState(false)

  const invia = (): void => {
    if (inCorso || email.trim() === '' || password === '') return
    setInCorso(true)
    setMessaggio(undefined)
    const azione = modo === 'registra' ? registra : entra
    void azione(email.trim(), password)
      .then((esito) => {
        if (esito.stato === 'entrato') onDentro()
        else if (esito.stato === 'confermaEmail') {
          setMessaggio('Ti abbiamo scritto: conferma l’email dal link, poi entra.')
        } else setMessaggio(esito.messaggio)
      })
      .catch((e: unknown) => setMessaggio(String(e)))
      .finally(() => setInCorso(false))
  }

  return (
    <div className="accesso-schermata">
      <div className="accesso-carta">
        <div className="accesso-marchio">SierraDeck</div>
        <p className="accesso-intro">
          Accedi per ritrovare le tue chat, il quaderno e i workspace su qualunque computer.
          La cifratura è tua: nemmeno noi possiamo leggerli.
        </p>

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
          autoFocus
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

        <button
          className="tasto tasto--primario accesso-invia"
          onClick={invia}
          disabled={inCorso || email.trim() === '' || password === ''}
        >
          {inCorso ? 'un attimo…' : modo === 'registra' ? 'Crea l’account' : 'Entra'}
        </button>

        <button className="accesso-offline" onClick={onDentro}>
          Usa senza account, per ora
        </button>
      </div>
    </div>
  )
}
