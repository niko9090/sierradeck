import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Autopilota } from '@shared/autopilota'
import { daScrivereAdesso, sessioniProprie } from '@shared/adozione'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import type { StatoMigrazione } from '@shared/migrazione-elenco'
import { FILE_ADOZIONE, leggiStatoAdozione, pianoAdozione, sessioniDelWorkspace, type Adozione, type StatoAdozione } from '@shared/migrazione-adozione'
import type { Archivio } from '@shared/workspace'
import { CARTELLA_COPIE } from './copie-di-versione'

/**
 * Le chat già avviate adottate dall'autopilota del loro workspace (0.78.0).
 * Nicholas, 16/10: «le chat già avviate non le hai convertite». Le regole
 * sono in `shared/adozione.ts` e `shared/migrazione-adozione.ts`; qui i file
 * e il servizio.
 *
 * Sicurezza come nella 0.74.1:
 * - **copia prima di cambiare**: gli autopiloti e lo stato della 0.74.1 in
 *   `copie-di-versione/migrazione-adozione-<quando>` (in `.tmp`, poi un rename);
 * - **idempotente**: adottare due volte la stessa chat non fa niente;
 * - **«Torna come prima»**: toglie le chat adottate da questa migrazione e
 *   rimette i dormienti;
 * - **solo i workspace di questo PC** (il suo archivio);
 * - **se qualcosa fallisce il PC parte come prima**: si toglie quello che si
 *   era adottato, stato `fallita`, riga nel registro;
 * - **nessuna chat chiusa o riavviata**: qui non si apre, chiude, riprende o
 *   sposta niente; i file delle chat non si scrivono;
 * - righe `[migrazione]` e `[adozione]` nel registro.
 *
 * Gli autopiloti li scrive solo il loro servizio: qui si chiede a lui.
 */

export type ServizioAdozione = {
  elenca: () => Promise<Autopilota[]>
  adotta: (id: string, chat: { sessionId: string; titolo: string }[], soloMie?: string[]) => Promise<string[]>
  togli: (id: string, sessioni: string[]) => Promise<void>
}

export type DipendenzeAdozione = {
  dati: string
  leggiArchivio: () => Archivio | undefined
  statoMigrazione: () => StatoMigrazione | undefined
  servizio: ServizioAdozione
  log: (riga: string) => void
  errore?: (riga: string) => void
  adesso?: () => Date
  /** Solo per le prove: solleva a un passo, come un guasto lì. */
  guasto?: (passo: 'copia' | 'dopo-adozione') => void
}

/** Le chat di un workspace che si possono adottare: non quelle di un autopilota (il suo o un altro). */
export function adottabili(archivio: Archivio, workspace: string, autopiloti: readonly Autopilota[]): { sessionId: string; titolo: string }[] {
  const altrui = new Set<string>()
  for (const a of autopiloti) for (const s of sessioniProprie(a)) altrui.add(s)
  return sessioniDelWorkspace(archivio, workspace).filter((c) => !altrui.has(c.sessionId))
}

export function creaMigrazioneAdozione(d: DipendenzeAdozione) {
  const adesso = d.adesso ?? (() => new Date())
  const file = join(d.dati, FILE_ADOZIONE)
  const errore = d.errore ?? d.log

  const stato = (): StatoAdozione | undefined => {
    try { return existsSync(file) ? leggiStatoAdozione(JSON.parse(readFileSync(file, 'utf8'))) : undefined } catch { return undefined }
  }
  const scrivi = (s: StatoAdozione): void => {
    if (!scriviJsonAtomico(file, s, 'migrazione')) throw new Error(`${FILE_ADOZIONE} non si è potuto scrivere`)
  }
  const copia = (): string => {
    d.guasto?.('copia')
    const t = adesso().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '').replace('T', '-')
    const radice = join(d.dati, CARTELLA_COPIE)
    let nome = `migrazione-adozione-${t}`
    for (let i = 2; existsSync(join(radice, nome)); i++) nome = `migrazione-adozione-${t}-${i}`
    const tmp = join(radice, `.${nome}.tmp`)
    mkdirSync(join(tmp, 'autopiloti'), { recursive: true })
    for (const f of ['migrazione-elenco.json', 'workspaces.json']) if (existsSync(join(d.dati, f))) copyFileSync(join(d.dati, f), join(tmp, f))
    const ap = join(d.dati, 'autopiloti')
    if (existsSync(ap)) {
      for (const f of readdirSync(ap)) if (/^ap-.*\.json$/.test(f) && statSync(join(ap, f)).isFile()) copyFileSync(join(ap, f), join(tmp, 'autopiloti', f))
    }
    renameSync(tmp, join(radice, nome))
    return nome
  }

  /** Toglie le adozioni fatte (guasto o «Torna come prima»). Torna quante non si sono potute togliere. */
  const togliTutte = async (adozioni: Adozione[]): Promise<number> => {
    let restano = 0
    for (const x of adozioni) {
      if (x.sessioni.length === 0) continue
      try { await d.servizio.togli(x.autopilota, x.sessioni) } catch (e) { restano += 1; errore(`[migrazione] adozione: non riesco a togliere le chat adottate da ${x.autopilota}: ${String(e)}`) }
    }
    return restano
  }

  const esegui = async (forza = false): Promise<{ esito: 'fatta' | 'gia' | 'fallita' | 'niente'; stato?: StatoAdozione }> => {
    const prima = stato()
    if (!forza && (prima?.stato === 'fatta' || prima?.stato === 'annullata' || prima?.stato === 'fallita')) return { esito: 'gia', stato: prima }
    // Un riavvio a metà: si toglie quello che risultava adottato, poi si rifà.
    if (prima?.stato === 'in-corso') {
      d.log(`[migrazione] adozione trovata a metà (iniziata ${prima.iniziata}): tolgo le chat già adottate e la rifaccio`)
      await togliTutte(prima.adozioni)
    }
    const fatte: Adozione[] = []
    try {
      const a = d.leggiArchivio()
      if (a === undefined) throw new Error("l'archivio dei workspace non si legge")
      const autopiloti = await d.servizio.elenca()
      const piano = pianoAdozione(a, d.statoMigrazione(), autopiloti)
      if (piano.adozioni.length === 0) {
        const vuota: StatoAdozione = { versione: 1, stato: 'fatta', iniziata: adesso().toISOString(), finita: adesso().toISOString(), dormientiArchiviati: [], adozioni: [] }
        scrivi(vuota)
        d.log('[migrazione] adozione: nessun workspace di questo PC ha un autopilota vero; le chat si adottano quando nasce il suo autopilota')
        return { esito: 'niente', stato: vuota }
      }
      const cartella = copia()
      const iniziata = adesso().toISOString()
      const inCorso = (): StatoAdozione => ({ versione: 1, stato: 'in-corso', iniziata, copia: cartella, dormientiArchiviati: piano.dormientiArchiviati, adozioni: fatte })
      scrivi(inCorso())
      for (const x of piano.adozioni) {
        const nuove = await d.servizio.adotta(x.autopilota, adottabili(a, x.workspace, autopiloti))
        fatte.push({ autopilota: x.autopilota, workspace: x.workspace, sessioni: nuove })
        scrivi(inCorso())
        d.guasto?.('dopo-adozione')
      }
      const fatta: StatoAdozione = { ...inCorso(), stato: 'fatta', finita: adesso().toISOString() }
      scrivi(fatta)
      d.log(`[migrazione] adozione fatta: ${fatte.length} autopiloti veri diventano l'autopilota del loro workspace, ${fatte.reduce((n, x) => n + x.sessioni.length, 0)} chat adottate, ${piano.dormientiArchiviati.length} dormienti doppi archiviati; nessuna chat chiusa o riavviata; copia in ${CARTELLA_COPIE}/${cartella}`)
      for (const x of fatte) d.log(`[migrazione] «${x.workspace}»: l'autopilota ${x.autopilota} adotta ${x.sessioni.length} chat`)
      return { esito: 'fatta', stato: fatta }
    } catch (err) {
      const motivo = err instanceof Error ? err.message : String(err)
      await togliTutte(fatte)
      const fallita: StatoAdozione = { versione: 1, stato: 'fallita', iniziata: adesso().toISOString(), dormientiArchiviati: [], adozioni: [], motivo }
      try { scrivi(fallita) } catch { /* lo dice il registro */ }
      errore(`[migrazione] adozione non riuscita, tutto com'era prima: ${motivo}`)
      return { esito: 'fallita', stato: fallita }
    }
  }

  return {
    stato,
    esegui: () => esegui(false),
    rifai: () => esegui(true),
    /** «Torna come prima»: via le chat adottate da questa migrazione, i dormienti di nuovo lì. Le chat non si toccano. */
    async tornaComePrima(): Promise<{ ok: boolean; messaggio: string }> {
      const s = stato()
      if (s === undefined || (s.stato !== 'fatta' && s.stato !== 'in-corso')) return { ok: false, messaggio: 'Non c’è un’adozione da annullare.' }
      const restano = await togliTutte(s.adozioni)
      if (restano > 0) return { ok: false, messaggio: 'Il servizio degli autopiloti non risponde: riprova fra un momento.' }
      scrivi({ ...s, stato: 'annullata', finita: adesso().toISOString() })
      d.log(`[migrazione] adozione: «Torna come prima» (${s.adozioni.reduce((n, x) => n + x.sessioni.length, 0)} chat non più adottate, ${s.dormientiArchiviati.length} dormienti rimessi); chat non toccate`)
      return { ok: true, messaggio: 'Fatto: le chat non sono più adottate. Le chat non sono state toccate.' }
    }
  }
}

export type MigrazioneAdozione = ReturnType<typeof creaMigrazioneAdozione>

/**
 * Il giro dell'adozione, finché il programma è acceso: ogni pochi secondi
 * - le chat nuove del workspace di un autopilota vero si adottano (solo con
 *   l'adozione fatta, non dopo «Torna come prima»);
 * - i messaggi per le chat adottate si scrivono, uno per chat, solo se la
 *   chat è viva e ferma; poi si dice al servizio che sono scritti.
 * Mai aprire, riprendere, chiudere o spostare una chat.
 */
export function avviaGiroAdozione(p: {
  servizio: ServizioAdozione & { scritti: (id: string, ids: string[]) => Promise<void> }
  leggiArchivio: () => Archivio | undefined
  adozioneAttiva: () => boolean
  /** Le chat «solo mia» delle preferenze del PC: valgono anche se il file dell'autopilota non le ha. */
  soloMie?: () => readonly string[]
  chat: () => readonly { id: string; sessione?: string; aspetta?: boolean; viva?: boolean }[]
  scrivi: (chatId: string, testo: string) => void
  log: (riga: string) => void
  ogniMs?: number
}): () => void {
  let vivo = true
  const giro = async (): Promise<void> => {
    let autopiloti: Autopilota[]
    try { autopiloti = await p.servizio.elenca() } catch { return }
    const veri = autopiloti.filter((a) => a.archiviato !== true && a.workspace !== undefined)
    const mie = new Set(p.soloMie?.() ?? [])
    if (p.adozioneAttiva()) {
      const archivio = p.leggiArchivio()
      if (archivio !== undefined) {
        for (const a of veri) {
          const conosciute = new Set((a.adottate ?? []).map((x) => x.sessionId))
          const nuove = adottabili(archivio, a.workspace!, autopiloti).filter((c) => !conosciute.has(c.sessionId))
          if (nuove.length > 0) await p.servizio.adotta(a.id, nuove, [...mie]).catch(() => [])
        }
      }
    }
    const chat = p.chat()
    for (const a of veri) {
      const ora = daScrivereAdesso(a, chat).filter((x) => !mie.has(x.messaggio.sessionId))
      if (ora.length === 0) continue
      for (const x of ora) {
        p.scrivi(x.chatId, x.messaggio.testo)
        p.log(`[adozione] ${a.id} — scritto alla chat adottata ${x.messaggio.sessionId.slice(0, 8)} (ferma): ${x.messaggio.testo.slice(0, 80)}`)
      }
      await p.servizio.scritti(a.id, ora.map((x) => x.messaggio.id)).catch(() => undefined)
    }
  }
  const ciclo = async (): Promise<void> => {
    while (vivo) {
      try { await giro() } catch (e) { p.log(`[adozione] giro non riuscito: ${String(e)}`) }
      await new Promise((r) => setTimeout(r, p.ogniMs ?? 4000))
    }
  }
  void ciclo()
  return () => { vivo = false }
}
