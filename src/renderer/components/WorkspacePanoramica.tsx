import { useEffect, useRef, useState } from 'react'
import type { Autopilota } from '@shared/autopilota'
import type { Dormiente } from '@shared/migrazione-elenco'
import {
  adessoEFinite, daQuanto, linguetteVisibili, nomeLinguetta, riassuntoAlLavoro, SIMBOLO_STATO, sottoAlLavoro, titoloAlLavoro,
  type RigaAlLavoro, type SchedaChat, type StatoScheda
} from '@shared/panoramica'
import { CHAT_GENERICA } from '@shared/adozione'
import { RUOLI, type Ruolo } from '@shared/ruoli-agenti'
import { attivitaDaSegnali } from '@shared/attivita-chat'
import type { Segnale } from '@shared/segnali-chat'
import { ChatAutopilota } from './ChatAutopilota'
import { AdessoAutopilota } from './DalVivoAutopilota'
import { adessoDi, AIUTO_ADESSO, type SegniDalVivo } from '@shared/adesso'
import { Aiuto } from './Aiuto'
import { LegendaAttivita, SegnoAttivita } from './SegnoAttivita'
import { coloreDi } from '@shared/colori-attivita'
import { AzioniChat } from './AzioniChat'
import { TastoMicrofono } from './TastoMicrofono'

/**
 * Il workspace dell'autopilota a linguette (0.77.0). Nicholas, 16/10:
 * «vedere tutto in una vista». La prima linguetta è la Panoramica (la
 * dashboard del progetto), poi una linguetta per chat, a tutta larghezza.
 * Rivista da un agente UI/UX prima del codice: schede alte fisse, simbolo oltre
 * al colore, 8 s di quiete prima che una scheda cambi gruppo (tranne «aspetta
 * te»), fra 4 e 10 linguette, la domanda solo nella colonna di destra.
 *
 * I terminali restano montati sotto (il Mosaic non si sposta mai nell'albero):
 * la Panoramica si sovrappone, non smonta niente.
 */

/** Una scheda come la disegna il PC: la scheda delle regole, più quello che si vede. */
export type SchedaVista = SchedaChat & {
  /** Il riquadro della chat: assente per uno specialista che ha finito e chiuso la chat. */
  paneId?: string
  nomeRuolo?: string
  coloreRuolo?: string
  ultimaAzione: string
  righe: string[]
  dal?: number
  /** Ha una domanda che aspetta te, nella colonna Domande. */
  domanda?: boolean
  /** Guarda una chat di un altro PC. */
  suPc?: string
  /** È dell'autopilota (uno specialista o la sua chat): ferma va fra le finite, non fra le «Chat» (0.78.0). */
  specialista?: boolean
  /** La conversazione: per «solo mia» (0.78.0). */
  sessione?: string
  /** Nicholas l'ha segnata «solo mia»: l'autopilota non la tocca (0.78.0). */
  soloMia?: boolean
}

export const PANORAMICA = 'panoramica'

const COLORE_STATO: Record<StatoScheda, string> = { chiede: 'var(--ambra)', lavora: 'var(--verde)', ferma: 'var(--testo-quieto)', finita: 'var(--testo-quieto)' }
const PAROLA_STATO: Record<StatoScheda, string> = { chiede: 'aspetta te', lavora: 'al lavoro', ferma: 'ferma', finita: 'finita' }

function Pallino({ stato }: { stato: StatoScheda }): React.JSX.Element {
  return <span className={`pan-pallino pan-pallino--${stato}`} style={{ color: COLORE_STATO[stato] }} aria-label={PAROLA_STATO[stato]}>{SIMBOLO_STATO[stato]}</span>
}

/** La barra delle linguette: Panoramica, una per chat, «Altre ▾», e la colonna dell'autopilota. */
export function BarraLinguette({ schede, linguetta, onLinguetta, colonna, onColonna, conAutopilota, onMosaico }: {
  schede: SchedaVista[]
  linguetta: string
  onLinguetta: (id: string) => void
  colonna: boolean
  onColonna: (v: boolean) => void
  conAutopilota: boolean
  onMosaico: () => void
}): React.JSX.Element {
  const barra = useRef<HTMLDivElement | null>(null)
  const [larghezza, setLarghezza] = useState(1200)
  const [altreAperte, setAltreAperte] = useState(false)
  useEffect(() => {
    const el = barra.current
    if (el === null) return
    const ro = new ResizeObserver(() => setLarghezza(el.clientWidth))
    ro.observe(el)
    setLarghezza(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  const conPane = schede.filter((s) => s.paneId !== undefined)
  const { visibili, altre } = linguetteVisibili(larghezza - 200, conPane, linguetta)
  const tasto = (s: SchedaVista): React.JSX.Element => (
    <button
      key={s.id}
      role="tab"
      aria-selected={linguetta === s.paneId}
      className={`pan-linguetta${linguetta === s.paneId ? ' pan-linguetta--qui' : ''}${s.stato === 'chiede' ? ' pan-linguetta--chiede' : ''}`}
      title={s.titolo}
      onClick={() => { if (s.paneId !== undefined) onLinguetta(s.paneId); setAltreAperte(false) }}
    >
      <Pallino stato={s.stato} />
      <span className="pan-linguetta__nome">{nomeLinguetta(s.nomeRuolo, s.titolo)}</span>
    </button>
  )
  return (
    <div className="pan-barra" ref={barra} role="tablist" aria-label="Linguette del workspace"
      onKeyDown={(e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
        const ids = [PANORAMICA, ...visibili.map((v) => v.paneId!)]
        const i = ids.indexOf(linguetta)
        const j = (i + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length
        onLinguetta(ids[j] ?? PANORAMICA)
      }}>
      <button role="tab" aria-selected={linguetta === PANORAMICA} className={`pan-linguetta pan-linguetta--panoramica${linguetta === PANORAMICA ? ' pan-linguetta--qui' : ''}`} onClick={() => onLinguetta(PANORAMICA)}>
        Panoramica
      </button>
      {visibili.map(tasto)}
      {altre.length > 0 ? (
        <span className="pan-altre">
          <button className={`pan-linguetta${altre.some((a) => a.stato === 'chiede') ? ' pan-linguetta--chiede' : ''}`} aria-expanded={altreAperte} onClick={() => setAltreAperte((v) => !v)}>
            {altre.some((a) => a.stato === 'chiede') ? `◆ ${altre.filter((a) => a.stato === 'chiede').length} · ` : ''}Altre ({altre.length}) ▾
          </button>
          {altreAperte ? <div className="pan-altre__menu" role="menu">{altre.map(tasto)}</div> : null}
        </span>
      ) : null}
      <span style={{ flex: 1 }} />
      {conAutopilota && linguetta !== PANORAMICA ? (
        <button className="tasto tasto--mini" aria-pressed={colonna} onClick={() => onColonna(!colonna)} title="Apre o chiude la colonna dell'autopilota">
          {colonna ? '⟨ Autopilota' : 'Autopilota ⟩'}
        </button>
      ) : null}
      <InterruttoreVista vista="panoramica" onPanoramica={() => onLinguetta(PANORAMICA)} onAffiancate={onMosaico} />
    </div>
  )
}

/**
 * L'interruttore delle due viste (0.78.1). Nicholas: «non capisco cosa vuol
 * dire mosaico e poi non si può tornare indietro». Sempre in alto a destra, in
 * tutte e due le viste, con la voce attiva evidente e un «?» corto per voce: si
 * passa nei due sensi con un clic, e la scelta si ricorda per workspace. Le chat
 * restano le stesse: nessuna si chiude o si riavvia cambiando vista.
 */
export function InterruttoreVista({ vista, onPanoramica, onAffiancate }: {
  vista: 'panoramica' | 'affiancate'
  onPanoramica: () => void
  onAffiancate: () => void
}): React.JSX.Element {
  return (
    <span className="vista-interruttore" role="group" aria-label="Come vedere questo workspace">
      <button className={`vista-interruttore__voce${vista === 'panoramica' ? ' vista-interruttore__voce--attiva' : ''}`} aria-pressed={vista === 'panoramica'} onClick={onPanoramica}>
        Panoramica
      </button>
      <button className={`vista-interruttore__voce${vista === 'affiancate' ? ' vista-interruttore__voce--attiva' : ''}`} aria-pressed={vista === 'affiancate'} onClick={onAffiancate}>
        Tutte le chat affiancate
      </button>
      {/* 0.82.0: un «?» solo per le due viste, non uno per voce. */}
      <Aiuto di="le due viste del workspace">«Panoramica»: tutto il workspace in una vista, con la situazione, le chat al lavoro, il piano e le altre chat; tocca una scheda per aprire la sua chat. «Tutte le chat affiancate»: le chat del workspace una accanto all’altra. Sono le stesse chat: cambiando vista nessuna si chiude o si riavvia.</Aiuto>
    </span>
  )
}

/** La barra della vista con tutte le chat affiancate: solo l'interruttore, nello stesso posto (0.78.1). */
export function BarraAffiancate({ onPanoramica, colonna = false, onColonna, conAutopilota = false }: {
  onPanoramica: () => void
  /** La colonna dell'autopilota del workspace (30/10): anche fra le chat affiancate. */
  colonna?: boolean
  onColonna?: (v: boolean) => void
  conAutopilota?: boolean
}): React.JSX.Element {
  return (
    <div className="pan-barra" aria-label="Vista del workspace">
      <span style={{ flex: 1 }} />
      {conAutopilota && onColonna !== undefined ? (
        <button className="tasto tasto--mini" aria-pressed={colonna} onClick={() => onColonna(!colonna)} title="Apre o chiude la colonna dell'autopilota">
          {colonna ? '⟨ Autopilota' : 'Autopilota ⟩'}
        </button>
      ) : null}
      <InterruttoreVista vista="affiancate" onPanoramica={onPanoramica} onAffiancate={() => undefined} />
    </div>
  )
}

/**
 * Il corpo della Panoramica 2 (0.78.0). Nicholas sulla 0.77.0: «puoi fare
 * meglio». Rivista da un agente UI/UX prima del codice:
 * - in alto il workspace e quante chat ha;
 * - a sinistra l'autopilota del workspace: avanzamento, coda delle richieste e
 *   conversazione; gli eventi tecnici in «Cosa è successo ▸», chiuso;
 * - al centro «Adesso» (solo chi lavora o aspetta te), le altre chat del
 *   workspace («Chat», anche quelle adottate), «Finite: N ▸».
 * Le domande stanno solo nella colonna Domande (30/10: un posto solo).
 * In ogni workspace, anche senza autopilota (c-30): le chat esistenti sono schede.
 */
export function CorpoPanoramica({ workspace, autopilota, dormiente, cwd, schede, onApri, onRicarica, onSoloMia }: {
  workspace: string
  autopilota?: Autopilota
  dormiente?: Dormiente
  /** La cartella di una chat del workspace: dove nasce il suo autopilota, se non c'è ancora. */
  cwd?: string
  schede: SchedaVista[]
  onApri: (paneId: string) => void
  onRicarica: () => void
  onSoloMia: (s: SchedaVista, si: boolean) => void
}): React.JSX.Element {
  const ora = Date.now()
  // Cosa fa adesso ogni chat al lavoro (0.79.0): dai segnali di Claude Code, riletti da soli.
  const segnali = useSegnaliDi(schede.filter((x) => x.stato === 'lavora' || x.stato === 'chiede').flatMap((x) => (x.sessione !== undefined && x.suPc === undefined ? [x.sessione] : [])))
  const { adesso, finite } = adessoEFinite(schede)
  // 0.81.0: le chat dell'autopilota dai suoi dati, anche quelle mai comparse in
  // una finestra (c-14 e c-15 il 20/10): senza, qui si leggeva «Nessuna chat al
  // lavoro» mentre erano ferme da ore.
  const righeAp = autopilota !== undefined ? adessoDi(autopilota as Autopilota & SegniDalVivo, ora).righe : []
  // Le chat che non lavorano: quelle del workspace (anche adottate) nella sezione «Chat»,
  // quelle dell'autopilota (specialisti, la sua chat) in «Finite: N ▸».
  const chat = finite.filter((s) => s.specialista !== true)
  const finiteAp = finite.filter((s) => s.specialista === true)
  const cartella = dormiente?.cwd ?? cwd
  return (
    <div className="pan-corpo pan2" aria-label={`Panoramica di ${workspace}`}>
      <header className="pan2-situazione">
        <div className="pan2-obiettivo">
          Workspace «{workspace}»: {schede.length === 1 ? 'una chat' : `${schede.length} chat`}.{autopilota === undefined ? ' Il suo autopilota aspetta il tuo primo messaggio, a sinistra.' : ''}
          <Aiuto di="la Panoramica">A sinistra l’autopilota del workspace: l’avanzamento, la coda delle richieste e la conversazione con lui; quello che ha fatto da solo è in «Cosa è successo». Al centro: «Adesso» le chat al lavoro o che aspettano te, le altre chat del workspace, le finite. Tocca una scheda per aprire la sua chat. «Solo mia» su una chat: l’autopilota non la tocca e non le scrive. Le domande stanno nella colonna Domande.</Aiuto>
        </div>
      </header>
      <section className="pan2-dialogo" aria-label="Conversazione con l’autopilota">
        {autopilota !== undefined ? (
          <ChatAutopilota autopilota={autopilota} onCambiato={onRicarica} soloConversazione campoPronto />
        ) : (
          <PrimoMessaggio workspace={workspace} {...(cartella !== undefined ? { cwd: cartella } : {})} onRicarica={onRicarica} />
        )}
      </section>
      <section className="pan2-centro" aria-label="Il lavoro del workspace">
        <RiassuntoAlLavoro righe={riassuntoAlLavoro(autopilota, schede, ora, (sessione) => attivitaDaSegnali(segnali[sessione] ?? [], ora))} schede={schede} onApri={onApri} />
        {/* 0.82.0: vuoto, «Adesso» ripeteva «Nessuna chat al lavoro» della riga sopra: non si mostra. */}
        {adesso.length === 0 && (autopilota === undefined || righeAp.length === 0) ? null : (
        <div className="pan2-sezione">
          <div className="serigrafia con-aiuto" aria-live="polite">
            Adesso · {adesso.length > 0 ? adesso.length : righeAp.length}
            {righeAp.length > 0 ? <Aiuto di="il riquadro Adesso">{AIUTO_ADESSO}</Aiuto> : null}
          </div>
          {adesso.length === 0 ? (
            <AdessoAutopilota autopilota={autopilota!} dentro />
          ) : (
            <>
              <div className="pan2-adesso">
                {adesso.map((s) => <SchedaAdesso key={s.id} s={s} ora={ora} onApri={onApri} onSoloMia={onSoloMia} />)}
              </div>
              {autopilota !== undefined ? <AdessoAutopilota autopilota={autopilota} dentro soloFerme /> : null}
            </>
          )}
        </div>
        )}
        {chat.length > 0 ? (
          <div className="pan2-sezione">
            <div className="serigrafia">Chat · {chat.length}</div>
            <div className="pan2-chat">
              {chat.map((s) => <SchedaChatFerma key={s.id} s={s} ora={ora} onApri={onApri} onSoloMia={onSoloMia} />)}
            </div>
          </div>
        ) : null}
        {finiteAp.length > 0 ? <Finite schede={finiteAp} ora={ora} onApri={onApri} /> : null}
        {schede.length === 0 ? (
          <p className="pan2-vuoto">Nessuna chat. L’autopilota le apre quando serve; puoi anche aprirne una con «+ Nuova chat».</p>
        ) : null}
      </section>
    </div>
  )
}

/**
 * Accanto alla conversazione (0.79.0, Nicholas): una riga per ogni chat al
 * lavoro — chi è, cosa fa adesso in parole semplici, da quanto, se aspetta
 * te. Si aggiorna da sola con i segnali; il tocco apre la chat.
 */
export function RiassuntoAlLavoro({ righe, schede, onApri }: { righe: RigaAlLavoro[]; schede: SchedaVista[]; onApri: (paneId: string) => void }): React.JSX.Element {
  const aspettano = righe.filter((r) => r.aspettaTe).length
  return (
    <div className="pan2-sezione pan2-riassunto" aria-label="Chi lavora adesso">
      <div className="serigrafia" aria-live="polite">
        <span className={aspettano > 0 ? 'pan2-riassunto__aspettano' : undefined}>{titoloAlLavoro(righe)}</span>
        <Aiuto di="Chi lavora adesso">Una riga per chat al lavoro: chi è, cosa fa adesso, da quanto. ◆ vuol dire che aspetta una tua risposta. Si aggiorna da sola; tocca una riga per aprire la sua chat.</Aiuto>
        <LegendaAttivita />
      </div>
      {righe.length === 0 ? <p className="pan2-vuoto">Nessuna chat al lavoro.</p> : (
        <ul className="pan2-riassunto__elenco">
          {righe.map((r) => {
            const pane = schede.find((s) => s.id === r.id)?.paneId
            return (
              <li key={r.id}>
                <button className={`pan2-riassunto__riga${r.aspettaTe ? ' pan2-riassunto__riga--chiede' : ''}`} disabled={pane === undefined} onClick={() => { if (pane !== undefined) onApri(pane) }} title={`${r.chi}: ${r.cosa}`}>
                  <SegnoAttivita attivita={r.attivita} />
                  <PillolaRuolo {...(r.ruolo !== undefined ? { ruolo: r.ruolo } : {})} nome={r.chi} />
                  <span className="pan2-riassunto__cosa">{r.cosa}</span>
                  <span className="pan2-riassunto__quanto">{sottoAlLavoro(r)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

const LETTERA_RUOLO: Record<Ruolo, string> = { sviluppo: 'S', interfaccia: 'I', collaudo: 'C', revisione: 'R', rilascio: 'L' }

function PillolaRuolo({ ruolo, nome }: { ruolo?: Ruolo; nome?: string }): React.JSX.Element {
  const r = ruolo !== undefined ? RUOLI[ruolo] : undefined
  const testo = nome ?? r?.nome ?? CHAT_GENERICA
  return (
    <span className="pan2-ruolo" style={{ color: r !== undefined ? coloreDi(r.colore) : 'var(--testo-quieto)', borderColor: r !== undefined ? coloreDi(r.colore) : 'var(--bordo)' }}>
      <b aria-hidden>{ruolo !== undefined ? LETTERA_RUOLO[ruolo] : '·'}</b>{testo}
    </span>
  )
}

function SchedaAdesso({ s, ora, onApri, onSoloMia }: { s: SchedaVista; ora: number; onApri: (p: string) => void; onSoloMia: (s: SchedaVista, si: boolean) => void }): React.JSX.Element {
  const righe = s.righe.slice(-6)
  return (
    <div className={`pan2-scheda pan2-scheda--${s.stato}`}>
      <button className="pan2-scheda__apri" disabled={s.paneId === undefined} onClick={() => { if (s.paneId !== undefined) onApri(s.paneId) }} title="Apri questa chat a tutta larghezza">
        <span className="pan2-scheda__testa">
          <Pallino stato={s.stato} />
          <PillolaRuolo {...(s.ruolo !== undefined ? { ruolo: s.ruolo } : {})} {...(s.nomeRuolo !== undefined ? { nome: s.nomeRuolo } : {})} />
          <span className="pan2-scheda__titolo">{s.titolo.replace(/^[^·]+ · /, '')}</span>
          <span className="pan2-scheda__quando">{s.suPc !== undefined ? `su ${s.suPc}` : daQuanto(s.dal, ora)}</span>
        </span>
        <span className="pan2-scheda__righe">
          {righe.length === 0 ? <span className="pan2-scheda__attesa">in attesa di output…</span> : righe.map((x, i) => <span key={i}>{x}</span>)}
        </span>
        {/* L'ultima azione solo se dice altro dalle righe sopra (prova del 16/10: era la stessa riga due volte). */}
        {s.domanda === true || (s.ultimaAzione !== '' && !righe.some((r) => r.trim() === s.ultimaAzione.trim())) ? (
          <span className="pan2-scheda__azione">{s.domanda === true ? '◆ Ti chiede qualcosa: rispondi a destra' : s.ultimaAzione}</span>
        ) : null}
      </button>
      {s.specialista !== true && s.sessione !== undefined ? <TastoSoloMia s={s} onSoloMia={onSoloMia} /> : null}
      {s.sessione !== undefined && s.suPc === undefined ? <AzioniChat sessione={s.sessione} titolo={s.titolo} classe="pan2-gestione" /> : null}
    </div>
  )
}

function SchedaChatFerma({ s, ora, onApri, onSoloMia }: { s: SchedaVista; ora: number; onApri: (p: string) => void; onSoloMia: (s: SchedaVista, si: boolean) => void }): React.JSX.Element {
  return (
    <div className="pan2-chatferma">
      <button className="pan2-chatferma__apri" disabled={s.paneId === undefined} onClick={() => { if (s.paneId !== undefined) onApri(s.paneId) }} title={s.titolo}>
        <span className="pan2-scheda__testa">
          <Pallino stato={s.stato} />
          <PillolaRuolo {...(s.ruolo !== undefined ? { ruolo: s.ruolo } : {})} />
          <span className="pan2-scheda__titolo">{s.titolo}</span>
          <span className="pan2-scheda__quando">{s.suPc !== undefined ? `su ${s.suPc}` : daQuanto(s.dal, ora)}</span>
        </span>
        <span className="pan2-scheda__azione">{s.ultimaAzione !== '' ? s.ultimaAzione : 'ferma'}</span>
      </button>
      {s.sessione !== undefined ? <TastoSoloMia s={s} onSoloMia={onSoloMia} /> : null}
      {s.sessione !== undefined && s.suPc === undefined ? <AzioniChat sessione={s.sessione} titolo={s.titolo} classe="pan2-gestione" /> : null}
    </div>
  )
}

function TastoSoloMia({ s, onSoloMia }: { s: SchedaVista; onSoloMia: (s: SchedaVista, si: boolean) => void }): React.JSX.Element {
  return (
    <button
      className="tasto tasto--mini pan2-solomia"
      aria-pressed={s.soloMia === true}
      onClick={() => onSoloMia(s, s.soloMia !== true)}
      title={s.soloMia === true ? 'Solo tua: l’autopilota non la tocca e non le scrive. Tocca per affidargliela di nuovo.' : 'L’autopilota la conosce e le scrive solo quando glielo chiedi. Tocca per tenerla solo tua.'}
    >
      {s.soloMia === true ? '🔒 solo mia' : 'solo mia'}
    </button>
  )
}

/** «Finite: N ▸»: una riga, che si apre in una lista compatta. */
function Finite({ schede, ora, onApri }: { schede: SchedaVista[]; ora: number; onApri: (p: string) => void }): React.JSX.Element {
  const [aperta, setAperta] = useState(false)
  return (
    <div className="pan2-sezione">
      <button className="pan2-riga-apri" aria-expanded={aperta} onClick={() => setAperta((v) => !v)}>
        {aperta ? '▾' : '▸'} Finite: {schede.length}
      </button>
      {aperta ? (
        <div className="pan2-finite">
          {schede.map((s) => (
            <button key={s.id} className="pan2-finita" disabled={s.paneId === undefined} onClick={() => { if (s.paneId !== undefined) onApri(s.paneId) }} title={s.ultimaAzione !== '' ? s.ultimaAzione : s.titolo}>
              <Pallino stato={s.stato} />
              <span className="pan2-finita__ruolo">{s.nomeRuolo ?? CHAT_GENERICA}</span>
              <span className="pan2-finita__titolo">{s.titolo.replace(/^[^·]+ · /, '')}</span>
              <span className="pan2-scheda__quando">{daQuanto(s.dal, ora)}</span>
              {s.paneId !== undefined ? <span aria-hidden>›</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Senza autopilota: il primo messaggio all'autopilota del workspace (0.74.1;
 * 30/10: nasce con questo messaggio, nella cartella delle chat del workspace).
 */
export function PrimoMessaggio({ workspace, cwd, onRicarica }: { workspace: string; cwd?: string; onRicarica: () => void }): React.JSX.Element {
  const [primo, setPrimo] = useState('')
  const [nota, setNota] = useState<string | undefined>(undefined)
  const campo = useRef<HTMLTextAreaElement | null>(null)
  const manda = (): void => {
    const testo = primo.trim()
    if (testo === '' || cwd === undefined) return
    setNota('Lo mando…')
    void window.gestore.autopilota
      .crea({ obiettivo: testo, cwd, workspace })
      // Appena nato adotta le chat che c'erano già nel workspace (0.78.0): le conosce, non le tocca.
      .then((nato) => { void window.gestore.adozione.adotta(nato.id).catch(() => undefined); setPrimo(''); setNota(undefined); onRicarica() })
      .catch((e: unknown) => setNota(`Non è partito: ${String(e)}`))
  }
  return (
    <div className="elenco-ws__autopilota">
      <b>Autopilota di «{workspace}»</b>
      {cwd === undefined ? (
        <div className="progetti__quieto">Apri una chat in questo workspace: l’autopilota lavora nella sua cartella e nasce con il primo messaggio che gli scrivi.</div>
      ) : (
        <>
          <div className="progetti__quieto">Aspetta il tuo primo messaggio.</div>
          <textarea ref={campo} className="campo" rows={4} value={primo} onChange={(e) => setPrimo(e.target.value)} placeholder="Scrivigli cosa fare: lo mette in coda e comincia" />
          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button className="tasto" disabled={primo.trim() === ''} onClick={manda}>Manda</button>
            <TastoMicrofono campo={campo} />
          </span>
        </>
      )}
      {nota !== undefined ? <div className="progetti__quieto">{nota}</div> : null}
    </div>
  )
}

/** Ogni quanto si rileggono i segnali delle chat al lavoro, oltre che a ogni segnale nuovo. */
const SEGNALI_OGNI_MS = 5000

/**
 * Gli ultimi segnali di queste sessioni (0.79.0), riletti ogni 5 secondi e a
 * ogni segnale nuovo, con mezzo secondo di quiete: in un turno pieno arrivano
 * a raffica (revisione ECC).
 */
function useSegnaliDi(sessioni: string[]): Record<string, Segnale[]> {
  const [segnali, setSegnali] = useState<Record<string, Segnale[]>>({})
  const chiave = sessioni.join('|')
  useEffect(() => {
    if (sessioni.length === 0) { setSegnali({}); return }
    let vivo = true
    const leggi = (): void => { window.gestore.segnali.di(sessioni).then((s) => { if (vivo) setSegnali(s) }).catch(() => undefined) }
    leggi()
    const t = setInterval(leggi, SEGNALI_OGNI_MS)
    let attesa: ReturnType<typeof setTimeout> | undefined
    let toglie: (() => void) | undefined
    try {
      toglie = window.gestore.segnali.suStato((f) => {
        if (!sessioni.includes(f.sessione)) return
        if (attesa !== undefined) clearTimeout(attesa)
        attesa = setTimeout(leggi, 500)
      })
    } catch { /* finestra senza segnali */ }
    return () => { vivo = false; clearInterval(t); if (attesa !== undefined) clearTimeout(attesa); toglie?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chiave])
  return segnali
}
