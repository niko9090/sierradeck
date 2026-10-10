import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { filtraChat, filtraProgetti, testiCambioResidente, type FiltroPannello, type Pannello, type RigaChat, type RigaProgetto } from '@shared/pannello-drive'
import { ModaleSposta } from './ModaleSposta'
import { chiaveProgetto, eChiaveProgetto } from '@shared/allineamento'

/**
 * Il pannello delle chat e dei progetti del Drive (0.58.0, tappa 1).
 *
 * Una riga per chat e per progetto con il PC residente, le copie, l'ultimo uso
 * e lo stato; le assegnazioni sbagliate in evidenza, ognuna spiegata; il cambio
 * del residente con una conferma che dice cosa succede, cosa no e cosa fare se
 * qualcosa non torna. Il cambio passa da `casa.scegli` (la stessa strada di
 * «Ospitata da» e «Porta qui»); spostare anche i file di un progetto è
 * «Sposta progetto», che si apre da qui. Le regole: `@shared/pannello-drive`.
 */

const STATO: Record<RigaChat['stato'], { testo: string; colore: string; spiega: string }> = {
  residente: { testo: 'residente', colore: 'var(--verde)', spiega: 'ha una casa, e il PC residente ne ha la copia' },
  'solo-cloud': { testo: 'solo cloud', colore: 'var(--testo-quieto, #8a94a0)', spiega: 'il PC residente non ne ha una copia, oppure non ha una casa: c’è sul Drive' },
  conflitto: { testo: 'in conflitto', colore: 'var(--ambra)', spiega: 'lavora (o ha lavorato) fuori dalla sua casa: vedi il problema sotto' }
}
const FILTRI: { id: FiltroPannello; testo: string }[] = [
  { id: 'tutti', testo: 'Tutti' }, { id: 'sbagliati', testo: 'Sbagliati' }, { id: 'questo-pc', testo: 'Di questo PC' }, { id: 'solo-cloud', testo: 'Solo cloud' }
]
const quando = (iso: string | undefined): string => (iso === undefined ? 'mai' : new Date(iso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }))
const PASSO = 150

type Cambio = { cosa: 'chat' | 'progetto'; nome: string; sessioni: string[]; da?: { pc: string; nome: string }; verso: { pc: string; nome: string }; cartellaLa?: boolean }

export function ModalePannelloDrive({ onChiudi }: { onChiudi: () => void }): React.JSX.Element {
  const [d, setD] = useState<Pannello | undefined>(undefined)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const [vista, setVista] = useState<'chat' | 'progetti'>('chat')
  const [filtro, setFiltro] = useState<FiltroPannello>('tutti')
  const [q, setQ] = useState('')
  const [quante, setQuante] = useState(PASSO)
  const [cambio, setCambio] = useState<Cambio | undefined>(undefined)
  const [msg, setMsg] = useState<string | undefined>(undefined)
  const [occupato, setOccupato] = useState(false)
  const [sposta, setSposta] = useState<string | undefined>(undefined)
  const leggi = useCallback((): void => {
    void window.gestore.casa.pannello().then((p) => { setD(p); setErrore(undefined) }).catch((e: unknown) => setErrore(`Non riesco a leggere le chat e le case: ${String(e)}`))
  }, [])
  useEffect(() => {
    leggi()
    const via = window.gestore.casa.suCambiate(leggi)
    const suTasto = (e: KeyboardEvent): void => { if (e.key === 'Escape' && cambio === undefined && sposta === undefined) onChiudi() }
    window.addEventListener('keydown', suTasto)
    return () => { via(); window.removeEventListener('keydown', suTasto) }
  }, [leggi, onChiudi, cambio, sposta])
  useEffect(() => { setQuante(PASSO) }, [vista, filtro, q])

  const pc = useMemo(() => (d === undefined ? [] : [d.io, ...d.pc]), [d])
  const chat = useMemo(() => (d === undefined ? [] : filtraChat(d.chat, filtro, q)), [d, filtro, q])
  const progetti = useMemo(() => (d === undefined ? [] : filtraProgetti(d.progetti, filtro, q)), [d, filtro, q])
  const sbagliati = d === undefined ? 0 : (vista === 'chat' ? d.chat : d.progetti).filter((r) => r.problemi.length > 0).length

  const conferma = (): void => {
    if (cambio === undefined) return
    setOccupato(true); setMsg(undefined)
    void window.gestore.casa.scegli({ sessioni: cambio.sessioni, pc: { id: cambio.verso.pc, nome: cambio.verso.nome } })
      .then((r) => { setMsg(r.messaggio); setCambio(undefined); leggi() })
      .catch((e: unknown) => setMsg(`Non è andata: ${String(e)}`))
      .finally(() => setOccupato(false))
  }
  const sceltaPc = (valore: string, fa: (verso: { pc: string; nome: string }) => void): void => {
    const p = pc.find((x) => x.id === valore)
    if (p !== undefined) fa({ pc: p.id, nome: p.nome })
  }

  const problemi = (r: RigaChat | RigaProgetto): React.JSX.Element | null => r.problemi.length === 0 ? null : (
    <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {r.problemi.map((x) => (
        <div key={x.tipo} className="account__nota" style={{ borderLeft: '3px solid var(--ambra)', paddingLeft: 6 }}>
          <b style={{ color: 'var(--ambra)' }}>{x.titolo}.</b> {x.spiega} <i>Cosa fare:</i> {x.cosaFare}
        </div>
      ))}
    </div>
  )
  const pallino = (s: RigaChat['stato']): React.JSX.Element => (
    <span className="account__nota" title={STATO[s].spiega} style={{ color: STATO[s].colore, whiteSpace: 'nowrap' }}>● {STATO[s].testo}</span>
  )

  const testi = cambio === undefined || d === undefined ? undefined
    : testiCambioResidente({ cosa: cambio.cosa, nome: cambio.nome, ...(cambio.da !== undefined ? { da: cambio.da } : {}), verso: cambio.verso, io: d.io.id, chat: cambio.sessioni.filter((s) => !eChiaveProgetto(s)).length, ...(cambio.cartellaLa !== undefined ? { cartellaLa: cambio.cartellaLa } : {}) })

  return createPortal(
    <div className="velo" onMouseDown={(e) => { if (e.target === e.currentTarget && cambio === undefined) onChiudi() }}>
      <div className="dialogo dialogo--largo" onMouseDown={(e) => e.stopPropagation()} style={{ maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div className="dialogo__testa">
          <span className="serigrafia">Chat e progetti del Drive</span>
          <span style={{ flex: 1 }} />
          <button className="tasto tasto--mini" onClick={leggi} disabled={occupato} title="Rileggi le case, le copie e il Drive">Aggiorna</button>
          <button className="tasto tasto--mini" onClick={onChiudi} aria-label="Chiudi">×</button>
        </div>
        <p className="account__nota" style={{ margin: '0 0 8px' }}>
          Ogni chat ha un <b>PC residente</b>: è lì che gira il suo claude.exe, e sugli altri PC si apre solo dal vivo, guardando quello.
          Qui vedi tutte le chat e tutti i progetti che stanno sul Drive o su questo PC: chi è il residente, quali PC ne hanno una
          copia (qui sul disco, oppure caricata sul Drive da un PC), quando sono state usate l’ultima volta e lo stato:
          <b> residente</b> (il PC residente ne ha la copia), <b>solo cloud</b> (c’è sul Drive, ma il residente non ne ha la copia, o non ha una casa),
          <b> in conflitto</b> (lavora fuori dalla sua casa). In ambra le <b>assegnazioni sbagliate</b>, ognuna con il perché e cosa fare.
          Cambiare il residente chiede sempre una conferma, e non cancella mai niente: le copie tolte vanno nella cartella di recupero.
          Delle copie degli altri PC si sa quello che hanno caricato sul Drive: una copia mai salvata là, da qui non si vede.
        </p>
        {errore !== undefined ? <div className="riga__stato" style={{ color: 'var(--ambra)' }}>{errore}</div> : null}
        {d !== undefined && d.pcDaAggiornare.length > 0 ? (
          <div className="riga__stato" style={{ color: 'var(--ambra)', marginBottom: 6 }}>
            {d.pcDaAggiornare.join(', ')} non {d.pcDaAggiornare.length === 1 ? 'dice' : 'dicono'} ancora quali chat e progetti {d.pcDaAggiornare.length === 1 ? 'ha' : 'hanno'} sul disco: {d.pcDaAggiornare.length === 1 ? 'va aggiornato' : 'vanno aggiornati'} alla 0.58. Fino ad allora, di {d.pcDaAggiornare.length === 1 ? 'quel PC' : 'quei PC'} si vedono solo le copie caricate sul Drive.
          </div>
        ) : null}
        {d?.piano !== undefined && d.piano.azioni.length > 0 ? (
          <div className="riordina__gruppo" style={{ marginBottom: 8 }}>
            <span className="serigrafia">Piano di allineamento di questo PC</span>
            <p className="account__nota" style={{ margin: '4px 0' }}>
              Cosa serve perché questo PC rispetti le scelte: i progetti di cui è residente devono esserci, gli altri restano solo cloud.
              «Porta qui» parte da solo solo quando la cartella qui non c’è affatto, quindi non sovrascrive niente; negli altri casi
              aspetta te. Per ora <b>niente viene tolto</b>: rendere solo cloud un progetto passerà da un controllo che recupera
              prima quello che c’è solo qui, e da una tua conferma.
            </p>
            {d.piano.azioni.map((a) => (
              <div key={`${a.tipo}:${a.progetto}`} className="account__nota" style={{ borderLeft: `3px solid ${a.tipo === 'porta-qui' ? 'var(--verde)' : 'var(--ambra)'}`, paddingLeft: 6, marginTop: 3 }}>
                <b>{a.tipo === 'porta-qui' ? (a.automatica ? 'Porto qui' : 'Da portare qui (decidi tu)') : 'Da rendere solo cloud (solo mostrato)'}: {a.nome}.</b> {a.perche}
              </div>
            ))}
          </div>
        ) : null}
        {msg !== undefined ? <div className="riga__stato" style={{ marginBottom: 6 }}>{msg}</div> : null}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
          <button className={`tasto tasto--mini${vista === 'chat' ? ' tasto--acceso' : ''}`} onClick={() => setVista('chat')}>Chat{d !== undefined ? ` (${d.chat.length})` : ''}</button>
          <button className={`tasto tasto--mini${vista === 'progetti' ? ' tasto--acceso' : ''}`} onClick={() => setVista('progetti')}>Progetti{d !== undefined ? ` (${d.progetti.length})` : ''}</button>
          <span style={{ width: 12 }} />
          {FILTRI.map((f) => (
            <button key={f.id} className={`tasto tasto--mini${filtro === f.id ? ' tasto--acceso' : ''}`} onClick={() => setFiltro(f.id)}>
              {f.testo}{f.id === 'sbagliati' && sbagliati > 0 ? ` (${sbagliati})` : ''}
            </button>
          ))}
          <input className="campo campo--mini" placeholder="Cerca titolo, cartella o PC" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
        </div>

        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 4 }}>
          {d === undefined && errore === undefined ? <p className="account__nota">Leggo le case, le copie di questo PC e il manifesto del Drive…</p> : null}
          {d !== undefined && vista === 'chat' && chat.length === 0 ? <p className="account__nota">Nessuna chat con questo filtro.</p> : null}
          {d !== undefined && vista === 'progetti' && progetti.length === 0 ? <p className="account__nota">Nessun progetto con questo filtro.</p> : null}
          {d !== undefined && vista === 'chat' ? chat.slice(0, quante).map((r) => (
            <div key={r.sessione} className="dove__riga" style={{ alignItems: 'flex-start', ...(r.problemi.length > 0 ? { background: 'rgba(255,170,0,0.06)' } : {}) }} title={r.cwd}>
              <span className="riordina__testo" style={{ flex: 1 }}>
                <b>{r.titolo}</b> {pallino(r.stato)}
                <span className="account__nota" style={{ display: 'block' }}>
                  Residente: {r.residente === undefined ? <i>nessuno</i> : <b>{r.residente.nome}{r.residente.qui ? ' (questo PC)' : ''}</b>}
                  {' · '}copie: {r.copie.length === 0 ? 'nessuna' : r.copie.map((c) => `${c.nome}${c.dove === 'qui' ? ' (qui sul disco)' : c.dove === 'disco' ? ' (sul suo disco)' : ' (caricata sul Drive)'}`).join(', ')}
                  {' · '}ultimo uso: {quando(r.ultimoUso)}
                  {r.cwd !== undefined ? <> · <span>{r.cwd}</span></> : null}
                </span>
                {problemi(r)}
              </span>
              <select className="campo campo--mini" value="" disabled={occupato} title="Cambia il PC residente di questa chat"
                onChange={(e) => sceltaPc(e.target.value, (verso) => setCambio({ cosa: 'chat', nome: r.titolo, sessioni: [r.sessione], ...(r.residente !== undefined ? { da: { pc: r.residente.pc, nome: r.residente.nome } } : {}), verso }))}>
                <option value="">Rendi residente…</option>
                {pc.map((p) => <option key={p.id} value={p.id} disabled={p.id === r.residente?.pc}>{p.nome}{p.id === d.io.id ? ' (questo PC)' : ''}</option>)}
              </select>
            </div>
          )) : null}
          {d !== undefined && vista === 'progetti' ? progetti.slice(0, quante).map((r) => {
            const sessioni = d.chat.filter((c) => c.progetto === r.id).map((c) => c.sessione)
            const qui = r.cartelle.find((c) => c.pc === d.io.id)
            return (
              <div key={r.id} className="dove__riga" style={{ alignItems: 'flex-start', ...(r.problemi.length > 0 ? { background: 'rgba(255,170,0,0.06)' } : {}) }}>
                <span className="riordina__testo" style={{ flex: 1 }}>
                  <b>{r.nome}</b> {pallino(r.stato)}
                  <span className="account__nota" style={{ display: 'block' }}>
                    Residente: {r.residente === undefined ? <i>nessuno</i> : <b>{r.residente.nome}{r.residente.qui ? ' (questo PC)' : ''}</b>}
                    {r.residente !== undefined ? (r.voluto ? ' (scelto per il progetto: gli altri PC lo tengono solo cloud)' : ' (dalla maggior parte delle sue chat: non ancora scelto)') : null}
                    {' · '}{r.chat} chat · cartella su: {r.cartelle.length === 0 ? 'nessun PC' : r.cartelle.map((c) => c.nome).join(', ')}
                    {' · '}ultimo uso: {quando(r.ultimoUso)}
                  </span>
                  {problemi(r)}
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <select className="campo campo--mini" value="" disabled={occupato} title="Scegli il PC residente del progetto: le sue chat vivono lì, gli altri PC lo tengono solo cloud"
                    onChange={(e) => sceltaPc(e.target.value, (verso) => setCambio({
                      // Anche lo stato voluto del progetto (0.58.0): residente là, solo cloud sugli altri.
                      cosa: 'progetto', nome: r.nome, sessioni: [...sessioni, chiaveProgetto(r.id)],
                      ...(r.residente !== undefined ? { da: { pc: r.residente.pc, nome: r.residente.nome } } : {}),
                      verso, cartellaLa: r.cartelle.some((c) => c.pc === verso.pc)
                    }))}>
                    <option value="">Rendi residente…</option>
                    {pc.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.id === d.io.id ? ' (questo PC)' : ''}</option>)}
                  </select>
                  {qui !== undefined ? <button className="tasto tasto--mini" disabled={occupato} onClick={() => setSposta(qui.percorso)} title="Sposta anche i file del progetto su un altro PC, con i controlli e la verifica">Sposta con i file…</button> : null}
                </span>
              </div>
            )
          }) : null}
          {d !== undefined && (vista === 'chat' ? chat.length : progetti.length) > quante
            ? <button className="tasto" onClick={() => setQuante(quante + PASSO)}>Mostra altre {Math.min(PASSO, (vista === 'chat' ? chat.length : progetti.length) - quante)}</button>
            : null}
        </div>
      </div>

      {cambio !== undefined && testi !== undefined ? (
        <div className="velo" onMouseDown={(e) => { if (e.target === e.currentTarget && !occupato) setCambio(undefined) }}>
          <div className="dialogo" onMouseDown={(e) => e.stopPropagation()}>
            <div className="dialogo__testa"><span className="serigrafia">{testi.titolo}</span></div>
            <p className="account__nota"><b>{cambio.cosa === 'chat' ? `Chat «${cambio.nome}»` : `Progetto «${cambio.nome}», ${cambio.sessioni.filter((s) => !eChiaveProgetto(s)).length} chat`}</b>: residente adesso {cambio.da === undefined ? 'nessuno' : cambio.da.nome}, dopo {cambio.verso.nome}.</p>
            <p className="account__nota"><b>Cosa succede</b></p>
            <ul className="account__nota">{testi.succede.map((t) => <li key={t}>{t}</li>)}</ul>
            <p className="account__nota"><b>Cosa non succede</b></p>
            <ul className="account__nota">{testi.nonSuccede.map((t) => <li key={t}>{t}</li>)}</ul>
            <p className="account__nota"><b>Se qualcosa non torna</b></p>
            <ul className="account__nota">{testi.seNonTorna.map((t) => <li key={t}>{t}</li>)}</ul>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="tasto" disabled={occupato} onClick={() => setCambio(undefined)}>Annulla</button>
              <button className="tasto tasto--acceso" disabled={occupato} onClick={conferma}>{occupato ? 'Cambio…' : 'Conferma'}</button>
            </div>
          </div>
        </div>
      ) : null}
      {sposta !== undefined ? <ModaleSposta cwdIniziale={sposta} onChiudi={() => { setSposta(undefined); leggi() }} /> : null}
    </div>,
    document.body
  )
}
