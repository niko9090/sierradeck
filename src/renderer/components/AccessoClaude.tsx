import { useState } from 'react'
import { AIUTO_ACCESSO_CLAUDE, coloreStatoAccesso, testoStatoAccesso } from '@shared/accesso-claude-vista'
import { rinnovaAccessoClaude, useAccessoClaude } from '../accesso-claude'
import { Aiuto } from './Aiuto'

const COLORE = { verde: 'var(--verde)', ambra: 'var(--ambra)', rosso: 'var(--rosso)', quieto: 'var(--testo-quieto)' } as const

/**
 * Il tasto «Rinnova l'accesso a Claude» (16/11): apre la finestra di
 * PowerShell, e dice in una riga com'è andata.
 */
export function TastoRinnovaAccesso({ primario = false }: { primario?: boolean }): React.JSX.Element {
  const [inCorso, setInCorso] = useState(false)
  const [nota, setNota] = useState<string | undefined>(undefined)
  const premi = (): void => {
    setInCorso(true)
    setNota(undefined)
    void rinnovaAccessoClaude()
      .then((e) => setNota(e.ok ? 'Finestra aperta: approva nel browser.' : `Non si apre: ${e.messaggio}`))
      .finally(() => setInCorso(false))
  }
  return (
    <span>
      <button className={`tasto${primario ? ' tasto--primario' : ''}`} disabled={inCorso} onClick={premi}>Rinnova l’accesso a Claude</button>
      {nota !== undefined ? <span className="impostazioni__nota" role="status"> {nota}</span> : null}
    </span>
  )
}

/** La riga «Accesso a Claude» nelle impostazioni: lo stato in breve, il tasto, il «?». */
export function RigaAccessoClaude(): React.JSX.Element {
  const s = useAccessoClaude()
  const daRinnovare = s !== undefined && s.stato !== 'valido'
  return (
    <div className="impostazioni__riga">
      <span className="con-aiuto">Accesso a Claude<Aiuto di="Accesso a Claude">{AIUTO_ACCESSO_CLAUDE}</Aiuto>
        <span className="impostazioni__nota" style={{ display: 'block', color: COLORE[coloreStatoAccesso(s)] }}>{testoStatoAccesso(s)}</span>
      </span>
      <TastoRinnovaAccesso primario={daRinnovare} />
    </div>
  )
}
