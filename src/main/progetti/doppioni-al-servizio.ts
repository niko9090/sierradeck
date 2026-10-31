import { firmaRichiestaDoppioni, type RichiestaDoppioni } from '@shared/autopiloti-doppioni'
import type { ProgettoDrive } from './registro'

/**
 * Il registro dei progetti al servizio degli autopiloti (31/10), che archivia
 * gli autopiloti doppioni (`@shared/autopiloti-doppioni`). Il registro e l'id
 * di questo PC stanno qui nel programma; gli autopiloti stanno nel servizio:
 * il programma gli manda quello che serve con `POST /orchestratore/doppioni`.
 *
 * Si manda la prima volta dopo l'avvio (quando il registro si è allineato al
 * Drive) e poi solo quando il registro cambia: la firma è quella dell'ultimo
 * invio riuscito. Il servizio non riguarda mai un autopilota già archiviato.
 */

/** La richiesta per il servizio dal registro di questo PC. Pura. */
export function richiestaDoppioni(p: { pcId: string; progetti: readonly Pick<ProgettoDrive, 'nome' | 'proprietario'>[]; nomiPc: Readonly<Record<string, string>> }): RichiestaDoppioni {
  return {
    pcId: p.pcId,
    progetti: p.progetti.map((g) => ({ nome: g.nome, ...(g.proprietario !== undefined && g.proprietario !== '' ? { proprietario: g.proprietario } : {}) })),
    nomiPc: { ...p.nomiPc }
  }
}

export type InvioDoppioni = {
  /** Manda il registro se è cambiato dall'ultimo invio riuscito. Torna se l'ha mandato. Non solleva. */
  giro: () => Promise<boolean>
}

export function creaInvioDoppioni(d: {
  richiesta: () => RichiestaDoppioni | undefined
  manda: (r: RichiestaDoppioni) => Promise<{ righe: string[]; errori: string[] }>
  log: (m: string) => void
}): InvioDoppioni {
  let ultima: string | undefined
  let fallitaDetta: string | undefined
  let inCorso = false
  return {
    async giro() {
      if (inCorso) return false
      let r: RichiestaDoppioni | undefined
      try { r = d.richiesta() } catch { return false }
      if (r === undefined || r.pcId === '') return false
      const firma = firmaRichiestaDoppioni(r)
      if (firma === ultima) return false
      inCorso = true
      try {
        const esito = await d.manda(r)
        ultima = firma
        if (esito.righe.length > 0) d.log(`[pulizia] ${esito.righe.length} autopiloti doppioni archiviati dal servizio`)
        for (const e of esito.errori.slice(0, 5)) d.log(`[pulizia] doppioni: ${e}`)
        return true
      } catch (err) {
        // Il servizio non risponde (o è di prima e non conosce la rotta): si riprova al giro dopo, detto una volta.
        if (fallitaDetta !== firma) d.log(`[pulizia] registro dei progetti non mandato al servizio, riprovo: ${String(err).slice(0, 160)}`)
        fallitaDetta = firma
        return false
      } finally {
        inCorso = false
      }
    }
  }
}
