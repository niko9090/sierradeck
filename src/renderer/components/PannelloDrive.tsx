import { useEffect, useState } from 'react'
import type { Catalogo, ProgettoCatalogo, ChatCatalogo } from '../../main/cassaforte/catalogo'
import type { StatoLavoro } from '../../main/cassaforte/lavoro-in-corso'
import { ModaleFusione } from './ModaleFusione'
import { AvanzamentoLavoro } from './AvanzamentoLavoro'

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
        Qui vedi tutto quello che sta sul Drive, raggruppato per progetto, cioè per la cartella in cui le chat lavorano: da dove viene, quante chat ha, quando è stato toccato l’ultima volta, e per ogni chat il nome e lo stato rispetto a questo PC. <strong>«Porta qui»</strong> scarica la cartella se viaggia con le chat (i progetti sul Drive), poi le chat che qui mancano o sono indietro, le mette nel workspace in cui stavano creandolo se serve, e alla fine il programma si riavvia da solo per mostrarle. Niente viene mai cancellato: si copia da una parte all’altra, e basta. Quello che è solo qui sale da solo al prossimo salvataggio automatico.
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
          {catalogo.workspaceSoloDrive.length > 0 ? (
            <p className="account__nota" style={{ fontSize: 12 }}>
              Workspace che esistono solo sul Drive: {catalogo.workspaceSoloDrive.map((w) => `«${w.nome}» (${w.chat} chat)`).join(', ')}. Arrivano qui, con le loro chat, quando porti qui i progetti che le contengono.
            </p>
          ) : null}
          {visibili.length === 0 ? <p className="account__nota">Niente da mostrare con questo filtro.</p> : null}
          <div className="drive__elenco">
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
                        {inCorso === g.chiave ? 'Porto…' : `Porta qui (${nPorta})`}
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
                            <span className={`drive__stato ${sc.classe}`}>{sc.testo}</span>
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
    </div>
  )
}
