import { useCallback, useEffect, useRef, useState } from 'react'
import type { DomandaAperta } from '../../main/autopilot-client'
import type { Autopilota } from '@shared/autopilota'
import { daMostrare, tempoResiduo } from '../domanda-vista'

/** L'ultima parte del percorso: nella finestra il nome della cartella basta. */
function cartellaBreve(percorso: string): string {
  const parti = percorso.split(/[\\/]/).filter((p) => p !== '')
  return parti[parti.length - 1] ?? percorso
}

/** Ogni quanto si chiede al servizio se c'è una domanda in sospeso. */
const SONDAGGIO_MS = 3000
/** Ogni quanto si ridisegna il tempo che resta. */
const OROLOGIO_MS = 1000

/**
 * La finestra con cui l'autopilota chiede all'utente ciò che non può decidere.
 *
 * Compare da sé quando una domanda si apre e sparisce quando qualcuno risponde
 * — anche se a rispondere è stato Telegram, perché il servizio è l'unica fonte
 * di verità e questa finestra si limita a chiedergli cosa c'è di aperto.
 *
 * È richiamabile: chiudendola resta il pulsante nel pannello, perché una
 * domanda chiusa per sbaglio non deve diventare una domanda persa.
 */
export function DomandaModale({ autopiloti }: { autopiloti: Autopilota[] }): React.JSX.Element | null {
  const [domande, setDomande] = useState<DomandaAperta[]>([])
  const [testo, setTesto] = useState('')
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const [inCorso, setInCorso] = useState(false)
  const [nascosta, setNascosta] = useState(false)
  const [adesso, setAdesso] = useState(() => Date.now())
  // Cambiando domanda il campo va svuotato: rispondere alla domanda sbagliata
  // con il testo di un'altra sarebbe peggio che non rispondere.
  const ultimaMostrata = useRef<string | undefined>(undefined)

  const ricarica = useCallback((): void => {
    window.gestore.autopilota
      .domande()
      .then((d) => { setDomande(d); setErrore(undefined) })
      .catch(() => {
        // Il servizio spento non è un errore da mostrare qui: il pannello lo
        // dice già, e una finestra che compare per annunciare un guasto mentre
        // l'utente lavora sarebbe solo un fastidio.
        setDomande([])
      })
  }, [])

  useEffect(() => {
    ricarica()
    const sondaggio = setInterval(ricarica, SONDAGGIO_MS)
    const orologio = setInterval(() => setAdesso(Date.now()), OROLOGIO_MS)
    return () => { clearInterval(sondaggio); clearInterval(orologio) }
  }, [ricarica])

  const domanda = daMostrare(domande, adesso)
  const autopilota = domanda === undefined
    ? undefined
    : autopiloti.find((a) => a.id === domanda.autopilotaId)

  useEffect(() => {
    if (domanda?.id === ultimaMostrata.current) return
    ultimaMostrata.current = domanda?.id
    setTesto('')
    // Una domanda nuova riapre la finestra anche se la precedente era stata
    // chiusa: è nuova, e l'utente non l'ha ancora vista.
    setNascosta(false)
  }, [domanda?.id])

  if (domanda === undefined) return null

  if (nascosta) {
    return (
      <div className="richiamo">
        <span className="led led--attesa" />
        <button className="tasto" onClick={() => setNascosta(false)}>
          Un autopilota ti sta aspettando
        </button>
      </div>
    )
  }

  const rispondi = (): void => {
    const risposta = testo.trim()
    if (risposta === '' || inCorso) return
    setInCorso(true)
    setErrore(undefined)
    window.gestore.autopilota
      .rispondi(domanda.id, risposta)
      .then(() => { setTesto(''); ricarica() })
      .catch((e: unknown) => setErrore(String(e)))
      .finally(() => setInCorso(false))
  }

  return (
    <div className="velo">
      {/* Il filo ambra in cima è lo stesso colore del LED che lampeggia nella
          fascia: chi lo ha visto lassù ritrova qui la stessa cosa, e questa
          finestra non si confonde con le altre — è l'unica che aspetta te. */}
      <div className="dialogo dialogo--attesa">
        <div className="dialogo__testa">
          <span className="led led--attesa" />
          <span className="serigrafia">{autopilota?.nome ?? 'Un autopilota'}</span>
          <span className="misura" style={{ marginLeft: 'auto' }}>{tempoResiduo(domanda, adesso)}</span>
        </div>

        {/* La conversazione, non una domanda isolata: chi risponde alla terza
            domanda deve poter rileggere cosa ha già detto, altrimenti risponde
            due volte alla stessa cosa in modo diverso. */}
        {autopilota !== undefined ? (
          <div className="scambio">
            {autopilota.stato === 'intervista' && autopilota.intervista.length === 0 ? (
              <p className="scambio__nota">
                Sta preparando il lavoro: ha guardato «{cartellaBreve(autopilota.cwd)}» e ti chiede
                quello che il codice non gli dice.
              </p>
            ) : null}
            {autopilota.intervista.map((s, i) => (
              <div key={i} className="scambio__giro">
                <div className="scambio__domanda">{s.domanda}</div>
                <div className="scambio__risposta">{s.risposta}</div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="dialogo__domanda">{domanda.testo}</div>

        <textarea
          autoFocus
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          onKeyDown={(e) => {
            // Invio manda, Maiusc+Invio va a capo: una risposta è quasi sempre
            // una riga, e costringere al mouse per mandarla la rallenterebbe.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              rispondi()
            }
          }}
          rows={3}
          placeholder="La tua risposta — Invio manda, Maiusc+Invio va a capo"
          className="campo"
          style={{ width: '100%', fontSize: 13, resize: 'vertical', lineHeight: 1.45 }}
        />

        {errore !== undefined ? (
          <div className="avviso" style={{ marginTop: 8, whiteSpace: 'normal' }}>⚠ {errore}</div>
        ) : null}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="tasto" onClick={() => setNascosta(true)} disabled={inCorso}>
            Più tardi
          </button>
          <button
            className="tasto tasto--primario"
            onClick={rispondi}
            disabled={inCorso || testo.trim() === ''}
          >
            Rispondi
          </button>
        </div>
      </div>
    </div>
  )
}
