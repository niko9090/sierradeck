import { useCallback, useEffect, useState } from 'react'
import type { StatoPreparazione } from '../../main/preparazione'
import type { StatoAccesso } from '../../main/accesso'
import { passoDi } from '../preparazione-vista'
import { TerminaleSemplice } from './TerminaleSemplice'

type Props = {
  onChiudi: () => void
  /** Perché la banda in cima sappia subito che il guasto è passato. */
  onPreparazione: (s: StatoPreparazione) => void
}

/**
 * Il primo avvio che si prepara da solo.
 *
 * Chi installa SierraDeck non deve sapere cos'è un PATH. Il programma guarda
 * cosa manca e fa quello che può fare al posto suo — trovare Claude Code dove
 * già c'è, e installarlo dove non c'è — e si ferma dove è giusto fermarsi:
 * l'accesso avviene nel browser con le credenziali dell'utente, e quelle non
 * sono nostre.
 *
 * L'installazione e l'accesso girano in un terminale **visibile**. È
 * deliberato: l'installatore dice cosa scarica e può chiedere conferma, e
 * l'accesso aspetta una risposta proprio lì dentro. Una barra che gira davanti
 * a un processo che sta facendo una domanda è il modo più sicuro di far
 * sembrare bloccato ciò che sta solo aspettando.
 *
 * Node.js e Git non si installano di nostra iniziativa: sono runtime di
 * sistema, e metterli al posto di qualcuno è un gesto che si fa solo se lo si
 * è chiesto. Qui compaiono scritti, con cosa costa non averli.
 */
export function ModalePreparazione({ onChiudi, onPreparazione }: Props): React.JSX.Element {
  const [stato, setStato] = useState<StatoPreparazione | undefined>(undefined)
  const [accesso, setAccesso] = useState<StatoAccesso>({ autenticato: true })
  const [terminale, setTerminale] = useState<string | undefined>(undefined)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const [inCorso, setInCorso] = useState(false)

  const ricontrolla = useCallback((): void => {
    setInCorso(true)
    Promise.all([window.gestore.preparazione.stato(), window.gestore.accesso.stato()])
      .then(([p, a]) => {
        setStato(p)
        setAccesso(a)
        onPreparazione(p)
        setErrore(undefined)
      })
      .catch((e: unknown) => setErrore(String(e)))
      .finally(() => setInCorso(false))
  }, [onPreparazione])

  useEffect(ricontrolla, [ricontrolla])

  useEffect(() => {
    const suTasto = (e: KeyboardEvent): void => { if (e.key === 'Escape') onChiudi() }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [onChiudi])

  const avvia = (apri: () => Promise<string>): void => {
    setErrore(undefined)
    apri().then(setTerminale).catch((e: unknown) => setErrore(String(e)))
  }

  const passo = passoDi(stato, accesso)
  const mancanti = stato?.avvisi ?? []

  return (
    <div className="velo" onMouseDown={(e) => { if (e.target === e.currentTarget) onChiudi() }}>
      <div className="dialogo dialogo--medio" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialogo__testa">
          <span className={`led ${passo === 'pronto' ? 'led--lavoro' : 'led--fermo'}`} />
          <span className="serigrafia">Cosa serve per lavorare</span>
          <span style={{ flex: 1 }} />
          <button className="tasto" onClick={onChiudi}>Chiudi</button>
        </div>

        {passo === 'installa' ? (
          <>
            <p style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.6 }}>
              Claude Code non è su questo computer, e senza di lui le chat si aprono vuote.
              Posso installarlo io: è l’installatore ufficiale di Anthropic, e qui sotto vedi
              esattamente cosa fa.
            </p>
            <p className="misura" style={{ margin: '0 0 12px', lineHeight: 1.6 }}>
              Quando ha finito, premi «Ricontrolla»: da lì si passa all’accesso.
            </p>
          </>
        ) : passo === 'accedi' ? (
          <>
            <p style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.6 }}>
              Claude Code c’è{stato?.claude !== undefined ? <> — <code className="misura">{stato.claude}</code></> : null}.
              Manca l’accesso: {accesso.motivo ?? 'nessuna credenziale trovata.'}
            </p>
            <p className="misura" style={{ margin: '0 0 12px', lineHeight: 1.6 }}>
              Da qui si apre un terminale che lancia Claude Code: si aprirà il browser, e il
              login lo fai tu. Sono le tue credenziali, ed è giusto così.
            </p>
          </>
        ) : (
          <p style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.6 }}>
            Non manca niente: Claude Code è installato
            {stato?.claude !== undefined ? <> in <code className="misura">{stato.claude}</code></> : null}
            {' '}e l’accesso c’è.
          </p>
        )}

        {mancanti.length > 0 ? (
          <div style={{ margin: '0 0 12px' }}>
            <span className="serigrafia">Manca, ma decidi tu</span>
            <ul style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 12, lineHeight: 1.7, color: 'var(--testo-quieto)' }}>
              {mancanti.map((a) => <li key={a}>{a}</li>)}
            </ul>
          </div>
        ) : null}

        {terminale !== undefined ? <TerminaleSemplice ptyId={terminale} /> : null}

        {errore !== undefined ? <div className="avviso" style={{ marginTop: 10 }}>⚠ {errore}</div> : null}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          {passo === 'installa' ? (
            <button
              className="tasto tasto--primario"
              onClick={() => avvia(() => window.gestore.preparazione.installa())}
              disabled={terminale !== undefined}
            >
              {terminale !== undefined ? 'Installazione avviata…' : 'Installa Claude Code'}
            </button>
          ) : null}
          {passo === 'accedi' ? (
            <button
              className="tasto tasto--primario"
              onClick={() => avvia(() => window.gestore.preparazione.accedi())}
              disabled={terminale !== undefined}
            >
              {terminale !== undefined ? 'Accesso in corso…' : 'Apri l’accesso'}
            </button>
          ) : null}
          <button className="tasto" onClick={ricontrolla} disabled={inCorso}>
            {inCorso ? 'Controllo…' : 'Ricontrolla'}
          </button>
        </div>
      </div>
    </div>
  )
}
