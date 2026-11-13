import { useCallback, useEffect, useMemo, useState } from 'react'
import { TESTI_AZIONI, type IdAzioneGestione, type RigaGestione, type VistaGestione } from '@shared/gestione-progetti'
import { byteLeggibili } from '@shared/spazio-drive'
import { Aiuto } from './Aiuto'
import { ModaleConferma } from './ModaleConferma'
import '../gestione-progetti.css'

/**
 * **Gestione progetti** (13/11): la finestra separata. Una riga per progetto
 * vero (i doppioni nella stessa riga, segnati), il dettaglio a destra con
 * **tutte** le scelte: proprietario, sposta, unisci, rinomina, workspace,
 * copie rimaste, togli dal Drive, elimina ovunque. Testi corti; il perché
 * dietro il «?». Ogni scelta che toglie qualcosa chiede conferma.
 */

type Filtro = 'tutti' | 'da-sistemare' | 'qui'
type Conferma = { titolo: string; testo: string; etichetta: string; corpo: Corpo }
type Corpo = { azione: IdAzioneGestione | 'ritira'; id?: string; ids?: string[]; tieni?: string; pc?: string; percorso?: string; nome?: string; ws?: string }

const quando = (iso: string | undefined): string => (iso === undefined ? '—' : new Date(iso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }))

function Titolo({ id, testo }: { id: IdAzioneGestione; testo?: string }): React.JSX.Element {
  return <span className="gp__etichetta">{testo ?? TESTI_AZIONI[id].titolo} <Aiuto di={TESTI_AZIONI[id].titolo}>{TESTI_AZIONI[id].spiega}</Aiuto></span>
}

export function GestioneProgetti(): React.JSX.Element {
  const api = window.gestore.gestione
  const [v, setV] = useState<VistaGestione | undefined>(undefined)
  const [errore, setErrore] = useState<string | undefined>(undefined)
  const [msg, setMsg] = useState<{ ok: boolean; testo: string } | undefined>(undefined)
  const [occupato, setOccupato] = useState(false)
  const [filtro, setFiltro] = useState<Filtro>('tutti')
  const [q, setQ] = useState('')
  const [scelto, setScelto] = useState<string | undefined>(undefined)
  const [conferma, setConferma] = useState<Conferma | undefined>(undefined)

  const leggi = useCallback((): void => {
    if (api === undefined) { setErrore('Questa versione non ha la gestione dei progetti.'); return }
    void api.vista().then((x) => { setV(x); setErrore(undefined) }).catch((e: unknown) => setErrore(`Non riesco a leggere i progetti: ${String(e)}`))
  }, [api])
  useEffect(() => { leggi(); return api?.suCambiata(leggi) }, [leggi, api])
  useEffect(() => { document.title = 'Gestione progetti — SierraDeck' }, [])

  const esegui = (corpo: Corpo): void => {
    if (api === undefined) return
    setOccupato(true); setMsg(undefined)
    void api.azione(corpo).then((r) => { setMsg({ ok: r.ok, testo: r.messaggio }); leggi() })
      .catch((e: unknown) => setMsg({ ok: false, testo: `Non è andata: ${String(e)}` }))
      .finally(() => setOccupato(false))
  }
  const chiedi = (c: Conferma): void => setConferma(c)

  const righe = useMemo(() => {
    const parole = q.toLowerCase().split(/\s+/).filter((x) => x !== '')
    return (v?.righe ?? []).filter((r) => {
      if (filtro === 'da-sistemare' && r.problemi.length === 0) return false
      if (filtro === 'qui' && r.proprietario?.qui !== true && !r.copie.some((c) => c.qui)) return false
      const t = `${r.nome} ${r.proprietario?.nome ?? ''} ${r.percorso ?? ''} ${r.workspace.map((w) => w.nome).join(' ')}`.toLowerCase()
      return parole.every((p) => t.includes(p))
    })
  }, [v, filtro, q])
  const sel = v?.righe.find((r) => r.id === scelto || r.ids.includes(scelto ?? ''))
  const daSistemare = v?.righe.filter((r) => r.problemi.length > 0).length ?? 0

  return (
    <div className="gp">
      <div className="gp__testa">
        <span className="gp__titolo">Gestione progetti</span>
        <div className="gp__filtri" role="tablist">
          {([['tutti', 'Tutti', v?.righe.length ?? 0], ['da-sistemare', 'Da sistemare', daSistemare], ['qui', 'Su questo PC', undefined]] as [Filtro, string, number | undefined][]).map(([id, t, n]) => (
            <button key={id} role="tab" aria-selected={filtro === id} className={`gp__filtro${filtro === id ? ' gp__filtro--acceso' : ''}`} onClick={() => setFiltro(id)}>
              {t}{n !== undefined ? <span className={`gp__conto${id === 'da-sistemare' && n > 0 ? ' gp__conto--ambra' : ''}`}> {n}</span> : null}
            </button>
          ))}
        </div>
        <input className="campo campo--mini gp__cerca" placeholder="Cerca progetto, PC, cartella, workspace" value={q} onChange={(e) => setQ(e.target.value)} />
        <span style={{ flex: 1 }} />
        <button className="tasto tasto--mini" onClick={leggi} disabled={occupato}>Aggiorna</button>
        <Aiuto di="Gestione progetti">
          Ogni progetto vive su <b>un PC</b> (il proprietario) e ha <b>un nome</b>: lo stesso per la cartella e per il workspace.
          Qui decidi di chi è, lo sposti, unisci i doppioni (stesso nome scritto in modi diversi: maiuscole, spazi, trattini, «(2)» non contano),
          lo rinomini, lo colleghi ai workspace, pulisci le copie rimaste, lo togli dal Drive o lo elimini ovunque.
          Niente si cancella davvero: le cartelle tolte vanno nel recupero per 30 giorni. Le scelte per un PC spento aspettano nella sua posta.
        </Aiuto>
      </div>

      {errore !== undefined ? <div className="gp__striscia">{errore}</div> : null}
      {msg !== undefined ? <div className={`gp__striscia${msg.ok ? ' gp__striscia--ok' : ''}`}>{msg.testo} <button className="account__link" onClick={() => setMsg(undefined)}>×</button></div> : null}
      {v?.migrazione !== undefined && (v.migrazione.rinominati.length > 0 || v.migrazione.collisioni.length > 0) ? (
        <div className="gp__striscia gp__striscia--info">
          Nomi sistemati il {quando(v.migrazione.fattaIl)}: {v.migrazione.rinominati.length} workspace con il nome della cartella
          {v.migrazione.collisioni.length > 0 ? <>, {v.migrazione.collisioni.length} lasciati com’erano</> : null}.
          <Aiuto di="Nomi sistemati">
            {v.migrazione.rinominati.map((r) => `«${r.da}» → «${r.a}»`).join(', ') || 'Nessuna rinomina.'}
            {v.migrazione.collisioni.length > 0 ? <><br /><br />Non rinominati: {v.migrazione.collisioni.map((c) => `${c.workspace.map((w) => `«${w}»`).join(', ')} (${c.perche})`).join('; ')}.</> : null}
            <br /><br />Le cartelle non sono state toccate: è cambiato solo il nome dei workspace. Una copia della lista di prima è accanto a workspaces.json.
          </Aiuto>
          {v.migrazione.rinominati.length > 0 && v.migrazione.tornataIl === undefined ? (
            <button className="account__link" disabled={occupato} onClick={() => chiedi({ titolo: 'Torna come prima', testo: `I ${v.migrazione?.rinominati.length ?? 0} workspace riprendono il nome di prima. Le cartelle restano come sono.`, etichetta: 'Torna come prima', corpo: { azione: 'torna-nomi' } })}> Torna come prima</button>
          ) : null}
        </div>
      ) : null}

      <div className="gp__corpo">
        <div className="gp__tabella" role="grid">
          <div className="gp__riga gp__riga--testa" role="row">
            <span>Progetto</span><span>Proprietario</span><span>Cartella</span><span>Copie</span><span>Workspace</span><span>Ultimo uso</span><span>Stato</span>
          </div>
          {v === undefined && errore === undefined ? <div className="gp__vuoto">Leggo i progetti…</div> : null}
          {v !== undefined && righe.length === 0 ? <div className="gp__vuoto">{q !== '' ? `Nessun progetto per «${q}».` : filtro === 'da-sistemare' ? 'Tutto a posto.' : 'Nessun progetto.'}</div> : null}
          {righe.map((r) => (
            <div key={r.id} role="row" tabIndex={0} aria-selected={sel?.id === r.id}
              className={`gp__riga${sel?.id === r.id ? ' gp__riga--scelta' : ''}`}
              onClick={() => setScelto(sel?.id === r.id ? undefined : r.id)}
              onKeyDown={(e) => { if (e.key === 'Enter') setScelto(r.id) }}>
              <span className="gp__nome"><b>{r.nome}</b>{r.ids.length > 1 ? <span className="gp__segno gp__segno--ambra" title="Doppioni"> ×{r.ids.length}</span> : null}</span>
              <span style={r.proprietario === undefined ? { color: 'var(--ambra)' } : undefined}>
                {r.proprietario === undefined ? 'nessuno' : <>{r.proprietario.qui ? <b>questo PC</b> : r.proprietario.nome}{!r.proprietario.acceso ? <span className="gp__quieto"> · spento</span> : null}</>}
              </span>
              <span className="gp__percorso" title={r.percorso}>{r.percorso ?? '—'}</span>
              <span>{r.copie.length > 0 ? <span style={{ color: 'var(--ambra)' }}>{r.copie.length}</span> : '—'}</span>
              <span className="gp__percorso" title={r.workspace.map((w) => `${w.nome} (${w.pcNome})`).join(String.fromCharCode(10))}>
                {r.workspace.length === 0 ? '—' : r.workspace.map((w) => w.nome + (w.qui ? '' : ` · ${w.pcNome}`)).join(', ')}
              </span>
              <span className="gp__quieto">{quando(r.ultimoUso)}</span>
              <span>{r.problemi.length === 0 ? <span style={{ color: 'var(--verde)' }}>● a posto</span> : <span style={{ color: 'var(--ambra)' }} title={r.problemi.map((p) => p.testo).join(String.fromCharCode(10))}>● {r.problemi[0]?.testo}{r.problemi.length > 1 ? ` (+${r.problemi.length - 1})` : ''}</span>}</span>
            </div>
          ))}
          {v !== undefined && v.workspaceSoli.length > 0 ? (
            <div className="gp__soli">
              <span className="gp__sezione">Workspace senza progetto <Aiuto di="Workspace senza progetto">Workspace di questo PC che non sono collegati a nessun progetto: scollegati a mano, con un progetto tolto, o con più progetti dello stesso nome (doppioni). Si collegano dal dettaglio di un progetto.</Aiuto></span>
              {v.workspaceSoli.map((w) => <span key={w.nome} className="gp__pillola" title={w.perche}>{w.nome}<span className="gp__quieto"> · {w.perche === 'ambiguo' ? 'doppioni' : w.perche === 'tolto' ? 'progetto tolto' : w.perche}</span></span>)}
            </div>
          ) : null}
        </div>
        {sel !== undefined && v !== undefined ? <Dettaglio r={sel} v={v} occupato={occupato} esegui={esegui} chiedi={chiedi} onChiudi={() => setScelto(undefined)} /> : null}
      </div>

      {conferma !== undefined ? (
        <ModaleConferma titolo={conferma.titolo} testo={conferma.testo} etichettaAzione={conferma.etichetta}
          onAnnulla={() => setConferma(undefined)}
          onConferma={() => { const c = conferma.corpo; setConferma(undefined); esegui(c) }} />
      ) : null}
    </div>
  )
}

function Dettaglio({ r, v, occupato, esegui, chiedi, onChiudi }: {
  r: RigaGestione; v: VistaGestione; occupato: boolean
  esegui: (c: Corpo) => void; chiedi: (c: Conferma) => void; onChiudi: () => void
}): React.JSX.Element {
  const [tieni, setTieni] = useState(r.id)
  const [nome, setNome] = useState(r.nomeCartella)
  const [verso, setVerso] = useState('')
  const [proprietario, setProprietario] = useState('')
  const [ws, setWs] = useState('')
  useEffect(() => { setTieni(r.id); setNome(r.nomeCartella); setVerso(''); setProprietario(''); setWs('') }, [r.id, r.nomeCartella])
  const altriPc = v.pc.filter((p) => p.id !== r.proprietario?.pc)
  const soli = v.workspaceSoli.map((w) => w.nome)
  const candidato = r.candidatiProprietario.find((c) => `${c.pc}|${c.percorso}` === proprietario)

  return (
    <div className="gp__dettaglio">
      <div className="gp__dtesta">
        <span className="gp__dtitolo">{r.nome}</span>
        <span style={{ flex: 1 }} />
        <button className="tasto tasto--mini" onClick={onChiudi} aria-label="Chiudi">×</button>
      </div>
      <div className="gp__dcorpo">
        {r.problemi.length > 0 ? <ul className="gp__problemi">{r.problemi.map((p, i) => <li key={i}>{p.testo}</li>)}</ul> : <div className="gp__ok">● A posto</div>}

        <div className="gp__blocco">
          <div className="gp__riga2"><span className="gp__quieto">Proprietario</span><span>{r.proprietario === undefined ? 'nessuno' : `${r.proprietario.qui ? 'questo PC' : r.proprietario.nome}${r.proprietario.acceso ? '' : ' (spento)'}`}</span></div>
          <div className="gp__riga2"><span className="gp__quieto">Cartella</span><span className="gp__percorso" title={r.percorso}>{r.percorso ?? '—'}</span></div>
          {r.spazioDrive !== undefined ? <div className="gp__riga2"><span className="gp__quieto">Sul Drive</span><span>{byteLeggibili(r.spazioDrive.byte)} · {r.spazioDrive.file} file</span></div> : null}
          <div className="gp__riga2"><span className="gp__quieto">Ultimo uso</span><span>{quando(r.ultimoUso)}</span></div>
          <div className="gp__tasti">
            {r.proprietario?.qui === true && r.cartellaQui ? <button className="tasto tasto--mini" disabled={occupato} onClick={() => esegui({ azione: 'apri', id: r.id })}>{TESTI_AZIONI.apri.titolo}</button> : null}
            {r.proprietario !== undefined && !r.proprietario.qui ? <button className="tasto tasto--mini" disabled={occupato} onClick={() => esegui({ azione: 'apri-remoto', id: r.id })}>Apri su {r.proprietario.nome}</button> : null}
          </div>
        </div>

        {r.ids.length > 1 ? (
          <div className="gp__blocco">
            <Titolo id="unisci" />
            {r.membri.map((m) => (
              <label key={m.id} className="gp__scelta">
                <input type="radio" name="tieni" checked={tieni === m.id} onChange={() => setTieni(m.id)} />
                <span>«{m.nome}» · {m.proprietarioNome ?? 'nessun proprietario'}{m.percorso !== undefined ? <span className="gp__quieto"> · {m.percorso}</span> : null}{m.cartellaEsiste === false ? <span style={{ color: 'var(--ambra)' }}> · cartella assente</span> : null}</span>
              </label>
            ))}
            <button className="tasto tasto--mini" disabled={occupato} onClick={() => {
              const m = r.membri.find((x) => x.id === tieni)
              chiedi({ titolo: 'Unisci doppioni', testo: `Resta «${m?.nome ?? ''}» di ${m?.proprietarioNome ?? 'nessuno'}; le altre ${r.ids.length - 1} voci escono dall’elenco. Le cartelle sui PC non si toccano.`, etichetta: 'Unisci', corpo: { azione: 'unisci', ids: r.ids, tieni } })
            }}>Unisci, tieni questa</button>
          </div>
        ) : null}

        <div className="gp__blocco">
          <Titolo id="imposta-proprietario" />
          <div className="gp__linea">
            <select className="campo campo--mini" value={proprietario} onChange={(e) => setProprietario(e.target.value)}>
              <option value="">Scegli…</option>
              {r.candidatiProprietario.map((c) => <option key={`${c.pc}|${c.percorso}`} value={`${c.pc}|${c.percorso}`}>{c.pc === v.io.id ? 'questo PC' : c.pcNome}: {c.percorso}</option>)}
              <option value={`${v.io.id}|`}>Questo PC: scegli la cartella…</option>
            </select>
            <button className="tasto tasto--mini" disabled={occupato || proprietario === ''} onClick={() => {
              const [pc, ...resto] = proprietario.split('|')
              const percorso = resto.join('|')
              const nomePc = pc === v.io.id ? 'questo PC' : v.pc.find((x) => x.id === pc)?.nome ?? pc
              chiedi({ titolo: 'Imposta proprietario', testo: `«${r.nome}» diventa di ${nomePc}${percorso !== '' ? `, cartella ${percorso}` : ''}. Niente si sposta.`, etichetta: 'Imposta', corpo: { azione: 'imposta-proprietario', id: candidato?.id ?? r.id, pc: pc ?? '', percorso } })
            }}>Imposta</button>
          </div>
        </div>

        {altriPc.length > 0 && r.proprietario !== undefined ? (
          <div className="gp__blocco">
            <Titolo id="sposta" />
            <div className="gp__linea">
              <select className="campo campo--mini" value={verso} onChange={(e) => setVerso(e.target.value)}>
                <option value="">Su quale PC…</option>
                {altriPc.map((p) => <option key={p.id} value={p.id}>{p.id === v.io.id ? 'questo PC' : p.nome}{p.acceso ? '' : ' (spento)'}</option>)}
              </select>
              <button className="tasto tasto--mini" disabled={occupato || verso === ''} onClick={() => {
                const nomePc = verso === v.io.id ? 'questo PC' : v.pc.find((x) => x.id === verso)?.nome ?? verso
                chiedi({ titolo: `Sposta su ${nomePc}`, testo: `«${r.nome}» passa a ${nomePc}: tutto passa dal Drive con le impronte; la copia di prima va nel recupero per 30 giorni.`, etichetta: 'Sposta', corpo: { azione: 'sposta', id: r.id, pc: verso } })
              }}>Sposta</button>
            </div>
          </div>
        ) : null}

        {r.proprietario !== undefined ? (
          <div className="gp__blocco">
            <Titolo id="rinomina" />
            <div className="gp__linea">
              <input className="campo campo--mini" value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Nome nuovo" />
              <button className="tasto tasto--mini" disabled={occupato || nome.trim() === '' || nome.trim() === r.nomeCartella} onClick={() => chiedi({
                titolo: 'Rinomina', etichetta: 'Rinomina', corpo: { azione: 'rinomina', id: r.id, nome: nome.trim() },
                testo: `Cartella e workspace di «${r.nomeCartella}» diventano «${nome.trim()}»${r.proprietario?.qui === true ? '' : `: lo fa ${r.proprietario?.nome ?? ''} appena legge la posta`}.`
              })}>Rinomina</button>
            </div>
          </div>
        ) : null}

        <div className="gp__blocco">
          <span className="gp__etichetta">Workspace <Aiuto di="Workspace">{TESTI_AZIONI.collega.spiega} {TESTI_AZIONI.scollega.spiega}</Aiuto></span>
          {r.workspace.length === 0 ? <div className="gp__quieto">Nessuno.</div> : r.workspace.map((w) => (
            <div key={`${w.pc}|${w.nome}`} className="gp__linea">
              <span>{w.nome}{w.qui ? '' : <span className="gp__quieto"> · {w.pcNome}</span>}{w.nomeDiverso ? <span style={{ color: 'var(--ambra)' }}> · nome diverso</span> : null}{w.qui && !w.collegato ? <span className="gp__quieto"> · per nome</span> : null}</span>
              <span style={{ flex: 1 }} />
              {w.qui && !w.collegato ? <button className="tasto tasto--mini" disabled={occupato} onClick={() => esegui({ azione: 'collega', id: r.id, ws: w.nome })}>{TESTI_AZIONI.collega.titolo}</button> : null}
              {w.qui ? <button className="tasto tasto--mini" disabled={occupato} onClick={() => esegui({ azione: 'scollega', id: r.id, ws: w.nome })}>{TESTI_AZIONI.scollega.titolo}</button> : null}
            </div>
          ))}
          {soli.length > 0 ? (
            <div className="gp__linea">
              <select className="campo campo--mini" value={ws} onChange={(e) => setWs(e.target.value)}>
                <option value="">Collega un workspace…</option>
                {soli.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <button className="tasto tasto--mini" disabled={occupato || ws === ''} onClick={() => esegui({ azione: 'collega', id: r.id, ws })}>{TESTI_AZIONI.collega.titolo}</button>
            </div>
          ) : null}
        </div>

        {r.copie.length > 0 ? (
          <div className="gp__blocco">
            <Titolo id="pulisci-copia" testo="Copie rimaste" />
            {r.copie.map((c) => (
              <div key={`${c.pc}|${c.percorso}`} className="gp__linea">
                <span className="gp__percorso" title={c.percorso}>{c.qui ? 'questo PC' : c.pcNome}: {c.percorso}</span>
                <span style={{ flex: 1 }} />
                <button className="tasto tasto--mini" disabled={occupato} onClick={() => chiedi({ titolo: 'Pulisci copia', testo: `La copia di «${r.nome}» su ${c.qui ? 'questo PC' : c.pcNome} (${c.percorso}) va nel recupero per 30 giorni, solo se è uguale al Drive e nessuna chat ci lavora.`, etichetta: 'Pulisci', corpo: { azione: 'pulisci-copia', id: c.id, pc: c.pc, percorso: c.percorso } })}>Pulisci</button>
              </div>
            ))}
          </div>
        ) : null}

        {r.richieste.length > 0 ? (
          <div className="gp__blocco">
            <span className="gp__etichetta">Richieste agli altri PC <Aiuto di="Richieste">Le scelte per un altro PC viaggiano nella sua posta: le fa appena la legge, anche se adesso è spento.</Aiuto></span>
            {r.richieste.map((x) => (
              <div key={x.id} className="gp__linea">
                <span>{TESTI_RICHIESTA[x.tipo]} · {x.pcNome} · <span style={{ color: x.stato === 'fatta' ? 'var(--verde)' : x.stato === 'fallita' ? 'var(--rosso)' : 'var(--ambra)' }}>{x.stato === 'attesa' ? 'in attesa' : x.stato}</span>{x.esito !== undefined ? <span className="gp__quieto" title={x.esito}> · {x.esito.slice(0, 80)}</span> : null}</span>
                <span style={{ flex: 1 }} />
                {x.stato !== 'attesa' ? <button className="account__link" onClick={() => esegui({ azione: 'ritira', id: x.id })}>×</button> : null}
              </div>
            ))}
          </div>
        ) : null}

        <div className="gp__blocco gp__blocco--pericolo">
          <div className="gp__linea">
            <Titolo id="togli-drive" />
            <span style={{ flex: 1 }} />
            <button className="tasto tasto--mini" disabled={occupato} onClick={() => chiedi({ titolo: 'Togli dal Drive', testo: `«${r.nome}» esce dall’elenco e i suoi file dal Drive. Le cartelle sui PC restano.`, etichetta: 'Togli dal Drive', corpo: { azione: 'togli-drive', id: r.id } })}>Togli</button>
          </div>
          <div className="gp__linea">
            <Titolo id="elimina-ovunque" />
            <span style={{ flex: 1 }} />
            <button className="tasto tasto--mini gp__rosso" disabled={occupato} onClick={() => chiedi({
              titolo: `Elimina «${r.nome}» ovunque`, etichetta: 'Elimina ovunque', corpo: { azione: 'elimina-ovunque', id: r.id, ids: r.ids },
              testo: `Le cartelle su ${[...new Set([r.proprietario?.nome, ...r.copie.map((c) => c.pcNome)].filter((x): x is string => x !== undefined))].join(', ') || 'nessun PC'} vanno nel recupero per 30 giorni, poi i file escono dal Drive. Un PC spento lo fa quando si riaccende.`
            })}>Elimina</button>
          </div>
        </div>
      </div>
    </div>
  )
}

const TESTI_RICHIESTA: Record<string, string> = {
  'progetto-rinomina': 'Rinomina',
  'progetto-elimina': 'Elimina',
  'progetto-pulisci-copia': 'Pulisci copia',
  'progetto-sposta-qui': 'Sposta'
}
