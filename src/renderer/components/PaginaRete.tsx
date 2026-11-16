import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BattitoPc } from '@shared/posta'
import type { AvanzamentoInstallaLa } from '@shared/installa-la'
import type { MappaPc } from '@shared/collegamento'
import { alberoRete, type AlberoRete, type NodoRete, type RamoRete, type StatoAggiornamentoIo } from '@shared/albero-rete'
import { Aiuto } from './Aiuto'

const RILEGGI_MS = 15_000

/**
 * **La rete dei PC** (16/11): questo PC in cima, sotto i PC con SierraDeck e
 * gli Aiutanti, ognuno con stato, versione, collegamento, ultimo segno, carico
 * e l'aggiornamento a distanza. Il modello sta in `@shared/albero-rete`.
 *
 * «Aggiorna da remoto» è lo stesso «Installa là» di Salute, e lo preme solo
 * chi usa il programma: due clic, il secondo conferma.
 */
export function PaginaRete({ onChiudi, aggiornamento }: { onChiudi: () => void; aggiornamento?: StatoAggiornamentoIo }): React.JSX.Element {
  const [pc, setPc] = useState<BattitoPc[] | undefined>(undefined)
  const [vive, setVive] = useState<Record<string, string>>({})
  const [mappa, setMappa] = useState<MappaPc | undefined>(undefined)
  const [installazioni, setInstallazioni] = useState<Record<string, AvanzamentoInstallaLa>>({})
  const [versione, setVersione] = useState('')
  const [adesso, setAdesso] = useState(Date.now())
  const [leggo, setLeggo] = useState(false)
  const [conferma, setConferma] = useState<string | undefined>(undefined)
  const [chiusi, setChiusi] = useState<Set<string>>(new Set())

  const leggi = useCallback((): void => {
    setLeggo(true)
    void Promise.allSettled([
      window.gestore.posta.pc().then(setPc),
      window.gestore.posta.versioniVive().then(setVive),
      window.gestore.salute.leggi().then((s) => setMappa(s.mappa)),
      window.gestore.salute.installaLaStato().then((l) => setInstallazioni(Object.fromEntries(l.map((a) => [a.pcId, a]))))
    ]).finally(() => { setLeggo(false); setAdesso(Date.now()) })
  }, [])

  useEffect(() => {
    void window.gestore.sistema.versione().then(setVersione).catch(() => undefined)
    leggi()
    const t = setInterval(leggi, RILEGGI_MS)
    const via = window.gestore.salute.suInstallaLa((a) => setInstallazioni((p) => ({ ...p, [a.pcId]: a })))
    return () => { clearInterval(t); via() }
  }, [leggi])

  useEffect(() => {
    const su = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (conferma !== undefined) setConferma(undefined)
      else onChiudi()
    }
    window.addEventListener('keydown', su)
    return () => window.removeEventListener('keydown', su)
  }, [conferma, onChiudi])

  const io = mappa?.nodi.find((n) => n.io === true)
  const albero = useMemo(() => alberoRete({
    io: { ...(io !== undefined ? { id: io.id } : {}), nome: io?.nome ?? 'Questo PC', versione: versione === '' ? '0.0.0' : versione, ...(aggiornamento !== undefined ? { aggiornamento } : {}) },
    pc: pc ?? [],
    vive,
    installazioni: Object.values(installazioni),
    ...(mappa !== undefined ? { mappa } : {}),
    adesso
  }), [io, versione, aggiornamento, pc, vive, installazioni, mappa, adesso])

  const aggiornaLa = (n: NodoRete): void => {
    if (conferma !== n.id) { setConferma(n.id); return }
    setConferma(undefined)
    void window.gestore.salute.installaLa(n.id).then((a) => setInstallazioni((p) => ({ ...p, [a.pcId]: a })))
  }
  const commuta = (id: string): void => setChiusi((p) => { const d = new Set(p); if (d.has(id)) d.delete(id); else d.add(id); return d })

  const accesi = albero.rami.reduce((t, r) => t + r.accesi, 0) + 1
  const totale = albero.rami.reduce((t, r) => t + r.nodi.length, 0) + 1

  return (
    <div className="progetti rete-pc" role="dialog" aria-label="Rete dei PC">
      <div className="progetti__testa">
        <span className="progetti__titolo">⌥ Rete dei PC</span>
        <span className="progetti__quieto">{accesi} accesi su {totale}</span>
        <Aiuto di="la rete dei PC">
          Questo PC in cima, sotto i PC con SierraDeck e gli Aiutanti, prima gli accesi. Per ognuno: versione (in ambra se è più
          vecchia di questa), come lo si raggiunge (diretto in rete o Tailscale, oppure solo via Drive), l’ultimo segno di vita, le
          chat aperte o lo stato dell’Aiutante, il carico. «Aggiorna da remoto» chiede a quel PC di installare la versione di questo
          (lo stesso «Installa là» di Salute): due clic, il secondo conferma, e l’avanzamento compare nel suo riquadro. Si rilegge
          ogni 15 secondi.
        </Aiuto>
        <span style={{ flex: 1 }} />
        <button className="tasto tasto--mini" onClick={leggi} disabled={leggo}>{leggo ? 'Guardo…' : 'Aggiorna'}</button>
        <button className="tasto tasto--mini" onClick={onChiudi} title="Chiudi (Esc)">Chiudi</button>
      </div>
      <div className="rete-pc__corpo">
        {pc === undefined ? <p className="progetti__quieto">Leggo i PC dal Drive…</p> : null}
        <VistaAlbero albero={albero} chiusi={chiusi} conferma={conferma} onCommuta={commuta} onAggiorna={aggiornaLa} />
      </div>
    </div>
  )
}

/** L'albero, senza chiamate: si prova con `renderToStaticMarkup`. */
export function VistaAlbero({ albero, chiusi, conferma, onCommuta, onAggiorna }: {
  albero: AlberoRete
  chiusi: ReadonlySet<string>
  conferma: string | undefined
  onCommuta: (id: string) => void
  onAggiorna: (n: NodoRete) => void
}): React.JSX.Element {
  return (
    <ul className="rete-albero">
      <li className="rete-albero__radice">
        <Nodo n={albero.radice} conferma={conferma} onAggiorna={onAggiorna} />
        <ul>
          {albero.rami.map((r) => (
            <Ramo key={r.id} r={r} chiuso={chiusi.has(r.id)} onCommuta={() => onCommuta(r.id)} conferma={conferma} onAggiorna={onAggiorna} />
          ))}
        </ul>
      </li>
    </ul>
  )
}

function Ramo({ r, chiuso, onCommuta, conferma, onAggiorna }: { r: RamoRete; chiuso: boolean; onCommuta: () => void; conferma: string | undefined; onAggiorna: (n: NodoRete) => void }): React.JSX.Element {
  return (
    <li className="rete-albero__ramo">
      <button className="rete-albero__titolo" aria-expanded={!chiuso} onClick={onCommuta}>
        <span aria-hidden="true">{chiuso ? '▸' : '▾'}</span> {r.titolo}
        <span className="progetti__quieto"> · {r.accesi} accesi su {r.nodi.length}</span>
      </button>
      {!chiuso ? (
        r.nodi.length === 0
          ? <div className="progetti__quieto rete-albero__vuoto">{r.id === 'aiutanti' ? 'Nessun Aiutante ancora.' : 'Nessun altro PC.'}</div>
          : <ul>{r.nodi.map((n) => <li key={n.id}><Nodo n={n} conferma={conferma} onAggiorna={onAggiorna} /></li>)}</ul>
      ) : null}
    </li>
  )
}

function Nodo({ n, conferma, onAggiorna }: { n: NodoRete; conferma: string | undefined; onAggiorna: (n: NodoRete) => void }): React.JSX.Element {
  return (
    <div className={`rete-nodo rete-nodo--${n.tipo}${n.acceso ? '' : ' rete-nodo--spento'}`}>
      <div className="rete-nodo__testa">
        <span className={`led ${n.acceso ? 'led--lavoro' : 'led--finito'}`} aria-hidden="true" />
        <b className="rete-nodo__nome">{n.nome}</b>
        {n.targhette.map((t) => <span key={t} className="rete-nodo__targa">{t}</span>)}
      </div>
      <dl className="rete-nodo__righe">
        {n.righe.map((r) => (
          <div key={r.etichetta} className="rete-nodo__riga">
            <dt>{r.etichetta}</dt>
            <dd className={r.tono !== undefined ? `rete-tono--${r.tono}` : undefined}>{r.valore}</dd>
          </div>
        ))}
      </dl>
      {n.aggiornamento !== undefined ? (
        <div className={`rete-nodo__agg rete-tono--${n.aggiornamento.tono}`}>
          <span>Aggiornamento: {n.aggiornamento.testo}</span>
          {n.aggiornamento.percento !== undefined ? (
            <span className="rete-nodo__barra"><span style={{ width: `${n.aggiornamento.percento}%` }} /></span>
          ) : null}
        </div>
      ) : null}
      {n.aggiornabile ? (
        <div className="rete-nodo__azioni">
          <button className={`tasto tasto--mini${conferma === n.id ? ' tasto--primario' : ''}`} onClick={() => onAggiorna(n)}
            title="Chiede a quel PC di scaricare e installare la versione di questo PC. Le sue chat si salvano e riprendono da sole.">
            {conferma === n.id ? `Sì, aggiorna ${n.nome}` : 'Aggiorna da remoto'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
