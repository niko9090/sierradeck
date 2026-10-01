import { useCallback, useEffect, useRef, useState } from 'react'
import type { Autopilota } from '@shared/autopilota'
import { LARGHEZZA_DIARIO } from '@shared/preferenze'
import { passoDaTasto, postoDalDocumento, quotaDiario } from '../diario-misura'
import { ledDi, misuraPasso, passaggi } from '@shared/autopilota-vista'
import { ChatAutopilota } from './ChatAutopilota'
import { domandaArrivata } from '@shared/domande-autopilota'
import { LinguettaAutopilota, useDomandeAutopilota } from './LinguettaAutopilota'

/** Le linguette sotto la chat: una cosa per volta, ognuna con tutto lo spazio. */
type Linguetta = 'domande' | 'lavoro' | 'file' | 'obiettivo' | 'criteri' | 'compiti' | 'diario'

const LINGUETTE: { id: Linguetta; nome: string; titolo: string }[] = [
  { id: 'domande', nome: 'Domande', titolo: 'Le sue domande non ancora risposte, una per volta: rispondi da qui' },
  { id: 'lavoro', nome: 'Sta facendo', titolo: 'Cosa sta scrivendo adesso la chat che esegue' },
  { id: 'file', nome: 'File', titolo: 'I file che ha cambiato, per chat, con il diff: solo da guardare' },
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
  const [linguetta, setLinguetta] = useState<Linguetta>('lavoro')
  /**
   * Le sue domande aperte (0.38.0): il numerino della linguetta «Domande» e
   * le schede da rispondere. Si rileggono ogni due secondi dal servizio.
   */
  const { schede, rileggi: leggiDomande } = useDomandeAutopilota(autopilota)
  /**
   * Le linguette staccate in una finestra vera (0.38.0): spariscono dalla barra
   * finche' non le rimetti (dalla loro finestra, «Rimetti al suo posto», o
   * chiudendola).
   */
  const [staccate, setStaccate] = useState<string[]>([])
  useEffect(() => {
    const applica = (aperti: { autopilota: string; linguetta: string }[]): void =>
      setStaccate(aperti.filter((x) => x.autopilota === autopilota.id).map((x) => x.linguetta))
    window.gestore.pannello.aperti().then(applica).catch(() => undefined)
    return window.gestore.pannello.suCambio(applica)
  }, [autopilota.id])
  const barra = useRef<HTMLDivElement | null>(null)
  const stacca = (l: Linguetta): void => {
    void window.gestore.pannello.stacca(autopilota.id, l).catch(() => undefined)
  }
  /** Trascinata fuori dalla barra (anche fuori dalla finestra): si stacca. */
  const fineTrascinamento = (l: Linguetta, e: React.DragEvent<HTMLButtonElement>): void => {
    const r = barra.current?.getBoundingClientRect()
    if (r === undefined) return
    const fuori = (e.clientX === 0 && e.clientY === 0) || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top - 8 || e.clientY > r.bottom + 40
    if (fuori) stacca(l)
  }
  // Dalla colonna Domande: «X ti aspetta → apri» porta qui, sulla linguetta.
  const radice = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const suApri = (e: Event): void => {
      const d = (e as CustomEvent<{ id: string; gestito: boolean }>).detail
      if (d.id !== autopilota.id) return
      d.gestito = true
      setAperto(true)
      setLinguetta((l) => {
        if (l !== 'domande') primaDelleDomande.current = l
        return 'domande'
      })
      radice.current?.scrollIntoView({ block: 'nearest' })
    }
    window.addEventListener('sierradeck:domande-autopilota', suApri)
    return () => window.removeEventListener('sierradeck:domande-autopilota', suApri)
  }, [autopilota.id])
  // Dove si era prima che una domanda portasse alla linguetta «Domande»:
  // finite le domande, si torna li'.
  const primaDelleDomande = useRef<Linguetta>('lavoro')
  const viste = useRef<string[]>([])
  useEffect(() => {
    // Una domanda nuova: la linguetta si accende e si fa avanti (se e'
    // staccata in una sua finestra, lampeggia quella).
    if (domandaArrivata(viste.current, schede) && !staccate.includes('domande')) {
      setLinguetta((l) => {
        if (l !== 'domande') primaDelleDomande.current = l
        return 'domande'
      })
    }
    viste.current = schede.map((d) => d.chiave)
    // Finite: la linguetta si chiude e si torna dov'eri.
    if (schede.length === 0) setLinguetta((l) => (l === 'domande' ? primaDelleDomande.current : l))
  }, [schede.map((d) => d.chiave).join('|')])
  const colonna = useRef<HTMLElement | null>(null)

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

  const visibile = staccate.includes(linguetta)
    ? (LINGUETTE.find((l) => !staccate.includes(l.id) && l.id !== 'domande')?.id ?? 'lavoro')
    : linguetta
  const pannello = (): React.JSX.Element => (
    <LinguettaAutopilota
      autopilota={autopilota}
      linguetta={visibile}
      schede={schede}
      onRisposto={() => { leggiDomande(); onCambiato() }}
      onCambiato={onCambiato}
    />
  )

  return (
    <aside className={largo ? 'diario diario--largo' : 'diario'} ref={(el) => { colonna.current = el; radice.current = el }}>
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
          <div className="diario__schede" role="tablist" ref={barra}>
            {LINGUETTE.filter((l) => (l.id !== 'domande' || schede.length > 0) && !staccate.includes(l.id)).map((l) => (
              <button
                draggable
                onDragEnd={(e) => fineTrascinamento(l.id, e)}
                key={l.id}
                role="tab"
                aria-selected={visibile === l.id}
                className={`${visibile === l.id ? 'diario__scheda diario__scheda--attiva' : 'diario__scheda'}${l.id === 'domande' ? ' diario__scheda--domande' : ''}`}
                title={l.titolo}
                onClick={() => {
                  if (l.id === 'domande' && linguetta !== 'domande') primaDelleDomande.current = linguetta
                  setLinguetta(l.id)
                }}
              >
                {l.nome}
                {/* Il numero accanto alla linguetta dice se dentro c'è qualcosa
                    senza doverla aprire. */}
                {l.id === 'domande' ? <span className="diario__scheda-conto diario__scheda-conto--domande">{schede.length}</span> : null}
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
            <span style={{ flex: 1 }} />
            {!staccate.includes(linguetta) ? (
              <button
                className="diario__stacca"
                onClick={() => stacca(linguetta)}
                title="Stacca questa linguetta in una finestra sua, da spostare dove vuoi, anche su un altro schermo. Si rimette dalla sua finestra («Rimetti al suo posto») o chiudendola. Puoi anche trascinare una linguetta fuori da questa barra"
                aria-label="Stacca la linguetta in una finestra"
              >
                ⧉ Stacca
              </button>
            ) : null}
          </div>
          <div className="diario__pannello">
            {pannello()}
          </div>
        </div>
      </div>
    </aside>
  )
}
