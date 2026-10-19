import { useEffect, useState, type RefObject } from 'react'
import { SPIEGA_DETTATURA, type StatoDettatura } from '@shared/dettatura'
import { Aiuto } from './Aiuto'

/** Lo stato della dettatura si chiede una volta sola per finestra: il registro non cambia ogni secondo. */
let statoInCorso: Promise<StatoDettatura> | undefined
const leggiStato = (): Promise<StatoDettatura> => (statoInCorso ??= window.gestore.dettatura.stato().catch(() => ({ disponibile: true as const })))

/**
 * Il tasto 🎤 accanto a un campo (0.75.0): mette il cursore in fondo al campo
 * e apre la dettatura di Windows. Il testo dettato compare nel campo mentre
 * parli; **non manda niente**: «Manda» lo premi tu.
 */
export function TastoMicrofono({ campo }: { campo: RefObject<HTMLTextAreaElement | null> }): React.JSX.Element {
  const [stato, setStato] = useState<StatoDettatura | undefined>(undefined)
  const [nota, setNota] = useState<{ messaggio: string; comeAttivare?: string } | undefined>(undefined)
  useEffect(() => { let vivo = true; void leggiStato().then((s) => { if (vivo) setStato(s) }); return () => { vivo = false } }, [])

  if (stato !== undefined && !stato.disponibile) {
    return (
      <span className="microfono microfono--no con-aiuto">
        <button className="tasto tasto--mini" disabled title={stato.motivo}>🎤</button>
        <span className="microfono__nota">dettatura non disponibile su questo PC</span>
        <Aiuto di="dettatura non disponibile">{stato.motivo} {stato.comeAttivare}</Aiuto>
      </span>
    )
  }
  return (
    <span className="microfono con-aiuto">
      <button
        className="tasto tasto--mini"
        title="Detta con la voce (italiano): il testo compare nel campo, poi lo mandi tu"
        aria-label="Detta con il microfono"
        onClick={() => {
          const t = campo.current
          if (t !== null) {
            t.focus()
            t.setSelectionRange(t.value.length, t.value.length)
          }
          setNota(undefined)
          void window.gestore.dettatura.apri().then((e) => {
            if (!e.ok) setNota({ messaggio: e.messaggio ?? 'Dettatura non disponibile su questo PC.', ...(e.comeAttivare !== undefined ? { comeAttivare: e.comeAttivare } : {}) })
            // Il fuoco resta nel campo: è lì che Windows scrive.
            campo.current?.focus()
          })
        }}
      >🎤</button>
      {nota !== undefined ? <span className="microfono__nota">{nota.messaggio}</span> : null}
      <Aiuto di="la dettatura con il microfono">{nota?.comeAttivare !== undefined ? `${nota.comeAttivare} ` : ''}{SPIEGA_DETTATURA}</Aiuto>
    </span>
  )
}
