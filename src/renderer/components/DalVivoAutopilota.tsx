import { useEffect, useState } from 'react'
import type { Autopilota } from '@shared/autopilota'
import { haDomandaAperta } from '@shared/chat-autopilota'
import { oraBreve, statoAutopilotaDalVivo, statoMessaggi, type EtichettaDalVivo, type StatoDalVivo, type StatoMessaggio } from '@shared/stato-dal-vivo'
import { Aiuto } from './Aiuto'

/**
 * Si vede sempre chi lavora (0.69.0). Nicholas, 12/10: «io voglio sempre vedere
 * tutto, almeno vedere che stanno lavorando». Una riga: lo stato in quattro
 * parole, da quanto, l'ultima azione; e «nessun segno da 10 min» quando chi è
 * al lavoro non fa niente. Le stesse parole sulla pagina e nell'app.
 */
const COLORE: Record<EtichettaDalVivo, string> = {
  'al lavoro': 'var(--verde, #3fb950)',
  'aspetta te': 'var(--ambra, #d29922)',
  fermo: 'var(--testo-quieto, #8b949e)',
  finito: 'var(--testo-quieto, #8b949e)'
}

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
      <b style={{ color: COLORE[s.etichetta] }}>{s.etichetta}</b>
      {s.da !== '' ? <span className="misura"> · da {s.da}</span> : null}
      {s.senzaSegni !== undefined ? <span style={{ color: 'var(--ambra)' }}> · ⚠ {s.senzaSegni}</span> : null}
      {s.ultimaAzione !== '' ? <span className="misura" title={s.ultimaAzione} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.ultimaAzione}</span> : null}
    </span>
  )
}

/** I messaggi verso la chat, con il loro stato vero e «Manda adesso». */
export function MessaggiVersoLaChat({ autopilota: a, onCambiato }: { autopilota: Autopilota; onCambiato?: () => void }): React.JSX.Element | null {
  const ora = useOra()
  const [esito, setEsito] = useState<string | undefined>(undefined)
  const [inCorso, setInCorso] = useState(false)
  const m = statoMessaggi(a, ora, oraBreve)
  if (m.length === 0) return null
  return (
    <div className="messaggi-chat" style={{ margin: '6px 0', fontSize: 'var(--t1)' }}>
      <div className="serigrafia con-aiuto">Messaggi per la chat
        <Aiuto di="Messaggi per la chat">
          I messaggi tuoi e dell’autopilota per la chat che lavora. Entrano alla fine del turno; se aspettano più di due minuti se ne scrive uno anche durante il turno, e Claude Code lo legge appena può senza interrompere. Mai più di uno per turno: quelli che arrivano dopo partono alla fine, uniti in un messaggio solo. «Manda adesso» non aspetta i due minuti.
        </Aiuto>
      </div>
      {m.map((x) => (
        <div key={`${x.stato}-${x.id}`} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ color: x.stato === 'consegnato' ? 'var(--verde, #3fb950)' : x.stato === 'in attesa' ? 'var(--ambra)' : 'var(--testo-quieto)', whiteSpace: 'nowrap' }}>{x.dettaglio}</span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={x.testo}>{x.testo}</span>
          {x.mandaAdesso === true ? (
            <button className="tasto tasto--mini" disabled={inCorso} onClick={() => {
              setInCorso(true)
              void window.gestore.autopilota.mandaAdesso(a.id)
                .then((r) => { setEsito(r.mandate > 0 ? 'Mandato: entra nella chat adesso.' : (r.messaggio ?? 'Niente da mandare.')); onCambiato?.() })
                .catch((e: unknown) => setEsito(String(e)))
                .finally(() => setInCorso(false))
            }}>Manda adesso</button>
          ) : null}
        </div>
      ))}
      {esito !== undefined ? <div className="misura">{esito}</div> : null}
    </div>
  )
}

/** Lo stato dal vivo già calcolato dal PC dove gira l'autopilota (altri PC). */
export function RigaDalVivoPronta({ dalVivo: s }: { dalVivo: StatoDalVivo | undefined }): React.JSX.Element | null {
  if (s === undefined) return null
  return (
    <span className="dal-vivo" style={{ display: 'block', fontSize: 'var(--t1)' }}>
      <b style={{ color: COLORE[s.etichetta] ?? 'inherit' }}>{s.etichetta}</b>
      {s.da !== '' ? <span className="misura"> · da {s.da}</span> : null}
      {s.senzaSegni !== undefined ? <span style={{ color: 'var(--ambra)' }}> · ⚠ {s.senzaSegni}</span> : null}
      {s.ultimaAzione !== '' ? <span className="misura" title={s.ultimaAzione} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.ultimaAzione}</span> : null}
    </span>
  )
}

/** I messaggi verso la chat già calcolati dal PC remoto, con «Manda adesso» passato da chi li mostra. */
export function MessaggiPronti({ messaggi, onManda, inCorso }: { messaggi: StatoMessaggio[] | undefined; onManda: () => void; inCorso: boolean }): React.JSX.Element | null {
  if (messaggi === undefined || messaggi.length === 0) return null
  return (
    <div className="messaggi-chat" style={{ margin: '6px 0', fontSize: 'var(--t1)' }}>
      <div className="serigrafia">Messaggi per la chat</div>
      {messaggi.map((x) => (
        <div key={`${x.stato}-${x.id}`} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ color: x.stato === 'consegnato' ? 'var(--verde, #3fb950)' : x.stato === 'in attesa' ? 'var(--ambra)' : 'var(--testo-quieto)', whiteSpace: 'nowrap' }}>{x.dettaglio}</span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={x.testo}>{x.testo}</span>
          {x.mandaAdesso === true ? <button className="tasto tasto--mini" disabled={inCorso} onClick={onManda}>Manda adesso</button> : null}
        </div>
      ))}
    </div>
  )
}
