import { useCallback, useEffect, useState } from 'react'
import { conMisura, leggiArchivioMisure, type ArchivioMisure } from '@shared/misure-pannelli'

/**
 * Le misure delle sezioni scelte col mouse (13/11), su questo PC: in
 * localStorage come la colonna Specialisti, fuori dalle impostazioni che vanno
 * al telefono. Tutti quelli che le usano si aggiornano insieme (evento).
 */
const CHIAVE = 'sierradeck.misure'
const EVENTO = 'sierradeck:misure'

export function leggiMisure(): ArchivioMisure {
  try { return leggiArchivioMisure(JSON.parse(localStorage.getItem(CHIAVE) ?? '{}')) } catch { return {} }
}

export function scriviMisura(chiave: string, valore: number | undefined): void {
  const nuovo = conMisura(leggiMisure(), chiave, valore)
  try { localStorage.setItem(CHIAVE, JSON.stringify(nuovo)) } catch { /* resta com'è fino al riavvio */ }
  window.dispatchEvent(new Event(EVENTO))
}

/** La misura salvata di quella sezione (`undefined` = quella del foglio di stile) e come cambiarla. */
export function useMisura(chiave: string): [number | undefined, (v: number | undefined) => void] {
  const [valore, setValore] = useState<number | undefined>(() => leggiMisure()[chiave])
  useEffect(() => {
    const rileggi = (): void => setValore(leggiMisure()[chiave])
    rileggi()
    window.addEventListener(EVENTO, rileggi)
    return () => window.removeEventListener(EVENTO, rileggi)
  }, [chiave])
  const imposta = useCallback((v: number | undefined) => { setValore(v); scriviMisura(chiave, v) }, [chiave])
  return [valore, imposta]
}

/**
 * Per un bordo da trascinare: la misura da disegnare (quella in mano durante il
 * trascinamento, altrimenti la salvata) e il gestore del `Divisore`, che salva
 * solo al rilascio, non a ogni pixel.
 */
export function useMisuraTrascinabile(chiave: string): { larghezza: number | undefined; onMisura: (v: number | undefined, fine: boolean) => void } {
  const [salvata, salva] = useMisura(chiave)
  const [inMano, setInMano] = useState<number | undefined>(undefined)
  const onMisura = useCallback((v: number | undefined, fine: boolean) => {
    if (fine) { setInMano(undefined); salva(v) } else setInMano(v)
  }, [salva])
  return { larghezza: inMano ?? salvata, onMisura }
}
