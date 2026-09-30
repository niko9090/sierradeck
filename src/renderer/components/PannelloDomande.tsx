import { useCallback, useEffect, useRef, useState } from 'react'
import { richiestaRisposta, type Conversazione } from '@shared/domande-conversazioni'

/**
 * Le Domande sul PC, come conversazioni a messaggi (0.36.0).
 *
 * Nicholas (30/09): le domande devono essere una chat. Dove c'e' un autopilota
 * si parla con lui — la stessa conversazione della sua scheda, con la domanda
 * aperta in fondo; dove non c'e', e' la chat che aspetta a scrivere qui la sua
 * domanda o il permesso, con le opzioni da toccare, e si risponde da qui.
 *
 * Le conversazioni le compone il Core con la stessa funzione che serve il
 * telefono (`conversazioniDomande`, attraverso le stesse rotte): PC, pagina e
 * app mostrano la stessa cosa.
 */

type Props = { onChiudi: () => void; onConteggio?: (n: number) => void }

/** Ogni quanto si rilegge: come il telefono. */
const OGNI_MS = 2000

function orario(q: string | undefined): string {
  if (q === undefined || q.length < 16) return ''
  const d = new Date(q)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

export function PannelloDomande({ onChiudi, onConteggio }: Props): React.JSX.Element {
  const [conversazioni, setConversazioni] = useState<Conversazione[] | undefined>(undefined)
  const [scelta, setScelta] = useState<string | undefined>(undefined)
  const [testo, setTesto] = useState('')
  const [nota, setNota] = useState<string | undefined>(undefined)
  const [inCorso, setInCorso] = useState(false)
  /** Quello che hai appena mandato, finche' il computer non lo rimette nel filo. */
  const [mandati, setMandati] = useState<Record<string, string[]>>({})
  const flusso = useRef<HTMLDivElement>(null)

  const leggi = useCallback((): void => {
    window.gestore.domande
      .chiama('/api/domande')
      .then((r) => {
        const c = ((r.corpo as { conversazioni?: Conversazione[] }).conversazioni) ?? []
        setConversazioni(c)
        onConteggio?.(c.filter((x) => x.chiede).length)
      })
      .catch((e: unknown) => setNota(`Non riesco a leggere le domande: ${String(e)}`))
  }, [onConteggio])

  useEffect(() => {
    leggi()
    const h = setInterval(leggi, OGNI_MS)
    return () => clearInterval(h)
  }, [leggi])

  const elenco = conversazioni ?? []
  const aperta = elenco.find((c) => c.chiave === scelta) ?? elenco[0]

  // In fondo, come ogni chat, quando cambia il numero dei messaggi.
  const quanti = aperta?.messaggi.length ?? 0
  useEffect(() => {
    const f = flusso.current
    if (f !== null) f.scrollTop = f.scrollHeight
  }, [aperta?.chiave, quanti])

  const manda = (percorso: string, corpo: Record<string, string>, ricordo: string): void => {
    if (aperta === undefined || inCorso) return
    setInCorso(true)
    setNota(undefined)
    void window.gestore.domande
      .chiama(percorso, corpo)
      .then((r) => {
        const errore = (r.corpo as { errore?: string } | undefined)?.errore
        if (r.stato >= 400 || errore !== undefined) {
          setNota(errore !== undefined && errore.includes('mandata') ? 'Già mandata: aspetta che lo schermo cambi.'
            : errore !== undefined && errore.includes('cambiata') ? 'La scelta è cambiata mentre toccavi: fra un attimo si aggiorna.'
            : `Non è andata: ${errore ?? `il computer ha risposto ${r.stato}`}`)
          return
        }
        setMandati((m) => ({ ...m, [aperta.chiave]: [...(m[aperta.chiave] ?? []), ricordo] }))
        setTesto('')
        leggi()
      })
      .catch((e: unknown) => setNota(`Non sono riuscito a mandarlo: ${String(e)}`))
      .finally(() => setInCorso(false))
  }

  const scrivi = (): void => {
    if (aperta === undefined || testo.trim() === '') return
    const r = richiestaRisposta(aperta.risposta, testo.trim())
    manda(r.percorso, r.corpo, testo.trim())
  }

  // I messaggi mandati da qui che il computer non ha ancora rimesso nel filo.
  const inAttesa = (aperta === undefined ? [] : mandati[aperta.chiave] ?? [])
    .filter((t) => !aperta?.messaggi.some((m) => m.da === 'tu' && (m.testo === t || m.testo === `scelto: ${t}`)))

  return (
    <div className="pannello domande-pc">
      <div className="pannello__testa">
        <span className="serigrafia">Domande</span>
        <span className="misura">
          {conversazioni === undefined ? 'leggo…' : elenco.length === 0 ? 'niente da rispondere' : `${elenco.filter((c) => c.chiede).length} aspettano una risposta · ${elenco.length} conversazioni`}
        </span>
        <span style={{ flex: 1 }} />
        <button className="tasto" onClick={onChiudi}>Chiudi</button>
      </div>

      {elenco.length === 0 ? (
        <p className="misura domande-pc__vuoto">
          Qui compaiono, come conversazioni e senza bloccare niente: gli autopiloti che ti chiedono qualcosa (prima di partire o mentre lavorano) — ci parli come nella loro scheda; le chat che aspettano una scelta o un permesso — scrivono qui la domanda con le opzioni da toccare; e le chat che hanno finito il turno e aspettano la tua istruzione. La stessa cosa che vedi sul telefono.
        </p>
      ) : (
        <div className="domande-pc__corpo">
          <ul className="domande-pc__elenco" aria-label="Conversazioni">
            {elenco.map((c) => (
              <li key={c.chiave}>
                <button
                  className={`domande-pc__voce${c.chiave === aperta?.chiave ? ' domande-pc__voce--aperta' : ''}`}
                  onClick={() => { setScelta(c.chiave); setNota(undefined) }}
                >
                  <span className={`led ${c.chiede ? 'led--attesa' : 'led--finito'}`} />
                  <span className="domande-pc__titolo">
                    <b>{c.titolo}</b>
                    <span className="misura">{c.tipo === 'autopilota' ? 'autopilota' : c.chiede ? 'chat · aspetta che tu scelga' : 'chat · ha finito il turno'}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {aperta !== undefined ? (
            <section className="chatap domande-pc__chat" aria-label={`Conversazione con ${aperta.titolo}`}>
              <div className="misura">{aperta.sotto}</div>
              <div className="chatap__flusso" ref={flusso} aria-live="polite">
                {aperta.messaggi.map((m, i) => (
                  m.da === 'nota' ? (
                    <div key={i} className="chatap__riga chatap__riga--nota">
                      <span className="chatap__quando">{orario(m.quando)}</span>
                      <span className="chatap__nota-testo">{m.testo}</span>
                    </div>
                  ) : (
                    <div key={i} className={`chatap__riga chatap__riga--${m.da}${m.tono === 'domanda' ? ' chatap__riga--domanda' : ''}`}>
                      <div className="chatap__bolla">
                        <span className="chatap__chi">{m.da === 'tu' ? 'tu' : aperta.titolo} {orario(m.quando)}</span>
                        <span className="chatap__testo" style={{ whiteSpace: 'pre-wrap' }}>{m.testo}</span>
                        {m.opzioni !== undefined && m.opzioni.length > 0 ? (
                          <span className="domande-pc__opzioni">
                            {m.opzioni.map((o) => (
                              <button
                                key={o.numero}
                                className={`tasto${o.scelta ? ' tasto--primario' : ''}`}
                                disabled={inCorso}
                                onClick={() => {
                                  // Una chat: si sceglie nell'elenco del terminale. Un
                                  // autopilota (domande iniziali, «Pubblico adesso?»):
                                  // toccare un'opzione e' rispondere con quel testo.
                                  if (aperta.scelte !== undefined) manda('/api/scegli', { chat: aperta.scelte.chat, opzione: o.testo }, o.testo)
                                  else { const r = richiestaRisposta(aperta.risposta, o.testo); manda(r.percorso, r.corpo, o.testo) }
                                }}
                              >
                                {o.numero}. {o.testo}
                              </button>
                            ))}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  )
                ))}
                {inAttesa.map((t, i) => (
                  <div key={`m${i}`} className="chatap__riga chatap__riga--tu">
                    <div className="chatap__bolla">
                      <span className="chatap__chi">tu · mandato, aspetto il computer</span>
                      <span className="chatap__testo">{t}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="chatap__scrivi">
                <textarea
                  className="campo chatap__campo"
                  rows={3}
                  value={testo}
                  placeholder={aperta.segnaposto}
                  onChange={(e) => setTesto(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); scrivi() } }}
                />
                <div className="chatap__tasti">
                  <button className="tasto tasto--primario" onClick={scrivi} disabled={inCorso || testo.trim() === ''}>
                    {inCorso ? 'Mando…' : aperta.risposta.via === 'rispondi' ? 'Rispondi' : 'Manda'}
                  </button>
                  <span className="misura">
                    {aperta.risposta.via === 'rispondi' ? 'Arriva subito alla chat ferma.' : 'Arriva nella chat come se l’avessi scritto lì.'} Ctrl+Invio manda.
                  </span>
                </div>
                {nota !== undefined ? <div className="avviso">⚠ {nota}</div> : null}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  )
}
