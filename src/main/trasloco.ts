import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import {
  ANNULLA_TUTTO_GIORNI, PASSI_TRASLOCO, annullabile, copieDopo, daTogliere, dettaglioVecchia, ferma, finito, motivoPassaggero, nuovoTrasloco, prossimoPasso, segna, vaiAvantiSenza,
  type CopiaAltrove, type IdPasso, type Trasloco
} from '@shared/trasloco'
import type { StatoResidenza } from '@shared/residenza'
import type { AvanzaAnalisi } from './residenza'

/**
 * Il trasloco di un progetto (0.65.0): «Sposta progetto» e «Rendi residente»
 * in un passaggio solo, automatico, sul PC che diventa residente. Le regole e
 * i passi stanno in `@shared/trasloco`; qui il lavoro di ognuno, componendo
 * quello che c'era già: il salvataggio sul Drive degli altri PC, l'analisi e
 * l'unione di «Rendi residente» (`residenza.ts`), il confronto e il recupero
 * di «togli da questo PC» (`rimozione-sicura.ts`) sugli altri PC.
 *
 * Ogni passo si scrive su disco (`<dati>/traslochi/<id>.json`) prima e dopo:
 * un PC che non risponde ferma il trasloco con il motivo, e il giro lo
 * riprende dal passo fermo quando il motivo passa. Un riavvio pure.
 */

export type DipendenzeTrasloco = {
  dati: string
  io: () => { id: string; nome: string }
  /** Il progetto (stesso nome = stesso progetto), gli altri PC con una copia e il residente di adesso. */
  progetto: (id: string) => Promise<{ id: string; nome: string; ids: string[]; altrove: { pc: string; nome: string }[]; residente?: { pc: string; nome: string } } | undefined>
  residenza: {
    avvia: (progetto: string, avanza?: AvanzaAnalisi) => Promise<StatoResidenza>
    conferma: (progetto: string) => Promise<StatoResidenza>
    stati: () => StatoResidenza[]
    annullaUnione: (id: string) => Promise<{ ok: boolean; messaggio: string }>
  }
  /** Una rotta di un altro PC della stessa cassaforte. */
  chiamaPc: (pc: string, percorso: string, corpo?: unknown) => Promise<unknown>
  /** La casa di queste chat e del progetto a un PC (per «Annulla tutto»): la strada di «Ospitata da». */
  casaA: (progetto: string, pc: { id: string; nome: string }) => Promise<{ ok: boolean; messaggio: string }>
  log: (m: string) => void
  avvisa?: () => void
  adesso?: () => number
  /** Fra un controllo e l'altro dello stato su un altro PC. */
  attesa?: (ms: number) => Promise<void>
  /**
   * Quanto si aspetta un altro PC per una chiamata del trasloco (0.86.2, audit
   * M5): oltre, il passo si ferma con il motivo e riprende da solo al giro dopo.
   */
  tempoMassimoMs?: number
}

export type TraslocoApi = {
  avvia: (progetto: string, chiesto: Trasloco['chiesto']) => Promise<{ ok: boolean; messaggio: string; trasloco?: Trasloco }>
  riprendi: (id: string) => { ok: boolean; messaggio: string }
  /**
   * «Vai avanti senza» un PC spento (0.71.1): il trasloco riparte senza la sua
   * copia; quella resta dov'è e si sistema quando il PC torna (vedi `giro`).
   */
  senza: (id: string, pc: string) => { ok: boolean; messaggio: string }
  annullaTutto: (id: string) => Promise<{ ok: boolean; messaggio: string }>
  elenco: () => Trasloco[]
  stato: (id: string) => Trasloco | undefined
  /** Riprende da soli i traslochi fermi per un motivo che passa, e quelli interrotti da un riavvio. */
  giro: () => void
  /** Aspetta che il trasloco in corso finisca un giro di passi (per i test). */
  inCorso: (id: string) => Promise<void> | undefined
  /** Toglie i record finiti o falliti da più di sette giorni (lo fa anche il giro). Quanti ne ha tolti. */
  pulisci: () => number
}

/** Lo stato della copia vecchia su un altro PC, come lo dice `/api/trasloco/togli-stato`. */
type StatoTogli = { fase?: string; messaggio?: string }

/** Ogni quanto si ridice nel registro un trasloco fermo per lo stesso motivo. */
export const RIDICI_FERMO_MS = 60 * 60_000
/**
 * Quanto si aspetta un altro PC in una chiamata del trasloco (0.86.2, audit
 * M5). Un trasloco era rimasto per sempre su «Raccolgo le copie»: la chiamata
 * all'altro PC non tornava, e il giro non lo riprendeva perché risultava
 * ancora al lavoro. Il salvataggio sul Drive di quel PC può durare: dieci minuti.
 */
export const TEMPO_MASSIMO_CHIAMATA_MS = 10 * 60_000

export function creaTrasloco(d: DipendenzeTrasloco): TraslocoApi {
  const adesso = d.adesso ?? Date.now
  const iso = (): string => new Date(adesso()).toISOString()
  const attesa = d.attesa ?? ((ms: number) => new Promise<void>((ok) => setTimeout(ok, ms)))
  const cartella = join(d.dati, 'traslochi')
  const memoria = new Map<string, Trasloco>()
  const girano = new Map<string, Promise<void>>()
  const tempoMassimo = d.tempoMassimoMs ?? TEMPO_MASSIMO_CHIAMATA_MS
  /** Una chiamata a un altro PC che non torna entro `tempoMassimo` si dà per persa: il passo si ferma e riprende da solo. */
  const chiama = (pc: string, percorso: string, corpo?: unknown): Promise<unknown> => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const scaduta = new Promise<never>((_ok, no) => {
      timer = setTimeout(() => { no(new Error(`nessuna risposta in ${Math.round(tempoMassimo / 60_000) || 1} minuti`)) }, tempoMassimo)
      ;(timer as { unref?: () => void }).unref?.()
    })
    return Promise.race([d.chiamaPc(pc, percorso, corpo), scaduta]).finally(() => { if (timer !== undefined) clearTimeout(timer) })
  }

  const scrivi = (t: Trasloco): Trasloco => {
    memoria.set(t.id, t)
    try { mkdirSync(cartella, { recursive: true }); scriviJsonAtomico(join(cartella, `${t.id}.json`), t, 'trasloco') } catch (err) { d.log(`[trasloco] stato non salvato su disco: ${String(err)}`) }
    d.avvisa?.()
    return t
  }
  /**
   * Toglie dalla cartella `traslochi` i record finiti o falliti da più di sette
   * giorni (0.86.2, audit M5), salvo quelli che servono ancora ad «Annulla
   * tutto» o alle copie da sistemare (`daTogliere`).
   */
  const pulisci = (): number => {
    let tolti = 0
    for (const t of leggiTutti()) {
      if (girano.has(t.id) || !daTogliere(t, adesso())) continue
      try {
        const f = join(cartella, `${t.id}.json`)
        if (existsSync(f)) unlinkSync(f)
        memoria.delete(t.id)
        fermoDetto.delete(t.id)
        tolti += 1
      } catch (err) { d.log(`[trasloco] «${t.nome}»: record vecchio non tolto: ${String(err)}`) }
    }
    if (tolti > 0) d.log(`[trasloco] tolti ${tolti} ${tolti === 1 ? 'trasloco finito' : 'traslochi finiti'} da più di sette giorni`)
    return tolti
  }
  const leggiTutti = (): Trasloco[] => {
    if (existsSync(cartella)) {
      for (const n of readdirSync(cartella)) {
        if (!n.endsWith('.json')) continue
        const id = n.slice(0, -'.json'.length)
        if (memoria.has(id)) continue
        try { memoria.set(id, JSON.parse(readFileSync(join(cartella, n), 'utf8')) as Trasloco) } catch { /* illeggibile: resta lì */ }
      }
    }
    return [...memoria.values()].sort((a, b) => b.avviatoIl.localeCompare(a.avviatoIl))
  }
  const passo = (t: Trasloco, p: IdPasso, cambia: Parameters<typeof segna>[2]): Trasloco => scrivi(segna(memoria.get(t.id) ?? t, p, cambia, iso()))
  /**
   * L'ultima volta che si è detto nel registro che un trasloco è fermo
   * (0.73.1). Il giro lo ritenta ogni due minuti: con il portatile spento, il
   * 15/10, 390 righe uguali in un giorno. Ora lo stesso fermo si ridice una
   * volta all'ora; un motivo o un passo diverso si dice subito.
   */
  const fermoDetto = new Map<string, { chiave: string; il: number }>()
  const fermaQui = (t: Trasloco, p: IdPasso, motivo: string, daSolo?: boolean, pc?: string): Trasloco => {
    const riprova = daSolo ?? motivoPassaggero(motivo)
    const chiave = `${p}\n${motivo}`
    const prima = fermoDetto.get(t.id)
    if (prima === undefined || prima.chiave !== chiave || adesso() - prima.il >= RIDICI_FERMO_MS) {
      fermoDetto.set(t.id, { chiave, il: adesso() })
      d.log(`[trasloco] «${t.nome}»: fermo al passo «${PASSI_TRASLOCO.find((x) => x.id === p)?.titolo ?? p}» — ${motivo}${riprova ? ' (riprendo da solo quando passa)' : ''}`)
    }
    return scrivi(ferma(memoria.get(t.id) ?? t, p, motivo, riprova, iso(), pc))
  }
  /** Segna l'esito della copia di un PC. */
  const esitoCopia = (t: Trasloco, pc: string, cambia: Partial<CopiaAltrove>): Trasloco =>
    scrivi({ ...(memoria.get(t.id) ?? t), altrove: (memoria.get(t.id) ?? t).altrove.map((x) => (x.pc === pc ? { ...x, ...cambia } : x)) })

  /**
   * La copia vecchia su un altro PC: confronto con quella di qui, quello che
   * ha solo lui entra qui nei recuperati, poi la sua copia va nel recupero di
   * quel PC. `spento` se il PC non risponde.
   */
  const togliVecchia = async (t: Trasloco, a: CopiaAltrove, ids: string[], su: (messaggio: string) => void): Promise<
    { esito: 'nel-recupero' | 'niente'; messaggio?: string } | { spento: string } | { fermo: string; daSolo?: boolean }
  > => {
    const io = d.io()
    try {
      await chiama(a.pc, '/api/trasloco/togli', { ids, residente: { pc: io.id, nome: io.nome } })
    } catch (err) {
      return { spento: errore(err) }
    }
    // Il confronto e il recupero là possono durare: si guarda lo stato finché finisce.
    let st: StatoTogli = {}
    for (let giri = 0; giri < 400; giri += 1) {
      try { st = await chiama(a.pc, '/api/trasloco/togli-stato', { ids }) as StatoTogli } catch (err) {
        return { spento: errore(err) }
      }
      if (st.fase !== 'analisi' && st.fase !== 'recupero' && st.fase !== 'attesa-conferma') break
      if (st.messaggio !== undefined) su(st.messaggio)
      await attesa(3000)
    }
    const esito = st.fase === 'spostata' ? 'nel-recupero' as const : /non ha una cartella|niente da togliere|non c’è più/i.test(st.messaggio ?? '') ? 'niente' as const : undefined
    if (esito === undefined) return { fermo: `${a.nome}: ${st.messaggio ?? `stato ${st.fase ?? 'sconosciuto'}`}`, ...(st.fase === 'in-uso' ? { daSolo: true } : {}) }
    return { esito, ...(st.messaggio !== undefined ? { messaggio: st.messaggio } : {}) }
  }
  /** Le copie lasciate indietro con «Vai avanti senza», quando il loro PC torna (0.71.1). */
  const dopo = new Set<string>()
  const sistemaDopo = async (t: Trasloco): Promise<void> => {
    if (dopo.has(t.id)) return
    dopo.add(t.id)
    try {
      const g = await d.progetto(t.progetto)
      const ids = g?.ids ?? [t.progetto]
      for (const a of copieDopo(memoria.get(t.id) ?? t)) {
        const r = await togliVecchia(t, a, ids, () => undefined)
        if ('spento' in r) continue
        if ('fermo' in r) { esitoCopia(t, a.pc, { messaggio: r.fermo }); d.log(`[trasloco] «${t.nome}»: ${a.nome} è tornato, ma la sua copia non si è sistemata: ${r.fermo}`); continue }
        esitoCopia(t, a.pc, { esito: r.esito, ...(r.messaggio !== undefined ? { messaggio: r.messaggio } : {}) })
        d.log(`[trasloco] «${t.nome}»: ${a.nome} è tornato: quello che aveva solo lui è qui nei recuperati, la sua copia ${r.esito === 'nel-recupero' ? 'nel recupero di quel PC' : 'non c’era più'}`)
      }
    } finally {
      dopo.delete(t.id)
    }
  }
  const errore = (err: unknown): string => (err instanceof Error ? err.message : String(err))

  /** Un passo; `true` = fatto, si va avanti. */
  const faiPasso = async (t0: Trasloco, p: IdPasso): Promise<boolean> => {
    let t = passo(t0, p, { stato: 'in-corso' })
    if (p === 'raccolta') {
      // Senza i PC per cui si è scelto «Vai avanti senza» (0.71.1): la loro copia sul Drive è quella dell'ultimo salvataggio.
      const da = t.altrove.filter((a) => a.salvata !== true && a.senza === undefined)
      if (t.altrove.length === 0) { passo(t, p, { stato: 'fatto', dettaglio: 'Nessun altro PC ha una copia: confronto le copie di qui e quelle sul Drive.' }); return true }
      let k = t.altrove.length - da.length
      for (const a of da) {
        k += 1
        t = passo(t, p, { dettaglio: `Chiedo a ${a.nome} di salvare sul Drive la sua copia`, fatto: k - 1, totale: t.altrove.length })
        let r: { ok?: unknown; messaggio?: unknown }
        try { r = await chiama(a.pc, '/api/trasloco/salva', { progetto: t.progetto, trasloco: t.id, verso: d.io().id }) as typeof r } catch (err) {
          fermaQui(t, p, `${a.nome} non risponde (${errore(err)}): senza la sua copia aggiornata non confronto. Riprendo da qui quando torna.`, true, a.pc)
          return false
        }
        if (r.ok !== true) { fermaQui(t, p, `${a.nome} non ha salvato sul Drive: ${typeof r.messaggio === 'string' ? r.messaggio : 'nessun motivo'}`); return false }
        t = scrivi({ ...(memoria.get(t.id) ?? t), altrove: (memoria.get(t.id) ?? t).altrove.map((x) => (x.pc === a.pc ? { ...x, salvata: true } : x)) })
        d.log(`[trasloco] «${t.nome}»: ${a.nome} ha salvato la sua copia sul Drive`)
      }
      const salvate = (memoria.get(t.id) ?? t).altrove.filter((a) => a.salvata === true).length
      const saltati = (memoria.get(t.id) ?? t).altrove.filter((a) => a.senza !== undefined && a.salvata !== true).map((a) => a.nome)
      passo(t, p, { stato: 'fatto', dettaglio: `${salvate} ${salvate === 1 ? 'copia salvata' : 'copie salvate'} sul Drive${saltati.length > 0 ? `; senza ${saltati.join(', ')} (spento: uso la sua copia sul Drive, il resto quando torna)` : ''}`, fatto: t.altrove.length, totale: t.altrove.length })
      return true
    }
    if (p === 'analisi') {
      const st = await d.residenza.avvia(t.progetto, (testo, fatto, totale) => { passo(t, p, { dettaglio: `${testo}… ${fatto}/${totale}`, fatto, totale }) })
      if (st.fase === 'attesa-conferma' && st.riassunto !== undefined) {
        const f = st.riassunto.file
        scrivi({ ...(memoria.get(t.id) ?? t), riassunto: st.riassunto.righe })
        passo(t, p, { stato: 'fatto', dettaglio: `${f.uguali} file uguali, ${f.aggiunti} da aggiungere, ${f.sostituiti} più recenti, ${f.recuperati} nei recuperati` })
        return true
      }
      fermaQui(t, p, st.messaggio, st.fase === 'in-uso' ? true : undefined)
      return false
    }
    if (p === 'unione') {
      // Dopo un riavvio l'analisi in memoria non c'è più: si rifà (i file già entrati risultano uguali).
      if (!d.residenza.stati().some((s) => s.progetto === t.progetto && s.fase === 'attesa-conferma')) {
        passo(t, p, { dettaglio: 'Rifaccio il confronto, interrotto da un riavvio' })
        const st = await d.residenza.avvia(t.progetto)
        if (st.fase !== 'attesa-conferma') { fermaQui(t, p, st.messaggio); return false }
      }
      const r = d.residenza.stati().find((s) => s.progetto === t.progetto)?.riassunto
      const quanti = r === undefined ? '' : `Copio ${r.file.aggiunti} file che mancano qui${r.file.sostituiti > 0 ? `, ${r.file.sostituiti} più recenti` : ''}; unisco ${r.chat.delProgetto} chat${r.workspace.uniti.length > 0 ? `; workspace in «${r.workspace.tiene}»` : ''}`
      t = passo(t, p, { dettaglio: quanti })
      const st = await d.residenza.conferma(t.progetto)
      if (st.unione !== undefined) t = scrivi({ ...(memoria.get(t.id) ?? t), unione: st.unione })
      if (st.fase !== 'fatta') { fermaQui(t, p, st.messaggio); return false }
      passo(t, p, { stato: 'fatto', dettaglio: st.messaggio })
      return true
    }
    if (p === 'vecchie') {
      const g = await d.progetto(t.progetto)
      const ids = g?.ids ?? [t.progetto]
      const da = (memoria.get(t.id) ?? t).altrove.filter((a) => a.esito !== 'nel-recupero' && a.esito !== 'niente' && a.esito !== 'dopo')
      let k = t.altrove.length - da.length
      for (const a of da) {
        k += 1
        t = passo(t, p, { dettaglio: `${dettaglioVecchia(a.nome)} (${k}/${t.altrove.length})`, fatto: k - 1, totale: t.altrove.length })
        const r = await togliVecchia(t, a, ids, (m) => { passo(t, p, { dettaglio: `${a.nome}: ${m}` }) })
        if ('spento' in r) {
          // «Vai avanti senza» quel PC (0.71.1): la sua copia resta dov'è, si sistema quando torna.
          if (a.senza !== undefined) {
            t = esitoCopia(t, a.pc, { esito: 'dopo', messaggio: 'spento: la sua copia resta lì, la sistemo quando torna' })
            d.log(`[trasloco] «${t.nome}»: ${a.nome} è spento, vado avanti senza: la sua copia la sistemo quando torna`)
            continue
          }
          fermaQui(t, p, `${a.nome} non risponde (${r.spento}): la sua copia resta dov’è. Riprendo da qui quando torna.`, true, a.pc)
          return false
        }
        if ('fermo' in r) { fermaQui(t, p, r.fermo, r.daSolo); return false }
        t = esitoCopia(t, a.pc, { esito: r.esito, ...(r.messaggio !== undefined ? { messaggio: r.messaggio } : {}) })
        d.log(`[trasloco] «${t.nome}»: copia di ${a.nome} ${r.esito === 'nel-recupero' ? 'nel recupero di quel PC' : 'già assente'}`)
      }
      const nelRecupero = (memoria.get(t.id) ?? t).altrove.filter((x) => x.esito === 'nel-recupero').length
      passo(t, p, { stato: 'fatto', dettaglio: nelRecupero === 0 ? 'Nessuna copia vecchia da togliere' : `${nelRecupero} ${nelRecupero === 1 ? 'copia vecchia nel recupero' : 'copie vecchie nel recupero'}, per 30 giorni`, fatto: t.altrove.length, totale: t.altrove.length })
      return true
    }
    // fine
    const ora = memoria.get(t.id) ?? t
    const righe = [
      ...(ora.riassunto ?? []).slice(0, 8),
      ...ora.altrove.map((a) => `${a.nome}: ${a.esito === 'nel-recupero' ? 'la copia vecchia è nel recupero di quel PC per 30 giorni' : a.esito === 'dopo' ? 'era spento: la sua copia resta lì; quando torna, quello che ha solo lui entra qui nei recuperati e la sua copia va nel recupero di quel PC' : 'non aveva una copia da togliere'}.`),
      `«Annulla tutto» rimette com’era per ${ANNULLA_TUTTO_GIORNI} giorni.`
    ]
    scrivi({ ...ora, riassunto: righe, finitoIl: iso(), scadeIl: new Date(adesso() + ANNULLA_TUTTO_GIORNI * 86_400_000).toISOString() })
    passo(ora, p, { stato: 'fatto', dettaglio: 'Fatto' })
    d.log(`[trasloco] «${ora.nome}»: finito — residente ${ora.verso.nome}; ${ora.altrove.filter((a) => a.esito === 'nel-recupero').length} copie vecchie nel recupero`)
    return true
  }

  const esegui = (id: string): Promise<void> => {
    const gia = girano.get(id)
    if (gia !== undefined) return gia
    const giro = (async (): Promise<void> => {
      try {
        for (;;) {
          const t = memoria.get(id) ?? leggiTutti().find((x) => x.id === id)
          if (t === undefined || finito(t)) return
          const p = prossimoPasso(t)
          if (p === undefined) return
          let ok = false
          try { ok = await faiPasso(t, p) } catch (err) { fermaQui(t, p, `si è fermato: ${errore(err)}`); ok = false }
          if (!ok) return
        }
      } finally {
        girano.delete(id)
      }
    })()
    girano.set(id, giro)
    return giro
  }

  return {
    async avvia(progetto, chiesto) {
      const g = await d.progetto(progetto)
      if (g === undefined) return { ok: false, messaggio: 'Questo progetto non è né nel registro di questo PC né in quello sul Drive.' }
      const corrente = leggiTutti().find((t) => g.ids.includes(t.progetto) && !finito(t))
      if (corrente !== undefined) { void esegui(corrente.id); return { ok: true, messaggio: `«${g.nome}»: il trasloco è già in corso.`, trasloco: corrente } }
      const io = d.io()
      const t = nuovoTrasloco({
        id: `trasloco-${iso().replace(/[:.]/g, '-')}`, progetto: g.id, nome: g.nome, verso: { pc: io.id, nome: io.nome }, chiesto,
        altrove: g.altrove.filter((a) => a.pc !== io.id), adesso: iso()
      })
      scrivi(g.residente !== undefined && g.residente.pc !== io.id ? { ...t, casaPrima: g.residente } : t)
      d.log(`[trasloco] «${g.nome}»: avviato verso ${io.nome} (${chiesto.come === 'sposta' ? 'Sposta progetto' : 'Rendi residente'}, da ${chiesto.da}); altre copie su: ${t.altrove.map((a) => a.nome).join(', ') || 'nessun altro PC'}`)
      void esegui(t.id)
      return { ok: true, messaggio: `«${g.nome}»: trasloco avviato. Lo vedi passo per passo.`, trasloco: memoria.get(t.id) as Trasloco }
    },

    riprendi(id) {
      const t = memoria.get(id) ?? leggiTutti().find((x) => x.id === id)
      if (t === undefined) return { ok: false, messaggio: 'Trasloco non trovato.' }
      if (finito(t)) return { ok: false, messaggio: 'Questo trasloco è già finito.' }
      d.log(`[trasloco] «${t.nome}»: riprendo dal passo «${PASSI_TRASLOCO.find((x) => x.id === prossimoPasso(t))?.titolo ?? '?'}»`)
      void esegui(id)
      return { ok: true, messaggio: 'Riprendo da dove era.' }
    },

    senza(id, pc) {
      const t = memoria.get(id) ?? leggiTutti().find((x) => x.id === id)
      if (t === undefined) return { ok: false, messaggio: 'Trasloco non trovato.' }
      if (finito(t)) return { ok: false, messaggio: 'Questo trasloco è già finito.' }
      const a = t.altrove.find((x) => x.pc === pc)
      if (a === undefined) return { ok: false, messaggio: 'Quel PC non ha una copia di questo progetto.' }
      if (girano.has(id)) return { ok: false, messaggio: 'Il trasloco sta lavorando: aspetta che si fermi.' }
      scrivi(vaiAvantiSenza(t, pc, iso()))
      d.log(`[trasloco] «${t.nome}»: vado avanti senza ${a.nome} (scelto da chi guarda): la sua copia resta lì e la sistemo quando torna`)
      void esegui(id)
      return { ok: true, messaggio: `Vado avanti senza ${a.nome}: la sua copia resta lì e la sistemo quando torna.` }
    },

    async annullaTutto(id) {
      const t = memoria.get(id) ?? leggiTutti().find((x) => x.id === id)
      if (t === undefined) return { ok: false, messaggio: 'Trasloco non trovato.' }
      if (!annullabile(t, adesso())) return { ok: false, messaggio: t.annullatoIl !== undefined ? 'Già annullato.' : 'Non c’è niente da annullare, o sono passati i 30 giorni.' }
      if (girano.has(id)) return { ok: false, messaggio: 'Il trasloco sta ancora lavorando: aspetta che finisca o che si fermi.' }
      const g = await d.progetto(t.progetto)
      const ids = g?.ids ?? [t.progetto]
      const righe: string[] = []
      for (const a of t.altrove.filter((x) => x.esito === 'nel-recupero')) {
        try {
          const r = await chiama(a.pc, '/api/trasloco/ripristina', { ids }) as { ok?: unknown; messaggio?: unknown }
          righe.push(`${a.nome}: ${typeof r.messaggio === 'string' ? r.messaggio : r.ok === true ? 'copia rimessa al suo posto' : 'non rimessa'}`)
        } catch (err) {
          righe.push(`${a.nome} non risponde (${errore(err)}): la sua copia resta nel suo recupero, si rimette da lì con «Ripristina»`)
        }
      }
      if (t.unione !== undefined) {
        const u = await d.residenza.annullaUnione(t.unione)
        righe.push(`Qui: ${u.messaggio}`)
      }
      const prima = t.casaPrima ?? (t.chiesto.come === 'sposta' ? t.altrove.find((a) => a.pc === t.chiesto.da) : undefined)
      if (prima !== undefined) {
        const c = await d.casaA(t.progetto, { id: prima.pc, nome: prima.nome })
        righe.push(`Casa: ${c.messaggio}`)
      }
      scrivi({ ...t, annullatoIl: iso(), annullamento: righe })
      d.log(`[trasloco] «${t.nome}»: annullato tutto — ${righe.join('; ')}`)
      return { ok: true, messaggio: `Annullato. ${righe.join(' ')}` }
    },

    elenco: () => leggiTutti().filter((t) => !finito(t) || Date.parse(t.scadeIl ?? t.annullatoIl ?? t.avviatoIl) > adesso() - 86_400_000),
    stato: (id) => memoria.get(id) ?? leggiTutti().find((x) => x.id === id),

    giro() {
      pulisci()
      for (const t of leggiTutti()) {
        // Le copie lasciate indietro con «Vai avanti senza»: quando il loro PC torna (0.71.1).
        if (t.finitoIl !== undefined && copieDopo(t).length > 0) { void sistemaDopo(t); continue }
        if (finito(t) || girano.has(t.id)) continue
        if (t.fermo !== undefined && !t.fermo.riprovaDaSolo) continue
        void esegui(t.id)
      }
    },

    inCorso: (id) => girano.get(id),
    pulisci
  }
}
