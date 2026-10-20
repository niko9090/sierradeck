import { useEffect, useState } from 'react'
import type { Autopilota } from '@shared/autopilota'
import { haDomandaAperta } from '@shared/chat-autopilota'
import { COLORE_DAL_VIVO, messaggiCompatti, oraBreve, statoAutopilotaDalVivo, statoMessaggi, type EtichettaDalVivo, type StatoDalVivo, type StatoMessaggio } from '@shared/stato-dal-vivo'
import type { Colore } from '@shared/stato-vista'
import { Aiuto } from './Aiuto'
import { adessoDi, AIUTO_ADESSO, COLORE_ADESSO, type SegniDalVivo } from '@shared/adesso'

/**
 * Si vede sempre chi lavora (0.69.0). Nicholas, 12/10: «io voglio sempre vedere
 * tutto, almeno vedere che stanno lavorando». Una riga: lo stato in quattro
 * parole, da quanto, l'ultima azione; e «nessun segno da 10 min» quando chi è
 * al lavoro non fa niente. Le stesse parole sulla pagina e nell'app.
 */
const TINTA: Record<Colore, string> = {
  verde: 'var(--verde, #3fb950)',
  ambra: 'var(--ambra, #d29922)',
  rosso: 'var(--rosso, #dc5f5f)',
  blu: 'var(--blu, #4aa3ff)',
  quieto: 'var(--testo-quieto, #8b949e)'
}
const COLORE = (e: EtichettaDalVivo): string => TINTA[COLORE_DAL_VIVO[e]]

/** Il tempo passa anche se l'autopilota non cambia: si ridisegna ogni mezzo minuto. */
function useOra(): number {
  const [ora, setOra] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setOra(Date.now()), 30_000); return () => clearInterval(t) }, [])
  return ora
}

const segno = (a: Autopilota): number | undefined => {
  const t = Date.parse((a as unknown as { ultimoSegno?: string }).ultimoSegno ?? '')
  return Number.isNaN(t) ? undefined : t
}

export function RigaDalVivo({ autopilota: a }: { autopilota: Autopilota }): React.JSX.Element {
  const ora = useOra()
  const d = haDomandaAperta(a)
  const s = statoAutopilotaDalVivo({ ...a, ...(d !== undefined ? { domanda: d } : {}) }, ora, segno(a))
  return (
    <span className="dal-vivo" style={{ display: 'block', fontSize: 'var(--t1)' }}>
      <b style={{ color: COLORE(s.etichetta) }}>{s.etichetta}</b>
      {s.da !== '' ? <span className="misura"> · da {s.da}</span> : null}
      {s.senzaSegni !== undefined ? <span style={{ color: 'var(--ambra)' }}> · ⚠ {s.senzaSegni}</span> : null}
      {s.ultimaAzione !== '' ? <span className="misura" title={s.ultimaAzione} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.ultimaAzione}</span> : null}
    </span>
  )
}

/**
 * I messaggi verso la chat (0.72.1): una spunta ✓ per ogni messaggio arrivato
 * (l'ora e il testo nel tooltip), un puntino per quello in consegna, e **una
 * riga sola**, solo se qualcosa è fermo: «in attesa da N min» con «Manda adesso».
 */
function MessaggiCompattiVista({ messaggi, onManda, inCorso, esito, aiuto }: {
  messaggi: StatoMessaggio[]
  onManda: () => void
  inCorso: boolean
  esito?: string | undefined
  aiuto?: boolean
}): React.JSX.Element | null {
  const c = messaggiCompatti(messaggi)
  if (c.segni.length === 0 && c.fermo === undefined) return null
  return (
    <div className="messaggi-chat" style={{ margin: '6px 0', fontSize: 'var(--t1)' }}>
      <div className="messaggi-segni">
        <span className="serigrafia con-aiuto" style={{ marginRight: 4 }}>Messaggi per la chat
          {aiuto === true ? (
            <Aiuto di="Messaggi per la chat">
              Ogni ✓ è un messaggio tuo o dell’autopilota arrivato alla chat: passaci sopra per l’ora e il testo. Entrano alla fine del turno; se aspettano più di due minuti se ne scrive uno anche durante il turno, mai più di uno: gli altri partono alla fine, uniti. Se uno è fermo compare la sua riga con «Manda adesso», che non aspetta i due minuti.
            </Aiuto>
          ) : null}
        </span>
        {c.segni.map((s) => (
          <span key={s.id} className={`messaggi-segni__segno${s.tipo === 'in consegna' ? ' messaggi-segni__segno--volo' : ''}`} title={s.titolo} aria-label={s.titolo}>
            {s.tipo === 'consegnato' ? '✓' : '⋯'}
          </span>
        ))}
      </div>
      {c.fermo !== undefined ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginTop: 4 }}>
          <span style={{ color: 'var(--ambra)', whiteSpace: 'nowrap' }}>{c.fermo.dettaglio}{c.fermo.quanti > 1 ? ` · ${c.fermo.quanti} messaggi` : ''}</span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.fermo.testo}>{c.fermo.testo}</span>
          {c.fermo.mandaAdesso ? <button className="tasto tasto--mini" disabled={inCorso} onClick={onManda}>Manda adesso</button> : null}
        </div>
      ) : null}
      {esito !== undefined ? <div className="misura">{esito}</div> : null}
    </div>
  )
}

/** I messaggi verso la chat, con il loro stato vero e «Manda adesso». */
export function MessaggiVersoLaChat({ autopilota: a, onCambiato }: { autopilota: Autopilota; onCambiato?: () => void }): React.JSX.Element | null {
  const ora = useOra()
  const [esito, setEsito] = useState<string | undefined>(undefined)
  const [inCorso, setInCorso] = useState(false)
  return (
    <MessaggiCompattiVista
      messaggi={statoMessaggi(a, ora, oraBreve)}
      inCorso={inCorso}
      esito={esito}
      aiuto
      onManda={() => {
        setInCorso(true)
        void window.gestore.autopilota.mandaAdesso(a.id)
          .then((r) => { setEsito(r.mandate > 0 ? 'Mandato: entra nella chat adesso.' : (r.messaggio ?? 'Niente da mandare.')); onCambiato?.() })
          .catch((e: unknown) => setEsito(String(e)))
          .finally(() => setInCorso(false))
      }}
    />
  )
}

/** Lo stato dal vivo già calcolato dal PC dove gira l'autopilota (altri PC). */
export function RigaDalVivoPronta({ dalVivo: s }: { dalVivo: StatoDalVivo | undefined }): React.JSX.Element | null {
  if (s === undefined) return null
  return (
    <span className="dal-vivo" style={{ display: 'block', fontSize: 'var(--t1)' }}>
      <b style={{ color: (COLORE_DAL_VIVO[s.etichetta] !== undefined ? COLORE(s.etichetta) : 'inherit') }}>{s.etichetta}</b>
      {s.da !== '' ? <span className="misura"> · da {s.da}</span> : null}
      {s.senzaSegni !== undefined ? <span style={{ color: 'var(--ambra)' }}> · ⚠ {s.senzaSegni}</span> : null}
      {s.ultimaAzione !== '' ? <span className="misura" title={s.ultimaAzione} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.ultimaAzione}</span> : null}
    </span>
  )
}

/** I messaggi verso la chat già calcolati dal PC remoto, con «Manda adesso» passato da chi li mostra. */
export function MessaggiPronti({ messaggi, onManda, inCorso }: { messaggi: StatoMessaggio[] | undefined; onManda: () => void; inCorso: boolean }): React.JSX.Element | null {
  if (messaggi === undefined || messaggi.length === 0) return null
  return <MessaggiCompattiVista messaggi={messaggi} onManda={onManda} inCorso={inCorso} />
}

/**
 * Il riquadro «Adesso» (0.81.0): una riga per chat, cosa fa, da quanto, e se è
 * ferma perché. Le righe le calcola `adessoDi`, la stessa della pagina e dell'app.
 */
export function AdessoAutopilota({ autopilota: a, dentro = false, soloFerme = false }: {
  autopilota: Autopilota
  /** Dentro la sezione «Adesso» della Panoramica: senza titolo, ce l'ha già. */
  dentro?: boolean
  /** Solo le chat ferme: sotto le schede delle finestre, il resto lo dicono loro. */
  soloFerme?: boolean
}): React.JSX.Element | null {
  const ora = useOra()
  const tutto = adessoDi(a as Autopilota & SegniDalVivo, ora)
  const righe = soloFerme ? tutto.righe.filter((r) => r.tono === 'ferma') : tutto.righe
  const finite = soloFerme ? 0 : tutto.finite
  if (righe.length === 0 && finite === 0) return null
  return (
    <div className={`adesso-ap${dentro ? ' adesso-ap--dentro' : ''}`} aria-label="Adesso">
      {dentro ? null : <span className="serigrafia con-aiuto">Adesso<Aiuto di="il riquadro Adesso">{AIUTO_ADESSO}</Aiuto></span>}
      {righe.map((r) => (
        <div key={r.id} className={`adesso-ap__riga adesso-ap__riga--${r.tono}`}>
          <b style={{ color: TINTA[COLORE_ADESSO[r.tono]] }}>{r.chi}</b>
          <span className="adesso-ap__compito" title={r.compito}>{r.compito}</span>
          <span className="adesso-ap__testo" style={{ color: r.tono === 'lavoro' ? undefined : TINTA[COLORE_ADESSO[r.tono]] }}>{r.testo}</span>
        </div>
      ))}
      {finite > 0 ? <div className="adesso-ap__finite">{finite === 1 ? '1 chat finita' : `${finite} chat finite`}</div> : null}
    </div>
  )
}
