import { useCallback, useEffect, useState } from 'react'
import type { Anteprima } from '../../main/anteprima'
import type { Autopilota } from '@shared/autopilota'
import { completamento, diario } from '../diario-autopilota'
import { ledDi } from '../autopilota-vista'

function ora(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

/**
 * La colonna che mostra cosa sta pensando l'autopilota di questa chat.
 *
 * Il terminale dice *cosa scrive* la chat; qui c'è l'altra metà: quanto manca
 * all'obiettivo secondo i criteri che l'autopilota si è dato, e cosa ha deciso
 * a ogni intervento. Sono i due dati che finora esistevano solo dentro il
 * servizio, e per vederli bisognava aprire un pannello sopra il mosaico —
 * cioè smettere di guardare la chat.
 *
 * Si chiude: quando si sta leggendo il terminale, duecento pixel in meno di
 * larghezza si sentono.
 */
export function DiarioAutopilota({
  autopilota,
  largo,
  onLargo
}: {
  autopilota: Autopilota
  /** A tutta larghezza del riquadro: il terminale si fa da parte. */
  largo: boolean
  onLargo: (v: boolean) => void
}): React.JSX.Element {
  const [aperto, setAperto] = useState(true)
  // Cosa sta scrivendo la sua chat, adesso. Quella chat gira in un processo
  // staccato e non ha un terminale da guardare: senza questo, dell'autopilota
  // si vedono solo le decisioni — cioè qualcosa ogni parecchi minuti, mentre
  // lui lavora di continuo.
  const [conversazione, setConversazione] = useState<Anteprima | undefined>(undefined)
  const [vista, setVista] = useState<'lavoro' | 'diario'>('lavoro')

  const sessioni = [
    ...autopilota.chats.filter((ch) => ch.sessionId !== undefined).map((ch) => ch.sessionId!),
    ...(autopilota.sessionId !== undefined ? [autopilota.sessionId] : [])
  ]
  const sessione = sessioni[0]

  const aggiorna = useCallback((): void => {
    if (sessione === undefined) return
    window.gestore.sessions
      .anteprima(autopilota.cwd, sessione)
      .then(setConversazione)
      .catch(() => undefined)
  }, [autopilota.cwd, sessione])

  useEffect(() => {
    aggiorna()
    // Due secondi: abbastanza spesso da vedere il lavoro procedere, abbastanza
    // di rado da non rileggere mezzo megabyte per niente.
    const h = setInterval(aggiorna, 2000)
    return () => clearInterval(h)
  }, [aggiorna])

  const c = completamento(autopilota)
  const voci = diario(autopilota)
  const led = ledDi(autopilota)

  if (!aperto) {
    return (
      <button
        className="diario__linguetta"
        onClick={() => setAperto(true)}
        title={`${autopilota.nome}: ${c.percento}% — riapre il diario dell’autopilota`}
      >
        <span className={`led ${led.classe}`} />
        <span className="diario__linguetta-testo">{c.percento}%</span>
      </button>
    )
  }

  return (
    <aside className={largo ? 'diario diario--largo' : 'diario'}>
      <div className="diario__testa">
        <span className={`led ${led.classe}`} title={led.titolo} />
        <span className="serigrafia diario__nome">{autopilota.nome}</span>
        {/* A tutta larghezza si leggono i passaggi come in una chat; stretto,
            resta di fianco al terminale. */}
        <button
          className="comando-riquadro"
          onClick={() => onLargo(!largo)}
          title={largo ? 'Torna a fianco del terminale' : 'Mostra la conversazione a tutta larghezza'}
          aria-label={largo ? 'Restringi' : 'Allarga'}
        >
          {largo ? '⇥' : '⇤'}
        </button>
        <button
          className="comando-riquadro"
          onClick={() => { onLargo(false); setAperto(false) }}
          title="Chiude il diario e restituisce spazio al terminale"
          aria-label="Chiudi il diario"
        >
          ›
        </button>
      </div>

      {/* La percentuale non è una stima: sono i criteri di fine che
          l'autopilota verifica a ogni intervento. */}
      <div className="diario__misura">
        <span className="diario__percento">{c.percento}%</span>
        {/* Senza criteri la percentuale non misura niente, e il motivo cambia:
            in preparazione non ci sono ancora, altrove non ci sono più. */}
        <span className="misura">
          {c.totali > 0
            ? `${c.fatti} di ${c.totali} criteri`
            : autopilota.stato === 'intervista'
              ? 'si sta preparando'
              : 'nessun criterio'}
        </span>
      </div>
      <div className="diario__barra">
        <span className="diario__riempimento" style={{ width: `${c.percento}%` }} />
      </div>

      {c.totali > 0 ? (
        <ul className="diario__criteri">
          {autopilota.criteri.map((cr, i) => (
            <li key={i} className={cr.soddisfatto ? 'diario__criterio diario__criterio--fatto' : 'diario__criterio'}>
              <span aria-hidden="true">{cr.soddisfatto ? '✓' : '·'}</span>
              <span>{cr.descrizione}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Due viste: cosa sta scrivendo adesso, e cosa ha deciso finora. La
          prima è quella che si guarda mentre lavora, la seconda quando si torna
          a vedere com'è andata. */}
      <div className="diario__schede">
        <button
          className={vista === 'lavoro' ? 'diario__scheda diario__scheda--attiva' : 'diario__scheda'}
          onClick={() => setVista('lavoro')}
        >
          Sta facendo
        </button>
        <button
          className={vista === 'diario' ? 'diario__scheda diario__scheda--attiva' : 'diario__scheda'}
          onClick={() => setVista('diario')}
        >
          Ha deciso
        </button>
      </div>

      {vista === 'lavoro' ? (
        <div className="diario__voci">
          {sessione === undefined ? (
            <p className="diario__vuoto">La chat non è ancora partita.</p>
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
      ) : (
      <div className="diario__voci">
        {voci.length === 0 ? (
          <p className="diario__vuoto">
            {autopilota.stato === 'intervista'
              ? 'Sta guardando il progetto per capire cosa serve.'
              : 'Ancora niente: il primo intervento arriva quando la chat si ferma.'}
          </p>
        ) : (
          voci.map((v, i) => (
            <div key={`${v.quando}-${i}`} className="diario__voce">
              <span className="misura diario__quando">{ora(v.quando)}</span>
              <div>
                <div className="diario__titolo">{v.titolo}</div>
                {v.dettaglio !== undefined ? <div className="diario__dettaglio">{v.dettaglio}</div> : null}
              </div>
            </div>
          ))
        )}
      </div>
      )}
    </aside>
  )
}
