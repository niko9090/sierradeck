import { useEffect, useRef, useState } from 'react'
import type { Autopilota } from '@shared/autopilota'
import type { Conversazione } from '@shared/domande-conversazioni'
import type { Dormiente } from '@shared/migrazione-elenco'
import {
  adessoEFinite, colonnePiano, daQuanto, linguetteVisibili, pianoAutopilota, SIMBOLO_STATO, situazioneAutopilota,
  type CompitoPiano, type SchedaChat, type StatoScheda
} from '@shared/panoramica'
import { CHAT_GENERICA } from '@shared/adozione'
import { RUOLI, type Ruolo } from '@shared/ruoli-agenti'
import { ChatAutopilota } from './ChatAutopilota'
import { DomandeALato } from './DomandeALato'
import { Aiuto } from './Aiuto'
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
  /** Ha una domanda breve nella colonna di destra. */
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

const COLORE: Record<string, string> = { blu: 'var(--blu)', viola: 'var(--viola, #a78bfa)', verde: 'var(--verde)', ambra: 'var(--ambra)', rosso: 'var(--rosso)', quieto: 'var(--testo-quieto)' }
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
      <span className="pan-linguetta__nome">{s.nomeRuolo !== undefined ? `${s.nomeRuolo} · ` : ''}{s.titolo.replace(/^[^·]+ · /, '').slice(0, 18)}</span>
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
          <button className="pan-linguetta" aria-expanded={altreAperte} onClick={() => setAltreAperte((v) => !v)}>Altre ({altre.length}) ▾</button>
          {altreAperte ? <div className="pan-altre__menu" role="menu">{altre.map(tasto)}</div> : null}
        </span>
      ) : null}
      <span style={{ flex: 1 }} />
      {conAutopilota && linguetta !== PANORAMICA ? (
        <button className="tasto tasto--mini" aria-pressed={colonna} onClick={() => onColonna(!colonna)} title="Apre o chiude la colonna dell'autopilota">
          {colonna ? '⟨ Autopilota' : 'Autopilota ⟩'}
        </button>
      ) : null}
      <button className="tasto tasto--mini" onClick={onMosaico} title="Torna ai riquadri affiancati">Mosaico</button>
    </div>
  )
}

/**
 * Il corpo della Panoramica 2 (0.78.0). Nicholas sulla 0.77.0: «puoi fare
 * meglio». Rivista da un agente UI/UX prima del codice:
 * - in alto la situazione: obiettivo su 2 righe («Mostra tutto»), stato
 *   coerente con i criteri, barra a segmenti dei criteri con l'elenco al clic;
 * - a sinistra solo la conversazione con l'autopilota; gli eventi tecnici in
 *   «Cosa è successo ▸», chiuso;
 * - al centro «Adesso» (solo chi lavora o aspetta te), il «Piano» a colonne,
 *   le altre chat del workspace («Chat», anche quelle adottate), «Finite: N ▸»;
 * - a destra le domande, solo se ci sono.
 * In ogni workspace, anche senza autopilota (c-30): le chat esistenti sono schede.
 */
export function CorpoPanoramica({ workspace, autopilota, dormiente, schede, domande, paneDiSessione, onApri, onRicarica, onRisposto, onSoloMia }: {
  workspace: string
  autopilota?: Autopilota
  dormiente?: Dormiente
  schede: SchedaVista[]
  domande: Conversazione[]
  /** Il riquadro aperto di una conversazione: per aprire la chat di un compito. */
  paneDiSessione: (sessione: string) => string | undefined
  onApri: (paneId: string) => void
  onRicarica: () => void
  onRisposto: () => void
  onSoloMia: (s: SchedaVista, si: boolean) => void
}): React.JSX.Element {
  const ora = Date.now()
  const { adesso, finite } = adessoEFinite(schede)
  // Le chat che non lavorano: quelle del workspace (anche adottate) nella sezione «Chat»,
  // quelle dell'autopilota (specialisti, la sua chat) in «Finite: N ▸».
  const chat = finite.filter((s) => s.specialista !== true)
  const finiteAp = finite.filter((s) => s.specialista === true)
  const piano = autopilota !== undefined ? colonnePiano(pianoAutopilota(autopilota)) : []
  const compiti = piano.reduce((n, c) => n + c.compiti.length, 0)
  const conDomande = domande.length > 0
  return (
    <div className={`pan-corpo pan2${conDomande ? ' pan2--domande' : ''}`} aria-label={`Panoramica di ${workspace}`}>
      <Situazione workspace={workspace} {...(autopilota !== undefined ? { autopilota } : {})} chat={schede.length} ora={ora} />
      <section className="pan2-dialogo" aria-label="Conversazione con l’autopilota">
        {autopilota !== undefined ? (
          <ChatAutopilota autopilota={autopilota} onCambiato={onRicarica} soloConversazione />
        ) : (
          <PrimoMessaggio workspace={workspace} dormiente={dormiente} onRicarica={onRicarica} />
        )}
      </section>
      <section className="pan2-centro" aria-label="Il lavoro del workspace">
        <div className="pan2-sezione">
          <div className="serigrafia" aria-live="polite">Adesso · {adesso.length}</div>
          {adesso.length === 0 ? (
            <p className="pan2-vuoto">Nessuna chat al lavoro.</p>
          ) : (
            <div className="pan2-adesso">
              {adesso.map((s) => <SchedaAdesso key={s.id} s={s} ora={ora} onApri={onApri} onSoloMia={onSoloMia} />)}
            </div>
          )}
        </div>
        {autopilota !== undefined && compiti > 0 ? (
          <div className="pan2-sezione">
            <div className="serigrafia">Piano · {compiti} compiti</div>
            <div className="pan2-piano" role="list">
              {piano.map((c) => (
                <div key={c.fase} className={`pan2-colonna pan2-colonna--${c.fase}`} role="listitem" aria-label={`${c.nome}: ${c.compiti.length}`}>
                  <div className="pan2-colonna__testa">{c.nome} <span>{c.compiti.length}</span></div>
                  <div className="pan2-colonna__corpo">
                    {c.compiti.map((x) => <CompitoVista key={x.id} c={x} pane={x.sessione !== undefined ? paneDiSessione(x.sessione) : undefined} onApri={onApri} />)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {chat.length > 0 ? (
          <div className="pan2-sezione">
            <div className="serigrafia">Chat · {chat.length}</div>
            <div className="pan2-chat">
              {chat.map((s) => <SchedaChatFerma key={s.id} s={s} ora={ora} onApri={onApri} onSoloMia={onSoloMia} />)}
            </div>
          </div>
        ) : null}
        {finiteAp.length > 0 ? <Finite schede={finiteAp} ora={ora} onApri={onApri} /> : null}
        {schede.length === 0 && compiti === 0 ? (
          <p className="pan2-vuoto">Nessuna chat. L’autopilota le apre quando serve; puoi anche aprirne una con «+ Nuova chat».</p>
        ) : null}
      </section>
      {conDomande ? (
        <section className="pan2-domande" aria-label="Domande">
          <DomandeALato conversazioni={domande} onRisposto={onRisposto} />
        </section>
      ) : null}
    </div>
  )
}

const LETTERA_RUOLO: Record<Ruolo, string> = { sviluppo: 'S', interfaccia: 'I', collaudo: 'C', revisione: 'R', rilascio: 'L' }

function PillolaRuolo({ ruolo, nome }: { ruolo?: Ruolo; nome?: string }): React.JSX.Element {
  const r = ruolo !== undefined ? RUOLI[ruolo] : undefined
  const testo = nome ?? r?.nome ?? CHAT_GENERICA
  return (
    <span className="pan2-ruolo" style={{ color: r !== undefined ? COLORE[r.colore] : 'var(--testo-quieto)', borderColor: r !== undefined ? COLORE[r.colore] : 'var(--bordo)' }}>
      <b aria-hidden>{ruolo !== undefined ? LETTERA_RUOLO[ruolo] : '·'}</b>{testo}
    </span>
  )
}

/** In alto: obiettivo su 2 righe, stato coerente, barra dei criteri con l'elenco al clic. */
function Situazione({ workspace, autopilota, chat, ora }: { workspace: string; autopilota?: Autopilota; chat: number; ora: number }): React.JSX.Element {
  const [tutto, setTutto] = useState(false)
  const [criteriAperti, setCriteriAperti] = useState(false)
  // «Mostra tutto» solo se l'obiettivo non sta nelle 2 righe (prova del 16/10: compariva anche quando ci stava).
  const testo = useRef<HTMLDivElement | null>(null)
  const [tagliato, setTagliato] = useState(false)
  useEffect(() => {
    const el = testo.current
    if (el === null) return
    const misura = (): void => setTagliato(el.scrollHeight > el.clientHeight + 2)
    misura()
    const ro = new ResizeObserver(misura)
    ro.observe(el)
    return () => ro.disconnect()
  })
  if (autopilota === undefined) {
    return (
      <header className="pan2-situazione">
        <div className="pan2-obiettivo">Workspace «{workspace}»: {chat === 1 ? 'una chat' : `${chat} chat`}. Il suo autopilota aspetta il tuo primo messaggio, a sinistra.</div>
      </header>
    )
  }
  const s = situazioneAutopilota(autopilota, ora)
  return (
    <header className="pan2-situazione">
      <div ref={testo} className={`pan2-obiettivo${tutto ? ' pan2-obiettivo--tutto' : ''}`} title={s.obiettivo}>{s.obiettivo}</div>
      {tagliato || tutto ? <button className="collegamento pan2-tutto" onClick={() => setTutto((v) => !v)}>{tutto ? 'Meno' : 'Mostra tutto'}</button> : null}
      <div className="pan2-stato">
        <span className="pan2-stato__parola" style={{ color: COLORE[s.stato.colore] ?? 'var(--testo)' }} title={s.stato.ragione}>
          {s.stato.simbolo} {s.stato.parola}
        </span>
        {s.stato.id === 'da-verificare' ? <span className="pan2-stato__perche">dice finito · criteri {s.criteri.testo}</span> : null}
        {s.criteri.totali > 0 ? (
          <span className="pan2-criteri">
            <button className="pan2-criteri__tasto" aria-expanded={criteriAperti} onClick={() => setCriteriAperti((v) => !v)} title="I criteri di fine, uno per uno">
              <span className="pan2-barra" aria-hidden>
                {s.criteri.elenco.map((c, i) => <i key={i} className={`pan2-barra__pezzo pan2-barra__pezzo--${c.esito}`} />)}
              </span>
              Criteri {s.criteri.testo} {criteriAperti ? '▾' : '▸'}
            </button>
            {criteriAperti ? (
              <div className="pan2-criteri__elenco" role="dialog" aria-label="Criteri di fine">
                {s.criteri.elenco.map((c, i) => (
                  <div key={i} className={`pan2-criterio pan2-criterio--${c.esito}`}>
                    <span className="pan2-criterio__segno" aria-label={c.esito === 'si' ? 'soddisfatto' : c.esito === 'no' ? 'non soddisfatto' : 'mai controllato'}>{c.esito === 'si' ? '✓' : c.esito === 'no' ? '✗' : '○'}</span>
                    <span className="pan2-criterio__testo">
                      <span className="pan2-criterio__descr">{c.descrizione}</span>
                      <span className="pan2-criterio__quando">{c.quando !== undefined ? `controllato alle ${orario(c.quando)}` : 'mai controllato'}{c.prova !== undefined ? ` · ${c.prova}` : ''}</span>
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </span>
        ) : <span className="pan2-stato__perche">nessun criterio di fine</span>}
        <Aiuto di="la Panoramica">In alto la situazione: l’obiettivo, lo stato (dice «finito» solo se tutti i criteri sono soddisfatti) e i criteri; tocca la barra per vederli uno per uno. A sinistra parli con l’autopilota; quello che ha fatto da solo è in «Cosa è successo». Al centro: «Adesso» le chat al lavoro o che aspettano te, il «Piano» con i compiti e chi li fa, le altre chat del workspace, le finite. Tocca una scheda o un compito per aprire la sua chat. «Solo mia» su una chat: l’autopilota non la tocca e non le scrive.</Aiuto>
      </div>
    </header>
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

function CompitoVista({ c, pane, onApri }: { c: CompitoPiano; pane?: string; onApri: (p: string) => void }): React.JSX.Element {
  const dentro = (
    <>
      <span className="pan2-compito__chi">
        <PillolaRuolo {...(c.ruolo !== undefined ? { ruolo: c.ruolo } : {})} {...(c.ruolo === undefined ? { nome: 'da assegnare' } : {})} />
        {c.autore !== undefined ? <span className="pan2-compito__di">di {RUOLI[c.autore].nome}</span> : null}
        {c.giri !== undefined ? <span className="pan2-compito__giri" title={`Rimandato indietro dalla Revisione ${c.giri} volte`}>↺ {c.giri}</span> : null}
      </span>
      <span className="pan2-compito__testo">{c.testo}</span>
      {c.nota !== undefined ? <span className="pan2-compito__nota">{c.nota}</span> : null}
      {pane !== undefined ? <span className="pan2-compito__apri" aria-hidden>Apri ›</span> : c.fase !== 'da-fare' ? <span className="pan2-compito__nota">chat chiusa</span> : null}
    </>
  )
  return pane !== undefined
    ? <button className={`pan2-compito pan2-compito--${c.fase}`} title={c.testo} onClick={() => onApri(pane)}>{dentro}</button>
    : <div className={`pan2-compito pan2-compito--${c.fase} pan2-compito--chiuso`} title={c.testo}>{dentro}</div>
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

/** Solo l'ora, per i criteri. */
function orario(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

/** Senza autopilota: il primo messaggio dell'autopilota dormiente del workspace (0.74.1). */
function PrimoMessaggio({ workspace, dormiente, onRicarica }: { workspace: string; dormiente?: Dormiente; onRicarica: () => void }): React.JSX.Element {
  const [primo, setPrimo] = useState('')
  const [nota, setNota] = useState<string | undefined>(undefined)
  const campo = useRef<HTMLTextAreaElement | null>(null)
  if (dormiente?.cwd === undefined) return <p className="progetti__quieto">Nessun autopilota in questo workspace: le chat compaiono qui come schede.</p>
  const sveglia = (): void => {
    const testo = primo.trim()
    if (testo === '') return
    setNota('Lo preparo…')
    void window.gestore.autopilota
      .crea({ nome: workspace, obiettivo: testo, cwd: dormiente.cwd!, criteri: [], pubblicazione: 'stabile', workspace, partenza: 'via' })
      // Appena nato adotta le chat che c'erano già nel workspace (0.78.0): le conosce, non le tocca.
      .then((nato) => { void window.gestore.adozione.adotta(nato.id).catch(() => undefined); setPrimo(''); setNota(undefined); onRicarica() })
      .catch((e: unknown) => setNota(`Non è partito: ${String(e)}`))
  }
  return (
    <div className="elenco-ws__autopilota">
      <b>Autopilota di «{workspace}»</b>
      <div className="progetti__quieto">Aspetta il tuo primo messaggio.</div>
      <textarea ref={campo} className="campo" rows={4} value={primo} onChange={(e) => setPrimo(e.target.value)} placeholder="Scrivigli cosa fare: si prepara e aspetta il tuo «Vai»" />
      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button className="tasto" disabled={primo.trim() === ''} onClick={sveglia}>Manda</button>
        <TastoMicrofono campo={campo} />
      </span>
      {nota !== undefined ? <div className="progetti__quieto">{nota}</div> : null}
    </div>
  )
}
