import type { HostToCore } from '@shared/protocol'
import type { SpawnRequest } from '../main/validation'
import type { Avanzamento, IndexOutcome, SessionSummary } from '@shared/types'
import type { LayoutSalvato, PaneSalvato } from '@shared/workspace'
import type { Autopilota } from '@shared/autopilota'
import type { StatoWorkspace } from '../main/ipc'
import type { ApiNegozio } from '@shared/negozio'
import type { Istantanea } from '@shared/istantanea'
import type {
  NuovoAutopilota, DomandaAperta, RicevutaDialogo
} from '../main/autopilot-client'
import type { StatoAccesso } from '../main/accesso'
import type { StatoPreparazione } from '../main/preparazione'
import type { NoteAggiornamento } from '@shared/note-aggiornamento'
import type { Consumi } from '@shared/consumi'
import type { Anteprima } from '../main/anteprima'
import type { StatoAggiornamento } from '../main/aggiornamenti'
import type { CodaVista, DestinazioneVista, ElencoVista, RichiestaVista } from '../preload'
import type { AzioneChat, ChatArchiviata, ChatInRecupero, EsitoAzioni, VistaSpazio } from '@shared/gestione-chat'

type ElencoProgetti = {
  pc: { id: string; nome: string; cartellaProgetti: string }
  progetti: { id: string; nome: string; locale?: string; altrove: number }[]
  /** Un esito da mostrare, quando un'azione ha qualcosa da dire. */
  messaggio?: string
}
type StatoProgetto = {
  id: string; nome: string; chi: 'io' | 'altro' | 'libero'; pcNome?: string; da?: string; staffettaDa?: string; inCoda?: number
}
type VoceCoda = {
  id: string; testo: string; creataIl: string; daNome: string; sessione?: string
  stato: 'attesa' | 'consegnata'; consegnataIl?: string; aNome?: string; aSessione?: string
}
type Coda = { voci: VoceCoda[] }
type ChatDiProgetto = { sessione: string; titolo: string; workspace: string }
type EsitoTestimone =
  | { ok: true; conflitti?: number }
  | { ok: false; nonRisponde: true; pcNome: string }
  | { ok: false; messaggio: string }
type AvvisoProgettoDalCore =
  | { tipo: 'occupato'; progettoId: string; nome: string; pcNome: string; da: string }
  | { tipo: 'ceduto'; progettoId: string; nome: string; aNome: string; sessioni: string[] }

declare global {
  interface Window {
    gestore: {
      pty: {
        spawn: (req: SpawnRequest) => Promise<string>
        write: (id: string, data: string) => void
        resize: (id: string, cols: number, rows: number) => void
        kill: (id: string) => void
        attach: (id: string) => void
        onEvent: (cb: (msg: HostToCore) => void) => () => void
      }
      sessions: {
        list: (opts?: { projectSlug?: string; limit?: number }) => Promise<SessionSummary[]>
        reindex: () => Promise<IndexOutcome>
        consumi: () => Promise<Consumi>
        stato: () => Promise<{ inCorso: boolean; avanzamento?: Avanzamento }>
        anteprima: (percorsoOCwd: string, sessionId?: string) => Promise<Anteprima>
        elimina: (percorsi: string[]) => Promise<{ eliminate: number; errori: string[] }>
        onProgress: (cb: (p: Avanzamento) => void) => () => void
        onOutcome: (cb: (e: IndexOutcome) => void) => () => void
      }
      client: {
        stato: () => Promise<{
          porta: number
          indirizzi: string[]
          inEvidenza: string[]
          dispositivi: { id: string; nome: string; collegatoIl: string; ultimoAccesso?: string }[]
          accoppiamento?: { codice: string; scadeIl: number }
        }>
        apriAccoppiamento: () => Promise<{
          codice: string
          scadeIl: number
          qr: { indirizzo: string; immagine: string }[]
        }>
        chiudiAccoppiamento: () => Promise<void>
        revoca: (id: string) => Promise<unknown[]>
        annunciaChat: (
          chat: { id: string; titolo: string; cwd: string; sessione?: string; workspace?: string; ultimaRiga?: string; aspetta?: boolean; governata?: boolean; coda?: string[]; codaGrezza?: string[] }[]
        ) => void
        suApertura: (cb: (m: { cartella: string; modello?: string; sessione?: string; workspace?: string; nome?: string; causa?: string }) => void) => () => void
        suSalvataggio: (cb: (nome: string) => void) => () => void
        suConsegna: (cb: (c: unknown) => void) => () => void
        suChatArrivata: (cb: (m: { workspace: string; pane: PaneSalvato }) => void) => () => void
        suChiusura: (cb: (idChat: string, da?: string) => void) => () => void
        suRinomina: (cb: (m: { chat: string; nome: string }) => void) => () => void
        suRichiestaRighe: (
          cb: (m: { id: string; chat: string; da: number; quante: number; schermo?: boolean }) => void
        ) => () => void
        rispondiRighe: (id: string, dati: unknown) => void
        suAzione: (cb: (m: { id: string } & Record<string, unknown>) => void) => () => void
        esitoAzione: (id: string, ok: boolean, errore?: string) => void
        suScrittura: (cb: (m: { chat: string; testo: string }) => void) => () => void
        suTasti: (cb: (m: { chat: string; pezzi: string[] }) => void) => () => void
        suRipresaChat: (cb: (m: { sessione: string; testo: string }) => void) => () => void
        suWorkspace: (cb: (nome: string) => void) => () => void
      }
      preferenze: {
        leggi: () => Promise<import('@shared/preferenze').Preferenze>
        imposta: (p: import('@shared/preferenze').Preferenze) => Promise<import('@shared/preferenze').Preferenze>
        suCambio: (cb: (p: import('@shared/preferenze').Preferenze) => void) => () => void
      }
      dettatura: {
        stato: () => Promise<import('@shared/dettatura').StatoDettatura>
        apri: () => Promise<{ ok: boolean; messaggio?: string; comeAttivare?: string }>
      }
      migrazione: {
        stato: () => Promise<import('@shared/migrazione-elenco').StatoMigrazione | null>
        torna: () => Promise<{ ok: boolean; messaggio: string }>
        rifai: () => Promise<{ ok: boolean; messaggio: string }>
        suCambio: (cb: () => void) => () => void
      }
      adozione: {
        soloMia: (id: string, sessione: string, si: boolean) => Promise<{ ok: boolean }>
        adotta: (id: string) => Promise<string[]>
      }
      quaderno: {
        elenca: (cwd: string) => Promise<import('@shared/quaderno').Scheda[]>
        leggi: (cwd: string, file: string) => Promise<import('@shared/quaderno').Scheda | undefined>
        scrivi: (cwd: string, scheda: { titolo: string; corpo: string; tag?: string[]; file?: string }) => Promise<import('@shared/quaderno').Scheda>
        apri: (cwd: string) => Promise<void>
        elimina: (cwd: string, file: string) => Promise<boolean>
        anteprimaRiordino: (cwd: string) => Promise<import('@shared/quaderno-riordino').AnteprimaRiordinoVista>
        riordina: (cwd: string, file?: string[]) => Promise<import('@shared/quaderno-riordino').EsitoRiordinoVista>
      }
      account: {
        registra: (email: string, password: string) => Promise<import('@shared/account').EsitoAccesso>
        entra: (email: string, password: string) => Promise<import('@shared/account').EsitoAccesso>
        esci: () => Promise<void>
        utente: () => Promise<import('@shared/account').Utente | undefined>
        verifica: (email: string, codice: string) => Promise<import('@shared/account').EsitoAccesso>
        reinvia: (email: string) => Promise<{ ok: boolean; messaggio?: string }>
        onCambiato: (cb: (utente: import('@shared/account').Utente | null) => void) => () => void
      }
      drive: {
        avvisoScollegato: () => Promise<import('../shared/scoperta-pc').AvvisoDrive | undefined>
        stato: () => Promise<{ configurato: boolean; connesso: boolean; email?: string }>
        connetti: () => Promise<{
          ok: boolean; messaggio?: string
          email?: string; fileSierraDeck?: number; ultimoSalvataggio?: string; cassaforteSulDrive?: boolean
          conosciuti?: number; coincidenze?: number
          /** La cassaforte di questo PC e' quella del Drive scelto: la prova che conta. */
          stessaCassaforte?: boolean
        }>
        disconnetti: () => Promise<void>
      }
      /** I progetti sul Drive: quali cartelle viaggiano con le chat, e dove stanno su questo PC. */
      progetti: {
        elenca: () => Promise<ElencoProgetti>
        aggiungi: () => Promise<ElencoProgetti>
        aggiungiPercorso: (percorso: string) => Promise<ElencoProgetti>
        collega: (id: string) => Promise<ElencoProgetti>
        rimuovi: (id: string) => Promise<ElencoProgetti>
        cartella: () => Promise<ElencoProgetti>
        stati: () => Promise<StatoProgetto[]>
        prendiTestimone: (id: string, forza?: boolean) => Promise<EsitoTestimone>
        suAvviso: (cb: (a: AvvisoProgettoDalCore) => void) => () => void
        chatDi: (id: string) => Promise<ChatDiProgetto[]>
        coda: (id: string) => Promise<Coda | undefined>
        codaAggiungi: (id: string, testo: string, sessione?: string) => Promise<Coda | undefined>
        codaModifica: (id: string, voceId: string, testo: string, sessione?: string) => Promise<Coda | undefined>
        codaTogli: (id: string, voceId: string) => Promise<Coda | undefined>
        codaPulisci: (id: string) => Promise<Coda | undefined>
        suIberna: (cb: (m: { sessioni: string[] }) => void) => () => void
      }
      segnali: {
        suStato: (cb: (f: import('@shared/segnali-chat').FaseSessione) => void) => () => void
        di: (sessioni: string[]) => Promise<Record<string, import('@shared/segnali-chat').Segnale[]>>
      }
      pin: {
        stato: () => Promise<import('../main/pin-guardiano').StatoPin>
        imposta: (nuovo: string, attuale?: string) => Promise<import('../main/pin-guardiano').EsitoPin>
        attiva: (si: boolean) => Promise<import('../main/pin-guardiano').EsitoPin>
        inattivita: (min: number) => Promise<void>
        proteggiChat: (sessione: string, si: boolean) => Promise<void>
        proteggiWorkspace: (nome: string, si: boolean) => Promise<void>
        azzera: (passphrase: string) => Promise<import('../main/pin-guardiano').EsitoPin>
        richiudi: () => Promise<void>
        chiusa: (sessione: string | undefined, workspace: string | undefined) => Promise<boolean>
        protetta: (sessione: string | undefined, workspace: string | undefined) => Promise<boolean>
        sblocca: (sessione: string, workspace: string | undefined, pin: string) => Promise<import('../main/pin-guardiano').EsitoPin>
        tocca: (sessione: string, workspace: string | undefined) => Promise<void>
        suCambiato: (cb: () => void) => () => void
      }
      salute: {
        leggi: () => Promise<import('@shared/salute').Salute>
        installaLa: (pcId: string) => Promise<import('@shared/installa-la').AvanzamentoInstallaLa>
        installaLaStato: () => Promise<import('@shared/installa-la').AvanzamentoInstallaLa[]>
        noteInstallaLa: (pcId: string) => Promise<import('@shared/note-aggiornamento').NoteAggiornamento>
        suInstallaLa: (cb: (a: import('@shared/installa-la').AvanzamentoInstallaLa) => void) => () => void
      }
      casa: {
        proposte: () => Promise<{ gruppi: { pc: string; nome: string; chat: import('@shared/una-casa').FuoriCasa[] }[]; quante: number; aperte: number; qui: number }>
        riordina: (sessioni: string[]) => Promise<import('@shared/una-casa').RegistroRiordino>
        riordini: () => Promise<import('@shared/una-casa').RegistroRiordino[]>
        annulla: (id: string) => Promise<{ ok: boolean; rimessi: number; restano: { sessione: string; perche: string; dove: string }[]; messaggio?: string }>
        stato: () => Promise<{ migrazione?: { fatta: string; case: number; proprietari: number; copia?: string }; case: number; qui: number }>
        dove: () => Promise<{ io: { id: string; nome: string }; pc: { id: string; nome: string }[]; gruppi: import('@shared/ospite-chat').GruppoDove[]; traslochi: import('@shared/una-casa').RegistroRiordino[] }>
        casaDi: (sessione: string) => Promise<string | undefined>
        idNuovo: (vecchia: string, nuova: string) => Promise<void>
        scegli: (p: { sessioni: string[]; pc: { id: string; nome: string }; workspace?: string }) => Promise<{ ok: boolean; messaggio: string }>
        pannello: () => Promise<import('../shared/pannello-drive').Pannello>
        azione: (corpo: { azione: string; progetto?: string; id?: string; tipo?: string; pc?: string }) => Promise<{ ok: boolean; messaggio: string }>
        rimozione: {
          avvia: (id: string) => Promise<import('../shared/rimozione-sicura').StatoRimozione>
          conferma: (id: string) => Promise<import('../shared/rimozione-sicura').StatoRimozione>
          annulla: (id: string) => Promise<import('../shared/rimozione-sicura').StatoRimozione>
          stati: () => Promise<{ stati: import('../shared/rimozione-sicura').StatoRimozione[]; inRecupero: import('../shared/rimozione-sicura').CartellaInRecupero[] }>
          ripristina: (id: string) => Promise<{ ok: boolean; messaggio: string }>
          cestina: (id: string) => Promise<{ ok: boolean; messaggio: string }>
        }
        di: (sessione: string) => Promise<{ pc: string; pcNome: string; da: string; motivo: string; qui: boolean } | undefined>
        suChiudiQui: (cb: (chat: { sessione: string; pc: { id: string; nome: string } }[]) => void) => () => void
        suCambiate: (cb: () => void) => () => void
      }
      sposta: {
        progetti: () => Promise<{ cwd: string; nome: string; sessioni: string[]; titoli: string[] }[]>
        pc: () => Promise<{ pcId: string; nome: string; versione: string; battito: string }[]>
        controlli: (cwd: string, dest: string) => Promise<import('@shared/una-casa').Controllo[]>
        trasferisci: (cwd: string, dest: string, mettiSulDrive: boolean) => Promise<{ ok: boolean; messaggio: string; serveDrive?: boolean }>
        verifica: (cwd: string, dest: string) => Promise<{ ok: boolean; messaggio: string; diverse?: string[] }>
        casa: (cwd: string, dest: string) => Promise<{ ok: boolean; messaggio: string }>
        archivia: (cwd: string, dest: string) => Promise<{ ok: boolean; messaggio: string; registro?: import('@shared/una-casa').RegistroRiordino }>
        trasloco: (cwd: string, dest: string) => Promise<{ ok: boolean; messaggio: string }>
      }
      sync: {
        stato: () => Promise<{
          driveConnesso: boolean; haCassaforte: boolean; sbloccato: boolean; cassaforteDiversa?: boolean
          versione?: string; ultimoSalvataggio?: string
          ultimaFusione?: import('../main/cassaforte/sincronia').UltimaFusione
        }>
        info: () => Promise<{ file: number; byte: number }>
        creaPassphrase: (passphrase: string) => Promise<{ ok: boolean; chiaveRecupero?: string; messaggio?: string }>
        sblocca: (passphrase: string) => Promise<{ ok: boolean; messaggio?: string }>
        sbloccaRecupero: (codice: string) => Promise<{ ok: boolean; messaggio?: string }>
        cambiaPassphrase: (vecchia: string, nuova: string) => Promise<{ ok: boolean; messaggio?: string }>
        blocca: () => Promise<void>
        lavoro: () => Promise<import('../main/cassaforte/lavoro-in-corso').StatoLavoro>
        annullaLavoro: () => Promise<boolean>
        onLavoro: (cb: (s: import('../main/cassaforte/lavoro-in-corso').StatoLavoro) => void) => () => void
        onCatalogoProgresso: (cb: (p: import('../shared/catalogo-progresso').ProgressoCatalogo) => void) => () => void
        onChatArrivate: (cb: (m: { quante: number; tipo: string; quando: string; rimappate: number }) => void) => () => void
        onCartellaCambiata: (cb: (m: { sessionUuid: string; da: string; a: string }) => void) => () => void
        adottaCassaforteDelDrive: () => Promise<{ ok: boolean; messaggio?: string }>
        cambiatoDrive: () => Promise<void>
        provaPassphraseSulDrive: (passphrase: string) => Promise<{ ok: boolean; stessa?: boolean; messaggio?: string }>
        anteprimaFusione: (passphraseDrive?: string) => Promise<
          | { ok: true; piano: import('../main/cassaforte/fusione').PianoFusione }
          | { ok: false; messaggio: string; servePassphrase?: boolean }
        >
        riprendiChat: (cwd: string, sessione: string) => Promise<boolean>
        catalogo: () => Promise<{ ok: true; catalogo: import('../main/cassaforte/catalogo').Catalogo } | { ok: false; messaggio: string; cassaforteDiversa?: boolean }>
        portaQui: (chiave: string) => Promise<{ ok: true; esito: import('../main/cassaforte/fusione').EsitoFusione } | { ok: false; messaggio: string }>
        portaQuiWorkspace: (nome: string) => Promise<{ ok: true; esito: import('../main/cassaforte/fusione').EsitoFusione } | { ok: false; messaggio: string }>
        togliWorkspace: (nome: string) => Promise<{ ok: boolean; messaggio?: string }>
        rimettiWorkspace: (nome: string) => Promise<{ ok: boolean; messaggio?: string }>
        eseguiFusione: (scelte: import('../main/cassaforte/fusione').ScelteFusione, passphraseDrive?: string) => Promise<
          | { ok: true; esito: import('../main/cassaforte/fusione').EsitoFusione }
          | { ok: false; messaggio: string }
        >
        salva: (forza?: boolean) => Promise<{ ok: boolean; voci?: number; conflitto?: boolean; invariato?: boolean; messaggio?: string; conflitti?: number; annullato?: boolean }>
        auto: (attivo?: boolean) => Promise<boolean>
        ripristina: () => Promise<{ ok: boolean; scritti?: number; niente?: boolean; messaggio?: string; conflitti?: number; annullato?: boolean }>
        onProgresso: (cb: (p: {
          fase: 'raccolgo' | 'comprimo' | 'cifro' | 'carico' | 'scarico' | 'decifro' | 'ripristino'
          fatto?: number; totale?: number
        }) => void) => () => void
      }
      log: {
        apri: () => Promise<string>
        percorso: () => Promise<string>
        errore: (messaggio: string) => Promise<void>
        info: (messaggio: string) => Promise<void>
      }
      /** Lo storico degli errori di questo PC (0.81.0): programma e servizio insieme. */
      errori: {
        storico: () => Promise<{ voci: import('@shared/storico-errori').VoceErrore[]; testo: string; arrivi?: string }>
        manda: () => Promise<{ ok: boolean; messaggio: string }>
      }
      /** I file del progetto, di qua e sul suo server. */
      trasferimenti: {
        destinazioni: (cwd: string) => Promise<DestinazioneVista[]>
        salva: (
          d: Partial<DestinazioneVista>,
          segreto?: { password?: string; passphrase?: string }
        ) => Promise<DestinazioneVista>
        elimina: (id: string) => Promise<void>
        collega: (id: string) => Promise<{ ok: boolean; impronta?: string; cambiata?: boolean; errore?: string }>
        fidati: (id: string, impronta: string) => Promise<void>
        remoto: (id: string, percorso: string) => Promise<ElencoVista>
        locale: (percorso: string) => Promise<ElencoVista>
        scarica: (id: string, remoto: string, cartellaLocale: string) => Promise<void>
        carica: (id: string, locale: string, cartellaRemota: string) => Promise<void>
        creaCartella: (id: string, percorso: string) => Promise<void>
        eliminaRemoto: (id: string, percorso: string, cartella: boolean) => Promise<void>
        rinominaRemoto: (id: string, da: string, a: string) => Promise<void>
        permessiRemoti: (id: string, percorso: string, modo: number) => Promise<void>
        creaCartellaLocale: (percorso: string) => Promise<void>
        eliminaLocale: (percorso: string) => Promise<void>
        rinominaLocale: (da: string, a: string) => Promise<void>
        mostraNelSistema: (percorso: string) => Promise<void>
        apriInModifica: (id: string, remoto: string, nome: string) => Promise<FileInModificaVista>
        chiudiModifica: (id: string, remoto: string) => Promise<void>
        modificheAperte: () => Promise<FileInModificaVista[]>
        suModifiche: (h: (aperti: FileInModificaVista[]) => void) => () => void
        accoda: (richieste: RichiestaVista[]) => Promise<void>
        coda: () => Promise<CodaVista>
        apriGuscio: (id: string, colonne: number, righe: number) => Promise<string>
        scriviGuscio: (guscio: string, testo: string) => Promise<void>
        ridimensionaGuscio: (guscio: string, colonne: number, righe: number) => Promise<void>
        chiudiGuscio: (guscio: string) => Promise<void>
        suGuscio: (h: (e: { guscio: string; dati?: string; finito?: boolean }) => void) => () => void
        percorsoDelFile: (file: File) => string
        annullaLavoro: (id: string) => Promise<void>
        annullaCoda: () => Promise<void>
        pulisciCoda: (ancheErrori: boolean) => Promise<void>
        riprovaLavoro: (id: string) => Promise<void>
        suCoda: (h: (stato: CodaVista) => void) => () => void
        scollega: (id: string) => Promise<void>
        suAvanzamento: (
          h: (e: {
            id: string; cosa: string; fatti: number; totale: number
            finito?: boolean; errore?: string
          }) => void
        ) => () => void
      }
      negozio: ApiNegozio
      chiavi: {
        stato: () => Promise<{ allAvvio: boolean; workspace: string[] }>
        impostaAvvio: (parola: string) => Promise<{ allAvvio: boolean; workspace: string[] }>
        impostaWorkspace: (nome: string, parola: string) => Promise<{ allAvvio: boolean; workspace: string[] }>
        verifica: (parola: string, workspace?: string) => Promise<boolean>
      }
      sistema: {
        cartellaUtente: () => Promise<string>
        versione: () => Promise<string>
        cartellaScambio: () => Promise<string>
        apriScambio: () => Promise<string>
        apriEsterno: (url: string) => Promise<void>
        autopilotiAlLavoro: (quanti: number) => void
        scegliCartella: () => Promise<string | undefined>
        cartellaEsiste: (percorso: string) => Promise<boolean>
        cartelleBase: (workspace?: string) => Promise<{ documenti: string; progetti: string; casa?: string; workspace?: string }>
        riavvia: () => Promise<{ ok: boolean; messaggio?: string }>
        creaCartella: (percorso: string) => Promise<boolean>
        titoloFinestra: (testo: string) => void
      }
      aggiornamenti: {
        stato: () => Promise<StatoAggiornamento>
        cerca: () => Promise<void>
        scarica: () => Promise<void>
        installa: () => Promise<void>
        aggiornaAdesso: () => Promise<void>
        note: () => Promise<NoteAggiornamento | undefined>
        suStato: (cb: (s: StatoAggiornamento) => void) => () => void
      }
      provider: {
        leggi: () => Promise<{ attivo: boolean; baseUrl: string; modello: string; haToken: boolean }>
        imposta: (p: {
          attivo: boolean
          baseUrl: string
          token: string
          modello: string
          togliToken?: boolean
        }) => Promise<{ attivo: boolean; baseUrl: string; modello: string; haToken: boolean }>
      }
      /** La gestione delle chat (0.79.0): le stesse risposte di /api/chat/gestione/… */
      chatGestione: {
        spazio: () => Promise<VistaSpazio>
        selezione: (sessioni: string[]) => Promise<{ chat: number; byte: number; eliminabili: number; byteEliminabili: number; escluse: { sessione: string; motivo: string }[]; chiuse?: string[] }>
        azione: (r: { azione: AzioneChat; sessioni: string[]; ancheDalDrive?: boolean; nome?: string }) => Promise<EsitoAzioni>
        archiviate: () => Promise<ChatArchiviata[]>
        recupero: () => Promise<{ chat: ChatInRecupero[]; byte: number }>
        ripristina: (id: string) => Promise<{ ok: boolean; messaggio: string }>
        chiediSvuota: (ancheDalDrive: boolean) => Promise<{ ok: boolean; messaggio: string; gettone?: string; scadeIl?: string; chat?: number; byte?: number; frase?: string }>
        svuota: (p: { gettone: string; frase: string; ancheDalDrive: boolean }) => Promise<{ ok: boolean; messaggio: string; byte?: number }>
        orfane: () => Promise<{ etichette: string[]; archiviate: string[] }>
        onCambiata: (cb: () => void) => () => void
      }
      etichette: {
        leggi: () => Promise<Record<string, string>>
        imposta: (uuid: string, testo: string) => Promise<Record<string, string>>
      }
      layout: {
        carica: () => Promise<LayoutSalvato>
        /** 0.86.2: i riquadri da non rimontare all'avvio (`riquadri-morti.ts`). */
        riquadriMorti: (panes: { sessionUuid: string; cwd: string; autopilota?: { id: string; chat: string }; remoto?: { pcId: string; pcNome: string; cwd: string; sessione?: string; dal?: string } }[]) => Promise<{ sessionUuid: string; perche: string }[]>
        salva: (l: LayoutSalvato, congedate?: string[]) => void
        suRichiesta: (dai: () => LayoutSalvato) => () => void
        suSalvaSubito: (salva: () => void) => () => void
        suApplica: (cb: (l: LayoutSalvato) => void) => () => void
      }
      finestre: {
        nuova: () => void
        elenco: () => Promise<{ id: number; titolo: string }[]>
        sposta: (pane: PaneSalvato, finestraId: number) => Promise<boolean>
        onRiquadroInArrivo: (cb: (pane: PaneSalvato) => void) => () => void
      }
      accesso: {
        stato: () => Promise<StatoAccesso>
      }
      posta: {
        io: () => Promise<string>
        pc: () => Promise<import('../shared/posta').BattitoPc[]>
        identita: () => Promise<{ id: string; nome: string; host: string; nomeScelto?: string }>
        impostaNome: (nome: string) => Promise<{ id: string; nome: string; host: string; nomeScelto?: string }>
        suNomeCambiato: (cb: (i: { id: string; nome: string; host: string; nomeScelto?: string }) => void) => () => void
        leggi: (pc: string) => Promise<import('../shared/posta').Posta | undefined>
        aggiungi: (pc: string, voce: { cwd: string; testo: string; sessione?: string }) => Promise<import('../shared/posta').Posta | undefined>
        togli: (pc: string, voce: string) => Promise<import('../shared/posta').Posta | undefined>
        pulisci: (pc: string) => Promise<import('../shared/posta').Posta | undefined>
      }
      quadernoPersonale: {
        stato: () => Promise<import('../shared/quaderno-personale').StatoQuadernoPersonale>
        salva: (v: { id?: string; nome: string; valore: string; nota?: string }) => Promise<{ ok: true } | { ok: false; errore: string }>
        togli: (id: string) => Promise<boolean>
        revoca: (sessione: string, voce: string) => Promise<boolean>
        quandoCambia: (f: () => void) => () => void
      }
      alTelefono: {
        stato: () => Promise<import('../shared/file-telefono').StatoAlTelefono>
        manda: (percorso: string, telefono: string, nota?: string) => Promise<import('../shared/file-telefono').EsitoMandaAlTelefono>
        mandaDaAutopilota: (id: string, chiave: string, percorso: string, telefono: string, nota?: string) => Promise<import('../shared/file-telefono').EsitoMandaAlTelefono>
        annulla: (id: string) => Promise<import('../shared/file-telefono').StatoAlTelefono>
        pulisci: () => Promise<import('../shared/file-telefono').StatoAlTelefono>
        quandoCambia: (f: () => void) => () => void
      }
      autopilotiAltri: {
        elenco: () => Promise<import('../shared/autopiloti-altri').AutopilotiDiPc[]>
        azione: (pc: string, percorso: string, corpo: Record<string, unknown>) => Promise<{ ok: true; dati: unknown } | { ok: false; stato: number; messaggio: string }>
      }
      sottofondo: {
        elenco: () => Promise<import('../shared/sottofondo').StatoSottofondo[]>
        schermo: (sessione: string) => Promise<string[] | null>
        mostra: (sessione: string) => Promise<{ ok: boolean; messaggio?: string }>
        chiudi: (sessione: string) => Promise<boolean>
        suCambiato: (cb: () => void) => () => void
      }
      remoto: {
        pc: (solo?: string) => Promise<{ io: string; cassaforteAperta: boolean; driveCollegato?: boolean; pc: import('../shared/pc-remoto').PcRemoto[] }>
        stato: (pc: string) => Promise<import('../shared/pc-remoto').EsitoRemoto<{ chat: import('../shared/pc-remoto').ChatSuPc[]; chiuse?: { sessione: string; il: string }[]; salvate?: string[]; computer?: { nome: string } }>>
        trova: (pc: string, chat: import('../shared/pc-remoto').ChatRemota) => Promise<import('../shared/pc-remoto').EsitoRemoto<import('../shared/pc-remoto').ChatSuPc | undefined>>
        apertura: (p: { pcId: string; cwd: string; sessione?: string; titolo?: string }) => Promise<{ pc: string; nome: string; qui: boolean; messaggio: string }>
        chiusaACasa: (p: { sessione: string; titolo?: string; pcNome: string; il: string }) => Promise<void>
        nonApertaACasa: (p: { sessione: string; titolo?: string; pcNome: string; workspace?: string }) => Promise<void>
        segnaChiusa: (sessione: string, titolo?: string, da?: string) => Promise<void>
        storia: (pc: string, chat: string, da: number, quante: number) => Promise<import('../shared/pc-remoto').EsitoRemoto<import('../shared/pc-remoto').StoriaRemota>>
        scrivi: (pc: string, chat: string, testo: string, idMessaggio?: string) => Promise<import('../shared/pc-remoto').EsitoRemoto<{ fatto: boolean }>>
        scegli: (pc: string, chat: string, opzione: string) => Promise<import('../shared/pc-remoto').EsitoRemoto<{ fatto: boolean }>>
        pin: (pc: string, chat: string, pin: string) => Promise<import('../shared/pc-remoto').EsitoRemoto<{ fatto: boolean }>>
        riprendi: (pc: string, cartella: string, sessione: string, workspace?: string) => Promise<import('../shared/pc-remoto').EsitoRemoto<{ fatto: boolean }>>
        apri: (pc: string, cartella: string) => Promise<import('../shared/pc-remoto').EsitoRemoto<{ fatto: boolean }>>
        sottofondo: (p: { pc: string; cwd: string; sessione: string; titolo?: string; testo?: string; id?: string; workspace?: string }) => Promise<import('../shared/pc-remoto').EsitoRemoto<import('../shared/sottofondo').StatoSottofondo> & { vecchio?: boolean }>
        sottofondoStato: (pc: string, sessione: string) => Promise<{ stato?: import('../shared/sottofondo').StatoSottofondo; errore?: string; attesi: string[] } | undefined>
        prova: (pc: string) => Promise<{ ok: true; indirizzo: string; ms: number; versione?: string } | { ok: false; motivo: string; messaggio: string }>
        altroveDi: (cwds: string[]) => Promise<Record<string, { id: string; nome: string }>>
        daDove: (p: { cwd: string; sessionUuid?: string }) => Promise<import('@shared/apertura-chat').Apertura>
      }
      autopilota: {
        /** L'elenco leggero (0.85.2): di decisioni, dialogo e modifiche solo la coda. */
        elenca: () => Promise<Autopilota[]>
        /** Un autopilota intero (0.85.2); con la versione che hai, se non è cambiato torna senza l'autopilota. */
        dettaglio: (id: string, versione?: string) => Promise<{ versione?: string; autopilota?: Autopilota }>
        crea: (p: NuovoAutopilota) => Promise<Autopilota>
        /** Gli scrivi: torna subito la ricevuta, la risposta compare nel suo `dialogo`. */
        dialoga: (id: string, testo: string) => Promise<RicevutaDialogo>
        /** «Pulisci adesso» (0.85.2): copie e rami delle chat concluse; torna la riga del riepilogo. */
        pulisci: () => Promise<string>
        nota: (id: string, testo: string) => Promise<void>
        /** Una consegna il cui workspace non è sullo schermo (0.60.8): la porta il Core in sottofondo. */
        inSottofondo: (c: unknown) => Promise<boolean>
        file: (id: string) => Promise<import('@shared/file-autopilota').GruppoChat[]>
        diff: (id: string, chiave: string, percorso: string) => Promise<string>
        domande: () => Promise<DomandaAperta[]>
        postiChat: () => Promise<import('@shared/posti-chat').PostiChat | undefined>
        /** P1: la coda delle richieste del workspace, con le percentuali. Un servizio vecchio: `undefined`. */
        coda: (ws: string) => Promise<import('@shared/coda-richieste').VistaCoda | undefined>
        /** «Separa»: disfa l'ultima unione di una richiesta. */
        codaSepara: (ws: string, id: string) => Promise<import('@shared/coda-richieste').VistaCoda>
        /** Unisce a mano: ogni punto delle richieste unite va nominato. */
        codaUnisci: (ws: string, u: { ids: string[]; testo: string; titolo?: string; punti: import('@shared/coda-richieste').PuntoProposto[]; perche: string }) => Promise<import('@shared/coda-richieste').VistaCoda>
        /** P3: l'autopilota del workspace (vista e impostazioni). */
        orchestratore: (ws: string) => Promise<import('@shared/piano-orchestratore').VistaOrchestratore | undefined>
        impostaOrchestratore: (ws: string, p: { modello?: 'sonnet' | 'opus'; tettoSpecialisti?: number }) => Promise<import('@shared/piano-orchestratore').VistaOrchestratore>
        rispondi: (idDomanda: string, risposta: string) => Promise<void>
        avvioAlLogin: (attivare?: boolean) => Promise<{ installato: boolean; percorso: string }>
      }
      istantanee: {
        elenca: () => Promise<Istantanea[]>
        salva: (nome: string, layout: LayoutSalvato, conAutopiloti: boolean) => Promise<Istantanea[]>
        carica: (nome: string) => Promise<LayoutSalvato>
        elimina: (nome: string) => Promise<Istantanea[]>
      }
      workspace: {
        stato: () => Promise<StatoWorkspace>
        dove: () => Promise<Record<string, string>>
        remote: () => Promise<Record<string, number>>
        altriPc: () => Promise<{ pc: string; nome: string; workspace: string[] }[]>
        apriDaAltroPc: (pc: string, nome: string) => Promise<{ ok: boolean; messaggio: string }>
        /** «Apri cartella» (0.82.0): la cartella del progetto del workspace o della chat, in Esplora file. */
        apriCartella: (q: { workspace: string } | { chat: string }) => Promise<{ ok: boolean; messaggio: string }>
        crea: (nome: string, cartella?: string) => Promise<StatoWorkspace>
        elimina: (nome: string) => Promise<StatoWorkspace>
        recupero: () => Promise<import('@shared/workspace-recupero').VoceRecupero[]>
        ripristina: (nome: string, eliminatoIl: string) => Promise<StatoWorkspace>
        rinomina: (vecchio: string, nuovo: string) => Promise<StatoWorkspace>
        /** «Recenti» del menu (0.82.0): dove Nicholas è andato per ultimo, e segnarne uno. */
        recenti: () => Promise<string[]>
        recente: (nome: string) => Promise<string[]>
        cambia: (nome: string, layout: LayoutSalvato, congedate?: string[]) => Promise<LayoutSalvato>
        migra: (da: string, nome: string, layout: LayoutSalvato) => Promise<LayoutSalvato>
        spostaChat: (nome: string, pane: PaneSalvato) => Promise<boolean>
        onCambiato: (cb: (s: StatoWorkspace & { precedente: string }) => void) => () => void
        onRinominato: (
          cb: (r: { vecchio: string; nuovo: string; attivo: string }) => void
        ) => () => void
        onRipristinato: (cb: (s: StatoWorkspace) => void) => () => void
      }
      preparazione: {
        stato: () => Promise<StatoPreparazione>
        installa: () => Promise<string>
        accedi: () => Promise<string>
      }
      risoluzione: {
        apri: (r: { cwd: string; sessionUuid: string; titolo: string; caso: string; titoloDiagnosi: string; dettaglio: string; ultimeRighe: string[] }) => Promise<{ ptyId: string; dossier: string }>
      }
      appunti: {
        leggi: () => string
        scrivi: (testo: string) => void
      }
      /** La scheda Domande del PC: le rotte del telefono per rispondere (0.36.0). */
      domande: {
        chiama: (percorso: string, corpo?: unknown) => Promise<{ stato: number; corpo: unknown }>
      }
    }
  }
}

export {}
