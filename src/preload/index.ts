import { clipboard, contextBridge, ipcRenderer } from 'electron'
import type { HostToCore } from '@shared/protocol'
import type { Avanzamento, IndexOutcome, SessionSummary } from '@shared/types'
import type { LayoutSalvato, PaneSalvato } from '@shared/workspace'
import type { Scheda } from '@shared/quaderno'
import type { Preferenze } from '@shared/preferenze'
import type { Autopilota } from '@shared/autopilota'
import type { StatoWorkspace } from '../main/ipc'
import type { Utente, EsitoAccesso } from '@shared/account'
import type { Istantanea } from '@shared/istantanea'
import type {
  NuovoAutopilota, DomandaAperta, CambioAutopilota, RispostaParlata
} from '../main/autopilot-client'
import type { StatoAccesso } from '../main/accesso'
import type { StatoPreparazione } from '../main/preparazione'
import type { Novita } from '@shared/novita'
import type { Consumi } from '@shared/consumi'
import type { Anteprima } from '../main/anteprima'
import type { StatoAggiornamento } from '../main/aggiornamenti'
import type { SpawnRequest } from '../main/validation'

/** Una destinazione come la vede l'interfaccia: senza segreti, mai. */
export type DestinazioneVista = {
  id: string
  nome: string
  cwd: string
  host: string
  porta: number
  utente: string
  metodo: 'password' | 'chiave' | 'agente'
  chiaveFile?: string
  cartellaRemota?: string
  cartellaLocale?: string
  improntaServer?: string
}

/** Un file o una cartella, di qua o di la'. */
export type VoceVista = {
  nome: string
  percorso: string
  cartella: boolean
  dimensione: number
  quando: number
  permessi?: string
}

export type ElencoVista = { percorso: string; su?: string; voci: VoceVista[] }


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
  /** Il Client sulla rete locale: chi puo' entrare e da dove. */
  client: {
    stato: (): Promise<{
      porta: number
      indirizzi: string[]
      inEvidenza: string[]
      dispositivi: { id: string; nome: string; collegatoIl: string; ultimoAccesso?: string }[]
      accoppiamento?: { codice: string; scadeIl: number }
    }> => ipcRenderer.invoke('client:stato'),
    apriAccoppiamento: (): Promise<{
      codice: string
      scadeIl: number
      qr: { indirizzo: string; immagine: string }[]
    }> => ipcRenderer.invoke('client:apriAccoppiamento'),
    chiudiAccoppiamento: (): Promise<void> => ipcRenderer.invoke('client:chiudiAccoppiamento'),
    revoca: (id: string): Promise<unknown[]> => ipcRenderer.invoke('client:revoca', id),
    /** Le chat aperte, che il Core da solo non conosce. */
    annunciaChat: (
      chat: { id: string; titolo: string; cwd: string; sessione?: string; ultimaRiga?: string; coda?: string[] }[]
    ): void => ipcRenderer.send('client:chat', chat),
    /**
     * Un'istruzione dell'autopilota da portare dentro una chat.
     *
     * Arriva a **una** finestra sola, scelta dal Core: consegnarla a tutte
     * vorrebbe dire scrivere lo stesso messaggio due volte nella stessa
     * conversazione.
     */
    suConsegna: (cb: (c: unknown) => void): (() => void) => {
      const h = (_e: unknown, c: unknown): void => cb(c)
      ipcRenderer.on('autopilota:consegna', h)
      return () => { ipcRenderer.off('autopilota:consegna', h) }
    },
    /** Una chat nuova, chiesta da un telefono in una cartella già conosciuta. */
    suApertura: (cb: (m: { cartella: string; modello?: string; sessione?: string }) => void): (() => void) => {
      const h = (_e: unknown, m: { cartella: string; modello?: string; sessione?: string }): void => cb(m)
      ipcRenderer.on('client:apri', h)
      return () => { ipcRenderer.off('client:apri', h) }
    },
    /** Un salvataggio che il telefono chiede di rimettere in piedi. */
    suSalvataggio: (cb: (nome: string) => void): (() => void) => {
      const h = (_e: unknown, nome: string): void => cb(nome)
      ipcRenderer.on('client:caricaSalvataggio', h)
      return () => { ipcRenderer.off('client:caricaSalvataggio', h) }
    },
    /** Una chat che il telefono chiede di chiudere. La conversazione resta. */
    suChiusura: (cb: (idChat: string) => void): (() => void) => {
      const h = (_e: unknown, id: string): void => cb(id)
      ipcRenderer.on('client:chiudiChat', h)
      return () => { ipcRenderer.off('client:chiudiChat', h) }
    },
    /** Il nome che il telefono da' a una chat. */
    suRinomina: (cb: (m: { chat: string; nome: string }) => void): (() => void) => {
      const h = (_e: unknown, m: { chat: string; nome: string }): void => cb(m)
      ipcRenderer.on('client:rinominaChat', h)
      return () => { ipcRenderer.off('client:rinominaChat', h) }
    },
    /** Testo mandato da un telefono a una chat. */
    /**
     * Il Core chiede a questa finestra un pezzo di cronologia di una chat.
     *
     * È l'unico canale che va **dal Core al renderer e torna**: lo scrollback
     * vive dentro l'xterm di un riquadro, e il riquadro lo conosce soltanto la
     * finestra che lo disegna. Chi non ha quella chat non risponde e basta —
     * risponde l’altra, e a nessuna tocca sapere cosa fanno le altre.
     */
    suRichiestaRighe: (
      cb: (m: { id: string; chat: string; da: number; quante: number }) => void
    ): (() => void) => {
      const h = (
        _e: unknown,
        m: { id: string; chat: string; da: number; quante: number }
      ): void => cb(m)
      ipcRenderer.on('client:chiediRighe', h)
      return () => { ipcRenderer.off('client:chiediRighe', h) }
    },
    /** La risposta. Non rispondere vuol dire «questa chat non è mia». */
    rispondiRighe: (id: string, dati: unknown): void => {
      ipcRenderer.send('client:righe', { id, dati })
    },
    suScrittura: (cb: (m: { chat: string; testo: string }) => void): (() => void) => {
      const h = (_e: unknown, m: { chat: string; testo: string }): void => cb(m)
      ipcRenderer.on('client:scrivi', h)
      return () => { ipcRenderer.off('client:scrivi', h) }
    },
    /**
     * Una chat arrivata in un workspace da un'altra finestra: va messa nella
     * memoria di questa, o al ritorno la sua copia vecchia la cancellerebbe.
     */
    suChatArrivata: (
      cb: (m: { workspace: string; pane: PaneSalvato }) => void
    ): (() => void) => {
      const h = (_e: unknown, m: { workspace: string; pane: PaneSalvato }): void => cb(m)
      ipcRenderer.on('workspace:chatArrivata', h)
      return () => { ipcRenderer.off('workspace:chatArrivata', h) }
    },
    suWorkspace: (cb: (nome: string) => void): (() => void) => {
      const h = (_e: unknown, nome: string): void => cb(nome)
      ipcRenderer.on('client:workspace', h)
      return () => { ipcRenderer.off('client:workspace', h) }
    }
  },
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
    apri: (cwd: string): Promise<void> => ipcRenderer.invoke('quaderno:apri', cwd),
    /** Cancella una scheda: il file `.md` sparisce dalla cartella. */
    elimina: (cwd: string, file: string): Promise<boolean> =>
      ipcRenderer.invoke('quaderno:elimina', cwd, file)
  },
  /** L'account: registrazione e accesso, che vivono nel main (la rete la fa lui). */
  account: {
    registra: (email: string, password: string): Promise<EsitoAccesso> =>
      ipcRenderer.invoke('account:registra', email, password),
    entra: (email: string, password: string): Promise<EsitoAccesso> =>
      ipcRenderer.invoke('account:entra', email, password),
    esci: (): Promise<void> => ipcRenderer.invoke('account:esci'),
    utente: (): Promise<Utente | undefined> => ipcRenderer.invoke('account:utente'),
    /** Conferma la registrazione col codice ricevuto per email. */
    verifica: (email: string, codice: string): Promise<EsitoAccesso> =>
      ipcRenderer.invoke('account:verifica', email, codice),
    /** Rimanda il codice di conferma. */
    reinvia: (email: string): Promise<{ ok: boolean; messaggio?: string }> =>
      ipcRenderer.invoke('account:reinvia', email),
    /** Avvisa quando l'accesso cambia (entra/esce/token rinnovato). */
    onCambiato: (cb: (utente: Utente | null) => void): (() => void) => {
      const h = (_e: unknown, u: Utente | null): void => cb(u)
      ipcRenderer.on('account:cambiato', h)
      return () => ipcRenderer.off('account:cambiato', h)
    }
  },
  /** Il Drive dell'utente (BYOS): stato, connessione (consenso via browser), distacco. */
  drive: {
    stato: (): Promise<{ configurato: boolean; connesso: boolean }> =>
      ipcRenderer.invoke('drive:stato'),
    connetti: (): Promise<{ ok: boolean; messaggio?: string }> =>
      ipcRenderer.invoke('drive:connetti'),
    disconnetti: (): Promise<void> => ipcRenderer.invoke('drive:disconnetti')
  },
  /** La sincronizzazione cifrata: passphrase (cassaforte E2E) + salva/ripristina. */
  sync: {
    stato: (): Promise<{
      driveConnesso: boolean; haCassaforte: boolean; sbloccato: boolean
      versione?: string; ultimoSalvataggio?: string
    }> => ipcRenderer.invoke('sync:stato'),
    info: (): Promise<{ file: number; byte: number }> => ipcRenderer.invoke('sync:info'),
    creaPassphrase: (passphrase: string): Promise<{ ok: boolean; chiaveRecupero?: string; messaggio?: string }> =>
      ipcRenderer.invoke('sync:creaPassphrase', passphrase),
    sblocca: (passphrase: string): Promise<{ ok: boolean; messaggio?: string }> =>
      ipcRenderer.invoke('sync:sblocca', passphrase),
    sbloccaRecupero: (codice: string): Promise<{ ok: boolean; messaggio?: string }> =>
      ipcRenderer.invoke('sync:sbloccaRecupero', codice),
    cambiaPassphrase: (vecchia: string, nuova: string): Promise<{ ok: boolean; messaggio?: string }> =>
      ipcRenderer.invoke('sync:cambiaPassphrase', vecchia, nuova),
    blocca: (): Promise<void> => ipcRenderer.invoke('sync:blocca'),
    salva: (forza?: boolean): Promise<{ ok: boolean; voci?: number; conflitto?: boolean; invariato?: boolean; messaggio?: string }> =>
      ipcRenderer.invoke('sync:salva', forza === true),
    /** Legge (senza argomento) o imposta il salvataggio automatico. */
    auto: (attivo?: boolean): Promise<boolean> => ipcRenderer.invoke('sync:auto', attivo),
    ripristina: (): Promise<{ ok: boolean; scritti?: number; niente?: boolean; messaggio?: string }> =>
      ipcRenderer.invoke('sync:ripristina'),
    /** Il progresso di salva/ripristina, a fasi. Restituisce come disiscriversi. */
    onProgresso: (cb: (p: {
      fase: 'raccolgo' | 'comprimo' | 'cifro' | 'carico' | 'scarico' | 'decifro' | 'ripristino'
      fatto?: number; totale?: number
    }) => void): (() => void) => {
      const h = (_e: unknown, p: { fase: 'raccolgo' | 'comprimo' | 'cifro' | 'carico' | 'scarico' | 'decifro' | 'ripristino'; fatto?: number; totale?: number }): void => cb(p)
      ipcRenderer.on('sync:progresso', h)
      return () => ipcRenderer.off('sync:progresso', h)
    }
  },
  /** Il registro della sessione: aprirne la cartella o sapere dov'è il file. */
  log: {
    apri: (): Promise<string> => ipcRenderer.invoke('log:apri'),
    percorso: (): Promise<string> => ipcRenderer.invoke('log:percorso'),
    /** Scrive nel registro un errore visto nel renderer, dove altrimenti
     *  morirebbe nella sola console (invisibile a chi non la tiene aperta). */
    errore: (messaggio: string): Promise<void> => ipcRenderer.invoke('log:errore', messaggio)
  },
  /** Il negozio: plugin, skill e MCP di Claude Code, gestiti a clic. */
  /**
   * I trasferimenti: le destinazioni di un progetto e le sessioni SFTP.
   *
   * Tutto passa dal processo principale, e non e' un dettaglio di architettura:
   * una chiave privata e una password non attraversano una pagina web, nemmeno
   * la nostra.
   */
  trasferimenti: {
    destinazioni: (cwd: string): Promise<DestinazioneVista[]> =>
      ipcRenderer.invoke('trasferimenti:destinazioni', cwd),
    salva: (d: Partial<DestinazioneVista>, segreto?: { password?: string; passphrase?: string }):
      Promise<DestinazioneVista> => ipcRenderer.invoke('trasferimenti:salva', d, segreto),
    elimina: (id: string): Promise<void> => ipcRenderer.invoke('trasferimenti:elimina', id),
    collega: (id: string): Promise<{ ok: boolean; impronta?: string; cambiata?: boolean; errore?: string }> =>
      ipcRenderer.invoke('trasferimenti:collega', id),
    fidati: (id: string, impronta: string): Promise<void> =>
      ipcRenderer.invoke('trasferimenti:fidati', id, impronta),
    remoto: (id: string, percorso: string): Promise<ElencoVista> =>
      ipcRenderer.invoke('trasferimenti:remoto', id, percorso),
    locale: (percorso: string): Promise<ElencoVista> =>
      ipcRenderer.invoke('trasferimenti:locale', percorso),
    scarica: (id: string, remoto: string, cartellaLocale: string): Promise<void> =>
      ipcRenderer.invoke('trasferimenti:scarica', id, remoto, cartellaLocale),
    carica: (id: string, locale: string, cartellaRemota: string): Promise<void> =>
      ipcRenderer.invoke('trasferimenti:carica', id, locale, cartellaRemota),
    creaCartella: (id: string, percorso: string): Promise<void> =>
      ipcRenderer.invoke('trasferimenti:creaCartella', id, percorso),
    eliminaRemoto: (id: string, percorso: string, cartella: boolean): Promise<void> =>
      ipcRenderer.invoke('trasferimenti:eliminaRemoto', id, percorso, cartella),
    rinominaRemoto: (id: string, da: string, a: string): Promise<void> =>
      ipcRenderer.invoke('trasferimenti:rinominaRemoto', id, da, a),
    scollega: (id: string): Promise<void> => ipcRenderer.invoke('trasferimenti:scollega', id),
    suAvanzamento: (
      h: (e: { id: string; cosa: string; fatti: number; totale: number; finito?: boolean; errore?: string }) => void
    ): (() => void) => {
      const ascolta = (_e: unknown, dato: unknown): void =>
        h(dato as { id: string; cosa: string; fatti: number; totale: number; finito?: boolean; errore?: string })
      ipcRenderer.on('trasferimenti:avanza', ascolta)
      return () => ipcRenderer.off('trasferimenti:avanza', ascolta)
    }
  },

  negozio: {
    plugin: (): Promise<{ plugin: Array<{
      id: string; nome: string; descrizione: string; marketplace: string
      installato: boolean; abilitato: boolean; installazioni?: number
    }>; errore?: string }> => ipcRenderer.invoke('negozio:plugin'),
    installaPlugin: (id: string): Promise<{ ok: boolean; messaggio?: string }> =>
      ipcRenderer.invoke('negozio:installaPlugin', id),
    disinstallaPlugin: (id: string): Promise<{ ok: boolean; messaggio?: string }> =>
      ipcRenderer.invoke('negozio:disinstallaPlugin', id),
    commutaPlugin: (id: string, on: boolean): Promise<{ ok: boolean; messaggio?: string }> =>
      ipcRenderer.invoke('negozio:commutaPlugin', id, on),
    skill: (cwd?: string): Promise<Array<{
      nome: string; descrizione: string; origine: 'utente' | 'progetto' | 'plugin'
      percorso: string; abilitata: boolean
    }>> => ipcRenderer.invoke('negozio:skill', cwd),
    commutaSkill: (nome: string, on: boolean): Promise<{ ok: boolean; messaggio?: string }> =>
      ipcRenderer.invoke('negozio:commutaSkill', nome, on),
    mcp: (cwd: string): Promise<Array<{ nome: string; come: string; abilitato: boolean }>> =>
      ipcRenderer.invoke('negozio:mcp', cwd),
    commutaMcp: (cwd: string, nome: string, on: boolean): Promise<{ ok: boolean; messaggio?: string }> =>
      ipcRenderer.invoke('negozio:commutaMcp', cwd, nome, on),
    agenti: (cwd?: string): Promise<Array<{
      nome: string; descrizione: string; origine: 'utente' | 'progetto'
      percorso: string; strumenti?: string; modello?: string
    }>> => ipcRenderer.invoke('negozio:agenti', cwd),
    dettagliPlugin: (id: string): Promise<{ testo: string; errore?: string }> =>
      ipcRenderer.invoke('negozio:dettagliPlugin', id),
    marketplace: (): Promise<{ marketplace: Array<{
      nome: string; tipo: string; riferimento: string; ufficiale: boolean
    }>; errore?: string }> => ipcRenderer.invoke('negozio:marketplace'),
    aggiungiMarketplace: (sorgente: string): Promise<{ ok: boolean; messaggio?: string }> =>
      ipcRenderer.invoke('negozio:aggiungiMarketplace', sorgente),
    rimuoviMarketplace: (nome: string): Promise<{ ok: boolean; messaggio?: string }> =>
      ipcRenderer.invoke('negozio:rimuoviMarketplace', nome),
    aggiornaMarketplace: (nome?: string): Promise<{ ok: boolean; messaggio?: string }> =>
      ipcRenderer.invoke('negozio:aggiornaMarketplace', nome),
    rivela: (percorso: string): Promise<void> => ipcRenderer.invoke('negozio:rivela', percorso),
    scope: (cwd: string): Promise<{ pluginSpenti: string[]; skillSpente: string[]; mcpSpenti: string[] }> =>
      ipcRenderer.invoke('negozio:scope', cwd),
    impostaScope: (cwd: string, scope: { pluginSpenti: string[]; skillSpente: string[]; mcpSpenti: string[] }): Promise<{ ok: boolean; messaggio?: string }> =>
      ipcRenderer.invoke('negozio:impostaScope', cwd, scope)
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
    /** Apre un link http/https/mailto nel browser di sistema, non dentro l'app. */
    apriEsterno: (url: string): Promise<void> => ipcRenderer.invoke('sistema:apriEsterno', url),
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
    salva: (l: LayoutSalvato, workspace?: string): void =>
      ipcRenderer.send('layout:salva', l, workspace),
    /**
     * Il Core chiede a questa finestra com'è disposta adesso: succede quando si
     * salva una sessione, che deve contenere **tutte** le finestre e non solo
     * quella da cui si è premuto il tasto.
     */
    suRichiesta: (dai: () => LayoutSalvato): (() => void) => {
      const h = (_e: unknown, id: number): void => ipcRenderer.send('layout:consegna', id, dai())
      ipcRenderer.on('layout:richiedi', h)
      return () => ipcRenderer.off('layout:richiedi', h)
    },
    /**
     * Il Core chiede a questa finestra di salvare il layout **subito** e aspetta
     * la conferma: è la rete di sicurezza alla chiusura (anche quella di un
     * aggiornamento). Il salvataggio normale è a debounce, e senza questo giro
     * la chat su cui si lavorava poteva non essere ancora sul disco quando
     * l'app si chiude — e alla riapertura «mancava».
     */
    suSalvaSubito: (salva: () => void): (() => void) => {
      const h = (_e: unknown, id: number): void => {
        salva()
        ipcRenderer.send('layout:salvato', id)
      }
      ipcRenderer.on('layout:salvaSubito', h)
      return () => ipcRenderer.off('layout:salvaSubito', h)
    },
    /**
     * Un layout che arriva da fuori: lo manda il Core quando un ripristino
     * riempie questa finestra invece di aprirne una nuova.
     */
    suApplica: (cb: (l: LayoutSalvato) => void): (() => void) => {
      const h = (_e: unknown, l: LayoutSalvato): void => cb(l)
      ipcRenderer.on('layout:applica', h)
      return () => ipcRenderer.off('layout:applica', h)
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
    /** Il via a chi si è preparato e aspetta di essere letto. */
    vai: (id: string): Promise<Autopilota> => ipcRenderer.invoke('autopilota:vai', id),
    /** Cambia obiettivo, criteri o compiti. Quello che non nomini resta com'era. */
    modifica: (id: string, cambio: CambioAutopilota): Promise<Autopilota> =>
      ipcRenderer.invoke('autopilota:modifica', id, cambio),
    /** Glielo dici a parole: traduce lui in criteri e compiti, e lo applica. */
    parla: (id: string, testo: string): Promise<RispostaParlata> =>
      ipcRenderer.invoke('autopilota:parla', id, testo),
    /** Rimette com'era prima dell'ultima cosa che gli hai detto. */
    disfa: (id: string): Promise<Autopilota> => ipcRenderer.invoke('autopilota:disfa', id),
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
    rinomina: (vecchio: string, nuovo: string): Promise<StatoWorkspace> =>
      ipcRenderer.invoke('workspace:rinomina', vecchio, nuovo),
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
    },
    onRinominato: (
      cb: (r: { vecchio: string; nuovo: string; attivo: string }) => void
    ): (() => void) => {
      const h = (_e: unknown, r: { vecchio: string; nuovo: string; attivo: string }): void => cb(r)
      ipcRenderer.on('workspace:rinominato', h)
      return () => ipcRenderer.off('workspace:rinominato', h)
    },
    // Il workspace tornato davanti da un ripristino: la finestra vi si riallinea
    // SUBITO, senza seguirlo con una traslocazione — l'archivio è già a posto.
    onRipristinato: (cb: (s: StatoWorkspace) => void): (() => void) => {
      const h = (_e: unknown, s: StatoWorkspace): void => cb(s)
      ipcRenderer.on('workspace:ripristinato', h)
      return () => ipcRenderer.off('workspace:ripristinato', h)
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
