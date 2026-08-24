import { useEffect, useState } from 'react'
import {
  registra, entra, esci, utenteCorrente, suCambioAccesso, verificaCodice, reinviaCodice, type Utente
} from '../accesso-supabase'
import { valutaPassword, REGOLE_PASSWORD } from '@shared/password'

type Props = { onChiudi: () => void }

const ETICHETTA_FASE: Record<string, string> = {
  raccolgo: 'Raccolgo i file',
  comprimo: 'Comprimo',
  cifro: 'Cifro',
  carico: 'Carico sul Drive',
  scarico: 'Scarico dal Drive',
  decifro: 'Decifro',
  ripristino: 'Ripristino i file'
}

type StatoDrive = { configurato: boolean; connesso: boolean }
type StatoSync = {
  driveConnesso: boolean; haCassaforte: boolean; sbloccato: boolean
  versione?: string; ultimoSalvataggio?: string
}

/**
 * La sincronizzazione cifrata, vista dall'utente: collega il Drive, imposta la
 * passphrase (con la chiave di recupero mostrata una volta), sblocca, salva,
 * ripristina. Un solo componente perché è un solo flusso, a stati: cosa mostrare
 * dipende da dove sei (Drive? cassaforte? sbloccato?).
 */
function SezioneSync(): React.JSX.Element | null {
  const [drive, setDrive] = useState<StatoDrive | undefined>(undefined)
  const [sync, setSync] = useState<StatoSync | undefined>(undefined)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [recupero, setRecupero] = useState('')
  const [modoSblocco, setModoSblocco] = useState<'pass' | 'recupero'>('pass')
  const [chiaveRecupero, setChiaveRecupero] = useState<string | undefined>(undefined)
  const [inCorso, setInCorso] = useState(false)
  const [msg, setMsg] = useState<string | undefined>(undefined)
  const [progresso, setProgresso] = useState<{ fase: string; fatto?: number; totale?: number } | undefined>(undefined)

  const aggiorna = (): void => {
    void window.gestore.drive.stato().then(setDrive).catch(() => {})
    void window.gestore.sync.stato().then(setSync).catch(() => {})
  }
  useEffect(aggiorna, [])
  useEffect(() => window.gestore.sync.onProgresso(setProgresso), [])

  const conInCorso = (p: Promise<unknown>): void => {
    setInCorso(true); setMsg(undefined); setProgresso(undefined)
    void p.finally(() => { setInCorso(false); setProgresso(undefined); aggiorna() })
  }

  const connetti = (): void => conInCorso(
    window.gestore.drive.connetti().then((r) => { if (!r.ok) setMsg(r.messaggio ?? 'connessione non riuscita') })
  )
  const crea = (): void => conInCorso(
    window.gestore.sync.creaPassphrase(pw).then((r) => {
      if (r.ok && r.chiaveRecupero !== undefined) { setChiaveRecupero(r.chiaveRecupero); setPw(''); setPw2('') }
      else setMsg(r.messaggio ?? 'creazione non riuscita')
    })
  )
  const sblocca = (): void => conInCorso(
    (modoSblocco === 'recupero'
      ? window.gestore.sync.sbloccaRecupero(recupero)
      : window.gestore.sync.sblocca(pw)
    ).then((r) => { if (r.ok) { setPw(''); setRecupero('') } else setMsg(r.messaggio ?? 'sblocco non riuscito') })
  )
  const salva = (): void => conInCorso(
    window.gestore.sync.salva().then((r) =>
      setMsg(r.ok ? `Salvato ✓ (${r.voci ?? 0} file cifrati)` : (r.messaggio ?? 'salvataggio non riuscito')))
  )
  const ripristina = (): void => conInCorso(
    window.gestore.sync.ripristina().then((r) =>
      setMsg(r.ok
        ? (r.niente === true ? 'Niente da ripristinare (ancora nessun salvataggio).' : `Ripristinato ✓ (${r.scritti ?? 0} file). Riavvia per vedere tutto.`)
        : (r.messaggio ?? 'ripristino non riuscito')))
  )
  const blocca = (): void => conInCorso(window.gestore.sync.blocca())
  const scollega = (): void => conInCorso(window.gestore.drive.disconnetti())

  if (drive === undefined || sync === undefined) return null

  const regole = valutaPassword(pw)
  const coincidono = pw2 === pw

  return (
    <div className="account__drive">
      <div className="account__driga">
        <span>Google Drive</span>
        <span className={drive.connesso ? 'account__pallino account__pallino--ok' : 'account__pallino'}>
          {!drive.configurato ? 'non configurato' : drive.connesso ? 'collegato ✓' : 'non collegato'}
        </span>
      </div>

      {msg !== undefined ? <div className="riga__stato">{msg}</div> : null}

      {inCorso && progresso !== undefined ? ((): React.JSX.Element => {
        const trasferimento = progresso.fase === 'carico' || progresso.fase === 'scarico'
        const haQuota = progresso.totale !== undefined && progresso.fatto !== undefined && progresso.totale > 0
        const perc = haQuota ? Math.round((progresso.fatto! / progresso.totale!) * 100) : undefined
        const quota = (n: number): string => trasferimento ? `${(n / 1048576).toFixed(1)} MB` : String(n)
        return (
          <div className="account__prog">
            <div className="account__prog-testo">
              {ETICHETTA_FASE[progresso.fase] ?? progresso.fase}
              {haQuota ? ` — ${quota(progresso.fatto!)} / ${quota(progresso.totale!)} (${perc}%)` : '…'}
            </div>
            <div className="account__barra">
              <div
                className={perc !== undefined ? 'account__barra-riemp' : 'account__barra-riemp account__barra-riemp--indet'}
                style={perc !== undefined ? { width: `${perc}%` } : undefined}
              />
            </div>
          </div>
        )
      })() : null}

      {/* 1) Drive da collegare */}
      {!drive.connesso ? (
        <div className="account__tasti">
          <button className="tasto tasto--primario" onClick={connetti} disabled={inCorso || !drive.configurato}>
            {inCorso ? 'apri il browser e approva…' : 'Connetti Google Drive'}
          </button>
        </div>
      ) : chiaveRecupero !== undefined ? (
        /* 2) Appena creata: la chiave di recupero, UNA volta */
        <div className="account__recupero">
          <p className="riga__stato"><strong>Salva la tua chiave di recupero.</strong> È l’unico modo per rientrare se dimentichi la passphrase — non te la mostreremo di nuovo, e senza di essa (e senza passphrase) i dati non si recuperano.</p>
          <code className="account__codice">{chiaveRecupero}</code>
          <div className="account__tasti">
            <button className="tasto" onClick={() => void navigator.clipboard?.writeText(chiaveRecupero)}>Copia</button>
            <button className="tasto tasto--primario" onClick={() => { setChiaveRecupero(undefined); aggiorna() }}>L’ho salvata</button>
          </div>
        </div>
      ) : !sync.haCassaforte ? (
        /* 3) Nessuna cassaforte: crea la passphrase */
        <>
          <p className="riga__stato">Scegli una <strong>passphrase di cifratura</strong>: protegge i tuoi dati sul Drive. È diversa dalla password dell’account, e nemmeno noi la conosciamo.</p>
          <input className="account__campo" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="passphrase" aria-label="passphrase" autoComplete="new-password" />
          <input className="account__campo" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="ripeti la passphrase" aria-label="ripeti la passphrase" autoComplete="new-password" />
          <ul className="accesso-regole">
            {REGOLE_PASSWORD.map((r) => (
              <li key={r.chiave} className={regole[r.chiave] ? 'accesso-regola accesso-regola--ok' : 'accesso-regola'}>
                <span className="accesso-regola__segno">{regole[r.chiave] ? '✓' : '○'}</span>{r.testo}
              </li>
            ))}
          </ul>
          <div className="account__tasti">
            <button className="tasto tasto--primario" onClick={crea} disabled={inCorso || !regole.ok || !coincidono}>
              {inCorso ? 'un attimo…' : 'Crea la passphrase'}
            </button>
          </div>
        </>
      ) : !sync.sbloccato ? (
        /* 4) Cassaforte c'è ma è chiusa: sblocca */
        <>
          <p className="riga__stato">Sblocca la cassaforte per salvare o ripristinare i tuoi dati.</p>
          {modoSblocco === 'pass' ? (
            <input className="account__campo" type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') sblocca() }} placeholder="passphrase" aria-label="passphrase" autoComplete="current-password" autoFocus />
          ) : (
            <input className="account__campo" value={recupero} onChange={(e) => setRecupero(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') sblocca() }} placeholder="chiave di recupero (XXXX-XXXX-…)" aria-label="chiave di recupero" autoFocus />
          )}
          <div className="account__tasti">
            <button className="tasto" onClick={() => { setModoSblocco(modoSblocco === 'pass' ? 'recupero' : 'pass'); setMsg(undefined) }}>
              {modoSblocco === 'pass' ? 'Usa la chiave di recupero' : 'Usa la passphrase'}
            </button>
            <button className="tasto tasto--primario" onClick={sblocca} disabled={inCorso || (modoSblocco === 'pass' ? pw === '' : recupero.trim() === '')}>
              {inCorso ? 'un attimo…' : 'Sblocca'}
            </button>
          </div>
        </>
      ) : (
        /* 5) Sbloccato: salva / ripristina */
        <>
          <p className="riga__stato">
            Cassaforte aperta.{sync.ultimoSalvataggio !== undefined ? ` Ultimo salvataggio: ${new Date(sync.ultimoSalvataggio).toLocaleString()}.` : ' Non hai ancora salvato.'}
          </p>
          <div className="account__tasti">
            <button className="tasto" onClick={scollega}>Scollega Drive</button>
            <button className="tasto" onClick={blocca}>Blocca</button>
            <button className="tasto" onClick={ripristina} disabled={inCorso}>Ripristina</button>
            <button className="tasto tasto--primario" onClick={salva} disabled={inCorso}>
              {inCorso ? 'un attimo…' : 'Salva ora'}
            </button>
          </div>
        </>
      )}
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
          <SezioneSync />
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
