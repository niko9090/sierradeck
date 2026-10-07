import { useEffect, useState } from 'react'
import { NomePc } from './NomePc'
import { createPortal } from 'react-dom'
import type { FuoriCasa, RegistroRiordino } from '@shared/una-casa'

/**
 * «Riordina le chat» (0.42.0, «una chat, una casa»).
 *
 * Su questo PC: le chat che stanno qui ma hanno casa su un altro PC, per casa
 * proposta, con il motivo. Nicholas spunta e conferma; le copie fuori casa
 * vanno nella cartella di recupero di SierraDeck, **mai cancellate**, e ogni
 * riordino si annulla da qui sotto.
 */

type Props = { onChiudi: () => void }

function kb(n: number): string {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`
}
function quando(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })
}

export function ModaleRiordina({ onChiudi }: Props): React.JSX.Element {
  const [proposte, setProposte] = useState<{ gruppi: { pc: string; nome: string; chat: FuoriCasa[] }[]; quante: number; aperte: number; qui: number } | undefined>(undefined)
  const [scelte, setScelte] = useState<Set<string>>(new Set())
  const [riordini, setRiordini] = useState<RegistroRiordino[]>([])
  const [occupato, setOccupato] = useState(false)
  const [msg, setMsg] = useState<string | undefined>(undefined)
  const [errore, setErrore] = useState<string | undefined>(undefined)

  const leggi = (): void => {
    setErrore(undefined)
    window.gestore.casa.proposte().then((p) => {
      setProposte(p)
      // Spuntate tutte quelle che si possono spostare (non le aperte).
      setScelte(new Set(p.gruppi.flatMap((g) => g.chat.filter((c) => !c.aperta).map((c) => c.sessione))))
    }).catch((e: unknown) => setErrore(String(e)))
    window.gestore.casa.riordini().then(setRiordini).catch(() => undefined)
  }
  useEffect(() => { leggi() }, [])

  const commuta = (s: string): void => setScelte((x) => { const n = new Set(x); if (n.has(s)) n.delete(s); else n.add(s); return n })
  const riordina = (): void => {
    if (scelte.size === 0 || occupato) return
    setOccupato(true); setMsg(undefined)
    window.gestore.casa.riordina([...scelte]).then((r) => {
      setMsg(`Fatto: ${r.spostamenti.length} file di ${new Set(r.spostamenti.map((s) => s.sessione)).size} chat sono nella cartella di recupero, e le loro case sono confermate. Niente è stato cancellato: «Annulla» qui sotto le rimette dov’erano.`)
      leggi()
    }).catch((e: unknown) => setMsg(`Non è andata: ${String(e)}`)).finally(() => setOccupato(false))
  }
  const annulla = (id: string): void => {
    setOccupato(true); setMsg(undefined)
    window.gestore.casa.annulla(id).then((r) => {
      setMsg(r.ok
        ? `Annullato: ${r.rimessi} file rimessi al loro posto, e le case com’erano prima.${r.restano.length > 0 ? ` ${r.restano.length} restano nella cartella di recupero: ${r.restano.map((x) => x.perche).filter((v, i, a) => a.indexOf(v) === i).join('; ')}.` : ''}`
        : (r.messaggio ?? 'Non annullato.'))
      leggi()
    }).catch((e: unknown) => setMsg(`Non è andata: ${String(e)}`)).finally(() => setOccupato(false))
  }

  return createPortal(
    <div className="velo" onMouseDown={(e) => { if (e.target === e.currentTarget) onChiudi() }}>
      <div className="dialogo dialogo--largo" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialogo__testa">
          <span className="serigrafia">Riordina le chat · una chat, una casa</span>
          <span style={{ flex: 1 }} />
          <button className="tasto tasto--mini" onClick={onChiudi} aria-label="Chiudi">×</button>
        </div>
        <p className="account__nota" style={{ margin: '0 0 8px' }}>
          Ogni chat ha <b>una casa</b>: il PC dove gira e dove sta la sua cartella. Qui sotto ci sono le chat che stanno su
          questo PC ma hanno casa su un altro, cioè delle copie arrivate dal Drive. Per ognuna c’è il PC di casa proposto e il
          perché: dove è nata, dove c’è la sua cartella, dove ha lavorato per ultima. Togli la spunta a quelle che secondo te
          sono di qui, poi premi «Riordina». Le copie spuntate <b>non vengono cancellate</b>: vanno nella cartella di recupero
          di SierraDeck, e da qui le guardi dal vivo sul loro PC. Ogni riordino si annulla dall’elenco in fondo. Le chat
          aperte adesso non si spostano: chiudi prima il loro riquadro (la conversazione non si perde).
        </p>
        {msg !== undefined ? <div className="riga__stato" style={{ marginBottom: 8 }}>{msg}</div> : null}
        {errore !== undefined ? <div className="avviso">⚠ {errore}</div> : null}
        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 }}>
          {proposte === undefined ? <p className="account__nota">Guardo le chat di questo PC e i battiti degli altri…</p> : null}
          {proposte !== undefined && proposte.quante === 0 ? (
            <p className="account__nota">Tutte le {proposte.qui} chat di questo PC hanno casa qui: non c’è niente da riordinare.</p>
          ) : null}
          {proposte?.gruppi.map((g) => (
            <div key={g.pc} className="riordina__gruppo">
              <div className="serigrafia">Casa su {g.nome} · {g.chat.length} chat</div>
              {g.chat.map((c) => (
                <label key={c.sessione} className="riordina__chat" title={c.cwd}>
                  <input type="checkbox" checked={scelte.has(c.sessione)} disabled={c.aperta || occupato} onChange={() => commuta(c.sessione)} />
                  <span className="riordina__testo">
                    <b>{c.titolo}</b> <span className="account__nota">· {kb(c.byte)}{c.aperta ? ' · aperta adesso: chiudila prima' : ''}</span>
                    <span className="account__nota riordina__motivo">Casa proposta: <NomePc id={c.casa.pc} nome={c.casa.pcNome} />, perché {c.casa.motivo}.</span>
                    {c.cwd !== undefined ? <span className="account__nota riordina__motivo">Cartella: {c.cwd}</span> : null}
                  </span>
                </label>
              ))}
            </div>
          ))}
          {riordini.length > 0 ? (
            <details className="riordina__storia">
              <summary className="account__nota" style={{ cursor: 'pointer' }}>Riordini e spostamenti fatti su questo PC ({riordini.length}): si annullano da qui</summary>
              {riordini.map((r) => (
                <div key={r.id} className="riordina__voce">
                  <span className="account__nota">
                    {quando(r.quando)} · {r.tipo === 'sposta' ? `«Sposta progetto» verso ${r.verso?.nome ?? '?'}${r.verso?.cwd !== undefined ? ` (${r.verso.cwd})` : ''}` : r.tipo === 'ospite' ? `ospite cambiato: ${r.verso?.nome ?? '?'}` : 'riordino'} · {new Set(r.spostamenti.map((s) => s.sessione)).size} chat, {r.spostamenti.length} file
                    {r.annullatoIl !== undefined ? ` · annullato il ${quando(r.annullatoIl)}` : ''}
                  </span>
                  {r.annullatoIl === undefined ? (
                    <button className="tasto tasto--mini" disabled={occupato} onClick={() => annulla(r.id)} title={r.tipo === 'sposta' ? 'Rimette qui le chat archiviate e riporta la loro casa su questo PC. Sull’altro PC la copia resta: lì risulterà fuori casa.' : 'Rimette le chat al loro posto e le case com’erano prima. Se al loro posto c’è già un’altra copia, non la sovrascrive.'}>
                      {r.tipo === 'sposta' ? 'Annulla lo spostamento' : 'Annulla questo riordino'}
                    </button>
                  ) : null}
                </div>
              ))}
            </details>
          ) : null}
        </div>
        <div className="dialogo__piede" style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <span className="account__nota" style={{ flex: 1 }}>{scelte.size} chat spuntate</span>
          <button className="tasto" onClick={onChiudi}>Chiudi</button>
          <button className="tasto tasto--primario" disabled={scelte.size === 0 || occupato} onClick={riordina} title="Sposta le copie spuntate nella cartella di recupero e conferma la loro casa. Non cancella niente; si annulla da questa finestra.">
            {occupato ? 'Lavoro…' : `Riordina (${scelte.size})`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
