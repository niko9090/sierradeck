import { useEffect, useState } from 'react'
import {
  registra, entra, esci, utenteCorrente, suCambioAccesso, verificaCodice, reinviaCodice, type Utente
} from '../accesso-supabase'
import { valutaPassword, REGOLE_PASSWORD } from '@shared/password'

type Props = { onChiudi: () => void }

/**
 * Il collegamento al Google Drive dell'utente (il «magazzino» BYOS).
 *
 * Un clic apre il consenso nel browser di sistema; da lì i dati cifrati vivranno
 * nel Drive dell'utente. Qui, per ora, si connette e si vede lo stato: il
 * salvataggio/ripristino veri si agganciano subito dopo, quando c'è la passphrase.
 */
function SezioneDrive(): React.JSX.Element | null {
  const [stato, setStato] = useState<{ configurato: boolean; connesso: boolean } | undefined>(undefined)
  const [inCorso, setInCorso] = useState(false)
  const [msg, setMsg] = useState<string | undefined>(undefined)

  const aggiorna = (): void => { void window.gestore.drive.stato().then(setStato).catch(() => {}) }
  useEffect(aggiorna, [])

  const connetti = (): void => {
    if (inCorso) return
    setInCorso(true); setMsg(undefined)
    void window.gestore.drive.connetti()
      .then((r) => { if (!r.ok) setMsg(r.messaggio ?? 'connessione non riuscita'); aggiorna() })
      .catch((e: unknown) => setMsg(String(e)))
      .finally(() => setInCorso(false))
  }
  const disconnetti = (): void => { void window.gestore.drive.disconnetti().then(aggiorna) }

  if (stato === undefined) return null
  return (
    <div className="account__drive">
      <div className="account__driga">
        <span>Google Drive</span>
        <span className={stato.connesso ? 'account__pallino account__pallino--ok' : 'account__pallino'}>
          {!stato.configurato ? 'non configurato' : stato.connesso ? 'collegato ✓' : 'non collegato'}
        </span>
      </div>
      {msg !== undefined ? <div className="riga__stato">{msg}</div> : null}
      <div className="account__tasti">
        {stato.connesso ? (
          <button className="tasto" onClick={disconnetti}>Scollega</button>
        ) : (
          <button
            className="tasto tasto--primario"
            onClick={connetti}
            disabled={inCorso || !stato.configurato}
          >
            {inCorso ? 'apri il browser e approva…' : 'Connetti Google Drive'}
          </button>
        )}
      </div>
    </div>
  )
}

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
  const [fase, setFase] = useState<'form' | 'codice'>('form')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [codice, setCodice] = useState('')
  const [messaggio, setMessaggio] = useState<string | undefined>(undefined)
  const [inCorso, setInCorso] = useState(false)

  useEffect(() => {
    utenteCorrente().then(setUtente).catch(() => setUtente(undefined))
    return suCambioAccesso(setUtente)
  }, [])

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
        if (esito.stato === 'entrato') { setUtente(esito.utente); setPassword('') }
        else if (esito.stato === 'confermaEmail') { setCodice(''); setFase('codice') }
        else setMessaggio(esito.messaggio)
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
        if (esito.stato === 'entrato') { setUtente(esito.utente); setFase('form'); setPassword(''); setCodice('') }
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
            Il tuo account è la chiave del recupero fra computer: i tuoi dati
            (chat, quaderno, workspace) si sincronizzano cifrati nel tuo Google Drive, così su un
            altro PC accedi e ritrovi tutto. La cifratura è tua: nemmeno noi o Google possiamo leggerli.
          </p>
          <SezioneDrive />
          <div className="account__tasti">
            <button className="tasto" onClick={() => void esci()}>Esci</button>
          </div>
        </div>
      ) : (
        <div className="account">
          {fase === 'codice' ? (
            <>
              <p className="account__chi">
                Ti abbiamo mandato un <strong>codice</strong> a <strong>{email.trim()}</strong>. Scrivilo per confermare.
              </p>
              <input
                className="account__campo"
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
              <div className="account__tasti">
                <button className="tasto" onClick={reinvia}>Rimanda</button>
                <button
                  className="tasto tasto--primario"
                  onClick={verifica}
                  disabled={inCorso || codice.trim() === ''}
                >
                  {inCorso ? 'un attimo…' : 'Conferma'}
                </button>
              </div>
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

          <div className="account__tasti">
            <button
              className="tasto tasto--primario"
              onClick={invia}
              disabled={inCorso || !puoInviare}
            >
              {inCorso ? 'un attimo…' : modo === 'registra' ? 'Crea l’account' : 'Entra'}
            </button>
          </div>
          </>
          )}
        </div>
      )}
    </div>
  )
}
