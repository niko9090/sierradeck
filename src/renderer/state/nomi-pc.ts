import { create } from 'zustand'
import { useEffect } from 'react'
import { nomeDaMostrare, sottotitoloPc } from '@shared/nome-pc'
import type { BattitoPc } from '@shared/posta'

/**
 * I nomi dei PC, freschi (0.52.4).
 *
 * Un riquadro remoto, una casa di una chat, un avviso si ricordano il nome del
 * PC **di quando sono nati**: se poi Nicholas gli dà un nome, lì resterebbe
 * l'hostname. Qui si tengono il nome scelto e l'hostname di ogni PC dai
 * battiti, così chi mostra un PC lo cerca per id e trova il nome di adesso.
 */
type Voce = { nome: string; host?: string }
type Stato = {
  io?: { id: string; nome: string; host: string; nomeScelto?: string }
  pc: Record<string, Voce>
  ricarica: () => void
}

let avviato = false

export const useNomiPc = create<Stato>((set) => ({
  pc: {},
  ricarica: () => {
    void window.gestore.posta.identita().then((io) => set({ io })).catch(() => undefined)
    void window.gestore.posta.pc().then((elenco: BattitoPc[]) => {
      const pc: Record<string, Voce> = {}
      for (const b of elenco) {
        const host = sottotitoloPc(b)
        pc[b.pcId] = { nome: nomeDaMostrare(b), ...(host !== undefined ? { host } : {}) }
      }
      set({ pc })
    }).catch(() => undefined)
  }
}))

/** Avvia la lettura (una volta sola per finestra): subito, ogni 30 s e quando questo PC cambia nome. */
export function useAvviaNomiPc(): void {
  useEffect(() => {
    if (avviato) return
    avviato = true
    const { ricarica } = useNomiPc.getState()
    ricarica()
    const t = setInterval(ricarica, 30_000)
    const via = window.gestore.posta.suNomeCambiato?.((io) => useNomiPc.setState({ io }))
    return () => { clearInterval(t); via?.(); avviato = false }
  }, [])
}

/**
 * Il nome di adesso di un PC dato il suo id, con il nome ricordato come
 * ripiego (un PC mai visto nei battiti, o un id vuoto). Anche per questo PC.
 */
export function useNomePc(id: string | undefined, ricordato: string): Voce {
  const io = useNomiPc((s) => s.io)
  const voce = useNomiPc((s) => (id !== undefined && id !== '' ? s.pc[id] : undefined))
  if (id !== undefined && io !== undefined && id === io.id) {
    const host = sottotitoloPc(io)
    return { nome: io.nome, ...(host !== undefined ? { host } : {}) }
  }
  if (voce !== undefined) return voce
  return { nome: ricordato }
}
