import { useCallback, useEffect, useRef, useState } from 'react'
import { useLayoutStore } from './state/layout'
import { useSessionStore } from './state/sessions'
import { creaPersistenza } from './persistenza-layout'
import { azioniDiFinestra } from './azioni-finestra'
import type { AzioniWorkspace } from './workspace-azioni'
import { ledDi } from './autopilota-vista'
import { attivaTrascinamento } from './trascina-finestre'
import type { Autopilota } from '@shared/autopilota'
import type { StatoWorkspace } from '../main/ipc'
import { Mosaic } from './components/Mosaic'
import { ModaleSessioni } from './components/ModaleSessioni'
import { ModaleIstantanee, NOME_AUTOMATICO } from './components/ModaleIstantanee'
import { Console, type PannelloAperto } from './components/Console'
import { PannelloWorkspace } from './components/PannelloWorkspace'
import { PannelloAutopiloti } from './components/PannelloAutopiloti'
import { PannelloConsumi } from './components/PannelloConsumi'
import { PannelloProvider } from './components/PannelloProvider'
import { ModaleAccesso } from './components/ModaleAccesso'
import { ModalePreparazione } from './components/ModalePreparazione'
import { ModaleNovita } from './components/ModaleNovita'
import type { Novita } from '@shared/novita'
import type { StatoPreparazione } from '../main/preparazione'
import { BandaAvvisi } from './components/BandaAvvisi'
import { componiAvvisi } from './avvisi'
import type { StatoAccesso } from '../main/accesso'
import { DomandaModale } from './components/DomandaModale'
import { SchermataAvvio } from './components/SchermataAvvio'
import type { StatoAggiornamento } from '../main/aggiornamenti'

/**
 * Ogni quanto si chiede lo stato degli autopiloti.
 *
 * I LED sono nella fascia e restano visibili anche a pannello chiuso, quindi si
 * interroga sempre: è una richiesta locale ogni cinque secondi, ed è il prezzo
 * per poter guardare da lontano senza aprire niente.
 */
const RICARICA_AUTOPILOTI_MS = 5000

/**
 * Collega la persistenza del layout — la cui logica sta in `persistenza-layout`,
 * fuori da React — al ciclo di vita del componente.
 */
function usaPersistenzaLayout(): void {
  useEffect(() => {
    const persistenza = creaPersistenza({
      carica: () => window.gestore.layout.carica(),
      salva: (l) => window.gestore.layout.salva(l),
      esporta: () => useLayoutStore.getState().esporta(),
      applica: (l) => useLayoutStore.getState().carica(l),
      sottoscrivi: (cb) => useLayoutStore.subscribe(cb)
    })
    persistenza.avvia()

    // Ogni modifica e' gia' sul disco quando questa parte: resta come ultima
    // parola, perche' un'uscita e' il solo momento in cui vale la pena di
    // essere ridondanti.
    const salvaAllaChiusura = (): void => persistenza.salvaSubito()
    window.addEventListener('beforeunload', salvaAllaChiusura)

    // Quando si salva una sessione, il Core chiede a ogni finestra com'è
    // disposta: è così che un salvataggio fatto da qui comprende anche le chat
    // delle altre finestre, che prima restavano fuori.
    const smettiDiRispondere = window.gestore.layout.suRichiesta(() =>
      useLayoutStore.getState().esporta()
    )

    return () => {
      window.removeEventListener('beforeunload', salvaAllaChiusura)
      smettiDiRispondere()
      persistenza.chiudi()
    }
  }, [])
}

/**
 * Accoglie i riquadri che arrivano da un'altra finestra.
 *
 * Il `Terminal` che si monta ha già il proprio `ptyId`, quindi chiede `attach` e
 * riceve lo scrollback: la conversazione riappare dov'era, senza che claude.exe
 * riparta.
 */
function usaRiquadriInArrivo(): void {
  useEffect(() => {
    return window.gestore.finestre.onRiquadroInArrivo((pane) => {
      useLayoutStore.getState().accogliPane(pane)
    })
  }, [])
}

export function App(): React.JSX.Element {
  const root = useLayoutStore((s) => s.root)
  usaPersistenzaLayout()
  usaRiquadriInArrivo()

  // Le finestre si spostano prendendole per la testa. Per delega e in un posto
  // solo: ogni pannello, anche quelli che verranno, diventa mobile senza che
  // nessuno debba ricordarsene.
  useEffect(() => attivaTrascinamento(), [])

  const [modale, setModale] = useState<'sessioni' | 'istantanee' | 'ripresa' | 'accesso' | 'preparazione' | undefined>(undefined)
  const [preparazione, setPreparazione] = useState<StatoPreparazione | undefined>(undefined)
  const [novita, setNovita] = useState<Novita | undefined>(undefined)
  const [aperto, setAperto] = useState<PannelloAperto>(undefined)
  const [workspace, setWorkspace] = useState<StatoWorkspace>({ nomi: [], attivo: '' })
  const [autopiloti, setAutopiloti] = useState<Autopilota[]>([])
  const [erroreAutopiloti, setErroreAutopiloti] = useState<string | undefined>(undefined)
  const [alLogin, setAlLogin] = useState<boolean | undefined>(undefined)
  const [accesso, setAccesso] = useState<StatoAccesso>({ autenticato: true })
  const [pronto, setPronto] = useState(false)
  const [attesaVisibile, setAttesaVisibile] = useState(false)
  const [aggiornamento, setAggiornamento] = useState<StatoAggiornamento>({ fase: 'fermo' })

  // Lo stato dell'aggiornamento arriva dal Core: cercare si fa da soli,
  // scaricare e installare li decide l'utente da questa banda.
  useEffect(() => {
    window.gestore.aggiornamenti.stato().then(setAggiornamento).catch(() => undefined)
    return window.gestore.aggiornamenti.suStato(setAggiornamento)
  }, [])

  // «Già aggiornato» è una risposta, non uno stato: si legge e se ne va. Se
  // restasse lì occuperebbe una riga di schermo per dire che non c'è niente da
  // fare, e domani sarebbe ancora lì a dirlo.
  useEffect(() => {
    if (aggiornamento.fase !== 'aggiornato') return
    const h = setTimeout(() => setAggiornamento({ fase: 'fermo' }), 5000)
    return () => clearTimeout(h)
  }, [aggiornamento.fase])

  const { progress, setProgress, setEsito, load: caricaSessioni } = useSessionStore()

  const ricaricaAutopiloti = useCallback((): void => {
    window.gestore.autopilota
      .elenca()
      .then((a) => {
        setAutopiloti(a)
        setErroreAutopiloti(undefined)
        // Chi ha appena chiuso la finestra si chiede una cosa sola: sta ancora
        // lavorando? La risposta sta nel testo dell'icona in basso a destra.
        window.gestore.sistema.autopilotiAlLavoro(
          a.filter((x) => x.stato === 'lavoro' || x.stato === 'attesa').length
        )
      })
      // Il messaggio del client nomina il servizio e la porta: è la differenza
      // fra «non ci sono autopiloti» e «il servizio non risponde».
      .catch((e: unknown) => { setAutopiloti([]); setErroreAutopiloti(String(e)) })
  }, [])

  useEffect(() => {
    ricaricaAutopiloti()
    const h = setInterval(ricaricaAutopiloti, RICARICA_AUTOPILOTI_MS)
    return () => clearInterval(h)
  }, [ricaricaAutopiloti])

  // Cosa è cambiato in questa versione, alla prima apertura e basta. Chiederlo
  // è anche dichiararlo letto — il segno lo mette il Core — quindi questa
  // domanda va fatta una volta sola per finestra, e mai in un effetto che
  // possa ripetersi.
  useEffect(() => {
    window.gestore.novita
      .daMostrare()
      .then((n) => { if (n !== undefined) setNovita(n) })
      // Un elenco di novità che non arriva non è una ragione per disturbare
      // nessuno: si continua senza.
      .catch(() => undefined)
  }, [])

  // Cosa c'è sul computer, chiesto una volta all'avvio. Chi installa SierraDeck
  // non deve sapere cos'è un PATH: se Claude Code manca, la banda lo dice e la
  // finestra della preparazione lo installa. Un errore qui non deve produrre un
  // blocco: si prosegue come si è sempre fatto, e sarà la prima chat a dire il
  // contrario.
  useEffect(() => {
    window.gestore.preparazione
      .stato()
      .then(setPreparazione)
      .catch(() => setPreparazione(undefined))
  }, [])

  // L'accesso si legge una volta all'avvio: cambia solo quando l'utente fa il
  // login da un terminale, e in quel caso riaprire il gestore è già nel gesto.
  useEffect(() => {
    window.gestore.accesso
      .stato()
      .then(setAccesso)
      // Un errore qui non deve produrre un avviso di blocco: si presume che
      // vada bene, e sarà la prima chat a dire il contrario.
      .catch(() => setAccesso({ autenticato: true }))
  }, [])

  // Il nome del workspace attivo cambia sotto le azioni, che nascono una volta
  // sola: senza questo riferimento ricorderebbero i riquadri vivi sotto il nome
  // che l'attivo aveva all'apertura della finestra.
  const attivoOra = useRef(workspace.attivo)
  attivoOra.current = workspace.attivo
  const azioniWorkspace = useRef<AzioniWorkspace | undefined>(undefined)
  azioniWorkspace.current ??= azioniDiFinestra(() => attivoOra.current)

  // La barra del titolo dice versione e workspace: con piu' finestre aperte su
  // workspace diversi e' l'unico posto che le distingue da fuori — in Alt+Tab,
  // nella barra delle applicazioni, in una registrazione dello schermo.
  const [versioneTitolo, setVersioneTitolo] = useState('')
  useEffect(() => {
    window.gestore.sistema.versione().then(setVersioneTitolo).catch(() => setVersioneTitolo(''))
  }, [])
  useEffect(() => {
    const dove = workspace.attivo.trim()
    const versione = versioneTitolo === '' ? '' : ` v${versioneTitolo}`
    window.gestore.sistema.titoloFinestra(`SierraDeck${versione}${dove === '' ? '' : ` — ${dove}`}`)
  }, [workspace.attivo, versioneTitolo])

  useEffect(() => {
    window.gestore.workspace
      .stato()
      .then(setWorkspace)
      .catch(() => setWorkspace({ nomi: [], attivo: '' }))
    // Il workspace attivo è dell'applicazione, non della finestra: quando
    // un'altra lo cambia, questa deve **seguirla** e non limitarsi a cambiare
    // etichetta. Finché non lo faceva, i suoi riquadri restavano a schermo
    // mentre per l'archivio l'attivo era già un altro: il salvataggio successivo
    // li scriveva sotto il workspace nuovo, sopra le chat che ci vivevano. È il
    // modo in cui, con due finestre aperte, i layout finivano per svuotarsi
    // tutti — il sintomo del difetto 0-quater.
    return window.gestore.workspace.onCambiato((s) => {
      setWorkspace({ nomi: s.nomi, attivo: s.attivo })
      void azioniWorkspace.current
        ?.segui(s.precedente, s.attivo)
        .catch((err: unknown) => console.error('[workspace] cambio non seguito:', err))
    })
  }, [])

  // La lettura delle trascrizioni, con la sua schermata di attesa.
  //
  // Sta qui e non nella finestra delle sessioni perché comincia all'avvio del
  // programma, molto prima che qualcuno apra quella finestra: è l'unico posto
  // da cui si può mostrare com'è messa.
  useEffect(() => {
    const offAvanzamento = window.gestore.sessions.onProgress((a) => {
      setProgress(a)
      if (a.fase === 'fine') {
        setPronto(true)
        void caricaSessioni()
      }
    })
    const offEsito = window.gestore.sessions.onOutcome((e) => {
      setEsito(e)
      setPronto(true)
      void caricaSessioni()
    })

    // Il renderer si collega qualche decina di millisecondi dopo il main: se la
    // lettura è già finita in quel frattempo non arriverà più nessun evento, e
    // senza questa domanda la schermata di attesa resterebbe lì per sempre.
    window.gestore.sessions
      .stato()
      .then((s) => {
        if (s.avanzamento !== undefined) setProgress(s.avanzamento)
        if (!s.inCorso) {
          setPronto(true)
          void caricaSessioni()
        }
      })
      // Un canale che non risponde non deve tenere in ostaggio l'applicazione:
      // l'elenco delle sessioni si può sempre ricaricare a mano, il programma no.
      .catch(() => setPronto(true))

    return () => {
      offAvanzamento()
      offEsito()
    }
  }, [caricaSessioni, setProgress, setEsito])

  // La schermata d'attesa non compare subito.
  //
  // Quando l'indice è già a posto la lettura dura mezzo secondo, e una
  // schermata che appare e sparisce in quel tempo è un lampo: si nota come
  // disturbo, non come informazione. Se invece l'attesa c'è davvero — la prima
  // volta, o dopo un «Rileggi» — questo quarto di secondo non si distingue
  // dall'avvio della finestra.
  useEffect(() => {
    if (pronto) return
    const h = setTimeout(() => setAttesaVisibile(true), 250)
    return () => clearTimeout(h)
  }, [pronto])

  // La domanda all'avvio, quando esiste almeno un salvataggio.
  //
  // Compare **anche** se le chat sono già tornate da sole — il layout si
  // ripristina per conto suo — perché la scelta che l'utente vuole all'apertura
  // non è solo «riprendo o no», ma «riprendo *quale*»: un salvataggio di ieri
  // può essere quello giusto anche se sullo schermo ci sono già le chat di
  // stasera. Il testo della finestra dice cosa c'è già aperto, così la scelta è
  // informata invece che al buio.
  useEffect(() => {
    let annullato = false
    window.gestore.istantanee
      .elenca()
      .then((tutte) => {
        if (annullato || tutte.length === 0) return
        setModale('ripresa')
      })
      .catch(() => undefined)
    return () => { annullato = true }
  }, [])

  // Alla chiusura, un salvataggio automatico sotto un nome riservato: se
  // l'utente non ha salvato di suo, al prossimo avvio trova comunque le chat di
  // ieri sera. Non sostituisce i salvataggi con nome, ci si affianca.
  useEffect(() => {
    const allaChiusura = (): void => {
      const layout = useLayoutStore.getState().esporta()
      if (layout.panes.length === 0) return
      void window.gestore.istantanee.salva(NOME_AUTOMATICO, layout, true)
    }
    window.addEventListener('beforeunload', allaChiusura)
    return () => window.removeEventListener('beforeunload', allaChiusura)
  }, [])

  useEffect(() => {
    if (aperto !== 'autopiloti' || alLogin !== undefined) return
    // Senza argomento il canale non cambia niente: risponde solo com'è messo.
    void window.gestore.autopilota
      .avvioAlLogin()
      .then((s) => setAlLogin(s.installato))
      .catch(() => setAlLogin(undefined))
  }, [aperto, alLogin])

  // Finché le trascrizioni non sono state lette non c'è niente di sensato da
  // mostrare: l'elenco sarebbe vuoto, i consumi a zero e i salvataggi da
  // riprendere sconosciuti. Meglio una cosa sola fatta bene di una finestra a
  // metà che si popola sotto gli occhi.
  if (!pronto) {
    // Prima del quarto di secondo: il fondo e basta, che è quello che si vede
    // comunque mentre la finestra si apre.
    return attesaVisibile ? (
      <SchermataAvvio avanzamento={progress} />
    ) : (
      <div style={{ height: '100vh', background: 'var(--fondo)' }} />
    )
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--fondo)' }}>
      {/* Sopra tutto: compare da sé quando un autopilota ha bisogno di una
          risposta, e si può rimandare senza perderla. */}
      <DomandaModale autopiloti={autopiloti} />

      {/* Sopra a tutto e prima di tutto: è la prima apertura di una versione
          nuova, e le poche righe che dicono cosa è cambiato non devono
          contendersi lo schermo con la domanda «vuoi riprendere?». */}
      {novita !== undefined ? (
        <ModaleNovita novita={novita} onChiudi={() => setNovita(undefined)} />
      ) : null}

      {modale === 'sessioni' ? <ModaleSessioni onChiudi={() => setModale(undefined)} /> : null}
      {modale === 'accesso' ? <ModaleAccesso onChiudi={() => setModale(undefined)} /> : null}
      {modale === 'preparazione' ? (
        <ModalePreparazione
          onChiudi={() => setModale(undefined)}
          onPreparazione={setPreparazione}
        />
      ) : null}
      {modale === 'istantanee' ? <ModaleIstantanee onChiudi={() => setModale(undefined)} /> : null}
      {/* All'avvio, e solo se c'e' davvero qualcosa da riprendere: una finestra
          che chiede «vuoi riprendere?» quando non c'e' niente da riprendere e'
          un ostacolo fra l'utente e la prima chat. */}
      {modale === 'ripresa' && novita === undefined ? (
        <ModaleIstantanee
          allAvvio
          chatGiaAperte={root === undefined ? 0 : Object.keys(useLayoutStore.getState().panes).length}
          onChiudi={() => setModale(undefined)}
        />
      ) : null}

      <Console
        onApriSessioni={() => setModale('sessioni')}
        onApriIstantanee={() => setModale('istantanee')}
        aperto={aperto}
        onApri={setAperto}
        workspaceAttivo={workspace.attivo}
        workspaceNomi={workspace.nomi}
        onStatoWorkspace={setWorkspace}
        ledAutopiloti={autopiloti.map((a) => ({ id: a.id, ...ledDi(a) }))}
      />

      {/* L'aggiornamento sta sopra la banda degli avvisi: non è un guasto da
          sistemare, è una cosa buona che aspetta un sì. */}
      {aggiornamento.fase === 'aggiornato' ? (
        <div className="avviso avviso--aggiornamento">
          <span className="led led--lavoro" />
          <span>SierraDeck è già aggiornato.</span>
        </div>
      ) : null}
      {aggiornamento.fase === 'disponibile' || aggiornamento.fase === 'scarico' || aggiornamento.fase === 'pronto' ? (
        <div className="avviso avviso--aggiornamento">
          <span className="led led--lavoro" />
          {aggiornamento.fase === 'disponibile' ? (
            <>
              <span>C’è una versione nuova ({aggiornamento.versione}).</span>
              <button className="tasto" onClick={() => void window.gestore.aggiornamenti.scarica()}>
                Scarica
              </button>
            </>
          ) : aggiornamento.fase === 'scarico' ? (
            <span>Scarico la versione {aggiornamento.versione}… {aggiornamento.percento ?? 0}%</span>
          ) : (
            <>
              <span>
                La versione {aggiornamento.versione} è pronta. Installandola SierraDeck si chiude e
                riparte: le chat aperte tornano dal salvataggio automatico.
              </span>
              <button
                className="tasto tasto--primario"
                onClick={() => void window.gestore.aggiornamenti.installa()}
              >
                Installa e riavvia
              </button>
            </>
          )}
          <span style={{ flex: 1 }} />
          <button className="tasto" onClick={() => setAggiornamento({ fase: 'fermo' })} title="Più tardi">
            ×
          </button>
        </div>
      ) : null}

      <BandaAvvisi
        avvisi={componiAvvisi({
          accesso,
          servizioRaggiungibile: erroreAutopiloti === undefined,
          autopiloti,
          ...(preparazione !== undefined ? { preparazione } : {})
        })}
        onAzione={(azione) => {
          if (azione === 'riavviaServizio') ricaricaAutopiloti()
          else if (azione === 'apriAutopiloti') setAperto('autopiloti')
          else if (azione === 'apriAccesso') setModale('accesso')
          else if (azione === 'apriPreparazione') setModale('preparazione')
          // «apriDomanda» non ha bisogno di niente: la finestra della domanda
          // compare da sé, e il tasto serve solo a chi l'aveva rimandata.
          else setAperto(undefined)
        }}
      />

      <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
        {/* I pannelli scorrono sopra il mosaico invece di spingerlo: chiudendoli,
            nessun riquadro si è mosso di un pixel. */}
        {aperto === 'workspace' ? (
          <PannelloWorkspace
            stato={workspace}
            onStato={setWorkspace}
            onChiudi={() => setAperto(undefined)}
          />
        ) : null}
        {aperto === 'provider' ? (
          <PannelloProvider onChiudi={() => setAperto(undefined)} />
        ) : null}
        {aperto === 'consumi' ? (
          <PannelloConsumi onChiudi={() => setAperto(undefined)} />
        ) : null}
        {aperto === 'autopiloti' ? (
          <PannelloAutopiloti
            elenco={autopiloti}
            errore={erroreAutopiloti}
            alLogin={alLogin}
            onRicarica={ricaricaAutopiloti}
            onErrore={setErroreAutopiloti}
            onAlLogin={setAlLogin}
            onChiudi={() => setAperto(undefined)}
          />
        ) : null}

        <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>
          {root ? (
            <Mosaic node={root} autopiloti={autopiloti} />
          ) : (
            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--testo-quieto)' }}>
              <div style={{ fontSize: 14, marginBottom: 6 }}>Nessuna chat aperta</div>
              <div style={{ fontSize: 12 }}>
                Premi <b style={{ color: 'var(--testo)' }}>+ Nuova chat</b>, oppure{' '}
                <button className="collegamento" onClick={() => setModale('sessioni')}>
                  riprendi una conversazione
                </button>
                .
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
