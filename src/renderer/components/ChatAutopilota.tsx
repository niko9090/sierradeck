import { MessaggiVersoLaChat, RigaDalVivo } from './DalVivoAutopilota'
import { CodaWorkspace } from './CodaWorkspace'
import { MenuSpecialisti } from './MenuSpecialisti'
import { TestaOrchestratore } from './TestaOrchestratore'
import { chiaveWorkspace } from '@shared/coda-richieste'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Autopilota } from '@shared/autopilota'
import { conversazione, haDomandaAperta, staPensando } from '@shared/chat-autopilota'
import { separaConversazione } from '@shared/panoramica'
import { CampoChatAutopilota } from './CampoChatAutopilota'
import { useAutopilotaIntero } from '../state/autopilota-intero'
import { useSorgente } from '../sorgente-autopilota'
import { VoceAutopilota, type RichiestaRiassunto } from './VoceAutopilota'
import type { ComandoVocale } from '@shared/voce-autopilota'

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
  const sorgente = useSorgente()
  // Dal PC remoto l'autopilota arriva già intero (`/api/autopilota`); quello di qui si completa qui.
  const intero = useAutopilotaIntero(sorgente.remoto === undefined ? dellElenco : undefined)
  const autopilota = intero ?? dellElenco
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
  // 13/11: «riassunto» detto nel campo con la conversazione a voce: lo scrive e lo legge.
  const [richiesta, setRichiesta] = useState<RichiestaRiassunto | undefined>(undefined)
  const pensa = staPensando(autopilota)
  const chiediRiassunto = (c: ComandoVocale): void => { if (c === 'riassunto' || c === 'generale') setRichiesta((p) => ({ tipo: c === 'generale' ? 'generale' : 'da-ultimo', n: (p?.n ?? 0) + 1, leggi: true })) }
  // Parlato (13/11): quello che dici va con la sorgente, come il campo; poi si rilegge la chat.
  const inviaParlato = (testo: string): Promise<unknown> => sorgente.dialoga(autopilota.id, testo).then((r) => { onCambiato(); return r })
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
      {/* k-54: gli specialisti di tutti i workspace in un menu, con percentuale, cosa fanno e la precedenza. */}
      <div className="chatap__testa">
        <VoceAutopilota autopilota={autopilota} workspace={chiaveWorkspace(autopilota)} battute={battute} invia={inviaParlato} suComando={chiediRiassunto} {...(richiesta !== undefined ? { richiesta } : {})} />
        <MenuSpecialisti riferimenti={[chiaveWorkspace(autopilota), autopilota.cwd, autopilota.workspace ?? '']} />
      </div>
      {/* 0.95.3: in testa solo barra, percentuale e cosa succede; il resto nella tendina ▾. */}
      <TestaOrchestratore workspace={chiaveWorkspace(autopilota)}>
        <RigaDalVivo autopilota={autopilota} senzaStato={soloConversazione} />
        {/* La coda delle richieste del suo workspace, chiusa: si legge solo aperta. */}
        <CodaWorkspace workspace={chiaveWorkspace(autopilota)} />
        <MessaggiVersoLaChat autopilota={autopilota} />
      </TestaOrchestratore>
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
      <FlussoChat battute={battute} nome={autopilota.nome} pensa={pensa} domanda={domanda} onCambiato={onCambiato} flusso={flusso} rispondi={sorgente.rispondi} />

      <CampoChatAutopilota
        autopilotaId={sorgente.remoto !== undefined ? `${sorgente.remoto.pcId}:${autopilota.id}` : autopilota.id}
        onCambiato={onCambiato}
        campoPronto={campoPronto}
        suComando={chiediRiassunto}
        {...(sorgente.remoto !== undefined ? { invia: (testo: string) => sorgente.dialoga(autopilota.id, testo) } : {})}
      />
    </section>
  )
}

/**
 * Le battute della conversazione, con i tasti delle sue domande: le stesse per
 * l'autopilota di qui e per quello di un altro PC (k-60).
 */
export function FlussoChat({ battute, nome, pensa, domanda, onCambiato, flusso, rispondi, doveLeDomande = 'è nella colonna Domande' }: {
  battute: ReturnType<typeof conversazione>
  nome: string
  pensa: boolean
  domanda: boolean
  onCambiato: () => void
  flusso: React.RefObject<HTMLDivElement | null>
  /** Come si risponde a una sua domanda; senza, dal programma di qui. */
  rispondi?: (idDomanda: string, risposta: string) => Promise<unknown>
  doveLeDomande?: string
}): React.JSX.Element {
  return (
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
                {b.da === 'tu' ? 'tu' : nome.trim() !== '' ? nome : 'lui'} · {orario(b.quando)}
              </span>
              <span className="chatap__testo">{b.testo}</span>
              {b.domanda !== undefined ? <ScelteInChat idDomanda={b.domanda.id} scelte={b.domanda.scelte} onCambiato={onCambiato} {...(rispondi !== undefined ? { rispondi } : {})} /> : null}
              {b.dettaglio !== undefined ? <span className="chatap__esito">{b.dettaglio}</span> : null}
            </div>
          )}
        </div>
      ))}
      {pensa ? (
        <p className="chatap__pensa">● sta pensando alla risposta… di solito entro qualche minuto. Puoi scrivergli altro: risponde in ordine.</p>
      ) : null}
      {domanda ? (
        <p className="chatap__pensa">● ti ha fatto una domanda: {doveLeDomande}.</p>
      ) : null}
    </div>
  )
}

/**
 * I tasti di una sua domanda nata in chat (0.96.0): toccarne uno è rispondere,
 * come dalle Domande. Spariscono quando la domanda ha risposta o è ritirata.
 */
function ScelteInChat({ idDomanda, scelte, onCambiato, rispondi }: { idDomanda: string; scelte: string[]; onCambiato: () => void; rispondi?: (idDomanda: string, risposta: string) => Promise<unknown> }): React.JSX.Element {
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const tocca = (scelta: string): void => {
    setInCorso(true)
    setErrore(undefined)
    ;(rispondi ?? window.gestore.autopilota.rispondi)(idDomanda, scelta)
      .then(() => onCambiato())
      .catch((e: unknown) => setErrore(e instanceof Error ? e.message : String(e)))
      .finally(() => setInCorso(false))
  }
  return (
    <span className="chatap__scelte">
      {scelte.map((s, i) => (
        <button key={s} className={`tasto${i === 0 ? ' tasto--primario' : ''}`} disabled={inCorso} onClick={() => tocca(s)}>{s}</button>
      ))}
      {errore !== undefined ? <span className="chatap__esito" role="alert">{errore}</span> : null}
    </span>
  )
}

/**
 * Il formato dell'ora, fatto una volta sola (0.85.1): `toLocaleTimeString`
 * ne costruisce uno nuovo a ogni chiamata, e con centinaia di righe era la
 * parte più lenta di ogni disegno della chat.
 */
const FORMATO_ORA = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' })

/** Solo l'ora: dentro una giornata di lavoro il giorno lo si sa. */
export function orario(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : FORMATO_ORA.format(d)
}
