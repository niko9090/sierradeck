import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync } from 'node:fs'
import { lstat, readdir } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { cancellaSicura, CancellazioneRifiutata } from '@shared/cancella-sicura'
import {
  conArchiviata, controllaGettone, eFileTodoDi, GETTONE_SVUOTA_MS, improntaSvuota, leggiArchiviate, leggiRecuperoChat, messaggioEsito,
  motivoNonArchivia, motivoNonChiude, motivoNonElimina, nelRecupero, partiDiSessione, potaRecupero, scadenzaRecupero, scaduteRecupero,
  senzaArchiviate, sessioneValida, slugValido, totaleSelezione, vistaSpazio, FRASE_SVUOTA,
  type AzioneChat, type ChatArchiviata, type ChatInRecupero, type EsitoAzioni, type EsitoChat, type FileInRecupero, type GettoneSvuota,
  type ParteSessione, type RegistroRecuperoChat, type StatoPerAzione, type VistaSpazio, type VoceSpazio
} from '@shared/gestione-chat'
import { byteLeggibili } from '@shared/spazio-drive'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'

/**
 * **La gestione delle chat** (0.79.0), lato disco. Le regole stanno in
 * `@shared/gestione-chat`; qui si misura, si sposta e si ricorda.
 *
 * - Le archiviate in `chat-archiviate.json`, accanto ai dati.
 * - Le eliminate dal PC in `recupero-chat/<id>/…`, accanto ai dati, con il
 *   registro `recupero-chat.json`. Ogni file esce dalla cartella di Claude
 *   Code **solo** attraverso `cancellaSicura` (modo «recupero»: si sposta,
 *   non si cancella), e dal recupero esce, alla scadenza o con «Svuota
 *   adesso», di nuovo solo attraverso `cancellaSicura`, dentro la cartella
 *   del recupero.
 *
 * Un file per volta, mai una cartella che contiene altre chat: il percorso
 * di ogni parte contiene l'id della sessione (`partiDiSessione`).
 */

export type InfoSessione = {
  sessione: string
  slug: string
  titolo: string
  cwd?: string
  ultimaAttivita?: string
}

export type DipendenzeGestioneChat = {
  /** La radice di Claude Code (`~/.claude` o `CLAUDE_CONFIG_DIR`). */
  radiceClaude: () => string
  /** La cartella dei dati di SierraDeck. */
  dati: string
  /** Le chat che l'indice conosce su questo PC. */
  sessioni: () => InfoSessione[]
  /** Toglie dall'indice (si rifà da sé alla prossima lettura, se i file tornano). */
  togliDallIndice: (sessioni: string[]) => void
  /** Rilegge l'indice dopo un ripristino. */
  rileggiIndice?: () => void
  /** Lo stato adesso: aperta, governata, di un altro PC, PIN. */
  statoDi: (s: { sessione: string; cwd?: string }, visore?: string) => Promise<StatoPerAzione>
  /** Chiude la chat aperta (riquadro o sottofondo). */
  chiudi: (sessione: string, da: string) => Promise<{ ok: boolean; errore?: string }>
  etichette: { leggi: () => Record<string, string>; imposta: (sessione: string, testo: string) => void }
  /**
   * Toglie il riquadro di quella chat dai workspace che nessuna finestra
   * mostra (quelli mostrati li rifiuta già `statoDi`): i nomi dei workspace.
   * Senza, aprendo quel workspace la chat ripartirebbe vuota.
   */
  togliDaiWorkspaceNascosti?: (sessione: string) => string[]
  /** Il Drive, se collegato: «anche dal Drive». */
  drive?: {
    togliChat: (sessioni: string[], titolo: string) => Promise<{ ok: boolean; messaggio: string; pulizia?: { id: string; voci: unknown[]; byte: number } }>
    annulla: (idPulizia: string) => Promise<{ ok: boolean; messaggio: string }>
    svuota: (idPulizia: string) => Promise<{ ok: boolean; messaggio: string }>
  }
  /** Avvisa le finestre (e il telefono, all'appello dopo) che gli elenchi sono cambiati. */
  cambiato?: () => void
  log: (riga: string) => void
  adesso?: () => number
}

export type RichiestaAzione = {
  azione: AzioneChat
  sessioni: string[]
  ancheDalDrive?: boolean
  nome?: string
  /** Chi lo chiede, per il registro: «PC», «telefono», il nome di un altro PC. */
  da?: string
  visore?: string
}

export type GestioneChat = {
  spazio: (visore?: string) => Promise<VistaSpazio>
  selezione: (sessioni: string[], visore?: string) => Promise<ReturnType<typeof totaleSelezione>>
  azione: (r: RichiestaAzione) => Promise<EsitoAzioni>
  archiviate: () => ChatArchiviata[]
  eArchiviata: (sessione: string) => boolean
  recupero: () => { chat: ChatInRecupero[]; byte: number }
  ripristinaDalRecupero: (id: string, da?: string) => Promise<{ ok: boolean; messaggio: string }>
  chiediSvuota: (ancheDalDrive: boolean) => { ok: boolean; messaggio: string; gettone?: string; scadeIl?: string; chat?: number; byte?: number; frase?: string }
  svuota: (p: { gettone: unknown; frase: unknown; ancheDalDrive: boolean; da?: string }) => Promise<{ ok: boolean; messaggio: string; byte?: number }>
  /** Svuota da solo le chat rimaste nel recupero oltre i 30 giorni. */
  giro: () => Promise<void>
  /** Le voci che non hanno più una chat: nomi e archiviate di sessioni sparite. */
  orfane: () => { etichette: string[]; archiviate: string[] }
  /** Toglie le voci orfane di chat che SierraDeck stesso ha eliminato (svuotate dal recupero). */
  pulisciOrfane: () => { etichette: number; archiviate: number }
  /** Per l'arrivo dal Drive: un percorso `chat/<slug>/<sessione>…` di una chat eliminata da qui non scende. */
  tolteDaQui: (percorsoDrive: string) => boolean
}

/** Un messaggio del Drive dentro una frase nostra: senza il suo punto finale e con la minuscola (dal vero, c-75: «chiusa.. Le copie»). */
const dentroFrase = (m: string): string => {
  const t = m.trim().replace(/[.\s]+$/, '')
  return t.charAt(0).toLowerCase() + t.slice(1)
}

const FILE_ARCHIVIATE = 'chat-archiviate.json'
const FILE_RECUPERO = 'recupero-chat.json'
const CARTELLA_RECUPERO = 'recupero-chat'

/** Byte di un file o di una cartella (senza seguire i collegamenti). */
export async function byteDi(percorso: string): Promise<number> {
  let s
  try { s = await lstat(percorso) } catch { return 0 }
  if (s.isSymbolicLink()) return 0
  if (s.isFile()) return s.size
  if (!s.isDirectory()) return 0
  let tot = 0
  let voci: string[] = []
  try { voci = await readdir(percorso) } catch { return 0 }
  for (const v of voci) tot += await byteDi(join(percorso, v))
  return tot
}

/** I file di una sessione che ci sono davvero, con la loro parte. */
export function fileDiSessione(radice: string, slug: string, sessione: string): { parte: ParteSessione; relativo: string[]; percorso: string }[] {
  const fuori: { parte: ParteSessione; relativo: string[]; percorso: string }[] = []
  for (const p of partiDiSessione(slug, sessione)) {
    const percorso = join(radice, ...p.relativo)
    if (existsSync(percorso)) fuori.push({ ...p, percorso })
  }
  const todos = join(radice, 'todos')
  if (sessioneValida(sessione) && existsSync(todos)) {
    let nomi: string[] = []
    try { nomi = readdirSync(todos) } catch { nomi = [] }
    for (const n of nomi) if (eFileTodoDi(n, sessione)) fuori.push({ parte: 'todo', relativo: ['todos', n], percorso: join(todos, n) })
  }
  return fuori
}

export function creaGestioneChat(deps: DipendenzeGestioneChat): GestioneChat {
  const adesso = deps.adesso ?? Date.now
  const fileArchiviate = join(deps.dati, FILE_ARCHIVIATE)
  const fileRecupero = join(deps.dati, FILE_RECUPERO)
  const cartellaRecupero = join(deps.dati, CARTELLA_RECUPERO)
  let gettone: GettoneSvuota | undefined

  const leggiJson = (f: string): unknown => {
    if (!existsSync(f)) return undefined
    try { return JSON.parse(readFileSync(f, 'utf8')) } catch (err) {
      // Un registro rotto non è un registro vuoto: lo si mette da parte (non si
      // cancella) prima che la prossima scrittura lo copra, e lo si dice.
      const copia = `${f}.illeggibile-${new Date(adesso()).toISOString().replace(/[:.]/g, '-')}`
      try { renameSync(f, copia) } catch { /* resta dov'è: la riga sotto lo dice */ }
      deps.log(`[chat] ${f} illeggibile (${err instanceof Error ? err.message : String(err)}): messo da parte come ${copia}`)
      return undefined
    }
  }
  let archiviateMem: ChatArchiviata[] | undefined
  const archiviate = (): ChatArchiviata[] => (archiviateMem ??= leggiArchiviate(leggiJson(fileArchiviate)))
  /** `false` se non si è scritto: chi chiama non dice «fatto». */
  const scriviArchiviate = (l: ChatArchiviata[]): boolean => {
    if (!scriviJsonAtomico(fileArchiviate, { versione: 1, archiviate: l }, 'chat-archiviate')) { deps.log('[chat] chat-archiviate.json non salvato'); return false }
    archiviateMem = l
    return true
  }
  // In memoria finché il file non cambia: l'arrivo dal Drive chiede `tolteDaQui` per ogni file del
  // manifesto, e rileggere il registro a ogni domanda erano migliaia di letture (revisione ECC).
  let recuperoMem: { impronta: string; r: RegistroRecuperoChat } | undefined
  const leggiRecupero = (): RegistroRecuperoChat => {
    let impronta = ''
    try { const s = statSync(fileRecupero); impronta = `${s.mtimeMs}:${s.size}` } catch { impronta = 'assente' }
    if (recuperoMem?.impronta !== impronta) recuperoMem = { impronta, r: leggiRecuperoChat(leggiJson(fileRecupero)) }
    return recuperoMem.r
  }
  const scriviRecupero = (r: RegistroRecuperoChat): boolean => {
    if (scriviJsonAtomico(fileRecupero, potaRecupero(r, adesso()), 'recupero-chat')) return true
    deps.log('[chat] recupero-chat.json non salvato')
    return false
  }
  const cambiaVoce = (id: string, cambia: (c: ChatInRecupero) => ChatInRecupero): boolean => {
    const r = leggiRecupero()
    return scriviRecupero({ ...r, chat: r.chat.map((c) => (c.id === id ? cambia(c) : c)) })
  }
  /** Le azioni una per volta: due «Elimina» insieme (doppio tocco, PC e telefono) non si pestano i piedi. */
  let fila: Promise<unknown> = Promise.resolve()
  const inFila = <T>(f: () => Promise<T>): Promise<T> => {
    const p = fila.then(f, f)
    fila = p.catch(() => undefined)
    return p
  }
  /** Lo stato di una chat; se non si riesce a saperlo, `undefined`: nel dubbio non si tocca. */
  const statoSicuro = (s: { sessione: string; cwd?: string }, visore?: string): Promise<StatoPerAzione | undefined> =>
    deps.statoDi(s, visore).catch((err: unknown) => {
      deps.log(`[chat] stato di ${s.sessione.slice(0, 8)} non letto: ${err instanceof Error ? err.message : String(err)}`)
      return undefined
    })
  const NON_SO = 'non riesco a sapere se è in uso adesso: nel dubbio non la tocco, riprova fra poco.'
  /** Rimette al loro posto i file spostati nel recupero; quelli che non tornano, per nome. */
  const rimetti = (radice: string, file: FileInRecupero[]): string[] => {
    const restano: string[] = []
    for (const x of file) {
      try { renameSync(x.dove, join(radice, ...x.relativo)) } catch (err) {
        restano.push(x.relativo.join('/'))
        deps.log(`[chat] ${x.relativo.join('/')} non tornato al suo posto, resta in ${x.dove}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    return restano
  }
  const nonTornati = (l: string[]): string => (l.length === 0 ? 'Niente è cambiato.' : `${l.length} suoi file non sono tornati al loro posto e restano in «${CARTELLA_RECUPERO}» (guarda il registro).`)
  const info = (): Map<string, InfoSessione> => new Map(deps.sessioni().map((s) => [s.sessione, s]))
  const ora = (): string => new Date(adesso()).toISOString()

  /** Le parti misurate di una chat. */
  const misura = async (s: InfoSessione): Promise<{ byte: number; parti: Partial<Record<ParteSessione, number>> }> => {
    const parti: Partial<Record<ParteSessione, number>> = {}
    let byte = 0
    for (const f of fileDiSessione(deps.radiceClaude(), s.slug, s.sessione)) {
      const b = await byteDi(f.percorso)
      parti[f.parte] = (parti[f.parte] ?? 0) + b
      byte += b
    }
    return { byte, parti }
  }

  /** Sposta nel recupero tutti i file di una chat; se uno non si sposta, rimette quelli già spostati. */
  const spostaNelRecupero = (s: InfoSessione, id: string): { ok: true; file: FileInRecupero[] } | { ok: false; motivo: string; restano: string[] } => {
    const radice = deps.radiceClaude()
    const fatti: FileInRecupero[] = []
    const dentroIlRecupero = join(cartellaRecupero, id)
    let i = 0
    for (const f of fileDiSessione(radice, s.slug, s.sessione)) {
      const qui = join(dentroIlRecupero, String(i))
      i += 1
      try {
        // Un file per volta, permesso solo nella cartella che lo contiene: mai la cartella stessa.
        cancellaSicura(f.percorso, { dentro: [dirname(f.percorso)], come: { modo: 'recupero', cartella: qui } })
        const nome = readdirSync(qui)[0]
        if (nome === undefined) throw new Error('il file non è arrivato nel recupero')
        fatti.push({ parte: f.parte, relativo: f.relativo, dove: join(qui, nome), byte: 0 })
      } catch (err) {
        // Mezza chat non resta mai mezza: quello che si era spostato torna al suo posto.
        const restano = rimetti(radice, fatti)
        const codice = (err as { code?: string }).code ?? ''
        const motivo = err instanceof CancellazioneRifiutata
          ? `la guardia delle cancellazioni l’ha fermata: ${err.motivo}`
          : codice === 'EBUSY' || codice === 'EPERM' || codice === 'EACCES'
            ? `un programma usa ancora un suo file (${codice}): chiudi la chat e riprova`
            : `non si è spostata: ${err instanceof Error ? err.message : String(err)}`
        return { ok: false, motivo, restano }
      }
    }
    return { ok: true, file: fatti }
  }

  const ammesso = (azione: AzioneChat, st: StatoPerAzione): string | undefined =>
    azione === 'elimina' ? motivoNonElimina(st) : azione === 'archivia' ? motivoNonArchivia(st) : azione === 'chiudi' ? motivoNonChiude(st) : undefined

  const gestione: GestioneChat = {
    async spazio(visore) {
      const arch = new Set(archiviate().map((a) => a.sessione))
      const voci: VoceSpazio[] = []
      for (const s of deps.sessioni()) {
        if (!sessioneValida(s.sessione) || !slugValido(s.slug)) continue
        const m = await misura(s)
        const st = await statoSicuro({ sessione: s.sessione, ...(s.cwd !== undefined ? { cwd: s.cwd } : {}) }, visore)
        const no = st === undefined ? `«${s.titolo}»: ${NON_SO}` : motivoNonElimina({ ...st, titolo: s.titolo })
        voci.push({
          sessione: s.sessione, titolo: s.titolo, slug: s.slug, byte: m.byte, parti: m.parti,
          ...(s.cwd !== undefined ? { cwd: s.cwd } : {}),
          ...(s.ultimaAttivita !== undefined ? { ultimaAttivita: s.ultimaAttivita } : {}),
          archiviata: arch.has(s.sessione), aperta: st?.aperta !== undefined,
          ...(no !== undefined ? { nonEliminabile: no } : {})
        })
      }
      return vistaSpazio(voci, leggiRecupero())
    },

    async selezione(sessioni, visore) {
      const v = await gestione.spazio(visore)
      return totaleSelezione(v.chat, sessioni)
    },

    azione: (r) => inFila(() => fai(r)),

    archiviate: () => [...archiviate()],
    eArchiviata: (s) => archiviate().some((a) => a.sessione === s),

    recupero() {
      const chat = leggiRecupero().chat.filter(nelRecupero).sort((a, b) => b.quando.localeCompare(a.quando))
      return { chat, byte: chat.reduce((t, c) => t + c.byte, 0) }
    },

    ripristinaDalRecupero: (id, da = 'PC') => inFila(() => ripristina(id, da)),

    chiediSvuota(ancheDalDrive) {
      const nel = leggiRecupero().chat.filter(nelRecupero)
      if (nel.length === 0) { gettone = undefined; return { ok: false, messaggio: 'Il recupero è vuoto.' } }
      const scade = adesso() + GETTONE_SVUOTA_MS
      gettone = { gettone: randomBytes(16).toString('hex'), impronta: improntaSvuota(nel, ancheDalDrive), scadeIl: scade }
      const byte = nel.reduce((t, c) => t + c.byte, 0)
      const conDrive = ancheDalDrive ? nel.filter((c) => c.drive !== undefined).length : 0
      return {
        ok: true,
        gettone: gettone.gettone,
        scadeIl: new Date(scade).toISOString(),
        chat: nel.length,
        byte,
        frase: FRASE_SVUOTA,
        messaggio: `Cancella per sempre ${nel.length === 1 ? '1 chat' : `${nel.length} chat`} (${byteLeggibili(byte)}) da questo PC${conDrive > 0 ? `, e le loro copie nel recupero del Drive (${conDrive})` : ''}. Non si torna indietro: scrivi ${FRASE_SVUOTA} per confermare.`
      }
    },

    svuota: (p) => inFila(async () => {
      const nel = leggiRecupero().chat.filter(nelRecupero)
      const ok = controllaGettone(gettone, { gettone: p.gettone, frase: p.frase, impronta: improntaSvuota(nel, p.ancheDalDrive), adesso: adesso() })
      if (!ok.ok) return { ok: false, messaggio: ok.motivo }
      gettone = undefined
      const e = await svuotaVoci(nel, p.ancheDalDrive, p.da ?? 'PC', 'su richiesta')
      return { ok: e.non === 0 && e.driveOk, messaggio: `Recupero svuotato: ${byteLeggibili(e.byte)} liberati${e.non > 0 ? `; ${e.non} chat non si sono cancellate del tutto (riprova)` : ''}.${e.drive}`, byte: e.byte }
    }),

    giro: () => inFila(async () => {
      const scadute = scaduteRecupero(leggiRecupero(), adesso())
      if (scadute.length === 0) return
      // Il Drive svuota da sé le sue pulizie scadute: qui solo il PC.
      await svuotaVoci(scadute, false, 'automatico', 'dopo 30 giorni')
    }),

    orfane() {
      const note = new Set(deps.sessioni().map((s) => s.sessione))
      const nelRec = new Set(leggiRecupero().chat.filter(nelRecupero).map((c) => c.sessione))
      const vive = (s: string): boolean => note.has(s) || nelRec.has(s)
      return {
        etichette: Object.keys(deps.etichette.leggi()).filter((s) => sessioneValida(s) && !vive(s)),
        archiviate: archiviate().map((a) => a.sessione).filter((s) => !vive(s))
      }
    },

    pulisciOrfane() {
      // Solo le voci di chat che SierraDeck ha eliminato e svuotato: una chat
      // assente dall'indice può ancora arrivare dal Drive o da un altro PC.
      const svuotate = new Set(leggiRecupero().chat.filter((c) => c.svuotataIl !== undefined).map((c) => c.sessione))
      const o = gestione.orfane()
      const et = o.etichette.filter((s) => svuotate.has(s))
      const ar = o.archiviate.filter((s) => svuotate.has(s))
      for (const s of et) deps.etichette.imposta(s, '')
      if (ar.length > 0) scriviArchiviate(senzaArchiviate(archiviate(), ar))
      if (et.length + ar.length > 0) deps.log(`[chat] voci orfane tolte: ${et.length} nomi, ${ar.length} archiviate (chat già svuotate dal recupero)`)
      return { etichette: et.length, archiviate: ar.length }
    },

    tolteDaQui(percorsoDrive) {
      const parti = percorsoDrive.split('/')
      if (parti[0] !== 'chat' || parti.length < 3) return false
      const s = (parti[2] as string).replace(/\.jsonl$/i, '').toLowerCase()
      return leggiRecupero().chat.some((c) => c.ripristinataIl === undefined && c.sessione.toLowerCase() === s)
    }
  }

  async function fai(r: RichiestaAzione): Promise<EsitoAzioni> {
    const da = r.da ?? 'PC'
    // Gli id di Claude Code sono in minuscolo: un id scritto in maiuscolo è la stessa chat, non un'altra.
    const sessioni = [...new Set(r.sessioni.filter(sessioneValida).map((s) => s.toLowerCase()))]
    const esiti: EsitoChat[] = []
    const quali = info()
    let byteTotali = 0
    const eliminate: { s: InfoSessione; voce: ChatInRecupero }[] = []
    const nonSalvato = (titolo: string): string => `«${titolo}»: non riesco a salvare l’elenco sul disco (pieno, o un programma lo tiene aperto). Niente è cambiato.`

    for (const sessione of sessioni) {
      const s = quali.get(sessione)
      // Già nel recupero (un doppio tocco, o il PC e il telefono insieme): lo si dice con il suo nome, non «non ha file».
      const giaNelRecupero = s === undefined ? leggiRecupero().chat.find((c) => c.sessione === sessione && nelRecupero(c)) : undefined
      const titolo = s?.titolo ?? deps.etichette.leggi()[sessione] ?? archiviate().find((a) => a.sessione === sessione)?.titolo ?? giaNelRecupero?.titolo ?? sessione.slice(0, 8)
      if (r.azione === 'elimina' && giaNelRecupero !== undefined) { esiti.push({ sessione, ok: false, motivo: `«${titolo}» è già nel recupero.` }); continue }
      const letto = await statoSicuro({ sessione, ...(s?.cwd !== undefined ? { cwd: s.cwd } : {}) }, r.visore)
      if (letto === undefined) { esiti.push({ sessione, ok: false, motivo: `«${titolo}»: ${NON_SO}` }); continue }
      const st: StatoPerAzione = { ...letto, titolo }
      if (r.azione === 'elimina' && s === undefined) st.nonQui = true
      const no = ammesso(r.azione, st)
      if (no !== undefined) { esiti.push({ sessione, ok: false, motivo: no }); continue }

      switch (r.azione) {
        case 'chiudi': {
          const e = await deps.chiudi(sessione, da)
          esiti.push(e.ok ? { sessione, ok: true } : { sessione, ok: false, motivo: `«${titolo}» non si è chiusa: ${e.errore ?? 'la finestra non ha detto perché'}.` })
          break
        }
        case 'archivia': {
          if (st.aperta !== undefined) {
            const e = await deps.chiudi(sessione, da)
            if (!e.ok) { esiti.push({ sessione, ok: false, motivo: `«${titolo}» è aperta e non si è chiusa: ${e.errore ?? '?'}.` }); break }
          }
          if (!scriviArchiviate(conArchiviata(archiviate(), { sessione, il: ora(), titolo }))) { esiti.push({ sessione, ok: false, motivo: nonSalvato(titolo) }); break }
          const ws = deps.togliDaiWorkspaceNascosti?.(sessione) ?? []
          if (ws.length > 0) deps.log(`[chat] «${titolo}» archiviata: tolto il suo riquadro dai workspace ${ws.map((w) => `«${w}»`).join(', ')}`)
          esiti.push({ sessione, ok: true })
          break
        }
        case 'ripristina': {
          if (!archiviate().some((a) => a.sessione === sessione)) { esiti.push({ sessione, ok: false, motivo: `«${titolo}» non è fra le archiviate.` }); break }
          if (!scriviArchiviate(senzaArchiviate(archiviate(), [sessione]))) { esiti.push({ sessione, ok: false, motivo: nonSalvato(titolo) }); break }
          esiti.push({ sessione, ok: true })
          break
        }
        case 'rinomina': {
          const nome = (r.nome ?? '').replace(/\s+/g, ' ').trim()
          deps.etichette.imposta(sessione, nome)
          esiti.push({ sessione, ok: true })
          break
        }
        case 'elimina': {
          const info = s as InfoSessione
          // L'indice la conosce ma i suoi file non ci sono (già tolti a mano, o un indice vecchio): niente da spostare.
          if (fileDiSessione(deps.radiceClaude(), info.slug, info.sessione).length === 0) { esiti.push({ sessione, ok: false, motivo: motivoNonElimina({ sessione, titolo, nonQui: true }) ?? `«${titolo}» non ha file su questo PC.` }); break }
          const m = await misura(info)
          // Misurare chiede tempo: lo stato si richiede subito prima di spostare (nel frattempo può essersi riaperta).
          const dopo = await statoSicuro({ sessione, ...(info.cwd !== undefined ? { cwd: info.cwd } : {}) }, r.visore)
          const noDopo = dopo === undefined ? `«${titolo}»: ${NON_SO}` : motivoNonElimina({ ...dopo, titolo })
          if (noDopo !== undefined) { esiti.push({ sessione, ok: false, motivo: noDopo }); break }
          const quando = ora()
          const id = `${sessione.slice(0, 8)}-${quando.replace(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}`
          const sp = spostaNelRecupero(info, id)
          if (!sp.ok) { esiti.push({ sessione, ok: false, motivo: `«${titolo}»: ${sp.motivo}. ${nonTornati(sp.restano)}` }); break }
          // Le misure per file, adesso che sono nel recupero (le stesse: si sono solo spostati).
          const file = await Promise.all(sp.file.map(async (f) => ({ ...f, byte: await byteDi(f.dove) })))
          const etichetta = deps.etichette.leggi()[sessione]
          const arch = archiviate().find((a) => a.sessione === sessione)
          const voce: ChatInRecupero = {
            id, sessione, titolo, slug: info.slug, quando, scadeIl: scadenzaRecupero(quando), byte: m.byte, file, da,
            ...(info.cwd !== undefined ? { cwd: info.cwd } : {}),
            ...(etichetta !== undefined ? { etichetta } : {}),
            ...(arch !== undefined ? { archiviata: arch } : {})
          }
          const reg = leggiRecupero()
          if (!scriviRecupero({ ...reg, chat: [...reg.chat, voce] })) {
            // Senza la sua voce nel registro la chat non si ritroverebbe più: i file tornano al loro posto.
            esiti.push({ sessione, ok: false, motivo: `${nonSalvato(titolo).replace(/ Niente è cambiato\.$/, '')} ${nonTornati(rimetti(deps.radiceClaude(), file))}` })
            break
          }
          const ws = deps.togliDaiWorkspaceNascosti?.(sessione) ?? []
          if (ws.length > 0) cambiaVoce(id, (c) => ({ ...c, workspace: ws }))
          // Le sue voci: l'indice, il nome, le archiviate. Tornano con «Ripristina».
          deps.togliDallIndice([sessione])
          if (etichetta !== undefined) deps.etichette.imposta(sessione, '')
          if (arch !== undefined) scriviArchiviate(senzaArchiviate(archiviate(), [sessione]))
          byteTotali += m.byte
          eliminate.push({ s: info, voce })
          esiti.push({ sessione, ok: true, byte: m.byte, id })
          deps.log(`[chat] «${titolo}» (${sessione.slice(0, 8)}) eliminata dal PC (${da}): ${file.length} file, ${byteLeggibili(m.byte)} nel recupero fino al ${voce.scadeIl.slice(0, 10)}`)
          break
        }
      }
    }

    let driveRiga = ''
    if (r.azione === 'elimina' && r.ancheDalDrive === true && eliminate.length > 0) {
      if (deps.drive === undefined) {
        driveRiga = ' Il Drive non è collegato: le copie lassù restano.'
      } else {
        const titolo = eliminate.length === 1 ? `Chat eliminata: «${eliminate[0]!.voce.titolo}»` : `${eliminate.length} chat eliminate dal PC`
        const e = await deps.drive.togliChat(eliminate.map((x) => x.voce.sessione), titolo).catch((err: unknown) => ({ ok: false, messaggio: err instanceof Error ? err.message : String(err) }) as { ok: boolean; messaggio: string; pulizia?: undefined })
        if (e.ok && e.pulizia !== undefined) {
          const p = e.pulizia
          for (const x of eliminate) cambiaVoce(x.voce.id, (c) => ({ ...c, drive: { pulizia: p.id, file: p.voci.length, byte: p.byte } }))
          driveRiga = ` Anche dal Drive: ${byteLeggibili(p.byte)} nel recupero del Drive per 30 giorni.`
          deps.log(`[chat] anche dal Drive: ${p.voci.length} file (${byteLeggibili(p.byte)}) nella pulizia ${p.id}`)
        } else {
          driveRiga = e.ok ? ` ${e.messaggio}` : ` Dal Drive no: ${dentroFrase(e.messaggio)}. Le copie lassù restano.`
          if (!e.ok) deps.log(`[chat] anche dal Drive non riuscito: ${e.messaggio}`)
        }
      }
    }

    const fatte = esiti.filter((e) => e.ok).length
    const rifiutate = esiti.length - fatte
    if (fatte > 0 && r.azione !== 'chiudi') deps.cambiato?.()
    if (r.azione !== 'elimina' && fatte > 0) deps.log(`[chat] ${r.azione}: ${fatte} chat (${da})${rifiutate > 0 ? `, ${rifiutate} rifiutate` : ''}`)
    for (const e of esiti) if (!e.ok) deps.log(`[chat] ${r.azione} rifiutata per ${e.sessione.slice(0, 8)} (${da}): ${e.motivo ?? '?'}`)
    return {
      azione: r.azione, esiti, fatte, rifiutate,
      ...(r.azione === 'elimina' ? { byte: byteTotali } : {}),
      messaggio: messaggioEsito(r.azione, fatte, rifiutate, byteTotali, byteLeggibili) + driveRiga
    }
  }

  /** Un file del registro si rimette solo dentro il recupero e dentro la cartella di Claude: il registro non decide percorsi altrove. */
  const fileAffidabile = (c: ChatInRecupero, f: FileInRecupero): boolean =>
    typeof f.dove === 'string' && Array.isArray(f.relativo) && f.relativo.length > 0 &&
    f.relativo.every((x) => typeof x === 'string' && x !== '' && x !== '.' && x !== '..' && !/[\\/:]/.test(x)) &&
    !relative(join(cartellaRecupero, c.id), f.dove).startsWith('..') && !isAbsolute(relative(join(cartellaRecupero, c.id), f.dove))

  async function ripristina(id: string, da: string): Promise<{ ok: boolean; messaggio: string }> {
    const c = leggiRecupero().chat.find((x) => x.id === id)
    if (c === undefined || !nelRecupero(c)) return { ok: false, messaggio: 'Questa chat non è più nel recupero.' }
    if (!c.file.every((f) => fileAffidabile(c, f))) {
      deps.log(`[chat] recupero ${c.id}: percorsi fuori posto nel registro, non la rimetto`)
      return { ok: false, messaggio: 'Il registro del recupero ha percorsi fuori posto per questa chat: non la rimetto (guarda il registro).' }
    }
    const radice = deps.radiceClaude()
    const occupati = c.file.filter((f) => existsSync(join(radice, ...f.relativo)))
    if (occupati.length > 0) return { ok: false, messaggio: `Al posto di «${c.titolo}» c’è già una chat con lo stesso id (${occupati.map((f) => f.relativo.join('/')).join(', ')}): non la sovrascrivo.` }
    const mancanti = c.file.filter((f) => !existsSync(f.dove))
    if (mancanti.length === c.file.length) return { ok: false, messaggio: 'I suoi file non sono più nel recupero.' }
    const rimessi: FileInRecupero[] = []
    for (const f of c.file) {
      if (!existsSync(f.dove)) continue
      try {
        const verso = join(radice, ...f.relativo)
        mkdirSync(dirname(verso), { recursive: true })
        renameSync(f.dove, verso)
        rimessi.push(f)
      } catch (err) {
        // Mezza chat non resta mai mezza: quelli già rimessi tornano nel recupero.
        const restano: string[] = []
        for (const x of rimessi) {
          try { renameSync(join(radice, ...x.relativo), x.dove) } catch (e2) {
            restano.push(x.relativo.join('/'))
            deps.log(`[chat] ${x.relativo.join('/')} non tornato nel recupero: ${e2 instanceof Error ? e2.message : String(e2)}`)
          }
        }
        deps.log(`[chat] «${c.titolo}» non rimessa dal recupero: ${err instanceof Error ? err.message : String(err)}`)
        return { ok: false, messaggio: `Non riesco a rimetterla: ${err instanceof Error ? err.message : String(err)}. ${restano.length === 0 ? 'È ancora nel recupero.' : `${restano.length} suoi file sono già tornati al loro posto, gli altri sono nel recupero (guarda il registro).`}` }
      }
    }
    // Restano solo le sue cartelle vuote nel recupero: via, sempre dalla guardia.
    try { cancellaSicura(join(cartellaRecupero, c.id), { dentro: [cartellaRecupero] }) } catch (err) { deps.log(`[chat] cartella vuota del recupero non tolta: ${err instanceof Error ? err.message : String(err)}`) }
    if (c.etichetta !== undefined && deps.etichette.leggi()[c.sessione] === undefined) deps.etichette.imposta(c.sessione, c.etichetta)
    if (c.archiviata !== undefined) scriviArchiviate(conArchiviata(archiviate(), c.archiviata))
    if (!cambiaVoce(id, (x) => ({ ...x, ripristinataIl: ora() }))) deps.log(`[chat] «${c.titolo}» rimessa, ma il registro del recupero non si è aggiornato: la voce resta`)
    let driveRiga = ''
    if (c.drive !== undefined && deps.drive !== undefined) {
      // La pulizia del Drive si annulla solo se era di questa chat sola: le altre restano eliminate.
      const compagne = leggiRecupero().chat.filter((x) => x.drive?.pulizia === c.drive?.pulizia && x.id !== c.id && nelRecupero(x))
      if (compagne.length === 0) {
        const e = await deps.drive.annulla(c.drive.pulizia).catch((err: unknown) => ({ ok: false, messaggio: err instanceof Error ? err.message : String(err) }))
        // Il Drive dice quanti file sono tornati: si riporta quello, non un «tornata» a priori.
        driveRiga = e.ok ? ` La copia sul Drive: ${e.messaggio.replace(/^Annullata: /, '')}` : ` La copia sul Drive no (${dentroFrase(e.messaggio)}): si rimette da «Spazio sul Drive».`
      } else {
        driveRiga = ' La copia sul Drive è nel recupero del Drive con altre chat: si rimette da «Spazio sul Drive».'
      }
    }
    deps.rileggiIndice?.()
    deps.cambiato?.()
    deps.log(`[chat] «${c.titolo}» (${c.sessione.slice(0, 8)}) rimessa dal recupero (${da})${mancanti.length > 0 ? `: ${mancanti.length} file mancavano` : ''}`)
    const wsRiga = c.workspace !== undefined && c.workspace.length > 0 ? ` Era nel workspace ${c.workspace.map((w) => `«${w}»`).join(', ')}: si riapre da «Riprendi una conversazione».` : ''
    return { ok: true, messaggio: `«${c.titolo}» è di nuovo al suo posto.${mancanti.length > 0 ? ` ${mancanti.length} file non c’erano più.` : ''}${wsRiga}${driveRiga}` }
  }

  /** Cancella davvero i file di quelle chat dal recupero (e, se chiesto, le loro copie nel recupero del Drive). */
  const svuotaVoci = async (voci: ChatInRecupero[], ancheDalDrive: boolean, da: string, perche: string): Promise<{ byte: number; non: number; drive: string; driveOk: boolean }> => {
    let byte = 0
    let non = 0
    const vuotate = new Set<string>()
    for (const c of voci) {
      try {
        // Dentro la cartella del recupero, mai la cartella stessa: la guardia lo controlla.
        cancellaSicura(join(cartellaRecupero, c.id), { dentro: [cartellaRecupero] })
      } catch (err) {
        non += 1
        deps.log(`[chat] recupero di «${c.titolo}» non svuotato: ${err instanceof Error ? err.message : String(err)}`)
        continue
      }
      byte += c.byte
      vuotate.add(c.id)
      if (!cambiaVoce(c.id, (x) => ({ ...x, svuotataIl: ora() }))) deps.log(`[chat] «${c.titolo}» svuotata, ma il registro del recupero non si è aggiornato`)
    }
    let drive = ''
    let driveOk = true
    if (ancheDalDrive && deps.drive !== undefined) {
      // Una pulizia del Drive si svuota solo se tutte le sue chat si sono svuotate qui: una chat
      // rimasta nel recupero del PC tiene anche la sua copia del Drive.
      const tutte = [...new Set(voci.map((c) => c.drive?.pulizia).filter((x): x is string => x !== undefined))]
      const pulizie = tutte.filter((p) => voci.every((c) => c.drive?.pulizia !== p || vuotate.has(c.id)))
      let svuotate = 0
      const errori: string[] = []
      for (const id of pulizie) {
        const e = await deps.drive.svuota(id).catch((err: unknown) => ({ ok: false, messaggio: err instanceof Error ? err.message : String(err) }))
        if (e.ok) svuotate += 1
        else { errori.push(e.messaggio); deps.log(`[chat] recupero del Drive ${id} non svuotato: ${e.messaggio}`) }
      }
      driveOk = svuotate === tutte.length
      if (tutte.length > 0) drive = ` Dal recupero del Drive: ${svuotate} di ${tutte.length} svuotati${errori.length > 0 ? ` (${dentroFrase(errori[0] as string)})` : ''}${tutte.length > pulizie.length ? `; ${tutte.length - pulizie.length} restano con le chat rimaste qui` : ''}.`
    }
    deps.log(`[chat] recupero delle chat svuotato ${perche} (${da}): ${voci.length - non} chat, ${byteLeggibili(byte)}${non > 0 ? `, ${non} non riuscite` : ''}${drive}`)
    if (voci.length - non > 0) deps.cambiato?.()
    return { byte, non, drive, driveOk }
  }

  return gestione
}
