import { useEffect, useState } from 'react'
import type { Catalogo, ProgettoCatalogo, ChatCatalogo, WorkspaceCatalogo } from '../../main/cassaforte/catalogo'
import type { StatoLavoro } from '../../main/cassaforte/lavoro-in-corso'
import { ModaleFusione } from './ModaleFusione'
import { AvanzamentoLavoro } from './AvanzamentoLavoro'
import { ModaleConferma } from './ModaleConferma'

type Props = { onChiudi: () => void }

/**
 * Il Drive come magazzino da sfogliare.
 *
 * Nicholas (2026-09-09): «non c'e' una vera sezione dove io posso navigare
 * sui progetti presenti nel Drive e importarli o gestirli da questo PC. Tutta
 * la dinamica non e' molto comoda e chiara.» Qui c'e' il catalogo: ogni
 * progetto con la sua cartella, da dove viene, quante chat e in che stato
 * rispetto a questo PC, e un tasto che dice cosa fa — «Porta qui» — che
 * scarica la cartella se viaggia con le chat, le chat che mancano, le mette
 * nel loro workspace, e poi il programma si riavvia da solo per mostrarle.
 */
export function PannelloDrive({ onChiudi }: Props): React.JSX.Element {
  const [catalogo, setCatalogo] = useState<Catalogo | undefined>(undefined)
  const [messaggio, setMessaggio] = useState<string | undefined>(undefined)
  const [leggo, setLeggo] = useState(false)
  const [aperti, setAperti] = useState<Set<string>>(new Set())
  const [fusione, setFusione] = useState(false)
  const [inCorso, setInCorso] = useState<string | undefined>(undefined)
  const [lavoro, setLavoro] = useState<StatoLavoro>({})
  const [adesso, setAdesso] = useState(Date.now())
  const [cassaforteDiversa, setCassaforteDiversa] = useState(false)
  const [filtro, setFiltro] = useState<'tutti' | 'daPortare' | 'soloQui'>('tutti')
  const [daTogliere, setDaTogliere] = useState<ProgettoCatalogo | undefined>(undefined)

  const leggi = (): void => {
    setLeggo(true); setMessaggio(undefined)
    void window.gestore.sync.catalogo().then((r) => {
      if (r.ok) { setCatalogo(r.catalogo); setCassaforteDiversa(false) }
      else { setMessaggio(r.messaggio); if (r.cassaforteDiversa === true) setCassaforteDiversa(true) }
    }).catch((e: unknown) => setMessaggio(String(e))).finally(() => setLeggo(false))
  }
  useEffect(() => { leggi() }, [])
  useEffect(() => window.gestore.sync.onLavoro((s) => {
    setLavoro(s)
    // Finito un lavoro: il catalogo cambia, si rilegge.
    if (s.inCorso === undefined && inCorso !== undefined) { setInCorso(undefined); leggi() }
  }), [inCorso])
  useEffect(() => { const t = setInterval(() => setAdesso(Date.now()), 1000); return () => clearInterval(t) }, [])

  const portaQui = (g: ProgettoCatalogo): void => {
    setInCorso(g.chiave); setMessaggio(undefined)
    void window.gestore.sync.portaQui(g.chiave).then((r) => {
      if (!r.ok) { setMessaggio(r.messaggio); setInCorso(undefined) }
      else setMessaggio(`«${g.nome}»: ${r.esito.scaricati} file portati qui${r.esito.saltati > 0 ? `, ${r.esito.saltati} saltati` : ''}.${r.esito.scaricati > 0 ? ' Il programma si riavvia fra poco per mostrare le chat nei loro workspace.' : ''}`)
    }).catch((e: unknown) => { setMessaggio(String(e)); setInCorso(undefined) })
  }
  const commuta = (k: string): void => setAperti((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const [vista, setVista] = useState<'progetti' | 'workspace'>('progetti')
  const portaQuiWorkspace = (w: WorkspaceCatalogo): void => {
    setInCorso(`ws:${w.nome}`); setMessaggio(undefined)
    void window.gestore.sync.portaQuiWorkspace(w.nome).then((r) => {
      if (!r.ok) { setMessaggio(r.messaggio); setInCorso(undefined) }
      else setMessaggio(`Workspace «${w.nome}»: ${r.esito.scaricati} file portati qui${r.esito.saltati > 0 ? `, ${r.esito.saltati} saltati` : ''}. ${r.esito.scaricati > 0 ? 'Il programma si riavvia fra poco: al ritorno trovi il workspace con dentro le sue chat.' : 'Era già tutto qui: il workspace viene unito ai tuoi.'}`)
    }).catch((e: unknown) => { setMessaggio(String(e)); setInCorso(undefined) })
  }
  // «Apri»: la stessa strada della ripresa dal telefono, nel workspace dove
  // la chat sta salvata. La cartella e' quella di qui, se il progetto ce l'ha.
  const apriChat = (g: ProgettoCatalogo, c: ChatCatalogo): void => {
    const cwd = c.altroveQui ?? g.cartellaQui ?? g.cartellaOrigine
    void window.gestore.sync.riprendiChat(cwd, c.sessione).then((fatto) => {
      if (fatto) onChiudi()
      else setMessaggio('Non sono riuscito ad aprirla: nessuna finestra ha risposto.')
    }).catch((e: unknown) => setMessaggio(String(e)))
  }
  const togli = (g: ProgettoCatalogo): void => {
    if (g.id === undefined) return
    const id = g.id
    setDaTogliere(undefined); setMessaggio(undefined); setInCorso(g.chiave)
    void window.gestore.progetti.rimuovi(id).then((r) => {
      setMessaggio(r.messaggio ?? `«${g.nome}»: la cartella non viaggia più sul Drive. Le chat restano dove sono, e la cartella su ogni PC resta com'è.`)
    }).catch((e: unknown) => setMessaggio(String(e))).finally(() => { setInCorso(undefined); leggi() })
  }

  const quando = (iso: string | undefined): string => {
    if (iso === undefined) return ''
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })
  }
  const statoChat = (c: ChatCatalogo): { testo: string; classe: string } => {
    switch (c.stato) {
      case 'uguale': return { testo: 'già qui, uguale', classe: 'drive__stato--ok' }
      case 'indietro': return { testo: 'qui è indietro: sul Drive è più recente', classe: 'drive__stato--attesa' }
      case 'avanti': return { testo: 'qui è più avanti: sale al prossimo salvataggio', classe: 'drive__stato--ok' }
      case 'soloDrive': return { testo: 'solo sul Drive: non è ancora qui', classe: 'drive__stato--attesa' }
      case 'soloQui': return { testo: 'solo qui: sale al prossimo salvataggio', classe: 'drive__stato--ok' }
    }
  }
  const statoProgetto = (g: ProgettoCatalogo): { testo: string; classe: string } => {
    switch (g.stato) {
      case 'allineato': return { testo: 'allineato', classe: 'drive__stato--ok' }
      case 'daPortare': return { testo: `${g.conti.soloDrive + g.file.soloDrive} da portare qui`, classe: 'drive__stato--attesa' }
      case 'daAggiornare': return { testo: `${g.conti.indietro + g.file.indietro} da aggiornare qui`, classe: 'drive__stato--attesa' }
      case 'soloQui': return { testo: 'solo qui: sale al prossimo salvataggio', classe: 'drive__stato--ok' }
      case 'misto': return { testo: `${g.conti.soloDrive + g.conti.indietro + g.file.soloDrive + g.file.indietro} da portare qui · ${g.conti.soloQui + g.conti.avanti + g.file.soloQui + g.file.avanti} da mandare su`, classe: 'drive__stato--attesa' }
    }
  }
  const daPortare = (g: ProgettoCatalogo): number => g.conti.soloDrive + g.conti.indietro + g.file.soloDrive + g.file.indietro
  const visibili = (catalogo?.progetti ?? []).filter((g) =>
    filtro === 'tutti' ? true : filtro === 'daPortare' ? daPortare(g) > 0 : g.stato === 'soloQui' || g.conti.soloQui > 0)

  return (
    <div className="pannello pannello--largo">
      <div className="pannello__testa">
        <span className="serigrafia">Drive · il magazzino comune dei tuoi PC</span>
        <span style={{ flex: 1 }} />
        <button className="tasto tasto--mini" onClick={leggi} disabled={leggo}>{leggo ? 'Leggo…' : 'Aggiorna'}</button>
        <button className="tasto tasto--mini" onClick={onChiudi}>Chiudi</button>
      </div>

      <p className="account__nota">
        Qui vedi tutto quello che sta sul Drive, raggruppato per progetto, cioè per la cartella in cui le chat lavorano: da dove viene, quante chat ha, quando è stato toccato l’ultima volta, e per ogni chat il nome e lo stato rispetto a questo PC. <strong>«Porta qui»</strong> scarica la cartella se viaggia con le chat (i progetti sul Drive), poi le chat che qui mancano, le mette nel workspace in cui stavano creandolo se serve, e alla fine il programma si riavvia da solo per mostrarle; <strong>«Aggiorna qui»</strong> fa lo stesso quando qui hai una versione più vecchia. <strong>«Apri»</strong> accanto a una chat che è già qui la riapre nel suo workspace. <strong>«Togli la cartella dal Drive»</strong> vale per i progetti che viaggiano con la cartella: i file della cartella salvati sul Drive vengono tolti e la cartella smette di viaggiare; le chat e le cartelle sui PC restano come sono. Per il resto niente viene mai cancellato: si copia da una parte all’altra, e basta. Quello che è solo qui sale da solo al prossimo salvataggio automatico. Se la stessa conversazione sta sul Drive sotto due cartelle (una per PC), qui la vedi una volta con scritto dove sta.
      </p>

      {lavoro.inCorso !== undefined ? <AvanzamentoLavoro lavoro={lavoro.inCorso} adesso={adesso} onAnnulla={() => void window.gestore.sync.annullaLavoro()} /> : null}
      {messaggio !== undefined ? <div className="riga__stato" style={{ marginTop: 6 }}>{messaggio}</div> : null}
      {cassaforteDiversa ? (
        <div className="account__scheda" style={{ marginTop: 8 }}>
          <p className="account__nota">La cassaforte di questo Drive è un’altra: per leggerne il contenuto serve la sua passphrase, e da lì questo PC la adotta. Si fa da «Fondi con il Drive», che te la chiede.</p>
          <button className="tasto tasto--primario" onClick={() => setFusione(true)}>Fondi con il Drive…</button>
        </div>
      ) : null}

      {catalogo !== undefined ? (
        <>
          <div className="drive__riassunto">
            <span><strong>{catalogo.totali.progetti}</strong> progetti · <strong>{catalogo.totali.chat}</strong> chat</span>
            <span className="drive__stato drive__stato--attesa">{catalogo.totali.daPortare} da portare qui</span>
            <span className="drive__stato drive__stato--attesa">{catalogo.totali.daAggiornare} da aggiornare qui</span>
            <span className="drive__stato drive__stato--ok">{catalogo.totali.soloQui} solo qui (saliranno)</span>
            <span className="drive__stato drive__stato--ok">{catalogo.totali.uguali} uguali</span>
            <span style={{ flex: 1 }} />
            <select className="account__campo" style={{ fontSize: 12 }} value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)}>
              <option value="tutti">tutti i progetti</option>
              <option value="daPortare">solo quelli con qualcosa da portare qui</option>
              <option value="soloQui">solo quelli con qualcosa solo qui</option>
            </select>
            <button className="tasto tasto--mini" onClick={() => setFusione(true)} title="Il piano completo, voce per voce: per il primo collegamento di un PC o per scegliere a mano">Fondi con il Drive…</button>
          </div>
          <div className="drive__viste">
            <button className={`tasto tasto--mini${vista === 'progetti' ? ' tasto--acceso' : ''}`} aria-pressed={vista === 'progetti'} onClick={() => setVista('progetti')}>Per progetto (cartella)</button>
            <button className={`tasto tasto--mini${vista === 'workspace' ? ' tasto--acceso' : ''}`} aria-pressed={vista === 'workspace'} onClick={() => setVista('workspace')}>Per workspace ({catalogo.workspace.length})</button>
            <span className="drive__sotto" style={{ marginLeft: 6 }}>
              {vista === 'progetti'
                ? 'Un progetto è la cartella in cui le chat lavorano. «Porta qui» prende cartella e chat.'
                : 'Un workspace è una fascia a schermo con dentro delle chat, anche di progetti diversi. «Porta qui il workspace» prende le sue chat, con le cartelle che servono, e lo ricrea qui con dentro le chat.'}
            </span>
          </div>
          {vista === 'workspace' ? (
            <div className="drive__elenco">
              {catalogo.workspace.length === 0 ? <p className="account__nota">Sul Drive non ci sono workspace salvati.</p> : null}
              {catalogo.workspace.map((w) => {
                const chiave = `ws:${w.nome}`
                const aperto = aperti.has(chiave)
                return (
                  <div key={chiave} className="drive__progetto">
                    <div className="drive__riga">
                      <button className="account__link" onClick={() => commuta(chiave)} style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                        {aperto ? '▾' : '▸'} <strong>{w.nome}</strong>
                        <span className="drive__sotto"> · {w.chat.length} chat in {w.progetti.length} {w.progetti.length === 1 ? 'progetto' : 'progetti'}</span>
                        <span className="drive__percorso">
                          {w.quiEsiste ? 'esiste anche qui: le chat che arrivano si aggiungono a quelle che ci sono' : 'non esiste qui: viene creato con le sue chat'}
                        </span>
                      </button>
                      <span className={`drive__stato ${w.daPortare > 0 ? 'drive__stato--attesa' : 'drive__stato--ok'}`}>
                        {w.daPortare > 0 ? `${w.daPortare} chat da portare qui` : w.quiEsiste ? 'allineato' : 'chat già qui: manca solo il workspace'}
                      </span>
                      {w.daPortare > 0 || !w.quiEsiste ? (
                        <button
                          className="tasto tasto--primario tasto--mini"
                          disabled={inCorso !== undefined || lavoro.inCorso !== undefined}
                          onClick={() => portaQuiWorkspace(w)}
                          title="Scarica le chat che mancano con le cartelle che servono, ricrea il workspace qui con dentro le chat, e riavvia"
                        >
                          {inCorso === chiave ? 'Porto…' : w.daPortare > 0 ? `Porta qui il workspace (${w.daPortare})` : 'Crea qui il workspace'}
                        </button>
                      ) : null}
                    </div>
                    {aperto ? (
                      <ul className="drive__chat">
                        {w.chat.map((c) => {
                          const sc = statoChat(c)
                          return (
                            <li key={c.sessione} className="drive__chatriga">
                              <span style={{ minWidth: 0, flex: 1 }}>
                                <span className="drive__chatnome">{c.titolo}</span>
                                <span className="drive__sotto"> · {c.progetto}{c.quando !== undefined ? ` · ${quando(c.quando)}` : ''}</span>
                              </span>
                              <span className={`drive__stato ${sc.classe}`}>{c.altroveQui !== undefined ? `già qui, in ${c.altroveQui}` : sc.testo}</span>
                            </li>
                          )
                        })}
                      </ul>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : null}
          {vista === 'progetti' && visibili.length === 0 ? <p className="account__nota">Niente da mostrare con questo filtro.</p> : null}
          <div className="drive__elenco" style={{ display: vista === 'progetti' ? undefined : 'none' }}>
            {visibili.map((g) => {
              const s = statoProgetto(g)
              const aperto = aperti.has(g.chiave)
              const nPorta = daPortare(g)
              return (
                <div key={g.chiave} className="drive__progetto">
                  <div className="drive__riga">
                    <button className="account__link" onClick={() => commuta(g.chiave)} style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                      {aperto ? '▾' : '▸'} <strong>{g.nome}</strong>
                      <span className="drive__sotto">
                        {' '}· {g.chat.length} chat{g.cartellaSulDrive ? ` · cartella sul Drive (${g.file.totale} file)` : ''}
                        {g.ultimoTocco !== undefined ? ` · ultimo tocco ${quando(g.ultimoTocco)}` : ''}
                      </span>
                      <span className="drive__percorso" title={g.cartellaOrigine}>
                        {g.origine === 'altrove' ? 'nata su un altro PC' : g.origine === 'qui' ? 'di questo PC' : 'di più PC'} · {g.cartellaQui ?? g.cartellaOrigine}
                        {g.cartellaQui !== undefined && !g.quiEsiste ? ' (la cartella qui non c’è ancora)' : ''}
                        {g.cartellaQui === undefined ? ` → arriverebbe in «Progetti SierraDeck\\${g.nome}»` : ''}
                      </span>
                    </button>
                    <span className={`drive__stato ${s.classe}`}>{s.testo}</span>
                    {nPorta > 0 ? (
                      <button
                        className="tasto tasto--primario tasto--mini"
                        disabled={inCorso !== undefined || lavoro.inCorso !== undefined}
                        onClick={() => portaQui(g)}
                        title={g.cartellaSulDrive ? 'Scarica la cartella e le chat, le mette nel loro workspace, e riavvia' : 'Scarica le chat, crea la cartella se manca, le mette nel loro workspace, e riavvia'}
                      >
                        {inCorso === g.chiave ? 'Porto…' : g.stato === 'daAggiornare' ? `Aggiorna qui (${nPorta})` : `Porta qui (${nPorta})`}
                      </button>
                    ) : null}
                    {g.id !== undefined && g.cartellaSulDrive ? (
                      <button
                        className="tasto tasto--mini"
                        disabled={inCorso !== undefined || lavoro.inCorso !== undefined}
                        onClick={() => setDaTogliere(g)}
                        title="I file della cartella salvati sul Drive vengono tolti; le chat e le cartelle sui PC restano"
                      >
                        Togli la cartella dal Drive
                      </button>
                    ) : null}
                  </div>
                  {aperto ? (
                    <ul className="drive__chat">
                      {g.chat.map((c) => {
                        const sc = statoChat(c)
                        return (
                          <li key={c.sessione} className="drive__chatriga">
                            <span style={{ minWidth: 0, flex: 1 }}>
                              <span className="drive__chatnome">{c.titolo}</span>
                              <span className="drive__sotto">
                                {c.quando !== undefined ? ` · ${quando(c.quando)}` : ''}
                                {c.messaggi !== undefined ? ` · ${c.messaggi} messaggi` : ''}
                                {c.workspace !== undefined ? ` · workspace «${c.workspace}»` : ''}
                              </span>
                            </span>
                            <span className={`drive__stato ${sc.classe}`} title={c.altroveQui !== undefined ? `Qui sta in ${c.altroveQui}` : undefined}>
                              {c.altroveQui !== undefined ? `già qui, in ${c.altroveQui}` : sc.testo}
                            </span>
                            {c.stato !== 'soloDrive' && (g.quiEsiste || c.altroveQui !== undefined) ? (
                              <button className="tasto tasto--mini" onClick={() => apriChat(g, c)} title="La riapre nel workspace dove sta salvata">Apri</button>
                            ) : null}
                          </li>
                        )
                      })}
                      {g.cartellaSulDrive ? (
                        <li className="drive__chatriga" style={{ opacity: 0.8 }}>
                          <span style={{ flex: 1 }}>Cartella del progetto: {g.file.totale} file sul Drive</span>
                          <span className="drive__sotto">{g.file.uguali} uguali · {g.file.soloDrive + g.file.indietro} da portare qui · {g.file.soloQui + g.file.avanti} da mandare su</span>
                        </li>
                      ) : null}
                    </ul>
                  ) : null}
                </div>
              )
            })}
          </div>
          <p className="account__nota" style={{ fontSize: 12, marginTop: 8 }}>
            Letto il {quando(catalogo.letto)}. Il Drive cambia quando un altro PC salva: «Aggiorna» rilegge. Le chat «solo qui» e «più avanti» salgono da sole con il salvataggio automatico, o subito con «Salva ora» nel pannello Account.
          </p>
        </>
      ) : !leggo && messaggio === undefined ? <p className="account__nota">Leggo il Drive…</p> : null}

      {fusione ? <ModaleFusione cassaforteDiversa={cassaforteDiversa} onChiudi={() => { setFusione(false); leggi() }} /> : null}
      {daTogliere !== undefined ? (
        <ModaleConferma
          titolo={`Togliere la cartella di «${daTogliere.nome}» dal Drive?`}
          testo="I file della cartella salvati sul Drive vengono cancellati, e la cartella smette di viaggiare con le chat. Le chat restano sul Drive e sui PC, e la cartella su ogni PC resta com’è. Si può rimettere sul Drive quando vuoi, dal pannello Account → «Metti una cartella sul Drive…»."
          etichettaAzione="Togli la cartella dal Drive"
          onConferma={() => togli(daTogliere)}
          onAnnulla={() => setDaTogliere(undefined)}
        />
      ) : null}
    </div>
  )
}
