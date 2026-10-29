import { MessaggiVersoLaChat, RigaDalVivo } from './DalVivoAutopilota'
import { PuntoAutopilota } from './PuntoAutopilota'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Autopilota } from '@shared/autopilota'
import { conversazione, haDomandaAperta, staPensando } from '@shared/chat-autopilota'
import { separaConversazione } from '@shared/panoramica'
import { promessaSenzaLavoro } from '@shared/promessa-autopilota'
import { CampoChatAutopilota } from './CampoChatAutopilota'
import { useAutopilotaIntero } from '../state/autopilota-intero'

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
  autopilota: dellElenco,
  onCambiato,
  soloConversazione = false,
  campoPronto = false
}: {
  autopilota: Autopilota
  /** Qualcosa è cambiato: chi ci sta sopra deve rileggere lo stato adesso. */
  onCambiato: () => void
  /**
   * Nella Panoramica (0.78.0): solo la conversazione fra te e lui; le note di
   * lavoro (rami, revisioni, «ha deciso») in «Cosa è successo ▸», chiuso.
   */
  soloConversazione?: boolean
  /**
   * Nella Panoramica (0.79.0, Nicholas): il campo per scrivergli sempre
   * pronto. Prende il fuoco quando la Panoramica si apre, se nessun altro
   * campo lo ha già.
   */
  campoPronto?: boolean
}): React.JSX.Element {
  // La storia intera (0.85.2): l'elenco ne porta solo la coda.
  const autopilota = useAutopilotaIntero(dellElenco)
  // Il testo che scrivi non sta qui (0.85.1): sta in `CampoChatAutopilota`,
  // così una lettera non ridisegna la conversazione intera.
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const flusso = useRef<HTMLDivElement | null>(null)

  // La conversazione si ricalcola solo quando l'autopilota cambia davvero: con
  // centinaia di righe nel diario costa decine di millisecondi.
  const { battute, eventi } = useMemo(() => {
    const tutte = conversazione(autopilota)
    const { messaggi, eventi } = separaConversazione(tutte)
    // Senza la Panoramica si vede il diario intero: le righe corte dei traguardi sarebbero un doppione.
    const battute = soloConversazione ? messaggi : tutte.filter((b) => b.tono !== 'traguardo')
    return { battute, eventi }
  }, [autopilota, soloConversazione])
  const [eventiAperti, setEventiAperti] = useState(false)
  const pensa = staPensando(autopilota)
  // Una sua domanda aperta non si risponde piu' da qui (0.38.0): sta nella
  // linguetta «Domande» qui sotto, una per volta. Qui gli si parla e basta.
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
      .then(() => onCambiato())
      .catch((e: unknown) => setErrore(String(e instanceof Error ? e.message : e)))
      .finally(() => setInCorso(false))
  }

  return (
    <section className={`chatap${campoPronto ? ' chatap--pronta' : ''}`} aria-label="Chat con l’autopilota">
      <RigaDalVivo autopilota={autopilota} senzaStato={soloConversazione} />
      {/* 0.84.3: il Punto in cima, con una riga per chat (prima «Adesso», 0.81.0) e il suo segnale. */}
      {/* Nella Panoramica le righe delle chat stanno nella sua sezione «Adesso», non due volte. */}
      <PuntoAutopilota autopilota={autopilota} senzaChat={soloConversazione} />
      <MessaggiVersoLaChat autopilota={autopilota} {...(onCambiato !== undefined ? { onCambiato } : {})} />
      {soloConversazione && eventi.length > 0 ? (
        <div className="chatap__eventi">
          <button className="pan2-riga-apri" aria-expanded={eventiAperti} onClick={() => setEventiAperti((v) => !v)}>
            {eventiAperti ? '▾' : '▸'} Cosa è successo · {eventi.length}
          </button>
          {eventiAperti ? (
            <div className="chatap__eventi-elenco">
              {eventi.slice(0, 50).map((b, i) => (
                <div key={`${b.quando}-${i}`} className="chatap__evento" title={b.dettaglio !== undefined ? `${b.testo} — ${b.dettaglio}` : b.testo}>
                  <span className="chatap__quando">{orario(b.quando)}</span>
                  <span className="chatap__evento-testo">{b.testo}{b.volte !== undefined ? ` ×${b.volte}` : ''}</span>
                </div>
              ))}
              {eventi.length > 50 ? <div className="chatap__evento">… e {eventi.length - 50} più vecchi</div> : null}
            </div>
          ) : null}
        </div>
      ) : null}
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
        {domanda || autopilota.stato === 'pronto' ? (
          <p className="chatap__pensa">● {autopilota.stato === 'pronto' ? 'aspetta il tuo via' : 'ti ha fatto una domanda'}: {soloConversazione ? 'è a destra, fra le domande.' : 'è nella linguetta «Domande» qui sotto, con il numero di quelle aperte.'}</p>
        ) : null}
        {!pensa && promessaSenzaLavoro(autopilota) ? (
          // 0.75.4: ha promesso di lavorare ma è fermo. Mai più una promessa muta.
          <p className="chatap__pensa chatap__fermo" role="status">
            ● L’autopilota è fermo ({autopilota.stato}).{' '}
            <button
              className="tasto tasto--primario tasto--mini"
              disabled={inCorso}
              onClick={() => esegui(() => window.gestore.autopilota.riprendi(autopilota.id))}
            >
              Riprendi
            </button>
          </p>
        ) : null}
        {autopilota.stato === 'intervista' && !domanda ? (
          <p className="chatap__pensa">● sta guardando il progetto per capire cosa serve: se ha un dubbio te lo chiede qui.</p>
        ) : null}
      </div>

      {errore !== undefined ? <div className="avviso">⚠ {errore}</div> : null}
      <CampoChatAutopilota
        autopilotaId={autopilota.id}
        onCambiato={onCambiato}
        campoPronto={campoPronto}
        disfaTitolo={ultimaModifica?.capito}
      />
    </section>
  )
}

/**
 * Il formato dell'ora, fatto una volta sola (0.85.1): `toLocaleTimeString`
 * ne costruisce uno nuovo a ogni chiamata, e con centinaia di righe era la
 * parte più lenta di ogni disegno della chat.
 */
const FORMATO_ORA = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' })

/** Solo l'ora: dentro una giornata di lavoro il giorno lo si sa. */
function orario(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : FORMATO_ORA.format(d)
}
