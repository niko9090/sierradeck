import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  GIORNI_RECUPERO_RIASSETTO, componiRiepilogo, daFare, mb, percentuale, rigaRiepilogo, saltatiInUso,
  type GiornaleRiassetto, type StatoRiassetto
} from '@shared/riassetto'
import { CARTELLA_COPIE, leggiStampo, type EsitoCopia } from '../copie-di-versione'
import { caricaGiornale, creaMotore, type Motore } from './motore'
import { costruisciPassi, type DipendenzePassi } from './passi'
import { cartellaVersione, liberaRecuperoRiassetto, pesoNelRecupero, ripristinaRiassetto } from './recupero'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import { fileGiornale } from './motore'

/**
 * Il riassetto del programma: decide se gira, fa la fase A (subito, prima
 * delle finestre) e la fase B (quando il servizio è pronto, con i suoi
 * tentativi), e risponde alla finestra: lo stato, «Annulla», «Libera
 * subito», «Chiudi». Niente Electron qui dentro: lo collega `programma.ts`.
 */

export type OpzioniRiassetto = Omit<DipendenzePassi, 'copiaDiVersione'> & {
  dati: string
  versione: string
  /** L'esito di `mettiAlSicuroLoStato` di questo avvio. */
  copia: Pick<EsitoCopia, 'fatta' | 'da'>
  log: (m: string) => void
  /** Lo stato per la finestra, a ogni passo e alla fine. */
  annuncia?: (s: StatoRiassetto) => void
  ora?: () => number
  /** Fra un tentativo della fase B e l'altro (PC carico, servizio non pronto). Di serie 5 minuti. */
  riprovaMs?: number
  /** Quanti tentativi della fase B in un avvio. Di serie 6: poi al prossimo avvio. */
  tentativiB?: number
  /** Per i test: come aspettare. */
  aspetta?: (ms: number) => Promise<void>
}

export type Riassetto = {
  /** Gira in questo avvio? */
  attivo: boolean
  faseA: () => void
  /** La fase B, con i suoi tentativi. Non solleva. */
  faseB: () => Promise<void>
  stato: () => StatoRiassetto | undefined
  annulla: () => { ok: boolean; messaggio: string }
  liberaSubito: () => { ok: boolean; messaggio: string }
  chiudi: () => void
}

/** C'è la copia di versione fatta per questo aggiornamento, con dentro qualcosa? */
export function copiaDiVersionePresente(dati: string, versione: string): boolean {
  const s = leggiStampo(dati)
  if (s === undefined || s.versione !== versione) return false
  const radice = join(dati, CARTELLA_COPIE)
  const da = s.precedente ?? 'sconosciuta'
  let nomi: string[] = []
  try { nomi = readdirSync(radice) } catch { return false }
  return nomi.some((n) => {
    if (!n.startsWith(`${da}-`)) return false
    try { return readdirSync(join(radice, n)).length > 0 } catch { return false }
  })
}

function statoDa(g: GiornaleRiassetto | undefined, m: Motore | undefined, dati: string): StatoRiassetto | undefined {
  if (g === undefined) return undefined
  const progresso = m?.progresso() ?? {
    versione: g.versione,
    percentuale: percentuale(g, new Map()),
    saltatiInUso: saltatiInUso(g),
    finito: g.fatto !== undefined
  }
  return {
    progresso,
    ...(g.fatto !== undefined ? { riepilogo: { ...componiRiepilogo(g, { cartellaRecupero: cartellaVersione(dati, g.versione) }), byteInRecupero: g.liberatoIl !== undefined || g.annullatoIl !== undefined ? 0 : pesoNelRecupero(dati, g.versione) } } : {}),
    chiuso: g.chiusoIl !== undefined,
    annullato: g.annullatoIl !== undefined,
    liberato: g.liberatoIl !== undefined
  }
}

export function creaRiassetto(o: OpzioniRiassetto): Riassetto {
  const ora = o.ora ?? Date.now
  const aspetta = o.aspetta ?? ((ms: number) => new Promise<void>((r) => { const t = setTimeout(r, ms); t.unref?.() }))
  const letto = caricaGiornale(o.dati)
  const attivo = daFare(letto, { versione: o.versione, copiaAppenaFatta: o.copia.fatta, primoAvvio: o.copia.da === 'sconosciuta' })
  let motore: Motore | undefined
  const annuncia = (): void => {
    const s = statoDa(motore?.giornale() ?? caricaGiornale(o.dati), motore, o.dati)
    if (s !== undefined) { try { o.annuncia?.(s) } catch { /* la finestra non ferma niente */ } }
  }
  if (attivo) {
    motore = creaMotore({
      dati: o.dati,
      versione: o.versione,
      passi: costruisciPassi({ ...o, copiaDiVersione: () => copiaDiVersionePresente(o.dati, o.versione) }),
      ora,
      log: o.log,
      progresso: () => annuncia()
    })
  }

  const chiudiSeFinito = (): void => {
    if (motore === undefined) return
    const prima = motore.giornale().fatto
    if (!motore.chiudiSeFinito() || prima !== undefined) return
    const r = componiRiepilogo(motore.giornale(), { cartellaRecupero: cartellaVersione(o.dati, o.versione) })
    o.log(`[riassetto] ${rigaRiepilogo(r)}`)
    annuncia()
  }

  let fermo: string | undefined
  let faseBInCorso: Promise<void> | undefined

  /** Scrive sul giornale di chi c'è (anche di un riassetto di prima, per Annulla e Chiudi). */
  const scriviGiornale = (cambia: (g: GiornaleRiassetto) => GiornaleRiassetto): GiornaleRiassetto | undefined => {
    if (motore !== undefined) { motore.scrivi(cambia); return motore.giornale() }
    const g = caricaGiornale(o.dati)
    if (g === undefined) return undefined
    const nuovo = cambia(g)
    scriviJsonAtomico(fileGiornale(o.dati), nuovo, 'riassetto')
    return nuovo
  }
  const giornale = (): GiornaleRiassetto | undefined => motore?.giornale() ?? caricaGiornale(o.dati)

  return {
    attivo,
    faseA: () => {
      if (motore === undefined) return
      o.log(`[riassetto] comincio il riassetto della ${o.versione}${letto?.versione === o.versione ? ' (riprendo da dove era rimasto)' : ''}`)
      const r = motore.eseguiFaseSincrona('A')
      fermo = r.fermo
      if (fermo !== undefined) o.log(`[riassetto] fermo fino al prossimo avvio: ${fermo}`)
      chiudiSeFinito()
    },
    faseB: () => {
      if (motore === undefined || fermo !== undefined) return Promise.resolve()
      if (faseBInCorso !== undefined) return faseBInCorso
      const m = motore
      faseBInCorso = (async () => {
        const tentativi = o.tentativiB ?? 6
        for (let i = 0; i < tentativi; i += 1) {
          const r: { fermo?: string; rimandati: string[] } = await m.eseguiFase('B').catch((err: unknown) => { o.log(`[riassetto] fase B: ${String(err)}`); return { rimandati: [] as string[] } })
          chiudiSeFinito()
          if (m.giornale().fatto !== undefined || r.fermo !== undefined) return
          if (r.rimandati.length === 0) return
          if (i < tentativi - 1) await aspetta(o.riprovaMs ?? 5 * 60_000)
        }
        o.log('[riassetto] alcuni passi aspettano ancora: riprovo al prossimo avvio')
      })().finally(() => { faseBInCorso = undefined })
      return faseBInCorso
    },
    stato: () => statoDa(giornale(), motore, o.dati),
    annulla: () => {
      const g = giornale()
      if (g === undefined) return { ok: false, messaggio: 'Non c’è un riassetto da annullare.' }
      if (g.liberatoIl !== undefined) return { ok: false, messaggio: 'Il recupero del riassetto è già stato svuotato: non c’è più niente da rimettere.' }
      if (g.annullatoIl !== undefined) return { ok: false, messaggio: 'Il riassetto è già stato annullato.' }
      const fine = Date.parse(g.fatto ?? g.iniziato) + GIORNI_RECUPERO_RIASSETTO * 86_400_000
      if (ora() > fine) return { ok: false, messaggio: 'Sono passati più di 30 giorni: il recupero del riassetto non c’è più.' }
      const r = ripristinaRiassetto(o.dati, g.versione, ora)
      scriviGiornale((x) => ({ ...x, annullatoIl: new Date(ora()).toISOString() }))
      o.log(`[riassetto] annullato: ${r.ripristinati} cose rimesse al loro posto${r.nonRipristinati.length > 0 ? `, ${r.nonRipristinati.length} no: ${r.nonRipristinati.slice(0, 3).join('; ')}` : ''}`)
      annuncia()
      return {
        ok: r.nonRipristinati.length === 0,
        messaggio: `Rimesse al loro posto ${r.ripristinati} cose.${r.nonRipristinati.length > 0 ? ` ${r.nonRipristinati.length} no: ${r.nonRipristinati.slice(0, 3).join('; ')}.` : ''} Le cache svuotate e le voci tolte dall’indice si rifanno da sole.`
      }
    },
    liberaSubito: () => {
      const g = giornale()
      if (g === undefined) return { ok: false, messaggio: 'Non c’è un riassetto.' }
      if (g.fatto === undefined) return { ok: false, messaggio: 'Il riassetto non è ancora finito.' }
      if (g.annullatoIl !== undefined || g.liberatoIl !== undefined) return { ok: false, messaggio: 'Il recupero del riassetto è già vuoto.' }
      const r = liberaRecuperoRiassetto(o.dati, g.versione)
      if (r.errori.length === 0 || !existsSync(cartellaVersione(o.dati, g.versione))) scriviGiornale((x) => ({ ...x, liberatoIl: new Date(ora()).toISOString() }))
      o.log(`[riassetto] recupero svuotato subito: ${mb(r.byte)}${r.errori.length > 0 ? `, ${r.errori.length} errori: ${r.errori.slice(0, 2).join('; ')}` : ''}`)
      annuncia()
      return { ok: r.errori.length === 0, messaggio: `Liberati ${mb(r.byte)}.${r.errori.length > 0 ? ` Non tutto: ${r.errori[0]}` : ''}` }
    },
    chiudi: () => {
      scriviGiornale((x) => (x.chiusoIl !== undefined ? x : { ...x, chiusoIl: new Date(ora()).toISOString() }))
      annuncia()
    }
  }
}
