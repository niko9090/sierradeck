import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Aiuto } from './Aiuto'
import { PASSI_TRASLOCO } from '@shared/trasloco'

/**
 * «Sposta progetto da un PC all'altro» (0.65.0): una scelta e una conferma.
 *
 * Fino alla 0.64 era una procedura a sei passi che, alla fine, metteva le
 * chat di qui nel recupero senza confrontarle: Nicholas l'ha vissuta come
 * «cancella tutto». Adesso è il trasloco, lo stesso passaggio di «Rendi
 * residente»: gira sul PC di destinazione, confronta prima, unisce là quello
 * che serve e solo alla fine mette la copia di qui nel recupero (30 giorni).
 * L'avanzamento, passo per passo, si vede in «Progetti».
 */

type Props = { onChiudi: () => void; cwdIniziale?: string }

type Progetto = { cwd: string; nome: string; sessioni: string[]; titoli: string[] }
type Pc = { pcId: string; nome: string; versione: string; battito: string }

export function ModaleSposta({ onChiudi, cwdIniziale }: Props): React.JSX.Element {
  const [progetti, setProgetti] = useState<Progetto[] | undefined>(undefined)
  const [pc, setPc] = useState<Pc[]>([])
  const [cwd, setCwd] = useState(cwdIniziale ?? '')
  const [dest, setDest] = useState('')
  const [conferma, setConferma] = useState(false)
  const [lavoro, setLavoro] = useState(false)
  const [esito, setEsito] = useState<{ ok: boolean; messaggio: string } | undefined>(undefined)

  useEffect(() => {
    window.gestore.sposta.progetti().then(setProgetti).catch(() => setProgetti([]))
    window.gestore.sposta.pc().then(setPc).catch(() => setPc([]))
  }, [])
  const progetto = progetti?.find((p) => p.cwd === cwd)
  const nomeDest = pc.find((p) => p.pcId === dest)?.nome ?? 'l’altro PC'

  const sposta = (): void => {
    setLavoro(true); setEsito(undefined)
    window.gestore.sposta.trasloco(cwd, dest)
      .then((r) => { setEsito(r); setConferma(false) })
      .catch((e: unknown) => setEsito({ ok: false, messaggio: String(e) }))
      .finally(() => setLavoro(false))
  }

  return createPortal(
    <div className="velo" onMouseDown={(e) => { if (e.target === e.currentTarget && !lavoro) onChiudi() }}>
      <div className="dialogo dialogo--largo" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialogo__testa">
          <span className="serigrafia con-aiuto">Sposta progetto da un PC all’altro<Aiuto di="Sposta progetto">
            È lo stesso passaggio di «Rendi residente»: {PASSI_TRASLOCO.map((p) => p.titolo.toLowerCase()).join(', ')}.
            {' '}{PASSI_TRASLOCO.map((p) => p.spiega).join(' ')}
          </Aiuto></span>
          <span style={{ flex: 1 }} />
          <button className="tasto tasto--mini" disabled={lavoro} onClick={onChiudi} aria-label="Chiudi">×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label className="account__nota">Il progetto:</label>
          <select className="account__campo" value={cwd} disabled={esito?.ok === true} onChange={(e) => { setCwd(e.target.value); setConferma(false) }}>
            <option value="">— scegli —</option>
            {(progetti ?? []).map((x) => <option key={x.cwd} value={x.cwd}>{x.nome} · {x.sessioni.length} chat · {x.cwd}</option>)}
          </select>
          {progetto !== undefined ? (
            <p className="account__nota">Le sue chat: {progetto.titoli.slice(0, 8).join(' · ')}{progetto.titoli.length > 8 ? ` … e altre ${progetto.titoli.length - 8}` : ''}</p>
          ) : null}
          <label className="account__nota">Dove va a vivere:</label>
          <select className="account__campo" value={dest} disabled={esito?.ok === true} onChange={(e) => { setDest(e.target.value); setConferma(false) }}>
            <option value="">— scegli il PC —</option>
            {pc.map((x) => <option key={x.pcId} value={x.pcId}>{x.nome} · {x.versione}</option>)}
          </select>
          {pc.length === 0 ? <p className="account__nota">Non conosco altri PC: compaiono quando hanno SierraDeck aperto con il Drive collegato.</p> : null}
          {conferma && progetto !== undefined ? (
            <div className="avviso">
              {nomeDest} confronta le copie, prende quello che serve, unisce le chat; solo alla fine la copia di qui va nel recupero
              (30 giorni). Niente si cancella. «Annulla tutto» rimette com’era.
            </div>
          ) : null}
          {esito !== undefined ? <div className={esito.ok ? 'riga__stato' : 'avviso'}>{esito.ok ? '✓ ' : '⚠ '}{esito.messaggio}</div> : null}
        </div>
        <div className="dialogo__piede" style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <span className="account__nota" style={{ flex: 1 }}>{esito?.ok === true ? 'L’avanzamento è in «Progetti».' : ''}</span>
          {esito?.ok === true ? (
            <button className="tasto tasto--primario" onClick={onChiudi}>Chiudi</button>
          ) : conferma ? (
            <>
              <button className="tasto" disabled={lavoro} onClick={() => setConferma(false)}>No</button>
              <button className="tasto tasto--primario" disabled={lavoro} onClick={sposta}>{lavoro ? 'Avvio…' : `Conferma: sposta su ${nomeDest}`}</button>
            </>
          ) : (
            <button className="tasto tasto--primario" disabled={progetto === undefined || dest === '' || lavoro} onClick={() => setConferma(true)}>Sposta…</button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
