import type { HostToCore } from '@shared/protocol'
import type { SpawnRequest } from '../main/validation'
import type { Avanzamento, IndexOutcome, SessionSummary } from '@shared/types'
import type { LayoutSalvato, PaneSalvato } from '@shared/workspace'
import type { Autopilota } from '@shared/autopilota'
import type { StatoWorkspace } from '../main/ipc'
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
          chat: { id: string; titolo: string; cwd: string; sessione?: string; ultimaRiga?: string; coda?: string[]; codaGrezza?: string[] }[]
        ) => void
        suApertura: (cb: (m: { cartella: string; modello?: string; sessione?: string }) => void) => () => void
        suSalvataggio: (cb: (nome: string) => void) => () => void
        suConsegna: (cb: (c: unknown) => void) => () => void
        suChatArrivata: (cb: (m: { workspace: string; pane: PaneSalvato }) => void) => () => void
        suChiusura: (cb: (idChat: string) => void) => () => void
        suRinomina: (cb: (m: { chat: string; nome: string }) => void) => () => void
        suScrittura: (cb: (m: { chat: string; testo: string }) => void) => () => void
        suWorkspace: (cb: (nome: string) => void) => () => void
      }
      preferenze: {
        leggi: () => Promise<import('@shared/preferenze').Preferenze>
        imposta: (p: import('@shared/preferenze').Preferenze) => Promise<import('@shared/preferenze').Preferenze>
        suCambio: (cb: (p: import('@shared/preferenze').Preferenze) => void) => () => void
      }
      quaderno: {
        elenca: (cwd: string) => Promise<import('@shared/quaderno').Scheda[]>
        leggi: (cwd: string, file: string) => Promise<import('@shared/quaderno').Scheda | undefined>
        scrivi: (cwd: string, scheda: { titolo: string; corpo: string; tag?: string[]; file?: string }) => Promise<import('@shared/quaderno').Scheda>
        apri: (cwd: string) => Promise<void>
        elimina: (cwd: string, file: string) => Promise<boolean>
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
        stato: () => Promise<{ configurato: boolean; connesso: boolean }>
        connetti: () => Promise<{ ok: boolean; messaggio?: string }>
        disconnetti: () => Promise<void>
      }
      sync: {
        stato: () => Promise<{
          driveConnesso: boolean; haCassaforte: boolean; sbloccato: boolean
          versione?: string; ultimoSalvataggio?: string
        }>
        info: () => Promise<{ file: number; byte: number }>
        creaPassphrase: (passphrase: string) => Promise<{ ok: boolean; chiaveRecupero?: string; messaggio?: string }>
        sblocca: (passphrase: string) => Promise<{ ok: boolean; messaggio?: string }>
        sbloccaRecupero: (codice: string) => Promise<{ ok: boolean; messaggio?: string }>
        cambiaPassphrase: (vecchia: string, nuova: string) => Promise<{ ok: boolean; messaggio?: string }>
        blocca: () => Promise<void>
        salva: (forza?: boolean) => Promise<{ ok: boolean; voci?: number; conflitto?: boolean; messaggio?: string }>
        ripristina: () => Promise<{ ok: boolean; scritti?: number; niente?: boolean; messaggio?: string }>
        onProgresso: (cb: (p: {
          fase: 'raccolgo' | 'comprimo' | 'cifro' | 'carico' | 'scarico' | 'decifro' | 'ripristino'
          fatto?: number; totale?: number
        }) => void) => () => void
      }
      log: {
        apri: () => Promise<string>
        percorso: () => Promise<string>
      }
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
        titoloFinestra: (testo: string) => void
      }
      aggiornamenti: {
        stato: () => Promise<StatoAggiornamento>
        cerca: () => Promise<void>
        scarica: () => Promise<void>
        installa: () => Promise<void>
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
      etichette: {
        leggi: () => Promise<Record<string, string>>
        imposta: (uuid: string, testo: string) => Promise<Record<string, string>>
      }
      layout: {
        carica: () => Promise<LayoutSalvato>
        salva: (l: LayoutSalvato, workspace?: string) => void
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
      autopilota: {
        elenca: () => Promise<Autopilota[]>
        crea: (p: NuovoAutopilota) => Promise<Autopilota>
        /** Il via a chi si è preparato e aspetta di essere letto. */
        vai: (id: string) => Promise<Autopilota>
        /** Cambia obiettivo, criteri o compiti. Quello che non nomini resta com'era. */
        modifica: (id: string, cambio: CambioAutopilota) => Promise<Autopilota>
        /** Glielo dici a parole: traduce lui in criteri e compiti, e lo applica. */
        parla: (id: string, testo: string) => Promise<RispostaParlata>
        /** Rimette com'era prima dell'ultima cosa che gli hai detto. */
        disfa: (id: string) => Promise<Autopilota>
        ferma: (id: string) => Promise<void>
        riprendi: (id: string) => Promise<void>
        riprendiAlRiavvio: (id: string, riprendi: boolean) => Promise<void>
        elimina: (id: string) => Promise<void>
        domande: () => Promise<DomandaAperta[]>
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
        crea: (nome: string) => Promise<StatoWorkspace>
        elimina: (nome: string) => Promise<StatoWorkspace>
        rinomina: (vecchio: string, nuovo: string) => Promise<StatoWorkspace>
        cambia: (nome: string, layout: LayoutSalvato) => Promise<LayoutSalvato>
        migra: (da: string, nome: string, layout: LayoutSalvato) => Promise<LayoutSalvato>
        spostaChat: (nome: string, pane: PaneSalvato) => Promise<boolean>
        onCambiato: (cb: (s: StatoWorkspace & { precedente: string }) => void) => () => void
        onRinominato: (
          cb: (r: { vecchio: string; nuovo: string; attivo: string }) => void
        ) => () => void
        onRipristinato: (cb: (s: StatoWorkspace) => void) => () => void
      }
      novita: {
        daMostrare: () => Promise<Novita | undefined>
      }
      preparazione: {
        stato: () => Promise<StatoPreparazione>
        installa: () => Promise<string>
        accedi: () => Promise<string>
      }
      appunti: {
        leggi: () => string
        scrivi: (testo: string) => void
      }
    }
  }
}

export {}
