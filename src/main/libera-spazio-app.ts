import {
  FRASE_GROSSO_FUORI, drivePienoDa, eseguiPasso, grossoFuoriDaSierraDeck, passiDa, percentualeDrive, percentualeProcedura, ripartizioneDrive, righeDa,
  type ApiLiberaSpazio, type EsitoMemoria, type IdPasso, type InSospesoVista, type QuotaVistaApp, type VistaLiberaApp
} from '@shared/libera-spazio'
import { RECUPERO_DRIVE_PIENO_DEFAULT, type QuotaMisurata, type StatoSpazio } from '@shared/spazio-drive'

/**
 * «Libera spazio sul Drive» per l'app Android (k-310). Sul PC e sulla pagina
 * la procedura gira nella finestra; l'app invece la chiede al PC, che la tiene
 * qui: le stesse regole (`@shared/libera-spazio`), la memoria dei passi
 * toccati, il passo in corso. Così un passo lungo (contare le versioni,
 * svuotare il recupero) non dipende dalla rete del telefono: l'app lo fa
 * partire e poi rilegge la vista finché finisce.
 */

export type DipendenzeLiberaApp = {
  api: ApiLiberaSpazio
  inSospeso: () => InSospesoVista[]
  /** Il programma sa che il Drive è pieno (il freno delle scritture). */
  drivePienoSegnalato?: () => boolean
  log?: (m: string) => void
}

export type ProceduraLiberaApp = {
  /** La vista. `misura`: rilegge quota e proposte dal Drive (se no, la misura di prima). `ricomincia`: dimentica i passi toccati. */
  vista: (o?: { misura?: boolean; ricomincia?: boolean }) => Promise<VistaLiberaApp>
  /** Fa partire un passo (da fare o in errore) e torna subito con il passo «in corso». */
  esegui: (id: string) => Promise<VistaLiberaApp>
  /** Per i test: la promessa del passo che sta girando. */
  attendi: () => Promise<void>
}

function quotaVista(q: QuotaMisurata | undefined): QuotaVistaApp | undefined {
  if (q === undefined) return undefined
  const r = ripartizioneDrive(q)
  const p = percentualeDrive(q)
  return {
    ...(p !== undefined ? { percentuale: p } : {}),
    usato: q.usato,
    ...(q.limite !== undefined ? { limite: q.limite } : {}),
    sierraDeck: r.sierraDeck,
    fuori: r.fuori,
    ...(q.nelCestino !== undefined ? { nelCestino: q.nelCestino } : {})
  }
}

const testo = (e: unknown): string => (e instanceof Error ? e.message : String(e))

export function creaLiberaSpazioApp(d: DipendenzeLiberaApp): ProceduraLiberaApp {
  let memoria: Record<string, EsitoMemoria | undefined> = {}
  let contate = false
  let iniziale: QuotaMisurata | undefined
  let quota: QuotaMisurata | undefined
  let stato: StatoSpazio | undefined
  let misurata = false
  let errore: string | undefined
  let inCorso: IdPasso | undefined
  let lavoro: Promise<void> = Promise.resolve()

  const piena = (): boolean => drivePienoDa(quota, d.drivePienoSegnalato?.() === true)
  const righe = (): ReturnType<typeof righeDa> =>
    righeDa(passiDa(stato, { contate, drivePieno: piena(), recupero: RECUPERO_DRIVE_PIENO_DEFAULT }), memoria)

  const misura = async (): Promise<void> => {
    try {
      quota = await d.api.quota(true)
      stato = await d.api.stato(false)
      if (iniziale === undefined) iniziale = quota
      errore = stato === undefined && quota === undefined ? 'Non riesco a leggere il Drive: è collegato?' : stato?.errore
    } catch (e) {
      errore = `Non riesco a misurare il Drive: ${testo(e)}`
    } finally {
      misurata = true
    }
  }

  const vista = (): VistaLiberaApp => {
    const rr = righe()
    const sospese = (() => { try { return d.inSospeso() } catch { return [] } })()
    const prima = quotaVista(iniziale)
    const adesso = quotaVista(quota)
    return {
      misurata,
      percentuale: percentualeProcedura(rr),
      ...(inCorso !== undefined ? { inCorso } : {}),
      righe: rr,
      ...(prima !== undefined ? { prima } : {}),
      ...(adesso !== undefined ? { adesso } : {}),
      ...(iniziale !== undefined && quota !== undefined ? { liberati: Math.max(0, iniziale.sierraDeck.byte - quota.sierraDeck.byte) } : {}),
      drivePieno: piena(),
      ...(grossoFuoriDaSierraDeck(quota) ? { grossoFuori: FRASE_GROSSO_FUORI } : {}),
      inSospeso: sospese.map((s) => ({ titolo: s.titolo, byte: s.byte })),
      ...(errore !== undefined ? { errore } : {})
    }
  }

  return {
    vista: async (o) => {
      if (o?.ricomincia === true && inCorso === undefined) { memoria = {}; contate = false; iniziale = undefined; misurata = false }
      // Mentre un passo lavora non si rimisura: lo fa lui alla fine.
      if (inCorso === undefined && (o?.misura === true || !misurata)) await misura()
      return vista()
    },
    esegui: async (id) => {
      if (inCorso !== undefined) throw new Error('C’è già un passo in corso: aspetta che finisca.')
      if (!misurata) await misura()
      const riga = righe().find((r) => r.id === id)
      if (riga === undefined || (riga.stato !== 'da-fare' && riga.stato !== 'errore')) throw new Error('Questo passo non c’è più: misura di nuovo.')
      const { stato: _s, motivo: _m, prima: _p, dopo: _d, inSospeso: _i, ...passo } = riga
      inCorso = riga.id
      memoria = { ...memoria, [riga.id]: { stato: 'in-corso', passo } }
      d.log?.(`[libera-spazio] dall’app: «${passo.titolo}» (${passo.azione})`)
      lavoro = (async () => {
        try {
          const e = await eseguiPasso(passo, d.api, { recupero: RECUPERO_DRIVE_PIENO_DEFAULT })
          if (e.contate === true) contate = true
          memoria = { ...memoria, [passo.id]: { ...e, passo } }
          d.log?.(`[libera-spazio] «${passo.titolo}»: ${e.stato}${e.motivo !== undefined ? ` — ${e.motivo}` : ''}`)
        } catch (err) {
          memoria = { ...memoria, [passo.id]: { stato: 'errore', motivo: testo(err), passo } }
        }
        await misura()
        inCorso = undefined
      })()
      return vista()
    },
    attendi: () => lavoro
  }
}
