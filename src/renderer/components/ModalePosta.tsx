import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'
import type { BattitoPc, VocePosta } from '@shared/posta'

type Props = {
  pc: BattitoPc
  vivo: boolean
  onChiudi: () => void
}

function quando(iso: string | undefined): string {
  if (iso === undefined) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })
}

function nomeCartella(p: string): string {
  return p.split(/[\\/]/).filter((x) => x !== '').pop() ?? p
}

/**
 * La cassetta di un altro PC: le azioni che si eseguono **solo la'**, quando
 * quel computer c'e'.
 *
 * Nicholas (2026-09-14): «se sto operando su una chat su una cartella in rete
 * gli altri come fanno a operare li'? … un'azione che rimane eseguibile solo
 * in remoto su quel PC quando e' online». Qui si scrive; il postino di quel
 * PC, ogni mezzo minuto, consegna nella chat giusta o ne apre una.
 */
export function ModalePosta({ pc, vivo, onChiudi }: Props): React.JSX.Element {
  const [voci, setVoci] = useState<VocePosta[] | undefined>(undefined)
  const [cwd, setCwd] = useState<string>(pc.cartelle[0] ?? '')
  const [cartellaLibera, setCartellaLibera] = useState('')
  const [sessione, setSessione] = useState('')
  const [testo, setTesto] = useState('')
  const [occupato, setOccupato] = useState(false)
  const [msg, setMsg] = useState<string | undefined>(undefined)

  const ricarica = (): void => {
    void window.gestore.posta.leggi(pc.pcId).then((p) => {
      if (p === undefined) { setMsg('La posta sta sul Drive: serve la cassaforte sbloccata e il Drive collegato.'); setVoci([]) }
      else { setMsg(undefined); setVoci(p.voci) }
    }).catch((e: unknown) => setMsg(String(e)))
  }
  useEffect(() => {
    ricarica()
    const t = setInterval(ricarica, 10_000)
    return () => clearInterval(t)
  }, [pc.pcId])
  useEffect(() => {
    const suTasto = (e: KeyboardEvent): void => { if (e.key === 'Escape') onChiudi() }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [onChiudi])

  const cartellaScelta = cwd === '__altra__' ? cartellaLibera.trim() : cwd
  const chatNellaCartella = pc.chat.filter((c) => c.sessione !== undefined && (cartellaScelta === '' || c.cwd.toLowerCase().startsWith(cartellaScelta.toLowerCase())))

  const con = (p: Promise<{ voci: VocePosta[] } | undefined>): void => {
    setOccupato(true)
    void p.then((r) => { if (r !== undefined) setVoci(r.voci); else setMsg('Non sono riuscito a scrivere nella cassetta: il Drive non risponde o la cassaforte è chiusa.') })
      .catch((e: unknown) => setMsg(String(e))).finally(() => setOccupato(false))
  }
  const manda = (): void => {
    if (testo.trim() === '' || cartellaScelta === '') return
    con(window.gestore.posta.aggiungi(pc.pcId, { cwd: cartellaScelta, testo, ...(sessione !== '' ? { sessione } : {}) }))
    setTesto('')
  }

  const attesa = (voci ?? []).filter((v) => v.stato === 'attesa')
  const finite = (voci ?? []).filter((v) => v.stato !== 'attesa')

  return createPortal(
    <div className="velo" onMouseDown={(e) => { if (e.target === e.currentTarget) onChiudi() }}>
      <div className="dialogo dialogo--largo" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialogo__testa">
          <span className="serigrafia">Azioni su {pc.nome} · {vivo ? 'acceso' : `spento (ultimo segno ${quando(pc.battito)})`}</span>
        </div>
        <p className="account__nota" style={{ margin: '0 0 8px' }}>
          Quello che scrivi qui si esegue <b>solo su {pc.nome}</b>, in una sua chat, nella cartella che scegli: è la strada per
          una cartella che sta là (un disco di rete montato solo su quel PC, un progetto che non viaggia sul Drive). La voce
          resta in attesa sul Drive finché quel PC è acceso e con il Drive collegato; il suo postino passa ogni mezzo minuto e
          la consegna alla prima chat di quella cartella che ha finito e aspetta, oppure alla chat che indichi; se nella
          cartella non c’è nessuna chat aperta, ne apre una nuova e consegna appena è pronta. Se la cartella su quel PC non
          esiste, la voce fallisce e lo dice qui. Il lavoro fatto lo vedi come sempre: la chat sale sul Drive con il
          salvataggio automatico e arriva qui, e dal telefono puoi guardare dentro la chat di quel PC. Non si esegue niente
          su questo PC.
        </p>
        {msg !== undefined ? <div className="riga__stato">{msg}</div> : null}

        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 4 }}>
          {voci === undefined ? <p className="account__nota">Leggo la cassetta…</p> : null}
          {voci !== undefined && attesa.length === 0 ? <p className="account__nota">Nessuna azione in attesa.</p> : null}
          {attesa.map((v, i) => (
            <div key={v.id} style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 8, alignItems: 'start', padding: '6px 8px', borderRadius: 6, background: 'var(--fondo-cupo)' }}>
              <span style={{ opacity: 0.6, fontSize: 12, marginTop: 2 }}>{i + 1}.</span>
              <div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{v.testo}</div>
                <div className="account__nota" style={{ margin: 0 }}>
                  in {nomeCartella(v.cwd)}{v.sessione !== undefined ? ' · a una chat precisa' : ''} · da {v.daNome} il {quando(v.creataIl)}
                  {v.apertaIl !== undefined ? ' · ho aperto una chat, aspetto che sia pronta' : ''}
                </div>
              </div>
              <button className="tasto tasto--mini" disabled={occupato} onClick={() => con(window.gestore.posta.togli(pc.pcId, v.id))}>Togli</button>
            </div>
          ))}
          {finite.length > 0 ? (
            <details style={{ marginTop: 6 }}>
              <summary className="account__nota" style={{ cursor: 'pointer' }}>
                {finite.length} {finite.length === 1 ? 'azione già chiusa' : 'azioni già chiuse'} (consegnate o fallite)
              </summary>
              {finite.map((v) => (
                <div key={v.id} className="account__nota" style={{ margin: '4px 0', color: v.stato === 'fallita' ? 'var(--ambra)' : undefined }}>
                  {v.stato === 'fallita' ? '✗' : '✓'} {v.testo.slice(0, 80)} — {v.esito ?? v.stato} · {quando(v.consegnataIl)}
                </div>
              ))}
              <button className="tasto tasto--mini" disabled={occupato} onClick={() => con(window.gestore.posta.pulisci(pc.pcId))}>Pulisci le chiuse</button>
            </details>
          ) : null}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          <select className="account__campo" value={cwd} onChange={(e) => setCwd(e.target.value)} aria-label="in quale cartella di quel PC">
            {pc.cartelle.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value="__altra__">un’altra cartella di quel PC…</option>
          </select>
          {cwd === '__altra__' ? (
            <input className="account__campo" value={cartellaLibera} onChange={(e) => setCartellaLibera(e.target.value)} placeholder="il percorso com’è su quel PC, per esempio Z:\progetti\gestionale" />
          ) : null}
          <select className="account__campo" value={sessione} onChange={(e) => setSessione(e.target.value)} aria-label="a quale chat">
            <option value="">alla prima chat libera di quella cartella (o una nuova)</option>
            {chatNellaCartella.map((c) => <option key={c.sessione} value={c.sessione}>{c.titolo || (c.sessione ?? '').slice(0, 8)}{c.aspetta ? ' · aspetta' : ' · al lavoro'}</option>)}
          </select>
          <textarea className="account__campo" rows={3} value={testo} onChange={(e) => setTesto(e.target.value)}
            placeholder="L’azione, come la scriveresti nella chat di quel PC"
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) manda() }} />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button className="tasto" onClick={onChiudi}>Chiudi</button>
            <button className="tasto tasto--primario" disabled={occupato || testo.trim() === '' || cartellaScelta === ''} onClick={manda} title="Ctrl+Invio">
              Manda a {pc.nome}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
