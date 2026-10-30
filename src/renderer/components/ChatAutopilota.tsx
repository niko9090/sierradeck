import { MessaggiVersoLaChat, RigaDalVivo } from './DalVivoAutopilota'
import { CodaWorkspace } from './CodaWorkspace'
import { TestaOrchestratore } from './TestaOrchestratore'
import { chiaveWorkspace } from '@shared/coda-richieste'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Autopilota } from '@shared/autopilota'
import { conversazione, haDomandaAperta, staPensando } from '@shared/chat-autopilota'
import { separaConversazione } from '@shared/panoramica'
import { CampoChatAutopilota } from './CampoChatAutopilota'
import { useAutopilotaIntero } from '../state/autopilota-intero'

/**
 * La chat con l'autopilota del workspace (30/10: uno solo per workspace,
 * sempre acceso). In testa l'avanzamento e gli specialisti
 * (`TestaOrchestratore`), poi la coda delle richieste (`CodaWorkspace`), poi
 * la conversazione con lui. Quello che scrivi arriva a lui; le sue domande
 * stanno nella colonna Domande.
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
  // Una sua domanda aperta non si risponde da qui: sta nella colonna Domande.
  const domanda = haDomandaAperta(autopilota)

  // In fondo, come ogni chat: l'ultima cosa detta è quella che si vuole vedere.
  // Si scorre quando cambia il numero delle righe, non a ogni rilettura, così
  // chi sta rileggendo l'inizio non viene riportato giù ogni cinque secondi.
  useEffect(() => {
    const el = flusso.current
    if (el !== null) el.scrollTop = el.scrollHeight
  }, [battute.length, pensa])

  return (
    <section className={`chatap${campoPronto ? ' chatap--pronta' : ''}`} aria-label="Chat con l’autopilota">
      <RigaDalVivo autopilota={autopilota} senzaStato={soloConversazione} />
      {/* In testa la percentuale del workspace, il perché quando scende, gli specialisti e le impostazioni. */}
      <TestaOrchestratore workspace={chiaveWorkspace(autopilota)} />
      {/* La coda delle richieste del suo workspace, chiusa: si legge solo aperta. */}
      <CodaWorkspace workspace={chiaveWorkspace(autopilota)} />
      <MessaggiVersoLaChat autopilota={autopilota} />
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
              </div>
            )}
          </div>
        ))}
        {pensa ? (
          <p className="chatap__pensa">● sta pensando alla risposta… di solito entro qualche minuto. Puoi scrivergli altro: risponde in ordine.</p>
        ) : null}
        {domanda ? (
          <p className="chatap__pensa">● ti ha fatto una domanda: è nella colonna Domande.</p>
        ) : null}
      </div>

      <CampoChatAutopilota
        autopilotaId={autopilota.id}
        onCambiato={onCambiato}
        campoPronto={campoPronto}
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
