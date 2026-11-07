import { randomBytes } from 'node:crypto'
import {
  daSvuotare, indiceConDiNuovo, propostaChatEliminate, indiceSenza, leggiPulizie, misura, nuovaPulizia, NOME_PULIZIE, proposteDiPulizia, puliziaVuota, restaFuori, byteLeggibili,
  type Proposta, type Pulizia, type RegistroPulizie, type StatoSpazio, type TipoProposta, PULIZIA_DA_SOLA_OGNI_MS, pulizieDaSole,
  idInRecupero, nomiInRecupero, percorsiPerNome, tipoDi, versioniDaTenere, revisioniDaCancellare, stimaVersioni, propostaVersioni,
  type StimaVersioni, type VersioniDiFile
} from '@shared/spazio-drive'
import { proposteChatSulDrive, sessioniDelleVoci, spazioPoco } from '@shared/chat-sul-drive'
import type { Archivio } from './cassaforte/archivio'
import type { Manifesto } from './cassaforte/incrementale'
import type { Scatola } from './progetti/posta'

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

/** Ogni quanto il giro rivede quali chat stanno sul Drive. */
const GIRO_CHAT_OGNI_MS = 6 * 60 * 60_000

export type SpazioDrive = {
  stato: (forza?: boolean) => Promise<StatoSpazio>
  /**
   * Per il pannello (che si rilegge spesso, anche attraverso il ponte): la
   * misura già fatta se c'è, e intanto ne parte una nuova se è vecchia.
   * `undefined` = la prima misura è in corso.
   */
  subito: () => StatoSpazio | undefined
  /** `chi` (0.69.0): chi la fa quando non è Nicholas («automatico»). */
  pulisci: (tipo: TipoProposta, chi?: string) => Promise<{ ok: boolean; messaggio: string; pulizia?: Pulizia }>
  /**
   * «Elimina dal PC … anche dal Drive» (0.79.0): le copie di quelle chat
   * escono dall'indice del Drive e vanno nel recupero (30 giorni, annullabile).
   */
  togliChat: (sessioni: string[], titolo: string) => Promise<{ ok: boolean; messaggio: string; pulizia?: Pulizia }>
  /**
   * Le versioni vecchie (0.95.6): conta quante se ne possono togliere (una
   * richiesta per file: solo su richiesta), e le toglie. `libera` non parte
   * mai da sola: lo chiama solo la conferma di Nicholas, e rilegge le
   * versioni di ogni file prima di cancellare.
   */
  contaVersioni: () => Promise<{ ok: boolean; messaggio: string }>
  liberaVersioni: () => Promise<{ ok: boolean; messaggio: string }>
  annulla: (id: string) => Promise<{ ok: boolean; messaggio: string }>
  svuota: (id: string) => Promise<{ ok: boolean; messaggio: string }>
  /** Per il salvataggio: una voce tolta con una pulizia e uguale a com'era non risale. */
  fuoriDalDrive: (percorso: string, size?: number) => boolean
  /**
   * Le chat sul Drive (0.96.0): toglie dal Drive quelle non usate da troppo,
   * quelle dei workspace «solo su questo PC» e, con poco spazio, le più
   * grosse. Mai niente dal PC. Va da sola nel giro; qui per chiamarla subito
   * (per esempio quando si cambia l'impostazione di un workspace).
   */
  chatSulDrive: () => Promise<{ ok: boolean; messaggio: string; tolte: number }>
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
  /** Questo percorso e' una chat di un workspace «solo su questo PC»? */
  soloQui?: (percorso: string) => boolean
  /** Le chat gia' diventate solo locali per lo spazio (minuscole). */
  sessioniSoloLocali?: () => ReadonlySet<string>
  /** Segna queste chat «solo locali»: da qui non salgono piu'. */
  segnaSoloLocali?: (sessioni: string[]) => void
  /** Il Drive e' pieno adesso (il freno)? */
  pieno?: () => boolean
  /** Google ha chiesto di rallentare: il giro aspetta. */
  inAttesa?: () => boolean
}): SpazioDrive {
  const adesso = deps.adesso ?? Date.now
  let registro: RegistroPulizie | undefined
  let ultimo: { il: number; stato: StatoSpazio } | undefined
  let ultimaPuliziaDaSola = 0
  let ultimoGiroChat = 0
  let chatInCorso = false
  let inCorso: Promise<StatoSpazio> | undefined
  let stimaVersioniFatta: StimaVersioni | undefined
  let versioniInCorso = false

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
    if (stimaVersioniFatta !== undefined && stimaVersioniFatta.revisioni > 0) proposte.push(propostaVersioni(stimaVersioniFatta))
    return { misura: m, proposte, pulizie: [...r.pulizie].sort((x, y) => y.quando.localeCompare(x.quando)) }
  }

  const togliFile = async (p: Pulizia): Promise<{ tolti: number; errori: number }> => {
    const a = deps.archivio()
    if (a === undefined) throw new Error('Drive non collegato')
    let tolti = 0
    let errori = 0
    for (const v of p.voci) {
      try {
        // Un doppione per nome si toglie per id: il nome e' anche quello del file che resta.
        if (v.id !== undefined) {
          if (a.cancellaId === undefined) throw new Error('questo Drive non cancella per id')
          await a.cancellaId(v.id)
        } else await a.cancella(v.nome)
        tolti += 1
      } catch (err) { errori += 1; deps.log(`[spazio] ${v.nome} non cancellato dal Drive: ${err instanceof Error ? err.message : String(err)}`) }
    }
    return { tolti, errori }
  }

  /** Una pulizia confermata: prima nel registro, poi fuori dall'indice; se l'indice non si scrive, annullata subito. */
  const applica = async (pr: Proposta, chi?: string): Promise<{ ok: boolean; messaggio: string; pulizia?: Pulizia }> => {
    const io = deps.io()
    const p = nuovaPulizia(pr, { id: `pulizia-${new Date(adesso()).toISOString().replace(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}`, chi: chi ?? io.nome, adesso: adesso() })
    const r = await leggiRegistro()
    await scriviRegistro({ ...r, pulizie: [...r.pulizie, p] })
    const conVoce = p.voci.filter((v) => v.percorso !== undefined)
    if (conVoce.length > 0) {
      const e = await deps.modificaManifesto((m) => ({ ...m, file: indiceSenza(m.file, conVoce) }), `PULIZIA ${p.id} («${p.titolo}»)`)
      if (!e.ok) {
        // Se nemmeno questo si scrive, la pulizia resterebbe attiva su file ancora nell'indice: lo si dice forte.
        await cambiaPulizia(p.id, (x) => ({ ...x, annullataIl: new Date(adesso()).toISOString() })).catch((err: unknown) => deps.log(`[spazio] ATTENZIONE: pulizia ${p.id} non annullata nel registro (${err instanceof Error ? err.message : String(err)}): annullala da «Spazio sul Drive» prima che scada`))
        deps.log(`[spazio] pulizia «${p.titolo}» non fatta: ${e.messaggio ?? '?'}`)
        return { ok: false, messaggio: `Non fatta: ${e.messaggio ?? 'il Drive non ha risposto'}. Niente è cambiato.` }
      }
    }
    deps.log(`[spazio] pulizia «${p.titolo}» ${chi !== undefined ? `fatta da sola (${chi})` : `confermata da ${io.nome}`}: ${p.voci.length} file (${byteLeggibili(p.byte)}) nel recupero fino al ${p.scadeIl.slice(0, 10)}`)
    return { ok: true, messaggio: `${p.voci.length} file nel recupero per 30 giorni (${byteLeggibili(p.byte)}). «Annulla» li rimette.`, pulizia: p }
  }

  /**
   * I file con delle versioni da togliere: i dati delle chat, l'indice, i
   * battiti. Mai le lapidi, il registro delle pulizie, i workspace, la
   * cassaforte, i file dei progetti, le copie di sicurezza, i file in recupero.
   */
  const candidatiVersioni = async (a: Archivio): Promise<{ nome: string; id: string; tenere: number }[]> => {
    const [file, manifesto, r] = await Promise.all([a.elencaConDimensioni?.() ?? Promise.resolve([]), deps.manifestoDrive(), leggiRegistro()])
    if (manifesto === undefined) throw new Error('l’indice del Drive non si apre adesso')
    const perNome = percorsiPerNome(manifesto.file)
    const nomiFuori = nomiInRecupero(r)
    const idFuori = idInRecupero(r)
    const fuori: { nome: string; id: string; tenere: number }[] = []
    for (const f of file) {
      if (f.id === undefined || nomiFuori.has(f.nome) || idFuori.has(f.id)) continue
      const tenere = versioniDaTenere(f.nome, tipoDi(f.nome, perNome.get(f.nome)))
      if (tenere !== undefined) fuori.push({ nome: f.nome, id: f.id, tenere })
    }
    return fuori
  }

  /** Quattro alla volta: sono richieste al Drive, con il suo limite al minuto. */
  const inParallelo = async <T>(voci: T[], quanti: number, fai: (v: T) => Promise<void>): Promise<void> => {
    let i = 0
    const lavora = async (): Promise<void> => { while (i < voci.length) { const v = voci[i++] as T; await fai(v) } }
    await Promise.all(Array.from({ length: Math.min(quanti, voci.length) }, lavora))
  }

  return {
    async contaVersioni() {
      const a = deps.archivio()
      if (a?.elencaRevisioni === undefined) return { ok: false, messaggio: 'Il Drive non è collegato, o la cassaforte è chiusa.' }
      if (versioniInCorso) return { ok: false, messaggio: 'Le versioni si stanno già contando.' }
      versioniInCorso = true
      try {
        const lette: VersioniDiFile[] = []
        let errori = 0
        const cand = await candidatiVersioni(a)
        await inParallelo(cand, 4, async (c) => {
          try { lette.push({ nome: c.nome, id: c.id, revisioni: revisioniDaCancellare(await a.elencaRevisioni!(c.id), c.tenere) }) } catch { errori += 1 }
        })
        stimaVersioniFatta = stimaVersioni(lette, adesso())
        ultimo = undefined
        deps.log(`[spazio] versioni vecchie contate: ${stimaVersioniFatta.revisioni} in ${stimaVersioniFatta.file.length} file su ${cand.length} (${byteLeggibili(stimaVersioniFatta.byte)})${errori > 0 ? `, ${errori} file non letti` : ''}`)
        return { ok: true, messaggio: stimaVersioniFatta.revisioni === 0 ? 'Nessuna versione vecchia da togliere.' : `${stimaVersioniFatta.revisioni} versioni vecchie, circa ${byteLeggibili(stimaVersioniFatta.byte)}.` }
      } catch (err) {
        return { ok: false, messaggio: `Non riesco a contare le versioni: ${err instanceof Error ? err.message : String(err)}` }
      } finally {
        versioniInCorso = false
      }
    },

    async liberaVersioni() {
      const a = deps.archivio()
      if (a?.elencaRevisioni === undefined || a.cancellaRevisione === undefined) return { ok: false, messaggio: 'Il Drive non è collegato, o la cassaforte è chiusa.' }
      if (versioniInCorso) return { ok: false, messaggio: 'Le versioni si stanno già contando.' }
      versioniInCorso = true
      let tolte = 0
      let rifiutate = 0
      let errori = 0
      let byte = 0
      try {
        const cand = await candidatiVersioni(a)
        await inParallelo(cand, 4, async (c) => {
          let daTogliere
          // Si rilegge adesso: quello che si cancella e' quello che c'e' ora, non la stima di prima.
          try { daTogliere = revisioniDaCancellare(await a.elencaRevisioni!(c.id), c.tenere) } catch { errori += 1; return }
          for (const rev of daTogliere) {
            try {
              if (await a.cancellaRevisione!(c.id, rev.id) === 'ok') { tolte += 1; byte += rev.byte }
              else { rifiutate += 1; deps.log(`[spazio] versione ${rev.id} di ${c.nome}: il Drive non la cancella, la salto`) }
            } catch (err) {
              errori += 1
              deps.log(`[spazio] versione ${rev.id} di ${c.nome} non cancellata: ${err instanceof Error ? err.message : String(err)}`)
            }
          }
        })
      } catch (err) {
        return { ok: false, messaggio: `Non riesco a togliere le versioni: ${err instanceof Error ? err.message : String(err)}` }
      } finally {
        versioniInCorso = false
        stimaVersioniFatta = undefined
        ultimo = undefined
      }
      deps.log(`[spazio] versioni vecchie tolte su conferma: ${tolte} (${byteLeggibili(byte)}), ${rifiutate} rifiutate dal Drive, ${errori} errori`)
      const saltate = rifiutate + errori
      return { ok: true, messaggio: `Tolte ${tolte} versioni vecchie (circa ${byteLeggibili(byte)} liberati)${saltate > 0 ? `; ${saltate} saltate, il Drive non le ha cancellate` : ''}.` }
    },

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

    async pulisci(tipo, chi) {
      // Le versioni non passano dal recupero e non partono mai da sole: hanno la loro conferma.
      if (tipo === 'versioni') return { ok: false, messaggio: 'Le versioni vecchie si tolgono con la loro conferma.' }
      // Le proposte si rifanno adesso: quello che si toglie è quello che c'è ora.
      const st = await leggiTutto()
      if (st.errore !== undefined) return { ok: false, messaggio: st.errore }
      const pr = st.proposte.find((x) => x.tipo === tipo)
      if (pr === undefined || pr.voci.length === 0) return { ok: false, messaggio: 'Non c’è più niente da pulire qui.' }
      return applica(pr, chi)
    },

    async togliChat(sessioni, titolo) {
      const a = deps.archivio()
      if (a?.elencaConDimensioni === undefined) return { ok: false, messaggio: 'Il Drive non è collegato, o la cassaforte è chiusa.' }
      const [file, manifesto, r] = await Promise.all([a.elencaConDimensioni(), deps.manifestoDrive(), leggiRegistro()])
      if (manifesto === undefined) return { ok: false, messaggio: 'L’indice del Drive non si apre adesso.' }
      const pr = propostaChatEliminate({ file, indice: manifesto.file, sessioni, titolo, pulizie: r })
      if (pr.voci.length === 0) return { ok: true, messaggio: 'Sul Drive non c’erano copie di queste chat.' }
      return applica(pr)
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
      deps.log(`[spazio] recupero «${p.titolo}» svuotato su richiesta: ${e.tolti} file cancellati${e.errori > 0 ? `, ${e.errori} non riusciti` : ''}`)
      // Svuotata solo se è andato via tutto: altrimenti resta, e il giro (o un nuovo «Svuota») riprova.
      if (e.errori > 0) return { ok: false, messaggio: `${e.tolti} file cancellati, ${e.errori} no: riprova più tardi` }
      await cambiaPulizia(id, (x) => ({ ...x, svuotataIl: new Date(adesso()).toISOString() }))
      return { ok: true, messaggio: `Svuotato: ${byteLeggibili(p.byte)} liberati.` }
    },

    fuoriDalDrive: (percorso, size) => restaFuori(registro, percorso, size),

    async chatSulDrive() {
      if (deps.inAttesa?.() === true) return { ok: false, messaggio: 'Il Drive chiede di rallentare: riprovo dopo.', tolte: 0 }
      if (chatInCorso) return { ok: false, messaggio: 'Le chat sul Drive si stanno già sistemando.', tolte: 0 }
      chatInCorso = true
      try {
        const st = await leggiTutto()
        if (st.errore !== undefined || st.misura === undefined) return { ok: false, messaggio: st.errore ?? 'Il Drive non risponde.', tolte: 0 }
        const r = await leggiRegistro()
        const a = deps.archivio()
        const [file, manifesto] = await Promise.all([a?.elencaConDimensioni?.() ?? Promise.resolve([]), deps.manifestoDrive()])
        if (manifesto === undefined) return { ok: false, messaggio: 'L’indice del Drive non si apre adesso.', tolte: 0 }
        const pieno = deps.pieno?.() === true
        const poco = spazioPoco(st.misura.quota) || pieno
        const proposte = proposteChatSulDrive({
          file, indice: manifesto.file, copieSuiPc: deps.copieSuiPc(), pulizie: r, adesso: adesso(),
          soloQui: deps.soloQui ?? (() => false),
          ...(deps.sessioniSoloLocali !== undefined ? { sessioniSoloLocali: deps.sessioniSoloLocali() } : {}),
          ...(st.misura.quota !== undefined ? { quota: st.misura.quota } : {}),
          pieno
        })
        let tolte = 0
        for (const pr of proposte) {
          if (pr.voci.length === 0) continue
          // Prima «solo locali», poi via dal Drive: cosi' un salvataggio in mezzo non le rimanda su.
          if (pr.tipo === 'chat-spazio-poco') deps.segnaSoloLocali?.(sessioniDelleVoci(pr.voci))
          const esito = await applica(pr, 'automatico')
          if (!esito.ok || esito.pulizia === undefined) { deps.log(`[spazio] chat sul Drive: «${pr.titolo}» non fatta (${esito.messaggio})`); continue }
          tolte += sessioniDelleVoci(pr.voci).length
          // Con poco spazio il recupero di 30 giorni non libera niente: si svuota subito. Sul PC le chat restano.
          if (poco) await this.svuota(esito.pulizia.id)
        }
        return { ok: true, messaggio: tolte === 0 ? 'Niente da togliere dal Drive.' : `${tolte} chat tolte dal Drive (sul PC restano).`, tolte }
      } catch (err) {
        return { ok: false, messaggio: `Chat sul Drive non sistemate: ${err instanceof Error ? err.message : String(err)}`, tolte: 0 }
      } finally {
        chatInCorso = false
      }
    },

    async giro() {
      if (deps.scatola() === undefined) return
      try {
        const r = await leggiRegistro()
        for (const p of daSvuotare(r, adesso())) {
          const e = await togliFile(p)
          deps.log(`[spazio] recupero «${p.titolo}» scaduto: ${e.tolti} file cancellati dal Drive (${byteLeggibili(p.byte)})${e.errori > 0 ? `, ${e.errori} non riusciti: riprovo al prossimo giro` : ''}`)
          if (e.errori === 0) await cambiaPulizia(p.id, (x) => ({ ...x, svuotataIl: new Date(adesso()).toISOString() }))
        }
        // Il recupero scaduto va nel recupero da solo (0.69.0), una volta al giorno.
        if (adesso() - ultimaPuliziaDaSola >= PULIZIA_DA_SOLA_OGNI_MS) {
          ultimaPuliziaDaSola = adesso()
          const st = await leggiTutto()
          for (const pr of pulizieDaSole(st.proposte)) await this.pulisci(pr.tipo, 'automatico')
        }
        // Le chat sul Drive (0.96.0): ogni 6 ore, e subito se lo spazio e' finito.
        if (adesso() - ultimoGiroChat >= GIRO_CHAT_OGNI_MS || deps.pieno?.() === true) {
          ultimoGiroChat = adesso()
          const e = await this.chatSulDrive()
          if (e.tolte > 0 || !e.ok) deps.log(`[spazio] chat sul Drive: ${e.messaggio}`)
        }
      } catch (err) {
        deps.log(`[spazio] giro non riuscito: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }
}
