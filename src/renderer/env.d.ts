import type { HostToCore } from '@shared/protocol'
import type { SpawnRequest } from '../main/validation'
import type { Avanzamento, IndexOutcome, SessionSummary } from '@shared/types'
import type { LayoutSalvato, PaneSalvato } from '@shared/workspace'
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
        ferma: (id: string) => Promise<void>
        riprendi: (id: string) => Promise<void>
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
