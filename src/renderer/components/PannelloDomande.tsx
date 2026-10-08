import { useCallback, useEffect, useRef, useState } from 'react'
import { MISURE, larghezzaEffettiva, larghezzaTrascinata, limita, massimoColonna, passoFreccia, suggerimentoBarra } from '@shared/misure-pannelli'
import { useLarghezzaFinestra } from '../larghezza-finestra'
import { quanteAspettano, richiestaRisposta, type Conversazione } from '@shared/domande-conversazioni'
import { LARGHEZZA_DOMANDE } from '@shared/preferenze'
import { EtichettaOpzione } from './EtichettaOpzione'

/**
 * Le Domande sul PC: una colonna laterale fissa, accanto alle chat (0.36.0).
 *
 * Nicholas (30/09): come nell'app Android — una colonna che resta aperta mentre
 * si lavora, non un pannello che copre il mosaico. Si apre e si chiude dal
 * tasto «Domande» della console; aperta/chiusa e larghezza si ritrovano al
 * riavvio (preferenze `domandeLaterali`, `larghezzaDomande`).
 *
 * Contiene tutto quello che aspetta una tua risposta, come conversazioni a
 * messaggi: le chat ferme su una domanda o un permesso (con le opzioni da
 * toccare), le chat che hanno finito il turno, gli autopiloti — la domanda
 * aperta, le domande iniziali della preparazione, il «dammi il via», il
 * «Pubblico adesso?». Le compone il Core con la stessa funzione del telefono
 * (`conversazioniDomande`, attraverso le stesse rotte): PC, pagina e app
 * mostrano la stessa cosa.
 */

type Props = {
  onChiudi: () => void
  onConteggio?: (n: number) => void
  larghezza: number
  onLarghezza: (px: number) => void
  /** Quanto prende l'altra colonna aperta (0.41.0): le chat a sinistra restano leggibili. */
  altreColonne?: number
  /**
   * Una domanda nuova da mettere in vista (0.37.2): la colonna apre quella
   * conversazione e la evidenzia per qualche secondo, senza prendere il fuoco.
   */
  evidenza?: { chiave: string; quando: number }
}

/** Ogni quanto si rilegge: come il telefono. */
const OGNI_MS = 2000

function orario(q: string | undefined): string {
  if (q === undefined || q.length < 16) return ''
  const d = new Date(q)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

/**
 * A chi rispondi e cosa succede quando mandi, detto per esteso: e' la riga
 * che Nicholas vuole in ogni pannello.
 */
export function spiegaRisposta(c: Conversazione): string {
  if (c.tipo === 'autopilota') {
    if (c.risposta.via === 'dialogo') {
      return `Parli con l’autopilota «${c.titolo}». Si è preparato e aspetta il tuo via: scrivigli «vai» per farlo partire, oppure cosa cambiare prima. Ti risponde lui, di solito in qualche minuto.`
    }
    if (c.sotto.startsWith('si prepara')) {
      return `Rispondi all’autopilota «${c.titolo}» mentre si prepara: è una delle sue domande iniziali. La risposta gli arriva subito e la preparazione riparte da lì; se tocchi un’opzione rispondi con quel testo.`
    }
    return `Rispondi all’autopilota «${c.titolo}»: la risposta arriva subito alla sua chat, che è ferma su questa domanda e riparte con quello che scrivi. Se tocchi un’opzione rispondi con quel testo.`
  }
  if (c.scelte !== undefined) {
    return `La chat «${c.titolo}» è ferma su un elenco di scelte (un permesso, «vuoi procedere?»). Tocca un’opzione: la chat sceglie quella, come se avessi usato le frecce e Invio. Oppure scrivile qualcosa: arriva nella chat come se l’avessi scritto lì.`
  }
  return `La chat «${c.titolo}» ha finito il turno e aspetta la tua prossima istruzione. Quello che scrivi arriva nella chat come se l’avessi scritto lì, e la chat riparte.`
}

/**
 * Porta alla linguetta «Domande» della scheda di quell'autopilota (0.38.0).
 * Dalla 0.39.1 decide il main dove (`doveMostrareDomande`): la finestra pannello
 * se la linguetta e' staccata, altrimenti la finestra di chat che ha la sua
 * scheda (anche un'altra), altrimenti la linguetta in una finestra pannello.
 * Prima, senza la scheda in questa finestra, si apriva il pannello degli
 * autopiloti, dove la domanda non c'era.
 */
export function apriDomandeAutopilota(id: string): void {
  void window.gestore.pannello.mostraDomande(id, false).catch(() => {
    // Main vecchio o guasto: almeno la scheda di questa finestra, se c'e'.
    window.dispatchEvent(new CustomEvent('sierradeck:domande-autopilota', { detail: { id, gestito: false } }))
  })
}

/** Quanto resta evidenziata una domanda appena arrivata. */
const EVIDENZA_MS = 8000

export function PannelloDomande({ onChiudi, onConteggio, larghezza, onLarghezza, evidenza, altreColonne }: Props): React.JSX.Element {
  const [conversazioni, setConversazioni] = useState<Conversazione[] | undefined>(undefined)
  const [scelta, setScelta] = useState<string | undefined>(undefined)
  const [testo, setTesto] = useState('')
  const [nota, setNota] = useState<string | undefined>(undefined)
  // Il PIN delle chat (0.49.1): la chat a cui si scriveva è protetta. Si chiede qui, e poi si rimanda.
  const [pinPer, setPinPer] = useState<{ percorso: string; corpo: Record<string, string>; ricordo: string } | undefined>(undefined)
  const [pin, setPin] = useState('')
  const [inCorso, setInCorso] = useState(false)
  /** Quello che hai appena mandato, finche' il computer non lo rimette nel filo. */
  const [mandati, setMandati] = useState<Record<string, string[]>>({})
  const flusso = useRef<HTMLDivElement>(null)
  const [larga, setLarga] = useState(larghezza)
  useEffect(() => setLarga(larghezza), [larghezza])
  // La domanda nuova: si apre la sua conversazione e si evidenzia. Niente
  // `focus()`: chi sta scrivendo in una chat non deve perdere la tastiera.
  const [nuova, setNuova] = useState<string | undefined>(undefined)
  const elencoRef = useRef<HTMLUListElement>(null)
  useEffect(() => {
    if (evidenza === undefined || evidenza.chiave === '') return
    setScelta(evidenza.chiave)
    setNuova(evidenza.chiave)
    const t = setTimeout(() => setNuova(undefined), EVIDENZA_MS)
    return () => clearTimeout(t)
  }, [evidenza?.chiave, evidenza?.quando])
  useEffect(() => {
    if (nuova === undefined) return
    const voce = elencoRef.current?.querySelector(`[data-chiave="${CSS.escape(nuova)}"]`)
    voce?.scrollIntoView({ block: 'nearest' })
  }, [nuova])

  const leggi = useCallback((): void => {
    window.gestore.domande
      .chiama('/api/domande')
      .then((r) => {
        const c = ((r.corpo as { conversazioni?: Conversazione[] }).conversazioni) ?? []
        setConversazioni(c)
        onConteggio?.((r.corpo as { chiedono?: number }).chiedono ?? quanteAspettano(c))
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

  const finestra = useLarghezzaFinestra()
  const altre = altreColonne ?? 0
  /** La maniglia sul bordo sinistro: si trascina la larghezza, si salva al rilascio. */
  const trascina = (e: React.PointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    const bersaglio = e.currentTarget
    bersaglio.setPointerCapture(e.pointerId)
    const partenza = e.clientX
    const iniziale = larga
    let ultima = iniziale
    const muovi = (ev: PointerEvent): void => {
      // Dentro i limiti, e mai tanto da lasciare le chat illeggibili (0.41.0).
      ultima = larghezzaTrascinata({ sezione: 'domande', iniziale, partenzaX: partenza, x: ev.clientX, finestra: window.innerWidth, altreColonne: altre })
      setLarga(ultima)
    }
    const molla = (): void => {
      bersaglio.removeEventListener('pointermove', muovi)
      bersaglio.removeEventListener('pointerup', molla)
      onLarghezza(ultima)
    }
    bersaglio.addEventListener('pointermove', muovi)
    bersaglio.addEventListener('pointerup', molla)
  }
  /** Le frecce spostano il bordo a passi; il doppio clic torna alla misura iniziale (0.41.0). */
  const tasti = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const passo = passoFreccia('domande', e.key)
    if (passo === 0) return
    e.preventDefault()
    const nuova = Math.min(limita('domande', larga + passo), massimoColonna('domande', window.innerWidth, altre))
    setLarga(nuova)
    onLarghezza(nuova)
  }
  const iniziale = (): void => {
    setLarga(MISURE.domande.predefinita)
    onLarghezza(MISURE.domande.predefinita)
  }

  const manda = (percorso: string, corpo: Record<string, string>, ricordo: string): void => {
    if (aperta === undefined || inCorso) return
    setInCorso(true)
    setNota(undefined)
    void window.gestore.domande
      .chiama(percorso, corpo)
      .then((r) => {
        const errore = (r.corpo as { errore?: string } | undefined)?.errore
        if (r.stato === 423) {
          setPinPer({ percorso, corpo, ricordo })
          setNota('Chat protetta: inserisci il PIN. Il messaggio non è partito: mettilo qui sotto e lo rimando.')
          return
        }
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
  const chiedono = elenco.filter((c) => c.chiede).length

  return (
    <aside className="domande-lato" style={{ width: larghezzaEffettiva('domande', larga, finestra, altre) }} aria-label="Domande">
      <div
        className="domande-lato__maniglia"
        role="separator"
        aria-orientation="vertical"
        aria-label="Larghezza della colonna delle Domande"
        tabIndex={0}
        title={suggerimentoBarra('domande')}
        onPointerDown={trascina}
        onDoubleClick={iniziale}
        onKeyDown={tasti}
      />
      <div className="domande-lato__testa">
        <span className="serigrafia">Domande</span>
        <span className="misura">
          {conversazioni === undefined ? 'leggo…' : chiedono > 0 ? `${chiedono} aspettano una tua risposta` : 'nessuna domanda in attesa'}
        </span>
        <span style={{ flex: 1 }} />
        <button className="tasto tasto--mini" onClick={onChiudi} title="Chiude la colonna. Si riapre dal tasto «Domande» della console.">×</button>
      </div>
      <p className="misura domande-lato__cosa">
        Tutto quello che aspetta una tua risposta, come conversazioni: le chat ferme su una domanda o un permesso, le chat che hanno finito il turno, gli autopiloti (le domande iniziali della preparazione, una domanda mentre lavorano, il «dammi il via», il «Pubblico adesso?»). Resta aperta accanto alle chat; è la stessa cosa che vedi nell’app e nella pagina del telefono.
      </p>

      {elenco.length === 0 ? (
        <p className="misura domande-lato__vuoto">
          {conversazioni === undefined
            ? 'Leggo dal programma…'
            : 'Niente da rispondere adesso. Quando una chat si ferma su una domanda o un permesso, o un autopilota ti chiede qualcosa, compare qui con il modo di rispondere; il numero sul tasto «Domande» dice quante aspettano.'}
        </p>
      ) : (
        <>
          <ul className="domande-lato__elenco" aria-label="Conversazioni" ref={elencoRef}>
            {elenco.map((c) => (
              <li key={c.chiave} data-chiave={c.chiave}>
                <button
                  className={`domande-pc__voce${c.chiave === aperta?.chiave ? ' domande-pc__voce--aperta' : ''}${c.chiave === nuova ? ' domande-pc__voce--nuova' : ''}`}
                  onClick={() => {
                    setScelta(c.chiave)
                    setNota(undefined)
                    // Un autopilota: la riga porta dritta alla sua linguetta.
                    if (c.tipo === 'autopilota' && c.autopilota !== undefined) apriDomandeAutopilota(c.autopilota)
                  }}
                >
                  <span className={`led ${c.chiede ? 'led--attesa' : 'led--finito'}`} />
                  <span className="domande-pc__titolo">
                    <b>{c.suPc !== undefined ? <span className="segno-remoto">SU {c.suPc}{c.viaPc !== undefined ? ` (${c.viaPc})` : ''} · </span> : null}{c.titolo}</b>
                    <span className="misura">
                      {c.tipo === 'autopilota'
                        ? `ti aspetta (${c.quante ?? 1}) → apri`
                        : c.chiede ? 'chat · aspetta che tu scelga' : 'chat · ha finito il turno'}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {aperta !== undefined && aperta.tipo === 'autopilota' && aperta.autopilota !== undefined ? (
            // Le domande di un autopilota non stanno qui (0.38.0, Nicholas):
            // stanno nella linguetta «Domande» della sua scheda, una per volta.
            <section className="domande-lato__chat domande-lato__rimando" aria-label={`${aperta.titolo} ti aspetta`}>
              <p className="misura">
                «{aperta.titolo}» ti aspetta con {aperta.quante === 1 || aperta.quante === undefined ? 'una domanda' : `${aperta.quante} domande`}.
                Le domande di un autopilota si rispondono nella sua scheda, accanto alla sua chat: linguetta «Domande», una per volta,
                con le opzioni da toccare. Dopo la risposta, domanda e risposta restano nella chat con lui.
              </p>
              <button className="tasto tasto--primario" onClick={() => apriDomandeAutopilota(aperta.autopilota!)}>
                Apri la sua linguetta «Domande» →
              </button>
            </section>
          ) : aperta !== undefined ? (
            <section className="chatap domande-lato__chat" aria-label={`Conversazione con ${aperta.titolo}`}>
              <div className="misura domande-lato__chi">{spiegaRisposta(aperta)}</div>
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
                                title={o.libera === true ? 'Scrivi la risposta nel campo qui sotto e mandala: arriva a Claude come risposta libera' : o.descrizione}
                                onClick={() => {
                                  // «Type something.» (0.52.5): si risponde scrivendo nel campo qui sotto.
                                  if (o.libera === true) { setNota('Scrivi la risposta nel campo qui sotto e premi «Manda»: arriva a Claude come risposta libera.'); return }
                                  // Una chat: si sceglie nell'elenco del terminale. Un
                                  // autopilota (domande iniziali, «Pubblico adesso?»):
                                  // toccare un'opzione e' rispondere con quel testo.
                                  if (aperta.scelte !== undefined) manda('/api/scegli', { chat: aperta.scelte.chat, opzione: o.testo }, o.testo)
                                  else { const r = richiestaRisposta(aperta.risposta, o.testo); manda(r.percorso, r.corpo, o.testo) }
                                }}
                              >
                                <EtichettaOpzione o={o} />
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
                      <span className="chatap__chi">tu · mandato, aspetto il programma</span>
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
                  <span className="misura">Ctrl+Invio manda. Quando il programma riceve la risposta, la domanda sparisce da qui.</span>
                </div>
                {nota !== undefined ? <div className="avviso">⚠ {nota}</div> : null}
                {pinPer !== undefined ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '4px 0' }}>
                    <span aria-hidden="true">🔒</span>
                    <input className="campo" type="password" inputMode="numeric" maxLength={8} placeholder="PIN" value={pin} style={{ width: 110 }}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
                    <button className="tasto tasto--mini" disabled={pin.length < 4} onClick={() => {
                      const p = pinPer
                      void window.gestore.domande.chiama('/api/pin/sblocca', { chat: p.corpo.chat ?? '', pin }).then((r) => {
                        setPin('')
                        if (r.stato >= 400) { setNota(`Non aperta: ${(r.corpo as { errore?: string } | undefined)?.errore ?? `il computer ha risposto ${r.stato}`}`); return }
                        setPinPer(undefined)
                        manda(p.percorso, p.corpo, p.ricordo)
                      })
                    }}>Apri e rimanda</button>
                    <button className="tasto tasto--mini" onClick={() => { setPinPer(undefined); setNota(undefined) }}>Lascia stare</button>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}
        </>
      )}
    </aside>
  )
}
