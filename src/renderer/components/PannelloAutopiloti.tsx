import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'
import { TendinaMenu } from './TendinaMenu'
import { SpecialistiVista } from './SpecialistiVista'
import { ChatAutopilota } from './ChatAutopilota'
import { PrimoMessaggio } from './WorkspacePanoramica'
import { Aiuto } from './Aiuto'
import { ordinaAutopiloti, vistaAutopilota } from '@shared/autopiloti-vista'
import { haDomandaAperta } from '@shared/chat-autopilota'
import type { Autopilota } from '@shared/autopilota'
import type { Colore } from '@shared/stato-vista'

const COLORE_AP: Record<Colore, string> = { verde: 'var(--verde)', ambra: 'var(--ambra)', rosso: 'var(--rosso)', blu: 'var(--blu)', quieto: 'var(--testo-quieto)' }

type Props = {
  elenco: Autopilota[]
  errore: string | undefined
  alLogin: boolean | undefined
  onRicarica: () => void
  onErrore: (e: string | undefined) => void
  onAlLogin: (v: boolean | undefined) => void
  onChiudi: () => void
  /** Il workspace davanti: il suo autopilota è quello aperto di partenza. */
  workspaceAttivo: string
  /** La cartella della chat davanti: dove nasce l'autopilota del workspace, se non c'è ancora. */
  cwdAttivo?: string
}

/** Il nome con cui si mostra l'autopilota di un workspace. */
function nomeDi(a: Autopilota): string {
  if (a.workspace !== undefined && a.workspace !== '') return a.workspace
  if (a.nome.trim() !== '') return a.nome
  return a.cwd.split(/[\\/]/).filter((x) => x !== '').pop() ?? a.cwd
}

/**
 * Il pannello degli autopiloti (30/10: uno solo per workspace, sempre acceso).
 * A sinistra una riga per workspace con il suo stato; a destra quello scelto:
 * l'avanzamento con gli specialisti e le impostazioni, la coda delle richieste
 * e la conversazione con lui (`ChatAutopilota`).
 */
export function PannelloAutopiloti({
  elenco,
  errore,
  alLogin,
  onRicarica,
  onErrore,
  onAlLogin,
  onChiudi,
  workspaceAttivo,
  cwdAttivo
}: Props): React.JSX.Element {
  const [inCorso, setInCorso] = useState(false)
  // Il tempo passa anche se l'elenco non cambia (0.73.0): «da 12 min» e «senza segni» si aggiornano ogni mezzo minuto.
  const [ora, setOra] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setOra(Date.now()), 30_000); return () => clearInterval(t) }, [])
  const [scelto, setScelto] = useState<string | undefined>(undefined)
  const [menu, setMenu] = useState(false)

  useEffect(() => {
    const suTasto = (e: KeyboardEvent): void => { if (e.key === 'Escape') onChiudi() }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [onChiudi])

  const esegui = (op: () => Promise<unknown>): void => {
    if (inCorso) return
    setInCorso(true)
    onErrore(undefined)
    void op()
      .then(onRicarica)
      .catch((e: unknown) => onErrore(String(e)))
      .finally(() => setInCorso(false))
  }

  const vistaDi = (a: Autopilota): ReturnType<typeof vistaAutopilota> => {
    const segno = Date.parse((a as unknown as { ultimoSegno?: string }).ultimoSegno ?? '')
    return vistaAutopilota({ ...a, ...(haDomandaAperta(a) ? { domanda: true } : {}) }, ora, Number.isNaN(segno) ? undefined : segno)
  }
  const righe = ordinaAutopiloti(elenco.map((a) => ({ ...a, vista: vistaDi(a) })))
  const delWorkspace = righe.find((r) => r.workspace === workspaceAttivo)
  // Di partenza quello del workspace davanti.
  const sel = righe.find((r) => r.id === scelto) ?? (scelto === undefined ? delWorkspace : undefined)
  const senzaAutopilota = workspaceAttivo.trim() !== '' && delWorkspace === undefined

  return createPortal(
    <div className="progetti autopiloti" role="dialog" aria-label="Autopiloti">
      <div className="progetti__testa">
        <span className="progetti__titolo">◉ Autopiloti</span>
        <span style={{ flex: 1 }} />
        <span style={{ position: 'relative' }}>
          <button className="tasto tasto--mini" aria-expanded={menu} onClick={() => setMenu(!menu)}>Strumenti ▾</button>
          {menu ? (
            <TendinaMenu onChiudi={() => setMenu(false)}>
              <button className="progetti__voce" disabled={inCorso} onClick={() => { setMenu(false); onRicarica() }}>Aggiorna</button>
              {/* Il servizio sopravvive alla chiusura dell'applicazione ma non allo
                  spegnimento del PC: è questo interruttore a farlo tornare da solo. */}
              <label className="progetti__voce" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} title="Il servizio degli autopiloti riparte da solo all’accesso a Windows">
                <input
                  type="checkbox"
                  checked={alLogin === true}
                  disabled={alLogin === undefined || inCorso}
                  onChange={(e) => {
                    const attivare = e.target.checked
                    esegui(async () => {
                      const s = await window.gestore.autopilota.avvioAlLogin(attivare)
                      onAlLogin(s.installato)
                    })
                  }}
                />
                Riparti al login
              </label>
            </TendinaMenu>
          ) : null}
        </span>
        <Aiuto di="Autopiloti">
          Ogni workspace ha il suo autopilota, sempre acceso: gli parli, mette ogni richiesta in coda, fa il piano e lancia gli specialisti. Qui una riga per workspace con il suo stato: <span style={{ color: 'var(--verde)' }}>al lavoro</span>, <span style={{ color: 'var(--ambra)' }}>aspetta te</span> (una domanda nella colonna Domande), <span style={{ color: 'var(--ambra)' }}>senza segni</span>, fermo, <span style={{ color: 'var(--rosso)' }}>guasto</span>. Clic su una riga: l’avanzamento, la coda e la conversazione.
        </Aiuto>
        <button className="tasto tasto--mini" onClick={onChiudi} aria-label="Chiudi">×</button>
      </div>
      {errore !== undefined ? <div className="progetti__striscia">⚠ {errore}</div> : null}

      <div className={`progetti__corpo${sel !== undefined || senzaAutopilota ? ' progetti__corpo--destra' : ''}`}>
        <div className="progetti__tabella" role="grid">
          <div className="progetti__riga progetti__riga--testa" role="row">
            <span className="progetti__cella">Workspace</span>
            <span className="progetti__cella">Chat</span>
            <span className="progetti__cella">Ultima azione</span>
            <span className="progetti__cella">Da</span>
            <span className="progetti__cella">Stato</span>
          </div>
          {elenco.length === 0 && errore === undefined ? <div className="progetti__vuoto">Nessun autopilota ancora: nasce con il primo messaggio che gli scrivi.</div> : null}
          {righe.map((r) => {
            const acceso = r.id === sel?.id
            return (
              <div key={r.id} role="row" tabIndex={0} aria-selected={acceso}
                className={`progetti__riga${acceso ? ' progetti__riga--scelta' : ''}`}
                onClick={() => setScelto(r.id)}>
                <span className="progetti__cella" title={r.cwd}><b>{nomeDi(r)}</b> <span className="progetti__quieto">{r.cwd.split(/[\\/]/).filter((x) => x !== '').pop() ?? ''}</span></span>
                <span className="progetti__cella">{r.vista.chat.testo}</span>
                <span className="progetti__cella progetti__quieto" title={r.vista.ultima}>{r.vista.ultima}</span>
                <span className="progetti__cella progetti__quieto">{r.vista.da}</span>
                <span className="progetti__cella" title={r.vista.stato.ragione}><span style={{ color: COLORE_AP[r.vista.stato.colore] }}>● {r.vista.stato.parola}</span></span>
              </div>
            )
          })}
        </div>

        {sel !== undefined ? (
          <div className="progetti__dettaglio">
            <div className="progetti__dtesta">
              <span className="progetti__dtitolo" title={sel.cwd}>{nomeDi(sel)}</span>
              <span className="progetti__pillola" style={{ color: COLORE_AP[sel.vista.stato.colore], borderColor: COLORE_AP[sel.vista.stato.colore] }}>{sel.vista.stato.parola}{sel.vista.da !== '' ? ` · da ${sel.vista.da}` : ''}</span>
              <button className="tasto tasto--mini" onClick={() => setScelto('')} aria-label="Chiudi il dettaglio">×</button>
            </div>
            <div className="progetti__dcorpo">
              {sel.vista.stato.ragione !== undefined ? <div className="progetti__voceelenco" style={{ color: COLORE_AP[sel.vista.stato.colore] }}>{sel.vista.stato.ragione}</div> : null}
              <ChatAutopilota key={sel.id} autopilota={sel} onCambiato={onRicarica} />
              <SpecialistiVista autopilota={sel} onGuarda={onChiudi} />
            </div>
          </div>
        ) : senzaAutopilota ? (
          <div className="progetti__dettaglio">
            <div className="progetti__dcorpo">
              <PrimoMessaggio workspace={workspaceAttivo} {...(cwdAttivo !== undefined && cwdAttivo !== '' ? { cwd: cwdAttivo } : {})} onRicarica={onRicarica} />
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  )
}
