import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { postoTendina, type PostoTendina } from '@shared/menu-workspace'
import type { GruppoAltroPc } from '@shared/workspace-remoti'
import { EVENTO_REMOTI } from '../workspace-remoti'
import { Aiuto } from './Aiuto'
import { apriMenuContestuale } from '../menu-contestuale'
import { vociAltroPc, vociWorkspaceRemoto } from '@shared/menu-contestuale'

const RILEGGI_MS = 30_000

/**
 * **La sezione «Altri PC»** (13/11). Nicholas: «voglio che le sessioni remote
 * abbiano una sezione dedicata del programma, separata e ben visibile, così
 * non ho più una lista di chat caotica».
 *
 * Nella fascia, accanto ai workspace di questo PC: un tasto per ogni altro PC
 * (acceso o spento), e dentro i suoi workspace. Uno già aperto qui si apre al
 * clic; uno solo di là si apre con «Apri». Si vede sempre con l'autopilota di
 * quel PC, come là. Prima stavano mescolati ai workspace di qui («Su altri PC»
 * e il menu dei workspace).
 */
export function SezioneAltriPc({ attivo, nomi, onCambia }: {
  /** Il workspace davanti in questa finestra. */
  attivo: string
  /** Tutti i nomi dell'archivio: quando cambiano si rilegge. */
  nomi: readonly string[]
  /** Passa a un workspace già aperto qui (come un clic sulla fascia). */
  onCambia: (nome: string) => void
}): React.JSX.Element | null {
  const [gruppi, setGruppi] = useState<GruppoAltroPc[]>([])
  const [aperto, setAperto] = useState<string | undefined>(undefined)
  const [porto, setPorto] = useState<string | undefined>(undefined)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const [posto, setPosto] = useState<PostoTendina | undefined>(undefined)
  /** «Rileggi» dal tasto destro (13/11): cambia e si rilegge subito. */
  const [giro, setGiro] = useState(0)
  const tasti = useRef(new Map<string, HTMLButtonElement>())
  const chiave = nomi.join('\n')

  useEffect(() => {
    let vivo = true
    const leggi = (): void => {
      const p = window.gestore.workspace.sezioneAltriPc?.()
      if (p === undefined) return
      void p.then((g) => { if (vivo) setGruppi(g) }).catch(() => undefined)
    }
    leggi()
    const t = setInterval(leggi, RILEGGI_MS)
    window.addEventListener(EVENTO_REMOTI, leggi)
    return () => { vivo = false; clearInterval(t); window.removeEventListener(EVENTO_REMOTI, leggi) }
  }, [chiave, aperto, giro])
  useEffect(() => {
    if (aperto === undefined) return
    setErrore(undefined)
    const su = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.stopImmediatePropagation(); setAperto(undefined) } }
    window.addEventListener('keydown', su, true)
    return () => window.removeEventListener('keydown', su, true)
  }, [aperto])
  useLayoutEffect(() => {
    if (aperto === undefined) return
    const r = tasti.current.get(aperto)?.getBoundingClientRect()
    if (r === undefined) return
    setPosto(postoTendina({ ancora: r, finestra: { larghezza: window.innerWidth, altezza: window.innerHeight }, larghezza: 380 }))
  }, [aperto])

  if (gruppi.length === 0) return null
  const gruppo = gruppi.find((g) => g.pcId === aperto)
  const apri = (g: GruppoAltroPc, nome: string, giaQui: boolean): void => {
    if (giaQui) { setAperto(undefined); if (nome !== attivo) onCambia(nome); return }
    setPorto(nome)
    setErrore(undefined)
    void window.gestore.workspace.apriDaAltroPc(g.pcId, nome)
      .then((r) => {
        if (!r.ok) { setErrore(r.messaggio); return }
        setAperto(undefined)
        window.dispatchEvent(new Event(EVENTO_REMOTI))
      })
      .catch((err: unknown) => setErrore(String(err)))
      .finally(() => setPorto(undefined))
  }

  return (
    <div className="sezione altri-pc" aria-label="Altri PC">
      <span className="serigrafia">Altri PC</span>
      {gruppi.map((g) => {
        const davanti = g.voci.find((v) => v.aperto && v.nome === attivo)
        return (
          <button
            key={g.pcId}
            ref={(el) => { if (el !== null) tasti.current.set(g.pcId, el); else tasti.current.delete(g.pcId) }}
            className={`ws__voce altri-pc__pc${davanti !== undefined ? ' ws__voce--attivo' : ''}`}
            aria-expanded={aperto === g.pcId}
            onClick={() => setAperto((a) => (a === g.pcId ? undefined : g.pcId))}
            onContextMenu={(e) => apriMenuContestuale(e, vociAltroPc({ nome: g.nome, aperto: aperto === g.pcId }), {
              mostra: () => setAperto((a) => (a === g.pcId ? undefined : g.pcId)),
              rileggi: () => setGiro((x) => x + 1)
            })}
            title={`${g.nome} · ${g.vivo ? 'acceso' : 'spento o non risponde'}: i suoi workspace`}
          >
            <span className={`led ${g.vivo ? 'led--lavoro' : 'led--fermo'}`} aria-label={g.vivo ? 'acceso' : 'spento'} />
            {g.nome}{davanti !== undefined ? <> · <b>{davanti.nome}</b></> : null}
            {g.voci.length > 0 ? <span className="ws-menu__quanti">{g.voci.length}</span> : null} ▾
          </button>
        )
      })}
      {gruppo !== undefined && posto !== undefined ? createPortal(
        <>
          <div className="ws-menu__velo" onMouseDown={() => setAperto(undefined)} />
          <div className="ws-menu__tendina" style={{ top: posto.top, left: posto.left, width: posto.larghezza, maxHeight: posto.altezzaMax }} aria-label={`Workspace su ${gruppo.nome}`}>
            <div className="ws-menu__vuoto altri-pc__testa">
              <span className={`led ${gruppo.vivo ? 'led--lavoro' : 'led--fermo'}`} /> <b>{gruppo.nome}</b> · {gruppo.vivo ? 'acceso' : 'spento o non risponde'}
              <Aiuto di="la sezione Altri PC">I workspace che vivono su {gruppo.nome}. Si aprono qui come là: con il loro autopilota, che lavora su {gruppo.nome}. Le chat si guardano e non si scrivono: si parla con l’autopilota. I workspace di questo PC stanno nella fascia «Workspace».</Aiuto>
            </div>
            <div className="ws-menu__lista">
              {gruppo.voci.length === 0 ? <div className="ws-menu__vuoto">Nessun workspace su {gruppo.nome}.</div> : null}
              {gruppo.voci.map((v) => (
                <div key={v.nome} className="ws-menu__voce ws-menu__voce--su-altri"
                  onContextMenu={(e) => apriMenuContestuale(e, vociWorkspaceRemoto({ nome: v.nome, pc: gruppo.nome, aperto: v.aperto, davanti: v.aperto && v.nome === attivo, occupato: porto !== undefined }), {
                    apri: () => apri(gruppo, v.nome, v.aperto),
                    // «Porta qui» (0.88.0): un progetto cambia PC solo da Progetti, con i suoi controlli.
                    'porta-qui': () => { setAperto(undefined); window.dispatchEvent(new CustomEvent('sierradeck:pannello-drive')) }
                  })}>
                  <span className="ws-menu__voce-nome">{v.nome}</span>
                  <span className="ws-menu__conta">{v.sparito === true ? 'non c’è più là' : v.aperto ? (v.nome === attivo ? 'davanti' : 'aperto qui') : ''}</span>
                  <button className="tasto tasto--mini tasto--acceso" disabled={porto !== undefined || (v.aperto && v.nome === attivo)}
                    title={v.aperto ? `Passa a «${v.nome}», con l’autopilota di ${gruppo.nome}` : `Apre qui «${v.nome}» con l’autopilota di ${gruppo.nome}. Su ${gruppo.nome} non cambia niente.`}
                    onClick={() => apri(gruppo, v.nome, v.aperto)}>{porto === v.nome ? '…' : 'Apri'}</button>
                </div>
              ))}
            </div>
            {errore !== undefined ? <div className="ws-menu__vuoto" style={{ color: 'var(--ambra)' }}>{errore}</div> : null}
          </div>
        </>, document.body) : null}
    </div>
  )
}
