import { useEffect, useRef, useState } from 'react'
import type { Autopilota } from '@shared/autopilota'
import { conversazione, haDomandaAperta, staPensando } from '../chat-autopilota'

/**
 * La chat con l'autopilota: in cima alla sua sezione, prima di tutto il resto.
 *
 * Nicholas (18/09): «io posso dialogare con lui e lui con me attraverso la
 * chat, così rimangono ben visibili domande e risposte». È **lui** che parla
 * qui — il supervisore, quello che segue il lavoro e decide — non la chat che
 * esegue: quella si guarda nella linguetta «Sta facendo». Quello che scrivi
 * arriva a lui; se è un'istruzione la applica e la porta alla chat che esegue
 * alla fine del turno; se ha una domanda aperta, quello che scrivi è la
 * risposta.
 */
export function ChatAutopilota({
  autopilota,
  onCambiato
}: {
  autopilota: Autopilota
  /** Qualcosa è cambiato: chi ci sta sopra deve rileggere lo stato adesso. */
  onCambiato: () => void
}): React.JSX.Element {
  const [messaggio, setMessaggio] = useState('')
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const flusso = useRef<HTMLDivElement | null>(null)

  const battute = conversazione(autopilota)
  const pensa = staPensando(autopilota)
  const domanda = haDomandaAperta(autopilota)
  const ultimaModifica = autopilota.modifiche[autopilota.modifiche.length - 1]

  // In fondo, come ogni chat: l'ultima cosa detta è quella che si vuole vedere.
  // Si scorre quando cambia il numero delle righe, non a ogni rilettura, così
  // chi sta rileggendo l'inizio non viene riportato giù ogni cinque secondi.
  useEffect(() => {
    const el = flusso.current
    if (el !== null) el.scrollTop = el.scrollHeight
  }, [battute.length, pensa])

  const esegui = (che: () => Promise<unknown>): void => {
    setInCorso(true)
    setErrore(undefined)
    che()
      .then(() => { setMessaggio(''); onCambiato() })
      .catch((e: unknown) => setErrore(String(e instanceof Error ? e.message : e)))
      .finally(() => setInCorso(false))
  }

  /**
   * Manda quello che hai scritto: a una domanda aperta si risponde, altrimenti
   * gli si parla. La risposta a una domanda arriva subito alla chat ferma; la
   * risposta a una battuta la scrive il supervisore, in qualche minuto.
   */
  const manda = (): void => {
    const testo = messaggio.trim()
    if (testo === '' || inCorso) return
    if (domanda) {
      esegui(() =>
        window.gestore.autopilota.domande().then((aperte) => {
          const mia = aperte.find((d) => d.autopilotaId === autopilota.id)
          if (mia === undefined) throw new Error('la domanda non è più aperta: gli parlo invece')
          return window.gestore.autopilota.rispondi(mia.id, testo)
        })
      )
      return
    }
    esegui(() => window.gestore.autopilota.dialoga(autopilota.id, testo))
  }

  return (
    <section className="chatap" aria-label="Chat con l’autopilota">
      <div className="chatap__flusso" ref={flusso} aria-live="polite">
        {battute.map((b, i) => (
          <div
            key={`${b.quando}-${i}`}
            className={`chatap__riga chatap__riga--${b.da}${b.tono !== undefined ? ` chatap__riga--${b.tono}` : ''}`}
          >
            {b.da === 'nota' ? (
              <>
                <span className="chatap__quando">{orario(b.quando)}</span>
                <span className="chatap__nota-testo">
                  {b.testo}
                  {b.volte !== undefined ? <span className="chatap__volte"> ×{b.volte}</span> : null}
                  {b.dettaglio !== undefined ? <span className="chatap__nota-dettaglio"> — {b.dettaglio}</span> : null}
                </span>
              </>
            ) : (
              <div className="chatap__bolla">
                <span className="chatap__chi">
                  {b.da === 'tu' ? 'tu' : autopilota.nome.trim() !== '' ? autopilota.nome : 'lui'} · {orario(b.quando)}
                </span>
                <span className="chatap__testo">{b.testo}</span>
                {b.dettaglio !== undefined ? <span className="chatap__esito">{b.dettaglio}</span> : null}
                {b.tono === 'pronto' ? (
                  <button
                    className="tasto tasto--primario chatap__via"
                    disabled={inCorso}
                    onClick={() => esegui(() => window.gestore.autopilota.vai(autopilota.id))}
                  >
                    Vai
                  </button>
                ) : null}
              </div>
            )}
          </div>
        ))}
        {pensa ? (
          <p className="chatap__pensa">● sta pensando alla risposta… di solito entro qualche minuto. Puoi scrivergli altro: risponde in ordine.</p>
        ) : null}
        {autopilota.stato === 'intervista' && !domanda ? (
          <p className="chatap__pensa">● sta guardando il progetto per capire cosa serve: se ha un dubbio te lo chiede qui.</p>
        ) : null}
      </div>

      <div className="chatap__scrivi">
        <textarea
          className="campo chatap__campo"
          rows={2}
          value={messaggio}
          placeholder={
            domanda
              ? 'la tua risposta'
              : 'scrivigli: una domanda, un vincolo, un compito in più, «fermati», «riprendi»…'
          }
          aria-label={domanda ? 'rispondi all autopilota' : 'scrivi all autopilota'}
          onChange={(e) => setMessaggio(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) manda()
          }}
        />
        <div className="chatap__tasti">
          <button
            className="tasto tasto--primario"
            disabled={inCorso || messaggio.trim() === ''}
            onClick={manda}
            title="Ctrl+Invio manda"
          >
            {inCorso ? 'Mando…' : domanda ? 'Rispondi' : 'Manda'}
          </button>
          {ultimaModifica !== undefined ? (
            <button
              className="tasto"
              disabled={inCorso}
              title={`Rimette com'era prima di: ${ultimaModifica.capito}`}
              onClick={() => esegui(() => window.gestore.autopilota.disfa(autopilota.id))}
            >
              Disfa
            </button>
          ) : null}
          <span
            className="chatap__info"
            tabIndex={0}
            title={
              'Qui parli con l’autopilota, non con la chat che esegue. Lui risponde con parole sue, ' +
              'con davanti obiettivo, criteri, diario e l’ultima cosa scritta dalla chat. Se quello che ' +
              'scrivi è un’istruzione la applica: cambia obiettivo o criteri, aggiunge un compito, si ferma ' +
              '(«fermati»), riparte («riprendi»). Se serve che la chat lo sappia, glielo consegna alla fine ' +
              'del turno che ha in mano, mai in mezzo a un’azione, oppure appena riparte se è fermo. La risposta ' +
              'arriva di solito entro qualche minuto. Se ha una domanda aperta, quello che scrivi è la risposta ' +
              'e arriva subito. «Disfa» rimette com’era prima dell’ultimo cambio. Non parte nessun lavoro nuovo ' +
              'e non si chiude nessuna chat senza che tu lo chieda.'
            }
            aria-label="Come funziona questa chat"
          >
            ?
          </span>
        </div>
        {errore !== undefined ? <div className="avviso">⚠ {errore}</div> : null}
      </div>
    </section>
  )
}

/** Solo l'ora: dentro una giornata di lavoro il giorno lo si sa. */
function orario(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}
