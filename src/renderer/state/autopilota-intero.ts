import { useEffect, useMemo, useState } from 'react'
import type { Autopilota } from '@shared/autopilota'
import { conIntero, eTroncato, firmaStoria } from '@shared/autopilota-leggero'

/**
 * **L'autopilota intero per chi ne mostra la storia** (0.85.2).
 *
 * L'elenco che arriva alle finestre è leggero: di decisioni, dialogo e
 * modifiche solo la coda. Basta a pannello, LED, piastrelle e «Dal vivo»; la
 * conversazione, il diario, il Punto e le linguette vogliono tutto. Chi li
 * disegna passa il suo autopilota dell'elenco da `useAutopilotaIntero` e
 * riceve quello intero: il dettaglio si chiede solo quando la storia cambia
 * (`firmaStoria`), una volta per finestra anche se lo mostrano in tre, e se
 * non è cambiato davvero non riattraversa l'IPC (la versione).
 *
 * Mentre il dettaglio arriva si mostra l'elenco: la coda è proprio la parte
 * che si vede per prima, e niente sparisce.
 */

type Voce = {
  /** L'ETag dell'ultimo dettaglio ricevuto. */
  versione?: string
  intero?: Autopilota
  /** La firma della storia per cui si è chiesto (o si sta chiedendo) il dettaglio. */
  chiesta?: string
  /** La firma che si vuole adesso: se cambia mentre una richiesta è in viaggio, se ne fa un'altra dopo. */
  voluta?: string
  inViaggio: boolean
  ascoltatori: Set<() => void>
  /** Chi tiene la voce in memoria dopo che l'ultimo se n'è andato. */
  via?: ReturnType<typeof setTimeout>
}

const voci = new Map<string, Voce>()

/** Quanto resta in memoria un autopilota intero che nessuno guarda più: riaprirlo subito non lo richiede. */
const TIENI_MS = 60_000

function voceDi(id: string): Voce {
  let v = voci.get(id)
  if (v === undefined) {
    v = { inViaggio: false, ascoltatori: new Set() }
    voci.set(id, v)
  }
  return v
}

function carica(id: string): void {
  const v = voceDi(id)
  if (v.inViaggio || v.voluta === undefined || v.voluta === v.chiesta) return
  v.inViaggio = true
  v.chiesta = v.voluta
  window.gestore.autopilota.dettaglio(id, v.versione)
    .then((r) => {
      if (r.autopilota !== undefined) {
        v.intero = r.autopilota
        v.versione = r.versione
        for (const f of v.ascoltatori) f()
      }
    })
    // Al prossimo cambio si riprova; intanto resta quello che c'era.
    .catch(() => { v.chiesta = undefined })
    .finally(() => {
      v.inViaggio = false
      carica(id)
    })
}

/** L'autopilota dell'elenco con la sua storia intera, appena arriva. */
export function useAutopilotaIntero(a: Autopilota): Autopilota
export function useAutopilotaIntero(a: Autopilota | undefined): Autopilota | undefined
export function useAutopilotaIntero(a: Autopilota | undefined): Autopilota | undefined {
  const troncato = a !== undefined && eTroncato(a)
  const firma = troncato ? firmaStoria(a) : ''
  const id = a?.id
  const [intero, setIntero] = useState<Autopilota | undefined>(() => (id !== undefined ? voci.get(id)?.intero : undefined))
  useEffect(() => {
    if (!troncato || id === undefined) return
    const v = voceDi(id)
    if (v.via !== undefined) { clearTimeout(v.via); v.via = undefined }
    const avvisa = (): void => setIntero(v.intero)
    v.ascoltatori.add(avvisa)
    if (v.intero !== undefined) setIntero(v.intero)
    v.voluta = firma
    carica(id)
    return () => {
      v.ascoltatori.delete(avvisa)
      if (v.ascoltatori.size === 0) v.via = setTimeout(() => { if (v.ascoltatori.size === 0) voci.delete(id) }, TIENI_MS)
    }
  }, [id, troncato, firma])
  return useMemo(() => (a === undefined ? undefined : conIntero(a, intero)), [a, intero])
}
