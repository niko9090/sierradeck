import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'

type VoceCoda = {
  id: string; testo: string; creataIl: string; daNome: string; sessione?: string
  stato: 'attesa' | 'consegnata'; consegnataIl?: string; aNome?: string; aSessione?: string
}
type ChatDiProgetto = { sessione: string; titolo: string; workspace: string }

type Props = {
  progetto: { id: string; nome: string }
  onChiudi: () => void
}

function quando(iso: string | undefined): string {
  if (iso === undefined) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })
}

/**
 * La coda condivisa dei comandi di un progetto.
 *
 * Si scrive da qualunque PC, la consegna chi ha il testimone: alla chat
 * scelta, o alla prima del progetto che ha finito e aspetta. Ogni voce dice
 * chi l'ha messa e quando, e a chi e' arrivata.
 */
export function ModaleCoda({ progetto, onChiudi }: Props): React.JSX.Element {
  const [voci, setVoci] = useState<VoceCoda[] | undefined>(undefined)
  const [chat, setChat] = useState<ChatDiProgetto[]>([])
  const [testo, setTesto] = useState('')
  const [sessione, setSessione] = useState('')
  const [inModifica, setInModifica] = useState<{ id: string; testo: string; sessione: string } | undefined>(undefined)
  const [occupato, setOccupato] = useState(false)
  const [msg, setMsg] = useState<string | undefined>(undefined)

  const ricarica = (): void => {
    void window.gestore.progetti.coda(progetto.id).then((c) => {
      if (c === undefined) { setMsg('La coda sta sul Drive: serve la cassaforte sbloccata e il Drive collegato.'); setVoci([]) }
      else { setMsg(undefined); setVoci(c.voci) }
    }).catch((e: unknown) => setMsg(String(e)))
  }
  useEffect(() => {
    ricarica()
    void window.gestore.progetti.chatDi(progetto.id).then(setChat).catch(() => {})
    const t = setInterval(ricarica, 10_000)
    return () => clearInterval(t)
  }, [progetto.id])
  useEffect(() => {
    const suTasto = (e: KeyboardEvent): void => { if (e.key === 'Escape') onChiudi() }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [onChiudi])

  const con = (p: Promise<{ voci: VoceCoda[] } | undefined>): void => {
    setOccupato(true)
    void p.then((c) => { if (c !== undefined) setVoci(c.voci) }).catch((e: unknown) => setMsg(String(e))).finally(() => setOccupato(false))
  }
  const aggiungi = (): void => {
    if (testo.trim() === '') return
    con(window.gestore.progetti.codaAggiungi(progetto.id, testo, sessione === '' ? undefined : sessione))
    setTesto('')
  }
  const nomeChat = (s: string | undefined): string => {
    if (s === undefined) return 'la prima chat libera'
    const c = chat.find((x) => x.sessione === s)
    return c !== undefined ? `«${c.titolo || s.slice(0, 8)}»` : s.slice(0, 8)
  }
  const inAttesa = (voci ?? []).filter((v) => v.stato === 'attesa')
  const consegnate = (voci ?? []).filter((v) => v.stato === 'consegnata')

  // Sul body, non dentro chi lo apre: un pannello con `transform` fa da
  // contenitore a `position: fixed`, e il modale restava dentro e tagliato.
  return createPortal(
    <div className="velo" onMouseDown={(e) => { if (e.target === e.currentTarget) onChiudi() }}>
      <div className="dialogo dialogo--largo" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialogo__testa">
          <span className="serigrafia">Coda dei comandi · {progetto.nome}</span>
        </div>
        <p className="account__nota" style={{ margin: '0 0 8px' }}>
          Quello che metti qui lo riceve, uno alla volta, una chat di questo progetto sul PC che ha il testimone, appena ha finito e aspetta. Si scrive e si cambia da qualunque PC.
        </p>
        {msg !== undefined ? <div className="riga__stato">{msg}</div> : null}

        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 4 }}>
          {voci === undefined ? <p className="account__nota">Leggo la coda…</p> : null}
          {voci !== undefined && inAttesa.length === 0 ? <p className="account__nota">Nessun comando in attesa.</p> : null}
          {inAttesa.map((v, i) => (
            <div key={v.id} style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 8, alignItems: 'start', padding: '6px 8px', borderRadius: 6, background: 'var(--fondo-cupo)' }}>
              <span style={{ opacity: 0.6, fontSize: 12, marginTop: 2 }}>{i + 1}.</span>
              {inModifica?.id === v.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <textarea className="account__campo" rows={3} value={inModifica.testo} onChange={(e) => setInModifica({ ...inModifica, testo: e.target.value })} />
                  <select className="account__campo" value={inModifica.sessione} onChange={(e) => setInModifica({ ...inModifica, sessione: e.target.value })}>
                    <option value="">alla prima chat libera del progetto</option>
                    {chat.map((c) => <option key={c.sessione} value={c.sessione}>{c.titolo || c.sessione.slice(0, 8)} · {c.workspace}</option>)}
                  </select>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="tasto tasto--mini" onClick={() => setInModifica(undefined)}>Annulla</button>
                    <button className="tasto tasto--primario tasto--mini" disabled={occupato} onClick={() => { con(window.gestore.progetti.codaModifica(progetto.id, v.id, inModifica.testo, inModifica.sessione)); setInModifica(undefined) }}>Salva</button>
                  </div>
                </div>
              ) : (
                <div style={{ minWidth: 0 }}>
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{v.testo}</div>
                  <div style={{ fontSize: 11, opacity: 0.6 }}>da {v.daNome} · {quando(v.creataIl)} · per {nomeChat(v.sessione)}</div>
                </div>
              )}
              {inModifica?.id === v.id ? <span /> : (
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="tasto tasto--mini" disabled={occupato} onClick={() => setInModifica({ id: v.id, testo: v.testo, sessione: v.sessione ?? '' })}>Modifica</button>
                  <button className="tasto tasto--mini" disabled={occupato} onClick={() => con(window.gestore.progetti.codaTogli(progetto.id, v.id))}>Togli</button>
                </div>
              )}
            </div>
          ))}
          {consegnate.length > 0 ? (
            <details style={{ marginTop: 4 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, opacity: 0.75 }}>Consegnate ({consegnate.length})</summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                {consegnate.map((v) => (
                  <div key={v.id} style={{ padding: '4px 8px', borderRadius: 6, background: 'var(--fondo-cupo)', opacity: 0.7 }}>
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{v.testo}</div>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>da {v.daNome} · consegnata da {v.aNome ?? '?'} il {quando(v.consegnataIl)} a {nomeChat(v.aSessione)}</div>
                  </div>
                ))}
                <div><button className="tasto tasto--mini" disabled={occupato} onClick={() => con(window.gestore.progetti.codaPulisci(progetto.id))}>Pulisci le consegnate</button></div>
              </div>
            </details>
          ) : null}
        </div>

        <div style={{ borderTop: '1px solid var(--incisione)', marginTop: 10, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <textarea className="account__campo" rows={3} value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Il comando da mettere in fila: quello che scriveresti nella chat" onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) aggiungi() }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <select className="account__campo" style={{ fontSize: 12 }} value={sessione} onChange={(e) => setSessione(e.target.value)}>
              <option value="">alla prima chat libera del progetto</option>
              {chat.map((c) => <option key={c.sessione} value={c.sessione}>{c.titolo || c.sessione.slice(0, 8)} · {c.workspace}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="tasto" onClick={onChiudi}>Chiudi</button>
              <button className="tasto tasto--primario" disabled={occupato || testo.trim() === ''} onClick={aggiungi} title="Ctrl+Invio">Metti in coda</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  , document.body)
}
