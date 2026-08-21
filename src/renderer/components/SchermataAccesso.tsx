import { useState } from 'react'
import { registra, entra } from '../accesso-supabase'
import { valutaPassword, REGOLE_PASSWORD } from '@shared/password'

type Props = {
  /** Chiamata quando l'utente ha deciso: è entrato, oppure ha scelto di usare senza account. */
  onDentro: () => void
}

/** Il marchio: lo stesso cristallo dell'icona, in grande. SVG, quindi nitido a ogni misura. */
function Cristallo(): React.JSX.Element {
  return (
    <svg className="accesso-cristallo" viewBox="0 0 512 512" aria-hidden="true">
      <path d="M268 92 L392 306 L268 306 Z" fill="#dfe3e7" />
      <path d="M268 92 L132 306 L268 306 Z" fill="#7d858d" />
      <path d="M132 306 L268 306 L200 412 Z" fill="#525a62" />
      <path d="M268 306 L392 306 L326 412 Z" fill="#363d44" />
      <path d="M200 412 L326 412 L268 306 Z" fill="#252b31" />
      <path d="M268 92 L312 168 L268 168 Z" fill="#54c07a" />
    </svg>
  )
}

/**
 * La schermata dell'accesso, all'avvio.
 *
 * A tutto schermo: il marchio grande, una frase, e la scelta — entra,
 * registrati, o prosegui senza account. Compare prima del programma quando non
 * c'è una sessione, così l'account è una decisione consapevole invece di un
 * pannello che nessuno apre; chi ha già fatto l'accesso non la vede.
 *
 * L'animazione è tutta di trasformazioni e opacità (l'aurora che scorre, il
 * cristallo che fluttua, la luce che lo attraversa): scivola a 60fps, e in SVG
 * resta nitida a qualunque risoluzione.
 */
export function SchermataAccesso({ onDentro }: Props): React.JSX.Element {
  const [modo, setModo] = useState<'entra' | 'registra'>('entra')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [messaggio, setMessaggio] = useState<string | undefined>(undefined)
  const [inCorso, setInCorso] = useState(false)

  const regole = valutaPassword(password)
  const coincidono = password2 === password
  // In registrazione servono le regole e la doppia digitazione; per entrare no,
  // basta la password che l'utente ha già (le regole di ieri non sono affari di oggi).
  const puoInviare =
    email.trim() !== '' && password !== '' && (modo === 'entra' || (regole.ok && coincidono))

  const invia = (): void => {
    if (inCorso || !puoInviare) return
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
      {/* Lo sfondo vivo: tre aloni che scorrono piano, sfocati, uno verde. */}
      <div className="accesso-aurora accesso-aurora--1" />
      <div className="accesso-aurora accesso-aurora--2" />
      <div className="accesso-aurora accesso-aurora--3" />

      <div className="accesso-contenuto">
        <div className="accesso-marchio">
          <div className="accesso-logo">
            <div className="accesso-logo__alone" />
            <Cristallo />
            <div className="accesso-logo__luce" />
          </div>
          <h1 className="accesso-nome">SierraDeck</h1>
          <p className="accesso-frase">Riprendi da dove eri. Su qualsiasi schermo.</p>
        </div>

        <div className="accesso-carta">
          <div className="account__scelta">
            <button
              className={modo === 'entra' ? 'tasto tasto--primario' : 'tasto'}
              onClick={() => { setModo('entra'); setMessaggio(undefined); setPassword2('') }}
            >
              Entra
            </button>
            <button
              className={modo === 'registra' ? 'tasto tasto--primario' : 'tasto'}
              onClick={() => { setModo('registra'); setMessaggio(undefined); setPassword2('') }}
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

          {modo === 'registra' ? (
            <>
              <input
                className="account__campo"
                type="password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') invia() }}
                placeholder="ripeti la password"
                aria-label="ripeti la password"
                autoComplete="new-password"
              />
              <ul className="accesso-regole" aria-label="requisiti della password">
                {REGOLE_PASSWORD.map((r) => (
                  <li
                    key={r.chiave}
                    className={regole[r.chiave] ? 'accesso-regola accesso-regola--ok' : 'accesso-regola'}
                  >
                    <span className="accesso-regola__segno">{regole[r.chiave] ? '✓' : '○'}</span>
                    {r.testo}
                  </li>
                ))}
                <li
                  className={
                    password2 === ''
                      ? 'accesso-regola'
                      : coincidono
                        ? 'accesso-regola accesso-regola--ok'
                        : 'accesso-regola accesso-regola--no'
                  }
                >
                  <span className="accesso-regola__segno">
                    {password2 === '' ? '○' : coincidono ? '✓' : '✗'}
                  </span>
                  le due password coincidono
                </li>
              </ul>
            </>
          ) : null}

          {messaggio !== undefined ? <div className="riga__stato">{messaggio}</div> : null}

          <button
            className="tasto tasto--primario accesso-invia"
            onClick={invia}
            disabled={inCorso || !puoInviare}
          >
            {inCorso ? 'un attimo…' : modo === 'registra' ? 'Crea l’account' : 'Entra'}
          </button>
        </div>

        <button className="accesso-offline" onClick={onDentro}>
          Usa senza account, per ora
        </button>
      </div>
    </div>
  )
}
