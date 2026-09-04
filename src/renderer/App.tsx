import { useCallback, useEffect, useRef, useState } from 'react'
import { useLayoutStore } from './state/layout'
import { useSessionStore } from './state/sessions'
import { creaPersistenza } from './persistenza-layout'
import { azioniDiFinestra, impostaIbernaLasciando } from './azioni-finestra'
import type { AzioniWorkspace } from './workspace-azioni'
import { ledDi } from '@shared/autopilota-vista'
import { giaSalvatoCome } from '@shared/doppioni'
import type { Istantanea } from '@shared/istantanea'
import { chiChiede, workspaceCheChiamano } from '@shared/dove-chiedono'
import { attivaChiusuraFuori, attivaTrascinamento } from './trascina-finestre'
import { chatAspetta, creaUltimeRighe, ultimaRigaDalloSchermo } from './ultime-righe'
import { creaBattito, stessiAttivi } from './battito'
import { eseguiConsegna, ponteReale, scriviQuandoPronta } from './consegne-autopilota'
import { memoriaWorkspace } from './memoria-workspace'
import { impostaWorkspaceCorrente, workspaceCorrente } from './workspace-corrente'
import { impostaMostraAttesa } from './preferenze-vive'
import { leggiConsegne } from '../main/autopilota-consegne'
import type { Autopilota } from '@shared/autopilota'
import type { StatoWorkspace } from '../main/ipc'
import { Mosaic } from './components/Mosaic'
import { ModaleSessioni } from './components/ModaleSessioni'
import { ModaleIstantanee, NOME_AUTOMATICO } from './components/ModaleIstantanee'
import { Console, type PannelloAperto } from './components/Console'
import { PannelloWorkspace } from './components/PannelloWorkspace'
import { PannelloAutopiloti } from './components/PannelloAutopiloti'
import { PannelloQuaderno } from './components/PannelloQuaderno'
import { PannelloImpostazioni } from './components/PannelloImpostazioni'
import { PannelloNegozio } from './components/PannelloNegozio'
import { PannelloTrasferimenti } from './components/PannelloTrasferimenti'
import { tavolozza, type Preferenze } from '@shared/preferenze'
import { ModaleAccesso } from './components/ModaleAccesso'
import { ModalePreparazione } from './components/ModalePreparazione'
import { ModaleNovita } from './components/ModaleNovita'
import { novitaDi, type Novita } from '@shared/novita'
import type { StatoPreparazione } from '../main/preparazione'
import { BandaAvvisi } from './components/BandaAvvisi'
import { componiAvvisi } from './avvisi'
import type { StatoAccesso } from '../main/accesso'
import { DomandaModale } from './components/DomandaModale'
import { SchermataAvvio } from './components/SchermataAvvio'
import { SchermataAccesso } from './components/SchermataAccesso'
import { utenteCorrente, suCambioAccesso } from './accesso-supabase'
import { Serratura } from './components/Serratura'
import type { StatoAggiornamento } from '../main/aggiornamenti'
import { righeDiPty, finestraDiPty } from './schermo-terminale'

/**
 * Quante righe dello schermo vanno al telefono.
 *
 * Piu' delle quattordici che si tenevano prima, e non e' un capriccio: quelle
 * erano righe **accumulate** dal flusso, quindi in buona parte ridisegni della
 * stessa cosa. Queste sono righe di schermo vero, ognuna diversa dall'altra, e
 * ci sta dentro il riquadro di Claude Code per intero invece che tagliato a
 * meta'.
 */
const RIGHE_PER_IL_TELEFONO = 24

/**
 * Quanto si aspetta, fra il testo e l'invio, per un messaggio venuto da fuori.
 *
 * Serve a far arrivare le due cose in blocchi distinti: e' la distanza che
 * distingue «ho incollato del testo che contiene un a capo» da «ho scritto e
 * poi ho premuto invio». Abbondante di proposito — nessuno sta a guardare il
 * decimo di secondo, e un invio perso costa un messaggio che non parte.
 */
const PAUSA_PRIMA_DELL_INVIO_MS = 150

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
      // Il nome del workspace **non viaggia più**: lo sa il Core, che si ricorda
      // quale layout ha consegnato a questa finestra e per quale workspace. Era
      // l'ultima cosa che il renderer dichiarava e che poteva essere sbagliata —
      // e per tre volte lo è stata, scrivendo le chat di un workspace sopra
      // quelle di un altro. Adesso al posto della dichiarazione viaggia lo
      // scontrino della consegna, che sta nel ponte.
      //
      // Viaggia ancora **chi è stata congedata**: chiusa, spostata, troncata. È
      // la sola cosa che il Core non può dedurre da solo, ed è quella che gli
      // serve per rifiutare un salvataggio che farebbe sparire una chat che
      // nessuno ha chiuso. Lo scontrino copre la provenienza, questo il
      // contenuto: servono tutti e due.
      salva: (l) => window.gestore.layout.salva(l, useLayoutStore.getState().congediDaMandare()),
      esporta: () => useLayoutStore.getState().esporta(),
      applica: (l) => useLayoutStore.getState().cambiaVista(l),
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

    // Alla chiusura il Core chiede di salvare subito e aspetta: `beforeunload`
    // da solo non basta quando è un aggiornamento a chiudere l'app, e l'ultimo
    // stato — la chat su cui si lavorava — poteva non essere ancora sul disco.
    const smettiDiSalvareSubito = window.gestore.layout.suSalvaSubito(() =>
      persistenza.salvaSubito()
    )

    // Un ripristino riempie le finestre che ci sono già invece di aprirne di
    // nuove: quando tocca a questa, il layout arriva di qui. Prima le si
    // affiancava una finestra nuova e questa restava con le chat di prima —
    // le stesse chat due volte, in due finestre.
    //
    // `cambiaVista` e non `carica`: `carica` sostituisce i riquadri senza
    // toccare i «ceduti», e allora i `Terminal` che si smontano non trovano il
    // loro riquadro fra quelli ceduti e chiamano `chiudi()` invece di
    // `stacca()`. Cioè: **un layout che arriva da fuori uccideva i claude.exe
    // delle chat che continuano a esistere.** `cambiaVista` è la stessa
    // sostituzione fatta sapendo che chi esce di scena non è chi è stato
    // chiuso — ed esisteva già, per il cambio di workspace.
    // Senza risalvarlo: e' la verita' del Core, e risalvarla faceva il giro
    // senza fine raccontato in `persistenza-layout.ts`.
    const smettiDiRicevere = window.gestore.layout.suApplica((l) => {
      persistenza.applicaDaFuori(l)
    })

    return () => {
      window.removeEventListener('beforeunload', salvaAllaChiusura)
      smettiDiRispondere()
      smettiDiSalvareSubito()
      smettiDiRicevere()
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
  // I colori scelti dall'utente, applicati alla radice del documento: le
  // variabili del foglio di stile esistono gia' — qui si limitano a cambiare
  // valore, e tutto il resto segue senza sapere niente.
  const applica = (p: Preferenze): void => {
    for (const [nome, valore] of Object.entries(tavolozza(p))) {
      document.documentElement.style.setProperty(nome, valore)
    }
    // Dove va il diario dell'autopilota non è un colore ma una direzione, e
    // arriva come attributo invece che come token: il foglio di stile deve
    // poterci cambiare **quattro** regole insieme — il verso del riquadro, il
    // lato del bordo, il bordo su cui sta la maniglia e il verso del cursore —
    // e un `var()` da solo non ci arriva. È anche l'unico posto da cui la
    // maniglia legge il proprio asse: una verità sola, o si muoverebbero
    // lungo assi diversi.
    document.documentElement.dataset.diario = p.postoAutopilota
  }
  useEffect(() => {
    window.gestore.preferenze.leggi().then(applica).catch(() => undefined)
    return window.gestore.preferenze.suCambio(applica)
  }, [])

  const riquadriAperti = useLayoutStore((s) => s.panes)
  /**
   * La cartella di cui parla il quaderno: quella di un riquadro aperto. Senza
   * riquadri non c'e' un progetto davanti, e si torna alla cartella dell'utente.
   */
  const cartellaDavanti = (): string => {
    const primo = Object.values(riquadriAperti)[0]
    return primo?.cwd ?? ''
  }
  // Dove questa finestra si trova vive in `workspace-corrente`, fuori da React:
  // la persistenza lo legge a ogni salvataggio, e deve poterlo vedere cambiare
  // **prima** che il layout nuovo arrivi a schermo — cosa che uno stato di React
  // non può fare, perché si aggiorna solo al render successivo.
  usaPersistenzaLayout()
  usaRiquadriInArrivo()

  // Le finestre si spostano prendendole per la testa. Per delega e in un posto
  // solo: ogni pannello, anche quelli che verranno, diventa mobile senza che
  // nessuno debba ricordarsene.
  useEffect(() => attivaTrascinamento(), [])

  // Il Core non sa quali chat sono aperte: lo sa questa finestra, e glielo
  // dice a ogni cambiamento perche' il Client possa mostrarle.
  // L'ultima riga di ogni terminale: dal telefono è l'unico modo per sapere se
  // quello che si è mandato ha prodotto qualcosa. Senza, si scrive e si resta a
  // fissare lo stesso titolo di prima.
  const righe = useRef(creaUltimeRighe())
  // Se quella chat ha finito e aspetta te. Sta qui, in un punto solo, perché lo
  // chiedono in quattro — l'annuncio al telefono, le consegne dell'autopilota,
  // la ripresa dopo un aggiornamento — e per tre giorni una di quelle risposte
  // è stata diversa dalle altre.
  const aspettaOra = useCallback(
    (ptyId: string): boolean =>
      chatAspetta(
        righe.current.attivitaDi(ptyId),
        righeDiPty(ptyId, RIGHE_PER_IL_TELEFONO)?.pulite,
        Date.now()
      ),
    []
  )
  // Quali terminali si stanno muovendo adesso. Si ricalcola a intervalli e non
  // a ogni pezzo di output: mentre una chat scrive arrivano decine di eventi al
  // secondo, e ridisegnare il mosaico a ognuno costerebbe piu' del terminale.
  const battito = useRef(creaBattito())
  const [pensano, setPensano] = useState<ReadonlySet<string>>(new Set())
  useEffect(() => {
    const h = setInterval(() => {
      const vivi = battito.current.attivi(Date.now())
      setPensano((prima) => (stessiAttivi(prima, vivi) ? prima : vivi))
    }, 400)
    return () => clearInterval(h)
  }, [])
  useEffect(() => {
    // Direttamente dal canale, non dal bus: qui non interessa **quale**
    // riquadro riceve, ma cosa scrivono tutti — e il bus è fatto apposta per
    // consegnare a uno solo.
    return window.gestore.pty.onEvent((msg) => {
      if (msg.kind === 'data') {
        righe.current.aggiorna(msg.id, msg.data)
        // Lo stesso passaggio dice anche **chi si sta muovendo**: finche' da un
        // terminale arriva qualcosa, quella chat sta lavorando. Prima una chat
        // al lavoro e una ferma sul prompt erano lo stesso riquadro fermo.
        battito.current.segna(msg.id, Date.now())
      }
      // Un terminale finito non e' un posto dove scrivere: senza questa riga
      // sembrerebbe il piu' pronto di tutti - ha visto il prompt e da allora
      // tace - e il compito ci finirebbe dentro, perduto.
      if (msg.kind === 'exit') righe.current.segnaMorto(msg.id)
    })
  }, [])

  // Le mappe di `ultime-righe` crescono per **ogni** terminale che passa dal
  // flusso, rilanci compresi: a ogni `--resume` l'id cambia, e il vecchio
  // resterebbe li' per sempre. Qui si tengono solo i terminali che un riquadro
  // aperto ha ancora in mano, e il resto — chat chiuse, ibernate, id vecchi di un
  // resume — se ne va. Gira quando i riquadri cambiano: e' esattamente il momento
  // in cui un id smette di servire (una chiusura, o un rilancio che lo sostituisce).
  useEffect(() => {
    const vivi = new Set(
      Object.values(riquadriAperti)
        .map((p) => p.ptyId)
        .filter((x): x is string => x !== undefined)
    )
    righe.current.pota(vivi)
  }, [riquadriAperti])

  useEffect(() => {
    const manda = (): void => {
      window.gestore.client.annunciaChat(
        Object.values(riquadriAperti).map((p) => ({
          id: p.id,
          titolo: p.title !== undefined && p.title !== '' ? p.title : p.cwd,
          cwd: p.cwd,
          // Quale conversazione: il Core la usa per sapere a chi consegnare le
          // istruzioni di un autopilota, e il telefono per guardarci dentro.
          sessione: p.sessionUuid,
          // Se ha finito di scrivere e sta aspettando te. È lo stesso
          // giudizio che usa l’autopilota per sapere quando può parlare —
          // il prompt visto, e poi un po’ di silenzio — e da un telefono è
          // *la* notizia: «ha finito, tocca a te».
          aspetta: p.ptyId === undefined ? false : aspettaOra(p.ptyId),
          // Chi è governata da un autopilota non deve avvisare per conto
          // suo: l’autopilota le parla da sé, e due notifiche per lo stesso
          // fatto sono una di troppo.
          governata: p.autopilota !== undefined,
          // Ha un processo acceso: senza, non c'è niente da finire né a cui scrivere.
          viva: p.ptyId !== undefined,
          ...(p.ptyId !== undefined
            ? (() => {
                // Prima si prova a leggere lo **schermo disegnato**: Claude Code
                // e' un'interfaccia a tutto schermo, si riscrive in posizione, e
                // rimettere in fila i pezzi del flusso dava dal telefono le
                // scritte mischiate — riscritture diventate righe nuove, e testo
                // vecchio incollato al nuovo dove c'era un ritorno a capo da solo.
                // Se il riquadro non c'e' (chat appena ceduta, terminale che sta
                // nascendo) si torna al modo di prima invece di mostrare il vuoto.
                const schermo = righeDiPty(p.ptyId, RIGHE_PER_IL_TELEFONO)
                // Anche l'ultima riga viene dallo schermo, non dal flusso: il
                // flusso di un'interfaccia che si ridisegna in posizione finisce
                // con un frammento — ed era quello che arrivava nelle notifiche
                // del telefono, letto come caratteri a caso.
                const dalloSchermo = ultimaRigaDalloSchermo(schermo?.pulite)
                return {
                  ultimaRiga: dalloSchermo !== '' ? dalloSchermo : righe.current.di(p.ptyId),
                  coda: schermo?.pulite ?? righe.current.codaDi(p.ptyId),
                  // Le stesse righe vestite: e' il telefono a rimetterci i
                  // colori, e senza queste li' si legge un terminale sbiancato.
                  codaGrezza: schermo?.grezze ?? righe.current.codaGrezzaDi(p.ptyId)
                }
              })()
            : {})
        }))
      )
    }
    manda()
    // Le righe cambiano di continuo mentre le chat lavorano: si rimandano a
    // intervalli invece che a ogni carattere, che sarebbe un messaggio ogni
    // pochi millisecondi per una cosa che si guarda ogni due secondi.
    const h = setInterval(manda, 2000)
    return () => clearInterval(h)
  }, [riquadriAperti])

  // Le istruzioni dell'autopilota, portate dentro le chat vere.
  //
  // È il modo in cui l'autopilota lavora adesso: non esegue, coordina. Scrive
  // nella chat come faresti tu, si vede tutto quello che succede, e si può
  // intervenire in mezzo — perché per la chat i due messaggi sono uguali.
  useEffect(() => window.gestore.client.suConsegna((grezza) => {
    for (const c of leggiConsegne({ consegne: [grezza] })) {
      // La prontezza la legge dal flusso dei terminali, che passa di qui: un
      // messaggio scritto mentre Claude Code si sta ancora disegnando resta nel
      // campo, e la chat non parte.
      const porta = (): void => {
        eseguiConsegna(c, ponteReale(aspettaOra, workspaceCorrente))
      }
      // **Prima si va dove la chat vive.** La sua conversazione puo' essere
      // salvata in un altro workspace: consegnare qui aprirebbe una seconda
      // copia sotto i tuoi occhi, e il lavoro andrebbe in quella - mentre
      // quella vera resta ferma in un posto che non stai guardando.
      if (c.workspace !== undefined && c.workspace !== workspaceCorrente()) {
        void azioniDiFinestra()
          .cambia(c.workspace)
          .then(() => window.gestore.workspace.stato())
          .then(aggiornaWorkspace)
          .then(porta)
          .catch((e: unknown) => {
            console.error('[autopilota] non sono riuscito ad andare nel suo workspace:', e)
            porta()
          })
        continue
      }
      porta()
    }
  }), [])

  // Una chat arrivata in un workspace da un altra finestra. Va messa nella
  // memoria di questa: la memoria vince sul disco, e una copia vecchia che non
  // sa dell arrivo cancellerebbe la chat al primo salvataggio.
  useEffect(() => window.gestore.client.suChatArrivata(({ workspace: dove, pane }) => {
    memoriaWorkspace().aggiungi(dove, pane)
  }), [])

  // Una chat nuova chiesta dal telefono. Solo in una cartella che Claude Code
  // conosce già — il controllo lo fa il Core, qui si apre e basta.
  useEffect(() => window.gestore.client.suApertura(({ cartella, modello, sessione }) => {
    // Il nome è l'ultimo pezzo del percorso: dal telefono non si scrive un
    // titolo, e «Documenti\Progetto» dice più di «chat 4».
    const nome = cartella.split(/[\\/]/).filter((p) => p !== '').pop() ?? cartella
    // Con una sessione e' una conversazione che si riprende: nasce con il suo
    // identificatore e Claude Code la riapre com'era, invece di cominciarne una
    // nuova nella stessa cartella - che e' quello che succedeva dal telefono.
    useLayoutStore.getState().addPane(
      cartella,
      nome,
      modello,
      sessione !== undefined && sessione !== '' ? { sessionUuid: sessione } : undefined
    )
  }), [])

  // Un salvataggio rimesso in piedi dal telefono: e' lo stesso gesto del
  // pannello «Salvataggi», e passa per la stessa strada.
  useEffect(() => window.gestore.client.suSalvataggio((nome) => {
    window.gestore.istantanee
      .carica(nome)
      .catch((e: unknown) => console.error('[client] salvataggio non caricato:', e))
  }), [])

  // Chiudere una chat dal telefono: il riquadro sparisce, la conversazione
  // resta su disco e si riprende quando si vuole. E' la ragione per cui questo
  // comando puo' stare su un telefono senza essere pericoloso.
  useEffect(() => window.gestore.client.suChiusura((idChat) => {
    const stato = useLayoutStore.getState()
    const pty = stato.panes[idChat]?.ptyId
    if (pty !== undefined) window.gestore.pty.kill(pty)
    stato.closePane(idChat)
  }), [])

  // Il nome che dai a una chat dal telefono: lo stesso che daresti qui.
  useEffect(() => window.gestore.client.suRinomina(({ chat, nome }) => {
    useLayoutStore.getState().rinominaPane(chat, nome)
  }), [])

  // Quello che scrivi dal telefono arriva alla chat come se lo avessi digitato.
  // Un pezzo di cronologia chiesto dal telefono. Risponde **solo** la finestra
  // che ha quella chat: le altre tacciono, e chi ha chiesto aspetta la prima
  // che parla. Senza questo, dal telefono si vedevano le ultime righe e basta,
  // mentre la conversazione intera era qui, dentro l’xterm del riquadro.
  useEffect(() => window.gestore.client.suRichiestaRighe(({ id, chat, da, quante }) => {
    const riquadro = useLayoutStore.getState().panes[chat]
    if (riquadro?.ptyId === undefined) return
    const finestra = finestraDiPty(riquadro.ptyId, da, quante)
    if (finestra === undefined) return
    window.gestore.client.rispondiRighe(id, finestra)
  }), [])

  // Il seguito di un discorso interrotto da un aggiornamento.
  //
  // Al ritorno le chat che si erano fermate a meta' di un turno vanno rimesse
  // in moto da sole: fermarsi era stata una richiesta nostra, non una loro
  // decisione, e chi interrompe ha il dovere di far ripartire. Si aspetta che
  // il terminale ascolti, perche' in questo istante sta ancora nascendo.
  useEffect(() => window.gestore.client.suRipresaChat(({ sessione, testo }) => {
    scriviQuandoPronta(sessione, testo, ponteReale(aspettaOra, workspaceCorrente))
  }), [])

  useEffect(() => window.gestore.client.suScrittura(({ chat, testo }) => {
    // `chat` è l'identificatore del **riquadro**, non del terminale: scriverci
    // dentro direttamente non faceva niente, in silenzio, ed è il motivo per
    // cui dal telefono si scriveva nel vuoto. Il terminale sta nel riquadro, e
    // solo questa finestra sa quale.
    const riquadro = useLayoutStore.getState().panes[chat]
    if (riquadro?.ptyId === undefined) return
    // Il testo e l'invio **separati**, con una pausa in mezzo.
    //
    // Mandandoli insieme, Claude Code li riceve in un solo blocco e li legge per
    // quello che sembrano: del testo incollato che finisce con un a capo. Un a
    // capo dentro un incollato non e' un invio — e' una riga nuova — quindi il
    // messaggio arrivava nel campo, andava a capo, e restava li' senza partire.
    // E' lo stesso motivo per cui gli appunti passano da `term.paste`.
    // Separandoli, l'invio e' un tasto premuto dopo, come lo premerebbe una
    // persona.
    const idPty = riquadro.ptyId
    // Il testo puo' essere vuoto: succede rispondendo a un elenco di scelte dal
    // telefono, quando l'opzione voluta e' gia' quella evidenziata e non serve
    // nessuna freccia. Resta il solo invio.
    if (testo !== '') window.gestore.pty.write(idPty, testo)
    setTimeout(() => window.gestore.pty.write(idPty, String.fromCharCode(13)), PAUSA_PRIMA_DELL_INVIO_MS)
  }), [])

  useEffect(() => window.gestore.client.suWorkspace((nome) => {
    void azioniDiFinestra()
      .cambia(nome)
      // E si aggiorna anche l'etichetta. Il cambio arriva dal telefono, quindi
      // **ogni** finestra lo esegue: ognuna è mittente del proprio cambio, e
      // l'annuncio che aggiorna l'elenco salta di proposito chi l'ha chiesto.
      // Risultato: le chat cambiavano sotto gli occhi e il workspace scelto
      // restava indicato quello di prima.
      .then(() => window.gestore.workspace.stato())
      .then(aggiornaWorkspace)
      .catch(() => undefined)
  }), [])
  // Premere fuori chiude, per tutte allo stesso modo: chi lo prova su una e non
  // sull'altra non impara la regola, impara che il programma e' imprevedibile.
  useEffect(() => attivaChiusuraFuori(() => setAperto(undefined)), [])

  const [modale, setModale] = useState<'sessioni' | 'istantanee' | 'ripresa' | 'accesso' | 'preparazione' | undefined>(undefined)
  const [preparazione, setPreparazione] = useState<StatoPreparazione | undefined>(undefined)
  const [novita, setNovita] = useState<Novita | undefined>(undefined)
  const [aperto, setAperto] = useState<PannelloAperto>(undefined)
  const [workspace, setWorkspace] = useState<StatoWorkspace>({ nomi: [], attivo: '' })
  /**
   * L'unico modo di dire «questa finestra ora mostra quel workspace».
   *
   * Aggiorna **insieme** lo stato di React (che disegna la fascia) e
   * `workspace-corrente` (che il salvataggio del layout legge in modo sincrono).
   * Tenerli separati è come nasceva il guasto: si aggiornava solo React, il
   * salvataggio partiva col nome di prima, e il layout nuovo finiva scritto
   * sopra le chat del workspace appena lasciato.
   */
  const aggiornaWorkspace = useCallback((s: StatoWorkspace): void => {
    impostaWorkspaceCorrente(s.attivo)
    setWorkspace(s)
  }, [])
  const [autopiloti, setAutopiloti] = useState<Autopilota[]>([])
  const [erroreAutopiloti, setErroreAutopiloti] = useState<string | undefined>(undefined)
  const [alLogin, setAlLogin] = useState<boolean | undefined>(undefined)
  const [accesso, setAccesso] = useState<StatoAccesso>({ autenticato: true })
  const [pronto, setPronto] = useState(false)
  // L'accesso all'avvio: 'caricamento' mostra l'intro con lo spinner (almeno 3s,
  // anche se già loggati), 'gate' la schermata di accesso — obbligatoria, non c'è
  // un «senza account» — e 'dentro' quando si prosegue.
  const [statoAccesso, setStatoAccesso] = useState<'caricamento' | 'gate' | 'dentro'>('caricamento')
  useEffect(() => {
    let vivo = true
    // Si aspettano INSIEME la verifica della sessione e un tempo minimo d'intro:
    // così l'avvio ha sempre il suo respiro, non un lampo di caricamento.
    Promise.all([
      utenteCorrente().catch(() => undefined),
      new Promise<void>((r) => setTimeout(r, 3000))
    ]).then(([u]) => { if (vivo) setStatoAccesso(u !== undefined ? 'dentro' : 'gate') })
    // Entrando dal pannello o dalla schermata si prosegue — ma solo da 'gate', per
    // non tagliare l'intro. Uscendo NON si torna fuori mentre si lavora.
    const stop = suCambioAccesso((u) => {
      if (u !== undefined) setStatoAccesso((s) => (s === 'gate' ? 'dentro' : s))
    })
    return () => { vivo = false; stop() }
  }, [])
  // La serratura, per chi l'ha voluta. `undefined` finche' non si sa: aprire il
  // programma e poi coprirlo con la richiesta sarebbe mostrare per un istante
  // proprio cio' che si voleva chiudere.
  const [chiuso, setChiuso] = useState<boolean | undefined>(undefined)
  useEffect(() => {
    window.gestore.chiavi
      .stato()
      .then((s) => setChiuso(s.allAvvio))
      // Se non si riesce a sapere se c'e' una parola, si apre: una serratura
      // rotta non deve diventare un muro fra l'utente e il suo lavoro.
      .catch(() => setChiuso(false))
  }, [])
  const [attesaVisibile, setAttesaVisibile] = useState(false)
  const [aggiornamento, setAggiornamento] = useState<StatoAggiornamento>({ fase: 'fermo' })
  // Se gli aggiornamenti si scaricano da soli: quando sì, il tasto «Scarica»
  // non serve — lo scaricamento è già partito — e sparisce. Si legge dalle
  // preferenze e si tiene allineato ai cambi, come i colori.
  const [scaricaAuto, setScaricaAuto] = useState(true)
  useEffect(() => {
    const leggi = (p: Preferenze): void => setScaricaAuto(p.scaricaAggiornamentiAutomatico)
    window.gestore.preferenze.leggi().then(leggi).catch(() => undefined)
    return window.gestore.preferenze.suCambio(leggi)
  }, [])

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

  // L'elenco arriva **nuovo** a ogni giro di polling (5s): senza confronto,
  // `setAutopiloti` cambierebbe l'identità dello stato anche quando nulla è
  // cambiato, e siccome `autopiloti` scende in mezza interfaccia (console, banda,
  // mosaico, modale) ridisegnerebbe tutto ogni 5 secondi a vuoto. Si tiene la
  // firma dell'ultimo elenco e si aggiorna solo se è diversa — come già fa il
  // battito con `setPensano`. Stessa cosa per il conteggio nell'icona in basso.
  const firmaAutopiloti = useRef('')
  const contoAlLavoro = useRef(-1)
  const ricaricaAutopiloti = useCallback((): void => {
    window.gestore.autopilota
      .elenca()
      .then((a) => {
        setErroreAutopiloti(undefined)
        const firma = JSON.stringify(a)
        if (firma !== firmaAutopiloti.current) {
          firmaAutopiloti.current = firma
          setAutopiloti(a)
        }
        // Chi ha appena chiuso la finestra si chiede una cosa sola: sta ancora
        // lavorando? La risposta sta nel testo dell'icona in basso a destra —
        // che si aggiorna solo quando il numero cambia davvero.
        const conto = a.filter((x) => x.stato === 'lavoro' || x.stato === 'attesa').length
        if (conto !== contoAlLavoro.current) {
          contoAlLavoro.current = conto
          window.gestore.sistema.autopilotiAlLavoro(conto)
        }
      })
      // Il messaggio del client nomina il servizio e la porta: è la differenza
      // fra «non ci sono autopiloti» e «il servizio non risponde». Anche qui si
      // svuota una volta sola, non a ogni giro finché il servizio è giù.
      .catch((e: unknown) => {
        setErroreAutopiloti(String(e))
        if (firmaAutopiloti.current !== '__errore__') {
          firmaAutopiloti.current = '__errore__'
          setAutopiloti([])
          contoAlLavoro.current = 0
          window.gestore.sistema.autopilotiAlLavoro(0)
        }
      })
  }, [])

  // Da dove ti stanno chiamando. La mappa si rilegge insieme agli autopiloti:
  // una chat spostata di workspace cambia l'indirizzo dell'avviso, e un avviso
  // che indica il posto sbagliato e' peggio di nessun avviso.
  const [doveSta, setDoveSta] = useState<Record<string, string>>({})
  const firmaDoveSta = useRef('')
  useEffect(() => {
    const leggi = (): void => {
      // Come per l'elenco: la mappa torna nuova ogni 5s, si aggiorna lo stato
      // solo quando cambia davvero, o si ridisegnerebbe a vuoto.
      window.gestore.workspace.dove().then((d) => {
        const firma = JSON.stringify(d)
        if (firma !== firmaDoveSta.current) { firmaDoveSta.current = firma; setDoveSta(d) }
      }).catch(() => undefined)
    }
    leggi()
    const h = setInterval(leggi, RICARICA_AUTOPILOTI_MS)
    return () => clearInterval(h)
  }, [])

  const chiamate = chiChiede(autopiloti, doveSta)
  const workspaceChiamano = workspaceCheChiamano(chiamate)

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

  // La preferenza puo cambiare mentre il programma gira: si legge quando serve.
  // Se salvare da soli un'istantanea alla chiusura: l'interruttore c'era ma non
  // lo leggeva nessuno, e il salvataggio automatico partiva comunque. Ora lo
  // rispetta. Predefinito acceso, come l'impostazione.
  const salvaAllaChiusura = useRef(true)
  useEffect(() => {
    const prendi = (p: Preferenze): void => {
      // La preferenza «iberna lasciando» vive in un posto solo (azioni-finestra),
      // così ogni istanza delle azioni la rispetta senza doverla passare in giro.
      impostaIbernaLasciando(p.ibernaCambiandoWorkspace)
      // Stessa strada, stesso motivo: il terminale sta in fondo all'albero e la
      // preferenza si legge qui. Finche' non passava di qui, l'interruttore
      // «mostra l'avanzamento mentre una chat lunga si apre» si salvava e non
      // lo leggeva nessuno.
      impostaMostraAttesa(p.mostraAttesaChat)
      salvaAllaChiusura.current = p.salvaAllaChiusura
    }
    window.gestore.preferenze.leggi().then(prendi).catch(() => undefined)
    return window.gestore.preferenze.suCambio(prendi)
  }, [])
  const azioniWorkspace = useRef<AzioniWorkspace | undefined>(undefined)
  // Le azioni nascono una volta sola. La preferenza «iberna lasciando» non si
  // passa più qui: la legge il predefinito di `azioniDiFinestra` dal valore
  // globale, aggiornato sopra a ogni cambio — così vale per tutte le istanze, non
  // solo per questa.
  azioniWorkspace.current ??= azioniDiFinestra()

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
      .then(aggiornaWorkspace)
      .catch(() => aggiornaWorkspace({ nomi: [], attivo: '' }))
    // Il workspace attivo è dell'applicazione, non della finestra: quando
    // un'altra lo cambia, questa deve **seguirla** e non limitarsi a cambiare
    // etichetta. Finché non lo faceva, i suoi riquadri restavano a schermo
    // mentre per l'archivio l'attivo era già un altro: il salvataggio successivo
    // li scriveva sotto il workspace nuovo, sopra le chat che ci vivevano. È il
    // modo in cui, con due finestre aperte, i layout finivano per svuotarsi
    // tutti — il sintomo del difetto 0-quater.
    return window.gestore.workspace.onCambiato((s) => {
      aggiornaWorkspace({ nomi: s.nomi, attivo: s.attivo })
      void azioniWorkspace.current
        ?.segui(s.precedente, s.attivo)
        .catch((err: unknown) => console.error('[workspace] cambio non seguito:', err))
    })
  }, [])

  // Un ripristino di istantanea riporta davanti un workspace: la finestra vi si
  // riallinea **subito** e in modo sincrono — `workspace-corrente` prima ancora
  // dello stato React — perché il salvataggio del layout è sincrono e il layout
  // ripristinato arriva un attimo dopo. Senza, la finestra risalverebbe quel
  // layout sotto il workspace di prima e l'invariante «una chat, un workspace»
  // trascinerebbe via le chat appena rimesse a posto (il ripristino disfatto
  // entro un tick). Niente `segui`/`trasloca`: l'archivio è già cambiato nel
  // Core, traslocare risalverebbe il layout sotto il nome vecchio.
  useEffect(() => window.gestore.workspace.onRipristinato((s) => {
    aggiornaWorkspace({ nomi: s.nomi, attivo: s.attivo })
  }), [])

  // Un workspace rinominato: solo un'etichetta cambia, le chat restano dov'erano.
  // Qui si sposta la chiave della memoria — perché i riquadri vivi del workspace
  // rinominato non restino sotto un nome che nessuno chiede più — e si rilegge lo
  // stato, che porta i nomi nuovi e l'attivo aggiornato.
  useEffect(() => {
    return window.gestore.workspace.onRinominato(({ vecchio, nuovo, attivo }) => {
      memoriaWorkspace().rinomina(vecchio, nuovo)
      // Anche `workspace-corrente` deve seguire il nome nuovo: il salvataggio
      // del layout lo legge, e con il nome vecchio il Core non riconoscerebbe
      // più il workspace dichiarato.
      setWorkspace((s) => {
        const dopo = {
          nomi: s.nomi.map((n) => (n === vecchio ? nuovo : n)),
          attivo: s.attivo === vecchio ? attivo : s.attivo
        }
        impostaWorkspaceCorrente(dopo.attivo)
        return dopo
      })
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
  // L'elenco dei salvataggi, tenuto fresco: serve a non salvare due volte la
  // stessa cosa. Si rilegge quando si apre la finestra dei salvataggi e
  // all'avvio, che sono i due momenti in cui puo' essere cambiato.
  const istantaneeNote = useRef<Istantanea[]>([])
  useEffect(() => {
    window.gestore.istantanee
      .elenca()
      .then((elenco) => { istantaneeNote.current = elenco })
      .catch(() => { istantaneeNote.current = [] })
  }, [modale])

  useEffect(() => {
    const allaChiusura = (): void => {
      // L'interruttore «salva alla chiusura» ora conta davvero: chi lo spegne non
      // vuole il salvataggio automatico «Ultima chiusura», e va rispettato.
      if (!salvaAllaChiusura.current) return
      const layout = useLayoutStore.getState().esporta()
      if (layout.panes.length === 0) return
      // Se queste chat, in questa disposizione, sono gia' salvate sotto un nome
      // tuo, non se ne fa una copia: due voci per la stessa cosa sono un
      // programma che non presta attenzione.
      const dove = giaSalvatoCome(layout, istantaneeNote.current)
      if (dove !== undefined && dove !== NOME_AUTOMATICO) {
        console.log(`[istantanee] gia' salvato come «${dove}»: non ne creo un altro`)
        return
      }
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

  // Prima di qualunque cosa: se c'e' una parola d'ordine, non si deve
  // vedere nemmeno per un istante quello che protegge.
  if (chiuso === undefined) return <div className="serratura" />
  if (chiuso) return <Serratura onAperto={() => setChiuso(false)} />

  // L'accesso all'avvio: prima l'intro con lo spinner (almeno 3s), poi — se non
  // c'è una sessione — la schermata di accesso, obbligatoria.
  if (statoAccesso === 'caricamento') return <SchermataAccesso caricamento onDentro={() => setStatoAccesso('dentro')} />
  if (statoAccesso === 'gate') return <SchermataAccesso onDentro={() => setStatoAccesso('dentro')} />

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
        onStatoWorkspace={aggiornaWorkspace}
        workspaceCheChiamano={workspaceChiamano}
        onApriNovita={() => {
          // Le novità di *questa* versione, richieste apposta: la finestra che
          // compare da sé all'aggiornamento si vede una volta, e chi la chiude
          // per fretta non deve restare senza.
          window.gestore.sistema
            .versione()
            .then((v) => setNovita({ versione: v, righe: novitaDi(v)?.righe ?? [] }))
            .catch(() => undefined)
        }}
            aggiornamento={aggiornamento}
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
      {/* «Sto cercando» e «è andata male» prima non si vedevano: cadevano
          fuori da questa condizione insieme a «non c’è niente», e chi aveva
          appena premuto il tasto — qui o dal telefono — restava a guardare
          uno schermo che non diceva nulla. */}
      {aggiornamento.fase === 'cerco' ? (
        <div className="avviso avviso--aggiornamento">
          <span className="led led--attesa" />
          <span>
            Sto guardando se c’è una versione nuova…
            {aggiornamento.daTelefono === true ? ' (chiesto dal telefono)' : ''}
          </span>
        </div>
      ) : null}
      {aggiornamento.fase === 'errore' ? (
        <div className="avviso avviso--aggiornamento">
          <span className="led led--fermo" />
          <span>L’aggiornamento non è riuscito: {aggiornamento.errore ?? "motivo sconosciuto"}</span>
          <span style={{ flex: 1 }} />
          <button className="tasto" onClick={() => void window.gestore.aggiornamenti.cerca()}>
            Riprova
          </button>
        </div>
      ) : null}
      {/* L'installazione e' l'unica fase che non finisce: dopo di lei il
          programma si chiude. Va detta, o l'ultima cosa che si vede prima che
          tutto sparisca e' un tasto premuto e nient'altro. */}
      {aggiornamento.fase === 'installo' ? (
        <div className="avviso avviso--aggiornamento">
          <span className="led led--lavoro" />
          <span>
            Sto installando la {aggiornamento.versione ?? 'versione nuova'}. Il programma si chiude e
            riparte da solo: non serve fare niente.
          </span>
        </div>
      ) : null}

      {aggiornamento.fase === 'disponibile' || aggiornamento.fase === 'scarico' || aggiornamento.fase === 'pronto' ? (
        <div className="avviso avviso--aggiornamento">
          <span className="led led--lavoro" />
          {/* Chi ha chiesto: da un telefono si preme «Scarica» e poi si torna
              alla scrivania mezz’ora dopo. Senza dirlo, sullo schermo compare
              un aggiornamento che nessuno lì ha chiesto. */}
          {aggiornamento.daTelefono === true ? (
            <span className="serigrafia" title="La richiesta è arrivata da un dispositivo accoppiato">dal telefono</span>
          ) : null}
          {aggiornamento.fase === 'disponibile' ? (
            <>
              <span>
                C’è una versione nuova ({aggiornamento.versione}).
                {scaricaAuto ? ' La sto scaricando…' : ''}
              </span>
              {!scaricaAuto ? (
                <button className="tasto" onClick={() => void window.gestore.aggiornamenti.scarica()}>
                  Scarica
                </button>
              ) : null}
            </>
          ) : aggiornamento.fase === 'scarico' ? (
            <>
              <span>Scarico la versione {aggiornamento.versione}… {aggiornamento.percento ?? 0}%</span>
              {/* La barra, non solo il numero: un avanzamento si legge con
                  la coda dell’occhio, una percentuale va letta. */}
              <span className="barra-agg">
                <span className="barra-agg__pieno" style={{ width: `${aggiornamento.percento ?? 0}%` }} />
              </span>
            </>
          ) : (
            <>
              <span>
                La versione {aggiornamento.versione} è pronta: <b>si installa da sola</b> la prossima
                volta che chiudi SierraDeck. Se la vuoi adesso, il programma si chiude e riparte —
                le chat aperte tornano dal salvataggio automatico.
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
            onStato={aggiornaWorkspace}
            onChiudi={() => setAperto(undefined)}
          />
        ) : null}
        {aperto === 'impostazioni' ? (
          <PannelloImpostazioni onChiudi={() => setAperto(undefined)} />
        ) : null}
        {aperto === 'file' ? (
          // I server sono **del progetto**: la cartella della chat che hai
          // davanti decide quali vedi. Un elenco unico di venti connessioni
          // rimetterebbe addosso il lavoro che questo pannello toglie.
          <PannelloTrasferimenti cwd={cartellaDavanti() || undefined} onChiudi={() => setAperto(undefined)} />
        ) : null}
        {aperto === 'negozio' ? (
          // Skill e MCP sono legati alla cartella della chat davanti: le mostri
          // dove valgono. I plugin valgono per tutte, e non dipendono da questa.
          <PannelloNegozio cwd={cartellaDavanti() || undefined} onChiudi={() => setAperto(undefined)} />
        ) : null}
        {aperto === 'quaderno' ? (
          // La cartella del riquadro che hai davanti: il quaderno racconta un
          // progetto, e il progetto e' quello in cui stai lavorando adesso.
          <PannelloQuaderno
            cwd={cartellaDavanti()}
            // Tutte le chat aperte, ognuna con il suo nome: due chat nella
            // stessa cartella sono due voci, perche' e' cosi' che le riconosci.
            cartelle={Object.values(riquadriAperti).map((p) => ({
              cwd: p.cwd,
              titolo: p.title !== undefined && p.title !== '' ? p.title : p.cwd
            }))}
            onChiudi={() => setAperto(undefined)}
          />
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
            workspaceAttivo={workspace.attivo}
          />
        ) : null}

        <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>
          {root ? (
            <Mosaic
              node={root}
              autopiloti={autopiloti}
              onRicaricaAutopiloti={ricaricaAutopiloti}
              pensano={pensano}
            />
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
