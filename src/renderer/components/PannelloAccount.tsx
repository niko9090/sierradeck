import { useEffect, useState } from 'react'
import {
  registra, entra, esci, utenteCorrente, suCambioAccesso, verificaCodice, reinviaCodice, type Utente
} from '../accesso-supabase'
import { valutaPassword, REGOLE_PASSWORD } from '@shared/password'

type Props = { onChiudi?: () => void; incorporato?: boolean }

import { descriviProgresso, type ProgressoSync } from '../progresso-sync'
import { ModaleConferma } from './ModaleConferma'

type StatoDrive = { configurato: boolean; connesso: boolean; email?: string }
type ElencoProgetti = {
  pc: { id: string; nome: string; cartellaProgetti: string }
  progetti: { id: string; nome: string; locale?: string; altrove: number }[]
  messaggio?: string
}

/**
 * I progetti sul Drive.
 *
 * Le chat da sole non bastano: una chat senza la sua cartella si riapre in
 * una cartella che non c'e'. Da qui si dice quali cartelle viaggiano con le
 * chat, e dove questo PC riceve quelle che arrivano dagli altri.
 */
type StatoProgettoVista = { id: string; chi: 'io' | 'altro' | 'libero'; pcNome?: string; da?: string; staffettaDa?: string }

function oraBreve(iso: string | undefined): string {
  if (iso === undefined) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

function SezioneProgetti({ inCorso, onCambio }: { inCorso: boolean; onCambio: () => void }): React.JSX.Element | null {
  const [elenco, setElenco] = useState<ElencoProgetti | undefined>(undefined)
  const [stati, setStati] = useState<StatoProgettoVista[]>([])
  const [occupato, setOccupato] = useState(false)
  const [esito, setEsito] = useState<string | undefined>(undefined)
  const [daTogliere, setDaTogliere] = useState<{ id: string; nome: string } | undefined>(undefined)
  const ricarica = (): void => {
    void window.gestore.progetti.elenca().then(setElenco).catch(() => {})
    void window.gestore.progetti.stati().then(setStati).catch(() => {})
  }
  useEffect(() => {
    ricarica()
    const t = setInterval(() => { void window.gestore.progetti.stati().then(setStati).catch(() => {}) }, 15_000)
    return () => clearInterval(t)
  }, [])
  const con = (p: Promise<ElencoProgetti>): void => {
    setOccupato(true)
    void p.then((e) => { setElenco(e); if (e.messaggio !== undefined) setEsito(e.messaggio); onCambio() })
      .catch((err: unknown) => setEsito(String(err)))
      .finally(() => { setOccupato(false); ricarica() })
  }
  const prendi = (id: string, forza = false): void => {
    setOccupato(true); setEsito(undefined)
    void window.gestore.progetti.prendiTestimone(id, forza).then((r) => {
      if (r.ok) setEsito(`Testimone preso: il progetto adesso e' qui, con l'ultimo stato salvato.${r.conflitti !== undefined ? ` ${r.conflitti} file in conflitto: vince il più recente, l'altro è accanto come copia «.conflitto-…».` : ''}`)
      else if ('nonRisponde' in r) setEsito(`Il PC ${r.pcNome} non risponde. Puoi forzare: prendi quello che c'e' sul Drive.`)
      else setEsito('messaggio' in r ? r.messaggio : 'non riuscito')
    }).catch((e: unknown) => setEsito(String(e))).finally(() => { setOccupato(false); ricarica() })
  }
  const statoDi = (id: string): StatoProgettoVista | undefined => stati.find((s) => s.id === id)
  const descriviStato = (s: StatoProgettoVista | undefined): string => {
    if (s === undefined) return ''
    if (s.chi === 'io') return ` · in lavoro qui${s.da !== undefined ? ` dalle ${oraBreve(s.da)}` : ''}`
    if (s.chi === 'altro') return ` · in lavoro su ${s.pcNome ?? '?'}${s.da !== undefined ? ` dalle ${oraBreve(s.da)}` : ''}${s.staffettaDa !== undefined ? ` (${s.staffettaDa} ha chiesto il testimone)` : ''}`
    return ' · libero'
  }
  if (elenco === undefined) return null
  const fermo = inCorso || occupato
  return (
    <div className="account__scheda account__scheda--largo">
      <div className="account__scheda-tit">📁 Progetti sul Drive</div>
      {elenco.progetti.length === 0 ? (
        <p className="account__nota">
          Le chat viaggiano gia'. Metti sul Drive anche la cartella di un progetto, e sull’altro PC la trovi con le sue chat dentro.
        </p>
      ) : (
        <ul className="account__progetti">
          {elenco.progetti.map((p) => (
            <li key={p.id} className="account__progetto">
              <div className="account__progetto-testo">
                <strong>{p.nome}</strong>
                <span className="account__nota">
                  {p.locale !== undefined
                    ? p.locale
                    : `non ancora su questo PC: arriva con «Ripristina» in ${elenco.pc.cartellaProgetti}\\${p.nome}`}
                  {p.altrove > 0 ? ` · su altri ${p.altrove} PC` : ''}
                  {descriviStato(statoDi(p.id))}
                </span>
              </div>
              <div className="account__scheda-tasti">
                {statoDi(p.id)?.chi === 'altro' ? (
                  <>
                    <button className="tasto tasto--primario tasto--mini" disabled={fermo} onClick={() => prendi(p.id)}>Prendi il testimone</button>
                    <button className="tasto tasto--mini" disabled={fermo} onClick={() => prendi(p.id, true)} title="Senza aspettare l'altro PC: prende quello che c'e' sul Drive">Forza</button>
                  </>
                ) : null}
                {p.locale === undefined ? (
                  <button className="tasto tasto--mini" disabled={fermo} onClick={() => con(window.gestore.progetti.collega(p.id))}>Sta gia' qui…</button>
                ) : null}
                <button className="tasto tasto--mini" disabled={fermo} onClick={() => setDaTogliere({ id: p.id, nome: p.nome })}>Togli</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {esito !== undefined ? <div className="riga__stato">{esito}</div> : null}
      {daTogliere !== undefined ? (
        <ModaleConferma
          titolo={`Togliere «${daTogliere.nome}» dal Drive?`}
          testo="I suoi file salvati sul Drive vengono cancellati, e le sue chat smettono di viaggiare con la cartella. Le cartelle sui PC restano come sono. Si può rimettere sul Drive quando vuoi."
          etichettaAzione="Togli dal Drive"
          onConferma={() => { const id = daTogliere.id; setDaTogliere(undefined); setEsito(undefined); con(window.gestore.progetti.rimuovi(id)) }}
          onAnnulla={() => setDaTogliere(undefined)}
        />
      ) : null}
      <div className="account__tasti">
        <button className="tasto tasto--primario tasto--mini" disabled={fermo} onClick={() => con(window.gestore.progetti.aggiungi())}>
          Metti una cartella sul Drive…
        </button>
      </div>
      <p className="account__nota">
        I progetti che arrivano dagli altri PC finiscono in <code>{elenco.pc.cartellaProgetti}</code>.{' '}
        <button className="account__link" disabled={fermo} onClick={() => con(window.gestore.progetti.cartella())}>Cambia ▸</button>
      </p>
      <p className="account__nota">
        Viaggia quello che git terrebbe (con la storia in <code>.git</code>); restano a casa <code>node_modules</code>, quello che i <code>.gitignore</code> escludono, e i file oltre 100 MB.
      </p>
    </div>
  )
}
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
  const [cambiaAperto, setCambiaAperto] = useState(false)
  const [pwVecchia, setPwVecchia] = useState('')
  const [pwNuova, setPwNuova] = useState('')
  const [pwNuova2, setPwNuova2] = useState('')
  const [inCorso, setInCorso] = useState(false)
  const [msg, setMsg] = useState<string | undefined>(undefined)
  const [conflitto, setConflitto] = useState(false)
  const [info, setInfo] = useState<{ file: number; byte: number } | undefined>(undefined)
  const [auto, setAuto] = useState(false)
  const [progresso, setProgresso] = useState<ProgressoSync | undefined>(undefined)

  const aggiorna = (): void => {
    void window.gestore.drive.stato().then(setDrive).catch(() => {})
    void window.gestore.sync.stato().then(setSync).catch(() => {})
    void window.gestore.sync.info().then(setInfo).catch(() => {})
    void window.gestore.sync.auto().then(setAuto).catch(() => {})
  }
  const commutaAuto = (): void => { void window.gestore.sync.auto(!auto).then(setAuto).catch(() => {}) }
  const apriLog = (): void => { void window.gestore.log.apri() }
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
  const salva = (forza = false): void => conInCorso(
    window.gestore.sync.salva(forza).then((r) => {
      if (r.ok && r.invariato === true) { setConflitto(false); setMsg('Già tutto salvato: niente di cambiato.') }
      else if (r.ok) { setConflitto(false); setMsg(`Salvato ✓ (${r.voci ?? 0} file)${r.conflitti !== undefined ? ` · ${r.conflitti} in conflitto: vince il più recente, l’altro è accanto come copia «.conflitto-…»` : ''}`) }
      else if (r.conflitto === true) { setConflitto(true); setMsg(r.messaggio ?? 'conflitto sul Drive') }
      else setMsg(r.messaggio ?? 'salvataggio non riuscito')
    })
  )
  const ripristina = (): void => conInCorso(
    window.gestore.sync.ripristina().then((r) => {
      setConflitto(false)
      setMsg(r.ok
        ? (r.niente === true ? 'Niente da ripristinare (ancora nessun salvataggio).' : `Ripristinato ✓ (${r.scritti ?? 0} file)${r.conflitti !== undefined ? ` · ${r.conflitti} in conflitto: vince il più recente, l’altro è accanto come copia «.conflitto-…»` : ''}. Riavvia per vedere tutto.`)
        : (r.messaggio ?? 'ripristino non riuscito'))
    })
  )
  const blocca = (): void => conInCorso(window.gestore.sync.blocca())
  const scollega = (): void => conInCorso(window.gestore.drive.disconnetti())
  const cambia = (): void => conInCorso(
    window.gestore.sync.cambiaPassphrase(pwVecchia, pwNuova).then((r) => {
      if (r.ok) { setCambiaAperto(false); setPwVecchia(''); setPwNuova(''); setPwNuova2(''); setMsg('Passphrase cambiata ✓') }
      else setMsg(r.messaggio ?? 'cambio non riuscito')
    })
  )

  if (drive === undefined || sync === undefined) return null

  const regole = valutaPassword(pw)
  const coincidono = pw2 === pw
  const regoleNuova = valutaPassword(pwNuova)
  // «Pronto» = tutto in ordine per lavorare: Drive collegato, cassaforte aperta,
  // e nessun passo di configurazione in mezzo. È lo stato del cruscotto vero.
  const pronto = drive.connesso && sync.sbloccato && chiaveRecupero === undefined && !cambiaAperto

  return (
    <div className="account__dash">
      {msg !== undefined ? <div className="riga__stato">{msg}</div> : null}

      {inCorso && progresso !== undefined ? ((): React.JSX.Element => {
        const { testo, perc } = descriviProgresso(progresso)
        return (
          <div className="account__prog">
            <div className="account__prog-testo">{testo}</div>
            <div className="account__barra">
              <div
                className={perc !== undefined ? 'account__barra-riemp' : 'account__barra-riemp account__barra-riemp--indet'}
                style={perc !== undefined ? { width: `${perc}%` } : undefined}
              />
            </div>
          </div>
        )
      })() : null}

      {/* Riepilogo a colpo d'occhio, quando è tutto pronto */}
      {pronto ? (
        <div className="account__hero">
          <div className={sync.ultimoSalvataggio !== undefined ? 'account__hero-stato account__hero-stato--ok' : 'account__hero-stato'}>
            {sync.ultimoSalvataggio !== undefined ? '✓ Tutto al sicuro' : '○ Non hai ancora salvato'}
          </div>
          {sync.ultimoSalvataggio !== undefined ? (
            <div className="account__hero-sub">Ultimo salvataggio: {new Date(sync.ultimoSalvataggio).toLocaleString()}</div>
          ) : null}
          {info !== undefined ? (
            <div className="account__hero-sub">{info.file} chat · {(info.byte / 1048576).toFixed(0)} MB</div>
          ) : null}
        </div>
      ) : null}

      {/* Le due schede: Drive e Cassaforte, sempre visibili */}
      <div className="account__schede">
        <div className="account__scheda">
          <div className="account__scheda-tit">☁️ Drive</div>
          <div className={drive.connesso ? 'account__pallino account__pallino--ok' : 'account__pallino'}>
            {!drive.configurato ? 'non configurato' : drive.connesso ? 'collegato ✓' : 'non collegato'}
          </div>
          {drive.connesso && drive.email !== undefined ? (
            <div className="account__nota" style={{ fontSize: '.8em', wordBreak: 'break-all' }} title="L’account Google del Drive collegato">{drive.email}</div>
          ) : null}
          {drive.connesso ? (
            <button className="tasto tasto--mini" onClick={scollega} disabled={inCorso}>Scollega</button>
          ) : (
            <button className="tasto tasto--primario tasto--mini" onClick={connetti} disabled={inCorso || !drive.configurato}>
              {inCorso ? 'nel browser…' : 'Connetti'}
            </button>
          )}
        </div>
        <div className="account__scheda">
          <div className="account__scheda-tit">🔒 Cassaforte</div>
          <div className={sync.sbloccato ? 'account__pallino account__pallino--ok' : 'account__pallino'}>
            {!sync.haCassaforte ? 'da creare' : sync.sbloccato ? 'aperta ✓' : 'chiusa'}
          </div>
          {pronto ? (
            <div className="account__scheda-tasti">
              <button className="tasto tasto--mini" onClick={() => { setCambiaAperto(true); setMsg(undefined) }}>Cambia passphrase</button>
              <button className="tasto tasto--mini" onClick={blocca} disabled={inCorso}>Blocca</button>
            </div>
          ) : null}
        </div>
      </div>

      {/* L'area che cambia: chiave di recupero / crea / sblocca / cambia / cruscotto */}
      {chiaveRecupero !== undefined ? (
        <div className="account__scheda account__scheda--largo account__recupero">
          <p className="riga__stato"><strong>Salva la tua chiave di recupero.</strong> È l’unico modo per rientrare se dimentichi la passphrase — non te la mostreremo di nuovo, e senza di essa (e senza passphrase) i dati non si recuperano.</p>
          <code className="account__codice">{chiaveRecupero}</code>
          <div className="account__tasti">
            <button className="tasto" onClick={() => void navigator.clipboard?.writeText(chiaveRecupero)}>Copia</button>
            <button className="tasto tasto--primario" onClick={() => { setChiaveRecupero(undefined); aggiorna() }}>L’ho salvata</button>
          </div>
        </div>
      ) : drive.connesso && !sync.haCassaforte ? (
        <div className="account__scheda account__scheda--largo">
          <p className="account__nota">Scegli una <strong>passphrase di cifratura</strong>: protegge i tuoi dati sul Drive. È diversa dalla password dell’account, e nemmeno noi la conosciamo.</p>
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
        </div>
      ) : drive.connesso && !sync.sbloccato ? (
        <div className="account__scheda account__scheda--largo">
          <p className="account__nota">Sblocca la cassaforte per salvare o ripristinare i tuoi dati.</p>
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
        </div>
      ) : cambiaAperto ? (
        <div className="account__scheda account__scheda--largo">
          <p className="account__nota">Cambia la passphrase. La chiave di recupero resta valida.</p>
          <input className="account__campo" type="password" value={pwVecchia} onChange={(e) => setPwVecchia(e.target.value)} placeholder="passphrase attuale" aria-label="passphrase attuale" autoComplete="current-password" />
          <input className="account__campo" type="password" value={pwNuova} onChange={(e) => setPwNuova(e.target.value)} placeholder="nuova passphrase" aria-label="nuova passphrase" autoComplete="new-password" />
          <input className="account__campo" type="password" value={pwNuova2} onChange={(e) => setPwNuova2(e.target.value)} placeholder="ripeti la nuova passphrase" aria-label="ripeti la nuova passphrase" autoComplete="new-password" />
          <ul className="accesso-regole">
            {REGOLE_PASSWORD.map((r) => (
              <li key={r.chiave} className={regoleNuova[r.chiave] ? 'accesso-regola accesso-regola--ok' : 'accesso-regola'}>
                <span className="accesso-regola__segno">{regoleNuova[r.chiave] ? '✓' : '○'}</span>{r.testo}
              </li>
            ))}
          </ul>
          <div className="account__tasti">
            <button className="tasto" onClick={() => { setCambiaAperto(false); setPwVecchia(''); setPwNuova(''); setPwNuova2(''); setMsg(undefined) }}>Annulla</button>
            <button className="tasto tasto--primario" onClick={cambia} disabled={inCorso || pwVecchia === '' || !regoleNuova.ok || pwNuova !== pwNuova2}>
              {inCorso ? 'un attimo…' : 'Cambia passphrase'}
            </button>
          </div>
        </div>
      ) : pronto ? (
        <>
          <div className="account__scheda account__scheda--largo">
            <div className="account__scheda-tit">🔄 Sincronizzazione</div>
            {conflitto ? (
              <>
                <p className="account__nota">
                  Sul Drive c’è già un salvataggio che questo PC non conosce — capita se l’app si è chiusa male.
                  Puoi <strong>caricare questo PC sovrascrivendolo</strong>, oppure portarti giù quello che c’è.
                </p>
                <div className="account__tasti">
                  <button className="tasto" onClick={ripristina} disabled={inCorso}>Ripristina quello sul Drive</button>
                  <button className="tasto tasto--primario" onClick={() => salva(true)} disabled={inCorso}>
                    {inCorso ? 'un attimo…' : 'Sovrascrivi col mio'}
                  </button>
                </div>
              </>
            ) : (
              <div className="account__tasti">
                <button className="tasto" onClick={ripristina} disabled={inCorso}>Ripristina</button>
                <button className="tasto tasto--primario account__salva" onClick={() => salva()} disabled={inCorso}>
                  {inCorso ? 'un attimo…' : 'Salva ora'}
                </button>
              </div>
            )}
          </div>

          <SezioneProgetti inCorso={inCorso} onCambio={aggiorna} />

          <div className="account__opzioni">
            <label className="account__toggle">
              <input type="checkbox" checked={auto} onChange={commutaAuto} />
              <span>Salvataggio automatico</span>
              <span className="account__nota">{auto ? 'ogni 15 min (5 con un progetto sul Drive), se cambia qualcosa, e alla chiusura' : 'spento'}</span>
            </label>
            <button className="account__link" onClick={apriLog}>Registro attività ▸</button>
          </div>
        </>
      ) : !drive.connesso ? (
        <div className="account__scheda account__scheda--largo">
          <p className="account__nota">Collega il tuo Google Drive qui sopra per iniziare a mettere le chat al sicuro.</p>
        </div>
      ) : null}
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
export function PannelloAccount({ onChiudi, incorporato = false }: Props): React.JSX.Element {
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

  const corpo = (
    utente !== undefined ? (
        <div className="account">
          <p className="account__chi">Entrato come <strong>{utente.email}</strong></p>
          <SezioneSync />
          <div className="account__tasti">
            <button className="tasto" onClick={() => void window.gestore.log.apri()}>Apri i log</button>
            <span style={{ flex: 1 }} />
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
      )
  )

  if (incorporato) return <div className="impostazioni-scheda">{corpo}</div>
  return (
    <div className="pannello pannello--account">
      <div className="pannello__testa">
        <strong>Account</strong>
        <span className="sezione--vuota" style={{ flex: 1 }} />
        <button className="tasto" onClick={onChiudi}>Chiudi</button>
      </div>
      {corpo}
    </div>
  )
}
