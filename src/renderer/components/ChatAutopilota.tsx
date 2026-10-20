import { AdessoAutopilota, MessaggiVersoLaChat, RigaDalVivo } from './DalVivoAutopilota'
import { useEffect, useRef, useState } from 'react'
import type { Autopilota } from '@shared/autopilota'
import { conversazione, haDomandaAperta, staPensando } from '@shared/chat-autopilota'
import { separaConversazione } from '@shared/panoramica'
import { promessaSenzaLavoro } from '@shared/promessa-autopilota'
import { Aiuto } from './Aiuto'
import { TastoMicrofono } from './TastoMicrofono'

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
  const [messaggio, setMessaggio] = useState('')
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const flusso = useRef<HTMLDivElement | null>(null)
  // Il campo, per il microfono (0.75.0): la dettatura scrive dove c'è il fuoco.
  const campo = useRef<HTMLTextAreaElement | null>(null)

  const tutte = conversazione(autopilota)
  const { messaggi, eventi } = separaConversazione(tutte)
  // Senza la Panoramica si vede il diario intero: le righe corte dei traguardi sarebbero un doppione.
  const battute = soloConversazione ? messaggi : tutte.filter((b) => b.tono !== 'traguardo')
  const [eventiAperti, setEventiAperti] = useState(false)
  const pensa = staPensando(autopilota)
  // Una sua domanda aperta non si risponde piu' da qui (0.38.0): sta nella
  // linguetta «Domande» qui sotto, una per volta. Qui gli si parla e basta.
  const domanda = haDomandaAperta(autopilota)
  const ultimaModifica = autopilota.modifiche[autopilota.modifiche.length - 1]

  useEffect(() => {
    if (!campoPronto) return
    const attivo = document.activeElement
    if (attivo === null || attivo === document.body) campo.current?.focus()
  }, [campoPronto])

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
    esegui(() => window.gestore.autopilota.dialoga(autopilota.id, testo))
  }

  return (
    <section className={`chatap${campoPronto ? ' chatap--pronta' : ''}`} aria-label="Chat con l’autopilota">
      <RigaDalVivo autopilota={autopilota} />
      {/* 0.81.0 (Nicholas, 20/10): una riga per chat, anche quelle ferme o mai partite. */}
      {/* Nella Panoramica le righe stanno nella sua sezione «Adesso», non due volte. */}
      {soloConversazione ? null : <AdessoAutopilota autopilota={autopilota} />}
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

      <div className="chatap__scrivi">
        <textarea
          ref={campo}
          className="campo chatap__campo"
          rows={3}
          style={{ resize: 'vertical' }}
          value={messaggio}
          // 0.81.0: corto, perché nella colonna stretta la parte fra parentesi veniva tagliata;
          // dove stanno le sue domande lo dice il «?» qui sotto.
          placeholder="scrivigli: una domanda, un vincolo, un compito in più, «fermati», «riprendi»…"
          aria-label="scrivi all autopilota"
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
            {inCorso ? 'Mando…' : 'Manda'}
          </button>
          <TastoMicrofono campo={campo} />
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
          <Aiuto di="come parlare all’autopilota">Qui parli con l’autopilota, non con la chat che esegue. Lui risponde con parole sue, con davanti obiettivo, criteri, diario e l’ultima cosa scritta dalla chat. Se quello che scrivi è un’istruzione la applica: cambia obiettivo o criteri, aggiunge un compito, si ferma («fermati»), riparte («riprendi»). Se serve che la chat lo sappia, glielo consegna alla fine del turno che ha in mano, mai in mezzo a un’azione, oppure appena riparte se è fermo. La risposta arriva di solito entro qualche minuto. Le sue domande non stanno qui: stanno nella linguetta «Domande» qui sotto, una per volta, e dopo la risposta domanda e risposta compaiono in questa chat. «Disfa» rimette com’era prima dell’ultimo cambio. Non parte nessun lavoro nuovo e non si chiude nessuna chat senza che tu lo chieda.</Aiuto>
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
