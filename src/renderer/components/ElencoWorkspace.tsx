import type { Autopilota } from '@shared/autopilota'
import { specialistiDi } from '@shared/specialisti'
import { vistaAutopilota } from '@shared/autopiloti-vista'
import { ruoloDalTitolo, type VoceElenco } from '@shared/vista-elenco'
import { Aiuto } from './Aiuto'

const COLORE: Record<string, string> = { blu: 'var(--blu)', viola: 'var(--viola, #a78bfa)', verde: 'var(--verde)', ambra: 'var(--ambra)', rosso: 'var(--rosso)', quieto: 'var(--testo-quieto)' }

/**
 * La colonna della vista a elenco (0.74.0): l'autopilota del workspace con i
 * suoi specialisti, poi le altre chat. Un clic porta quella chat davanti, a
 * destra, grande. Gli specialisti finiti hanno chiuso la loro chat: restano
 * nell'elenco, in grigio, con il loro lavoro nel diario dell'autopilota.
 */
export function ElencoWorkspace({
  workspace, autopiloti, voci, davanti, sessioneDi, onDavanti, onScheda, onMosaico
}: {
  workspace: string
  autopiloti: Autopilota[]
  voci: VoceElenco[]
  davanti: string | undefined
  /** La sessione di ogni riquadro, per trovare quello di uno specialista. */
  sessioneDi: Record<string, string>
  onDavanti: (paneId: string) => void
  onScheda: () => void
  onMosaico: () => void
}): React.JSX.Element {
  const qui = autopiloti.filter((a) => a.workspace === workspace && a.archiviato !== true)
  const paneDiSessione = new Map(Object.entries(sessioneDi).map(([p, s]) => [s, p]))
  const governate = new Set<string>()
  const ora = Date.now()
  const riga = (v: VoceElenco, ruolo: string | undefined, colore: string | undefined, compito?: string): React.JSX.Element => (
    <button
      key={v.paneId}
      className={`elenco-ws__voce${davanti === v.paneId ? ' elenco-ws__voce--davanti' : ''}`}
      onClick={() => onDavanti(v.paneId)}
      title={compito !== undefined && compito !== '' ? `${compito}\n\nPorta questa chat davanti` : 'Porta questa chat davanti'}
    >
      {/* Ferma non è un guasto: pallino quieto, l'ambra solo per chi ti chiede qualcosa. */}
      <span className={`led${v.chiede ? ' led--attesa' : v.lavora ? ' led--lavoro' : ''}`} />
      <span className="elenco-ws__corpo">
        {ruolo !== undefined ? <b style={{ color: colore !== undefined ? COLORE[colore] : undefined }}>{ruolo}</b> : <span className="elenco-ws__titolo">{v.titolo}</span>}
        {compito !== undefined && compito !== '' ? <span className="elenco-ws__compito">{compito}</span> : null}
      </span>
      <span className="elenco-ws__stato">{v.chiede ? 'aspetta te' : v.lavora ? 'al lavoro' : 'ferma'}</span>
    </button>
  )
  return (
    <div className="elenco-ws">
      <div className="elenco-ws__testa">
        <span className="serigrafia con-aiuto">
          Workspace a elenco
          <Aiuto di="la vista a elenco">
            Il workspace è l’ambiente dell’autopilota: a sinistra lui e i suoi specialisti, a destra una chat sola, grande. Tocca una riga per portare davanti quella chat; le altre restano vive dietro. Gli specialisti che hanno finito chiudono la loro chat da soli, e restano qui in grigio. «Mosaico» torna ai riquadri affiancati.
          </Aiuto>
        </span>
        <button className="tasto tasto--mini" onClick={onMosaico} title="Torna ai riquadri affiancati">Mosaico</button>
      </div>
      {qui.length === 0 ? (
        <div className="progetti__quieto elenco-ws__vuoto">
          Nessun autopilota in questo workspace. <button className="collegamento" onClick={onScheda}>Avvia un autopilota</button>
        </div>
      ) : null}
      {qui.map((a) => {
        const v = vistaAutopilota(a, ora)
        const s = specialistiDi(a)
        return (
          <div key={a.id} className="elenco-ws__autopilota">
            <div className="elenco-ws__nome">
              <b>{a.nome !== '' ? a.nome : a.obiettivo.slice(0, 40)}</b>
              <span className={`stato-chat stato-chat--${v.stato.colore}`} title={v.stato.ragione ?? v.stato.parola}>{v.stato.parola}</span>
              <button className="tasto tasto--mini" onClick={onScheda} title="La sua scheda: dialogo, criteri, diario">Scheda</button>
            </div>
            {v.ultima !== '' ? <div className="progetti__quieto elenco-ws__riga" title={v.ultima}>{v.ultima}</div> : null}
            <div className="progetti__quieto elenco-ws__riga">{s.riga}</div>
            {s.elenco.map((x) => {
              const pane = x.sessionId !== undefined ? paneDiSessione.get(x.sessionId) : undefined
              const voce = pane !== undefined ? voci.find((y) => y.paneId === pane) : undefined
              if (voce !== undefined) { governate.add(voce.paneId); return riga(voce, x.ruolo, x.colore, x.compito) }
              return (
                <div key={x.id} className="elenco-ws__voce elenco-ws__voce--chiusa" title={x.ultimaAzione !== '' ? x.ultimaAzione : x.compito}>
                  <span className="led led--finito" />
                  <span className="elenco-ws__corpo">
                    <b style={{ color: COLORE[x.colore] }}>{x.ruolo}</b>
                    {x.compito !== '' ? <span className="elenco-ws__compito">{x.compito}</span> : null}
                  </span>
                  <span className="elenco-ws__stato">{x.stato} · {x.chiusa === true ? 'chat chiusa' : 'non aperta qui'}</span>
                </div>
              )
            })}
          </div>
        )
      })}
      {voci.some((v) => !governate.has(v.paneId)) ? <span className="serigrafia elenco-ws__altre">Altre chat</span> : null}
      {voci.filter((v) => !governate.has(v.paneId)).map((v) => riga(v, ruoloDalTitolo(v.titolo), undefined))}
    </div>
  )
}
