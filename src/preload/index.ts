import { clipboard, contextBridge, ipcRenderer } from 'electron'
import type { HostToCore } from '@shared/protocol'
import type { Avanzamento, IndexOutcome, SessionSummary } from '@shared/types'
import type { LayoutSalvato, PaneSalvato } from '@shared/workspace'
import type { Scheda } from '@shared/quaderno'
import type { Preferenze } from '@shared/preferenze'
import type { Autopilota } from '@shared/autopilota'
import type { StatoWorkspace } from '../main/ipc'
import type { Istantanea } from '@shared/istantanea'
import type { NuovoAutopilota, DomandaAperta } from '../main/autopilot-client'
import type { StatoAccesso } from '../main/accesso'
import type { StatoPreparazione } from '../main/preparazione'
import type { Novita } from '@shared/novita'
import type { Consumi } from '@shared/consumi'
import type { Anteprima } from '../main/anteprima'
import type { StatoAggiornamento } from '../main/aggiornamenti'
import type { SpawnRequest } from '../main/validation'

// `env` non e' piu' esposto: GESTORE_CLAUDE_PATH serviva al renderer solo per
// scegliere l'eseguibile da lanciare, decisione che ora vive nel Core. Il ponte
// espone la stessa funzionalita' con una variabile d'ambiente in meno.
contextBridge.exposeInMainWorld('gestore', {
  pty: {
    spawn: (req: SpawnRequest): Promise<string> => ipcRenderer.invoke('pty:spawn', req),
    write: (id: string, data: string): void => ipcRenderer.send('pty:write', id, data),
    resize: (id: string, cols: number, rows: number): void =>
      ipcRenderer.send('pty:resize', id, cols, rows),
    kill: (id: string): void => ipcRenderer.send('pty:kill', id),
    attach: (id: string): void => ipcRenderer.send('pty:attach', id),
    onEvent: (cb: (msg: HostToCore) => void): (() => void) => {
      const h = (_e: unknown, msg: HostToCore): void => cb(msg)
      ipcRenderer.on('pty:evento', h)
      return () => ipcRenderer.off('pty:evento', h)
    }
  },
  sessions: {
    list: (opts?: { projectSlug?: string; limit?: number }): Promise<SessionSummary[]> =>
      ipcRenderer.invoke('sessioni:lista', opts ?? {}),
    reindex: (): Promise<IndexOutcome> =>
      ipcRenderer.invoke('sessioni:reindicizza'),
    consumi: (): Promise<Consumi> => ipcRenderer.invoke('sessioni:consumi'),
    stato: (): Promise<{ inCorso: boolean; avanzamento?: Avanzamento }> =>
      ipcRenderer.invoke('sessioni:stato'),
    /**
     * Con il solo percorso: l'assaggio di una conversazione dall'elenco.
     * Con cartella e id di sessione: cosa sta facendo adesso una chat che gira
     * per conto di un autopilota.
     */
    anteprima: (percorsoOCwd: string, sessionId?: string): Promise<Anteprima> =>
      ipcRenderer.invoke('sessioni:anteprima', percorsoOCwd, sessionId),
    elimina: (percorsi: string[]): Promise<{ eliminate: number; errori: string[] }> =>
      ipcRenderer.invoke('sessioni:elimina', percorsi),
    onProgress: (cb: (p: Avanzamento) => void): (() => void) => {
      const h = (_e: unknown, p: Avanzamento): void => cb(p)
      ipcRenderer.on('sessioni:avanzamento', h)
      return () => ipcRenderer.off('sessioni:avanzamento', h)
    },
    onOutcome: (cb: (e: IndexOutcome) => void): (() => void) => {
      const h = (_e: unknown, esito: IndexOutcome): void => cb(esito)
      ipcRenderer.on('sessioni:esito', h)
      return () => ipcRenderer.off('sessioni:esito', h)
    }
  },
  /**
   * La parola d'ordine, per chi la vuole. Il renderer non riceve mai un segno:
   * chiede se una parola va bene e ottiene sì o no.
   */
  /** Il quaderno della cartella di lavoro: cosa e' stato fatto, in schede. */
  /** Colori, porte e comportamenti scelti dall'utente. */
  preferenze: {
    leggi: (): Promise<Preferenze> => ipcRenderer.invoke('preferenze:leggi'),
    imposta: (p: Preferenze): Promise<Preferenze> => ipcRenderer.invoke('preferenze:imposta', p),
    suCambio: (cb: (p: Preferenze) => void): (() => void) => {
      const h = (_e: unknown, p: Preferenze): void => cb(p)
      ipcRenderer.on('preferenze:cambiate', h)
      return () => { ipcRenderer.off('preferenze:cambiate', h) }
    }
  },
  quaderno: {
    elenca: (cwd: string): Promise<Scheda[]> => ipcRenderer.invoke('quaderno:elenca', cwd),
    leggi: (cwd: string, file: string): Promise<Scheda | undefined> =>
      ipcRenderer.invoke('quaderno:leggi', cwd, file),
    scrivi: (cwd: string, scheda: { titolo: string; corpo: string; tag?: string[]; file?: string }): Promise<Scheda> =>
      ipcRenderer.invoke('quaderno:scrivi', cwd, scheda),
    /** Apre la cartella delle schede in Esplora risorse. */
    apri: (cwd: string): Promise<void> => ipcRenderer.invoke('quaderno:apri', cwd)
  },
  chiavi: {
    stato: (): Promise<{ allAvvio: boolean; workspace: string[] }> =>
      ipcRenderer.invoke('chiavi:stato'),
    impostaAvvio: (parola: string): Promise<{ allAvvio: boolean; workspace: string[] }> =>
      ipcRenderer.invoke('chiavi:impostaAvvio', parola),
    impostaWorkspace: (nome: string, parola: string): Promise<{ allAvvio: boolean; workspace: string[] }> =>
      ipcRenderer.invoke('chiavi:impostaWorkspace', nome, parola),
    verifica: (parola: string, workspace?: string): Promise<boolean> =>
      ipcRenderer.invoke('chiavi:verifica', parola, workspace)
  },
  sistema: {
    cartellaUtente: (): Promise<string> => ipcRenderer.invoke('sistema:cartellaUtente'),
    versione: (): Promise<string> => ipcRenderer.invoke('sistema:versione'),
    cartellaScambio: (): Promise<string> => ipcRenderer.invoke('sistema:cartellaScambio'),
    apriScambio: (): Promise<string> => ipcRenderer.invoke('sistema:apriScambio'),
    /**
     * Quanti autopiloti stanno lavorando, per il testo dell'icona nell'area di
     * notifica. Lo sa il renderer, che li interroga già ogni pochi secondi: un
     * secondo giro di domande dal Core costerebbe più di quanto vale.
     */
    autopilotiAlLavoro: (quanti: number): void =>
      ipcRenderer.send('area:autopiloti', quanti),
    /** La finestra di Windows per scegliere una cartella. */
    scegliCartella: (): Promise<string | undefined> =>
      ipcRenderer.invoke('sistema:scegliCartella'),
    cartellaEsiste: (percorso: string): Promise<boolean> =>
      ipcRenderer.invoke('sistema:cartellaEsiste', percorso),
    /**
     * Il sottotitolo della barra del titolo: la versione e dove ti trovi.
     *
     * Lo manda il renderer perche' e' lui a sapere quale workspace ha davanti:
     * il Core conosce l'attivo dell'applicazione, ma il titolo appartiene alla
     * finestra che lo scrive.
     */
    titoloFinestra: (testo: string): void => ipcRenderer.send('finestra:titolo', testo)
  },
  aggiornamenti: {
    stato: (): Promise<StatoAggiornamento> => ipcRenderer.invoke('aggiornamenti:stato'),
    cerca: (): Promise<void> => ipcRenderer.invoke('aggiornamenti:cerca'),
    scarica: (): Promise<void> => ipcRenderer.invoke('aggiornamenti:scarica'),
    installa: (): Promise<void> => ipcRenderer.invoke('aggiornamenti:installa'),
    suStato: (cb: (s: StatoAggiornamento) => void): (() => void) => {
      const h = (_e: unknown, s: StatoAggiornamento): void => cb(s)
      ipcRenderer.on('aggiornamenti:stato', h)
      return () => ipcRenderer.off('aggiornamenti:stato', h)
    }
  },
  provider: {
    leggi: (): Promise<{ attivo: boolean; baseUrl: string; modello: string; haToken: boolean }> =>
      ipcRenderer.invoke('provider:leggi'),
    imposta: (p: {
      attivo: boolean
      baseUrl: string
      token: string
      modello: string
      togliToken?: boolean
    }): Promise<{ attivo: boolean; baseUrl: string; modello: string; haToken: boolean }> =>
      ipcRenderer.invoke('provider:imposta', p)
  },
  etichette: {
    leggi: (): Promise<Record<string, string>> => ipcRenderer.invoke('etichette:leggi'),
    imposta: (uuid: string, testo: string): Promise<Record<string, string>> =>
      ipcRenderer.invoke('etichette:imposta', uuid, testo)
  },
  layout: {
    carica: (): Promise<LayoutSalvato> => ipcRenderer.invoke('layout:carica'),
    salva: (l: LayoutSalvato): void => ipcRenderer.send('layout:salva', l),
    /**
     * Il Core chiede a questa finestra com'è disposta adesso: succede quando si
     * salva una sessione, che deve contenere **tutte** le finestre e non solo
     * quella da cui si è premuto il tasto.
     */
    suRichiesta: (dai: () => LayoutSalvato): (() => void) => {
      const h = (_e: unknown, id: number): void => ipcRenderer.send('layout:consegna', id, dai())
      ipcRenderer.on('layout:richiedi', h)
      return () => ipcRenderer.off('layout:richiedi', h)
    }
  },
  finestre: {
    nuova: (): void => ipcRenderer.send('finestre:nuova'),
    elenco: (): Promise<{ id: number; titolo: string }[]> =>
      ipcRenderer.invoke('finestre:elenco'),
    sposta: (pane: PaneSalvato, finestraId: number): Promise<boolean> =>
      ipcRenderer.invoke('finestre:sposta', pane, finestraId),
    onRiquadroInArrivo: (cb: (pane: PaneSalvato) => void): (() => void) => {
      const h = (_e: unknown, pane: PaneSalvato): void => cb(pane)
      ipcRenderer.on('layout:riquadroInArrivo', h)
      return () => ipcRenderer.off('layout:riquadroInArrivo', h)
    }
  },
  accesso: {
    stato: (): Promise<StatoAccesso> => ipcRenderer.invoke('accesso:stato')
  },
  novita: {
    /**
     * Le novità di questa versione, se non sono già state lette.
     *
     * Chiederle è anche dichiarare di averle viste: il segno lo mette il Core,
     * perché con due finestre aperte comparirebbero in entrambe.
     */
    daMostrare: (): Promise<Novita | undefined> => ipcRenderer.invoke('novita:daMostrare')
  },
  preparazione: {
    stato: (): Promise<StatoPreparazione> => ipcRenderer.invoke('preparazione:stato'),
    /** Apre un terminale che installa Claude Code e restituisce il suo id. */
    installa: (): Promise<string> => ipcRenderer.invoke('preparazione:installa'),
    /** Apre un terminale che porta all'accesso nel browser. */
    accedi: (): Promise<string> => ipcRenderer.invoke('preparazione:accedi')
  },
  autopilota: {
    elenca: (): Promise<Autopilota[]> => ipcRenderer.invoke('autopilota:elenca'),
    crea: (p: NuovoAutopilota): Promise<Autopilota> => ipcRenderer.invoke('autopilota:crea', p),
    ferma: (id: string): Promise<void> => ipcRenderer.invoke('autopilota:ferma', id),
    riprendi: (id: string): Promise<void> => ipcRenderer.invoke('autopilota:riprendi', id),
    /** Se questo autopilota debba ripartire da solo dopo un riavvio del PC. */
    riprendiAlRiavvio: (id: string, riprendi: boolean): Promise<void> =>
      ipcRenderer.invoke('autopilota:riprendiAlRiavvio', id, riprendi),
    elimina: (id: string): Promise<void> => ipcRenderer.invoke('autopilota:elimina', id),
    domande: (): Promise<DomandaAperta[]> => ipcRenderer.invoke('autopilota:domande'),
    rispondi: (idDomanda: string, risposta: string): Promise<void> =>
      ipcRenderer.invoke('autopilota:rispondi', idDomanda, risposta),
    avvioAlLogin: (attivare?: boolean): Promise<{ installato: boolean; percorso: string }> =>
      ipcRenderer.invoke('autopilota:avvioAlLogin', attivare)
  },
  istantanee: {
    elenca: (): Promise<Istantanea[]> => ipcRenderer.invoke('istantanee:elenca'),
    salva: (nome: string, layout: LayoutSalvato, conAutopiloti: boolean): Promise<Istantanea[]> =>
      ipcRenderer.invoke('istantanee:salva', nome, layout, conAutopiloti),
    carica: (nome: string): Promise<LayoutSalvato> => ipcRenderer.invoke('istantanee:carica', nome),
    elimina: (nome: string): Promise<Istantanea[]> => ipcRenderer.invoke('istantanee:elimina', nome)
  },
  workspace: {
    stato: (): Promise<StatoWorkspace> => ipcRenderer.invoke('workspace:stato'),
    /** In quale workspace vive ogni chat: serve a dire da dove ti chiamano. */
    dove: (): Promise<Record<string, string>> => ipcRenderer.invoke('workspace:dove'),
    crea: (nome: string): Promise<StatoWorkspace> => ipcRenderer.invoke('workspace:crea', nome),
    elimina: (nome: string): Promise<StatoWorkspace> =>
      ipcRenderer.invoke('workspace:elimina', nome),
    cambia: (nome: string, layout: LayoutSalvato): Promise<LayoutSalvato> =>
      ipcRenderer.invoke('workspace:cambia', nome, layout),
    migra: (da: string, nome: string, layout: LayoutSalvato): Promise<LayoutSalvato> =>
      ipcRenderer.invoke('workspace:migra', da, nome, layout),
    /** Manda una chat in un workspace che non è aperto in nessuna finestra. */
    spostaChat: (nome: string, pane: PaneSalvato): Promise<boolean> =>
      ipcRenderer.invoke('workspace:spostaChat', nome, pane),
    onCambiato: (cb: (s: StatoWorkspace & { precedente: string }) => void): (() => void) => {
      const h = (_e: unknown, s: StatoWorkspace & { precedente: string }): void => cb(s)
      ipcRenderer.on('workspace:cambiato', h)
      return () => ipcRenderer.off('workspace:cambiato', h)
    }
  },
  // Gli appunti passano dal modulo `clipboard` di Electron e non da
  // `navigator.clipboard`: quest'ultimo, sotto file://, chiede un permesso che
  // nessuno concede e restituisce una promise rifiutata: l'incolla fallirebbe
  // in silenzio proprio nella build impacchettata, dove non c'e' una console
  // aperta a dirlo. Qui invece sono due chiamate sincrone, senza permessi.
  appunti: {
    leggi: (): string => clipboard.readText(),
    scrivi: (testo: string): void => clipboard.writeText(testo)
  }
})
