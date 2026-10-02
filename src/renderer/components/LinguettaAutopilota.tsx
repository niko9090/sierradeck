import { useCallback, useEffect, useState } from 'react'
import type { Anteprima } from '../../main/anteprima'
import type { Autopilota } from '@shared/autopilota'
import { diario } from '../diario-autopilota'
import { domandeScheda, type DomandaApertaServizio, type DomandaScheda } from '@shared/domande-autopilota'
import type { LinguettaStaccabile } from '@shared/finestra-pannello'
import { DomandeAutopilota } from './DomandeAutopilota'
import { FileAutopilota } from './FileAutopilota'
import { IstruzioniAutopilota } from './IstruzioniAutopilota'
import {
  CompitiAutopilota, CriteriAutopilota, ObiettivoAutopilota, RagionamentiAutopilota
} from './SchedaAutopilota'

/**
 * Il contenuto delle linguette della scheda dell'autopilota (0.38.0), uguale
 * nella scheda accanto alla chat e in una **finestra pannello** staccata su un
 * altro schermo: un componente solo, cosi' le due non divergono.
 */

function ora(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

/** Le sue domande aperte, rilette ogni due secondi dal servizio. */
export function useDomandeAutopilota(autopilota: Autopilota | undefined): { schede: DomandaScheda[]; rileggi: () => void } {
  const [aperte, setAperte] = useState<DomandaApertaServizio[]>([])
  const rileggi = useCallback((): void => {
    window.gestore.autopilota.domande().then(setAperte).catch(() => undefined)
  }, [])
  useEffect(() => {
    rileggi()
    const h = setInterval(rileggi, 2000)
    return () => clearInterval(h)
  }, [rileggi])
  return { schede: autopilota === undefined ? [] : domandeScheda(autopilota, aperte), rileggi }
}

/** «Sta facendo»: cosa scrive adesso la chat che esegue (con la flotta, quale). */
function LavoroAutopilota({ autopilota }: { autopilota: Autopilota }): React.JSX.Element {
  // Cosa sta scrivendo la sua chat, adesso. Quella chat gira in un processo
  // staccato e non ha un terminale da guardare: senza questo, dell'autopilota
  // si vedono solo le decisioni — cioè qualcosa ogni parecchi minuti, mentre
  // lui lavora di continuo.
  const [conversazione, setConversazione] = useState<Anteprima | undefined>(undefined)
  /** Con la flotta: quale chat si guarda in «Sta facendo». */
  const [chatScelta, setChatScelta] = useState<string | undefined>(undefined)
  const sessioni = [
    ...autopilota.chats.filter((ch) => ch.sessionId !== undefined).map((ch) => ch.sessionId!),
    ...(autopilota.sessionId !== undefined ? [autopilota.sessionId] : [])
  ]
  // Mentre si prepara la conversazione è quella dell'intervista: dura minuti in
  // cui legge il progetto, e senza questa riga il pannello diceva soltanto «la
  // chat non è ancora partita» — che è vero e non serve a niente.
  const sessione = autopilota.stato === 'intervista' && autopilota.sessioneIntervista !== undefined
    ? autopilota.sessioneIntervista
    : chatScelta !== undefined && sessioni.includes(chatScelta) ? chatScelta : sessioni[0]

  const aggiorna = useCallback((): void => {
    if (sessione === undefined) return
    window.gestore.sessions
      .anteprima(autopilota.cwd, sessione)
      .then(setConversazione)
      .catch(() => undefined)
  }, [autopilota.cwd, sessione])

  useEffect(() => {
    // Si legge solo quando si guarda: questo componente c'e' solo con la
    // linguetta aperta (la trascrizione e' mezzo megabyte).
    aggiorna()
    // Due secondi: abbastanza spesso da vedere il lavoro procedere, abbastanza
    // di rado da non rileggere mezzo megabyte per niente.
    const h = setInterval(aggiorna, 2000)
    return () => clearInterval(h)
  }, [aggiorna])

  return (
    <div className="diario__voci">
      {/* Con la flotta si sceglie quale chat guardare: una riga di
          bottoni, «chat 1», «chat 2», con lo stato di ognuna. */}
      {autopilota.chats.length > 1 ? (
        <div className="diario__quali-chat" role="tablist" aria-label="Quale chat guardare">
          {autopilota.chats.map((ch, i) => (
            <button
              key={ch.id}
              role="tab"
              aria-selected={sessione === ch.sessionId}
              className={sessione === ch.sessionId ? 'diario__quale-chat diario__quale-chat--attiva' : 'diario__quale-chat'}
              disabled={ch.sessionId === undefined}
              title={`${ch.compito} — ${ch.stato}`}
              onClick={() => setChatScelta(ch.sessionId)}
            >
              <span className={`led ${ch.stato === 'lavoro' ? 'led--lavoro' : ch.stato === 'bloccata' ? 'led--attesa' : 'led--finito'}`} />
              chat {i + 1}{ch.stato === 'pausa' ? ' · in pausa' : ''}{ch.ramo !== undefined ? ` · ${ch.ramo}` : ''}
            </button>
          ))}
        </div>
      ) : null}
      {sessione === undefined ? (
        <p className="diario__vuoto">
          {autopilota.stato === 'pronto'
            ? 'La chat nasce quando dai il via, nella chat qui sopra.'
            : 'La chat non è ancora partita.'}
        </p>
      ) : conversazione === undefined ? (
        <p className="diario__vuoto">Leggo la conversazione…</p>
      ) : conversazione.scambi.length === 0 && conversazione.azioni.length === 0 ? (
        <p className="diario__vuoto">
          {conversazione.errore ?? 'La chat è partita e sta pensando: fra poco si vedrà qualcosa.'}
        </p>
      ) : (
        <>
          {conversazione.scambi.map((s, i) => (
            <div key={i} className={`anteprima__riga anteprima__riga--${s.ruolo}`}>
              <span className="anteprima__chi">{s.ruolo === 'utente' ? 'compito' : 'claude'}</span>
              <span>{s.testo}</span>
            </div>
          ))}
          {conversazione.azioni.length > 0 ? (
            <div className="anteprima__azioni">
              <span className="serigrafia">sta usando</span>
              {conversazione.azioni.map((a, i) => (
                <div key={i} className="misura anteprima__azione">{a}</div>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

/** «Ha deciso»: i suoi ragionamenti e tutte le decisioni, dalla più recente. */
function DecisioniAutopilota({ autopilota }: { autopilota: Autopilota }): React.JSX.Element {
  const voci = diario(autopilota)
  return (
    <div className="diario__voci">
      <RagionamentiAutopilota autopilota={autopilota} />
      {voci.length === 0 ? (
        <p className="diario__vuoto">
          {autopilota.stato === 'intervista'
            ? 'Sta guardando il progetto per capire cosa serve.'
            : 'Ancora niente: il primo intervento arriva quando la chat si ferma.'}
        </p>
      ) : (
        voci.map((v, i) => (
          <div key={`${v.quando}-${i}`} className={`diario__voce diario__voce--${v.tipo ?? 'altro'}`}>
            <span className="misura diario__quando">{ora(v.quando)}</span>
            <div>
              <div className="diario__titolo">
                {v.titolo}
                {/* Le riprese identiche sono compresse: il numero dice quante
                    volte senza riempire l'elenco di righe uguali. */}
                {v.volte !== undefined ? <span className="diario__volte">×{v.volte}</span> : null}
              </div>
              {v.dettaglio !== undefined ? <div className="diario__dettaglio">{v.dettaglio}</div> : null}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

export function LinguettaAutopilota({
  autopilota,
  linguetta,
  schede,
  onRisposto,
  onCambiato
}: {
  autopilota: Autopilota
  linguetta: LinguettaStaccabile
  schede: DomandaScheda[]
  onRisposto: () => void
  onCambiato: () => void
}): React.JSX.Element {
  switch (linguetta) {
    case 'domande':
      return <DomandeAutopilota autopilota={autopilota} domande={schede} onRisposto={onRisposto} />
    case 'istruzioni':
      return <IstruzioniAutopilota autopilota={autopilota} onCambiato={onCambiato} />
    case 'file':
      return <FileAutopilota autopilota={autopilota} />
    case 'obiettivo':
      return <ObiettivoAutopilota autopilota={autopilota} />
    case 'criteri':
      return <CriteriAutopilota autopilota={autopilota} onCambiato={onCambiato} />
    case 'compiti':
      return <CompitiAutopilota autopilota={autopilota} onCambiato={onCambiato} />
    case 'diario':
      return <DecisioniAutopilota autopilota={autopilota} />
    case 'lavoro':
    default:
      return <LavoroAutopilota autopilota={autopilota} />
  }
}
