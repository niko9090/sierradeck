import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BattitoPc } from '@shared/posta'
import { inCorso, type AvanzamentoInstallaLa } from '@shared/installa-la'
import type { MappaPc as Mappa } from '@shared/collegamento'
import type { NoteAggiornamento } from '@shared/note-aggiornamento'
import type { StatoAggiornamentoIo } from '@shared/albero-rete'
import { computerDa, VISTE_COMPUTER, type Computer, type SchedaPc, type ChatDiScheda, type VistaComputer } from '@shared/computer-vista'
import { Aiuto } from './Aiuto'
import { MappaPc } from './MappaPc'
import { ModaleNote } from './ModaleNote'
import { ModalePosta } from './ModalePosta'
import { useLayoutStore } from '../state/layout'

const RILEGGI_MS = 15_000
const COLORE: Record<SchedaPc['colore'], string> = { verde: 'var(--verde)', ambra: 'var(--ambra)', rosso: 'var(--rosso)', blu: 'var(--blu)', quieto: 'var(--testo-quieto)' }

/** Cosa si può fare da una scheda: la pagina li collega, i test no. */
export type AzioniScheda = {
  onGuarda?: (s: SchedaPc, c: ChatDiScheda) => void
  onCassetta?: (s: SchedaPc) => void
  onInstalla?: (s: SchedaPc) => void
  onDismetti?: (s: SchedaPc) => void
  /** Id della scheda con un «Dismetti» che aspetta il secondo clic. */
  conferma?: string
  /** Id delle schede con la lista delle chat aperta. */
  espanse?: ReadonlySet<string>
  onEspandi?: (id: string) => void
  /** Esito di «Installa là» già in corso: il tasto dice «in corso». */
  occupati?: ReadonlySet<string>
}

/**
 * **La scheda di un PC**: una sola per le tre viste. Con `compatta` è una riga
 * (elenco, mappa); senza, la scheda piena (albero). Stato, parole e colori
 * vengono dalla scheda (`computerDa`), mai da qui. Senza chiamate: si prova con
 * `renderToStaticMarkup`.
 */
export function SchedaPcRiga({ s, compatta = false, azioni = {} }: { s: SchedaPc; compatta?: boolean; azioni?: AzioniScheda }): React.JSX.Element {
  const aperta = azioni.espanse?.has(s.id) === true
  const occupato = azioni.occupati?.has(s.id) === true
  return (
    <div className={`rete-nodo rete-nodo--${s.tipo} ${s.classe}${s.acceso ? '' : ' rete-nodo--spento'}`} data-stato={s.stato}>
      <div className="rete-nodo__testa">
        <span className={`led ${s.led}`} aria-hidden="true" />
        <b className="rete-nodo__nome">{s.nome}</b>
        <span className="rete-nodo__stato" style={{ color: COLORE[s.colore] }}>{s.parola}</span>
        {s.targhette.filter((t) => t !== s.parola).map((t) => <span key={t} className="rete-nodo__targa">{t}</span>)}
        {compatta ? (
          <span className="progetti__quieto rete-nodo__sintesi">
            {[s.strada, s.versione, s.tipo === 'pc' ? `${s.chat.length} chat` : undefined].filter((x) => x !== undefined && x !== '').join(' · ')}
          </span>
        ) : null}
      </div>
      {!compatta ? (
        <dl className="rete-nodo__righe">
          {s.versione !== '' ? <Riga etichetta="Versione" valore={s.versione} {...(s.versioneIndietro ? { tono: 'attenzione' } : {})} /> : null}
          {s.strada !== undefined ? <Riga etichetta="Strada" valore={s.strada} /> : null}
          {s.tipo === 'pc' ? <Riga etichetta="Chat aperte" valore={`${s.chat.length}${s.aspettano > 0 ? `, ${s.aspettano} aspettano te` : ''}`} {...(s.aspettano > 0 ? { tono: 'attenzione' } : {})} /> : null}
          {s.righe.map((r) => <Riga key={r.etichetta} etichetta={r.etichetta} valore={r.valore} {...(r.tono !== undefined ? { tono: r.tono } : {})} />)}
        </dl>
      ) : null}
      {s.aggiornamento !== undefined ? (
        <div className={`rete-nodo__agg rete-tono--${s.aggiornamento.tono}`}>
          <span>Aggiornamento: {s.aggiornamento.testo}</span>
          {s.aggiornamento.percento !== undefined ? <span className="rete-nodo__barra"><span style={{ width: `${s.aggiornamento.percento}%` }} /></span> : null}
        </div>
      ) : null}
      {s.tipo !== 'io' ? (
        <div className="rete-nodo__azioni">
          {s.chat.length > 0 ? (
            <button className="tasto tasto--mini" aria-expanded={aperta} onClick={() => azioni.onEspandi?.(s.id)} title="Le chat che quel PC ha aperte adesso">
              Chat aperte {aperta ? '▾' : '▸'}
            </button>
          ) : null}
          {s.azioni.cassetta ? <button className="tasto tasto--mini" onClick={() => azioni.onCassetta?.(s)} title="Quello che scrivi si esegue solo su quel PC, anche se è spento: lo consegna quando torna">Cassetta…</button> : null}
          {s.azioni.installaLa ? (
            <button className="tasto tasto--mini" disabled={occupato} onClick={() => azioni.onInstalla?.(s)} title="Quel PC scarica e installa la versione di questo; le sue chat si salvano e riprendono da sole">
              {occupato ? 'Installazione in corso…' : 'Installa là'}
            </button>
          ) : null}
          {s.azioni.dismetti ? <button className="tasto tasto--mini" onClick={() => azioni.onDismetti?.(s)} title="Toglie dalla lista un PC muto da più di una settimana">{azioni.conferma === s.id ? `Sì, dismetti ${s.nome}` : 'Dismetti'}</button> : null}
        </div>
      ) : null}
      {aperta && s.chat.length > 0 ? (
        <ul className="rete-nodo__chat">
          {s.chat.map((c, i) => (
            <li key={`${c.sessione ?? c.cwd}-${i}`}>
              <span title={c.cwd}>{c.titolo}{c.aspetta ? ' · aspetta te' : ''}</span>
              <button className="tasto tasto--mini" disabled={!s.azioni.guardaDalVivo} onClick={() => azioni.onGuarda?.(s, c)}
                title={s.azioni.guardaDalVivo ? 'Apre qui un riquadro con la chat, dal vivo' : `${s.nome} non è raggiungibile: dal vivo non si vede, usa la cassetta`}>
                Guarda dal vivo
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function Riga({ etichetta, valore, tono }: { etichetta: string; valore: string; tono?: string }): React.JSX.Element {
  return (
    <div className="rete-nodo__riga">
      <dt>{etichetta}</dt>
      <dd className={tono !== undefined ? `rete-tono--${tono}` : undefined}>{valore}</dd>
    </div>
  )
}

/** Albero: questo PC in cima, sotto i PC con SierraDeck e gli Aiutanti. */
export function VistaAlbero({ c, azioni, chiusi = new Set(), onCommuta }: { c: Computer; azioni?: AzioniScheda; chiusi?: ReadonlySet<string>; onCommuta?: (id: string) => void }): React.JSX.Element {
  const rami = [
    { id: 'pc', titolo: 'PC con SierraDeck', nodi: c.altri.filter((s) => s.tipo === 'pc'), vuoto: 'Nessun altro PC.' },
    { id: 'aiutanti', titolo: 'Aiutanti', nodi: c.altri.filter((s) => s.tipo === 'aiutante'), vuoto: 'Nessun Aiutante ancora.' }
  ]
  return (
    <ul className="rete-albero">
      <li className="rete-albero__radice">
        <SchedaPcRiga s={c.io} azioni={azioni ?? {}} />
        <ul>
          {rami.map((r) => (
            <li key={r.id} className="rete-albero__ramo">
              <button className="rete-albero__titolo" aria-expanded={!chiusi.has(r.id)} onClick={() => onCommuta?.(r.id)}>
                <span aria-hidden="true">{chiusi.has(r.id) ? '▸' : '▾'}</span> {r.titolo}
                <span className="progetti__quieto"> · {r.nodi.filter((n) => n.acceso).length} accesi su {r.nodi.length}</span>
              </button>
              {!chiusi.has(r.id) ? (
                r.nodi.length === 0
                  ? <div className="progetti__quieto rete-albero__vuoto">{r.vuoto}</div>
                  : <ul>{r.nodi.map((s) => <li key={s.id}><SchedaPcRiga s={s} azioni={azioni ?? {}} /></li>)}</ul>
              ) : null}
            </li>
          ))}
        </ul>
      </li>
    </ul>
  )
}

/** Elenco: una riga per PC. */
export function VistaElenco({ c, azioni }: { c: Computer; azioni?: AzioniScheda }): React.JSX.Element {
  return (
    <ul className="rete-elenco">
      {[c.io, ...c.altri].map((s) => <li key={s.id}><SchedaPcRiga s={s} compatta azioni={azioni ?? {}} /></li>)}
    </ul>
  )
}

/** Mappa: i collegamenti, e sotto le stesse schede in riga. */
export function VistaMappa({ c, mappa, azioni }: { c: Computer; mappa: Mappa | undefined; azioni?: AzioniScheda }): React.JSX.Element {
  return (
    <div className="rete-mappa">
      {mappa !== undefined && mappa.nodi.length > 1 ? <MappaPc mappa={mappa} /> : <p className="progetti__quieto">Nessun altro PC da mettere sulla mappa.</p>}
      <VistaElenco c={c} {...(azioni !== undefined ? { azioni } : {})} />
    </div>
  )
}

export function PaginaComputer({ onChiudi, aggiornamento, vistaIniziale = 'albero' }: { onChiudi: () => void; aggiornamento?: StatoAggiornamentoIo; vistaIniziale?: VistaComputer }): React.JSX.Element {
  const [vista, setVista] = useState<VistaComputer>(vistaIniziale)
  const [pc, setPc] = useState<BattitoPc[] | undefined>(undefined)
  const [vive, setVive] = useState<Record<string, string>>({})
  const [mappa, setMappa] = useState<Mappa | undefined>(undefined)
  const [dismettibili, setDismettibili] = useState<Set<string>>(new Set())
  const [installazioni, setInstallazioni] = useState<Record<string, AvanzamentoInstallaLa>>({})
  const [versione, setVersione] = useState('')
  const [adesso, setAdesso] = useState(Date.now())
  const [leggo, setLeggo] = useState(false)
  const [chiusi, setChiusi] = useState<Set<string>>(new Set())
  const [espanse, setEspanse] = useState<Set<string>>(new Set())
  const [cassetta, setCassetta] = useState<BattitoPc | undefined>(undefined)
  const [daDismettere, setDaDismettere] = useState<string | undefined>(undefined)
  const [esito, setEsito] = useState<string | undefined>(undefined)
  const [conferma, setConferma] = useState<{ pc: string; nome: string; versione: string; note?: NoteAggiornamento } | undefined>(undefined)
  const addPane = useLayoutStore((st) => st.addPane)

  const leggi = useCallback((): void => {
    setLeggo(true)
    void Promise.allSettled([
      window.gestore.posta.pc().then(setPc),
      window.gestore.posta.versioniVive().then(setVive),
      window.gestore.salute.leggi().then((s) => {
        setMappa(s.mappa)
        setDismettibili(new Set(s.voci.flatMap((v) => v.azioni.flatMap((a) => (a.id === 'dismetti-pc' ? [a.pc] : [])))))
      }),
      window.gestore.salute.installaLaStato().then((l) => setInstallazioni(Object.fromEntries(l.map((a) => [a.pcId, a]))))
    ]).finally(() => { setLeggo(false); setAdesso(Date.now()) })
  }, [])

  useEffect(() => {
    void window.gestore.sistema.versione().then(setVersione).catch(() => undefined)
    leggi()
    const t = setInterval(leggi, RILEGGI_MS)
    const via = window.gestore.salute.suInstallaLa((a) => {
      setInstallazioni((p) => ({ ...p, [a.pcId]: a }))
      if (a.fase === 'fatto') leggi()
    })
    return () => { clearInterval(t); via() }
  }, [leggi])

  useEffect(() => {
    const su = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || cassetta !== undefined) return
      if (conferma !== undefined) setConferma(undefined)
      else if (daDismettere !== undefined) setDaDismettere(undefined)
      else onChiudi()
    }
    window.addEventListener('keydown', su)
    return () => window.removeEventListener('keydown', su)
  }, [conferma, cassetta, daDismettere, onChiudi])

  const io = mappa?.nodi.find((n) => n.io === true)
  const c = useMemo(() => computerDa({
    io: { ...(io !== undefined ? { id: io.id } : {}), nome: io?.nome ?? 'Questo PC', versione: versione === '' ? '0.0.0' : versione, ...(aggiornamento !== undefined ? { aggiornamento } : {}) },
    pc: pc ?? [],
    vive,
    installazioni: Object.values(installazioni),
    ...(mappa !== undefined ? { mappa } : {}),
    dismettibili,
    adesso
  }), [io, versione, aggiornamento, pc, vive, installazioni, mappa, dismettibili, adesso])

  const chiediInstalla = (s: SchedaPc): void => {
    setConferma({ pc: s.id, nome: s.nome, versione: versione === '' ? '' : versione })
    window.gestore.salute.noteInstallaLa(s.id)
      .then((note) => setConferma((x) => (x?.pc === s.id ? { ...x, note } : x)))
      .catch((e: unknown) => setConferma((x) => (x?.pc === s.id ? { ...x, note: { versione, installata: '', note: [], fonte: 'nessuna', dove: 'https://github.com/niko9090/sierradeck/releases', avviso: `Non sono riuscito a leggere le note (${String(e)}): le trovi nella pagina delle versioni, https://github.com/niko9090/sierradeck/releases. Puoi installare lo stesso.` } } : x)))
  }
  const dismetti = (s: SchedaPc): void => {
    if (daDismettere !== s.id) { setDaDismettere(s.id); return }
    setDaDismettere(undefined)
    void window.gestore.salute.dismettiPc(s.id)
      .then((e) => { if (e.ok) { setEsito(undefined); leggi() } else setEsito(`Non dismesso: ${e.motivo ?? 'motivo sconosciuto'}`) })
      .catch((err: unknown) => setEsito(`Non dismesso: ${String(err)}`))
  }
  const guarda = (s: SchedaPc, ch: ChatDiScheda): void => {
    addPane(ch.cwd, ch.titolo, undefined, {
      ...(ch.sessione !== undefined ? { sessionUuid: ch.sessione } : {}),
      remoto: { pcId: s.id, pcNome: s.nome, cwd: ch.cwd, ...(ch.sessione !== undefined ? { sessione: ch.sessione } : {}) }
    })
  }
  const commuta = (id: string): void => setChiusi((p) => { const d = new Set(p); if (d.has(id)) d.delete(id); else d.add(id); return d })
  const espandi = (id: string): void => setEspanse((p) => { const d = new Set(p); if (d.has(id)) d.delete(id); else d.add(id); return d })

  const azioni: AzioniScheda = {
    onGuarda: guarda,
    onCassetta: (s) => setCassetta(pc?.find((b) => b.pcId === s.id)),
    onInstalla: chiediInstalla,
    onDismetti: dismetti,
    ...(daDismettere !== undefined ? { conferma: daDismettere } : {}),
    espanse,
    onEspandi: espandi,
    occupati: new Set(Object.values(installazioni).filter((a) => inCorso(a)).map((a) => a.pcId))
  }

  return (
    <div className="progetti rete-pc" role="dialog" aria-label="Computer">
      <div className="progetti__testa">
        <span className="progetti__titolo">⌂ Computer</span>
        <span className="progetti__quieto">{c.accesi} accesi su {c.totale}</span>
        <div className="progetti__gruppi" role="tablist">
          {VISTE_COMPUTER.map((v) => (
            <button key={v.id} role="tab" aria-selected={vista === v.id} className={`progetti__gruppo${vista === v.id ? ' progetti__gruppo--acceso' : ''}`} onClick={() => setVista(v.id)}>{v.testo}</button>
          ))}
        </div>
        <Aiuto di="Computer">
          Tutti i computer con lo stesso Drive, in tre viste: albero (questo PC in cima, sotto i PC con SierraDeck e gli Aiutanti), elenco
          e mappa dei collegamenti. Per ognuno: acceso o spento, strada (diretta in rete o Tailscale, oppure solo via Drive), versione
          (in ambra se è più vecchia di questa), le chat aperte con «Guarda dal vivo», la cassetta (un comando che si esegue solo là,
          anche se ora è spento) e «Installa là» (mostra cosa cambia, poi quel PC aspetta la quiete e si aggiorna; le sue chat
          riprendono da sole). Si rilegge ogni 15 secondi; «Aggiorna» bussa agli altri PC adesso.
        </Aiuto>
        <span style={{ flex: 1 }} />
        <button className="tasto tasto--mini" onClick={leggi} disabled={leggo}>{leggo ? 'Guardo…' : 'Aggiorna'}</button>
        <button className="tasto tasto--mini" onClick={onChiudi} title="Chiudi (Esc)">Chiudi</button>
      </div>
      {esito !== undefined ? <div className="progetti__striscia">{esito}</div> : null}
      <div className="rete-pc__corpo">
        {pc === undefined ? <p className="progetti__quieto">Leggo i PC dal Drive…</p> : null}
        {vista === 'albero' ? <VistaAlbero c={c} azioni={azioni} chiusi={chiusi} onCommuta={commuta} /> : null}
        {vista === 'elenco' ? <VistaElenco c={c} azioni={azioni} /> : null}
        {vista === 'mappa' ? <VistaMappa c={c} mappa={mappa} azioni={azioni} /> : null}
      </div>
      {cassetta !== undefined ? <ModalePosta pc={cassetta} vivo={c.altri.find((s) => s.id === cassetta.pcId)?.acceso === true} onChiudi={() => { setCassetta(undefined); leggi() }} /> : null}
      {conferma !== undefined ? (
        <ModaleNote
          titolo={`Installa là: ${conferma.nome} alla ${conferma.note?.versione !== undefined && conferma.note.versione !== '' ? conferma.note.versione : conferma.versione}`}
          {...(conferma.note !== undefined && conferma.note.installata !== '' ? { sotto: `${conferma.nome} adesso ha la ${conferma.note.installata}` } : {})}
          note={conferma.note?.note}
          etichetta={(n, i) => (i === 0 ? `La ${n.versione} (quella che si installa)` : `Saltata: ${n.versione}`)}
          {...(conferma.note?.avviso !== undefined ? { avviso: conferma.note.avviso } : {})}
          spiegazione={<>Premendo «Installa su {conferma.nome}», {conferma.nome} scarica la versione (se non l’ha già), poi <b>aspetta che le sue chat finiscano il turno</b> e il lavoro con il Drive, si chiude, installa e riparte; le chat là riprendono da sole. Su {conferma.nome} non devi fare niente.</>}
          tasti={<>
            <button className="tasto" onClick={() => setConferma(undefined)}>Non ora</button>
            <button className="tasto tasto--primario" autoFocus onClick={() => {
              const id = conferma.pc
              setConferma(undefined)
              void window.gestore.salute.installaLa(id).then((a) => setInstallazioni((p) => ({ ...p, [a.pcId]: a })))
            }}>Installa su {conferma.nome}</button>
          </>}
          onChiudi={() => setConferma(undefined)}
        />
      ) : null}
    </div>
  )
}
