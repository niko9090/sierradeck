import { useEffect, useState } from 'react'
import { useLayoutStore } from '../state/layout'
import { useSessionStore } from '../state/sessions'
import { proponiNuovaChat, type PropostaChat } from '../nuova-chat'
import { ModaleNuovaChat } from './ModaleNuovaChat'
import { azioniDiFinestra } from '../azioni-finestra'
import { MODELLI } from '../modelli'

/**
 * I modelli che si possono scegliere.
 *
 * «Predefinito» non è una scelta mancata: è quello che l'utente ha già
 * configurato in Claude Code, e imporne un altro di nostra iniziativa
 * sarebbe decidere al posto suo.
 */
/**
 * I modelli, con il nome per intero.
 *
 * Prima c'erano solo le famiglie — «Opus», «Sonnet» — e sceglierne una voleva
 * dire lasciare a Claude Code la scelta della versione. Va bene finché non
 * vuoi *proprio quella*: il nome intero è l'unico modo per dire «Opus 4.8» e
 * ottenere Opus 4.8.
 *
 * Gli alias di famiglia restano in cima, perché seguono da soli quando esce
 * qualcosa di nuovo: chi non vuole pensarci li usa e non ci pensa più.
 */

export type PannelloAperto = 'impostazioni' | 'quaderno' | 'workspace' | 'autopiloti' | 'consumi' | 'provider' | 'account' | 'negozio' | undefined

type Props = {
  onApriSessioni: () => void
  onApriIstantanee: () => void
  aperto: PannelloAperto
  onApri: (quale: PannelloAperto) => void
  /** Il nome del workspace attivo. */
  workspaceAttivo: string
  /** Dove si trova la finestra dopo un cambio chiesto da qui: l'annuncio non torna al mittente. */
  onStatoWorkspace?: (stato: { nomi: string[]; attivo: string }) => void
  /** I workspace da cui qualcuno sta chiedendo una risposta. */
  workspaceCheChiamano?: Set<string>
  /** Mostra le novità di questa versione: la si preme sul numero. */
  onApriNovita: () => void
  /** Tutti i workspace: stanno nella fascia, non dietro un menu. */
  workspaceNomi: string[]
  /** I LED degli autopiloti: uno per autopilota, nell'ordine dell'elenco. */
  ledAutopiloti: { id: string; classe: string; titolo: string }[]
}

/**
 * La fascia di comandi: una sola, con i quattro gesti quotidiani in sezioni
 * separate da incisioni.
 *
 * Workspace e autopiloti non stanno sempre aperti — sono tasti che aprono un
 * pannello sopra il mosaico — ma il loro **stato** resta sempre visibile qui:
 * il nome del workspace attivo e i LED degli autopiloti. È la differenza fra
 * nascondere una funzione e riporla.
 */
export function Console({
  onApriSessioni,
  onApriIstantanee,
  aperto,
  onApri,
  workspaceAttivo,
  workspaceNomi,
  ledAutopiloti,
  onStatoWorkspace,
  workspaceCheChiamano,
  onApriNovita
}: Props): React.JSX.Element {
  const addPane = useLayoutStore((s) => s.addPane)
  const riquadri = useLayoutStore((s) => s.panes)
  const sessioni = useSessionStore((s) => s.sessions)
  // La cartella dell'utente arriva dal sistema e serve solo come ultima
  // spiaggia: quando non c'è né un riquadro aperto né un progetto conosciuto.
  const [casa, setCasa] = useState('')
  // Il modello vale per le chat che si apriranno da qui in avanti: cambiarlo
  // non tocca quelle già aperte, che hanno il loro processo avviato.
  const [modello, setModello] = useState('default')
  // La versione accanto al nome: sapere cosa si sta usando non deve costare
  // l'apertura di un pannello, e serve appena si parla di aggiornamenti.
  const [versione, setVersione] = useState('')
  const [erroreWs, setErroreWs] = useState<string | undefined>(undefined)
  useEffect(() => {
    window.gestore.sistema.versione().then(setVersione).catch(() => setVersione(''))
  }, [])

  /**
   * Cambia workspace dalla fascia.
   *
   * Le stesse azioni del pannello — il layout di adesso va salvato sotto il
   * workspace che si lascia, altrimenti tornandoci si troverebbe vuoto — solo
   * senza dover aprire niente.
   */
  const cambiaWorkspace = (nome: string): void => {
    if (nome === workspaceAttivo) return
    // L'errore non si ingoia: se il cambio non riesce, premere il nome del
    // workspace non farebbe niente e nessuno saprebbe perche'.
    void azioniDiFinestra(() => workspaceAttivo)
      .cambia(nome)
      // L'annuncio del cambio non torna a chi lo ha chiesto — di proposito, o
      // riscriverebbe il layout appena salvato — quindi questa finestra deve
      // rileggere da se' dove si trova. Senza, restava evidenziato il workspace
      // di prima mentre le chat erano gia' quelle nuove.
      .then(() => window.gestore.workspace.stato())
      .then((stato) => onStatoWorkspace?.(stato))
      .catch((err: unknown) => setErroreWs(String(err)))
  }
  useEffect(() => {
    window.gestore.sistema.cartellaUtente().then(setCasa).catch(() => setCasa(''))
  }, [])
  // La proposta con cui si apre la finestra della chat nuova. Assente: nessuna
  // finestra aperta.
  const [nuovaChat, setNuovaChat] = useState<PropostaChat | undefined>(undefined)

  const commuta = (quale: Exclude<PannelloAperto, undefined>): void =>
    onApri(aperto === quale ? undefined : quale)

  const inAttesa = ledAutopiloti.some((l) => l.classe === 'led--attesa')


  return (
    <>
      {/* Dove lavorare e come chiamarla, prima di aprirla. La cartella resta
          legata alla chat: da lì in poi non cambia più. */}
      {nuovaChat !== undefined ? (
        <ModaleNuovaChat
          proposta={nuovaChat}
          onAnnulla={() => setNuovaChat(undefined)}
          onApri={(cartella, nome) => {
            addPane(cartella, nome, modello === 'default' ? undefined : modello)
            setNuovaChat(undefined)
          }}
        />
      ) : null}

    <div className="console">
      <div className="sezione">
        <button
          className="tasto"
          onClick={onApriSessioni}
          title="Riprendi una conversazione già esistente"
        >
          ▣ Riprendi
        </button>
        <button
          className="tasto"
          onClick={onApriIstantanee}
          title="Salva tutte le chat aperte, o ricaricane un salvataggio"
        >
          ⤓ Salvataggi
        </button>
      </div>

      <div className="sezione">
        <button
          className="tasto tasto--primario"
          onClick={() => setNuovaChat(proponiNuovaChat(Object.values(riquadri), sessioni, casa))}
          title="Apre una chat nuova: prima chiede dove lavorare e come chiamarla"
        >
          + Nuova chat
        </button>
        <select
          className="campo campo--compatto"
          value={modello}
          onChange={(e) => setModello(e.target.value)}
          title="Con quale modello partiranno le prossime chat"
        >
          {MODELLI.map((m) => (
            <option key={m.valore} value={m.valore}>{m.etichetta}</option>
          ))}
        </select>
        <button
          className="tasto"
          onClick={() => window.gestore.finestre.nuova()}
          title="Apre una finestra sul primo monitor libero"
        >
          ⧉ Finestra
        </button>
      </div>

      {/* Lo spazio vuoto sta qui, fra i comandi e lo stato: cosi' i tasti che
          si premono restano ancorati a sinistra dove l'occhio li cerca, e lo
          stato di workspace e autopiloti resta ancorato a destra. */}
      <div className="sezione sezione--vuota" />

      {/* L'unica sezione che cede: quando la finestra si stringe e' questa a
          stringersi e a scorrere, perche' i workspace sono tanti e cambiano di
          numero, mentre i comandi delle altre sezioni sono sempre quelli. */}
      <div className="sezione sezione--cede">
        <span className="serigrafia">Workspace</span>
        {/* Tutti in vista, non uno dietro un menu: si passa da un insieme di
            chat all'altro con un clic, e si vede sempre dove si è. */}
        <div className="ws">
          {(workspaceNomi.length > 0 ? workspaceNomi : [workspaceAttivo]).filter((x) => x !== '').map((n) => (
            <button
              key={n}
              className={[
                'ws__voce',
                n === workspaceAttivo ? 'ws__voce--attivo' : '',
                // Un autopilota che aspetta una risposta di la' e' invisibile:
                // il pallino c'e', ma sta in un workspace che non hai davanti.
                workspaceCheChiamano?.has(n) === true ? 'ws__voce--chiama' : ''
              ].filter((c) => c !== '').join(' ')}
              onClick={() => cambiaWorkspace(n)}
              title={
                workspaceCheChiamano?.has(n) === true
                  ? `In «${n}» qualcuno aspetta una tua risposta`
                  : n === workspaceAttivo ? `Sei in «${n}»` : `Passa a «${n}»`
              }
            >
              {n}
              {workspaceCheChiamano?.has(n) === true ? <span className="ws__chiama" aria-label="richiede il tuo intervento">●</span> : null}
            </button>
          ))}
          {erroreWs !== undefined ? (
            <span className="misura" style={{ color: 'var(--ambra)' }} title={erroreWs}>⚠</span>
          ) : null}
          <button
            className="tasto tasto--icona"
            onClick={() => commuta('workspace')}
            aria-expanded={aperto === 'workspace'}
            title="Crea o elimina un workspace"
          >
            ⋯
          </button>
        </div>
      </div>

      <div className="sezione">
        {/* La versione e il modo di cercare un aggiornamento quando si vuole:
            l'attesa automatica è ogni sei ore, e chi ha appena pubblicato non
            ha voglia di aspettarle. */}
        <button
          className="versione"
          onClick={onApriNovita}
          title="Cosa è cambiato in questa versione"
        >
          v{versione}
        </button>
        <button
          className="tasto tasto--icona"
          onClick={() => void window.gestore.aggiornamenti.cerca()}
          title="Cerca ora un aggiornamento"
        >
          ⟳
        </button>
      </div>

      <div className="sezione">
        {/* Niente fila di LED qui: lo stesso stato si legge nella colonna di
            fianco e nel pannello, e in alto toglieva soltanto spazio alle chat.
            Il numero sul tasto basta a dire quanti stanno lavorando. */}
        <button
          className="tasto"
          onClick={() => commuta('provider')}
          aria-expanded={aperto === 'provider'}
          title="Con quale AI parlano le chat"
        >
          ⚙ AI
        </button>
        <button
          className="tasto tasto--icona"
          onClick={() => commuta('impostazioni')}
          aria-expanded={aperto === 'impostazioni'}
          title="Impostazioni: colori, porte, comportamenti"
        >
          ⚙
        </button>
        <button
          className="tasto"
          onClick={() => commuta('quaderno')}
          aria-expanded={aperto === 'quaderno'}
          title="Cosa e' stato fatto in questa cartella, in schede"
        >
          ▤ Quaderno
        </button>
        <button
          className="tasto"
          onClick={() => commuta('negozio')}
          aria-expanded={aperto === 'negozio'}
          title="Plugin, skill e MCP di Claude Code — installa e attiva a clic"
        >
          ▣ Negozio
        </button>
        <button
          className="tasto"
          onClick={() => commuta('account')}
          aria-expanded={aperto === 'account'}
          title="Accesso: la chiave per ritrovare i tuoi dati su un altro computer"
        >
          ◍ Account
        </button>
        <button
          className="tasto"
          onClick={() => commuta('consumi')}
          aria-expanded={aperto === 'consumi'}
          title="Quanto hai consumato, e con quale account"
        >
          ◔ Consumi
        </button>
        <button
          className="tasto"
          onClick={() => commuta('autopiloti')}
          aria-expanded={aperto === 'autopiloti'}
          title={
            inAttesa
              ? 'Un autopilota aspetta una tua risposta'
              : 'Avvia e governa gli autopiloti'
          }
        >
          Autopiloti{ledAutopiloti.length > 0 ? ` ${ledAutopiloti.length}` : ''} ▾
        </button>
      </div>
    </div>
    </>
  )
}
