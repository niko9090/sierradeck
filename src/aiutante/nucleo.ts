import { creaLavoratoreAiuto, type FineLavoro, type LavoratoreAiuto } from '../autopilot-host/aiuto-lavoratore'
import type { AvviaProcesso } from '../autopilot-host/processo-claude'
import type { MisuraPc, RegolazionePosti } from '@shared/posti-chat'
import type { LavoroOspitato } from '@shared/aiuto-rete'
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

export type Nucleo = {
  lavoratore: LavoratoreAiuto
  /** La rotta `/aiuto/<cosa>` (senza `/api`), come quella del servizio. */
  servizio: (percorso: string, corpo?: Record<string, unknown>) => Promise<unknown>
  posti: () => { liberi: number; tetto: number; perche: PerchePosti }
  /** Fino a quando il piano di Claude è esaurito (ms), se lo è. */
  limiteFino: () => number | undefined
  ospitati: () => LavoroOspitato[]
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
    suFine
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
  const servizio = async (percorso: string, corpo: Record<string, unknown> = {}): Promise<unknown> => {
    switch (percorso) {
      case '/aiuto/posti': {
        const p = posti()
        return { liberi: p.liberi, tetto: p.tetto, inCorso: lavoratore.inCorso() }
      }
      case '/aiuto/pezzo': {
        // Un lavoro nuovo (il primo pezzo) solo se c'è posto: con l'aggiornamento in attesa, il limite
        // del piano o un requisito mancante l'Aiutante dice 0 posti, ma chi chiedeva può averli letti prima.
        if (corpo.n === 0 && posti().liberi <= 0) return no('questo Aiutante adesso non ha posti liberi')
        const e = lavoratore.pezzo({ lavoro: corpo.lavoro, n: corpo.n, totale: corpo.totale, dati: corpo.dati })
        return e.ok ? e : no(e.motivo)
      }
      case '/aiuto/avvia': {
        const e = lavoratore.avvia(corpo)
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
      case '/aiuto/chiudi': return { fatto: lavoratore.chiudi(corpo.lavoro) }
      case '/aiuto/ferma': return { fatto: lavoratore.ferma(corpo.lavoro) }
      default: return no('rotta sconosciuta')
    }
  }
  return { lavoratore, servizio, posti, limiteFino: () => (limite !== undefined && limite > adesso() ? limite : undefined), ospitati: () => lavoratore.ospitati(), suFine, ultimoFallito: () => ultimo }
}
