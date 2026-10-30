import { TendinaMenu } from './TendinaMenu'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { byteLeggibili } from '@shared/spazio-drive'
import { chatDelProgetto, comeAprireChat, filtraChat, type AzioneProgetto, type FiltroPannello, type Pannello, type RigaChat, type RigaProgetto } from '@shared/pannello-drive'
import { azioniDivise, cartellaDelQuaderno, cercaProgetti, COLONNE, contaGruppi, GRUPPI, nelGruppo, ordinaProgetti, vistaDi, type Colonna, type Colore, type Gruppo, type Verso } from '@shared/progetti-vista'
import type { CartellaInRecupero, StatoRimozione } from '@shared/rimozione-sicura'
import { PASSI_SPOSTA, passoDi, testoConfermaSposta, type VistaSposta } from '@shared/sposta'
import { ContenutoDrive } from './ContenutoDrive'
import { SalvataggioDrive } from './PannelloAccount'
import { SpazioDrive } from './SpazioDrive'
import { Aiuto } from './Aiuto'
import { useLayoutStore } from '../state/layout'
import { voceMenu } from '@shared/menu-principale'
import { ogni } from '../state/sondaggio'

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

type Foglio = 'chat' | 'salvataggio' | 'contenuto' | 'spazio' | 'recupero'

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
  const [rim, setRim] = useState<{ stati: StatoRimozione[]; inRecupero: CartellaInRecupero[] }>({ stati: [], inRecupero: [] })
  const cerca = useRef<HTMLInputElement>(null)

  const leggi = useCallback((): void => {
    void window.gestore.casa.pannello().then((p) => { setD(p); setErrore(undefined) }).catch((e: unknown) => setErrore(`Non riesco a leggere i progetti: ${String(e)}`))
    void window.gestore.casa.rimozione.stati().then(setRim).catch(() => undefined)
  }, [])
  useEffect(() => { leggi(); return window.gestore.casa.suCambiate(leggi) }, [leggi])
  // Mentre uno spostamento lavora, si rilegge da solo.
  const lavora = d?.sposta !== undefined && d.sposta.fase !== 'fatta' && d.sposta.fase !== 'fallita'
  useEffect(() => {
    if (!lavora) return
    // Con la finestra nascosta ogni 15 s (0.85.2).
    return ogni(leggi, 2000)
  }, [lavora, leggi])
  const senzaSpazio = d !== undefined && d.spazio === undefined
  useEffect(() => {
    if (!senzaSpazio) return
    const t = setTimeout(leggi, 4000)
    return () => clearTimeout(t)
  }, [senzaSpazio, d, leggi])

  // Ogni riga con la sua vista: dal PC; se un PC vecchio non la manda, si calcola qui.
  const righe = useMemo(() => (d === undefined ? [] : d.progetti.map((r) => (r.vista !== undefined ? r : { ...r, vista: vistaDi(r, { ...(d.sposta !== undefined ? { sposta: d.sposta } : {}), io: d.io.id }) }))), [d])
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
  // Un'azione con `conferma` chiede prima di fare («Sposta su questo PC»).
  // «Apri su <PC>»: una chat nuova nella cartella là, e il riquadro dal vivo.
  const faiAzione = (progetto: string, a: AzioneProgetto): void => {
    const r = righe.find((x) => x.id === progetto)
    if (a.id === 'apri-remoto') {
      const res = r?.residente
      const cwd = r?.cartelle.find((c) => c.pc === res?.pc)?.percorso
      if (r === undefined || res === undefined || cwd === undefined) { setMsg('Non so in quale cartella sta il progetto su quel PC.'); return }
      setOccupato(true); setMsg(undefined)
      void window.gestore.remoto.apri(res.pc, cwd).then((e) => {
        if (!e.ok) { setMsg(`${res.nome}: ${e.messaggio}`); return }
        useLayoutStore.getState().addPane(cwd, r.nome, undefined, { remoto: { pcId: res.pc, pcNome: res.nome, cwd, dal: new Date().toISOString() } })
        onChiudi()
      }).catch((e: unknown) => setMsg(`Non è andata: ${String(e)}`)).finally(() => setOccupato(false))
      return
    }
    if (a.conferma === undefined) esegui(window.gestore.casa.azione({ azione: a.id, progetto }))
    else setAzioneDa({ progetto, nome: r?.nome ?? '', a })
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
      if (azioneDa !== undefined) return
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
                ['chat', 'Tutte le chat', 'Ogni chat con il PC dove vive il suo progetto.'],
                ['salvataggio', 'Salvataggio e arrivo', 'Salva ora, Ripristina, salvataggio automatico.'],
                ['contenuto', 'Il contenuto del Drive', 'Il catalogo per progetto e workspace. Leggerlo richiede qualche secondo.'],
                ['spazio', 'Spazio sul Drive', 'Quanto occupa ogni cosa, e le pulizie (sempre annullabili).'],
                ...(inRecupero.length > 0 ? [['recupero', `Cartelle in recupero (${inRecupero.length})`, 'Le cartelle tolte da questo PC, ripristinabili per 30 giorni.']] : [])
              ] as [Foglio, string, string][]).map(([id, testo, spiega]) => (
                <button key={id} className="progetti__voce" title={spiega} onClick={() => { setFoglio(id); setScelto(undefined); setMenu(false) }}>{testo}</button>
              ))}
            </TendinaMenu>
          ) : null}
        </span>
        <Aiuto di="Progetti">
          Ogni progetto vive su un PC solo (il <b>proprietario</b>) e sul Drive: lì girano le sue chat; dagli altri PC si aprono dal vivo, e se quel PC è spento quello che scrivi aspetta nella sua posta. Per portarlo su questo PC: «Sposta su questo PC».
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
      {d?.sposta !== undefined ? (
        <AvanzamentoSposta s={d.sposta} occupato={occupato}
          onRiprova={() => esegui(window.gestore.casa.azione({ azione: 'sposta-qui', progetto: d.sposta?.progetto ?? '' }))}
          onChiudi={() => esegui(window.gestore.casa.azione({ azione: 'sposta-chiudi' }))} />
      ) : null}

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
            onQuaderno={(cwd) => { onChiudi(); window.dispatchEvent(new CustomEvent('sierradeck:apri-quaderno', { detail: { cwd } })) }} />
        ) : null}

        {foglio !== undefined && d !== undefined ? (
          <div className="progetti__dettaglio progetti__dettaglio--foglio">
            <div className="progetti__dtesta">
              <span className="progetti__dtitolo">{foglio === 'chat' ? 'Tutte le chat' : foglio === 'salvataggio' ? 'Salvataggio e arrivo' : foglio === 'contenuto' ? 'Il contenuto del Drive' : foglio === 'spazio' ? 'Spazio sul Drive' : 'Cartelle in recupero'}</span>
              <span style={{ flex: 1 }} />
              <button className="tasto tasto--mini" onClick={() => setFoglio(undefined)} aria-label="Chiudi">×</button>
            </div>
            <div className="progetti__dcorpo">
              {foglio === 'chat' ? <TutteLeChat d={d} /> : null}
              {foglio === 'salvataggio' ? <SalvataggioDrive /> : null}
              {foglio === 'contenuto' ? <ContenutoDrive onChiudi={onChiudi} /> : null}
              {foglio === 'spazio' ? <SpazioDrive spazio={d.spazio} occupato={occupato} onAzione={(corpo) => esegui(window.gestore.casa.azione(corpo))} /> : null}
              {foglio === 'recupero' ? inRecupero.map((c) => (
                <div key={c.id} className="progetti__voceelenco" title={c.dove}>
                  <span style={{ flex: 1 }}><b>{c.nome}</b> <span className="progetti__quieto">· tolta il {quando(c.quando)} · fino al {quando(c.scadeIl)}</span></span>
                  <button className="tasto tasto--mini" disabled={occupato} onClick={() => esegui(window.gestore.casa.rimozione.ripristina(c.id))}>Ripristina</button>
                </div>
              )) : null}
            </div>
          </div>
        ) : null}
      </div>

      {azioneDa !== undefined && d !== undefined ? (
        <ConfermaAzione d={d} r={righe.find((x) => x.id === azioneDa.progetto)} a={azioneDa.a} nome={azioneDa.nome} occupato={occupato}
          onAnnulla={() => setAzioneDa(undefined)}
          onConferma={() => esegui(window.gestore.casa.azione({ azione: azioneDa.a.id, progetto: azioneDa.progetto }), () => setAzioneDa(undefined))} />
      ) : null}
    </div>,
    document.body
  )
}

/** Il dettaglio di un progetto, a destra: azioni in vista, poi problemi, spostamento, chat, cartelle, spazio, storia. */
function Dettaglio(p: {
  r: RigaProgetto; d: Pannello; rim: { stati: StatoRimozione[] }; occupato: boolean
  tutteLeChat: boolean; setTutteLeChat: (x: boolean) => void
  onChiudi: () => void; onAzione: (a: AzioneProgetto) => void; onApriChat: (c: RigaChat, come: NonNullable<ReturnType<typeof comeAprireChat>>) => void
  onQuaderno: (cwd: string) => void
}): React.JSX.Element {
  const { r, d, occupato } = p
  const v = r.vista ?? vistaDi(r)
  const az = azioniDivise(r.azioni)
  const chat = chatDelProgetto(d.chat, r)
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
        {r.residente !== undefined && !r.residente.qui ? (
          <span className="progetti__pillola" title={r.proprietarioAcceso === true ? 'acceso adesso' : 'non risponde adesso: si scrive nella sua posta'}
            style={{ color: r.proprietarioAcceso === true ? 'var(--verde)' : 'var(--testo-spento)' }}>su {r.residente.nome}</span>
        ) : null}
        <Aiuto di="Dove vive">Un progetto vive su un PC solo: lì girano le sue chat, e il Drive ne tiene la copia. Dagli altri PC si apre dal vivo; per portarlo qui c’è «Sposta su questo PC», che controlla file per file prima di cambiare PC e non cancella niente.</Aiuto>
      </div>
      {/* Le azioni restano in vista: non scorrono con il resto. */}
      <div className="progetti__azioni">
        {az.primaria !== undefined ? tasto(az.primaria, 'primaria') : null}
        {az.secondarie.map((a) => tasto(a, 'secondaria'))}
        {az.pericolo !== undefined ? tasto(az.pericolo, 'pericolo') : null}
        {r.azioni.length === 0 ? <span className="progetti__quieto">Nessuna azione da qui.</span> : null}
      </div>
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
        <Sezione titolo="Cartella" aiuto="Dove sta la cartella del progetto, sul PC dove vive.">
          {r.cartelle.length === 0 && r.cartellaTrovata === undefined ? <div className="progetti__quieto">Su nessun PC.</div> : null}
          {r.cartelle.map((c) => (
            <div key={`${c.pc}:${c.percorso}`} className="progetti__voceelenco"><b style={{ whiteSpace: 'nowrap' }}>{c.nome}{c.pc === d.io.id ? ' (qui)' : ''}</b> <span className="progetti__quieto progetti__percorso">{c.percorso}</span></div>
          ))}
          {r.cartellaTrovata !== undefined ? <div className="progetti__voceelenco"><b style={{ whiteSpace: 'nowrap' }}>{d.io.nome} (qui, per nome)</b> <span className="progetti__quieto progetti__percorso">{r.cartellaTrovata}</span></div> : null}
          {((): React.JSX.Element => {
            // Il quaderno di questo progetto (0.71.1): sta nella sua cartella, quindi solo dove ce n’è una.
            const q = cartellaDelQuaderno(r, d.io.id)
            return q !== undefined
              ? <button className="account__link" style={{ alignSelf: 'flex-start', textAlign: 'left' }} onClick={() => p.onQuaderno(q)}>Quaderno del progetto</button>
              : <span className="progetti__quieto">Il quaderno sta nella cartella del progetto: su questo PC non c’è.</span>
          })()}
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

/** «Tutte le chat» (dagli Strumenti): ogni chat con il PC dove vive il suo progetto. */
function TutteLeChat({ d }: { d: Pannello }): React.JSX.Element {
  const [filtro, setFiltro] = useState<FiltroPannello>('tutti')
  const [q, setQ] = useState('')
  const [quante, setQuante] = useState(100)
  const chat = filtraChat(d.chat, filtro, q, false)
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
            <span className="progetti__quieto">{c.residente === undefined ? 'fuori dai progetti' : c.residente.qui ? 'questo PC' : `su ${c.residente.nome}`} · {quando(c.ultimoUso)}</span>
          </span>
        </div>
      ))}
      {chat.length > quante ? <button className="account__link" onClick={() => setQuante(quante + 100)}>Mostra altre</button> : null}
    </>
  )
}

/** La conferma prima di un'azione: per «Sposta su questo PC» dice cosa succede, passo per passo. */
function ConfermaAzione({ d, r, a, nome, occupato, onAnnulla, onConferma }: {
  d: Pannello; r: RigaProgetto | undefined; a: AzioneProgetto; nome: string; occupato: boolean; onAnnulla: () => void; onConferma: () => void
}): React.JSX.Element {
  const t = a.id === 'sposta-qui' && r?.residente !== undefined
    ? testoConfermaSposta({ nome, daNome: r.residente.nome, qui: d.io.nome, daAcceso: r.proprietarioAcceso === true })
    : { titolo: `${a.titolo}: ${nome}`, righe: [a.testo], conferma: a.conferma ?? a.titolo }
  return (
    <div className="velo" onMouseDown={(e) => { if (e.target === e.currentTarget && !occupato) onAnnulla() }}>
      <div className="dialogo" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialogo__testa"><span className="serigrafia">{t.titolo}</span></div>
        {t.righe.map((x) => <p key={x} className="account__nota">{x}</p>)}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="tasto" autoFocus disabled={occupato} onClick={onAnnulla}>Annulla</button>
          <button className="tasto tasto--acceso" disabled={occupato} onClick={onConferma}>{occupato ? 'Un momento…' : t.conferma}</button>
        </div>
      </div>
    </div>
  )
}

/**
 * «Sposta su questo PC» in corso o appena finito (0.88.0): i passi, quello
 * attuale, e l'errore detto chiaro. Riparte da solo dopo un riavvio.
 */
function AvanzamentoSposta({ s, occupato, onRiprova, onChiudi }: { s: VistaSposta; occupato: boolean; onRiprova: () => void; onChiudi: () => void }): React.JSX.Element {
  const passo = passoDi(s.fase)
  const finita = s.fase === 'fatta' || s.fase === 'fallita'
  return (
    <div className="progetti__attende progetti__attende--colonna" role="status" aria-live="polite">
      <b>{s.fase === 'fatta' ? `«${s.nome}» adesso vive su questo PC` : s.fase === 'fallita' ? `Spostamento di «${s.nome}» fermo` : `Sposto «${s.nome}» da ${s.daNome} su questo PC`}</b>
      {PASSI_SPOSTA.map((x, i) => {
        const n = i + 1
        const segno = s.fase === 'fatta' || (passo > 0 && n < passo) ? '✓' : n === passo ? '●' : '○'
        return <span key={x.fase} className="progetti__quieto" style={n === passo ? { color: 'var(--blu)' } : undefined}>{segno} {x.titolo}</span>
      })}
      <span>{s.messaggio}</span>
      {s.errore !== undefined ? <span style={{ color: 'var(--ambra)' }}>⚠ {s.errore}</span> : null}
      {(s.avvisi ?? []).map((x) => <span key={x} className="progetti__quieto">{x}</span>)}
      {finita ? (
        <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {s.fase === 'fallita' ? <button className="tasto tasto--mini tasto--acceso" disabled={occupato} onClick={onRiprova}>Riprova</button> : null}
          <button className="tasto tasto--mini" disabled={occupato} onClick={onChiudi}>OK</button>
        </span>
      ) : null}
    </div>
  )
}
