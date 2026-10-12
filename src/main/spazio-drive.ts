import {
  daSvuotare, indiceConDiNuovo, indiceSenza, leggiPulizie, misura, nuovaPulizia, NOME_PULIZIE, proposteDiPulizia, puliziaVuota, restaFuori, byteLeggibili,
  type Pulizia, type RegistroPulizie, type StatoSpazio, type TipoProposta
} from '@shared/spazio-drive'
import type { Archivio } from './cassaforte/archivio'
import type { Manifesto } from './cassaforte/incrementale'
import type { Scatola } from './progetti/presenza'

/**
 * Lo spazio sul Drive (0.65.0): la misura vera (quota dell'account e file di
 * SierraDeck per tipo), le proposte di pulizia, e le pulizie confermate da
 * Nicholas, in recupero per 30 giorni e annullabili. Le regole stanno in
 * `src/shared/spazio-drive.ts`.
 *
 * L'ordine di una pulizia, perché niente si perda a metà: prima la pulizia
 * si scrive nel registro (con ogni voce del manifesto che toglie), poi le
 * voci escono dal manifesto. Se il manifesto non si scrive, la pulizia si
 * segna annullata subito. I file restano sul Drive fino alla scadenza.
 */

export type { StatoSpazio }

export type SpazioDrive = {
  stato: (forza?: boolean) => Promise<StatoSpazio>
  /**
   * Per il pannello (che si rilegge spesso, anche attraverso il ponte): la
   * misura già fatta se c'è, e intanto ne parte una nuova se è vecchia.
   * `undefined` = la prima misura è in corso.
   */
  subito: () => StatoSpazio | undefined
  pulisci: (tipo: TipoProposta) => Promise<{ ok: boolean; messaggio: string; pulizia?: Pulizia }>
  annulla: (id: string) => Promise<{ ok: boolean; messaggio: string }>
  svuota: (id: string) => Promise<{ ok: boolean; messaggio: string }>
  /** Per il salvataggio: una voce tolta con una pulizia e uguale a com'era non risale. */
  fuoriDalDrive: (percorso: string, size?: number) => boolean
  /** Rilegge il registro e svuota le pulizie scadute. */
  giro: () => Promise<void>
}

export function creaSpazioDrive(deps: {
  archivio: () => Archivio | undefined
  scatola: () => Scatola | undefined
  manifestoDrive: () => Promise<Manifesto | undefined>
  modificaManifesto: (cambia: (m: Manifesto) => Manifesto | undefined, cosa: string) => Promise<{ ok: boolean; messaggio?: string }>
  /** Per conversazione: i PC che la hanno sul disco, e quanto è lunga lì. */
  copieSuiPc: () => Map<string, { nome: string; size: number }[]>
  io: () => { id: string; nome: string }
  log: (m: string) => void
  adesso?: () => number
}): SpazioDrive {
  const adesso = deps.adesso ?? Date.now
  let registro: RegistroPulizie | undefined
  let ultimo: { il: number; stato: StatoSpazio } | undefined
  let inCorso: Promise<StatoSpazio> | undefined

  const leggiRegistro = async (): Promise<RegistroPulizie> => {
    const s = deps.scatola()
    if (s === undefined) return registro ?? puliziaVuota()
    registro = leggiPulizie(await s.leggi<unknown>(NOME_PULIZIE))
    return registro
  }
  const scriviRegistro = async (r: RegistroPulizie): Promise<void> => {
    const s = deps.scatola()
    if (s === undefined) throw new Error('Drive non collegato o cassaforte chiusa')
    await s.scrivi(NOME_PULIZIE, r)
    registro = r
    ultimo = undefined
  }
  const cambiaPulizia = async (id: string, cambia: (p: Pulizia) => Pulizia): Promise<void> => {
    const r = await leggiRegistro()
    await scriviRegistro({ ...r, pulizie: r.pulizie.map((p) => (p.id === id ? cambia(p) : p)) })
  }

  const leggiTutto = async (): Promise<StatoSpazio> => {
    const a = deps.archivio()
    if (a?.elencaConDimensioni === undefined) return { proposte: [], pulizie: [], errore: 'Il Drive non è collegato, o la cassaforte è chiusa.' }
    const [file, quota, manifesto, r] = await Promise.all([
      a.elencaConDimensioni(),
      a.quota?.().catch(() => undefined),
      deps.manifestoDrive(),
      leggiRegistro()
    ])
    if (manifesto === undefined) return { proposte: [], pulizie: r.pulizie, errore: 'L’indice del Drive non si apre adesso: riprovo dopo.' }
    const m = misura({ file, indice: manifesto.file, ...(quota !== undefined ? { quota } : {}), pulizie: r, adesso: adesso() })
    const proposte = proposteDiPulizia({ file, indice: manifesto.file, copieSuiPc: deps.copieSuiPc(), pulizie: r, adesso: adesso() })
    return { misura: m, proposte, pulizie: [...r.pulizie].sort((x, y) => y.quando.localeCompare(x.quando)) }
  }

  const togliFile = async (p: Pulizia): Promise<{ tolti: number; errori: number }> => {
    const a = deps.archivio()
    if (a === undefined) throw new Error('Drive non collegato')
    let tolti = 0
    let errori = 0
    for (const v of p.voci) {
      try { await a.cancella(v.nome); tolti += 1 } catch { errori += 1 }
    }
    return { tolti, errori }
  }

  return {
    async stato(forza = false) {
      if (!forza && ultimo !== undefined && adesso() - ultimo.il < 5 * 60_000) return ultimo.stato
      if (inCorso !== undefined) return inCorso
      inCorso = (async (): Promise<StatoSpazio> => {
        try {
          const st = await leggiTutto()
          if (st.errore === undefined) ultimo = { il: adesso(), stato: st }
          return st
        } catch (err) {
          return { proposte: [], pulizie: registro?.pulizie ?? [], errore: `Non riesco a misurare il Drive: ${err instanceof Error ? err.message : String(err)}` }
        } finally {
          inCorso = undefined
        }
      })()
      return inCorso
    },

    subito() {
      if (ultimo === undefined || adesso() - ultimo.il >= 5 * 60_000) void this.stato().catch(() => undefined)
      return ultimo?.stato
    },

    async pulisci(tipo) {
      // Le proposte si rifanno adesso: quello che si toglie è quello che c'è ora.
      const st = await leggiTutto()
      if (st.errore !== undefined) return { ok: false, messaggio: st.errore }
      const pr = st.proposte.find((x) => x.tipo === tipo)
      if (pr === undefined || pr.voci.length === 0) return { ok: false, messaggio: 'Non c’è più niente da pulire qui.' }
      const io = deps.io()
      const p = nuovaPulizia(pr, { id: `pulizia-${new Date(adesso()).toISOString().replace(/[:.]/g, '-')}`, chi: io.nome, adesso: adesso() })
      const r = await leggiRegistro()
      await scriviRegistro({ ...r, pulizie: [...r.pulizie, p] })
      const conVoce = p.voci.filter((v) => v.percorso !== undefined)
      if (conVoce.length > 0) {
        const e = await deps.modificaManifesto((m) => ({ ...m, file: indiceSenza(m.file, conVoce) }), `PULIZIA ${p.id} («${p.titolo}»)`)
        if (!e.ok) {
          await cambiaPulizia(p.id, (x) => ({ ...x, annullataIl: new Date(adesso()).toISOString() })).catch(() => undefined)
          deps.log(`[spazio] pulizia «${p.titolo}» non fatta: ${e.messaggio ?? '?'}`)
          return { ok: false, messaggio: `Non fatta: ${e.messaggio ?? 'il Drive non ha risposto'}. Niente è cambiato.` }
        }
      }
      deps.log(`[spazio] pulizia «${p.titolo}» confermata da ${io.nome}: ${p.voci.length} file (${byteLeggibili(p.byte)}) nel recupero fino al ${p.scadeIl.slice(0, 10)}`)
      return { ok: true, messaggio: `${p.voci.length} file nel recupero per 30 giorni (${byteLeggibili(p.byte)}). «Annulla» li rimette.`, pulizia: p }
    },

    async annulla(id) {
      const r = await leggiRegistro()
      const p = r.pulizie.find((x) => x.id === id)
      if (p === undefined) return { ok: false, messaggio: 'Pulizia non trovata.' }
      if (p.annullataIl !== undefined) return { ok: false, messaggio: 'Già annullata.' }
      if (p.svuotataIl !== undefined) return { ok: false, messaggio: 'Il recupero è già stato svuotato: i file non ci sono più.' }
      const a = deps.archivio()
      const esistono = new Set((await a?.elencaConDimensioni?.() ?? []).map((f) => f.nome))
      let rimesse = 0
      let restano = 0
      const e = await deps.modificaManifesto((m) => {
        const x = indiceConDiNuovo(m.file, p.voci, (n) => esistono.has(n))
        rimesse = x.rimesse
        restano = x.restano
        return x.rimesse === 0 ? undefined : { ...m, file: x.indice }
      }, `ANNULLA PULIZIA ${p.id}`)
      if (!e.ok) return { ok: false, messaggio: `Non annullata: ${e.messaggio ?? '?'}` }
      await cambiaPulizia(id, (x) => ({ ...x, annullataIl: new Date(adesso()).toISOString() }))
      deps.log(`[spazio] pulizia «${p.titolo}» annullata: ${rimesse} voci rimesse nell’indice${restano > 0 ? `, ${restano} lasciate (una copia più nuova le ha sostituite)` : ''}`)
      return { ok: true, messaggio: `Annullata: ${rimesse} file di nuovo al loro posto${restano > 0 ? ` (${restano} hanno già una copia più nuova)` : ''}.` }
    },

    async svuota(id) {
      const r = await leggiRegistro()
      const p = r.pulizie.find((x) => x.id === id)
      if (p === undefined || p.annullataIl !== undefined || p.svuotataIl !== undefined) return { ok: false, messaggio: 'Non c’è niente da svuotare.' }
      const e = await togliFile(p)
      await cambiaPulizia(id, (x) => ({ ...x, svuotataIl: new Date(adesso()).toISOString() }))
      deps.log(`[spazio] recupero «${p.titolo}» svuotato su richiesta: ${e.tolti} file cancellati${e.errori > 0 ? `, ${e.errori} non riusciti` : ''}`)
      return { ok: true, messaggio: `Svuotato: ${byteLeggibili(p.byte)} liberati.` }
    },

    fuoriDalDrive: (percorso, size) => restaFuori(registro, percorso, size),

    async giro() {
      if (deps.scatola() === undefined) return
      try {
        const r = await leggiRegistro()
        for (const p of daSvuotare(r, adesso())) {
          const e = await togliFile(p)
          await cambiaPulizia(p.id, (x) => ({ ...x, svuotataIl: new Date(adesso()).toISOString() }))
          deps.log(`[spazio] recupero «${p.titolo}» scaduto: ${e.tolti} file cancellati dal Drive (${byteLeggibili(p.byte)})`)
        }
      } catch (err) {
        deps.log(`[spazio] giro non riuscito: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }
}
