import { useCallback, useEffect, useRef, useState } from 'react'
import type { Anteprima } from '../../main/anteprima'
import type { Autopilota } from '@shared/autopilota'
import { LARGHEZZA_DIARIO } from '@shared/preferenze'
import { passoDaTasto, postoDalDocumento, quotaDiario } from '../diario-misura'
import { diario } from '../diario-autopilota'
import { ledDi, misuraPasso, passaggi } from '@shared/autopilota-vista'
import { ChatAutopilota } from './ChatAutopilota'
import {
  CompitiAutopilota, CriteriAutopilota, ObiettivoAutopilota, RagionamentiAutopilota
} from './SchedaAutopilota'

function ora(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

/** Le linguette sotto la chat: una cosa per volta, ognuna con tutto lo spazio. */
type Linguetta = 'lavoro' | 'obiettivo' | 'criteri' | 'compiti' | 'diario'

const LINGUETTE: { id: Linguetta; nome: string; titolo: string }[] = [
  { id: 'lavoro', nome: 'Sta facendo', titolo: 'Cosa sta scrivendo adesso la chat che esegue' },
  { id: 'obiettivo', nome: 'Obiettivo', titolo: 'Cosa gli hai chiesto, cosa ha capito, a che punto è, le sue chat' },
  { id: 'criteri', nome: 'Criteri', titolo: 'Quando considera finito il lavoro, e come lo misura' },
  { id: 'compiti', nome: 'Compiti', titolo: 'I pezzi di lavoro in coda' },
  { id: 'diario', nome: 'Ha deciso', titolo: 'Tutte le sue decisioni, dalla più recente' }
]

/**
 * La sezione dell'autopilota, accanto alla chat che esegue.
 *
 * In cima la **chat con lui** — le sue domande, le tue risposte, quello che gli
 * dici e quello che risponde — e sotto le linguette con il resto: cosa sta
 * facendo la chat che esegue, l'obiettivo, i criteri, i compiti, il diario
 * delle decisioni. Nicholas (18/09): «mi interessa avere in alto la parte di
 * chat e nelle varie tab le altre info così vedo tutto senza scorrere come un
 * matto». Prima era una colonna sola che impilava tutto, e il dialogo stava in
 * fondo.
 *
 * Il terminale dice *cosa scrive* la chat che esegue; qui c'è l'altra metà:
 * chi la governa, quanto manca secondo i criteri, e cosa ha deciso a ogni
 * intervento.
 *
 * Si chiude: quando si sta leggendo il terminale, duecento pixel in meno di
 * larghezza si sentono.
 */
export function DiarioAutopilota({
  autopilota,
  largo,
  onLargo,
  onCambiato
}: {
  autopilota: Autopilota
  /** A tutta larghezza del riquadro: il terminale si fa da parte. */
  largo: boolean
  onLargo: (v: boolean) => void
  /** Dalla scheda si e cambiato qualcosa: va riletto adesso, non fra due secondi. */
  onCambiato: () => void
}): React.JSX.Element {
  const [aperto, setAperto] = useState(true)
  // Cosa sta scrivendo la sua chat, adesso. Quella chat gira in un processo
  // staccato e non ha un terminale da guardare: senza questo, dell'autopilota
  // si vedono solo le decisioni — cioè qualcosa ogni parecchi minuti, mentre
  // lui lavora di continuo.
  const [conversazione, setConversazione] = useState<Anteprima | undefined>(undefined)
  const [linguetta, setLinguetta] = useState<Linguetta>('lavoro')
  /** Con la flotta: quale chat si guarda in «Sta facendo». */
  const [chatScelta, setChatScelta] = useState<string | undefined>(undefined)
  const colonna = useRef<HTMLElement | null>(null)

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
    // Si legge solo quando si guarda: la trascrizione è mezzo megabyte, e
    // rileggerla ogni due secondi per una linguetta chiusa è lavoro buttato.
    if (linguetta !== 'lavoro') return
    aggiorna()
    // Due secondi: abbastanza spesso da vedere il lavoro procedere, abbastanza
    // di rado da non rileggere mezzo megabyte per niente.
    const h = setInterval(aggiorna, 2000)
    return () => clearInterval(h)
  }, [aggiorna, linguetta])

  const voci = diario(autopilota)
  const led = ledDi(autopilota)
  const percorso = passaggi(autopilota)
  const m = misuraPasso(autopilota)
  const qui = percorso.find((p) => p.stato !== 'fatto' && p.stato !== 'davanti')

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

    // Lungo quale asse ci si muove lo dice il posto scelto dall'utente, letto
    // dalla radice del documento — la stessa sorgente da cui il foglio di stile
    // prende la direzione del riquadro. Prenderlo altrove vorrebbe dire poter
    // divergere: la maniglia lungo un asse e il diario lungo un altro.
    const posto = postoDalDocumento(document.documentElement)
    const misura = (x: number, y: number): number => quotaDiario(posto, zona, { x, y })
    const muovi = (ev: PointerEvent): void => {
      ultima = misura(ev.clientX, ev.clientY)
      document.documentElement.style.setProperty('--diario-largh', `${ultima}%`)
    }
    const molla = (): void => {
      bersaglio.removeEventListener('pointermove', muovi)
      bersaglio.removeEventListener('pointerup', molla)
      bersaglio.removeEventListener('pointercancel', molla)
      salvaLargh(ultima)
    }
    ultima = misura(e.clientX, e.clientY)
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

  /**
   * Le frecce muovono la maniglia: un bordo trascinabile solo col mouse è mezzo
   * comando.
   *
   * Quali frecce dipende da dove sta il diario — con il diario sotto, «su» deve
   * allargarlo, e sinistra/destra su una maniglia orizzontale non vogliono dire
   * niente.
   */
  const tastiLargh = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const passo = passoDaTasto(postoDalDocumento(document.documentElement), e.key)
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
        title={`${autopilota.nome}: ${qui?.nota ?? led.titolo} — riapre la sezione dell’autopilota`}
      >
        <span className={`led ${led.classe}`} />
        {/* La percentuale del passo in cui si trova, con il suo colore: a
            pannello chiuso sono gli unici due segni che restano. */}
        <span className={`diario__linguetta-testo diario__misura--${m.tono}`}>
          {m.percento}%
        </span>
      </button>
    )
  }

  const pannello = (): React.JSX.Element => {
    switch (linguetta) {
      case 'obiettivo':
        return <ObiettivoAutopilota autopilota={autopilota} />
      case 'criteri':
        return <CriteriAutopilota autopilota={autopilota} onCambiato={onCambiato} />
      case 'compiti':
        return <CompitiAutopilota autopilota={autopilota} onCambiato={onCambiato} />
      case 'diario':
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
      case 'lavoro':
      default:
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
                    chat {i + 1}
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
        {/* Il nome non è serigrafato: sotto ci sono già i passi, che lo sono
            per natura — le etichette incise sotto i LED — e due righe di
            maiuscole tracciate di fila si annullano a vicenda. */}
        <span className="diario__nome" title={autopilota.nome}>{autopilota.nome}</span>
        {/* La percentuale del passo in cui si trova, con il suo colore: qui in
            testa, in una riga con il nome, invece di una riga sua. */}
        <span className={`diario__misura diario__misura--${m.tono}`} title={`${m.dettaglio} · ${m.di}`}>
          <span className="diario__percento">{m.percento}%</span>
        </span>
        {/* A tutta larghezza chat e linguette stanno fianco a fianco;
            stretto, una sopra l'altra di fianco al terminale. */}
        <button
          className="comando-riquadro"
          onClick={() => onLargo(!largo)}
          title={largo ? 'Torna a fianco del terminale' : 'Mostra la sezione a tutta larghezza'}
          aria-label={largo ? 'Restringi' : 'Allarga'}
        >
          {largo ? '⇥' : '⇤'}
        </button>
        <button
          className="comando-riquadro"
          onClick={() => { onLargo(false); setAperto(false) }}
          title="Chiude la sezione e restituisce spazio al terminale"
          aria-label="Chiudi la sezione dell’autopilota"
        >
          ›
        </button>
      </div>

      {/* Il percorso intero, non solo il punto in cui si trova: sei stati
          raccontati da una percentuale e una riga erano due. Qui si vede se
          «fermo» è successo prima o dopo che si mettesse al lavoro — che è la
          differenza fra rispondergli e andare a vedere la chat. */}
      <ol className="passi" aria-label="A che punto è" title={qui?.nota}>
        {percorso.map((p) => (
          <li key={p.nome} className={`passo passo--${p.stato}`}>
            <span className="passo__led" aria-hidden="true" />
            <span className="passo__nome">{p.nome}</span>
          </li>
        ))}
      </ol>
      <div className={`diario__barra diario__barra--${m.tono}`}>
        <span className="diario__riempimento" style={{ width: `${m.percento}%` }} />
      </div>

      {/* Due metà: la chat con lui sopra, le linguette sotto. Ognuna scorre per
          conto suo, così la chat resta a vista mentre si leggono i criteri e
          i criteri restano a vista mentre si legge la chat. A tutta larghezza
          stanno fianco a fianco. */}
      <div className="diario__due">
        <ChatAutopilota autopilota={autopilota} onCambiato={onCambiato} />

        <div className="diario__lato">
          <div className="diario__schede" role="tablist">
            {LINGUETTE.map((l) => (
              <button
                key={l.id}
                role="tab"
                aria-selected={linguetta === l.id}
                className={linguetta === l.id ? 'diario__scheda diario__scheda--attiva' : 'diario__scheda'}
                title={l.titolo}
                onClick={() => setLinguetta(l.id)}
              >
                {l.nome}
                {/* Il numero accanto alla linguetta dice se dentro c'è qualcosa
                    senza doverla aprire. */}
                {l.id === 'criteri' && autopilota.criteri.length > 0 ? (
                  <span className="diario__scheda-conto">
                    {autopilota.criteri.filter((c) => c.soddisfatto).length}/{autopilota.criteri.length}
                  </span>
                ) : null}
                {l.id === 'compiti' && autopilota.compitiDaFare.length > 0 ? (
                  <span className="diario__scheda-conto">{autopilota.compitiDaFare.length}</span>
                ) : null}
                {l.id === 'lavoro' && autopilota.chats.length > 1 ? (
                  <span className="diario__scheda-conto">{autopilota.chats.filter((c) => c.stato === 'lavoro').length}</span>
                ) : null}
              </button>
            ))}
          </div>
          <div className="diario__pannello">
            {pannello()}
          </div>
        </div>
      </div>
    </aside>
  )
}
