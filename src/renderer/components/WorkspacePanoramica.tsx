import { useEffect, useRef, useState } from 'react'
import type { Autopilota } from '@shared/autopilota'
import type { Conversazione } from '@shared/domande-conversazioni'
import type { Dormiente } from '@shared/migrazione-elenco'
import {
  daQuanto, linguetteVisibili, NOME_GRUPPO, ordinaSchede, riassuntoAutopilota, SIMBOLO_STATO, type SchedaChat, type StatoScheda
} from '@shared/panoramica'
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

/** Il corpo della Panoramica: riga dell'autopilota, dialogo, griglia di schede, domande brevi. */
export function CorpoPanoramica({ workspace, autopilota, dormiente, schede, domande, onApri, onRicarica, onRisposto }: {
  workspace: string
  autopilota?: Autopilota
  dormiente?: Dormiente
  schede: SchedaVista[]
  domande: Conversazione[]
  onApri: (paneId: string) => void
  onRicarica: () => void
  onRisposto: () => void
}): React.JSX.Element {
  const ora = Date.now()
  const r = autopilota !== undefined ? riassuntoAutopilota(autopilota, ora) : undefined
  const gruppi = ordinaSchede(schede)
  return (
    <div className="pan-corpo" aria-label={`Panoramica di ${workspace}`}>
      {r !== undefined ? (
        <div className="pan-riga">
          <b className="pan-riga__obiettivo" title={autopilota?.obiettivo}>{r.obiettivo}</b>
          <span className="stato-chat" style={{ color: COLORE[r.stato.colore] ?? 'var(--testo)' }}>{r.stato.parola}</span>
          <span className="pan-riga__criteri" title="Criteri soddisfatti su quelli totali">Criteri {r.criteri.testo}</span>
          <Aiuto di="la Panoramica">La prima linguetta è la Panoramica del progetto: a sinistra parli con l’autopilota, al centro una scheda per chat (prima quelle che aspettano te), a destra le domande brevi. Tocca una scheda per aprire la sua chat a tutta larghezza; «Panoramica» torna qui.</Aiuto>
        </div>
      ) : null}
      <div className="pan-tre">
        <section className="pan-dialogo" aria-label="Dialogo con l’autopilota">
          {autopilota !== undefined ? (
            <ChatAutopilota autopilota={autopilota} onCambiato={onRicarica} />
          ) : (
            <PrimoMessaggio workspace={workspace} dormiente={dormiente} onRicarica={onRicarica} />
          )}
        </section>
        <section className="pan-griglia-zona" aria-label="Le chat del workspace">
          {schede.length === 0 ? (
            <p className="progetti__quieto">Nessuna chat. L’autopilota le apre quando serve; puoi anche aprirne una con «+ Nuova chat».</p>
          ) : gruppi.map((g) => (
            <div key={g.gruppo} className="pan-gruppo">
              <div className="serigrafia">{NOME_GRUPPO[g.gruppo]} · {g.schede.length}</div>
              <div className="pan-griglia">
                {g.schede.map((s) => (
                  <button
                    key={s.id}
                    className={`pan-scheda pan-scheda--${s.stato}`}
                    disabled={s.paneId === undefined}
                    onClick={() => { if (s.paneId !== undefined) onApri(s.paneId) }}
                    title={s.paneId === undefined ? 'Ha finito e ha chiuso la sua chat: il lavoro è nel diario dell’autopilota' : 'Apri questa chat a tutta larghezza'}
                  >
                    <span className="pan-scheda__testa">
                      <Pallino stato={s.stato} />
                      {s.nomeRuolo !== undefined ? <b style={{ color: s.coloreRuolo !== undefined ? COLORE[s.coloreRuolo] : undefined }}>{s.nomeRuolo}</b> : <b>chat</b>}
                      <span className="pan-scheda__titolo">{s.titolo.replace(/^[^·]+ · /, '')}</span>
                      <span className="pan-scheda__quando">{s.suPc !== undefined ? `su ${s.suPc}` : daQuanto(s.dal, ora)}</span>
                    </span>
                    <span className="pan-scheda__azione">{s.domanda === true ? 'Ti chiede ↗ (a destra)' : s.ultimaAzione}</span>
                    <span className="pan-scheda__righe">{s.righe.map((x, i) => <span key={i}>{x}</span>)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
        <section className="pan-domande" aria-label="Domande brevi">
          {domande.length === 0 ? <p className="progetti__quieto" style={{ fontSize: 12 }}>Nessuna domanda.</p> : <DomandeALato conversazioni={domande} onRisposto={onRisposto} />}
        </section>
      </div>
    </div>
  )
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
      .then(() => { setPrimo(''); setNota(undefined); onRicarica() })
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
