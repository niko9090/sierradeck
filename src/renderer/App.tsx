import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ascoltaSegnali, faseDiSessione, lavoraConSegnali, partitaConSegnali, prontaConSegnali } from './segnali-vivi'
import { indicatoreChat } from '@shared/segnali-chat'
import { caricaSenzaRiquadriMorti } from '@shared/riquadri-morti'
import { useLayoutStore } from './state/layout'
import { useSessionStore } from './state/sessions'
import { creaPersistenza, trascinamentoDivisori } from './persistenza-layout'
import { azioniDiFinestra, impostaIbernaLasciando } from './azioni-finestra'
import type { AzioniWorkspace } from './workspace-azioni'
import { ledDi } from '@shared/autopilota-vista'
import { giaSalvatoCome } from '@shared/doppioni'
import type { Istantanea } from '@shared/istantanea'
import { chiChiede, workspaceCheChiamano } from '@shared/dove-chiedono'
import { attivaChiusuraFuori, attivaTrascinamento } from './trascina-finestre'
import { aspettaDalloSchermo, chatAspetta, consegnaPartita, contaMandati, creaUltimeRighe, lavoraSulloSchermo, prontoPerInvio, sceltaSulloSchermo, testoNelCampo, testoPerso, ultimaRigaDalloSchermo } from './ultime-righe'
import { creaBattito, stessiAttivi } from './battito'
import { eseguiConsegna, ponteReale, scriviMessaggio, scriviQuandoPronta, type InvioMancato, type Consegna } from './consegne-autopilota'
import { comePortare, rigaInAttesa } from './consegna-visibile'
import { memoriaWorkspace, chatDietro, terminaliDi } from './memoria-workspace'
import { spostaInWorkspace } from './spostamento'
import { leggiAzioneFinestra } from '@shared/azioni-telefono'
import { impostaWorkspaceCorrente, workspaceCorrente } from './workspace-corrente'
import { cambiaSchermo } from './cambio-schermo'
import { leggiCausa } from '@shared/cambio-schermo'
import { impostaMostraAttesa } from './preferenze-vive'
import { leggiConsegne } from '../main/autopilota-consegne'
import type { Autopilota } from '@shared/autopilota'
import type { StatoWorkspace } from '../main/ipc'
import { Mosaic } from './components/Mosaic'
import { ModaleSessioni } from './components/ModaleSessioni'
import { ModaleGestioneChat, type SchedaGestione } from './components/ModaleGestioneChat'
import { OspiteAzioniChat } from './components/AzioniChat'
import { ModaleDoveVive } from './components/OspiteChat'
import { VistaProgetti } from './components/VistaProgetti'
import { NOME_AUTOMATICO } from '@shared/istantanea'
import { Console, type PannelloAperto } from './components/Console'
import { PannelloWorkspace } from './components/PannelloWorkspace'
import { PannelloAutopiloti } from './components/PannelloAutopiloti'
import { PannelloQuaderno } from './components/PannelloQuaderno'
import { PannelloImpostazioni } from './components/PannelloImpostazioni'
import { PannelloNegozio } from './components/PannelloNegozio'
import { tavolozza, type Preferenze } from '@shared/preferenze'
import { avvisiConsumi, type AvvisoConsumi } from '@shared/polso-chat'
import { ModaleAccesso } from './components/ModaleAccesso'
import { ModalePreparazione } from './components/ModalePreparazione'
import { ModaleTestimone, type AvvisoProgetto } from './components/ModaleTestimone'
import { ModaleNote } from './components/ModaleNote'
import { novitaConLeUltime } from '@shared/novita'
import { noteDaNovita, type NotaResa, type NoteAggiornamento } from '@shared/note-aggiornamento'
import type { StatoPreparazione } from '../main/preparazione'
import { BandaAvvisi } from './components/BandaAvvisi'
import { BandaRiassetto } from './components/BandaRiassetto'
import { componiAvvisi, ricordaChiusi } from './avvisi'
import type { StatoAccesso } from '../main/accesso'
import { decidiColonnaDomande, quanteAspettano, type Conversazione } from '@shared/domande-conversazioni'
import { SchermataAvvio } from './components/SchermataAvvio'
import { SchermataAccesso } from './components/SchermataAccesso'
import { utenteCorrente, suCambioAccesso } from './accesso-supabase'
import { Serratura } from './components/Serratura'
import type { StatoAggiornamento } from '../main/aggiornamenti'
import { righeDiPty, righeDiPtyRecenti, segnaDatiPty, finestraDiPty } from './schermo-terminale'
import { ogni } from './state/sondaggio'
import { ETICHETTA_LAVORO_TIPO, soloTransizioni } from './progresso-sync'
import { Fumetti, Fumetto, FumettoLavoroDrive, useChiusuraAutomatica } from './components/Fumetti'
import { decidiFumettiDrive, FUMETTO_ARRIVO_MS, FUMETTO_ESITO_OK_MS } from './fumetti-sync'
import { PannelloChat } from './components/PannelloChat'
import { PannelloSalute } from './components/PannelloSalute'
import { PannelloDomande } from './components/PannelloDomande'
import type { StatoLavoro } from '../main/cassaforte/lavoro-in-corso'
import { useAvviaNomiPc } from './state/nomi-pc'
import { BarraAffiancate, BarraLinguette, CorpoPanoramica, PANORAMICA, type SchedaVista } from './components/WorkspacePanoramica'
import { ChatAutopilota } from './components/ChatAutopilota'
import { gruppoStabile, numeraUguali, righeDalVivo, ultimaAzioneDalVivo, type StatoScheda } from '@shared/panoramica'
import { ruoloDaContenuto } from '@shared/adozione'
import { RUOLI, RUOLI_ORDINE } from '@shared/ruoli-agenti'
import { specialistiDi } from '@shared/specialisti'
import { autopilotaDelWorkspace, cambiaVistaElenco, chatDavantiStabile, ruoloDalTitolo, vociInOrdine, type VoceElenco } from '@shared/vista-elenco'
import { listPaneIds } from '@shared/layout-tree'
import { chatDaSistemare } from '@shared/chat-governate'
import type { StatoMigrazione } from '@shared/migrazione-elenco'

/**
 * Quante righe dello schermo vanno al telefono.
 *
 * Piu' delle quattordici che si tenevano prima, e non e' un capriccio: quelle
 * erano righe **accumulate** dal flusso, quindi in buona parte ridisegni della
 * stessa cosa. Queste sono righe di schermo vero, ognuna diversa dall'altra, e
 * ci sta dentro il riquadro di Claude Code per intero invece che tagliato a
 * meta'.
 */
/** Quanto deve durare «aspetta» prima di annunciarlo: un'oscillazione non e' una notizia. */
const ASPETTA_STABILE_MS = 4000
const RIGHE_PER_IL_TELEFONO = 24
/** Ogni quanto si guarda chi sta lavorando (0.85.2: erano 400 ms). */
const PASSO_PENSANO_MS = 1000
/**
 * Le chat al Core (0.85.2): si compongono ogni due secondi ma partono solo se
 * qualcosa è cambiato, e comunque almeno ogni tanto, perché il Core misura da
 * questi annunci il battito e lo stato che manda all'autopilota.
 */
const ANNUNCIO_PASSO_MS = 2000
const ANNUNCIO_COMUNQUE_MS = 10_000

/**
 * La pausa fra un pezzo e l'altro dei tasti di una scelta (frecce, testo
 * libero, invio), per una risposta venuta da fuori.
 *
 * Serve a far arrivare i pezzi in blocchi distinti: e' la distanza che
 * distingue «ho incollato del testo che contiene un a capo» da «ho scritto e
 * poi ho premuto invio». Dalla 0.86.2 i messaggi scritti (`client:scrivi`) non
 * la usano piu': passano da `scriviMessaggio`, che preme Invio dopo l'eco.
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
 * Il riquadro a cui il telefono scrive o di cui chiede le righe (0.82.0): a
 * schermo, oppure in un workspace tenuto vivo dietro. Da quando la finestra
 * annuncia anche quelle chat, il telefono le vede e ci scrive: cercando solo
 * fra i riquadri a schermo, il testo finiva nel vuoto.
 */
function riquadroDelTelefono(chat: string): { ptyId?: string } | undefined {
  return useLayoutStore.getState().panes[chat] ??
    chatDietro(memoriaWorkspace().vivi(), workspaceCorrente()).find((d) => d.pane.id === chat)?.pane
}

/**
 * Collega la persistenza del layout — la cui logica sta in `persistenza-layout`,
 * fuori da React — al ciclo di vita del componente.
 */
function usaPersistenzaLayout(): void {
  useEffect(() => {
    const persistenza = creaPersistenza({
      // Senza i riquadri morti (0.86.2): le chat che l'autopilota ha gia'
      // chiuso, con la copia di lavoro tolta, non si rimontano a ogni avvio.
      carica: () => caricaSenzaRiquadriMorti({
        carica: () => window.gestore.layout.carica(),
        daTogliere: (panes) => window.gestore.layout.riquadriMorti(panes),
        congeda: (sessioni) => useLayoutStore.getState().congeda(sessioni)
      }),
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
      sottoscrivi: (cb) => useLayoutStore.subscribe(cb),
      trascinamento: trascinamentoDivisori
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

ascoltaSegnali()

export function App(): React.JSX.Element {
  // I nomi scelti dei PC, freschi dai battiti (0.52.4).
  useAvviaNomiPc()
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
  // Da quando ogni chat aspetta, per dirlo solo quando e' stabile: il giudizio
  // istantaneo oscilla durante un comando lungo (700 ms di silenzio bastano a
  // dire «aspetta»), e ogni oscillazione era una notifica «X aspetta te» in piu'
  // sul telefono, per lo stesso fatto.
  const aspettaDa = useRef(new Map<string, number>())
  /**
   * La prontezza per **premere invio** su un compito appena incollato (0.37.5):
   * il campo disegnato e il flusso quieto, senza i quattro secondi di
   * «aspetta» stabile degli annunci — sommati ai ridisegni di un incolla
   * lungo facevano scadere l'attesa, e l'invio non partiva.
   */
  const prontaPerConsegna = useCallback(
    // I segnali di Claude Code prima (0.45.0): «aspetta» vale come pronta.
    (ptyId: string): boolean => prontaConSegnali(ptyId, () => prontoPerInvio(righe.current.attivitaDi(ptyId), righeDiPty(ptyId, RIGHE_PER_IL_TELEFONO)?.pulite, Date.now())),
    []
  )
  /**
   * Una consegna che non parte nemmeno al secondo modo (0.38.1): **non** e' una
   * domanda per Nicholas. Va nel diario dell'autopilota come guasto del
   * programma (lo vede il supervisore) e, facoltativa, nella sua scheda.
   */
  // Definita piu' sotto: la consegna la chiama per tornare nel suo workspace.
  const aggiornaWorkspaceRef = useRef<(s: StatoWorkspace) => void>(() => undefined)
  const extraConsegna = useMemo(() => ({
    // Partita: il segnale «turno cominciato» di Claude Code (0.45.0); lo schermo come riserva.
    // 0.86.2: con il momento della scrittura conta solo un turno cominciato dopo.
    partita: (ptyId: string, scritto?: string, prima?: number, scrittaIl?: number) => partitaConSegnali(ptyId, () => consegnaPartita(righeDiPty(ptyId, RIGHE_PER_IL_TELEFONO)?.pulite, scritto, prima), Date.now(), scrittaIl),
    perso: (ptyId: string, scritto?: string, prima?: number) => testoPerso(righeDiPty(ptyId, RIGHE_PER_IL_TELEFONO)?.pulite, scritto ?? '', prima),
    // 0.75.4: l'Invio solo dopo l'eco del testo nel campo, a terminale quieto.
    nelCampo: (ptyId: string, scritto: string) => testoNelCampo(righeDiPty(ptyId, RIGHE_PER_IL_TELEFONO)?.pulite, scritto),
    quieto: (ptyId: string, ms: number) => Date.now() - righe.current.attivitaDi(ptyId).ultimoDato >= ms,
    // 0.56.4: il testo già fra i messaggi mandati (una conversazione ripresa
    // lo mostra), e da quanto il terminale parla (una chat che riprende).
    mandati: (ptyId: string, scritto: string) => contaMandati(righeDiPty(ptyId, RIGHE_PER_IL_TELEFONO)?.pulite, scritto),
    natoDa: (ptyId: string) => { const p = righe.current.attivitaDi(ptyId).primoDato; return p === undefined ? undefined : Date.now() - p },
    // 0.57.1: un turno in corso non si scrive sopra.
    lavora: (ptyId: string) => lavoraConSegnali(ptyId, () => lavoraSulloSchermo(righeDiPty(ptyId, RIGHE_PER_IL_TELEFONO)?.pulite)),
    // Ogni passo nel registro su file (0.38.2): dopo un guasto si legge li'.
    registra: (passo: string) => { void window.gestore.log.info(`[consegna] ${passo}`).catch(() => undefined) },
    sceltaAperta: (ptyId: string) => sceltaSulloSchermo(righeDiPty(ptyId, RIGHE_PER_IL_TELEFONO)?.pulite),
    sveglia: (paneId: string) => { const p = useLayoutStore.getState().panes[paneId]; if (p?.ibernata === true) useLayoutStore.getState().sveglia(paneId) },
    // La chat di un autopilota diventata remota (0.52.5): torna qui, e il cancello decide.
    riportaQui: (paneId: string) => { const p = useLayoutStore.getState().panes[paneId]; if (p?.remoto !== undefined && p.autopilota !== undefined) useLayoutStore.getState().rendiLocale(paneId) },
    // In sottofondo solo se Nicholas l'ha chiesto (0.72.0): il Ponte lo chiama solo allora.
    passaAlSottofondo: (c: Consegna) => { void window.gestore.autopilota.inSottofondo(c).catch(() => undefined) },
    // 0.72.0: la chat governata si vede sempre. Il riquadro è sparito: si torna nel suo workspace.
    tornaNelSuoWorkspace: (c: { workspace?: string }) => {
      if (c.workspace === undefined || c.workspace === workspaceCorrente()) return
      // 0.80.0: un autopilota non cambia lo schermo; il rifiuto va nel registro.
      void cambiaSchermo(c.workspace, 'consegna', 'il riquadro della sua chat non è più davanti').catch(() => undefined)
    },
    segnala: (s: InvioMancato) => {
      if (s.autopilotaId === '') return
      // 0.76.0: una chat ferma su una sua domanda non è un guasto, e la banda con
      // «Invio» lì sceglierebbe la prima opzione al posto di Nicholas.
      if (s.motivo.startsWith('domanda della chat')) {
        void window.gestore.autopilota.nota(s.autopilotaId, `la chat «${s.titolo || s.chatId}» ha fatto una domanda: il compito parte appena qualcuno risponde (nelle Domande).`).catch(() => undefined)
        return
      }
      void window.gestore.autopilota.nota(s.autopilotaId, `guasto del programma: il compito è nella chat «${s.titolo || s.chatId}» ma non è partito (${s.motivo}).`).catch(() => undefined)
    }
  }), [])
  const aspettaOra = useCallback(
    (ptyId: string): boolean => {
      const ora = Date.now()
      const adesso = chatAspetta(
        righe.current.attivitaDi(ptyId),
        righeDiPtyRecenti(ptyId, RIGHE_PER_IL_TELEFONO, ora)?.pulite,
        ora
      )
      if (!adesso) { aspettaDa.current.delete(ptyId); return false }
      let da = aspettaDa.current.get(ptyId)
      if (da === undefined) { da = ora; aspettaDa.current.set(ptyId, ora) }
      return ora - da >= ASPETTA_STABILE_MS
    },
    []
  )
  // Quali terminali si stanno muovendo adesso. Si ricalcola a intervalli e non
  // a ogni pezzo di output: mentre una chat scrive arrivano decine di eventi al
  // secondo, e ridisegnare il mosaico a ognuno costerebbe piu' del terminale.
  const battito = useRef(creaBattito())
  const [pensano, setPensano] = useState<ReadonlySet<string>>(new Set())
  useEffect(() => {
    const h = setInterval(() => {
      // 0.76.0: una sola fonte, i segnali degli hook di Claude Code (come la
      // pagina e l'app); il flusso del terminale solo quando mancano.
      const ora = Date.now()
      const dalFlusso = battito.current.attivi(ora)
      const vivi = new Set<string>()
      for (const p of Object.values(useLayoutStore.getState().panes)) {
        if (p.ptyId === undefined) continue
        // 0.85.2: lo schermo si rilegge solo se dal terminale è arrivato qualcosa.
        const schermo = righeDiPtyRecenti(p.ptyId, RIGHE_PER_IL_TELEFONO)?.pulite
        const campoPronto = aspettaDalloSchermo(schermo) === true && !lavoraSulloSchermo(schermo)
        const f = faseDiSessione(p.sessionUuid)
        const stato = indicatoreChat({ ...(f !== undefined ? { fase: { fase: f.fase, dal: f.dal } } : {}), campoPronto, attivoDalFlusso: dalFlusso.has(p.ptyId), adesso: ora })
        if (stato === 'lavora') vivi.add(p.ptyId)
      }
      setPensano((prima) => (stessiAttivi(prima, vivi) ? prima : vivi))
      // Ogni secondo (0.85.2: erano 400 ms). Il segno «lavora» viene dagli hook
      // di Claude Code e dal flusso, che ha già un secondo e mezzo di quiete
      // prima di dire «fermo»: più spesso non cambia niente di visibile.
    }, PASSO_PENSANO_MS)
    return () => clearInterval(h)
  }, [])
  useEffect(() => {
    // Direttamente dal canale, non dal bus: qui non interessa **quale**
    // riquadro riceve, ma cosa scrivono tutti — e il bus è fatto apposta per
    // consegnare a uno solo.
    return window.gestore.pty.onEvent((msg) => {
      if (msg.kind === 'data') {
        righe.current.aggiorna(msg.id, msg.data)
        segnaDatiPty(msg.id)
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
    // 0.82.0: anche quelli dei workspace tenuti vivi, che si annunciano ancora.
    const vivi = new Set([
      ...Object.values(riquadriAperti)
        .map((p) => p.ptyId)
        .filter((x): x is string => x !== undefined),
      ...memoriaWorkspace().vivi().flatMap((w) => terminaliDi(w.layout))
    ])
    righe.current.pota(vivi)
  }, [riquadriAperti])

  /** L'ultimo annuncio partito e quando (0.85.2): uno uguale non riparte prima di `ANNUNCIO_COMUNQUE_MS`. */
  const ultimoAnnuncio = useRef<{ firma: string; il: number }>({ firma: '', il: 0 })
  useEffect(() => {
    // I riquadri sono cambiati: il prossimo annuncio parte comunque.
    ultimoAnnuncio.current = { firma: '', il: 0 }
    const manda = (): void => {
      const chat = (
        // Un riquadro remoto guarda una chat di un altro PC: non e' una chat
        // di qui, e annunciarla farebbe credere al telefono e al battito che
        // questo PC ce l'abbia aperta.
        // 0.82.0: anche le chat vive dei workspace tenuti in memoria, con il loro
        // workspace: girano, e pagina e app le davano per «chiusa».
        [
          ...Object.values(riquadriAperti).filter((p) => p.remoto === undefined).map((p) => ({ p, workspace: workspaceCorrente() })),
          // Un terminale finito mentre il suo workspace stava dietro non è più una chat accesa.
          ...chatDietro(memoriaWorkspace().vivi(), workspaceCorrente())
            .filter((d) => righe.current.attivitaDi(d.pane.ptyId)?.morto !== true)
            .map((d) => ({ p: d.pane, workspace: d.workspace, dietro: true }))
        ].map(({ p, workspace, ...resto }) => ({
          id: p.id,
          ...('dietro' in resto ? { dietro: true } : {}),
          titolo: p.title !== undefined && p.title !== '' ? p.title : p.cwd,
          cwd: p.cwd,
          // Quale conversazione: il Core la usa per sapere a chi consegnare le
          // istruzioni di un autopilota, e il telefono per guardarci dentro.
          sessione: p.sessionUuid,
          // Il workspace della chat (0.49.0): per il PIN dei workspace.
          workspace,
          // Se ha finito di scrivere e sta aspettando te. È lo stesso
          // giudizio che usa l’autopilota per sapere quando può parlare —
          // il prompt visto, e poi un po’ di silenzio — e da un telefono è
          // *la* notizia: «ha finito, tocca a te».
          aspetta: p.ptyId === undefined ? false : aspettaOra(p.ptyId),
          // 0.76.0: una scelta aperta sullo schermo (domanda, permesso): il main
          // non la scambia per un campo pronto e la chat resta «chiede».
          ...(p.ptyId !== undefined && sceltaSulloSchermo(righeDiPtyRecenti(p.ptyId, RIGHE_PER_IL_TELEFONO)?.pulite) ? { sceltaAperta: true } : {}),
          // Chi è governata da un autopilota non deve avvisare per conto
          // suo: l’autopilota le parla da sé, e due notifiche per lo stesso
          // fatto sono una di troppo.
          governata: p.autopilota !== undefined,
          // Chi la governa, per il battito al servizio: e' cosi' che il
          // guardiano del silenzio sa che un turno lungo e' vivo.
          ...(p.autopilota !== undefined ? { autopilota: p.autopilota } : {}),
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
                const schermo = righeDiPtyRecenti(p.ptyId, RIGHE_PER_IL_TELEFONO)
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
      // Solo se è cambiato qualcosa, o è passato un po' (0.85.2): il Core
      // ricostruisce lo stato di tutte le chat a ogni annuncio.
      const ora = Date.now()
      const firma = JSON.stringify(chat)
      if (firma === ultimoAnnuncio.current.firma && ora - ultimoAnnuncio.current.il < ANNUNCIO_COMUNQUE_MS) return
      ultimoAnnuncio.current = { firma, il: ora }
      window.gestore.client.annunciaChat(chat)
    }
    manda()
    // Le righe cambiano di continuo mentre le chat lavorano: si rimandano a
    // intervalli invece che a ogni carattere, che sarebbe un messaggio ogni
    // pochi millisecondi per una cosa che si guarda ogni due secondi.
    const h = setInterval(manda, ANNUNCIO_PASSO_MS)
    return () => clearInterval(h)
  }, [riquadriAperti])

  // Le istruzioni dell'autopilota, portate dentro le chat vere.
  //
  // È il modo in cui l'autopilota lavora adesso: non esegue, coordina. Scrive
  // nella chat come faresti tu, si vede tutto quello che succede, e si può
  // intervenire in mezzo — perché per la chat i due messaggi sono uguali.
  // L'ultimo tasto premuto in questa finestra (0.72.0): mai cambiare workspace mentre scrivi.
  const ultimoTasto = useRef<number | undefined>(undefined)
  useEffect(() => {
    const segna = (): void => { ultimoTasto.current = Date.now() }
    window.addEventListener('keydown', segna, true)
    return () => window.removeEventListener('keydown', segna, true)
  }, [])
  /** Le consegne che aspettano che smetti di scrivere per portarti nel loro workspace (0.72.0). */
  const [inAttesaDiQuiete, setInAttesaDiQuiete] = useState<Consegna[]>([])
  const portaConsegnaRef = useRef<(c: Consegna, subito?: boolean) => void>(() => undefined)
  portaConsegnaRef.current = (c: Consegna, subito = false): void => {
    // La prontezza la legge dal flusso dei terminali, che passa di qui: un
    // messaggio scritto mentre Claude Code si sta ancora disegnando resta nel
    // campo, e la chat non parte.
    // 0.80.0: se il riquadro sparisce (lo schermo è andato altrove) la consegna
    // passa in sottofondo, mai la finestra nel suo workspace.
    const porta = (): void => {
      eseguiConsegna({ ...c, sottofondo: true }, ponteReale(prontaPerConsegna, extraConsegna))
    }
    const togli = (): void => { setInAttesaDiQuiete((v) => v.filter((x) => x.id !== c.id)) }
    // **Prima si va dove la chat vive.** La sua conversazione puo' essere
    // salvata in un altro workspace: consegnare qui aprirebbe una seconda
    // copia sotto i tuoi occhi, e il lavoro andrebbe in quella.
    // 0.80.0: lo schermo cambia solo con «Guarda» (subito). Altrimenti, se il
    // suo workspace non è sullo schermo, la consegna va in sottofondo e la
    // chat resta in un riquadro del suo workspace (vedi `comePortare`).
    const come = subito ? (c.workspace !== undefined && c.workspace !== workspaceCorrente() ? 'cambia' : 'qui') : comePortare(c, workspaceCorrente(), ultimoTasto.current, Date.now())
    if (come === 'qui') { togli(); porta(); return }
    if (come === 'sottofondo') {
      togli()
      void window.gestore.log.info(`[consegna] consegna ${c.id}: lavora in sottofondo nel workspace «${c.workspace ?? '?'}», ${c.sottofondo === true ? 'come hai chiesto' : 'perché non è quello davanti e lo schermo cambia solo quando lo scegli tu'} (si vede in «Al lavoro in sottofondo», con Guarda)`).catch(() => undefined)
      void window.gestore.autopilota.inSottofondo(c).catch(() => undefined)
      return
    }
    if (come === 'aspetta') {
      setInAttesaDiQuiete((v) => (v.some((x) => x.id === c.id) ? v : [...v, c]))
      setTimeout(() => { portaConsegnaRef.current(c) }, 5000)
      return
    }
    togli()
    void window.gestore.log.info(`[consegna] consegna ${c.id}: porto la finestra nel suo workspace «${c.workspace ?? '?'}», così la chat si vede`).catch(() => undefined)
    void cambiaSchermo(c.workspace as string, subito ? 'nicholas' : 'consegna', subito ? `«Guarda» sulla consegna ${c.id}` : `consegna ${c.id}`)
      .then(() => window.gestore.workspace.stato())
      .then(aggiornaWorkspace)
      .then(porta)
      .catch((e: unknown) => {
        console.error('[autopilota] non sono riuscito ad andare nel suo workspace:', e)
        porta()
      })
  }
  useEffect(() => window.gestore.client.suConsegna((grezza) => {
    for (const c of leggiConsegne({ consegne: [grezza] })) portaConsegnaRef.current(c)
  }), [])

  // Una chat arrivata in un workspace da un altra finestra. Va messa nella
  // memoria di questa: la memoria vince sul disco, e una copia vecchia che non
  // sa dell arrivo cancellerebbe la chat al primo salvataggio.
  useEffect(() => window.gestore.client.suChatArrivata(({ workspace: dove, pane }) => {
    memoriaWorkspace().aggiungi(dove, pane)
  }), [])

  // Una chat nuova chiesta dal telefono. Solo in una cartella che Claude Code
  // conosce già — il controllo lo fa il Core, qui si apre e basta.
  useEffect(() => window.gestore.client.suApertura(({ cartella, modello, sessione, workspace, nome: nomeScelto, causa }) => {
    // Il nome: quello scritto sul telefono (0.56.0), altrimenti l'ultimo pezzo
    // del percorso — «Documenti\Progetto» dice più di «chat 4».
    const nome = nomeScelto !== undefined && nomeScelto.trim() !== '' ? nomeScelto.trim() : (cartella.split(/[\\/]/).filter((p) => p !== '').pop() ?? cartella)
    const conSessione = sessione !== undefined && sessione !== ''
    const apri = (): void => {
      const stato = useLayoutStore.getState()
      // Con una sessione e' una conversazione che si riprende. Se il suo
      // riquadro e' gia' qui - dopo il viaggio nel suo workspace lo e' - la si
      // sveglia se dorme e basta: un secondo riquadro sarebbe la stessa
      // conversazione due volte. Altrimenti nasce con il suo identificatore e
      // Claude Code la riapre com'era.
      if (conSessione) {
        const gia = Object.values(stato.panes).find((p) => p.sessionUuid === sessione)
        if (gia !== undefined) {
          if (gia.ibernata === true) stato.sveglia(gia.id)
          return
        }
      }
      stato.addPane(cartella, nome, modello, conSessione ? { sessionUuid: sessione } : undefined)
    }
    // **Prima si va dove la chat vive.** Dal telefono si riprende una chat
    // salvata in un suo workspace: aprirla dove questa finestra e' adesso la
    // spostava, e il telefono non deve toccare i workspace. Stessa strada
    // dell'autopilota.
    if (workspace !== undefined && workspace !== workspaceCorrente()) {
      // 0.80.0: dal punto unico, con la causa. Se viene da un autopilota lo
      // schermo resta dov'è e la chat va nel suo workspace senza mostrarla.
      void cambiaSchermo(workspace, leggiCausa(causa, 'ripresa'), `apro «${nome}»`)
        .then(async (cambiato) => {
          if (cambiato) { aggiornaWorkspace(await window.gestore.workspace.stato()); apri(); return }
          if (conSessione) await window.gestore.workspace.spostaChat(workspace, { id: crypto.randomUUID(), sessionUuid: sessione as string, cwd: cartella, title: nome })
        })
        .catch((e: unknown) => {
          console.error('[client] non sono riuscito ad andare nel workspace della chat:', e)
          apri()
        })
      return
    }
    apri()
  }), [])


  // Chiudere una chat dal telefono: il riquadro sparisce, la conversazione
  // resta su disco e si riprende quando si vuole. E' la ragione per cui questo
  // comando puo' stare su un telefono senza essere pericoloso.
  useEffect(() => window.gestore.client.suChiusura((idChat, da) => {
    const stato = useLayoutStore.getState()
    const p = stato.panes[idChat]
    if (p?.ptyId !== undefined) window.gestore.pty.kill(p.ptyId)
    if (p !== undefined && p.remoto === undefined) void window.gestore.remoto.segnaChiusa(p.sessionUuid, p.title, da ?? 'dal telefono').catch(() => undefined)
    stato.closePane(idChat)
  }), [])

  // Il nome che dai a una chat dal telefono: lo stesso che daresti qui.
  /**
   * L'ospite di una chat aperta qui è diventato un altro PC (0.52.0), e la
   * chat ha finito il turno: il Core chiede di chiudere il suo claude.exe. Il
   * riquadro resta al suo posto e diventa la chat dal vivo sull'ospite.
   */
  useEffect(() => window.gestore.casa.suChiudiQui((chat) => {
    const s = useLayoutStore.getState()
    for (const c of chat) {
      for (const p of Object.values(s.panes)) {
        if (p.remoto !== undefined || p.sessionUuid !== c.sessione) continue
        if (p.ptyId !== undefined) window.gestore.pty.kill(p.ptyId)
        s.rendiRemoto(p.id, { pcId: c.pc.id, pcNome: c.pc.nome, cwd: p.cwd, sessione: c.sessione })
      }
    }
  }), [])
  // «Guarda» di uno specialista (0.73.0): la finestra va nel workspace del suo
  // autopilota e il riquadro di quella chat si mette in vista, con il fuoco.
  useEffect(() => {
    const guarda = (e: Event): void => {
      const d = (e as CustomEvent<{ sessionId?: string; workspace?: string }>).detail
      if (d?.sessionId === undefined) return
      const evidenzia = (): void => {
        const r = document.querySelector<HTMLElement>(`.riquadro[data-sessione="${CSS.escape(d.sessionId!)}"]`)
        if (r === null) return
        r.scrollIntoView({ block: 'nearest' })
        r.querySelector<HTMLElement>('.xterm-helper-textarea')?.focus()
        r.classList.add('riquadro--guardato')
        setTimeout(() => r.classList.remove('riquadro--guardato'), 3000)
      }
      if (d.workspace !== undefined && d.workspace !== workspaceCorrente()) {
        void cambiaSchermo(d.workspace, 'nicholas', '«Guarda» su una chat').then(() => setTimeout(evidenzia, 800)).catch(() => undefined)
      } else evidenzia()
    }
    window.addEventListener('sierradeck:guarda-chat', guarda)
    return () => window.removeEventListener('sierradeck:guarda-chat', guarda)
  }, [])
  const [doveVive, setDoveVive] = useState(false)
  useEffect(() => {
    const apri = (): void => setDoveVive(true)
    window.addEventListener('sierradeck:dove-vive', apri)
    return () => window.removeEventListener('sierradeck:dove-vive', apri)
  }, [])
  // Il pannello delle chat e dei progetti del Drive (0.58.0): dalla 0.61.0
  // è «Progetti», la prima voce del menu principale.
  const [pannelloDrive, setPannelloDrive] = useState(false)
  useEffect(() => {
    const apri = (): void => setPannelloDrive(true)
    window.addEventListener('sierradeck:pannello-drive', apri)
    return () => window.removeEventListener('sierradeck:pannello-drive', apri)
  }, [])
  // La cassaforte per la banda (0.65.0): riletta ogni 30 secondi, si riapre anche da sola dal portachiavi.
  const [cassaforte, setCassaforte] = useState<{ serve: boolean; aperta: boolean } | undefined>(undefined)
  useEffect(() => {
    const leggi = (): void => {
      void window.gestore.sync.stato()
        .then((st) => setCassaforte({ serve: st.driveConnesso && st.haCassaforte, aperta: st.sbloccato }))
        .catch(() => undefined)
    }
    leggi()
    const t = setInterval(leggi, 30_000)
    return () => clearInterval(t)
  }, [])
  // «Apri Impostazioni → Account» da Progetti, quando il Drive non è collegato o la cassaforte è chiusa (0.61.0).
  useEffect(() => {
    const apri = (): void => { setPannelloDrive(false); setSchedaImpostazioni('account'); setAperto('impostazioni') }
    window.addEventListener('sierradeck:apri-account', apri)
    return () => window.removeEventListener('sierradeck:apri-account', apri)
  }, [])

  useEffect(() => window.gestore.client.suRinomina(({ chat, nome }) => {
    const s = useLayoutStore.getState()
    s.rinominaPane(chat, nome)
    // Come i due clic sulla testata: il nome vale anche per l'elenco delle
    // conversazioni (0.55.0). Dal telefono restava solo sul riquadro.
    const sessione = s.panes[chat]?.sessionUuid
    if (sessione !== undefined && sessione !== '') void window.gestore.etichette.imposta(sessione, nome).catch(() => undefined)
  }), [])

  /**
   * Le azioni del telefono su workspace e chat (0.55.0), con lo stesso codice
   * dei tasti di questa finestra: ⏸, «Svegliala», ×, ⇄ verso un workspace, e
   * crea/elimina/rinomina del pannello Workspace. Per una chat risponde solo
   * la finestra che ce l'ha: le altre tacciono.
   */
  useEffect(() => window.gestore.client.suAzione((m) => {
    const a = leggiAzioneFinestra(m)
    const rispondi = (ok: boolean, errore?: string): void => window.gestore.client.esitoAzione(m.id, ok, errore)
    if (a === undefined) { rispondi(false, 'azione non riconosciuta da questa versione del programma'); return }
    const fai = async (): Promise<boolean> => {
      if (a.tipo === 'workspace') {
        const azioni = azioniDiFinestra()
        const s = a.azione === 'rinomina' ? await window.gestore.workspace.rinomina(a.nome, a.nuovo)
          : a.azione === 'crea' ? await azioni.crea(a.nome)
          : await azioni.elimina(a.nome)
        aggiornaWorkspace(s)
        return true
      }
      const store = useLayoutStore.getState()
      if (a.azione === 'apriRemota') {
        // Come «Riprendi» della finestra (riprendi-sessione.ts): già a schermo
        // non si apre due volte; se no il riquadro dal vivo verso quel PC.
        if (Object.values(store.panes).some((x) => x.sessionUuid === a.chat)) return true
        store.addPane(a.cwd, a.titolo !== '' ? a.titolo : (a.cwd.split(/[\\/]/).filter((x) => x !== '').pop() ?? a.chat.slice(0, 8)), undefined, { sessionUuid: a.chat, remoto: { pcId: a.pcId, pcNome: a.pcNome, cwd: a.cwd, sessione: a.chat } })
        return true
      }
      const p = store.panes[a.chat]
      if (p === undefined) return false
      if (a.azione === 'dormi') {
        if (p.remoto !== undefined) throw new Error(`questa chat lavora su ${p.remoto.pcNome}: si mette a dormire da là`)
        const pty = store.iberna(a.chat)
        if (pty !== undefined) window.gestore.pty.kill(pty)
      } else if (a.azione === 'sveglia') {
        if (p.ibernata === true) store.sveglia(a.chat)
      } else if (a.azione === 'chiudi') {
        if (p.ptyId !== undefined) window.gestore.pty.kill(p.ptyId)
        if (p.remoto === undefined) void window.gestore.remoto.segnaChiusa(p.sessionUuid, p.title, 'da lontano').catch(() => undefined)
        store.closePane(a.chat)
      } else if (a.azione === 'sposta') {
        let errore: unknown
        await spostaInWorkspace({
          stacca: (id) => useLayoutStore.getState().staccaPane(id),
          consegna: (dove, pane) => window.gestore.workspace.spostaChat(dove, pane),
          ricorda: (dove, pane) => memoriaWorkspace().aggiungi(dove, pane),
          chiudiTerminale: (ptyId) => window.gestore.pty.kill(ptyId),
          dimentica: (id) => { useLayoutStore.getState().dimenticaCeduti([id]); useLayoutStore.getState().closePane(id) },
          accogli: (pane) => useLayoutStore.getState().accogliPane(pane),
          segnala: (err) => { errore = err }
        }, a.chat, a.workspace)
        if (errore !== undefined) throw errore instanceof Error ? errore : new Error(String(errore))
      }
      return true
    }
    void fai()
      .then((mia) => { if (mia) rispondi(true) })
      .catch((e: unknown) => rispondi(false, e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e)))
  }), [])

  // Quello che scrivi dal telefono arriva alla chat come se lo avessi digitato.
  // Un pezzo di cronologia chiesto dal telefono. Risponde **solo** la finestra
  // che ha quella chat: le altre tacciono, e chi ha chiesto aspetta la prima
  // che parla. Senza questo, dal telefono si vedevano le ultime righe e basta,
  // mentre la conversazione intera era qui, dentro l’xterm del riquadro.
  useEffect(() => window.gestore.client.suRichiestaRighe(({ id, chat, da, quante, schermo }) => {
    const riquadro = riquadroDelTelefono(chat)
    if (riquadro?.ptyId === undefined) return
    // `schermo`: quello disegnato adesso, non un pezzo di cronologia. Serve a
    // controllare una scelta prima di premere: la foto che il Core tiene ha
    // fino a due secondi, e la domanda puo' essere gia' stata risposta.
    if (schermo === true) {
      const vivo = righeDiPty(riquadro.ptyId, quante)
      if (vivo === undefined) return
      window.gestore.client.rispondiRighe(id, { totale: 0, da: 0, ...vivo })
      return
    }
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
    scriviQuandoPronta(sessione, testo, ponteReale(prontaPerConsegna, extraConsegna))
  }), [])

  useEffect(() => window.gestore.client.suScrittura(({ chat, testo }) => {
    // `chat` è l'identificatore del **riquadro**, non del terminale: scriverci
    // dentro direttamente non faceva niente, in silenzio, ed è il motivo per
    // cui dal telefono si scriveva nel vuoto. Il terminale sta nel riquadro, e
    // solo questa finestra sa quale.
    const riquadro = riquadroDelTelefono(chat) as { ptyId?: string; sessionUuid?: string; ibernata?: boolean } | undefined
    if (riquadro === undefined) return
    const ponte = ponteReale(prontaPerConsegna, extraConsegna)
    if (riquadro.ptyId === undefined) {
      // Un riquadro addormentato (0.86.2): prima il testo spariva qui, in
      // silenzio. Lo si sveglia e il testo parte quando la chat è pronta.
      if (riquadro.ibernata === true && riquadro.sessionUuid !== undefined && testo !== '') scriviQuandoPronta(riquadro.sessionUuid, testo, ponte)
      return
    }
    // Il testo e l'invio **separati**, e l'invio solo dopo l'eco (0.86.2).
    //
    // Mandandoli insieme, Claude Code li riceve in un solo blocco e li legge per
    // quello che sembrano: del testo incollato che finisce con un a capo. Fino
    // alla 0.86.1 qui l'invio partiva a tempo, 150 ms dopo, una volta sola: se
    // Claude Code leggeva in ritardo la risposta dalle Domande restava nel
    // campo e non partiva. Adesso è il gesto delle consegne: marcatori
    // dell'incolla per più righe, Invio quando il testo si vede nel campo e il
    // terminale tace, e il controllo che sia partito (`scriviMessaggio`).
    // Il testo puo' essere vuoto: succede rispondendo a un elenco di scelte dal
    // telefono, quando l'opzione voluta e' gia' quella evidenziata. Resta il solo invio.
    scriviMessaggio(riquadro.ptyId, testo, ponte, undefined, chat)
  }), [])

  // La risposta a una domanda della chat (0.52.5): i pezzi uno alla volta,
  // con la stessa pausa del testo e dell'invio. Le frecce insieme vanno bene;
  // il testo di una risposta libera e l'invio devono arrivare dopo.
  useEffect(() => window.gestore.client.suTasti(({ chat, pezzi }) => {
    const riquadro = riquadroDelTelefono(chat)
    if (riquadro?.ptyId === undefined || !Array.isArray(pezzi)) return
    const idPty = riquadro.ptyId
    pezzi.forEach((p, i) => {
      if (typeof p === 'string' && p !== '') setTimeout(() => window.gestore.pty.write(idPty, p), i * PAUSA_PRIMA_DELL_INVIO_MS)
    })
  }), [])

  useEffect(() => window.gestore.client.suWorkspace((nome) => {
    void cambiaSchermo(nome, 'telefono', 'dal telefono o da un workspace eliminato')
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
  // «Spazio delle chat» (0.79.0): si apre da «Riprendi», da «Chat e workspace» e da ovunque mandi l'evento.
  const [gestioneChat, setGestioneChat] = useState<SchedaGestione | undefined>(undefined)
  useEffect(() => {
    const apri = (e: Event): void => { const d = (e as CustomEvent<unknown>).detail; setGestioneChat(d === 'archiviate' || d === 'recupero' ? d : 'spazio') }
    window.addEventListener('sierradeck:gestione-chat', apri)
    return () => window.removeEventListener('sierradeck:gestione-chat', apri)
  }, [])
  // Un progetto sul Drive in mano a un altro PC, o un testimone appena ceduto.
  const [avvisoProgetto, setAvvisoProgetto] = useState<AvvisoProgetto | undefined>(undefined)
  useEffect(() => window.gestore.progetti.suAvviso(setAvvisoProgetto), [])
  useEffect(() => window.gestore.progetti.suIberna(({ sessioni }) => {
    // Il testimone e' passato a un altro PC: le chat di quel progetto dormono,
    // cosi' da qui non si scrive piu' sopra il suo lavoro.
    const store = useLayoutStore.getState()
    for (const [paneId, p] of Object.entries(store.panes)) {
      if (!sessioni.includes(p.sessionUuid)) continue
      const pty = store.iberna(paneId)
      if (pty !== undefined) window.gestore.pty.kill(pty)
    }
  }), [])
  // La finestra delle note (0.39.0): o le novità della versione installata,
  // chieste dal menu, o cosa cambia con l'aggiornamento pronto, da «Installa».
  // All'avvio non si apre più da sola.
  const [finestraNote, setFinestraNote] = useState<
    { tipo: 'novita'; versione: string; note: NotaResa[] } | { tipo: 'installa'; versione: string; dati?: NoteAggiornamento } | undefined
  >(undefined)
  // Le novità della versione installata, richieste apposta: dalla 0.39.0
  // all'avvio non si aprono più da sole. Si chiedono dal numero di versione
  // in alto o dalle Impostazioni (che mandano `sierradeck:apri-novita`).
  const apriNovita = useCallback((): void => {
    window.gestore.sistema
      .versione()
      .then((v) => {
        const n = novitaConLeUltime(v)
        setFinestraNote({ tipo: 'novita', versione: n.versione, note: noteDaNovita([n, ...(n.altre ?? [])]) })
      })
      .catch(() => undefined)
  }, [])
  useEffect(() => {
    const h = (): void => apriNovita()
    window.addEventListener('sierradeck:apri-novita', h)
    return () => window.removeEventListener('sierradeck:apri-novita', h)
  }, [apriNovita])
  const apriInstalla = useCallback((versione: string): void => {
    setFinestraNote({ tipo: 'installa', versione })
    window.gestore.aggiornamenti
      .note()
      .then((dati) => setFinestraNote((f) => (f?.tipo === 'installa' ? { ...f, dati: dati ?? { versione, installata: '', note: [], fonte: 'nessuna', dove: 'https://github.com/niko9090/sierradeck/releases', avviso: 'Gli aggiornamenti non sono attivi qui: le note le trovi nella pagina delle versioni, https://github.com/niko9090/sierradeck/releases.' } } : f)))
      .catch(() => setFinestraNote((f) => (f?.tipo === 'installa' ? { ...f, dati: { versione, installata: '', note: [], fonte: 'nessuna', dove: 'https://github.com/niko9090/sierradeck/releases', avviso: 'Non sono riuscito a leggere le note: le trovi scritte per esteso nella pagina delle versioni, https://github.com/niko9090/sierradeck/releases. Puoi installare lo stesso.' } } : f)))
  }, [])
  // «Cosa cambia e installa» dalle Impostazioni → Aggiornamenti (0.56.0): la stessa finestra delle note.
  useEffect(() => {
    const h = (e: Event): void => apriInstalla(String((e as CustomEvent).detail ?? ''))
    window.addEventListener('sierradeck:apri-installa', h)
    return () => window.removeEventListener('sierradeck:apri-installa', h)
  }, [apriInstalla])
  const [aperto, setAperto] = useState<PannelloAperto>(undefined)
  // Il quaderno di un progetto scelto in Progetti (0.71.1): la sua cartella, non quella della chat davanti.
  const [quadernoDi, setQuadernoDi] = useState<string | undefined>(undefined)
  useEffect(() => {
    const h = (e: Event): void => {
      const cwd = ((e as CustomEvent).detail as { cwd?: unknown } | undefined)?.cwd
      setQuadernoDi(typeof cwd === 'string' && cwd !== '' ? cwd : undefined)
      setAperto('quaderno')
    }
    window.addEventListener('sierradeck:apri-quaderno', h)
    return () => window.removeEventListener('sierradeck:apri-quaderno', h)
  }, [])
  useEffect(() => { if (aperto !== 'quaderno') setQuadernoDi(undefined) }, [aperto])
  /** La scheda con cui si aprono le Impostazioni (la banda del Drive apre «Account»). */
  const [schedaImpostazioni, setSchedaImpostazioni] = useState<'generali' | 'account'>('generali')
  /**
   * Il Drive scollegato (0.39.3): una banda fissa, che non si chiude finche'
   * resta scollegato. Il 23/09 Google ha rifiutato l'autorizzazione su due PC,
   * e per nove giorni l'unico segno era una riga nel registro: intanto gli
   * altri PC sembravano spenti.
   */
  const [driveScollegato, setDriveScollegato] = useState<import('@shared/scoperta-pc').AvvisoDrive | undefined>(undefined)
  // Dalla 0.56.3 è una riga sola che si chiude; chiusa resta chiusa finché il
  // problema è lo stesso (la `chiave` è il momento dello scollegamento).
  const [driveChiuso, setDriveChiuso] = useState<string | undefined>(() => { try { return localStorage.getItem('sierradeck.driveChiuso') ?? undefined } catch { return undefined } })
  const [drivePerche, setDrivePerche] = useState(false)
  const chiudiDrive = (chiave: string): void => { setDriveChiuso(chiave); try { localStorage.setItem('sierradeck.driveChiuso', chiave) } catch { /* resta chiusa fino al riavvio */ } }
  useEffect(() => {
    const leggi = (): void => { window.gestore.drive.avvisoScollegato().then(setDriveScollegato).catch(() => undefined) }
    leggi()
    const t = setInterval(leggi, 30_000)
    return () => clearInterval(t)
  }, [])
  // Quante conversazioni della scheda Domande aspettano una risposta: il
  // numero sul tasto, letto dalle stesse rotte del telefono (0.36.0).
  const [domandeInAttesa, setDomandeInAttesa] = useState(0)
  // La colonna laterale delle Domande: aperta o chiusa, e quanto e' larga.
  // Sta nelle preferenze, cosi' si ritrova com'era al riavvio.
  const [colonnaDomande, setColonnaDomande] = useState<{ aperta: boolean; larghezza: number }>({ aperta: false, larghezza: 400 })
  const preferenzeLette = useRef(false)
  useEffect(() => {
    const applica = (p: { domandeLaterali: boolean; larghezzaDomande: number }): void => {
      setColonnaDomande({ aperta: p.domandeLaterali, larghezza: p.larghezzaDomande })
      preferenzeLette.current = true
    }
    window.gestore.preferenze.leggi().then(applica).catch(() => undefined)
    return window.gestore.preferenze.suCambio(applica)
  }, [])
  /** Apre o chiude la colonna Domande, e lo ricorda nelle preferenze. */
  const commutaColonna = useCallback((_quale: 'domande'): void => {
    const domande = !colonnaDomande.aperta
    setColonnaDomande((c) => ({ ...c, aperta: domande }))
    window.gestore.preferenze
      .leggi()
      .then((p) => window.gestore.preferenze.imposta({ ...p, domandeLaterali: domande }))
      .catch(() => undefined)
  }, [colonnaDomande])
  // Apre la colonna Domande per una domanda nuova (mai la chiude).
  const apriColonnaDomandeRef = useRef<() => void>(() => undefined)
  apriColonnaDomandeRef.current = (): void => {
    if (!colonnaDomande.aperta) commutaColonna('domande')
  }
  // Gli avvisi chiusi con «Chiudi» (0.37.0): nelle preferenze, cosi' un fermo
  // chiuso resta chiuso anche dopo un riavvio.
  const [avvisiChiusi, setAvvisiChiusi] = useState<string[]>([])
  useEffect(() => {
    const applica = (p: { avvisiChiusi: string[] }): void => setAvvisiChiusi(p.avvisiChiusi)
    window.gestore.preferenze.leggi().then(applica).catch(() => undefined)
    return window.gestore.preferenze.suCambio(applica)
  }, [])
  const chiudiAvviso = useCallback((chiavi: string[]): void => {
    setAvvisiChiusi((c) => ricordaChiusi(c, chiavi))
    window.gestore.preferenze
      .leggi()
      .then((p) => window.gestore.preferenze.imposta({ ...p, avvisiChiusi: ricordaChiusi(p.avvisiChiusi, chiavi) }))
      .catch(() => undefined)
  }, [])
  // La vista a elenco (0.74.0): quali workspace la usano (preferenza del PC) e quale chat sta davanti.
  const [workspaceElenco, setWorkspaceElenco] = useState<string[]>([])
  // Le chat «solo mia» (0.78.0): l'autopilota del workspace non le tocca.
  const [chatSoloMie, setChatSoloMie] = useState<string[]>([])
  useEffect(() => {
    const applica = (p: { workspaceElenco: string[]; chatSoloMie?: string[] }): void => { setWorkspaceElenco(p.workspaceElenco); setChatSoloMie(p.chatSoloMie ?? []) }
    window.gestore.preferenze.leggi().then(applica).catch(() => undefined)
    return window.gestore.preferenze.suCambio(applica)
  }, [])
  const impostaElenco = useCallback((nome: string, accesa: boolean): void => {
    setWorkspaceElenco((l) => cambiaVistaElenco(l, nome, accesa))
    window.gestore.preferenze
      .leggi()
      .then((p) => window.gestore.preferenze.imposta({ ...p, workspaceElenco: cambiaVistaElenco(p.workspaceElenco, nome, accesa) }))
      .catch(() => undefined)
  }, [])
  useEffect(() => {
    const accendi = (e: Event): void => {
      const d = (e as CustomEvent<{ nome?: string; accesa?: boolean }>).detail
      if (d?.nome !== undefined && d.nome !== '') impostaElenco(d.nome, d.accesa ?? true)
    }
    window.addEventListener('sierradeck:vista-elenco', accendi)
    return () => window.removeEventListener('sierradeck:vista-elenco', accendi)
  }, [impostaElenco])
  // La chat davanti nella vista a elenco, scelta per ogni workspace (0.75.4): passando
  // a un altro workspace e tornando, resta quella che avevi scelto.
  const [davantiPerWs, setDavantiPerWs] = useState<Record<string, string>>({})
  // La Panoramica (0.77.0): la linguetta aperta per ogni workspace («panoramica» o il riquadro di una chat),
  // la colonna sottile dell'autopilota, e per ogni chat il gruppo mostrato e da quando (8 s di quiete).
  const [linguettaPerWs, setLinguettaPerWs] = useState<Record<string, string>>({})
  const [colonnaAutopilota, setColonnaAutopilota] = useState(false)
  const gruppiMostrati = useRef(new Map<string, { gruppo: StatoScheda; statoDal: number; stato: StatoScheda }>())
  const nateIl = useRef(new Map<string, number>())
  const davantiPrima = useRef(new Map<string, string>())
  const setDavantiScelto = useCallback((paneId: string): void => {
    const ws = workspaceCorrente()
    setDavantiPerWs((m) => (m[ws] === paneId ? m : { ...m, [ws]: paneId }))
  }, [])
  // La trasformazione dei workspace (0.74.1): per la banda e per gli autopiloti dormienti.
  const [migrazione, setMigrazione] = useState<StatoMigrazione | null>(null)
  const [notaMigrazione, setNotaMigrazione] = useState<string | undefined>(undefined)
  useEffect(() => {
    const leggi = (): void => { void window.gestore.migrazione.stato().then(setMigrazione).catch(() => undefined) }
    leggi()
    return window.gestore.migrazione.suCambio(leggi)
  }, [])
  // Un workspace creato da fuori dal suo pannello (0.74.0: «+ Nuovo autopilota»): si rilegge lo stato.
  useEffect(() => {
    const rileggi = (): void => { void window.gestore.workspace.stato().then((s) => aggiornaWorkspaceRef.current(s)).catch(() => undefined) }
    window.addEventListener('sierradeck:rileggi-workspace', rileggi)
    return () => window.removeEventListener('sierradeck:rileggi-workspace', rileggi)
  }, [])
  // «Guarda» di uno specialista porta davanti la sua chat anche nella vista a elenco.
  useEffect(() => {
    const guarda = (e: Event): void => {
      const s = (e as CustomEvent<{ sessionId?: string }>).detail?.sessionId
      const p = Object.values(useLayoutStore.getState().panes).find((x) => x.sessionUuid === s)
      if (p !== undefined) setDavantiScelto(p.id)
    }
    window.addEventListener('sierradeck:guarda-chat', guarda)
    return () => window.removeEventListener('sierradeck:guarda-chat', guarda)
  }, [])
  const salvaColonnaDomande = useCallback((cambio: { aperta?: boolean; larghezza?: number }): void => {
    setColonnaDomande((c) => ({ ...c, ...cambio }))
    window.gestore.preferenze
      .leggi()
      .then((p) => window.gestore.preferenze.imposta({
        ...p,
        ...(cambio.aperta !== undefined ? { domandeLaterali: cambio.aperta } : {}),
        ...(cambio.larghezza !== undefined ? { larghezzaDomande: cambio.larghezza } : {})
      }))
      .catch(() => undefined)
  }, [])
  /**
   * Le domande si aprono **a fianco della chat**, non in una finestra (0.37.2).
   *
   * Nicholas (01/10): «non vedo tutte le domande … farmele vedere a fianco
   * della chat e non come finestra». Qui si sonda `/api/domande` (la stessa
   * lista della colonna, della pagina e dell'app) e, per ogni domanda **nuova**
   * — mai vista prima, anche fra un avvio e l'altro — la colonna si apre da
   * sola se e' chiusa e mette in evidenza quella conversazione. Non prende il
   * fuoco della tastiera: chi sta scrivendo in una chat continua a scrivere.
   * Chiusa a mano, si riapre solo per una domanda nuova, non per la stessa.
   *
   * Dal 30/10 la colonna è l'unico posto delle domande: anche quelle
   * dell'autopilota del workspace la aprono, come quelle delle chat.
   */
  const [evidenzaDomanda, setEvidenzaDomanda] = useState<{ chiave: string; quando: number } | undefined>(undefined)
  const colonnaDomandeRef = useRef(colonnaDomande)
  colonnaDomandeRef.current = colonnaDomande
  const domandeViste = useRef<Set<string> | undefined>(undefined)
  // La prima lettura dopo l'avvio apre la colonna se c'e' qualcosa in attesa
  // (0.37.3): solo dopo aver letto le preferenze, che altrimenti la
  // richiuderebbero arrivando dopo.
  const avvioDomande = useRef(true)
  // Le chat ferme su una domanda (0.70.0): «aspetta te» sulla testata del loro riquadro.
  const [chiedono, setChiedono] = useState<ReadonlySet<string>>(new Set())
  useEffect(() => {
    const viste = (): Set<string> => {
      if (domandeViste.current === undefined) {
        let lette: string[] = []
        try { lette = JSON.parse(localStorage.getItem('domande-viste') ?? '[]') as string[] } catch { /* si riparte da zero */ }
        domandeViste.current = new Set(Array.isArray(lette) ? lette : [])
      }
      return domandeViste.current
    }
    const leggi = (): void => {
      window.gestore.domande
        .chiama('/api/domande')
        .then((r) => {
          const corpo = r.corpo as { conversazioni?: Conversazione[]; chiedono?: number }
          const c = corpo.conversazioni ?? []
          const ora = new Set(c.filter((x) => x.tipo === 'chat' && x.chiede && x.chiave.startsWith('chat:')).map((x) => x.chiave.slice(5)))
          setChiedono((prima) => (prima.size === ora.size && [...ora].every((x) => prima.has(x)) ? prima : ora))
          setDomandeInAttesa(corpo.chiedono ?? quanteAspettano(c))
          if (!preferenzeLette.current) return
          const v = viste()
          const avvio = avvioDomande.current
          avvioDomande.current = false
          // Un posto solo (30/10): senza `autopilota` anche le domande dell'autopilota stanno nella colonna.
          const d = decidiColonnaDomande({ conversazioni: c.map(({ autopilota: _ap, ...x }) => x), viste: v, aperta: colonnaDomandeRef.current.aperta, avvio })
          if (d.nuove.length > 0) {
            for (const n of d.nuove) v.add(n)
            try { localStorage.setItem('domande-viste', JSON.stringify([...v].slice(-300))) } catch { /* senza memoria al prossimo avvio si riapre, non di piu' */ }
          }
          if (d.apri) apriColonnaDomandeRef.current()
          if (d.evidenzia !== undefined && (d.apri || d.nuove.length > 0)) setEvidenzaDomanda({ chiave: d.evidenzia, quando: Date.now() })
        })
        .catch(() => undefined)
    }
    leggi()
    // Con la finestra nascosta o ridotta, ogni 15 secondi invece di 3 (0.69.0):
    // ogni lettura chiede le domande a tutte le chat e al servizio degli autopiloti.
    let lettaIl = Date.now()
    const h = setInterval(() => {
      if (document.hidden && Date.now() - lettaIl < 15_000) return
      lettaIl = Date.now()
      leggi()
    }, 3000)
    return () => clearInterval(h)
  }, [])
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
  aggiornaWorkspaceRef.current = aggiornaWorkspace
  const [autopiloti, setAutopiloti] = useState<Autopilota[]>([])
  const [erroreAutopiloti, setErroreAutopiloti] = useState<string | undefined>(undefined)
  // Le chat finite si tolgono da sole (0.74.0): lo specialista che ha finito
  // chiude il riquadro e il suo claude.exe; la chat di un autopilota fermo
  // torna tua. Solo con l'elenco degli autopiloti letto davvero.
  useEffect(() => {
    if (erroreAutopiloti !== undefined) return
    const s = useLayoutStore.getState()
    const riquadri = Object.values(s.panes).flatMap((p) => (p.autopilota !== undefined
      ? [{ paneId: p.id, autopilota: p.autopilota, remoto: p.remoto !== undefined, occupata: (p.ptyId !== undefined && pensano.has(p.ptyId)) || chiedono.has(p.id) }]
      : []))
    if (riquadri.length === 0) return
    const { chiudi, libera } = chatDaSistemare(riquadri, autopiloti)
    for (const id of chiudi) {
      const p = s.panes[id]
      if (p === undefined) continue
      console.info(`[elenco] «${p.title}»: lo specialista ha finito, chiudo la sua chat`)
      if (p.ptyId !== undefined) window.gestore.pty.kill(p.ptyId)
      useLayoutStore.getState().closePane(id)
    }
    for (const id of libera) useLayoutStore.getState().liberaAutopilota(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `pensano` e `chiedono` cambiano ogni pochi secondi: basta guardarli quando cambiano gli autopiloti
  }, [autopiloti, erroreAutopiloti])
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
  /** L'avviso dell'installazione non riuscita, chiuso per questa sessione (torna al prossimo avvio). */
  const [fallitoChiuso, setFallitoChiuso] = useState(false)
  // Il lavoro con il Drive (fusione, ripristino, salvataggio): una striscia in
  // alto come per un aggiornamento. Continua anche a pannello chiuso, da qui
  // si annulla, e finito resta l'esito finche' non lo chiudi. Prima «Fondi
  // adesso» partiva e non si vedeva niente da nessuna parte.
  const [lavoroDrive, setLavoroDrive] = useState<StatoLavoro>({})
  const [esitoLavoroVisto, setEsitoLavoroVisto] = useState<string | undefined>(undefined)
  // I fumetti della sincronia (Nicholas, 15/09: la striscia in alto «continua
  // a muoversi ed e' veramente scomodo»): fuori dal flusso, in basso a
  // destra; il lavoro automatico si mostra solo se la preferenza lo chiede.
  const [fumettiAuto, setFumettiAuto] = useState(false)
  const fumettiDrive = decidiFumettiDrive({ inCorso: lavoroDrive.inCorso, ultimo: lavoroDrive.ultimo, esitoVisto: esitoLavoroVisto, automaticiVisibili: fumettiAuto })
  useChiusuraAutomatica(fumettiDrive.esito?.esito === 'ok' ? fumettiDrive.esito.quando : undefined, FUMETTO_ESITO_OK_MS, () => setEsitoLavoroVisto(lavoroDrive.ultimo?.quando))
  // Le chat arrivate dal Drive: l'indice e' gia' riletto, sono nell'elenco.
  const [chatArrivate, setChatArrivate] = useState<{ quante: number; tipo: string; quando: string; rimappate: number } | undefined>(undefined)
  useEffect(() => window.gestore.sync.onChatArrivate(setChatArrivate), [])
  useChiusuraAutomatica(chatArrivate?.quando, FUMETTO_ARRIVO_MS, () => setChatArrivate(undefined))
  useEffect(() => window.gestore.sync.onCartellaCambiata(({ sessionUuid, a }) => useLayoutStore.getState().impostaCartella(sessionUuid, a)), [])
  // Solo le transizioni: il progresso file per file lo segue la striscia da
  // sola. Ridisegnare tutta l'App a ogni file (e ogni secondo per l'orologio)
  // era quello che la bloccava durante una fusione.
  useEffect(() => {
    void window.gestore.sync.lavoro().then(setLavoroDrive).catch(() => undefined)
    return window.gestore.sync.onLavoro((s) => setLavoroDrive((prima) => soloTransizioni(prima, s)))
  }, [])
  // Il riavvio dopo un lavoro che ha portato qui chat o workspace: come per
  // un aggiornamento, un conto alla rovescia con «Riavvia ora» e «Piu' tardi».
  // Le chat arrivate compaiono nei riquadri solo al riavvio, e farlo a mano
  // era il passo che nessuno ricordava.
  const [riavvioFra, setRiavvioFra] = useState<number | undefined>(undefined)
  const [riavvioRinviato, setRiavvioRinviato] = useState<string | undefined>(undefined)
  const [riavvioEsito, setRiavvioEsito] = useState<string | undefined>(undefined)
  // Gli avvisi sui consumi — la finestra di 5 ore o la settimana sopra l'80%,
  // il contesto di una chat quasi pieno — in un fumetto, una volta per fatto:
  // la chiave dell'avviso cambia con l'azzeramento, e quelle gia' mostrate
  // restano nel browser.
  const [avvisoConsumi, setAvvisoConsumi] = useState<AvvisoConsumi | undefined>(undefined)
  /** Dall'avviso dei limiti la Salute si apre già sui consumi. */
  const [saluteSuConsumi, setSaluteSuConsumi] = useState(false)
  useEffect(() => { if (aperto !== 'salute') setSaluteSuConsumi(false) }, [aperto])
  useEffect(() => {
    let vivo = true
    let gia = new Set<string>()
    try { gia = new Set<string>(JSON.parse(localStorage.getItem('avvisi-consumi') ?? '[]') as string[]) } catch { /* si riparte senza memoria */ }
    const giro = (): void => {
      window.gestore.sessions.consumi().then((c) => {
        if (!vivo) return
        const avvisi = avvisiConsumi({ limiti: c.limiti, chatAperte: c.chatAperte ?? [], adesso: Date.now() })
        const nuovo = avvisi.find((a) => !gia.has(a.chiave))
        if (nuovo === undefined) return
        gia.add(nuovo.chiave)
        try { localStorage.setItem('avvisi-consumi', JSON.stringify([...gia].slice(-60))) } catch { /* senza memoria si ripete al prossimo avvio, non di piu' */ }
        setAvvisoConsumi(nuovo)
      }).catch(() => undefined)
    }
    const primo = setTimeout(giro, 20_000)
    const t = setInterval(giro, 30_000)
    return () => { vivo = false; clearTimeout(primo); clearInterval(t) }
  }, [])
  useEffect(() => {
    const u = lavoroDrive.ultimo
    if (u === undefined || u.riavvioConsigliato !== true || riavvioRinviato === u.quando) { setRiavvioFra(undefined); return }
    setRiavvioFra(10)
  }, [lavoroDrive.ultimo?.quando, riavvioRinviato])
  useEffect(() => {
    if (riavvioFra === undefined) return
    if (riavvioFra <= 0) {
      setRiavvioFra(undefined)
      void window.gestore.sistema.riavvia().then((r) => { if (!r.ok) setRiavvioEsito(r.messaggio ?? 'non riavviato') })
      return
    }
    const t = setTimeout(() => setRiavvioFra((n) => (n === undefined ? undefined : n - 1)), 1000)
    return () => clearTimeout(t)
  }, [riavvioFra])
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

  // Solo le azioni, che non cambiano mai (0.81.0): abbonarsi a tutto lo store
  // ridisegnava l'intera finestra a ogni avanzamento dell'indice (7 volte al
  // secondo durante un'indicizzazione) e a ogni elenco nuovo delle sessioni.
  // L'avanzamento lo legge solo la schermata d'avvio, da sé.
  const setProgress = useSessionStore((s) => s.setProgress)
  const setEsito = useSessionStore((s) => s.setEsito)
  const caricaSessioni = useSessionStore((s) => s.load)

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
    // Con la finestra nascosta ogni 15 s (0.85.2).
    return ogni(leggi, RICARICA_AUTOPILOTI_MS)
  }, [])

  const chiamate = chiChiede(autopiloti, doveSta)
  const workspaceChiamano = workspaceCheChiamano(chiamate)

  useEffect(() => {
    ricaricaAutopiloti()
    // Con la finestra nascosta ogni 15 s (0.85.2): l'elenco serve anche a
    // finestra ridotta (le chat finite si tolgono da sole, il numero
    // nell'icona), ma non ogni 5 s.
    return ogni(ricaricaAutopiloti, RICARICA_AUTOPILOTI_MS)
  }, [ricaricaAutopiloti])

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
      setFumettiAuto(p.fumettiSincroniaAutomatica)
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
      // Seguire un'altra finestra (0.80.0): anche questo cambio va nel registro.
      if (s.precedente !== s.attivo && s.precedente === workspaceCorrente()) void window.gestore.log.info(`[schermo] «${s.precedente}» → «${s.attivo}» (segue un cambio fatto in un’altra finestra)`).catch(() => undefined)
      aggiornaWorkspace({ nomi: s.nomi, attivo: s.attivo })
      void azioniWorkspace.current
        ?.segui(s.precedente, s.attivo, 'segue il cambio fatto in un’altra finestra di questo PC')
        .then(() => {
          // **Eliminato da un'altra finestra.** Qui il trasloco ha messo in
          // memoria i riquadri del workspace sparito con i terminali ancora
          // vivi, e il pannello non lo elenca piu' fra gli «ancora al lavoro»:
          // quei claude.exe restavano accesi e irraggiungibili fino alla
          // chiusura della finestra. Se il nome non c'e' piu', si spegne.
          if (!s.nomi.includes(s.precedente)) azioniWorkspace.current?.spegni(s.precedente)
        })
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

  // **All'avvio torna l'ultima composizione, in silenzio.** Fino alla 0.33.1
  // compariva la finestra «Riprendi» con l'elenco dei salvataggi anche se le
  // chat erano gia' tornate da sole; Nicholas (23/09): «in apertura venga
  // sempre ripresentata l'ultima composizione senza possibilita' di salvare,
  // tanto uno lavora sempre sugli stessi». Il layout si ripristina da
  // workspaces.json; le chiusure automatiche restano su disco solo come rete
  // di sicurezza (Impostazioni → «Torna a com'era»).
  //
  // Alla chiusura, la chiusura automatica: e' cio' che «Torna a com'era»
  // ritrova. L'elenco si tiene fresco per non salvare due volte la stessa cosa.
  const istantaneeNote = useRef<Istantanea[]>([])
  useEffect(() => {
    window.gestore.istantanee
      .elenca()
      .then((elenco) => { istantaneeNote.current = elenco })
      .catch(() => { istantaneeNote.current = [] })
  }, [modale])

  useEffect(() => {
    const allaChiusura = (): void => {
      // Sempre, da 0.34.0: non e' piu' un'opzione ma la rete di sicurezza.
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
      <SchermataAvvioConAvanzamento />
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

  // La vista a elenco (0.74.0) del workspace davanti: le voci e la chat che sta davanti.
  const vistaElenco = ((): { voci: VoceElenco[]; davanti: string | undefined } | undefined => {
    if (!workspaceElenco.includes(workspace.attivo)) return undefined
    const tutte: VoceElenco[] = Object.values(riquadriAperti).map((p) => ({
      paneId: p.id,
      titolo: p.title,
      ...(ruoloDalTitolo(p.title) !== undefined ? { ruolo: ruoloDalTitolo(p.title) } : {}),
      ...(p.autopilota !== undefined ? { autopilota: p.autopilota.id } : {}),
      lavora: p.ptyId !== undefined && pensano.has(p.ptyId),
      chiede: chiedono.has(p.id)
    }))
    // L'ordine del layout, mai quello in cui i riquadri sono entrati nello store (0.75.4).
    const voci = vociInOrdine(tutte, root !== undefined ? listPaneIds(root) : [])
    const davanti = chatDavantiStabile(voci, davantiPerWs[workspace.attivo], davantiPrima.current.get(workspace.attivo))
    if (davanti !== undefined) davantiPrima.current.set(workspace.attivo, davanti)
    return { voci, davanti }
  })()
  // L'autopilota del workspace (30/10: uno per workspace, sempre acceso), in tutte e due le viste.
  const autopilotaFisso = autopilotaDelWorkspace(autopiloti, workspace.attivo)
  // La Panoramica (0.77.0): una scheda per chat del workspace, più gli specialisti che hanno finito.
  const linguetta = vistaElenco !== undefined ? (linguettaPerWs[workspace.attivo] ?? PANORAMICA) : PANORAMICA
  const schedePanoramica = ((): SchedaVista[] => {
    if (vistaElenco === undefined) return []
    const ora = Date.now()
    const specialisti = autopilotaFisso !== undefined ? specialistiDi(autopilotaFisso).elenco : []
    // Le chat adottate (0.78.0): il ruolo che le ha dato l'autopilota, o quello dal contenuto.
    const adottate = new Map((autopilotaFisso?.adottate ?? []).map((x) => [x.sessionId, x]))
    const mie = new Set([...chatSoloMie, ...[...adottate.values()].filter((x) => x.soloMia === true).map((x) => x.sessionId)])
    const perSessione = new Map(specialisti.filter((x) => x.sessionId !== undefined).map((x) => [x.sessionId!, x]))
    const numero = (id: string): number => Number(/(\d+)$/.exec(id)?.[1] ?? 0)
    const fuori: SchedaVista[] = []
    for (const p of Object.values(riquadriAperti)) {
      const sp = p.sessionUuid !== undefined ? perSessione.get(p.sessionUuid) : undefined
      if (!nateIl.current.has(p.id)) nateIl.current.set(p.id, ora)
      const adesso: StatoScheda = chiedono.has(p.id) ? 'chiede' : p.ptyId !== undefined && pensano.has(p.ptyId) ? 'lavora' : 'ferma'
      const prima = gruppiMostrati.current.get(p.id)
      const statoDal = prima !== undefined && prima.stato === adesso ? prima.statoDal : ora
      const gruppo = gruppoStabile(adesso, prima?.gruppo, statoDal, ora)
      gruppiMostrati.current.set(p.id, { gruppo, statoDal, stato: adesso })
      const ad = p.sessionUuid !== undefined ? adottate.get(p.sessionUuid) : undefined
      const ruolo = sp !== undefined || ruoloDalTitolo(p.title) !== undefined
        ? RUOLI_ORDINE.find((k) => RUOLI[k].nome === (sp?.ruolo ?? ruoloDalTitolo(p.title)))
        : ad !== undefined ? ad.ruolo : ruoloDaContenuto(p.title)
      const dellAutopilota = sp !== undefined || p.autopilota !== undefined
      const vive = p.ptyId !== undefined ? righeDiPty(p.ptyId, 30)?.pulite ?? righe.current.codaDi(p.ptyId) : []
      fuori.push({
        // Uno specialista si riconosce dal compito: due «Revisione · Prova squadra» erano due schede uguali (prova del 16/10).
        id: p.id, paneId: p.id, titolo: sp !== undefined && sp.compito !== '' ? sp.compito : p.title, stato: gruppo,
        nataIl: sp !== undefined ? numero(sp.id) : nateIl.current.get(p.id) ?? ora,
        ...(ruolo !== undefined ? { ruolo, nomeRuolo: RUOLI[ruolo].nome, coloreRuolo: RUOLI[ruolo].colore } : {}),
        ultimaAzione: sp !== undefined && sp.ultimaAzione !== '' ? sp.ultimaAzione : ultimaAzioneDalVivo(vive),
        righe: righeDalVivo(vive, 6),
        dal: statoDal,
        ...(chiedono.has(p.id) ? { domanda: true } : {}),
        ...(p.remoto !== undefined ? { suPc: p.remoto.pcNome } : {}),
        ...(dellAutopilota ? { specialista: true } : {}),
        ...(p.sessionUuid !== undefined ? { sessione: p.sessionUuid } : {}),
        ...(p.sessionUuid !== undefined && mie.has(p.sessionUuid) ? { soloMia: true } : {})
      })
    }
    // Gli specialisti che hanno finito e chiuso la loro chat: schede «finite», senza riquadro.
    const aperte = new Set(Object.values(riquadriAperti).map((p) => p.sessionUuid))
    for (const x of specialisti) {
      if (x.chiusa !== true || (x.sessionId !== undefined && aperte.has(x.sessionId))) continue
      const ruolo = RUOLI_ORDINE.find((k) => RUOLI[k].nome === x.ruolo)
      fuori.push({
        id: `fine-${x.id}`, titolo: x.compito, stato: 'finita', nataIl: numero(x.id), specialista: true,
        ...(ruolo !== undefined ? { ruolo, nomeRuolo: RUOLI[ruolo].nome, coloreRuolo: RUOLI[ruolo].colore } : {}),
        ultimaAzione: x.ultimaAzione, righe: []
      })
    }
    return numeraUguali(fuori)
  })()
  const vaiLinguetta = (id: string): void => {
    setLinguettaPerWs((m) => (m[workspace.attivo] === id ? m : { ...m, [workspace.attivo]: id }))
    if (id !== PANORAMICA) setDavantiScelto(id)
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--fondo)' }}>
      {/* Le domande non hanno piu' una finestra sopra tutto (0.37.2, decisione
          di Nicholas): si aprono sempre nella colonna Domande a fianco delle
          chat, che si apre da sola per una domanda nuova (vedi sotto). */}

      {/* La finestra delle note: dal menu («Novità») o da «Installa». */}
      {finestraNote?.tipo === 'novita' ? (
        <ModaleNote
          titolo="Cosa c’è di nuovo"
          sotto={`versione installata ${finestraNote.versione}${finestraNote.note.length > 1 ? `, con le ${finestraNote.note.length - 1} prima` : ''}`}
          note={finestraNote.note}
          etichetta={(n, i) => (i === 0 ? `Questa versione · ${n.versione}` : `Versione ${n.versione}`)}
          tasti={<button className="tasto tasto--primario" autoFocus onClick={() => setFinestraNote(undefined)}>Ho capito</button>}
          onChiudi={() => setFinestraNote(undefined)}
        />
      ) : null}
      {finestraNote?.tipo === 'installa' ? (
        <ModaleNote
          titolo={`Cosa cambia con la ${finestraNote.versione}`}
          sotto={finestraNote.dati === undefined
            ? 'leggo le note…'
            : finestraNote.dati.note.length > 1
              ? `dalla ${finestraNote.dati.installata} che hai adesso: ${finestraNote.dati.note.length} versioni, la nuova e quelle che avevi saltato`
              : finestraNote.dati.installata !== '' ? `adesso hai la ${finestraNote.dati.installata}` : undefined}
          note={finestraNote.dati?.note}
          etichetta={(n, i) => (i === 0 && n.versione === finestraNote.versione ? `La nuova · ${n.versione}` : `Saltata · ${n.versione}`)}
          {...(() => {
            // Un tentativo andato male si dice anche qui, prima di riprovare (0.39.2).
            const f = aggiornamento.tentativoFallito
            const avvisi = [
              ...(f !== undefined ? [`**${f.titolo}** ${f.motivo} Se non va di nuovo, scaricala a mano da ${f.pagina}`] : []),
              ...(finestraNote.dati?.avviso !== undefined ? [finestraNote.dati.avviso] : [])
            ]
            return avvisi.length > 0 ? { avviso: avvisi.join(' ') } : {}
          })()}
          spiegazione={
            <>
              <b>Installa e riavvia</b>: aspetto che le chat finiscano quello che hanno in mano (e il lavoro con il
              Drive, se ce n’è), le avviso, chiudo SierraDeck, installo e riparto da solo; al ritorno chat e
              autopiloti riprendono da dove erano. <b>Più tardi</b>: chiudo questa finestra e nella striscia in alto
              resta «Installa»: si installa solo quando lo premi tu.
            </>
          }
          tasti={
            <>
              <button className="tasto" onClick={() => setFinestraNote(undefined)}>Più tardi</button>
              <button
                className="tasto tasto--primario"
                autoFocus
                onClick={() => { setFinestraNote(undefined); void window.gestore.aggiornamenti.installa() }}
              >
                Installa e riavvia
              </button>
            </>
          }
          onChiudi={() => setFinestraNote(undefined)}
        />
      ) : null}

      {modale === 'sessioni' ? <ModaleSessioni onChiudi={() => setModale(undefined)} /> : null}
      {gestioneChat !== undefined ? <ModaleGestioneChat scheda={gestioneChat} onChiudi={() => setGestioneChat(undefined)} /> : null}
      <OspiteAzioniChat />
      {doveVive ? <ModaleDoveVive onChiudi={() => setDoveVive(false)} /> : null}
      {pannelloDrive ? <VistaProgetti onChiudi={() => setPannelloDrive(false)} /> : null}
      {modale === 'accesso' ? <ModaleAccesso onChiudi={() => setModale(undefined)} /> : null}
      {avvisoProgetto !== undefined ? (
        <ModaleTestimone avviso={avvisoProgetto} onChiudi={() => setAvvisoProgetto(undefined)} />
      ) : null}

      {modale === 'preparazione' ? (
        <ModalePreparazione
          onChiudi={() => setModale(undefined)}
          onPreparazione={setPreparazione}
        />
      ) : null}

      <Console
        onApriSessioni={() => setModale('sessioni')}
        aperto={aperto}
        onApri={setAperto}
        workspaceAttivo={workspace.attivo}
        workspaceNomi={workspace.nomi}
        onStatoWorkspace={aggiornaWorkspace}
        workspaceCheChiamano={workspaceChiamano}
        onApriNovita={apriNovita}
            aggiornamento={aggiornamento}
        ledAutopiloti={autopiloti.map((a) => ({ id: a.id, ...ledDi(a) }))}
        domandeInAttesa={domandeInAttesa}
        domandeAperte={colonnaDomande.aperta}
        onDomande={() => commutaColonna('domande')}
        progettiAperti={pannelloDrive}
        onProgetti={() => setPannelloDrive((a) => !a)}
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
      {/* 0.70.0: la ricerca automatica (ogni 10 minuti) non apre più la striscia: basta la spia «cerco…»
          accanto alla versione. La striscia resta quando la ricerca l'ha chiesta il telefono. */}
      {aggiornamento.fase === 'cerco' && aggiornamento.daTelefono === true ? (
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

      {/* Il lavoro con il Drive, le chat arrivate e il riavvio consigliato
          stanno nei fumetti in fondo alla pagina, fuori dal flusso: qui sopra
          non c'e' piu' niente che entri ed esca ogni cinque minuti. */}

      {/* L'attesa della quiete. Prima non aveva nessuna striscia: si premeva
          «Installa e riavvia» con una chat al lavoro e la striscia spariva per
          dieci minuti — e se la quiete non arrivava si tornava a «pronto» come
          se niente fosse, senza dire che non si era installato. */}
      {aggiornamento.fase === 'attendo' ? (
        <div className="avviso avviso--aggiornamento">
          <span className="led led--attesa" />
          {aggiornamento.attesaChat !== undefined && aggiornamento.attesa === undefined ? (
            <span>
              {aggiornamento.attesaChat.charAt(0).toUpperCase() + aggiornamento.attesaChat.slice(1)} — poi installo la {aggiornamento.versione ?? 'versione nuova'}.
              Gli autopiloti finiscono il turno e si fermano (al massimo 5 minuti, poi salvo il loro lavoro e
              installo); dopo il riavvio riprendono da soli.
            </span>
          ) : aggiornamento.attesa !== undefined ? (
            <span>
              Aspetto che finisca {aggiornamento.attesa}, poi installo la {aggiornamento.versione ?? 'versione nuova'}.
              Un lavoro automatico (l’arrivo delle chat, il salvataggio dei cinque minuti) lo annullo io e si rifà
              da solo al prossimo giro; uno che hai chiesto tu lo lascio finire. Se non si ferma in tempo, non
              installo e te lo dico qui.
            </span>
          ) : (
            <span>
              Aspetto che {aggiornamento.chatOccupate === 1
                ? 'una chat finisca quello che ha in mano'
                : `${aggiornamento.chatOccupate ?? 0} chat finiscano quello che hanno in mano`}, poi installo
              la {aggiornamento.versione ?? 'versione nuova'}. Una chat «lavora» se il suo terminale è acceso e
              non sta aspettando te. Ho già scritto in ognuna di fermarsi a fine turno e ho messo in pausa gli
              autopiloti. Al massimo 5 minuti: poi salvo il loro lavoro con un commit sul loro ramo e
              installo lo stesso. Non chiudere le chat a mano: l’installazione parte da sola.
            </span>
          )}
          {/* 0.84.3: le fasi con il tempo, la stessa riga di pagina e app. */}
          {aggiornamento.fasiTesto !== undefined && aggiornamento.fasiTesto !== '' ? (
            <span className="avviso__fasi">{aggiornamento.fasiTesto}.</span>
          ) : null}
          <span style={{ flex: 1 }} />
          {/* 0.84.1: senza aspettare la fine dei turni. Il lavoro delle chat si
              salva con un commit sul loro ramo e al ritorno riprendono da lì. */}
          {aggiornamento.subito === true ? (
            <span>Salvo il lavoro delle chat e installo subito…</span>
          ) : (
            <button
              className="tasto"
              title="Non aspetto che le chat finiscano il turno: salvo il loro lavoro sul loro ramo, le metto in pausa e installo adesso. Dopo il riavvio riprendono da sole."
              onClick={() => void window.gestore.aggiornamenti.aggiornaAdesso()}
            >
              Aggiorna adesso
            </button>
          )}
        </div>
      ) : null}

      {driveScollegato !== undefined && (driveScollegato.chiave === undefined || driveScollegato.chiave !== driveChiuso) ? (
        <div className="avviso avviso--drive avviso--riga" role="status">
          <span className="led led--attesa" />
          <span className="avviso-riga__testo">
            {driveScollegato.breve ?? driveScollegato.titolo}
            {drivePerche ? <span className="avviso-riga__perche">{driveScollegato.testo}</span> : null}
          </span>
          <button className="tasto" onClick={() => setDrivePerche((x) => !x)} title="La spiegazione intera: cosa è successo e cosa non funziona finché resta scollegato">
            {drivePerche ? 'Meno' : 'Perché?'}
          </button>
          <button
            className="tasto tasto--primario"
            onClick={() => { setSchedaImpostazioni('account'); setAperto('impostazioni') }}
            title="Apre Impostazioni → Account: lì «Collega» apre il browser per il consenso di Google"
          >
            Ricollega il Drive
          </button>
          {driveScollegato.chiave !== undefined ? (
            <button
              className="tasto"
              onClick={() => chiudiDrive(driveScollegato.chiave as string)}
              title="Nasconde questa riga. Ricompare solo se il Drive si scollega un’altra volta; lo stato resta comunque in Impostazioni → Account"
              aria-label="Chiudi l’avviso del Drive"
            >
              ×
            </button>
          ) : null}
        </div>
      ) : null}

      {/* L'ultima installazione non e' riuscita (0.39.2): si dice prima di
          tutto, con il perche' e le strade, invece di riproporre «Installa»
          come se fosse la prima volta. */}
      {aggiornamento.tentativoFallito !== undefined && !fallitoChiuso && aggiornamento.fase !== 'installo' && aggiornamento.fase !== 'attendo' ? (
        <div className="avviso avviso--aggiornamento avviso--fallito" role="alert">
          <span className="led led--attesa" />
          <span className="avviso-fallito__testo">
            <b>{aggiornamento.tentativoFallito.titolo}</b> {aggiornamento.tentativoFallito.motivo}
            <span className="avviso-fallito__strade">
              Cosa puoi fare: {aggiornamento.tentativoFallito.strade.map((x, i) => <span key={i}>{i + 1}. {x} </span>)}
            </span>
          </span>
          <button
            className="tasto"
            onClick={() => void window.gestore.sistema.apriEsterno(aggiornamento.tentativoFallito!.pagina)}
            title={aggiornamento.tentativoFallito.pagina}
          >
            Scarica a mano
          </button>
          {aggiornamento.fase === 'pronto' ? (
            <button className="tasto tasto--primario" onClick={() => apriInstalla(aggiornamento.versione ?? '')}>Riprova</button>
          ) : null}
          <button className="tasto" onClick={() => setFallitoChiuso(true)} title="Nascondi fino al prossimo avvio">×</button>
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
                {/* Perche' non si e' installata l'ultima volta: senza questa riga
                    il tasto tornava com'era e nessuno sapeva che non era
                    successo niente. */}
                {aggiornamento.errore !== undefined ? <><b>{aggiornamento.errore}</b>{' '}</> : null}
                La versione {aggiornamento.versione} è pronta. «Installa» ti fa vedere prima cosa cambia;
                da lì scegli se installarla adesso. Si installa solo quando lo premi tu.
              </span>
              {/* Dalla 0.39.0 nessuna installazione parte da qui: il tasto
                  apre la finestra con le note, e lì c'è «Installa e riavvia». */}
              <button
                className="tasto tasto--primario"
                onClick={() => apriInstalla(aggiornamento.versione ?? '')}
              >
                Installa
              </button>
            </>
          )}
          <span style={{ flex: 1 }} />
          <button className="tasto" onClick={() => setAggiornamento({ fase: 'fermo' })} title="Più tardi">
            ×
          </button>
        </div>
      ) : null}

      {inAttesaDiQuiete.length > 0 ? (
        // Le stesse bande degli avvisi (0.72.0): un autopilota che aspetta che smetti di scrivere.
        <div className="banda" role="status">
          {inAttesaDiQuiete.map((c) => (
            <div key={c.id} className="banda__voce banda__voce--attenzione">
              <span className="led led--attesa" />
              <span className="banda__testo" title={rigaInAttesa(c)}>{rigaInAttesa(c)}</span>
              <button className="tasto" onClick={() => portaConsegnaRef.current(c, true)} title="Porta adesso la finestra nel suo workspace: la chat riceve il messaggio e la vedi lavorare">Guarda</button>
            </div>
          ))}
        </div>
      ) : null}
      {migrazione !== null && (migrazione.stato === 'fallita' || migrazione.stato === 'fatta') && !avvisiChiusi.includes(`migrazione:${migrazione.iniziata}`) ? (
        // La trasformazione dei workspace (0.74.1): detta una volta, con il modo di tornare indietro.
        <div className="banda" role="status">
          <div className={`banda__voce banda__voce--${migrazione.stato === 'fallita' ? 'blocco' : 'attenzione'}`}>
            <span className={`led ${migrazione.stato === 'fallita' ? 'led--fermo' : 'led--attesa'}`} />
            <span className="banda__testo" title={migrazione.motivo ?? ''}>
              {notaMigrazione ?? (migrazione.stato === 'fallita'
                ? `La trasformazione dei workspace non è riuscita, quindi è tutto com’era prima: ${migrazione.motivo ?? 'motivo nel registro'}.`
                : `Tutti i workspace di questo PC hanno la Panoramica, ognuno con il suo autopilota (fermo finché non gli scrivi). Le chat sono rimaste com’erano.`)}
            </span>
            {migrazione.stato === 'fatta' ? (
              <button className="tasto" title="Rimette i workspace esattamente come prima. Le chat non si toccano." onClick={() => { void window.gestore.migrazione.torna().then((e) => setNotaMigrazione(e.messaggio)).catch(() => undefined) }}>Torna come prima</button>
            ) : (
              <button className="tasto" title="Riprova a trasformare i workspace" onClick={() => { void window.gestore.migrazione.rifai().then((e) => setNotaMigrazione(e.messaggio)).catch(() => undefined) }}>Riprova</button>
            )}
            <button className="tasto" title="Toglie questo avviso. «Torna come prima» resta in Impostazioni → Chat e autopiloti" onClick={() => chiudiAvviso([`migrazione:${migrazione.iniziata}`])}>Chiudi</button>
          </div>
        </div>
      ) : null}
      <BandaRiassetto />
      <BandaAvvisi
        avvisi={componiAvvisi({
          accesso,
          servizioRaggiungibile: erroreAutopiloti === undefined,
          autopiloti,
          ...(preparazione !== undefined ? { preparazione } : {}),
          chiusi: avvisiChiusi,
          ...(cassaforte !== undefined ? { cassaforte } : {})
        })}
        onChiudi={chiudiAvviso}
        onAzione={(azione) => {
          if (azione === 'riavviaServizio') ricaricaAutopiloti()
          else if (azione === 'apriAutopiloti') setAperto('autopiloti')
          else if (azione === 'apriAccesso') setModale('accesso')
          else if (azione === 'apriPreparazione') setModale('preparazione')
          else if (azione === 'apriAccount') window.dispatchEvent(new Event('sierradeck:apri-account'))
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
          <PannelloImpostazioni onChiudi={() => { setAperto(undefined); setSchedaImpostazioni('generali') }} tabIniziale={schedaImpostazioni} />
        ) : null}
        {aperto === 'chat' ? (
          <PannelloChat
            workspace={workspace}
            onApriSessioni={() => setModale('sessioni')}
            onApri={setAperto}
            onChiudi={() => setAperto(undefined)}
          />
        ) : null}
        {aperto === 'salute' ? (
          <PannelloSalute
            onChiudi={() => setAperto(undefined)}
            onApriDrive={() => { setSchedaImpostazioni('account'); setAperto('impostazioni') }}
            onInstalla={() => apriInstalla(aggiornamento.versione ?? '')}
            onApriAutopiloti={() => setAperto('autopiloti')}
            suiConsumi={saluteSuConsumi}
          />
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
            cwd={quadernoDi ?? cartellaDavanti()}
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
            cwdAttivo={cartellaDavanti()}
          />
        ) : null}

        <div style={{ flex: 1, display: 'flex', minWidth: 0, position: 'relative', paddingTop: 38 }}>
          {/* La vista a elenco (0.74.0) è **solo** una colonna in più a sinistra.
              Il mosaico resta sempre in questo stesso posto dell'albero: in un
              ramo diverso React lo smonterebbe passando da elenco a mosaico (e
              con «Torna come prima»), e ogni terminale smontato chiude il suo
              claude.exe. Visto nella copia dei dati veri il 15/10: i PID delle
              chat cambiavano. Qui non cambiano più. */}
          {/* La barra delle linguette (0.77.0), al posto dell'elenco: Panoramica e una linguetta per chat. */}
          {vistaElenco !== undefined ? (
            <BarraLinguette
              schede={schedePanoramica}
              linguetta={linguetta}
              onLinguetta={vaiLinguetta}
              colonna={colonnaAutopilota}
              onColonna={setColonnaAutopilota}
              conAutopilota={autopilotaFisso !== undefined}
              onMosaico={() => impostaElenco(workspace.attivo, false)}
            />
          ) : (
            // Tutte le chat affiancate (0.78.1): la stessa barra in alto, con l'interruttore per tornare alla Panoramica.
            <BarraAffiancate
              onPanoramica={() => { setLinguettaPerWs((m) => ({ ...m, [workspace.attivo]: PANORAMICA })); impostaElenco(workspace.attivo, true) }}
              colonna={colonnaAutopilota}
              onColonna={setColonnaAutopilota}
              conAutopilota={autopilotaFisso !== undefined}
            />
          )}
          {/* La colonna sottile dell'autopilota, sulle linguette delle chat e fra le chat affiancate: si apre e si chiude. */}
          {autopilotaFisso !== undefined && colonnaAutopilota && (vistaElenco === undefined || linguetta !== PANORAMICA) ? (
            <aside className="pan-colonna" aria-label="L’autopilota"><ChatAutopilota key={autopilotaFisso.id} autopilota={autopilotaFisso} onCambiato={ricaricaAutopiloti} /></aside>
          ) : null}
          {root ? (
            <Mosaic
              node={root}
              pensano={pensano}
              chiedono={chiedono}
              {...(vistaElenco?.davanti !== undefined ? { solo: vistaElenco.davanti } : {})}
            />
          ) : vistaElenco !== undefined ? (
            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--testo-quieto)', fontSize: 13 }}>
              Nessuna chat aperta: l’autopilota apre le sue quando parte.
            </div>
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
          {/* La Panoramica (0.77.0): sopra i terminali, che restano montati e della stessa misura. */}
          {vistaElenco !== undefined && linguetta === PANORAMICA ? (
            <CorpoPanoramica
              key={workspace.attivo}
              workspace={workspace.attivo}
              {...(autopilotaFisso !== undefined ? { autopilota: autopilotaFisso } : {})}
              {...(migrazione !== null && migrazione.stato === 'fatta' && migrazione.dormienti.some((d) => d.workspace === workspace.attivo)
                ? { dormiente: migrazione.dormienti.find((d) => d.workspace === workspace.attivo)! }
                : {})}
              {...(Object.values(riquadriAperti)[0]?.cwd !== undefined ? { cwd: Object.values(riquadriAperti)[0]!.cwd } : {})}
              schede={schedePanoramica}
              onSoloMia={(s, si) => {
                if (s.sessione === undefined) return
                const sessione = s.sessione
                // Nelle preferenze, che valgono anche prima che l'autopilota nasca; e nel suo file, se l'ha adottata.
                setChatSoloMie((l) => (si ? [...new Set([...l, sessione])] : l.filter((x) => x !== sessione)))
                void window.gestore.preferenze.leggi()
                  .then((p) => window.gestore.preferenze.imposta({ ...p, chatSoloMie: si ? [...new Set([...(p.chatSoloMie ?? []), sessione])] : (p.chatSoloMie ?? []).filter((x) => x !== sessione) }))
                  .catch(() => undefined)
                if (autopilotaFisso !== undefined && (autopilotaFisso.adottate ?? []).some((x) => x.sessionId === sessione)) {
                  void window.gestore.adozione.soloMia(autopilotaFisso.id, sessione, si).then(() => ricaricaAutopiloti()).catch(() => undefined)
                }
              }}
              onApri={vaiLinguetta}
              onRicarica={ricaricaAutopiloti}
            />
          ) : null}
        </div>
        {/* Le Domande: una colonna fissa accanto alle chat, come nell'app
            Android. Resta aperta mentre si lavora. Dal 30/10 è l'unico posto
            delle domande, anche di quelle dell'autopilota del workspace. */}
        {colonnaDomande.aperta ? (
          <PannelloDomande
            larghezza={colonnaDomande.larghezza}
            onLarghezza={(px) => salvaColonnaDomande({ larghezza: px })}
            onChiudi={() => salvaColonnaDomande({ aperta: false })}
            onConteggio={setDomandeInAttesa}
            {...(evidenzaDomanda !== undefined ? { evidenza: evidenzaDomanda } : {})}
          />
        ) : null}
      </div>
      <Fumetti>
        {fumettiDrive.lavoro !== undefined && lavoroDrive.inCorso !== undefined ? (
          <FumettoLavoroDrive key={lavoroDrive.inCorso.avviato} iniziale={lavoroDrive.inCorso} pillola={fumettiDrive.lavoro === 'pillola'} />
        ) : null}
        {fumettiDrive.esito !== undefined ? (
          <Fumetto tono={fumettiDrive.esito.esito === 'errore' ? 'errore' : fumettiDrive.esito.esito === 'annullato' ? 'attesa' : 'ok'}>
            <span className={`led ${fumettiDrive.esito.esito === 'errore' ? 'led--fermo' : fumettiDrive.esito.esito === 'annullato' ? 'led--attesa' : 'led--lavoro'}`} />
            <span className="fumetto__testo">
              <b>{ETICHETTA_LAVORO_TIPO[fumettiDrive.esito.tipo]}</b>:{' '}
              {fumettiDrive.esito.esito === 'ok' ? 'fatto' : fumettiDrive.esito.esito === 'annullato' ? 'annullato' : 'non riuscito'}
              {fumettiDrive.esito.messaggio !== '' ? ` — ${fumettiDrive.esito.messaggio}` : ''}
            </span>
            <button className="tasto tasto--mini" onClick={() => setEsitoLavoroVisto(lavoroDrive.ultimo?.quando)} title="Chiudi">×</button>
          </Fumetto>
        ) : null}
        {chatArrivate !== undefined ? (
          <Fumetto tono="ok">
            <span className="led led--lavoro" />
            <span className="fumetto__testo">
              <b>{chatArrivate.quante} {chatArrivate.quante === 1 ? 'chat arrivata' : 'chat arrivate'} dal Drive</b>
              {' '}({(ETICHETTA_LAVORO_TIPO as Record<string, string>)[chatArrivate.tipo] ?? chatArrivate.tipo}).
              {' '}{chatArrivate.quante === 1 ? 'È già nell’elenco Chat' : 'Sono già nell’elenco Chat'}
              {chatArrivate.rimappate > 0 ? ` (${chatArrivate.rimappate} ${chatArrivate.rimappate === 1 ? 'spostata' : 'spostate'} nella cartella di qui)` : ''}.
              {' '}Le trovi anche in ▦ Progetti, con il PC dove vivono.
            </span>
            <button className="tasto tasto--mini" onClick={() => { setChatArrivate(undefined); setModale('sessioni') }} title="L’elenco di tutte le chat, per cartella">Elenco</button>
            <button className="tasto tasto--mini" onClick={() => setChatArrivate(undefined)} title="Chiudi">×</button>
          </Fumetto>
        ) : null}
        {riavvioFra !== undefined && lavoroDrive.ultimo !== undefined ? (
          <Fumetto tono="attesa">
            <span className="led led--lavoro" />
            <span className="fumetto__testo">
              <b>Sono arrivate chat o cartelle dal Drive.</b> Per vederle nei loro workspace il programma si riavvia fra <b>{riavvioFra}</b> s: prima aspetta che le chat aperte finiscano il turno, e al ritorno le chat riprendono da sole.
            </span>
            <button className="tasto tasto--primario tasto--mini" onClick={() => setRiavvioFra(0)}>Riavvia ora</button>
            <button className="tasto tasto--mini" onClick={() => { setRiavvioRinviato(lavoroDrive.ultimo?.quando); setRiavvioFra(undefined) }} title="Le chat arrivate compariranno al prossimo riavvio">Più tardi</button>
          </Fumetto>
        ) : riavvioEsito !== undefined ? (
          <Fumetto tono="attesa">
            <span className="led led--attesa" />
            <span className="fumetto__testo">{riavvioEsito}</span>
            <button className="tasto tasto--mini" onClick={() => setRiavvioEsito(undefined)}>×</button>
          </Fumetto>
        ) : null}
        {avvisoConsumi !== undefined ? (
          <Fumetto tono={avvisoConsumi.tono}>
            <span className={`led ${avvisoConsumi.tono === 'errore' ? 'led--fermo' : 'led--attesa'}`} />
            <span className="fumetto__testo">
              {avvisoConsumi.testo}{' '}
              <button className="collegamento" onClick={() => { setAvvisoConsumi(undefined); setSaluteSuConsumi(true); setAperto('salute') }} title="Consumi e limiti, in ♥ Salute">Consumi</button>
            </span>
            <button className="tasto tasto--mini" onClick={() => setAvvisoConsumi(undefined)} title="Chiudi">×</button>
          </Fumetto>
        ) : null}
      </Fumetti>
    </div>
  )
}

/** La schermata d'avvio con l'avanzamento dell'indice: si abbona lei, non tutta l'App. */
function SchermataAvvioConAvanzamento(): React.JSX.Element {
  const progress = useSessionStore((s) => s.progress)
  return <SchermataAvvio avanzamento={progress} />
}
