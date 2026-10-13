import { TendinaMenu } from './TendinaMenu'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { byteLeggibili } from '@shared/spazio-drive'
import { chatDelProgetto, comeAprireChat, filtraChat, testiCambioResidente, type AzioneProgetto, type FiltroPannello, type Pannello, type RigaChat, type RigaProgetto } from '@shared/pannello-drive'
import { azioniDivise, cercaProgetti, COLONNE, contaGruppi, GRUPPI, nelGruppo, ordinaProgetti, vistaDi, type Colonna, type Colore, type Gruppo, type Verso } from '@shared/progetti-vista'
import { eChiaveProgetto } from '@shared/allineamento'
import type { CartellaInRecupero, StatoRimozione } from '@shared/rimozione-sicura'
import { ModaleSposta } from './ModaleSposta'
import { ModaleRiordina } from './ModaleRiordina'
import { ContenutoDrive } from './ContenutoDrive'
import { SalvataggioDrive } from './PannelloAccount'
import { SpazioDrive } from './SpazioDrive'
import { TraslocoAvanzamento } from './TraslocoAvanzamento'
import { Aiuto } from './Aiuto'
import { useLayoutStore } from '../state/layout'
import { voceMenu } from '@shared/menu-principale'
import { destinazioniSposta, riassuntoSposta, type DestinazioneSposta } from '@shared/sposta-su'

/**
 * «Progetti» a piena pagina (0.69.0). Nicholas, 12/10: «rifai il menu
 * Progetti!! non si capisce nulla. Sfrutta la larghezza della pagina e
 * sistema tutto per bene». Prima: una finestra stretta con sei tasti, quattro
 * sezioni e i progetti a metà. Adesso: una tabella (Progetto · Dove vive ·
 * Copie · Chat · Spazio Drive · Stato), i gruppi in alto con la ricerca, il
 * dettaglio a destra con le azioni sempre in vista, e gli strumenti rari in
 * «Strumenti ▾». Le regole (stato, gruppi, ordine) sono in
 * `@shared/progetti-vista` e le calcola il PC; la scheda è
 * `vista-progetti-0-69-0.md`.
 */

const COLORE: Record<Colore, string> = { verde: 'var(--verde)', ambra: 'var(--ambra)', rosso: 'var(--rosso)', blu: 'var(--blu)' }
const quando = (iso: string | undefined): string => (iso === undefined ? 'mai' : new Date(iso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }))
const CHAT_IN_VISTA = 8

type Foglio = 'chat' | 'salvataggio' | 'contenuto' | 'spazio' | 'recupero' | 'piano'
type Cambio = { nome: string; sessioni: string[]; da?: { pc: string; nome: string }; verso: { pc: string; nome: string } }

export function VistaProgetti({ onChiudi }: { onChiudi: () => void }): React.JSX.Element {
  const [d, setD] = useState<Pannello | undefined>(undefined)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const [msg, setMsg] = useState<string | undefined>(undefined)
  const [occupato, setOccupato] = useState(false)
  const [gruppo, setGruppo] = useState<Gruppo>('tutti')
  const [q, setQ] = useState('')
  const [ordine, setOrdine] = useState<{ col: Colonna; verso: Verso }>({ col: 'stato', verso: 'su' })
  const [scelto, setScelto] = useState<string | undefined>(undefined)
  const [foglio, setFoglio] = useState<Foglio | undefined>(undefined)
  const [menu, setMenu] = useState(false)
  const [tutteLeChat, setTutteLeChat] = useState(false)
  const [azioneDa, setAzioneDa] = useState<{ progetto: string; nome: string; a: AzioneProgetto } | undefined>(undefined)
  const [cambio, setCambio] = useState<Cambio | undefined>(undefined)
  const [sposta, setSposta] = useState<string | undefined>(undefined)
  const [riordina, setRiordina] = useState(false)
  const [rim, setRim] = useState<{ stati: StatoRimozione[]; inRecupero: CartellaInRecupero[] }>({ stati: [], inRecupero: [] })
  const cerca = useRef<HTMLInputElement>(null)

  const leggi = useCallback((): void => {
    void window.gestore.casa.pannello().then((p) => { setD(p); setErrore(undefined) }).catch((e: unknown) => setErrore(`Non riesco a leggere i progetti: ${String(e)}`))
    void window.gestore.casa.rimozione.stati().then(setRim).catch(() => undefined)
  }, [])
  useEffect(() => { leggi(); return window.gestore.casa.suCambiate(leggi) }, [leggi])
  // Mentre qualcosa lavora (trasloco, unione, rimozione), si rilegge da solo.
  const lavora = d?.residenza?.some((s) => s.fase === 'analisi' || s.fase === 'unisco') === true ||
    (d?.traslochi ?? []).some((t) => t.finitoIl === undefined && t.annullatoIl === undefined && t.fermo === undefined) ||
    rim.stati.some((s) => s.fase === 'analisi' || s.fase === 'recupero')
  useEffect(() => {
    if (!lavora) return
    const t = setInterval(leggi, 2000)
    return () => clearInterval(t)
  }, [lavora, leggi])
  const senzaSpazio = d !== undefined && d.spazio === undefined
  useEffect(() => {
    if (!senzaSpazio) return
    const t = setTimeout(leggi, 4000)
    return () => clearTimeout(t)
  }, [senzaSpazio, d, leggi])

  // Ogni riga con la sua vista: dal PC; se un PC vecchio non la manda, si calcola qui.
  const righe = useMemo(() => (d === undefined ? [] : d.progetti.map((r) => (r.vista !== undefined ? r : { ...r, vista: vistaDi(r, { ...(d.traslochi !== undefined ? { traslochi: d.traslochi } : {}), ...(d.residenza !== undefined ? { residenza: d.residenza } : {}), ...(d.piano !== undefined ? { piano: d.piano } : {}), rimozione: rim.stati }) }))), [d, rim])
  const conti = useMemo(() => contaGruppi(righe), [righe])
  const elenco = useMemo(() => ordinaProgetti(cercaProgetti(righe.filter((r) => nelGruppo(r, gruppo)), q), ordine.col, ordine.verso), [righe, gruppo, q, ordine])
  const sel = righe.find((r) => r.id === scelto)
  // «Da sistemare» vuoto non si mostra: si torna a «Tutti».
  useEffect(() => { if (gruppo === 'da-sistemare' && conti['da-sistemare'] === 0) setGruppo('tutti') }, [gruppo, conti])

  const esegui = (p: Promise<{ messaggio?: string }>, dopo?: () => void): void => {
    setOccupato(true); setMsg(undefined)
    void p.then((r) => { setMsg(r.messaggio); dopo?.(); leggi() })
      .catch((e: unknown) => setMsg(`Non è andata: ${String(e)}`)).finally(() => setOccupato(false))
  }
  // Un'azione con `conferma` chiede prima di fare (Togli da questo PC: in rosso, «Annulla» già scelto).
  const faiAzione = (progetto: string, a: AzioneProgetto): void => {
    if (a.conferma === undefined) esegui(window.gestore.casa.azione({ azione: a.id, progetto }))
    else setAzioneDa({ progetto, nome: righe.find((x) => x.id === progetto)?.nome ?? '', a })
  }
  const apriChat = (c: RigaChat, come: NonNullable<ReturnType<typeof comeAprireChat>>): void => {
    const stato = useLayoutStore.getState()
    const gia = Object.values(stato.panes).find((p) => p.sessionUuid === c.sessione)
    if (gia !== undefined) { if (gia.ibernata === true) stato.sveglia(gia.id); onChiudi(); return }
    if (come.tipo === 'qui') stato.addPane(come.cwd, c.titolo, undefined, { sessionUuid: c.sessione })
    else stato.addPane(come.cwd, c.titolo, undefined, { sessionUuid: c.sessione, remoto: { pcId: come.pc, pcNome: come.nome, cwd: come.cwd, sessione: c.sessione } })
    onChiudi()
  }

  // Tastiera: Esc chiude prima il dettaglio, poi la ricerca, poi la vista; ↑↓ scorrono; «/» cerca; Invio apre.
  useEffect(() => {
    const su = (e: KeyboardEvent): void => {
      if (cambio !== undefined || azioneDa !== undefined || sposta !== undefined || riordina) return
      const inCampo = (e.target as HTMLElement | null)?.tagName === 'INPUT'
      if (e.key === 'Escape') {
        if (menu) setMenu(false)
        else if (foglio !== undefined) setFoglio(undefined)
        else if (scelto !== undefined) setScelto(undefined)
        else if (q !== '') setQ('')
        else onChiudi()
        return
      }
      if (e.key === '/' && !inCampo) { e.preventDefault(); cerca.current?.focus(); return }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && elenco.length > 0) {
        e.preventDefault()
        const i = elenco.findIndex((r) => r.id === scelto)
        const j = e.key === 'ArrowDown' ? Math.min(elenco.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1)
        setScelto(elenco[j]?.id); setFoglio(undefined)
        return
      }
      if (e.key === 'Enter' && !inCampo && sel !== undefined) {
        const apri = sel.azioni.find((a) => a.id === 'apri')
        if (apri !== undefined) faiAzione(sel.id, apri)
      }
    }
    window.addEventListener('keydown', su)
    return () => window.removeEventListener('keydown', su)
  })

  const intesta = (col: Colonna): void => setOrdine((o) => (o.col === col ? { col, verso: o.verso === 'su' ? 'giu' : 'su' } : { col, verso: 'su' }))
  const inRecupero = rim.inRecupero.filter((c) => c.ripristinataIl === undefined)
  const destra = foglio !== undefined || sel !== undefined

  return createPortal(
    <div className="progetti" role="dialog" aria-label="Progetti">
      <div className="progetti__testa">
        <span className="progetti__titolo">{voceMenu('progetti').icona} Progetti</span>
        <div className="progetti__gruppi" role="tablist">
          {GRUPPI.filter((g) => g.id !== 'da-sistemare' || conti['da-sistemare'] > 0).map((g) => (
            <button key={g.id} role="tab" aria-selected={gruppo === g.id} className={`progetti__gruppo${gruppo === g.id ? ' progetti__gruppo--acceso' : ''}${g.id === 'da-sistemare' ? ' progetti__gruppo--ambra' : ''}`} onClick={() => setGruppo(g.id)}>
              {g.testo} <span className="progetti__conto">{conti[g.id]}</span>
            </button>
          ))}
        </div>
        <input ref={cerca} className="campo campo--mini progetti__cerca" placeholder="Cerca progetto, PC o cartella  ( / )" value={q} onChange={(e) => setQ(e.target.value)} />
        <span style={{ flex: 1 }} />
        {d?.spazio?.misura !== undefined ? <button className="tasto tasto--mini" title="Lo spazio sul Drive e le pulizie" onClick={() => { setFoglio('spazio'); setScelto(undefined) }}>Drive {byteLeggibili(d.spazio.misura.totale.byte)}</button> : null}
        <button className="tasto tasto--mini" onClick={leggi} disabled={occupato}>Aggiorna</button>
        <span style={{ position: 'relative' }}>
          <button className="tasto tasto--mini" aria-expanded={menu} onClick={() => setMenu(!menu)}>Strumenti ▾</button>
          {menu ? (
            <TendinaMenu onChiudi={() => setMenu(false)}>
              {([
                ['chat', 'Tutte le chat', 'Ogni chat con il suo PC residente; lo cambi chat per chat.'],
                ['salvataggio', 'Salvataggio e arrivo', 'Salva ora, Ripristina, salvataggio automatico, «Fondi con il Drive».'],
                ['contenuto', 'Il contenuto del Drive', 'Il catalogo per progetto e workspace. Leggerlo richiede qualche secondo.'],
                ['spazio', 'Spazio sul Drive', 'Quanto occupa ogni cosa, e le pulizie (sempre annullabili).'],
                ...(inRecupero.length > 0 ? [['recupero', `Cartelle in recupero (${inRecupero.length})`, 'Le cartelle tolte da questo PC, ripristinabili per 30 giorni.']] : []),
                ...(d?.piano !== undefined && d.piano.azioni.length > 0 ? [['piano', 'Piano di allineamento', 'Cosa serve perché questo PC rispetti le scelte.']] : [])
              ] as [Foglio, string, string][]).map(([id, testo, spiega]) => (
                <button key={id} className="progetti__voce" title={spiega} onClick={() => { setFoglio(id); setScelto(undefined); setMenu(false) }}>{testo}</button>
              ))}
              <button className="progetti__voce" title="Le chat che stanno qui ma hanno casa su un altro PC: le metti da parte quando confermi." onClick={() => { setRiordina(true); setMenu(false) }}>Riordina le chat…</button>
              <button className="progetti__voce" title="Il PC che ospita ogni chat dei workspace." onClick={() => { setMenu(false); window.dispatchEvent(new Event('sierradeck:dove-vive')) }}>Dove vive ogni chat…</button>
              <button className="progetti__voce" title="Porta un progetto con chat e file da questo PC a un altro." onClick={() => { setSposta(''); setMenu(false) }}>Sposta progetto…</button>
            </TendinaMenu>
          ) : null}
        </span>
        <Aiuto di="Progetti">
          Ogni progetto vive su un PC (il <b>residente</b>): lì girano le sue chat; gli altri PC le guardano dal vivo. <b>Copie</b>: gli altri PC che hanno la cartella.
          <b> Stato</b>: <span style={{ color: 'var(--verde)' }}>a posto</span>, <span style={{ color: 'var(--blu)' }}>al lavoro</span> (una chat sta lavorando),
          <span style={{ color: 'var(--ambra)' }}> da sistemare</span> (con il motivo), <span style={{ color: 'var(--blu)' }}>spostamento in corso</span>.
          Clic su una riga: il dettaglio a destra con le azioni. Tasti: ↑↓, Invio apre, «/» cerca, Esc chiude. Niente si cancella mai: le copie tolte vanno nel recupero per 30 giorni.
        </Aiuto>
        <button className="tasto tasto--mini" onClick={onChiudi} aria-label="Chiudi">×</button>
      </div>

      {d !== undefined && d.pcDaAggiornare.length > 0 ? (
        <div className="progetti__striscia con-aiuto">{d.pcDaAggiornare.join(', ')}: {d.pcDaAggiornare.length === 1 ? 'va aggiornato' : 'vanno aggiornati'}
          <Aiuto>Finché non {d.pcDaAggiornare.length === 1 ? 'è aggiornato' : 'sono aggiornati'}, di {d.pcDaAggiornare.length === 1 ? 'quel PC' : 'quei PC'} si vedono solo le copie caricate sul Drive, non quelle sul suo disco.</Aiuto>
        </div>
      ) : null}
      {errore !== undefined ? <div className="progetti__striscia">{errore}</div> : null}
      {msg !== undefined ? <div className="progetti__striscia progetti__striscia--info">{msg} <button className="account__link" onClick={() => setMsg(undefined)}>×</button></div> : null}

      <div className={`progetti__corpo${destra ? ' progetti__corpo--destra' : ''}`}>
        <div className="progetti__tabella" role="grid">
          <div className="progetti__riga progetti__riga--testa" role="row">
            {COLONNE.map((c) => (
              <button key={c.id} role="columnheader" className={`progetti__cella progetti__cella--${c.id}`} onClick={() => intesta(c.id)} aria-sort={ordine.col === c.id ? (ordine.verso === 'su' ? 'ascending' : 'descending') : 'none'}>
                {c.testo}{ordine.col === c.id ? (ordine.verso === 'su' ? ' ▲' : ' ▼') : ''}
              </button>
            ))}
          </div>
          {d === undefined && errore === undefined ? [0, 1, 2, 3, 4].map((i) => <div key={i} className="progetti__riga progetti__riga--vuota" />) : null}
          {d !== undefined && elenco.length === 0 ? (
            <div className="progetti__vuoto">
              {q !== '' ? <>Nessun progetto per «{q}» · <button className="account__link" onClick={() => setQ('')}>Cancella ricerca</button></>
                : gruppo === 'da-sistemare' ? <span style={{ color: 'var(--verde)' }}>Tutto a posto</span>
                  : righe.length === 0 ? 'Nessun progetto ancora.' : 'Nessun progetto in questo gruppo.'}
            </div>
          ) : null}
          {elenco.map((r) => {
            const v = r.vista ?? vistaDi(r)
            const acceso = r.id === scelto
            return (
              <div key={r.id} role="row" tabIndex={0} aria-selected={acceso}
                className={`progetti__riga${acceso ? ' progetti__riga--scelta' : ''}`}
                style={acceso ? { boxShadow: `inset 3px 0 0 ${COLORE[v.stato.colore]}` } : undefined}
                onClick={() => { setScelto(acceso ? undefined : r.id); setFoglio(undefined) }}>
                <span className="progetti__cella progetti__cella--nome" title={r.cartelle.map((c) => `${c.nome}: ${c.percorso}`).join(String.fromCharCode(10))}>
                  <b>{r.nome}</b> <span className="progetti__quieto">{r.ultimoUso !== undefined ? quando(r.ultimoUso) : ''}</span>
                </span>
                <span className={`progetti__cella progetti__cella--dove${v.doveQui ? ' progetti__forte' : ''}`} style={r.residente === undefined ? { color: 'var(--ambra)' } : undefined}>{v.dove}</span>
                <span className="progetti__cella progetti__cella--copie" title={v.copie.nomi.join(', ')}>{v.copie.testo}</span>
                <span className="progetti__cella progetti__cella--chat">{v.chat.totali}{v.chat.alLavoro > 0 ? <span style={{ color: 'var(--blu)' }}> · {v.chat.alLavoro} al lavoro</span> : null}</span>
                <span className="progetti__cella progetti__cella--spazio" title={r.spazioDrive?.grandi.map((g) => `${g.percorso} (${byteLeggibili(g.byte)})`).join(String.fromCharCode(10))}>
                  {v.spazio.testo}{v.spazio.avviso ? <span style={{ color: 'var(--ambra)' }}> ⚠</span> : null}
                </span>
                <span className="progetti__cella progetti__cella--stato">
                  <span style={{ color: COLORE[v.stato.colore] }}>● {v.stato.parola}</span>
                  {v.stato.ragione !== undefined ? <span className="progetti__quieto"> · {v.stato.ragione}</span> : null}
                </span>
              </div>
            )
          })}
        </div>

        {sel !== undefined && foglio === undefined && d !== undefined ? (
          <Dettaglio r={sel} d={d} rim={rim} occupato={occupato} tutteLeChat={tutteLeChat} setTutteLeChat={setTutteLeChat}
            onChiudi={() => setScelto(undefined)} onAzione={(a) => faiAzione(sel.id, a)} onApriChat={apriChat}
            onTrasloco={(azione, id) => esegui(window.gestore.casa.azione({ azione, id }))}
            onResidenza={(azione, id) => esegui(window.gestore.casa.azione({ azione, progetto: sel.id, ...(id !== undefined ? { id } : {}) }))}
            onRimozione={(azione) => esegui(window.gestore.casa.rimozione[azione](sel.id))}
            onQuaderno={() => { onChiudi(); window.dispatchEvent(new CustomEvent('sierradeck:apri-pannello', { detail: 'quaderno' })) }}
            onSposta={(pc) => esegui(window.gestore.casa.azione({ azione: 'sposta-su', progetto: sel.id, pc }))} />
        ) : null}

        {foglio !== undefined && d !== undefined ? (
          <div className="progetti__dettaglio progetti__dettaglio--foglio">
            <div className="progetti__dtesta">
              <span className="progetti__dtitolo">{foglio === 'chat' ? 'Tutte le chat' : foglio === 'salvataggio' ? 'Salvataggio e arrivo' : foglio === 'contenuto' ? 'Il contenuto del Drive' : foglio === 'spazio' ? 'Spazio sul Drive' : foglio === 'recupero' ? 'Cartelle in recupero' : 'Piano di allineamento'}</span>
              <span style={{ flex: 1 }} />
              <button className="tasto tasto--mini" onClick={() => setFoglio(undefined)} aria-label="Chiudi">×</button>
            </div>
            <div className="progetti__dcorpo">
              {foglio === 'chat' ? <TutteLeChat d={d} occupato={occupato} onCambio={setCambio} /> : null}
              {foglio === 'salvataggio' ? <SalvataggioDrive /> : null}
              {foglio === 'contenuto' ? <ContenutoDrive onChiudi={onChiudi} /> : null}
              {foglio === 'spazio' ? <SpazioDrive spazio={d.spazio} occupato={occupato} onAzione={(corpo) => esegui(window.gestore.casa.azione(corpo))} /> : null}
              {foglio === 'recupero' ? inRecupero.map((c) => (
                <div key={c.id} className="progetti__voceelenco" title={c.dove}>
                  <span style={{ flex: 1 }}><b>{c.nome}</b> <span className="progetti__quieto">· tolta il {quando(c.quando)} · fino al {quando(c.scadeIl)}</span></span>
                  <button className="tasto tasto--mini" disabled={occupato} onClick={() => esegui(window.gestore.casa.rimozione.ripristina(c.id))}>Ripristina</button>
                  {Date.parse(c.scadeIl) <= Date.now() ? <button className="tasto tasto--mini" disabled={occupato} onClick={() => esegui(window.gestore.casa.rimozione.cestina(c.id))}>Nel Cestino</button> : null}
                </div>
              )) : null}
              {foglio === 'piano' ? (d.piano?.azioni ?? []).map((a) => (
                <div key={`${a.tipo}:${a.progetto}`} className="progetti__voceelenco con-aiuto">
                  <span style={{ flex: 1 }}><b>{a.nome}</b> <span className="progetti__quieto">· {a.tipo === 'porta-qui' ? (a.automatica ? 'porto qui' : 'da portare qui') : 'da togliere da qui'}</span></span>
                  <Aiuto>{a.perche}</Aiuto>
                  {a.tipo === 'solo-cloud' ? <button className="tasto tasto--mini" disabled={occupato} onClick={() => esegui(window.gestore.casa.rimozione.avvia(a.progetto))}>Confronta e togli…</button> : null}
                </div>
              )) : null}
            </div>
          </div>
        ) : null}
      </div>

      {azioneDa !== undefined ? (
        <div className="velo" onMouseDown={(e) => { if (e.target === e.currentTarget && !occupato) setAzioneDa(undefined) }}>
          <div className="dialogo" onMouseDown={(e) => e.stopPropagation()}>
            <div className="dialogo__testa"><span className="serigrafia">{azioneDa.a.titolo}: {azioneDa.nome}</span></div>
            <p className="account__nota">{azioneDa.a.testo}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="tasto" autoFocus disabled={occupato} onClick={() => setAzioneDa(undefined)}>Annulla</button>
              <button className={`tasto${azioneDa.a.id === 'solo-cloud-qui' ? ' tasto--pericolo' : ' tasto--acceso'}`} disabled={occupato}
                onClick={() => esegui(window.gestore.casa.azione({ azione: azioneDa.a.id, progetto: azioneDa.progetto }), () => setAzioneDa(undefined))}>{occupato ? 'Un momento…' : azioneDa.a.conferma}</button>
            </div>
          </div>
        </div>
      ) : null}
      {cambio !== undefined ? <ConfermaCambio d={d} cambio={cambio} occupato={occupato} onAnnulla={() => setCambio(undefined)}
        onConferma={() => esegui(window.gestore.casa.scegli({ sessioni: cambio.sessioni, pc: { id: cambio.verso.pc, nome: cambio.verso.nome } }), () => setCambio(undefined))} /> : null}
      {sposta !== undefined ? <ModaleSposta {...(sposta !== '' ? { cwdIniziale: sposta } : {})} onChiudi={() => { setSposta(undefined); leggi() }} /> : null}
      {riordina ? <ModaleRiordina onChiudi={() => { setRiordina(false); leggi() }} /> : null}
    </div>,
    document.body
  )
}

/** Il dettaglio di un progetto, a destra: azioni in vista, poi problemi, spostamento, chat, cartelle, spazio, storia. */
function Dettaglio(p: {
  r: RigaProgetto; d: Pannello; rim: { stati: StatoRimozione[] }; occupato: boolean
  tutteLeChat: boolean; setTutteLeChat: (x: boolean) => void
  onChiudi: () => void; onAzione: (a: AzioneProgetto) => void; onApriChat: (c: RigaChat, come: NonNullable<ReturnType<typeof comeAprireChat>>) => void
  onTrasloco: (azione: 'trasloco-riprendi' | 'trasloco-annulla', id: string) => void
  onResidenza: (azione: 'conferma-residenza' | 'annulla-residenza' | 'annulla-unione', id?: string) => void
  onRimozione: (azione: 'conferma' | 'annulla') => void
  onQuaderno: () => void
  onSposta: (pc: string) => void
}): React.JSX.Element {
  const { r, d, occupato } = p
  // «Sposta su ▾» (0.71.0): da qualsiasi PC verso qualsiasi PC, con conferma.
  const [menuSposta, setMenuSposta] = useState(false)
  const [verso, setVerso] = useState<DestinazioneSposta | undefined>(undefined)
  const destinazioni = r.spostaSu ?? destinazioniSposta(r, d.io, d.pc, Date.now())
  const conferma = verso !== undefined ? riassuntoSposta(r, verso) : undefined
  const v = r.vista ?? vistaDi(r)
  const az = azioniDivise(r.azioni)
  const chat = chatDelProgetto(d.chat, r)
  const traslochi = (d.traslochi ?? []).filter((t) => r.ids.includes(t.progetto) && t.annullatoIl === undefined && (t.finitoIl === undefined || t.scadeIl !== undefined))
  const res = d.residenza?.find((x) => r.ids.includes(x.progetto) && x.fase !== 'annullata')
  const rimoz = p.rim.stati.find((x) => r.ids.includes(x.progetto))
  const unioni = (d.unioni ?? []).filter((u) => r.ids.includes(u.progetto))
  const tasto = (a: AzioneProgetto, tipo: 'primaria' | 'secondaria' | 'pericolo'): React.JSX.Element => (
    <span key={a.id} className="con-aiuto" style={tipo === 'pericolo' ? { marginLeft: 'auto' } : undefined}>
      <button className={`tasto${tipo === 'primaria' ? ' tasto--acceso' : tipo === 'pericolo' ? ' tasto--pericolo' : ''}`} disabled={occupato} onClick={() => p.onAzione(a)}>{a.titolo}</button>
      <Aiuto di={a.titolo}>{a.testo}</Aiuto>
    </span>
  )
  return (
    <div className="progetti__dettaglio">
      <div className="progetti__dtesta">
        <span className="progetti__dtitolo" title={r.nome}>{r.nome}</span>
        <button className="tasto tasto--mini" onClick={p.onChiudi} aria-label="Chiudi il dettaglio">×</button>
      </div>
      <div style={{ padding: '0 16px 4px' }}>
        <span className="progetti__pillola" style={{ color: COLORE[v.stato.colore], borderColor: COLORE[v.stato.colore] }}>{v.stato.parola}{v.stato.ragione !== undefined ? ` · ${v.stato.ragione}` : ''}</span>
      </div>
      <div className="progetti__dove">
        <span className="serigrafia">Dove vive</span>
        <b style={v.doveQui ? undefined : { color: r.residente === undefined ? 'var(--ambra)' : undefined }}>{v.dove}</b>
        <span style={{ position: 'relative' }}>
          <button className="tasto tasto--mini tasto--acceso" aria-expanded={menuSposta} disabled={occupato || destinazioni.length < 2} onClick={() => setMenuSposta(!menuSposta)}
            title="Sposta il progetto, con chat, file e note, su un altro PC: da qualsiasi PC verso qualsiasi PC della stessa chiave di casa">Sposta su ▾</button>
          {menuSposta ? (
            <TendinaMenu onChiudi={() => setMenuSposta(false)}>
              {destinazioni.map((x) => (
                <button key={x.pc} className="progetti__voce" disabled={x.attuale} title={x.attuale ? 'Il progetto vive già qui' : `Sposta «${r.nome}» su ${x.nome}`}
                  onClick={() => { setMenuSposta(false); setVerso(x) }}>
                  <span style={{ color: x.acceso ? 'var(--verde)' : 'var(--testo-spento)' }}>●</span> {x.testo}
                </button>
              ))}
            </TendinaMenu>
          ) : null}
        </span>
        <Aiuto di="Sposta su">Il progetto va a vivere sul PC che scegli: là girano le sue chat, gli altri le guardano dal vivo. Il trasloco gira sul PC di arrivo (se non è questo, la richiesta gli arriva per il ponte): salva le copie degli altri PC sul Drive, confronta, prende quello che c’è solo altrove, unisce, e solo alla fine mette le copie vecchie nel recupero. Lo segui qui passo per passo, da qualsiasi PC. Niente si cancella: «Annulla tutto» per 30 giorni.</Aiuto>
      </div>
      {conferma !== undefined && verso !== undefined ? (
        <div className="progetti__attende progetti__attende--colonna" role="alertdialog" aria-label={conferma.titolo}>
          <b>{conferma.titolo}</b>
          {conferma.righe.map((x) => <span key={x} className="progetti__quieto">{x}</span>)}
          {conferma.avviso !== undefined ? <span style={{ color: 'var(--ambra)' }}>⚠ {conferma.avviso}</span> : null}
          <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="tasto tasto--mini" onClick={() => setVerso(undefined)}>Annulla</button>
            <button className="tasto tasto--mini tasto--acceso" disabled={occupato} onClick={() => { p.onSposta(verso.pc); setVerso(undefined) }}>{conferma.conferma}</button>
          </span>
        </div>
      ) : null}
      {/* Le azioni restano in vista: non scorrono con il resto. */}
      <div className="progetti__azioni">
        {az.primaria !== undefined ? tasto(az.primaria, 'primaria') : null}
        {az.secondarie.map((a) => tasto(a, 'secondaria'))}
        {az.pericolo !== undefined ? tasto(az.pericolo, 'pericolo') : null}
        {r.azioni.length === 0 ? <span className="progetti__quieto">Nessuna azione da qui.</span> : null}
      </div>
      {res !== undefined && (res.fase === 'attesa-conferma' || res.fase === 'in-uso') ? (
        <div className="progetti__attende">
          <span style={{ flex: 1 }}>Aspetta la tua conferma: unione delle copie</span>
          <button className="tasto tasto--mini tasto--acceso" disabled={occupato} onClick={() => p.onResidenza('conferma-residenza')}>Conferma</button>
          <button className="tasto tasto--mini" disabled={occupato} onClick={() => p.onResidenza('annulla-residenza')}>Annulla</button>
        </div>
      ) : null}
      {rimoz !== undefined && (rimoz.fase === 'attesa-conferma' || rimoz.fase === 'in-uso') ? (
        <div className="progetti__attende">
          <span style={{ flex: 1 }} className="con-aiuto">Aspetta la tua conferma: togliere da questo PC<Aiuto>{rimoz.messaggio}</Aiuto></span>
          <button className="tasto tasto--mini tasto--pericolo" disabled={occupato} onClick={() => p.onRimozione('conferma')}>Togli da questo PC</button>
          <button className="tasto tasto--mini" disabled={occupato} onClick={() => p.onRimozione('annulla')}>Annulla</button>
        </div>
      ) : null}

      <div className="progetti__dcorpo">
        {r.problemi.length > 0 ? (
          <Sezione titolo="Da sistemare" aiuto="Ogni problema con il perché e cosa fare: apri il «?» della riga.">
            {r.problemi.map((x) => (
              <div key={x.tipo} className="progetti__voceelenco con-aiuto" style={{ color: 'var(--ambra)' }}>
                {x.titolo}<Aiuto di={x.titolo}>{x.spiega} <b>Cosa fare:</b> {x.cosaFare}</Aiuto>
              </div>
            ))}
          </Sezione>
        ) : null}
        {traslochi.length > 0 || (res !== undefined && res.fase !== 'attesa-conferma' && res.fase !== 'in-uso') || (rimoz !== undefined && rimoz.fase !== 'attesa-conferma' && rimoz.fase !== 'in-uso') ? (
          <Sezione titolo="Spostamento" aiuto="I passi dello spostamento in corso. Niente si cancella: «Annulla tutto» rimette com’era per 30 giorni.">
            {traslochi.map((t) => <TraslocoAvanzamento key={t.id} t={t} occupato={occupato} onAzione={p.onTrasloco} />)}
            {res !== undefined && res.fase !== 'attesa-conferma' && res.fase !== 'in-uso' ? <div className="progetti__voceelenco">{res.messaggio}</div> : null}
            {rimoz !== undefined && rimoz.fase !== 'attesa-conferma' && rimoz.fase !== 'in-uso' ? <div className="progetti__voceelenco">Togliere da questo PC: {rimoz.messaggio}</div> : null}
          </Sezione>
        ) : null}
        <Sezione titolo={`Chat (${chat.length})`} aiuto="Si aprono dove vivono: qui con la loro storia, o dal vivo sul PC residente (in viola). Le chat senza nome non sono elencate.">
          {chat.length === 0 ? <div className="progetti__quieto">Nessuna chat con nome.</div> : null}
          {chat.slice(0, p.tutteLeChat ? chat.length : CHAT_IN_VISTA).map((c) => {
            const come = comeAprireChat(c, r)
            const lavora = (c.alLavoroSu?.length ?? 0) > 0
            return (
              <div key={c.sessione} className="progetti__voceelenco">
                <span title={lavora ? `al lavoro su ${(c.alLavoroSu ?? []).join(', ')}` : 'ferma'} style={{ color: lavora ? 'var(--blu)' : 'var(--testo-spento)' }}>●</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.titolo}>{c.titolo}</span>
                <span className="progetti__quieto">{c.residente?.qui === false ? c.residente.nome : ''} {quando(c.ultimoUso)}</span>
                {come !== undefined ? (
                  <button className={`tasto tasto--mini${come.tipo === 'altrove' ? ' segno-remoto' : ''}`} onClick={() => p.onApriChat(c, come)}
                    title={come.tipo === 'altrove' ? `Dal vivo su ${come.nome}: ci scrivi da qui, gira là` : 'Qui, con la sua storia'}>
                    {come.tipo === 'altrove' ? `Guarda su ${come.nome}` : 'Apri'}
                  </button>
                ) : null}
              </div>
            )
          })}
          {chat.length > CHAT_IN_VISTA && !p.tutteLeChat ? <button className="account__link" onClick={() => p.setTutteLeChat(true)}>Mostra tutte ({chat.length})</button> : null}
        </Sezione>
        <Sezione titolo="Cartelle" aiuto="Dove sta la cartella del progetto su ogni PC.">
          {r.cartelle.length === 0 && r.cartellaTrovata === undefined ? <div className="progetti__quieto">Su nessun PC.</div> : null}
          {r.cartelle.map((c) => (
            <div key={`${c.pc}:${c.percorso}`} className="progetti__voceelenco"><b style={{ whiteSpace: 'nowrap' }}>{c.nome}{c.pc === d.io.id ? ' (qui)' : ''}</b> <span className="progetti__quieto progetti__percorso">{c.percorso}</span></div>
          ))}
          {r.cartellaTrovata !== undefined ? <div className="progetti__voceelenco"><b style={{ whiteSpace: 'nowrap' }}>{d.io.nome} (qui, per nome)</b> <span className="progetti__quieto progetti__percorso">{r.cartellaTrovata}</span></div> : null}
          <button className="account__link" style={{ alignSelf: 'flex-start', textAlign: 'left' }} onClick={p.onQuaderno}>Quaderno del progetto</button>
        </Sezione>
        <Sezione titolo="Spazio sul Drive" aiuto="Quanto occupa sul Drive. I file oltre 20 MB sono segnalati; oltre 50 MB restano a casa.">
          {r.spazioDrive === undefined ? <div className="progetti__quieto">Non ancora misurato.</div> : (
            <>
              <div className="progetti__voceelenco">{byteLeggibili(r.spazioDrive.byte)} in {r.spazioDrive.file} file</div>
              {[...r.spazioDrive.grandi].sort((a, b) => b.byte - a.byte).slice(0, 5).map((g) => (
                <div key={g.percorso} className="progetti__voceelenco" style={{ color: 'var(--ambra)' }}>⚠ {g.percorso} <span className="progetti__quieto">{byteLeggibili(g.byte)}</span></div>
              ))}
            </>
          )}
        </Sezione>
        {unioni.length > 0 ? (
          <Sezione titolo="Storia" aiuto="Le unioni degli ultimi 30 giorni: si possono annullare.">
            {unioni.map((u) => (
              <div key={u.id} className="progetti__voceelenco">
                <span style={{ flex: 1 }}>Unito il {quando(u.quando)} <span className="progetti__quieto">· fino al {quando(u.scadeIl)}</span></span>
                <button className="tasto tasto--mini" disabled={occupato} onClick={() => p.onResidenza('annulla-unione', u.id)}>Annulla l’unione</button>
              </div>
            ))}
          </Sezione>
        ) : null}
      </div>
    </div>
  )
}

function Sezione({ titolo, aiuto, children }: { titolo: string; aiuto: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="progetti__sezione">
      <span className="con-aiuto"><span className="serigrafia">{titolo}</span><Aiuto di={titolo}>{aiuto}</Aiuto></span>
      {children}
    </div>
  )
}

/** «Tutte le chat» (dagli Strumenti): ogni chat con il residente, da cambiare chat per chat. */
function TutteLeChat({ d, occupato, onCambio }: { d: Pannello; occupato: boolean; onCambio: (c: Cambio) => void }): React.JSX.Element {
  const [filtro, setFiltro] = useState<FiltroPannello>('tutti')
  const [q, setQ] = useState('')
  const [quante, setQuante] = useState(100)
  const chat = filtraChat(d.chat, filtro, q, false)
  const pc = [d.io, ...d.pc]
  return (
    <>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        {(['tutti', 'sbagliati', 'questo-pc', 'solo-cloud'] as FiltroPannello[]).map((f) => (
          <button key={f} className={`tasto tasto--mini${filtro === f ? ' tasto--acceso' : ''}`} onClick={() => setFiltro(f)}>{f === 'tutti' ? 'Tutte' : f === 'sbagliati' ? 'Da sistemare' : f === 'questo-pc' ? 'Su questo PC' : 'Solo cloud'}</button>
        ))}
        <input className="campo campo--mini" placeholder="Cerca" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 100 }} />
      </div>
      {chat.slice(0, quante).map((c) => (
        <div key={c.sessione} className="progetti__voceelenco" title={c.cwd}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...(c.problemi.length > 0 ? { color: 'var(--ambra)' } : {}) }}>{c.titolo}</span>
            <span className="progetti__quieto">{c.residente === undefined ? 'senza casa' : c.residente.qui ? 'questo PC' : c.residente.nome} · {quando(c.ultimoUso)}</span>
          </span>
          <select className="campo campo--mini" value="" disabled={occupato} title="Cambia il PC residente di questa chat"
            onChange={(e) => { const x = pc.find((y) => y.id === e.target.value); if (x !== undefined) onCambio({ nome: c.titolo, sessioni: [c.sessione], ...(c.residente !== undefined ? { da: { pc: c.residente.pc, nome: c.residente.nome } } : {}), verso: { pc: x.id, nome: x.nome } }) }}>
            <option value="">Residente…</option>
            {pc.map((x) => <option key={x.id} value={x.id} disabled={x.id === c.residente?.pc}>{x.nome}{x.id === d.io.id ? ' (questo PC)' : ''}</option>)}
          </select>
        </div>
      ))}
      {chat.length > quante ? <button className="account__link" onClick={() => setQuante(quante + 100)}>Mostra altre</button> : null}
    </>
  )
}

function ConfermaCambio({ d, cambio, occupato, onAnnulla, onConferma }: { d: Pannello | undefined; cambio: Cambio; occupato: boolean; onAnnulla: () => void; onConferma: () => void }): React.JSX.Element | null {
  if (d === undefined) return null
  const testi = testiCambioResidente({ cosa: 'chat', nome: cambio.nome, ...(cambio.da !== undefined ? { da: cambio.da } : {}), verso: cambio.verso, io: d.io.id, chat: cambio.sessioni.filter((s) => !eChiaveProgetto(s)).length })
  return (
    <div className="velo" onMouseDown={(e) => { if (e.target === e.currentTarget && !occupato) onAnnulla() }}>
      <div className="dialogo" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialogo__testa"><span className="serigrafia">{testi.titolo}</span></div>
        <p className="account__nota"><b>«{cambio.nome}»</b>: residente adesso {cambio.da === undefined ? 'nessuno' : cambio.da.nome}, dopo {cambio.verso.nome}.</p>
        <div className="account__nota con-aiuto">Non si cancella niente.
          <Aiuto di="cambio del residente">
            <b>Cosa succede</b><ul>{testi.succede.map((t) => <li key={t}>{t}</li>)}</ul>
            <b>Cosa non succede</b><ul>{testi.nonSuccede.map((t) => <li key={t}>{t}</li>)}</ul>
            <b>Se qualcosa non torna</b><ul>{testi.seNonTorna.map((t) => <li key={t}>{t}</li>)}</ul>
          </Aiuto>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="tasto" disabled={occupato} onClick={onAnnulla}>Annulla</button>
          <button className="tasto tasto--acceso" disabled={occupato} onClick={onConferma}>{occupato ? 'Cambio…' : 'Conferma'}</button>
        </div>
      </div>
    </div>
  )
}
