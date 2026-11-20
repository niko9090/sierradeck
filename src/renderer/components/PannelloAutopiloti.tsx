import { createPortal } from 'react-dom'
import { apriMenuContestuale } from '../menu-contestuale'
import { vociAutopilota } from '@shared/menu-contestuale'
import { BordoDettaglio } from './BordoDettaglio'
import { useEffect, useMemo, useState } from 'react'
import { TendinaMenu } from './TendinaMenu'
import { SpecialistiVista } from './SpecialistiVista'
import { ChatAutopilota } from './ChatAutopilota'
import { FilaSpecialisti } from './PannelloSpecialisti'
import { AutopilotaRemotoScelto } from './AutopilotaRemotoScelto'
import { BarraSchede, COLORE_AP, TabellaAutopiloti, nomeAutopilota, rigaScelta, tuttiIGruppi, type RigaAutopiloti, type SchedaAutopiloti } from './AutopilotiUnificata'
import { PrimoMessaggio } from './WorkspacePanoramica'
import { Aiuto } from './Aiuto'
import type { Autopilota } from '@shared/autopilota'
import type { AutopilotiDiPc } from '@shared/autopiloti-altri'

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

/**
 * **La pagina Autopiloti** (k-u3: una sola, tre schede). A sinistra una riga
 * per autopilota, di questo PC e degli altri PC, con gli stessi stati e le
 * stesse parole; a destra quello scelto, in tre schede: Chat · Specialisti ·
 * Fila. Gli specialisti hanno una lista sola (`SpecialistiVista` per chi
 * lavora per l'autopilota scelto, `FilaSpecialisti` per i posti e la fila) e
 * i comandi (Aggiorna, Riparti al login, il primo messaggio che fa nascere
 * l'autopilota) stanno qui e non altrove. La parte pura è `AutopilotiUnificata`.
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
  const [scheda, setScheda] = useState<SchedaAutopiloti>('chat')
  const [menu, setMenu] = useState(false)
  // Gli altri PC: si rileggono ogni tanto; un errore di lettura lascia quello che si vedeva.
  const [altri, setAltri] = useState<AutopilotiDiPc[]>([])
  useEffect(() => {
    let vivo = true
    const leggi = (): void => {
      window.gestore.autopilotiAltri.elenco().then((r) => { if (vivo) setAltri((p) => (JSON.stringify(p) === JSON.stringify(r) ? p : r)) }).catch(() => undefined)
    }
    leggi()
    const t = setInterval(leggi, 10_000)
    return () => { vivo = false; clearInterval(t) }
  }, [])

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

  const gruppi = useMemo(() => tuttiIGruppi(elenco, altri, ora), [elenco, altri, ora])
  const sel = rigaScelta(gruppi, scelto, workspaceAttivo)
  const senzaAutopilota = workspaceAttivo.trim() !== '' && !gruppi.some((g) => g.pc === undefined && g.righe.some((r) => r.workspace === workspaceAttivo))
  const locale = sel !== undefined && sel.pc === undefined ? elenco.find((a) => a.id === sel.id) : undefined
  const scegli = (r: RigaAutopiloti): void => setScelto(r.chiave)

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
          Ogni workspace ha il suo autopilota, sempre acceso: gli parli, mette ogni richiesta in coda, fa il piano e lancia gli specialisti. Qui una riga per autopilota, di questo PC e degli altri PC: <span style={{ color: 'var(--verde)' }}>al lavoro</span>, <span style={{ color: 'var(--ambra)' }}>aspetta te</span> (una domanda nella colonna Domande), <span style={{ color: 'var(--ambra)' }}>senza segni</span>, fermo, <span style={{ color: 'var(--rosso)' }}>guasto</span>. Clic su una riga, poi le schede: la chat, i suoi specialisti, la fila dei posti.
        </Aiuto>
        <button className="tasto tasto--mini" onClick={onChiudi} aria-label="Chiudi">×</button>
      </div>
      {errore !== undefined ? <div className="progetti__striscia">⚠ {errore}</div> : null}

      <div className="progetti__corpo progetti__corpo--destra">
        <TabellaAutopiloti
          gruppi={gruppi}
          scelta={sel?.chiave}
          errore={errore}
          onScegli={scegli}
          onMenu={(e, r) => apriMenuContestuale(e, vociAutopilota({ dove: 'elenco', scelto: r.chiave === sel?.chiave }), {
            dettaglio: () => setScelto(r.chiave),
            nascondi: () => setScelto(''),
            cartella: () => { if (r.pc !== undefined || r.workspace === undefined) return; void window.gestore.workspace.apriCartella({ workspace: r.workspace }).then((x) => { if (!x.ok) onErrore(x.messaggio) }).catch((err: unknown) => onErrore(String(err))) },
            aggiorna: onRicarica
          })}
        />

        <BordoDettaglio chiave="autopilotiDettaglio" />
        <div className="progetti__dettaglio">
          <BarraSchede scheda={scheda} onScheda={setScheda} />
          <div className="progetti__dcorpo">
            {scheda === 'fila' ? (
              <FilaSpecialisti />
            ) : sel !== undefined ? (
              <>
                <div className="progetti__dtesta">
                  <span className="progetti__dtitolo" title={sel.cwd}>{nomeAutopilota(sel)}{sel.pc !== undefined ? ` · su ${sel.pc.nome}` : ''}</span>
                  <span className="progetti__pillola" style={{ color: COLORE_AP[sel.vista.stato.colore], borderColor: COLORE_AP[sel.vista.stato.colore] }}>{sel.vista.stato.parola}{sel.vista.da !== '' ? ` · da ${sel.vista.da}` : ''}</span>
                  <button className="tasto tasto--mini" onClick={() => setScelto('')} aria-label="Chiudi il dettaglio">×</button>
                </div>
                {sel.vista.stato.ragione !== undefined ? <div className="progetti__voceelenco" style={{ color: COLORE_AP[sel.vista.stato.colore] }}>{sel.vista.stato.ragione}</div> : null}
                {sel.pc !== undefined ? (
                  <AutopilotaRemotoScelto key={sel.chiave + scheda} pcId={sel.pc.id} pcNome={sel.pc.nome} workspace={sel.workspace ?? ''} scheda={scheda} />
                ) : locale !== undefined ? (
                  scheda === 'chat'
                    ? <ChatAutopilota key={locale.id} autopilota={locale} onCambiato={onRicarica} />
                    : <SpecialistiVista autopilota={locale} onGuarda={onChiudi} />
                ) : null}
              </>
            ) : senzaAutopilota && scelto === undefined ? (
              <PrimoMessaggio workspace={workspaceAttivo} {...(cwdAttivo !== undefined && cwdAttivo !== '' ? { cwd: cwdAttivo } : {})} onRicarica={onRicarica} />
            ) : (
              <div className="progetti__vuoto">Scegli un autopilota dalla tabella.</div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
