import { useEffect, useMemo, useState } from 'react'
import { useSessionStore } from '../state/sessions'
import { useLayoutStore } from '../state/layout'
import {
  raggruppaSessioni,
  filtra,
  perProgetto,
  apertiAllInizio,
  type GruppoSessioni
} from '../raggruppa-sessioni'
import { descriviAvanzamento } from '../avanzamento-vista'
import { ModaleConferma } from './ModaleConferma'
import type { SessionSummary } from '@shared/types'
import type { Anteprima } from '../../main/anteprima'

/** Quante righe mostrare all'apertura prima di lasciare le sezioni chiuse. */
const RIGHE_APERTE = 40

function formattaData(iso: string | undefined): string {
  if (iso === undefined) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const oggi = new Date()
  const stessoGiorno = d.toDateString() === oggi.toDateString()
  // Oggi l'ora basta e si legge prima; sui giorni passati la data è ciò che
  // distingue una conversazione dall'altra.
  return stessoGiorno
    ? `oggi ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`
    : d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

/**
 * La finestra per riprendere una conversazione già esistente.
 *
 * Tre livelli, che rispecchiano come sono fatte le cose davvero: il **progetto**
 * in cui si è lavorato, le **conversazioni** che ci sono dentro, e — solo per
 * quelle rilanciate più volte — le singole **esecuzioni**. Sui dati veri di
 * questa macchina 313 sessioni su 742 appartengono a una sola cartella di
 * servizio: senza il primo livello seppellivano tutto il resto.
 */
export function ModaleSessioni({ onChiudi }: { onChiudi: () => void }): React.JSX.Element {
  const { sessions, progress, errore, esito, load, setEsito } = useSessionStore()
  const addPane = useLayoutStore((s) => s.addPane)
  const [cerca, setCerca] = useState('')
  const [inCorso, setInCorso] = useState(false)
  // I progetti chiusi, non quelli aperti: così un progetto nuovo nasce aperto,
  // che è ciò che serve quando lo si è appena creato.
  const [chiusi, setChiusi] = useState<ReadonlySet<string>>(new Set())
  const [aperti, setAperti] = useState<ReadonlySet<string>>(new Set())
  const [espansa, setEspansa] = useState<string | undefined>(undefined)
  // Di quale voce si sta guardando l'assaggio, e cosa c'è dentro. Una sola per
  // volta: due anteprime aperte insieme sono due muri di testo da confrontare.
  const [sbirciata, setSbirciata] = useState<string | undefined>(undefined)
  const [anteprima, setAnteprima] = useState<Anteprima | undefined>(undefined)
  // I nomi dati dall'utente e le chat scelte per essere buttate. Due cose che
  // vivono qui perché riguardano l'elenco intero, non la singola riga.
  const [etichette, setEtichette] = useState<Record<string, string>>({})
  const [daButtare, setDaButtare] = useState<ReadonlySet<string>>(new Set())
  const [chiedoConferma, setChiedoConferma] = useState(false)

  useEffect(() => {
    window.gestore.etichette.leggi().then(setEtichette).catch(() => setEtichette({}))
  }, [])

  const rinomina = (uuid: string, testo: string): void => {
    window.gestore.etichette
      .imposta(uuid, testo)
      .then(setEtichette)
      .catch((err: unknown) => setEsito({ indexed: 0, failed: 0, errore: `Nome non salvato: ${String(err)}` }))
  }

  const segna = (uuid: string): void => {
    setDaButtare((prima) => {
      const dopo = new Set(prima)
      if (dopo.has(uuid)) dopo.delete(uuid)
      else dopo.add(uuid)
      return dopo
    })
  }

  const buttaSegnate = (): void => {
    window.gestore.sessions
      .elimina(percorsiDaButtare)
      .then((r) => {
        setDaButtare(new Set())
        setChiedoConferma(false)
        if (r.errori.length > 0) {
          setEsito({ indexed: 0, failed: r.errori.length, errore: r.errori.join(' · ') })
        }
        return load()
      })
      .catch((err: unknown) => {
        setChiedoConferma(false)
        setEsito({ indexed: 0, failed: 0, errore: `Eliminazione non riuscita: ${String(err)}` })
      })
  }

  const sbircia = (g: GruppoSessioni): void => {
    if (sbirciata === g.principale.uuid) {
      setSbirciata(undefined)
      return
    }
    setSbirciata(g.principale.uuid)
    setAnteprima(undefined)
    window.gestore.sessions
      .anteprima(g.principale.jsonlPath)
      .then(setAnteprima)
      .catch((err: unknown) => setAnteprima({ scambi: [], azioni: [], errore: String(err) }))
  }

  useEffect(() => {
    const suTasto = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onChiudi()
    }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [onChiudi])

  // Il raggruppamento costa un giro su tutte le sessioni: rifarlo a ogni tasto
  // premuto nel campo di ricerca sarebbe sprecato, perché la ricerca filtra il
  // risultato e non lo cambia.
  const gruppi = useMemo(() => raggruppaSessioni(sessions), [sessions])
  const visibili = useMemo(() => filtra(gruppi, cerca), [gruppi, cerca])
  const progetti = useMemo(() => perProgetto(visibili), [visibili])

  /** Tutte le trascrizioni delle chat segnate: una chat è più file. */
  const percorsiDaButtare = visibili
    .filter((g) => daButtare.has(g.principale.uuid))
    .flatMap((g) => g.sessioni.map((s) => s.jsonlPath))

  // Quali sezioni nascono aperte lo decide il conto delle righe, una volta
  // sola: ricalcolarlo a ogni ricerca farebbe richiudere sotto le dita ciò che
  // l'utente aveva appena aperto.
  const [decisoAllInizio, setDecisoAllInizio] = useState(false)
  useEffect(() => {
    if (decisoAllInizio || progetti.length === 0) return
    setAperti(apertiAllInizio(progetti, RIGHE_APERTE))
    setDecisoAllInizio(true)
  }, [progetti, decisoAllInizio])

  // Cercando si vuole vedere ciò che si è trovato, non aprire sezione per
  // sezione: durante una ricerca tutto è aperto salvo ciò che si è chiuso.
  const staCercando = cerca.trim() !== ''
  const apertoOra = (percorso: string): boolean =>
    !chiusi.has(percorso) && (staCercando || aperti.has(percorso))

  const commuta = (percorso: string): void => {
    const era = apertoOra(percorso)
    setChiusi((prima) => {
      const dopo = new Set(prima)
      if (era) dopo.add(percorso)
      else dopo.delete(percorso)
      return dopo
    })
    setAperti((prima) => {
      const dopo = new Set(prima)
      if (era) dopo.delete(percorso)
      else dopo.add(percorso)
      return dopo
    })
  }

  const apri = (s: SessionSummary, titolo: string): void => {
    addPane(s.cwd ?? s.projectPath, titolo)
    onChiudi()
  }

  const reindicizza = (): void => {
    setInCorso(true)
    window.gestore.sessions
      .reindex()
      .then((e) => {
        setEsito(e)
        return load()
      })
      .catch((err: unknown) => {
        setEsito({ indexed: 0, failed: 0, errore: `Rilettura fallita: ${String(err)}` })
      })
      .finally(() => setInCorso(false))
  }

  const vistaProgresso = inCorso && progress !== undefined ? descriviAvanzamento(progress) : undefined

  if (chiedoConferma) {
    return (
      <ModaleConferma
        titolo="Butta le conversazioni scelte"
        testo={
          `${daButtare.size === 1 ? 'La chat scelta' : `Le ${daButtare.size} chat scelte`} ` +
          `(${percorsiDaButtare.length} file di trascrizione) finiranno nel cestino di Windows, ` +
          'da cui puoi ancora recuperarle. Spariranno dall’elenco e dal conto dei consumi.'
        }
        etichettaAzione={`Butta ${daButtare.size}`}
        onConferma={buttaSegnate}
        onAnnulla={() => setChiedoConferma(false)}
      />
    )
  }

  return (
    <div className="velo" onMouseDown={(e) => { if (e.target === e.currentTarget) onChiudi() }}>
      <div className="dialogo dialogo--largo" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialogo__testa">
          <span className="serigrafia">Riprendi una conversazione</span>
          <span className="misura">
            {progetti.length} progetti · {visibili.length} chat · {sessions.length} sessioni
          </span>
          <span style={{ flex: 1 }} />
          {daButtare.size > 0 ? (
            <>
              <span className="misura">{daButtare.size} da buttare</span>
              <button className="tasto" onClick={() => setDaButtare(new Set())}>Lascia stare</button>
              <button className="tasto tasto--primario" onClick={() => setChiedoConferma(true)}>
                Butta {daButtare.size}
              </button>
            </>
          ) : null}
          <button
            className="tasto"
            onClick={reindicizza}
            disabled={inCorso}
            title="Rilegge da capo tutti i .jsonl, anche quelli che risultano immutati"
          >
            {inCorso ? 'Rileggo…' : 'Rileggi'}
          </button>
          <button className="tasto" onClick={onChiudi}>Chiudi</button>
        </div>

        <input
          autoFocus
          className="campo"
          value={cerca}
          placeholder="Cerca nel titolo, nel progetto o in ciò che avevi chiesto"
          onChange={(e) => setCerca(e.target.value)}
          style={{ width: '100%', marginBottom: 10 }}
        />

        {vistaProgresso !== undefined ? (
          <div className="misura" style={{ paddingBottom: 8 }}>
            {vistaProgresso.titolo} · {vistaProgresso.conteggio ?? ''}{' '}
            {vistaProgresso.percento === undefined ? '' : `(${vistaProgresso.percento}%)`}
          </div>
        ) : null}
        {esito !== undefined && esito.failed > 0 ? (
          <div className="avviso" style={{ paddingBottom: 8, whiteSpace: 'normal' }}>
            ⚠ {esito.failed} file non indicizzati su {esito.indexed + esito.failed}
          </div>
        ) : null}
        {esito?.errore !== undefined ? (
          <div style={{ color: 'var(--rosso)', fontSize: 12, paddingBottom: 8 }}>⚠ {esito.errore}</div>
        ) : null}
        {errore !== undefined ? (
          <div style={{ color: 'var(--rosso)', fontSize: 12, paddingBottom: 8 }}>{errore}</div>
        ) : null}

        <div className="elenco-chat">
          {visibili.length === 0 ? (
            <div className="vuoto">
              {cerca.trim() === ''
                ? 'Nessuna sessione indicizzata. Premi «Rileggi» per rileggere i .jsonl di Claude Code.'
                : `Nessuna chat per «${cerca.trim()}».`}
            </div>
          ) : (
            progetti.map((p) => {
              const aperto = apertoOra(p.percorso)
              return (
                <section className="progetto" key={p.percorso}>
                  <button
                    className="progetto__testa"
                    onClick={() => commuta(p.percorso)}
                    title={p.percorso}
                    aria-expanded={aperto}
                  >
                    <span className="progetto__freccia">{aperto ? '▾' : '▸'}</span>
                    <span className="progetto__nome">{p.nome}</span>
                    <span className="misura">{p.chat.length} chat</span>
                  </button>
                  {aperto
                    ? p.chat.map((g) => (
                        <VoceChat
                          key={g.principale.uuid}
                          gruppo={g}
                          espansa={espansa === g.principale.uuid}
                          anteprima={sbirciata === g.principale.uuid ? (anteprima ?? 'attendi') : undefined}
                          onSbircia={() => sbircia(g)}
                          etichetta={etichette[g.principale.uuid]}
                          onRinomina={(testo) => rinomina(g.principale.uuid, testo)}
                          segnata={daButtare.has(g.principale.uuid)}
                          onSegna={() => segna(g.principale.uuid)}
                          onEspandi={() =>
                            setEspansa(espansa === g.principale.uuid ? undefined : g.principale.uuid)
                          }
                          onApri={apri}
                        />
                      ))
                    : null}
                </section>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Una conversazione nell'elenco, con le sue esecuzioni se ne ha più d'una.
 *
 * Le ripetizioni esistono davvero — un lavoro automatico rilanciato ogni ora ne
 * accumula centinaia — e nell'elenco valgono una riga sola. Ma la riga non
 * decide per l'utente quale aprire: il conteggio si preme e le esecuzioni
 * compaiono, con la loro data.
 */
function VoceChat({
  gruppo,
  espansa,
  onEspandi,
  onApri,
  anteprima,
  onSbircia,
  etichetta,
  onRinomina,
  segnata,
  onSegna
}: {
  gruppo: GruppoSessioni
  espansa: boolean
  onEspandi: () => void
  onApri: (s: SessionSummary, titolo: string) => void
  /** L'assaggio da mostrare, `'attendi'` mentre arriva, assente se chiuso. */
  anteprima: Anteprima | 'attendi' | undefined
  onSbircia: () => void
  /** Il nome dato dall'utente, se ne ha uno: vince su quello di Claude. */
  etichetta: string | undefined
  onRinomina: (testo: string) => void
  segnata: boolean
  onSegna: () => void
}): React.JSX.Element {
  const [rinominando, setRinominando] = useState(false)
  const [bozza, setBozza] = useState('')
  if (rinominando) {
    return (
      <div className="voce-chat">
        <input
          autoFocus
          className="campo"
          value={bozza}
          placeholder="Un nome tuo — vuoto per tornare a quello di Claude"
          onChange={(e) => setBozza(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { onRinomina(bozza); setRinominando(false) }
            if (e.key === 'Escape') setRinominando(false)
          }}
          style={{ flex: 1 }}
        />
        <button className="tasto" onClick={() => { onRinomina(bozza); setRinominando(false) }}>Salva</button>
        <button className="tasto" onClick={() => setRinominando(false)}>Annulla</button>
      </div>
    )
  }

  return (
    <>
      <div className={segnata ? 'voce-chat voce-chat--segnata' : 'voce-chat'}>
        <button
          className="voce-chat__apri"
          onClick={() => onApri(gruppo.principale, etichetta ?? gruppo.titolo)}
          title={`${gruppo.cartella}\nApre una chat in questa cartella`}
        >
          <span
            className="voce-chat__titolo"
            style={{
              color: etichetta !== undefined ? 'var(--testo)' : gruppo.dalPrompt ? 'var(--testo-quieto)' : 'var(--testo)',
              fontStyle: etichetta === undefined && gruppo.titolo === 'senza titolo' ? 'italic' : 'normal'
            }}
          >
            {etichetta ?? gruppo.titolo}
          </span>
          <span className="misura voce-chat__meta">
            {/* Il progetto sta nell'intestazione della sezione: ripeterlo su
                ogni riga sarebbe la stessa parola scritta novanta volte. */}
            {gruppo.sottocartella !== undefined ? `${gruppo.sottocartella} · ` : ''}
            {gruppo.messaggi} messaggi
          </span>
        </button>
        {/* Il nome dell'utente vince su quello di Claude: «casa» dice più di
            «Debug multiple issues in Home Assistant controller». */}
        <button
          className="voce-chat__sbircia"
          onClick={() => { setBozza(etichetta ?? gruppo.titolo); setRinominando(true) }}
          title="Dà a questa chat un nome tuo"
        >
          ✎
        </button>
        {/* Segnare invece di cancellare subito: si scelgono le chat da buttare
            guardandole tutte, e poi si conferma una volta sola. */}
        <button
          className={segnata ? 'voce-chat__sbircia voce-chat__sbircia--segnata' : 'voce-chat__sbircia'}
          onClick={onSegna}
          title={segnata ? 'Non buttarla più' : 'Segna questa chat da buttare'}
          aria-pressed={segnata}
        >
          🗑
        </button>
        {/* Sbirciare prima di aprire: una chat si riconosce da cosa ci si era
            detto, non dal titolo che Claude le ha dato tre settimane fa. */}
        <button
          className="voce-chat__sbircia"
          onClick={onSbircia}
          title="Mostra gli ultimi scambi senza aprire la chat"
          aria-expanded={anteprima !== undefined}
        >
          👁
        </button>
        {gruppo.ricorrente ? (
          <button
            className="voce-chat__quante"
            onClick={onEspandi}
            title="Le singole esecuzioni di questo stesso lavoro"
            aria-expanded={espansa}
          >
            {gruppo.quante}× {espansa ? '▾' : '▸'}
          </button>
        ) : null}
        <span className="misura voce-chat__data">{formattaData(gruppo.principale.lastTimestamp)}</span>
      </div>

      {anteprima !== undefined ? (
        <div className="anteprima">
          {anteprima === 'attendi' ? (
            <p className="anteprima__vuoto">Leggo la conversazione…</p>
          ) : anteprima.errore !== undefined ? (
            <p className="anteprima__vuoto">⚠ {anteprima.errore}</p>
          ) : anteprima.scambi.length === 0 ? (
            <p className="anteprima__vuoto">Nessuno scambio da mostrare.</p>
          ) : (
            <>
              {anteprima.scambi.map((sc, i) => (
                <div key={i} className={`anteprima__riga anteprima__riga--${sc.ruolo}`}>
                  <span className="anteprima__chi">{sc.ruolo === 'utente' ? 'tu' : 'claude'}</span>
                  <span>{sc.testo}</span>
                </div>
              ))}
              {anteprima.azioni.length > 0 ? (
                <div className="anteprima__azioni">
                  <span className="serigrafia">ultime azioni</span>
                  {anteprima.azioni.map((a, i) => (
                    <div key={i} className="misura anteprima__azione">{a}</div>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {espansa
        ? gruppo.sessioni.map((s) => (
            <button
              key={s.uuid}
              className="voce-chat voce-chat--esecuzione"
              onClick={() => onApri(s, etichetta ?? gruppo.titolo)}
              title={s.jsonlPath}
            >
              <span className="voce-chat__titolo misura">{formattaData(s.lastTimestamp)}</span>
              <span className="misura voce-chat__meta">{s.messageCount} messaggi</span>
              <span className="misura voce-chat__data">{s.uuid.slice(0, 8)}</span>
            </button>
          ))
        : null}
    </>
  )
}
