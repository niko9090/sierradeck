import { create } from 'zustand'
import type { Avanzamento, IndexOutcome, SessionSummary } from '@shared/types'

export type Esito = IndexOutcome

type State = {
  sessions: SessionSummary[]
  progress: Avanzamento | undefined
  /** Ultimo errore da mostrare all'utente; `undefined` quando tutto va bene. */
  errore: string | undefined
  /** Esito dell'ultima indicizzazione: serve a dire quanti file sono falliti. */
  esito: Esito | undefined
  load: () => Promise<void>
  setProgress: (p: Avanzamento | undefined) => void
  setEsito: (e: Esito | undefined) => void
}

export const useSessionStore = create<State>((set) => ({
  sessions: [],
  progress: undefined,
  errore: undefined,
  esito: undefined,
  load: async () => {
    try {
      // Il tetto era 500 e su questa macchina le sessioni sono 742: 242 chat
      // non comparivano nell'elenco né entravano nel conto dei consumi, senza
      // che niente lo dicesse. Il tetto resta solo come argine a un indice
      // impazzito: sono righe piatte, non i file.
      const sessions = await window.gestore.sessions.list({ limit: 20000 })
      set({ sessions, errore: undefined })
    } catch (err) {
      // Senza questo ramo il rigetto resterebbe una unhandled rejection nei
      // soli strumenti di sviluppo: l'elenco resterebbe vuoto senza spiegazione.
      set({ errore: `Impossibile leggere l'indice delle sessioni: ${String(err)}` })
    }
  },
  setProgress: (progress) => set({ progress }),
  setEsito: (esito) => set({ esito })
}))
