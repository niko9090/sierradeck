import { useCallback, useEffect, useRef, useState } from 'react'
import type { Autopilota } from '@shared/autopilota'
import { domandaArrivata } from '@shared/domande-autopilota'
import type { LinguettaStaccabile } from '@shared/finestra-pannello'
import { LinguettaAutopilota, useDomandeAutopilota } from './LinguettaAutopilota'

const NOMI: Record<LinguettaStaccabile, string> = {
  domande: 'Domande', lavoro: 'Sta facendo', file: 'File', obiettivo: 'Obiettivo', criteri: 'Criteri', compiti: 'Compiti', diario: 'Ha deciso'
}

/**
 * Una linguetta della scheda dell'autopilota **in una finestra vera** (0.38.0),
 * da tenere anche su un altro schermo. Mostra la stessa cosa della linguetta
 * (`LinguettaAutopilota`) con gli stessi dati, riletti allo stesso modo. Non e'
 * una finestra di chat: niente mosaico, niente terminali. «Rimetti al suo
 * posto» la chiude e la linguetta torna nella barra.
 *
 * La linguetta «Domande» staccata tiene il numerino nel titolo della finestra
 * e, quando arriva una domanda nuova, la finestra lampeggia nella barra del
 * sistema.
 */
export function FinestraPannello({ autopilotaId, linguetta }: { autopilotaId: string; linguetta: LinguettaStaccabile }): React.JSX.Element {
  const [autopilota, setAutopilota] = useState<Autopilota | undefined>(undefined)
  const [manca, setManca] = useState(false)
  const leggi = useCallback((): void => {
    window.gestore.autopilota.elenca()
      .then((tutti) => {
        const a = tutti.find((x) => x.id === autopilotaId)
        setAutopilota(a)
        setManca(a === undefined)
      })
      .catch(() => undefined)
  }, [autopilotaId])
  useEffect(() => {
    leggi()
    const h = setInterval(leggi, 2000)
    return () => clearInterval(h)
  }, [leggi])
  const { schede, rileggi } = useDomandeAutopilota(autopilota)

  // Il titolo della finestra: di chi, quale linguetta, e il numerino delle domande.
  const conto = linguetta === 'domande' && schede.length > 0 ? ` (${schede.length})` : ''
  useEffect(() => {
    document.title = `${autopilota?.nome ?? 'Autopilota'} · ${NOMI[linguetta]}${conto} — SierraDeck`
  }, [autopilota?.nome, linguetta, conto])
  // Una domanda nuova: la finestra chiede attenzione.
  const viste = useRef<string[] | undefined>(undefined)
  useEffect(() => {
    if (linguetta !== 'domande') return
    if (viste.current !== undefined && domandaArrivata(viste.current, schede)) void window.gestore.pannello.richiama().catch(() => undefined)
    viste.current = schede.map((d) => d.chiave)
  }, [schede.map((d) => d.chiave).join('|')])

  const rimetti = (): void => { void window.gestore.pannello.rimetti(autopilotaId, linguetta).catch(() => window.close()) }

  return (
    <div className="finestra-pannello">
      <div className="finestra-pannello__testa">
        <span className="serigrafia">{autopilota?.nome ?? 'Autopilota'}</span>
        <span className={`finestra-pannello__nome${conto !== '' ? ' finestra-pannello__nome--chiama' : ''}`}>{NOMI[linguetta]}{conto}</span>
        <span style={{ flex: 1 }} />
        <button
          className="tasto"
          onClick={rimetti}
          title="Chiude questa finestra e rimette la linguetta nella scheda dell’autopilota, accanto alla sua chat. Anche chiudere la finestra la rimette"
        >
          Rimetti al suo posto
        </button>
      </div>
      <div className="finestra-pannello__corpo">
        {manca ? (
          <p className="diario__vuoto">Questo autopilota non c’è più: puoi chiudere la finestra.</p>
        ) : autopilota === undefined ? (
          <p className="diario__vuoto">Leggo l’autopilota…</p>
        ) : linguetta === 'domande' && schede.length === 0 ? (
          <p className="diario__vuoto">Nessuna domanda aperta. Quando te ne fa una compare qui, il numero va nel titolo della finestra e la finestra lampeggia nella barra.</p>
        ) : (
          <LinguettaAutopilota autopilota={autopilota} linguetta={linguetta} schede={schede} onRisposto={() => { rileggi(); leggi() }} onCambiato={leggi} />
        )}
      </div>
    </div>
  )
}
