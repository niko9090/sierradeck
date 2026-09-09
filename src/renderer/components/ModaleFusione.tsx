import { createPortal } from 'react-dom'
import { useEffect, useMemo, useState } from 'react'
import type { PianoFusione, VoceFusione, Azione, ModoWorkspace, EsitoFusione } from '../../main/cassaforte/fusione'
import type { StatoLavoro } from '../../main/cassaforte/lavoro-in-corso'
import { descriviLavoro } from '../progresso-sync'
import { AvanzamentoLavoro } from './AvanzamentoLavoro'
import { azioniPossibili, sceltePerTutte, gruppoInVigore, riassunto, riassuntoInParole, vociDaDecidere, type AzioneDiGruppo } from '../fusione-scelte'

type Props = {
  cassaforteDiversa: boolean
  onChiudi: (fatto: boolean) => void
}

const ETICHETTA_AZIONE: Record<Azione, string> = {
  carica: 'porta sul Drive',
  scarica: 'porta qui',
  copia: 'tieni tutte e due (l’altra accanto)',
  salta: 'lascia com’è'
}

function quandoBreve(iso: string | undefined): string {
  if (iso === undefined) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })
}

/** Le chat raggruppate per cartella di progetto: e' cosi' che uno le riconosce. */
function perCartella(voci: VoceFusione[]): { cartella: string; voci: VoceFusione[] }[] {
  const gruppi = new Map<string, VoceFusione[]>()
  for (const v of voci) {
    const k = v.cartella ?? '(cartella sconosciuta)'
    const g = gruppi.get(k) ?? []
    g.push(v)
    gruppi.set(k, g)
  }
  return [...gruppi.entries()]
    .map(([cartella, voci]) => ({ cartella, voci: [...voci].sort((a, b) => (b.quando ?? '').localeCompare(a.quando ?? '')) }))
    .sort((a, b) => b.voci.length - a.voci.length)
}

function descriviDove(v: VoceFusione): string {
  if (v.dove === 'pc') return 'c’è solo su questo PC'
  if (v.dove === 'drive') return 'c’è solo sul Drive'
  if (!v.diverse) return 'uguale di qua e di là'
  const kb = (n: number | undefined): string => (n === undefined ? '?' : `${Math.max(1, Math.round(n / 1024))} KB`)
  const quando = (t: number | undefined): string => (t === undefined ? '' : new Date(t).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }))
  return `diverse · PC ${kb(v.pc?.size)} ${quando(v.pc?.mtime)} · Drive ${kb(v.drive?.size)} ${quando(v.drive?.mtime)}`
}

function Elenco({ voci, scelte, conCopia, onScelta }: {
  voci: VoceFusione[]
  scelte: Record<string, Azione>
  conCopia: boolean
  onScelta: (percorso: string, a: Azione) => void
}): React.JSX.Element {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {voci.map((v) => {
        const possibili = azioniPossibili(v, conCopia)
        const attuale = scelte[v.percorso] ?? 'salta'
        return (
          <li key={v.percorso} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', fontSize: 12, padding: '4px 6px', borderRadius: 6, background: 'var(--fondo-cupo)' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.percorso}>
                <strong>{v.etichetta}</strong>
                {v.quando !== undefined ? <span style={{ opacity: 0.6 }}> · {quandoBreve(v.quando)}</span> : null}
                {v.sotto !== undefined ? <span style={{ opacity: 0.6 }}> · {v.sotto}</span> : null}
              </div>
              <div style={{ opacity: 0.6, fontSize: 11 }}>{descriviDove(v)}</div>
            </div>
            {possibili.length === 1 ? (
              <span style={{ fontSize: 11, opacity: 0.6 }}>{ETICHETTA_AZIONE[possibili[0] as Azione]}</span>
            ) : (
              <select className="account__campo" style={{ fontSize: 12, padding: '2px 6px' }} value={attuale} onChange={(e) => onScelta(v.percorso, e.target.value as Azione)}>
                {possibili.map((a) => <option key={a} value={a}>{ETICHETTA_AZIONE[a]}</option>)}
              </select>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * I tasti di gruppo: uno per verso, e quello in vigore resta acceso.
 *
 * Prima cambiavano le tendine di righe che stavano in sezioni chiuse e non
 * dicevano se erano gia' quello attivo: «ho premuto unisci tutto e non e'
 * cambiato niente». Adesso il tasto in vigore e' acceso, e accanto c'e' il
 * conto di cosa succede con le scelte di adesso.
 */
function TastiGruppo({ voci, conCopia, scelte, onTutte }: {
  voci: VoceFusione[]
  conCopia: boolean
  scelte: Record<string, Azione>
  onTutte: (a: AzioneDiGruppo) => void
}): React.JSX.Element {
  const decidibili = vociDaDecidere(voci, conCopia)
  // Niente da decidere: niente tasti. Quattro tasti tutti accesi su righe
  // che hanno una scelta sola erano solo rumore.
  if (decidibili.length === 0) {
    return <span style={{ fontSize: 11, opacity: 0.6 }}>tutte uguali di qua e di là: niente da decidere</span>
  }
  const haPc = decidibili.some((v) => v.dove !== 'drive')
  const haDrive = decidibili.some((v) => v.dove !== 'pc')
  const tasto = (a: AzioneDiGruppo, testo: string): React.JSX.Element => {
    const acceso = gruppoInVigore(voci, conCopia, a, scelte)
    return (
      <button
        className={`tasto tasto--mini${acceso ? ' tasto--acceso' : ''}`}
        aria-pressed={acceso}
        title={acceso ? 'è questa la scelta in vigore per tutte' : undefined}
        onClick={() => onTutte(a)}
      >{acceso ? '✓ ' : ''}{testo}</button>
    )
  }
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11, alignItems: 'center' }}>
      <span style={{ opacity: 0.6 }}>tutte:</span>
      {tasto('predefinite', 'unisci (consigliato)')}
      {haPc ? tasto('carica', 'solo dal PC al Drive') : null}
      {haDrive ? tasto('scarica', 'solo dal Drive al PC') : null}
      {conCopia ? tasto('copia', 'le diverse: tieni tutte e due') : null}
      {tasto('salta', 'lascia tutto com’è')}
    </div>
  )
}

/** Il conto di un gruppo con le scelte di adesso, accanto al suo titolo. */
function Conto({ voci, scelte }: { voci: VoceFusione[]; scelte: Record<string, Azione> }): React.JSX.Element {
  return <span style={{ fontSize: 11, opacity: 0.7 }}>→ {riassuntoInParole(riassunto(voci, scelte))}</span>
}

/**
 * Fondere questo PC con il Drive collegato, scegliendo tutto.
 *
 * Tre tempi: la passphrase del Drive se la sua cassaforte e' un'altra; il
 * piano, con le scelte voce per voce e per gruppo; l'esecuzione e il conto.
 */
export function ModaleFusione({ cassaforteDiversa, onChiudi }: Props): React.JSX.Element {
  const [fase, setFase] = useState<'passphrase' | 'carico' | 'piano' | 'attesa' | 'eseguo' | 'fatto' | 'errore'>(cassaforteDiversa ? 'passphrase' : 'carico')
  const [passphrase, setPassphrase] = useState('')
  const [piano, setPiano] = useState<PianoFusione | undefined>(undefined)
  const [scelte, setScelte] = useState<Record<string, Azione>>({})
  const [modoWs, setModoWs] = useState<ModoWorkspace>('unione')
  // Per ogni workspace: 'unisci' (qui + Drive), 'qui' (resta com'e' su questo PC), 'porta' (dal Drive, se e' solo la'), 'no' (non portarlo).
  const [sceltaWs, setSceltaWs] = useState<Record<string, 'unisci' | 'qui' | 'porta' | 'no'>>({})
  const escludiWs = useMemo(() => {
    const fuori: string[] = []
    for (const [nome, s] of Object.entries(sceltaWs)) if (s === 'qui' || s === 'no') fuori.push(nome)
    return fuori
  }, [sceltaWs])
  const [aperti, setAperti] = useState<Set<string>>(new Set(['chat']))
  const [messaggio, setMessaggio] = useState<string | undefined>(undefined)
  const [esito, setEsito] = useState<EsitoFusione | undefined>(undefined)
  // Il lavoro in corso, per la barra: e' lo stesso che vede la striscia in alto.
  const [lavoro, setLavoro] = useState<StatoLavoro>({})
  useEffect(() => window.gestore.sync.onLavoro(setLavoro), [])
  // L'orologio del quadro: tempo trascorso e stima si ridisegnano ogni secondo.
  const [adesso, setAdesso] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setAdesso(Date.now()), 1000); return () => clearInterval(t) }, [])
  // Una fusione interrotta prima: le sue scelte tornano per le voci rimaste.
  const [ripresa, setRipresa] = useState<{ quando: string; fatti?: number; totale?: number } | undefined>(undefined)

  const carica = (pw?: string): void => {
    setFase('carico'); setMessaggio(undefined)
    void window.gestore.sync.anteprimaFusione(pw).then((r) => {
      if (!r.ok) {
        setMessaggio(r.messaggio)
        setFase(r.servePassphrase === true ? 'passphrase' : 'errore')
        return
      }
      setPiano(r.piano)
      const iniziali: Record<string, Azione> = {}
      for (const v of [...r.piano.chat, ...r.piano.assetto, ...r.piano.progetti.flatMap((p) => p.voci)]) iniziali[v.percorso] = v.predefinita
      // Se l'ultima fusione e' rimasta a meta', le sue scelte tornano per le
      // voci che ci sono ancora: quelle gia' fatte risultano uguali e non
      // compaiono, il resto si rifa' con un tasto.
      return window.gestore.sync.stato().catch(() => undefined).then((st) => {
        const uf = st?.ultimaFusione
        if (uf !== undefined && uf.esito !== 'ok' && uf.scelte !== undefined) {
          for (const [k, a] of Object.entries(uf.scelte.voci)) if (k in iniziali) iniziali[k] = a
          setModoWs(uf.scelte.workspace.modo)
          const ws: Record<string, 'unisci' | 'qui' | 'porta' | 'no'> = {}
          for (const w of r.piano.workspace) {
            if (uf.scelte.workspace.escludi.includes(w.nome)) ws[w.nome] = w.dove === 'drive' ? 'no' : 'qui'
          }
          setSceltaWs(ws)
          setRipresa({ quando: uf.quando, ...(uf.fatti !== undefined ? { fatti: uf.fatti } : {}), ...(uf.totale !== undefined ? { totale: uf.totale } : {}) })
        } else {
          setRipresa(undefined)
        }
        setScelte(iniziali)
        const prima = perCartella(r.piano.chat)[0]
        setAperti(new Set(prima !== undefined ? [`chat:${prima.cartella}`] : []))
        setFase('piano')
      })
    }).catch((e: unknown) => { setMessaggio(String(e)); setFase('errore') })
  }
  useEffect(() => { if (!cassaforteDiversa) carica() }, [])

  useEffect(() => {
    const suTasto = (e: KeyboardEvent): void => { if (e.key === 'Escape') onChiudi(fase === 'fatto') }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  }, [fase, onChiudi])

  const imposta = (percorso: string, a: Azione): void => setScelte((s) => ({ ...s, [percorso]: a }))
  // E si aprono le sezioni toccate: un tasto che cambia righe nascoste sembra
  // un tasto rotto.
  const impostaTutte = (voci: VoceFusione[], conCopia: boolean, a: AzioneDiGruppo, apri: string[] = []): void => {
    setScelte((s) => ({ ...s, ...sceltePerTutte(voci, conCopia, a, s) }))
    if (apri.length > 0) setAperti((s) => new Set([...s, ...apri]))
  }
  const commuta = (chiave: string): void => setAperti((s) => { const n = new Set(s); if (n.has(chiave)) n.delete(chiave); else n.add(chiave); return n })

  const conto = useMemo(() => {
    let carica = 0; let scarica = 0; let copia = 0
    for (const a of Object.values(scelte)) { if (a === 'carica') carica += 1; else if (a === 'scarica') scarica += 1; else if (a === 'copia') copia += 1 }
    return { carica, scarica, copia }
  }, [scelte])

  const esegui = (): void => {
    setFase('eseguo'); setMessaggio(undefined)
    void window.gestore.sync.eseguiFusione({ voci: scelte, workspace: { modo: modoWs, escludi: escludiWs } }, cassaforteDiversa ? passphrase : undefined)
      .then((r) => {
        if (!r.ok) {
          // Il Drive e' occupato (di solito il salvataggio automatico): non e'
          // un errore, e' una fila. Le scelte restano, si aspetta, e si
          // riparte da soli appena il lavoro in corso finisce.
          if (r.messaggio.startsWith('LAVORO_IN_CORSO')) { setFase('attesa'); return }
          setMessaggio(r.messaggio); setFase('errore'); return
        }
        setEsito(r.esito); setFase('fatto')
      })
      .catch((e: unknown) => { setMessaggio(String(e)); setFase('errore') })
  }
  // In fila: appena il Drive si libera, la fusione parte da sola.
  useEffect(() => {
    if (fase === 'attesa' && lavoro.inCorso === undefined) esegui()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase, lavoro.inCorso])

  const testa = (
    <div className="dialogo__testa">
      <span className="serigrafia">Fondi questo PC con il Drive</span>
    </div>
  )

  // Sul body, non dentro chi lo apre: un pannello con `transform` fa da
  // contenitore a `position: fixed`, e il modale restava dentro e tagliato.
  return createPortal(
    <div className="velo" onMouseDown={(e) => { if (e.target === e.currentTarget) onChiudi(fase === 'fatto') }}>
      <div className="dialogo dialogo--largo" onMouseDown={(e) => e.stopPropagation()}>
        {testa}
        {fase === 'passphrase' ? (
          <>
            <p className="account__nota">La cassaforte di questo Drive è un’altra. Per leggere cosa c’è dentro serve la <strong>sua</strong> passphrase; fondendo, questo PC passerà a usare quella, e la sua cassaforte di adesso resterà messa da parte.</p>
            {messaggio !== undefined ? <div className="riga__stato">{messaggio}</div> : null}
            <input className="account__campo" type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && passphrase !== '') carica(passphrase) }} placeholder="passphrase del Drive" aria-label="passphrase del Drive" autoFocus />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
              <button className="tasto" onClick={() => onChiudi(false)}>Annulla</button>
              <button className="tasto tasto--primario" disabled={passphrase === ''} onClick={() => carica(passphrase)}>Leggi il Drive</button>
            </div>
          </>
        ) : fase === 'carico' ? (
          <p className="account__nota">Leggo cosa c’è di qua e di là…</p>
        ) : fase === 'attesa' ? ((): React.JSX.Element => {
          const inCorso = lavoro.inCorso
          const d = inCorso !== undefined ? descriviLavoro(inCorso) : undefined
          return (
            <>
              <p className="account__nota">
                <strong>Il Drive è occupato: la fusione è in fila.</strong>{' '}
                {inCorso !== undefined
                  ? <>In questo momento sta girando «{d?.titolo}» — {d?.testo}{d?.dettaglio !== undefined ? <span style={{ opacity: 0.7 }}> · {d.dettaglio}</span> : null}. Di solito è il salvataggio automatico, che passa ogni pochi minuti e mette sul Drive quello che è cambiato qui.</>
                  : <>Il lavoro precedente è appena finito: parto.</>}
              </p>
              {inCorso !== undefined ? <AvanzamentoLavoro lavoro={inCorso} adesso={adesso} /> : null}
              <p className="account__nota" style={{ fontSize: 12, marginTop: 8 }}>
                Due lavori insieme si pesterebbero i piedi (uno scrive l’indice del Drive mentre l’altro lo legge), quindi si va uno alla volta. Le tue scelte sono salvate: <strong>appena il lavoro in corso finisce, la fusione parte da sola</strong>, e la vedi qui e nella striscia in alto. Se non vuoi aspettare, «Annulla il lavoro in corso» lo ferma fra un file e l’altro senza rompere niente: quello che ha già messo sul Drive resta, il resto lo rifarà al prossimo giro.
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                <button className="tasto" onClick={() => { setFase('piano') }}>Torna alle scelte</button>
                <button className="tasto" disabled={inCorso === undefined || inCorso.annullamento} onClick={() => void window.gestore.sync.annullaLavoro()}>
                  {inCorso?.annullamento === true ? 'Si sta fermando…' : 'Annulla il lavoro in corso'}
                </button>
              </div>
            </>
          )
        })() : fase === 'errore' ? (
          <>
            <div className="riga__stato">{messaggio ?? 'non riuscito'}</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
              <button className="tasto" onClick={() => onChiudi(false)}>Chiudi</button>
              <button className="tasto tasto--primario" onClick={() => (cassaforteDiversa ? setFase('passphrase') : carica())}>Riprova</button>
            </div>
          </>
        ) : fase === 'eseguo' ? ((): React.JSX.Element => {
          const inCorso = lavoro.inCorso
          const d = inCorso !== undefined && inCorso.tipo === 'fusione' ? descriviLavoro(inCorso) : undefined
          return (
            <>
              <p className="account__nota" style={{ margin: '0 0 8px' }}>
                Con le tue scelte: <strong>{conto.carica}</strong> da portare sul Drive, <strong>{conto.scarica}</strong> da portare qui, <strong>{conto.copia}</strong> da tenere in due versioni. Niente viene cancellato.
              </p>
              {inCorso !== undefined && d !== undefined
                ? <AvanzamentoLavoro lavoro={inCorso} adesso={adesso} onAnnulla={() => void window.gestore.sync.annullaLavoro()} />
                : <p className="account__nota">Parto… (chiedo il Drive e preparo l’elenco)</p>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                <button className="tasto" onClick={() => onChiudi(false)}>Chiudi (continua da sola)</button>
              </div>
            </>
          )
        })() : fase === 'fatto' && esito !== undefined ? (
          <>
            <p className="account__nota">
              {esito.annullato === true
                ? <><strong>Interrotta</strong> a {esito.fatti} voci su {esito.totale}. Quello fatto è a posto e coerente; riapri «Fondi con il Drive» per finire: le voci già fatte risultano uguali, per le altre ritrovi le scelte di adesso. </>
                : <><strong>Fatto.</strong> </>}
              {esito.caricati} file portati sul Drive, {esito.scaricati} portati qui, {esito.copie} tenuti in due versioni, {esito.saltati} non riusciti. I workspace sono stati {modoWs === 'unione' ? 'uniti' : modoWs === 'pc' ? 'tenuti come su questo PC' : 'presi dal Drive'}. Riavvia SierraDeck per vedere tutto.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
              <button className="tasto tasto--primario" onClick={() => onChiudi(true)}>Chiudi</button>
            </div>
          </>
        ) : piano !== undefined ? (
          <>
            <p className="account__nota" style={{ margin: '0 0 6px' }}>
              {piano.email !== undefined ? <>Drive di <strong>{piano.email}</strong>. </> : null}
              Ho confrontato, voce per voce, le conversazioni e i file di progetto di questo PC con quelli salvati sul Drive: stesso percorso, stessa dimensione e stessa data vuol dire «uguale»; tutto il resto è «solo di qua», «solo di là» o «diversa».
            </p>
            <p className="account__nota" style={{ margin: '0 0 6px' }}>
              <strong>Solo su questo PC: {piano.totali.soloPc}</strong> — esistono qui e non sul Drive; il predefinito le porta sul Drive, così gli altri PC le vedono.{' '}
              <strong>Solo sul Drive: {piano.totali.soloDrive}</strong> — esistono sul Drive (di solito salvate da un altro PC) e non qui; il predefinito le porta qui.{' '}
              <strong>Diverse: {piano.totali.diverse}</strong> — esistono in tutti e due i posti ma non sono uguali; per le chat vince la copia più lunga, perché una conversazione cresce e non si accorcia, per i file di progetto vince la più recente e l’altra versione resta accanto come copia.{' '}
              <strong>Uguali: {piano.totali.uguali}</strong> — identiche di qua e di là, non c’è niente da fare.
            </p>
            <p className="account__nota" style={{ margin: '0 0 8px' }}>
              Da questa finestra <strong>niente viene mai cancellato</strong>: si copia da una parte all’altra, e basta. Puoi cambiare ogni singola voce dalla sua tendina, o usare i tasti di gruppo accanto a ogni cartella. Quando premi il tasto in fondo vedi l’avanzamento qui e nella striscia in alto, puoi annullare in qualsiasi momento, e a lavoro finito conviene riavviare SierraDeck perché le chat arrivate compaiano nei loro workspace.
            </p>
            {piano.totali.soloPc + piano.totali.soloDrive + piano.totali.diverse === 0 ? (
              <p className="account__nota" style={{ margin: '0 0 8px', padding: '8px 10px', borderRadius: 6, background: 'var(--fondo-cupo)' }}>
                ✓ <strong>Chat e file sono già allineati.</strong> Tutte le {piano.totali.uguali} voci sono identiche qui e sul Drive, quindi non c’è niente da portare né da scaricare, e per questo nelle cartelle qui sotto non ci sono tasti: ogni riga ha una sola scelta possibile, «lascia com’è». Succede quando questo PC ha già salvato sul Drive e ripristinato tutto, oppure quando gli altri PC non hanno ancora salvato niente di nuovo. Se ti aspettavi delle chat dell’altro PC, controlla che lì il salvataggio sia andato a buon fine (pannello Account → «Salva ora» su quel PC), poi riapri questa finestra. Qui sotto restano solo i workspace, cioè le fasce che raggruppano le chat a schermo: se anche lì è tutto com’è, puoi chiudere senza fare niente.
              </p>
            ) : null}
            {ripresa !== undefined ? (
              <p className="account__nota" style={{ margin: '0 0 8px', color: 'var(--ambra)' }}>
                ↻ Riprendo la fusione interrotta il {quandoBreve(ripresa.quando)}{ripresa.fatti !== undefined && ripresa.totale !== undefined ? ` (fatte ${ripresa.fatti} voci su ${ripresa.totale})` : ''}: le voci già fatte risultano uguali e non compaiono, per le altre ho rimesso le scelte di allora. Controlla e premi «Fondi adesso».
              </p>
            ) : null}
            <p className="account__nota" style={{ margin: '0 0 8px', fontSize: 12 }}>
              Due cose separate: le <strong>chat</strong> sono le conversazioni (qui sotto, per cartella di progetto); i <strong>workspace</strong> sono le fasce che le raggruppano a schermo, e si decidono in fondo.
            </p>
            <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4 }}>
              {/* Chat, per cartella di progetto */}
              <section>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className="serigrafia">Chat ({piano.chat.length}) <Conto voci={piano.chat} scelte={scelte} /></span>
                  <TastiGruppo voci={piano.chat} conCopia={false} scelte={scelte} onTutte={(a) => impostaTutte(piano.chat, false, a, perCartella(piano.chat).map((g) => `chat:${g.cartella}`))} />
                </div>
                {piano.chat.length === 0 ? <p className="account__nota">Nessuna chat da fondere.</p> : null}
                {perCartella(piano.chat).map((g) => {
                  const chiave = `chat:${g.cartella}`
                  const soloPc = g.voci.filter((v) => v.dove === 'pc').length
                  const soloDrive = g.voci.filter((v) => v.dove === 'drive').length
                  const diverse = g.voci.filter((v) => v.diverse).length
                  return (
                    <div key={chiave} style={{ margin: '6px 0 0 0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <button className="account__link" onClick={() => commuta(chiave)} title={g.cartella}>
                          {aperti.has(chiave) ? '▾' : '▸'} {g.cartella} · {g.voci.length} chat
                          <span style={{ opacity: 0.6 }}>{soloPc > 0 ? ` · ${soloPc} solo qui` : ''}{soloDrive > 0 ? ` · ${soloDrive} solo sul Drive` : ''}{diverse > 0 ? ` · ${diverse} diverse` : ''}</span>
                          {' '}<Conto voci={g.voci} scelte={scelte} />
                        </button>
                        <TastiGruppo voci={g.voci} conCopia={false} scelte={scelte} onTutte={(a) => impostaTutte(g.voci, false, a, [chiave])} />
                      </div>
                      {aperti.has(chiave) ? <Elenco voci={g.voci} scelte={scelte} conCopia={false} onScelta={imposta} /> : null}
                    </div>
                  )
                })}
              </section>
              {/* Progetti */}
              {piano.progetti.map((p) => (
                <section key={p.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <button className="account__link" onClick={() => commuta(p.id)}>
                      {aperti.has(p.id) ? '▾' : '▸'} Progetto «{p.nome}» · solo PC {p.soloPc} · solo Drive {p.soloDrive} · diverse {p.diverse} · uguali {p.uguali}
                      {p.cartellaPc === undefined ? ' · non ancora su questo PC' : ''}
                      {' '}<Conto voci={p.voci} scelte={scelte} />
                    </button>
                    <TastiGruppo voci={p.voci} conCopia scelte={scelte} onTutte={(a) => impostaTutte(p.voci, true, a, [p.id])} />
                  </div>
                  {aperti.has(p.id) ? <Elenco voci={p.voci} scelte={scelte} conCopia onScelta={imposta} /> : null}
                </section>
              ))}
              {/* Assetto */}
              {piano.assetto.length > 0 ? (
                <section>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <button className="account__link" onClick={() => commuta('assetto')}>{aperti.has('assetto') ? '▾' : '▸'} Impostazioni e salvataggi ({piano.assetto.length})</button>
                  </div>
                  {aperti.has('assetto') ? <Elenco voci={piano.assetto} scelte={scelte} conCopia={false} onScelta={imposta} /> : null}
                </section>
              ) : null}
              {/* Workspace */}
              <section>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className="serigrafia">Workspace</span>
                  <select className="account__campo" style={{ fontSize: 12, padding: '2px 6px' }} value={modoWs} onChange={(e) => setModoWs(e.target.value as ModoWorkspace)}>
                    <option value="unione">unisci: decido workspace per workspace (consigliato)</option>
                    <option value="pc">tieni tutti quelli di questo PC, ignora quelli del Drive</option>
                    <option value="drive">prendi tutti quelli del Drive, al posto di questi</option>
                  </select>
                </div>
                <p className="account__nota" style={{ fontSize: 12, margin: '6px 0' }}>
                  Un workspace è una fascia con dentro delle chat. «Unisci» vuol dire: le chat che stanno in quel workspace sul Drive entrano nello stesso workspace qui, accanto a quelle che ci sono già; niente si toglie. Un workspace che esiste solo sul Drive viene creato qui con le sue chat.
                </p>
                {modoWs === 'unione' ? (
                  <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {piano.workspace.map((w) => {
                      const scelta = sceltaWs[w.nome] ?? (w.dove === 'drive' ? 'porta' : 'unisci')
                      return (
                        <li key={w.nome} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', fontSize: 12, padding: '4px 6px', borderRadius: 6, background: 'var(--fondo-cupo)' }}>
                          <div>
                            <strong>{w.nome}</strong>
                            <span style={{ opacity: 0.6 }}>
                              {w.dove === 'entrambi' ? ` · qui ${w.chatPc} chat, sul Drive ${w.chatDrive}` : w.dove === 'pc' ? ` · solo qui, ${w.chatPc} chat` : ` · solo sul Drive, ${w.chatDrive} chat`}
                            </span>
                          </div>
                          {w.dove === 'pc' ? (
                            <span style={{ fontSize: 11, opacity: 0.6 }}>resta com’è</span>
                          ) : (
                            <select className="account__campo" style={{ fontSize: 12, padding: '2px 6px' }} value={scelta} onChange={(e) => setSceltaWs((s) => ({ ...s, [w.nome]: e.target.value as 'unisci' | 'qui' | 'porta' | 'no' }))}>
                              {w.dove === 'entrambi' ? (
                                <>
                                  <option value="unisci">unisci: qui + le chat del Drive</option>
                                  <option value="qui">tieni com’è qui, ignora il Drive</option>
                                </>
                              ) : (
                                <>
                                  <option value="porta">crealo qui con le sue chat</option>
                                  <option value="no">non portarlo</option>
                                </>
                              )}
                            </select>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
              </section>
              {piano.cassaforteDiversa ? (
                <p className="account__nota">🔒 Fondendo, questo PC passa alla cassaforte del Drive: le sue chat e i suoi file salgono cifrati con quella chiave. La cassaforte di adesso resta messa da parte, non cancellata.</p>
              ) : null}
            </div>
            <div className="fusione__piede">
              <span style={{ fontSize: 12, opacity: 0.85 }}>
                Con queste scelte: <strong>{conto.carica}</strong> sul Drive · <strong>{conto.scarica}</strong> qui · <strong>{conto.copia}</strong> in due versioni. Niente viene cancellato.
              </span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="tasto" onClick={() => onChiudi(false)}>Annulla</button>
                <button className="tasto fusione__fondi" onClick={esegui} title="Applica le scelte qui sopra">
                  {conto.carica + conto.scarica + conto.copia === 0 ? 'Applica i workspace →' : 'Fondi adesso →'}
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  , document.body)
}
