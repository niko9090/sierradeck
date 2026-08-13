import { useCallback, useEffect, useRef, useState } from 'react'
import type { Anteprima } from '../../main/anteprima'
import type { Autopilota } from '@shared/autopilota'
import { LARGHEZZA_DIARIO } from '@shared/preferenze'
import { completamento, diario } from '../diario-autopilota'
import { ledDi, passaggi } from '../autopilota-vista'

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
  const [risposta, setRisposta] = useState('')
  const [inviando, setInviando] = useState(false)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const colonna = useRef<HTMLElement | null>(null)

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
  const percorso = passaggi(autopilota)
  const qui = percorso.find((p) => p.stato !== 'fatto' && p.stato !== 'davanti')

  // La domanda si risponde anche mentre si prepara: è lì che l'autopilota
  // chiede quasi sempre, e prima bisognava andarla a cercare nel pannello
  // sopra il mosaico — cioè smettere di guardare quello che si stava guardando.
  const chiede = autopilota.stato === 'attesa' ||
    (autopilota.stato === 'intervista' && autopilota.motivoSospensione !== undefined)

  /**
   * La maniglia sul bordo: trascina la larghezza del pannello.
   *
   * Il numero è la stessa preferenza del cursore nelle impostazioni — che
   * finora non muoveva niente — così le due strade non si contraddicono. Il
   * riscontro è immediato sul token, il salvataggio arriva al rilascio: salvare
   * a ogni pixel scriverebbe il file cento volte per un gesto solo.
   */
  const trascinaLargh = (e: React.PointerEvent<HTMLDivElement>): void => {
    const riquadro = colonna.current?.parentElement
    if (riquadro == null) return
    e.preventDefault()
    const zona = riquadro.getBoundingClientRect()
    const bersaglio = e.currentTarget
    bersaglio.setPointerCapture(e.pointerId)
    let ultima: number = LARGHEZZA_DIARIO.min

    const misura = (x: number): number => {
      const percento = Math.round(((zona.right - x) / zona.width) * 100)
      return Math.min(LARGHEZZA_DIARIO.max, Math.max(LARGHEZZA_DIARIO.min, percento))
    }
    const muovi = (ev: PointerEvent): void => {
      ultima = misura(ev.clientX)
      document.documentElement.style.setProperty('--diario-largh', `${ultima}%`)
    }
    const molla = (): void => {
      bersaglio.removeEventListener('pointermove', muovi)
      bersaglio.removeEventListener('pointerup', molla)
      bersaglio.removeEventListener('pointercancel', molla)
      salvaLargh(ultima)
    }
    ultima = misura(e.clientX)
    bersaglio.addEventListener('pointermove', muovi)
    bersaglio.addEventListener('pointerup', molla)
    bersaglio.addEventListener('pointercancel', molla)
  }

  const salvaLargh = (percento: number): void => {
    document.documentElement.style.setProperty('--diario-largh', `${percento}%`)
    window.gestore.preferenze
      .leggi()
      .then((p) => window.gestore.preferenze.imposta({ ...p, larghezzaAutopilota: percento }))
      .catch(() => undefined)
  }

  /** Le frecce muovono la maniglia: un bordo trascinabile solo col mouse è mezzo comando. */
  const tastiLargh = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const passo = e.key === 'ArrowLeft' ? 2 : e.key === 'ArrowRight' ? -2 : 0
    if (passo === 0) return
    e.preventDefault()
    const attuale = Number.parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--diario-largh'),
      10
    )
    const partenza = Number.isNaN(attuale) ? 34 : attuale
    salvaLargh(Math.min(LARGHEZZA_DIARIO.max, Math.max(LARGHEZZA_DIARIO.min, partenza + passo)))
  }

  if (!aperto) {
    return (
      <button
        className="diario__linguetta"
        onClick={() => setAperto(true)}
        title={`${autopilota.nome}: ${qui?.nota ?? led.titolo} — riapre il diario dell’autopilota`}
      >
        <span className={`led ${led.classe}`} />
        {/* Senza criteri non c'è percentuale da dare: al suo posto il passo, che
            a pannello chiuso è l'unica cosa che si riesce comunque a leggere. */}
        <span className="diario__linguetta-testo">
          {c.totali > 0 ? `${c.percento}%` : qui?.nome ?? '—'}
        </span>
      </button>
    )
  }

  return (
    <aside className={largo ? 'diario diario--largo' : 'diario'} ref={colonna}>
      {/* Il solco fra terminale e diario è anche il comando che li divide: si
          afferra dove già si guarda, senza andare nelle impostazioni. */}
      {largo ? null : (
        <div
          className="diario__maniglia"
          onPointerDown={trascinaLargh}
          onKeyDown={tastiLargh}
          onDoubleClick={() => salvaLargh(34)}
          role="separator"
          aria-orientation="vertical"
          aria-label="Quanto spazio prende il diario"
          tabIndex={0}
          title="Trascina per cambiare la larghezza · doppio clic per rimetterla com’era"
        />
      )}
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

      {/* Il percorso intero, non solo il punto in cui si trova: sei stati
          raccontati da una percentuale e una riga erano due. Qui si vede se
          «fermo» è successo prima o dopo che si mettesse al lavoro — che è la
          differenza fra rispondergli e andare a vedere la chat. */}
      <ol className="passi" aria-label="A che punto è">
        {percorso.map((p) => (
          <li key={p.nome} className={`passo passo--${p.stato}`}>
            <span className="passo__led" aria-hidden="true" />
            <span className="passo__nome">{p.nome}</span>
          </li>
        ))}
      </ol>
      {qui?.nota !== undefined ? <p className="passi__nota">{qui.nota}</p> : null}

      {/* La percentuale non è una stima: sono i criteri di fine che
          l'autopilota verifica a ogni intervento. Senza criteri non misura
          niente — e un «0%» dove i passi dicono già «Prepara» è solo un numero
          che spaventa. */}
      {c.totali > 0 ? (
        <>
          <div className="diario__misura">
            <span className="diario__percento">{c.percento}%</span>
            <span className="misura">{c.fatti} di {c.totali} criteri</span>
          </div>
          <div className="diario__barra">
            <span className="diario__riempimento" style={{ width: `${c.percento}%` }} />
          </div>
        </>
      ) : null}

      {/* La domanda si risponde **qui**, dove si sta già guardando: prima
          bisognava aprire il pannello degli autopiloti e cercarla, mentre la
          chat restava ferma ad aspettare. */}
      {chiede ? (
        <div className="diario__domanda">
          <div className="diario__domanda-testo">
            {autopilota.motivoSospensione ?? 'Ha bisogno di una tua risposta.'}
          </div>
          <textarea
            className="diario__risposta"
            rows={2}
            value={risposta}
            onChange={(e) => setRisposta(e.target.value)}
            placeholder="la tua risposta"
            aria-label="rispondi all autopilota"
          />
          <button
            className="tasto tasto--primario"
            disabled={risposta.trim() === '' || inviando}
            onClick={() => {
              setInviando(true)
              window.gestore.autopilota
                .domande()
                .then((aperte) => {
                  const mia = aperte.find((d) => d.autopilotaId === autopilota.id)
                  if (mia === undefined) throw new Error('la domanda non è più aperta')
                  return window.gestore.autopilota.rispondi(mia.id, risposta.trim())
                })
                .then(() => setRisposta(''))
                .catch((e: unknown) => setErrore(String(e)))
                .finally(() => setInviando(false))
            }}
          >
            {inviando ? 'Mando…' : 'Rispondi'}
          </button>
          {errore !== undefined ? <div className="riga__stato">{errore}</div> : null}
        </div>
      ) : null}

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
      )}
    </aside>
  )
}
