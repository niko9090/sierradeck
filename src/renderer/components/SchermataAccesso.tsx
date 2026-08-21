import { useState } from 'react'
import { registra, entra, verificaCodice, reinviaCodice } from '../accesso-supabase'
import { valutaPassword, REGOLE_PASSWORD } from '@shared/password'

type Props = {
  /** Chiamata quando l'utente è entrato: l'accesso ora è obbligatorio, non c'è un «senza account». */
  onDentro: () => void
  /** Mostra solo l'intro con lo spinner, senza i campi: l'avvio, prima di sapere se c'è una sessione. */
  caricamento?: boolean
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
 * registrati, o prosegui senza account. Chi ha già una sessione non la vede.
 *
 * La conferma della registrazione è a **codice**, non a link: la mail porta un
 * codice che si digita qui (fase «codice»). Su desktop è la via giusta — un link
 * di conferma punterebbe a `localhost`, che non è nessun posto.
 *
 * L'animazione è tutta di trasformazioni e opacità (aurora, il cristallo che
 * fluttua, la luce che lo attraversa): scivola a 60fps e resta nitida.
 */
export function SchermataAccesso({ onDentro, caricamento = false }: Props): React.JSX.Element {
  const [fase, setFase] = useState<'form' | 'codice'>('form')
  const [modo, setModo] = useState<'entra' | 'registra'>('entra')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [codice, setCodice] = useState('')
  const [messaggio, setMessaggio] = useState<string | undefined>(undefined)
  const [inCorso, setInCorso] = useState(false)

  const regole = valutaPassword(password)
  const coincidono = password2 === password
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
        else if (esito.stato === 'confermaEmail') { setCodice(''); setFase('codice') }
        else {
          // Provi a entrare ma non hai confermato l'email: si va al codice e lo
          // si rimanda, invece di lasciarti su un errore che non sai risolvere.
          const m = esito.messaggio.toLowerCase()
          if (modo === 'entra' && (m.includes('confirm') || m.includes('conferma'))) {
            setCodice('')
            setFase('codice')
            setMessaggio('Prima devi confermare l’email: ti ho rimandato il codice.')
            void reinviaCodice(email.trim())
          } else setMessaggio(esito.messaggio)
        }
      })
      .catch((e: unknown) => setMessaggio(String(e)))
      .finally(() => setInCorso(false))
  }

  const verifica = (): void => {
    if (inCorso || codice.trim() === '') return
    setInCorso(true)
    setMessaggio(undefined)
    void verificaCodice(email.trim(), codice)
      .then((esito) => {
        if (esito.stato === 'entrato') onDentro()
        else setMessaggio(esito.stato === 'errore' ? esito.messaggio : 'codice non valido')
      })
      .catch((e: unknown) => setMessaggio(String(e)))
      .finally(() => setInCorso(false))
  }

  const reinvia = (): void => {
    void reinviaCodice(email.trim())
      .then((r) => setMessaggio(r.ok ? 'Ti abbiamo rimandato il codice.' : (r.messaggio ?? 'invio non riuscito')))
      .catch((e: unknown) => setMessaggio(String(e)))
  }

  return (
    <div className="accesso-schermata">
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

        {caricamento ? (
          <div className="accesso-spinner" role="status" aria-label="caricamento" />
        ) : (
        <div className="accesso-carta">
          {fase === 'codice' ? (
            <>
              <p className="accesso-conferma">
                Ti abbiamo mandato un <strong>codice</strong> a<br />
                <strong>{email.trim()}</strong>. Scrivilo qui per confermare.
              </p>
              <input
                className="account__campo accesso-codice"
                value={codice}
                onChange={(e) => setCodice(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') verifica() }}
                placeholder="codice"
                aria-label="codice di conferma"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
              />
              {messaggio !== undefined ? <div className="riga__stato">{messaggio}</div> : null}
              <button
                className="tasto tasto--primario accesso-invia"
                onClick={verifica}
                disabled={inCorso || codice.trim() === ''}
              >
                {inCorso ? 'un attimo…' : 'Conferma'}
              </button>
              <button className="accesso-offline" onClick={reinvia}>Non è arrivato? Rimanda il codice</button>
              <button
                className="accesso-offline"
                onClick={() => { setFase('form'); setMessaggio(undefined) }}
              >
                ← Torna indietro
              </button>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
        )}
      </div>
    </div>
  )
}
