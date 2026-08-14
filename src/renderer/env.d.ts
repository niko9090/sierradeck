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
        salva: (l: LayoutSalvato) => void
        suRichiesta: (dai: () => LayoutSalvato) => () => void
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
        cambia: (nome: string, layout: LayoutSalvato) => Promise<LayoutSalvato>
        migra: (da: string, nome: string, layout: LayoutSalvato) => Promise<LayoutSalvato>
        spostaChat: (nome: string, pane: PaneSalvato) => Promise<boolean>
        onCambiato: (cb: (s: StatoWorkspace & { precedente: string }) => void) => () => void
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
