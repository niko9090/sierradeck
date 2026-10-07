import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { MenuPin } from './ChatConPin'
import { ModaleConferma } from './ModaleConferma'
import type { GruppoDove } from '@shared/ospite-chat'
import type { RegistroRiordino } from '@shared/una-casa'

/**
 * L'ospite di ogni chat (0.52.0) sullo schermo: il tasto 🏠 nella testata del
 * riquadro (clic o tasto destro), il menu «Ospitata da: PC», la conferma di
 * «Porta qui la chat» e la schermata «Dove vive ogni chat».
 *
 * Nicholas (07/10): «Posso fare una selezione delle chat quali sono i pc che
 * la devono ospitare così negli altri si elimina e va solo da remoto?»
 */

type Casa = { pc: string; pcNome: string; da: string; motivo: string; qui: boolean }

/** Apre la schermata «Dove vive ogni chat» da qualunque punto. */
export function apriDoveVive(): void {
  window.dispatchEvent(new CustomEvent('sierradeck:dove-vive'))
}

export function useCasa(sessione: string | undefined): Casa | undefined {
  const [c, setC] = useState<Casa | undefined>(undefined)
  const leggi = useCallback((): void => {
    if (sessione === undefined || sessione === '') return
    void window.gestore.casa.di(sessione).then(setC).catch(() => undefined)
  }, [sessione])
  useEffect(() => {
    leggi()
    return window.gestore.casa.suCambiate(leggi)
  }, [leggi])
  return c
}

/** Il tasto della testata: dice dove vive la chat; clic o tasto destro aprono la scelta. */
export function TastoOspite({ paneId, sessione, titolo, remotoSu }: { paneId: string; sessione: string; titolo: string; remotoSu?: string }): React.JSX.Element {
  const casa = useCasa(sessione)
  const [menu, setMenu] = useState<{ x: number; y: number } | undefined>(undefined)
  const [pc, setPc] = useState<{ id: string; nome: string }[]>([])
  const [io, setIo] = useState<{ id: string; nome: string } | undefined>(undefined)
  const [conferma, setConferma] = useState<{ id: string; nome: string } | undefined>(undefined)
  const [nota, setNota] = useState<string | undefined>(undefined)
  const apri = (x: number, y: number): void => {
    setMenu({ x, y })
    void window.gestore.casa.dove().then((d) => { setPc(d.pc); setIo(d.io) }).catch(() => undefined)
  }
  // Il tasto destro sul titolo del riquadro apre lo stesso menu.
  useEffect(() => {
    const suMenu = (e: Event): void => {
      const d = (e as CustomEvent<{ paneId: string; x: number; y: number }>).detail
      if (d?.paneId === paneId) apri(d.x, d.y)
    }
    window.addEventListener('sierradeck:ospite-menu', suMenu)
    return () => window.removeEventListener('sierradeck:ospite-menu', suMenu)
  })
  const scegli = (p: { id: string; nome: string }): void => {
    setConferma(undefined)
    void window.gestore.casa.scegli({ sessioni: [sessione], pc: p }).then((r) => setNota(r.messaggio)).catch((e: unknown) => setNota(`Non è andata: ${String(e)}`))
  }
  const dove = casa?.pcNome ?? remotoSu
  const scelta = casa?.da === 'nicholas' || casa?.da === 'sposta'
  return (
    <>
      <button
        className="comando-riquadro"
        onClick={(e) => apri(e.clientX, e.clientY)}
        onContextMenu={(e) => { e.preventDefault(); apri(e.clientX, e.clientY) }}
        title={dove !== undefined
          ? `«${titolo}» è ospitata da ${dove}${scelta ? ' (scelta tua)' : casa !== undefined ? ' (decisa da sola nella 0.42: puoi cambiarla)' : ''}. Clic: scegli quale PC la ospita`
          : `«${titolo}» non ha ancora un PC ospite: è di questo PC. Clic: scegli quale PC la ospita`}
        aria-label="Quale PC ospita questa chat"
        style={{ opacity: scelta ? 1 : 0.55 }}
      >
        🏠
      </button>
      {menu !== undefined ? (
        <MenuPin
          x={menu.x}
          y={menu.y}
          onChiudi={() => setMenu(undefined)}
          voci={[
            { testo: `Ospitata da: ${dove ?? (io?.nome ?? 'questo PC')}`, azione: () => setMenu(undefined), spenta: true },
            ...pc.map((p) => ({
              testo: `${(casa?.pc ?? io?.id) === p.id ? '✓ ' : ''}Ospitata da ${p.nome}${p.id === io?.id ? ' (questo PC)' : ''}`,
              azione: () => { setMenu(undefined); setConferma(p) }
            })),
            { testo: 'Dove vive ogni chat…', azione: () => { setMenu(undefined); apriDoveVive() } }
          ]}
        />
      ) : null}
      {conferma !== undefined ? (
        <ModaleConferma
          titolo={`Ospitata da ${conferma.nome}`}
          testo={conferma.id === io?.id
            ? `«${titolo}» lavorerà su questo PC (${conferma.nome}): il suo claude.exe parte qui, e sugli altri PC si apre solo dal vivo, guardando questo. Se la chat è aperta su un altro PC, là viene chiusa appena finisce il turno (mai a metà) e la copia di là va nella sua cartella di recupero: non si cancella niente, e si annulla da «Dove vive ogni chat». Se la copia più avanti è su un altro PC, prima di cambiare fai salvare quel PC sul Drive: qui arriva da sola.`
            : `«${titolo}» lavorerà su ${conferma.nome}: il suo claude.exe parte solo lì. Qui, e su ogni altro PC, si apre dal vivo su ${conferma.nome}. Prima salvo la copia di qui sul Drive, così ${conferma.nome} la trova; poi, appena la chat finisce il turno (mai a metà), la copia di qui va nella cartella di recupero di SierraDeck. Non si cancella niente, e si annulla da «Dove vive ogni chat».`}
          etichettaAzione={`Ospitala su ${conferma.nome}`}
          onConferma={() => scegli(conferma)}
          onAnnulla={() => setConferma(undefined)}
        />
      ) : null}
      {nota !== undefined ? <NotaOspite testo={nota} onChiudi={() => setNota(undefined)} /> : null}
    </>
  )
}

function NotaOspite({ testo, onChiudi }: { testo: string; onChiudi: () => void }): React.JSX.Element {
  useEffect(() => { const t = setTimeout(onChiudi, 9000); return () => clearTimeout(t) }, [onChiudi])
  return createPortal(<div className="nota-ospite" role="status" onClick={onChiudi}>{testo}</div>, document.body)
}

/**
 * «Porta qui la chat»: la casa diventa questo PC, dopo la conferma. È l'unico
 * modo in cui una chat con l'ospite altrove torna a partire qui.
 */
export function ConfermaPortaQui({ titolo, pcNome, sessione, onFatto, onAnnulla }: { titolo: string; pcNome: string; sessione: string; onFatto: () => void; onAnnulla: () => void }): React.JSX.Element {
  return (
    <ModaleConferma
      titolo="Porta qui la chat"
      testo={`«${titolo}» è ospitata da ${pcNome}, che adesso non risponde (non so se è acceso). Portandola qui la sua casa diventa questo PC: il suo claude.exe parte qui, con la copia di qui (o con quella sul Drive, se è più avanti e arriva). Quando ${pcNome} si riaccende lo viene a sapere, e se là la chat è aperta la chiude a fine turno e mette la sua copia nella cartella di recupero, senza cancellarla. Se su ${pcNome} c'era lavoro non ancora salvato sul Drive, resta in quella copia. Si torna indietro scegliendo di nuovo «Ospitata da ${pcNome}».`}
      etichettaAzione="Porta qui la chat"
      onConferma={() => {
        void window.gestore.casa.scegli({ sessioni: [sessione], pc: { id: 'qui', nome: '' } }).then(onFatto, onFatto)
      }}
      onAnnulla={onAnnulla}
    />
  )
}

function quando(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })
}

/** La schermata «Dove vive ogni chat»: tutte le chat dei workspace, un selettore per ciascuna e uno per workspace. */
export function ModaleDoveVive({ onChiudi }: { onChiudi: () => void }): React.JSX.Element {
  const [d, setD] = useState<{ io: { id: string; nome: string }; pc: { id: string; nome: string }[]; gruppi: GruppoDove[]; traslochi: RegistroRiordino[] } | undefined>(undefined)
  const [msg, setMsg] = useState<string | undefined>(undefined)
  const [occupato, setOccupato] = useState(false)
  const leggi = useCallback((): void => { void window.gestore.casa.dove().then(setD).catch((e: unknown) => setMsg(`Non riesco a leggere le case: ${String(e)}`)) }, [])
  useEffect(() => {
    leggi()
    const via = window.gestore.casa.suCambiate(leggi)
    const suTasto = (e: KeyboardEvent): void => { if (e.key === 'Escape') onChiudi() }
    window.addEventListener('keydown', suTasto)
    return () => { via(); window.removeEventListener('keydown', suTasto) }
  }, [leggi, onChiudi])
  const nomeDi = (id: string): string => d?.pc.find((p) => p.id === id)?.nome ?? id
  const scegli = (sessioni: string[], pcId: string, workspace?: string): void => {
    if (pcId === '' || occupato) return
    setOccupato(true); setMsg(undefined)
    void window.gestore.casa.scegli({ sessioni, pc: { id: pcId, nome: nomeDi(pcId) }, ...(workspace !== undefined ? { workspace } : {}) })
      .then((r) => { setMsg(r.messaggio); leggi() })
      .catch((e: unknown) => setMsg(`Non è andata: ${String(e)}`))
      .finally(() => setOccupato(false))
  }
  const annulla = (id: string): void => {
    setOccupato(true); setMsg(undefined)
    void window.gestore.casa.annulla(id).then((r) => {
      setMsg(r.ok ? `Annullato: ${r.rimessi} file rimessi al loro posto, e la chat è di nuovo ospitata da questo PC.${r.restano.length > 0 ? ` ${r.restano.length} restano nella cartella di recupero: ${r.restano.map((x) => x.perche).filter((v, i, a) => a.indexOf(v) === i).join('; ')}.` : ''}` : (r.messaggio ?? 'Non annullato.'))
      leggi()
    }).catch((e: unknown) => setMsg(`Non è andata: ${String(e)}`)).finally(() => setOccupato(false))
  }
  const fonte = (f: string): string => (f === 'scelta' ? 'scelta tua' : f === 'regola' ? 'decisa da sola (0.42)' : 'nessuna casa ancora')

  return createPortal(
    <div className="velo" onMouseDown={(e) => { if (e.target === e.currentTarget) onChiudi() }}>
      <div className="dialogo dialogo--largo" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialogo__testa">
          <span className="serigrafia">Dove vive ogni chat</span>
          <span style={{ flex: 1 }} />
          <button className="tasto tasto--mini" onClick={onChiudi} aria-label="Chiudi">×</button>
        </div>
        <p className="account__nota" style={{ margin: '0 0 8px' }}>
          Ogni chat ha <b>un PC ospite</b>: è lì che gira il suo claude.exe. Su tutti gli altri PC la chat <b>non parte mai</b>:
          si apre dal vivo sull’ospite (rete di casa, Tailscale, collegamento diretto o, lento, il Drive), da qualunque strada la
          apri — il ripristino del workspace, «Riprendi», un autopilota, una consegna, il telefono. Qui scegli l’ospite chat per
          chat, oppure per un workspace intero (vale per le chat che ha adesso). La scelta arriva subito agli altri PC accesi e,
          al più tardi in due minuti, a quelli che passano dal Drive; fra due scelte vince la più recente. Quando l’ospite è un
          altro PC, la copia di qui va nella <b>cartella di recupero</b> di SierraDeck appena la chat finisce il turno (mai a
          metà): non si cancella niente, e «Annulla» in fondo la rimette al suo posto. «Decisa da sola» sono le case scelte
          dalla 0.42 con la regola (dove c’era la cartella, dove ha lavorato per ultima): valgono anche loro, e le puoi cambiare.
        </p>
        {msg !== undefined ? <div className="riga__stato" style={{ marginBottom: 8 }}>{msg}</div> : null}
        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4 }}>
          {d === undefined ? <p className="account__nota">Leggo le chat dei workspace e le loro case…</p> : null}
          {d !== undefined && d.gruppi.length === 0 ? <p className="account__nota">Nessuna chat nei workspace di questo PC.</p> : null}
          {d?.gruppi.map((g) => (
            <div key={g.workspace} className="riordina__gruppo">
              <div className="dove__testa">
                <span className="serigrafia">{g.workspace} · {g.righe.length} chat</span>
                <span style={{ flex: 1 }} />
                <label className="account__nota">
                  Tutto il workspace su{' '}
                  <select className="campo campo--mini" value={g.ospiteComune ?? ''} disabled={occupato} onChange={(e) => scegli(g.righe.map((r) => r.sessione), e.target.value, g.workspace)}>
                    <option value="">{g.ospiteComune === undefined ? 'PC diversi' : '—'}</option>
                    {d.pc.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.id === d.io.id ? ' (questo PC)' : ''}</option>)}
                  </select>
                </label>
              </div>
              {g.righe.map((r) => (
                <div key={r.sessione} className="dove__riga" title={r.cwd}>
                  <span className="riordina__testo">
                    <b>{r.titolo}</b>{' '}
                    <span className="account__nota">· {r.qui ? 'parte qui' : `qui solo dal vivo su ${r.pcNome}`} · {fonte(r.fonte)}</span>
                    <span className="account__nota riordina__motivo">{r.motivo}</span>
                  </span>
                  <select className="campo campo--mini" value={r.pc} disabled={occupato} onChange={(e) => scegli([r.sessione], e.target.value)}>
                    {d.pc.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.id === d.io.id ? ' (questo PC)' : ''}</option>)}
                  </select>
                </div>
              ))}
            </div>
          ))}
          {d !== undefined && d.traslochi.length > 0 ? (
            <details className="riordina__storia" open>
              <summary className="account__nota" style={{ cursor: 'pointer' }}>Copie di qui messe da parte perché l’ospite è un altro PC ({d.traslochi.length}): si annullano da qui</summary>
              {d.traslochi.map((r) => (
                <div key={r.id} className="riordina__voce">
                  <span className="account__nota">
                    {quando(r.quando)} · ospite {r.verso?.nome ?? '?'}{r.verso?.cwd !== undefined ? ` (${r.verso.cwd})` : ''} · {r.spostamenti.length} file
                    {r.annullatoIl !== undefined ? ` · annullato il ${quando(r.annullatoIl)}` : ''}
                  </span>
                  {r.annullatoIl === undefined ? (
                    <button className="tasto tasto--mini" disabled={occupato} onClick={() => annulla(r.id)} title="Rimette la copia di qui al suo posto e riporta l’ospite su questo PC (lo sanno anche gli altri PC). Se al suo posto c’è già un’altra copia non la sovrascrive.">
                      Annulla
                    </button>
                  ) : null}
                </div>
              ))}
            </details>
          ) : null}
        </div>
        <div className="dialogo__piede" style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <span className="account__nota" style={{ flex: 1 }}>{d !== undefined ? `Questo PC: ${d.io.nome} · PC conosciuti: ${d.pc.map((p) => p.nome).join(', ')}` : ''}</span>
          <button className="tasto" onClick={onChiudi}>Chiudi</button>
        </div>
      </div>
    </div>,
    document.body
  )
}
