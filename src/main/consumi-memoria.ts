import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import { aggiornaMemoria, leggiMemoriaConsumi, memoriaVuota, type MemoriaConsumi } from '@shared/consumi-chat'
import type { SessionSummary } from '@shared/types'

/**
 * La memoria dei consumi su disco (k-con1): `consumi-memoria.json` nella
 * cartella dati, scritta in modo atomico, con la versione dello schema. Si
 * ricarica all'avvio, così chiusure e aggiornamenti non cancellano i consumi
 * di oggi e della settimana. Con `SIERRADECK_PROVA` la cartella dati è già
 * quella della copia di prova: i dati restano isolati.
 */
export const FILE_MEMORIA_CONSUMI = 'consumi-memoria.json'

export type MemoriaConsumiSuDisco = {
  /** Aggiorna con l'indice di adesso e salva se qualcosa è cambiato. */
  aggiorna: (sessioni: readonly SessionSummary[], adesso: number) => MemoriaConsumi
  /** La memoria com'è adesso, senza toccare il disco. */
  corrente: () => MemoriaConsumi
}

export function apriMemoriaConsumi(dati: string, adessoIniziale: number = Date.now()): MemoriaConsumiSuDisco {
  const percorso = join(dati, FILE_MEMORIA_CONSUMI)
  let memoria = memoriaVuota(adessoIniziale)
  try {
    if (existsSync(percorso)) memoria = leggiMemoriaConsumi(JSON.parse(readFileSync(percorso, 'utf8')), adessoIniziale)
  } catch (err) {
    // File rovinato o illeggibile: si riparte da vuoto, e il prossimo salvataggio lo rifà sano.
    console.warn('[consumi] consumi-memoria.json non letto, riparto da vuoto:', err)
  }
  let salvato = JSON.stringify({ ...memoria, aggiornatoIl: 0 })
  return {
    corrente: () => memoria,
    aggiorna: (sessioni, adesso) => {
      memoria = aggiornaMemoria(memoria, sessioni, adesso)
      // `aggiornatoIl` cambia a ogni giro: non conta per decidere se scrivere.
      const impronta = JSON.stringify({ ...memoria, aggiornatoIl: 0 })
      if (impronta !== salvato && scriviJsonAtomico(percorso, memoria, 'consumi')) salvato = impronta
      return memoria
    }
  }
}
