import { useEffect, useRef, useState } from 'react'
import { TastoMicrofono } from './TastoMicrofono'
import { useLayoutStore } from '../state/layout'
import { toccoScelta, type ApriChatAltrove, type SceltaScheda, type SchedaDomanda } from '@shared/scheda-domanda'

/**
 * «Apri la chat su <PC>» (0.84.1): il riquadro dal vivo verso quella chat,
 * come da «Gli altri computer». Già a schermo non si apre due volte.
 */
export function apriChatAltrove(a: ApriChatAltrove): void {
  const stato = useLayoutStore.getState()
  const gia = Object.values(stato.panes).find((p) => p.sessionUuid === a.sessione)
  if (gia !== undefined) { if (gia.ibernata === true) stato.sveglia(gia.id); return }
  stato.addPane(a.cwd, a.titolo, undefined, { sessionUuid: a.sessione, remoto: { pcId: a.pcId, pcNome: a.pc, cwd: a.cwd, sessione: a.sessione } })
}

/**
 * Una domanda essenziale (0.72.1): chi chiede in piccolo, la domanda in una
 * frase, le scelte come tasti (la consigliata segnata), «Scrivi tu», e il
 * resto dietro un «?» chiuso. Nessuna cronologia. La stessa scheda nella
 * colonna Domande e nella linguetta «Domande» dell'autopilota; la pagina e
 * l'app la disegnano uguale.
 */
export function SchedaDomandaVista({
  scheda: s,
  inCorso,
  onScelta,
  onScrivi,
  etichettaManda = 'Manda',
  sotto
}: {
  scheda: SchedaDomanda
  inCorso: boolean
  onScelta: (scelta: SceltaScheda) => void
  onScrivi: (testo: string) => void
  etichettaManda?: string
  /** Una riga sotto il campo: l'avviso di un invio non riuscito, il PIN. */
  sotto?: React.ReactNode
}): React.JSX.Element {
  const [aperti, setAperti] = useState(false)
  const [testo, setTesto] = useState('')
  const campo = useRef<HTMLTextAreaElement | null>(null)
  // Un'altra domanda: campo vuoto e dettagli chiusi.
  useEffect(() => { setTesto(''); setAperti(false) }, [s.domanda, s.chi])
  const manda = (): void => {
    const t = testo.trim()
    if (t === '' || inCorso) return
    onScrivi(t)
    setTesto('')
  }
  return (
    <section className="scheda-domanda" aria-label={`Domanda: ${s.domanda}`}>
      <div className="scheda-domanda__chi">
        <span>{s.chi}</span>
        {s.poi !== undefined && s.poi > 0 ? <span> · poi {s.poi === 1 ? 'un’altra' : `altre ${s.poi}`}</span> : null}
        {s.dettagli.length > 0 ? (
          <button
            className={`aiuto__tasto scheda-domanda__piu${aperti ? ' aiuto__tasto--aperto' : ''}`}
            type="button"
            aria-expanded={aperti}
            title={aperti ? 'Chiudi i dettagli' : 'Cosa sta facendo, perché lo chiede, cosa succede con ogni scelta'}
            onClick={() => setAperti(!aperti)}
          >?</button>
        ) : null}
      </div>
      <div className="scheda-domanda__domanda">{s.domanda}</div>
      {s.risposta !== undefined ? <div className="scheda-domanda__risposta">risposta dall’autopilota: {s.risposta}</div> : null}
      {s.superata !== undefined ? <div className="scheda-domanda__risposta">chiusa senza risposta, non serve più: {s.superata}</div> : null}
      {aperti ? (
        <dl className="scheda-domanda__dettagli">
          {s.dettagli.map((d, i) => (
            <div key={i}>
              <dt className="serigrafia">{d.etichetta}</dt>
              <dd>{d.testo}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {s.scelte.length > 0 ? (
        // 0.84.3: con le conseguenze, una scelta per riga e sotto cosa succede.
        <div className={`scheda-domanda__scelte${s.scelte.some((c) => c.conseguenza !== undefined) ? ' scheda-domanda__scelte--spiegate' : ''}`}>
          {s.scelte.map((c, i) => {
            const tasto = (
              <button
                key={`${c.numero ?? i}-${c.testo}`}
                className={`tasto${c.consigliata === true ? ' tasto--primario scheda-domanda__consigliata' : ''}`}
                disabled={inCorso}
                title={c.libera === true ? 'Scrivi la risposta nel campo qui sotto' : c.consigliata === true ? 'La scelta consigliata' : undefined}
                // 0.84.3: una risposta da scrivere apre il campo, non risponde.
                onClick={() => { if (toccoScelta(c) === 'scrivi') campo.current?.focus(); else onScelta(c) }}
              >
                {c.spuntata !== undefined ? (c.spuntata ? '☑ ' : '☐ ') : null}
                {c.consigliata === true ? '★ ' : null}{c.etichetta ?? c.testo}
              </button>
            )
            return c.conseguenza === undefined ? tasto : (
              <div key={`${c.numero ?? i}-${c.testo}`} className="scheda-domanda__scelta">
                {tasto}
                <div className="scheda-domanda__conseguenza">→ {c.conseguenza}</div>
              </div>
            )
          })}
        </div>
      ) : null}
      {s.apri !== undefined ? (
        <div className="scheda-domanda__scelte">
          <button className="tasto tasto--primario" type="button" onClick={() => apriChatAltrove(s.apri!)}>Apri la chat su {s.apri.pc}</button>
        </div>
      ) : null}
      <div className="scheda-domanda__scrivi">
        <textarea
          ref={campo}
          className="campo"
          rows={2}
          value={testo}
          placeholder={s.segnaposto}
          aria-label="Scrivi tu"
          onChange={(e) => setTesto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); manda() } }}
        />
        <button className="tasto tasto--primario" disabled={inCorso || testo.trim() === ''} onClick={manda} title="Ctrl+Invio">
          {inCorso ? 'Mando…' : etichettaManda}
        </button>
        <TastoMicrofono campo={campo} />
      </div>
      {sotto}
    </section>
  )
}
