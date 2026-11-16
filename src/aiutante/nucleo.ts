import { creaLavoratoreAiuto, type FineLavoro, type LavoratoreAiuto } from '../autopilot-host/aiuto-lavoratore'
import type { AvviaProcesso } from '../autopilot-host/processo-claude'
import type { MisuraPc, RegolazionePosti } from '@shared/posti-chat'
import { CODA_AIUTO_MAX, type LavoroOspitato } from '@shared/aiuto-rete'
import { causaDelMotivo, motivoBreve, type CausaFallimento } from '@shared/aiuto-esito'
import { limiteDaFine, postiAiutante, type PerchePosti } from './regole'

/**
 * **Il cuore dell'Aiutante** (12/11): il lavoratore di «Aiuta la rete» (lo
 * stesso del servizio del programma completo, `aiuto-lavoratore.ts`) e la
 * strada che le rotte `/api/aiuto/*` prendono per arrivarci.
 *
 * Nel programma completo le rotte passano dal servizio degli autopiloti
 * (`autopilot-host/server.ts`, `/aiuto/*`); qui non c'è un servizio: le stesse
 * risposte le dà `servizio()` nello stesso processo. Un rifiuto è un errore
 * con il motivo, come quello che il programma completo riceve dal servizio:
 * `rotte-aiuto.ts` lo gira a chi chiede allo stesso modo.
 */

/** Ogni quanto chi aspetta in coda controlla se c'è un posto (la misura del PC sale anche senza che un lavoro finisca). */
const CODA_GIRO_MS = 10_000

export type Nucleo = {
  lavoratore: LavoratoreAiuto
  /** La rotta `/aiuto/<cosa>` (senza `/api`), come quella del servizio. */
  servizio: (percorso: string, corpo?: Record<string, unknown>) => Promise<unknown>
  posti: () => { liberi: number; tetto: number; perche: PerchePosti }
  /** Fino a quando il piano di Claude è esaurito (ms), se lo è. */
  limiteFino: () => number | undefined
  ospitati: () => LavoroOspitato[]
  /** I lavori che aspettano un posto, in ordine di arrivo. */
  inCoda: () => LavoroOspitato[]
  /** Fa partire chi aspetta, finché ci sono posti (lo chiama anche un giro ogni pochi secondi). */
  avanzaCoda: () => void
  /** Come è finito un lavoro (lo chiama il lavoratore; esposto per le prove). */
  suFine: (f: FineLavoro) => void
  /** 1.0.3: l'ultimo lavoro non riuscito, con il motivo corto e la causa (per la finestra). */
  ultimoFallito: () => UltimoFallito | undefined
}

export type UltimoFallito = { il: number; id: string; perPc?: string; causa: CausaFallimento; motivo: string }

export function creaNucleo(x: {
  /** `<dati dell'Aiutante>/aiuto`. */
  cartella: string
  /** Dove copie, moduli e pacchetti (il disco delle prove se la Temp è piena). */
  lavoro?: string
  avvia: AvviaProcesso
  misura: () => MisuraPc
  regolazione: () => { postiChat?: RegolazionePosti; postiScelti?: number }
  pronto: () => boolean
  /** 1.0.3: Claude non va davvero (il motivo): 0 posti. */
  claudeBloccato?: () => string | undefined
  /** 1.0.3: un lavoro è fallito (per ricontrollare subito Claude se la causa è l'accesso o il piano). */
  suFallito?: (f: UltimoFallito) => void
  inScarico: () => boolean
  adesso?: () => number
  log: (r: string) => void
  /** I blocchi: vanno nello storico degli errori, che parte da solo verso il PC di sviluppo. */
  errore: (r: string) => void
  /** Solo per le prove: il lavoratore già fatto. */
  lavoratore?: LavoratoreAiuto
}): Nucleo {
  const adesso = x.adesso ?? Date.now
  let limite: number | undefined
  let ultimo: UltimoFallito | undefined
  const suFine = (f: FineLavoro): void => {
    if (f.stato === 'fallito') {
      const causa = f.causa ?? causaDelMotivo(f.motivo ?? f.testo)
      ultimo = { il: adesso(), id: f.id, ...(f.perPc !== undefined ? { perPc: f.perPc } : {}), causa, motivo: motivoBreve(f.motivo ?? f.testo ?? 'motivo non detto') }
      try { x.suFallito?.(ultimo) } catch { /* solo un avviso */ }
    }
    const fino = limiteDaFine(f, adesso())
    if (fino !== undefined) {
      const nuovo = limite === undefined || limite <= adesso()
      limite = fino
      if (nuovo) x.errore(`[aiuto] il piano di Claude su questo Aiutante ha finito la quota: niente lavori nuovi fino alle ${new Date(fino).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`)
      return
    }
    if (f.stato === 'fallito') x.errore(`[aiuto] lavoro ${f.id}${f.ruolo !== undefined ? ` (${f.ruolo})` : ''} per ${f.perPc ?? 'un altro PC'} non riuscito: ${(f.motivo ?? 'motivo non detto').slice(0, 300)}`)
  }
  const lavoratore = x.lavoratore ?? creaLavoratoreAiuto({
    cartella: x.cartella,
    ...(x.lavoro !== undefined ? { lavoro: x.lavoro } : {}),
    avvia: x.avvia,
    adesso,
    log: (r) => x.log(`[aiuto] ${r}`),
    suFine: (f) => { suFine(f); try { avanzaCoda() } catch { /* lo riprova il giro della coda */ } }
  })
  const posti = (): { liberi: number; tetto: number; perche: PerchePosti } => {
    const r = x.regolazione()
    return postiAiutante({
      misura: x.misura(),
      inCorso: lavoratore.inCorso(),
      ...(r.postiChat !== undefined ? { regolazione: r.postiChat } : {}),
      ...(r.postiScelti !== undefined ? { scelti: r.postiScelti } : {}),
      pronto: x.pronto(),
      ...(() => { const b = x.claudeBloccato?.(); return b !== undefined ? { claudeBloccato: b } : {} })(),
      inScarico: x.inScarico(),
      ...(limite !== undefined ? { limiteFino: limite } : {}),
      adesso: adesso()
    })
  }
  const no = (motivo: string): never => { throw new Error(motivo) }
  /** Un posto si è liberato (un lavoro è finito o fermato, o la misura è salita): parte chi aspetta, in ordine di arrivo. */
  const avanzaCoda = (): void => {
    while (lavoratore.inCoda().length > 0 && posti().liberi > 0) {
      if (!lavoratore.avanzaCoda()) break
    }
  }
  const giroCoda = setInterval(() => { try { avanzaCoda() } catch { /* al prossimo giro */ } }, CODA_GIRO_MS)
  giroCoda.unref?.()
  const servizio = async (percorso: string, corpo: Record<string, unknown> = {}): Promise<unknown> => {
    switch (percorso) {
      case '/aiuto/posti': {
        const p = posti()
        return { liberi: p.liberi, tetto: p.tetto, inCorso: lavoratore.inCorso() }
      }
      case '/aiuto/pezzo': {
        // Un lavoro nuovo (il primo pezzo) solo se c'è posto: con l'aggiornamento in attesa, il limite
        // del piano o un requisito mancante l'Aiutante dice 0 posti, ma chi chiedeva può averli letti prima.
        // Se è solo pieno, il lavoro può aspettare in coda (fino al tetto); per ogni altro motivo si rifiuta.
        if (corpo.n === 0) {
          const p = posti()
          if (p.liberi <= 0 && !(p.perche === 'pieno' && lavoratore.inCoda().length < CODA_AIUTO_MAX)) return no('questo Aiutante adesso non ha posti liberi')
        }
        const e = lavoratore.pezzo({ lavoro: corpo.lavoro, n: corpo.n, totale: corpo.totale, dati: corpo.dati })
        return e.ok ? e : no(e.motivo)
      }
      case '/aiuto/avvia': {
        // Il lavoro che arriva conta già nei posti (sta ricevendo): aspetta se ce ne sono più del tetto, o se altri aspettano prima.
        const accoda = lavoratore.inCoda().length > 0 || lavoratore.inCorso() > posti().tetto
        const e = lavoratore.avvia(corpo, accoda)
        return e.ok ? { fatto: true } : no(e.motivo)
      }
      case '/aiuto/stato': {
        const v = lavoratore.stato(corpo.lavoro)
        return v ?? no('lavoro sconosciuto su questo PC')
      }
      case '/aiuto/ritira': {
        const e = lavoratore.ritira({ lavoro: corpo.lavoro, n: corpo.n })
        return e.ok ? e : no(e.motivo)
      }
      case '/aiuto/chiudi': { const fatto = lavoratore.chiudi(corpo.lavoro); avanzaCoda(); return { fatto } }
      case '/aiuto/ferma': { const fatto = lavoratore.ferma(corpo.lavoro); avanzaCoda(); return { fatto } }
      default: return no('rotta sconosciuta')
    }
  }
  return { lavoratore, servizio, posti, limiteFino: () => (limite !== undefined && limite > adesso() ? limite : undefined), ospitati: () => lavoratore.ospitati(), inCoda: () => lavoratore.inCoda(), avanzaCoda, suFine, ultimoFallito: () => ultimo }
}
