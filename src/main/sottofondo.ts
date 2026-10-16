import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { HostToCore } from '@shared/protocol'
import { scriviJsonAtomico } from '@shared/scrittura-atomica'
import { righeDaSchermo, testoDiRiga, rigaVestita, type Schermo } from '../renderer/schermo-terminale'
import {
  SEGNI_DI_PROMPT, chatAspetta, sceltaSulloSchermo, consegnaPartita, contaMandati, ultimaRigaDalloSchermo,
  lavoraSulloSchermo, testoNelCampo, testoPerso, type AttivitaTerminale
} from '../renderer/ultime-righe'
import {
  type FaseSottofondo, type StatoSottofondo, type VoceSottofondo, type ChiUsa,
  idChatSottofondo, accodaTesto, prossimoTesto, segnaConsegnato, giaConsegnato, leggiElencoSottofondo,
  type TestoInCoda
} from '@shared/sottofondo'

/**
 * **Le chat in sottofondo** (0.58.4, decisione di Nicholas).
 *
 * Una chat che vive su questo PC e che un altro PC (o il telefono) vuole usare
 * mentre qui è chiusa: si avvia **senza riquadro in nessuna finestra** —
 * niente workspace che cambia, niente fuoco rubato, niente finestre nuove —
 * e gira finché serve. Chi la usa da lontano la vede e le scrive come ogni
 * chat aperta: compare in `/api/stato` con il suo schermo e il suo stato.
 *
 * Lo schermo si tiene qui con un terminale senza finestra (`@xterm/headless`):
 * le stesse righe, gli stessi colori e la stessa logica «pronta» dei riquadri
 * (`chatAspetta`, `consegnaPartita`). L'elenco sta su disco
 * (`sottofondo.json`): dopo un riavvio di questo PC le chat ripartono, con i
 * testi ancora in coda. Il ripristino delle finestre e il riordino dei
 * workspace non le toccano: non stanno in nessun workspace.
 */

/** Le dimensioni del terminale senza finestra: quelle di un riquadro largo. */
export const COLONNE_SOTTOFONDO = 120
export const RIGHE_SOTTOFONDO = 40
/** La pausa fra il testo e l'invio: la stessa dei riquadri. */
const PAUSA_INVIO_MS = 350
/** Quanto si aspetta una chat che non diventa mai pronta prima di dirlo. */
export const ATTESA_PRONTA_MAX_MS = 180_000
/** Dopo l'invio: quando ricontrollare che sia partito, e quante volte ripremere Invio. */
const CONTROLLO_DOPO_MS = 3_000
const INVII_MAX = 3
/** Oltre questo, senza vedere il testo nel campo, l'Invio si preme lo stesso (0.75.4). */
const ECO_MAX_MS = 8_000
/** Quante volte si riscrive un testo che Claude Code ha perso prima di dirlo. */
const SCRITTURE_MAX = 3
/** Il silenzio che serve prima di scrivere: più largo dei riquadri (una conversazione ripresa si carica a riprese). */
const QUIETE_PRIMA_DI_SCRIVERE_MS = 1_500

/**
 * **Il campo è pronto** (0.58.4, provato dal vero): l'ultima riga «❯» in fondo
 * è vuota (o mostra il suggerimento «Try …») e sotto c'è il piede del campo
 * («bypass permissions», «? for shortcuts», «shift+tab»). Il solo «❯» non
 * basta: la domanda di fiducia di una cartella ha «❯ No, exit», e scrivendo
 * subito dopo averle risposto il testo spariva mentre Claude Code caricava
 * ancora la conversazione ripresa.
 */
export function campoPronto(righe: string[]): boolean {
  const fondo = righe.slice(-14)
  let i = -1
  for (let k = fondo.length - 1; k >= 0; k -= 1) if (/^\s*[│|]?\s*❯/.test(fondo[k] ?? '')) { i = k; break }
  if (i < 0) return false
  const dentro = (fondo[i] ?? '').replace(/^\s*[│|]?\s*❯\s*/, '').replace(/[│|]\s*$/, '').trim()
  if (dentro !== '' && !/^Try "/.test(dentro)) return false
  return fondo.slice(i + 1).some((r) => /bypass permissions|\? for shortcuts|shift\+tab/i.test(r))
}

/** Il terminale senza finestra, nella forma minima che serve qui (provabile). */
export type TerminaleMuto = {
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  dispose: () => void
  readonly rows: number
  readonly cols: number
  readonly buffer: { readonly active: Schermo }
  /** La modalità «incolla fra parentesi» accesa da Claude Code. */
  readonly modes?: { readonly bracketedPasteMode: boolean }
}

export type DipendenzeSottofondo = {
  /** La cartella dei dati di SierraDeck: ci sta `sottofondo.json`. */
  dati: string
  avviaPty: (r: { sessionUuid: string; cwd: string; title?: string; cols: number; rows: number; autopilota?: { id: string; chat: string } }) => string
  /**
   * Prende un pty già acceso (0.60.8): la chat di un autopilota viva in un
   * workspace che nessuna finestra mostra. Toglie il pty alla finestra e ne
   * chiede lo scrollback, che arriva qui. Senza, `prendi` non si usa.
   */
  aggancia?: (ptyId: string) => void
  /** Un testo è partito davvero (0.60.8): chi l'ha mandato lo scrive nel suo registro. */
  consegnato?: (voce: VoceSottofondo, id: string) => void
  ascolta: (ptyId: string, cb: (msg: HostToCore) => void) => void
  smetti: (ptyId: string) => void
  scrivi: (ptyId: string, data: string) => void
  ferma: (ptyId: string) => void
  creaTerminale: (cols: number, rows: number) => TerminaleMuto
  log: (m: string) => void
  adesso?: () => number
  /** Avvisa chi mostra l'elenco (la finestra del PC) che è cambiato. */
  cambiato?: () => void
  /** Timer finti nei test. */
  timer?: (f: () => void, ms: number) => void
}

type Viva = {
  voce: VoceSottofondo
  ptyId: string
  term: TerminaleMuto
  attivita: AttivitaTerminale
  fase: FaseSottofondo
  messaggio: string
  avviataIl: number
  /** Il testo in scrittura adesso: non se ne scrive un altro sopra. */
  inScrittura?: { id: string; testo: string; prima: number; invii: number; il: number }
  /**
   * In questo turno si è già scritto un testo mentre la chat lavorava (0.72.0):
   * Claude Code lo tiene fra i messaggi in coda, in alto. Un altro aspetta la
   * fine del turno: mai più di uno in coda.
   */
  scrittoAlLavoro?: boolean
  /** Quante volte ogni testo è stato scritto e perso. */
  scritture: Map<string, number>
  /** I testi che non partono dopo i tentativi: restano in coda, fermi, finché chi li ha mandati non preme Riprova. */
  fermi: Set<string>
}

export type Sottofondo = ReturnType<typeof creaSottofondo>

export function creaSottofondo(d: DipendenzeSottofondo) {
  const adesso = d.adesso ?? Date.now
  const timer = d.timer ?? ((f: () => void, ms: number) => { setTimeout(f, ms).unref?.() })
  const file = join(d.dati, 'sottofondo.json')
  const vive = new Map<string, Viva>()
  /** Le chat finite (uscite, chiuse): l'ultimo stato, per chi lo chiede ancora. */
  const finite = new Map<string, StatoSottofondo>()

  const salva = (): void => {
    const chat = [...vive.values()].map((v) => v.voce)
    try { scriviJsonAtomico(file, { versione: 1, chat }, 'sottofondo') } catch (e) { d.log(`[sottofondo] non riesco a salvare l'elenco: ${String(e)}`) }
    d.cambiato?.()
  }
  const righeFondo = (v: Viva, quante = RIGHE_SOTTOFONDO): string[] => {
    try { return righeDaSchermo(v.term.buffer.active, v.term.rows, quante).pulite } catch { return [] }
  }
  const nome = (v: Viva): string => `«${v.voce.titolo}» (${v.voce.sessione.slice(0, 8)})`

  const cambiaFase = (v: Viva, fase: FaseSottofondo, messaggio: string): void => {
    if (v.fase === fase && v.messaggio === messaggio) return
    v.fase = fase
    v.messaggio = messaggio
    d.log(`[sottofondo] ${nome(v)}: ${messaggio}`)
    d.cambiato?.()
  }

  const evento = (v: Viva, msg: HostToCore): void => {
    if (msg.kind === 'scrollback') {
      // Un pty preso da una finestra (0.60.8): lo schermo di prima, per sapere quando è pronto.
      v.term.write(msg.data)
      v.attivita.ultimoDato = adesso()
      return
    }
    if (msg.kind === 'data') {
      const ora = adesso()
      v.attivita.ultimoDato = ora
      v.attivita.primoDato ??= ora
      v.term.write(msg.data)
      if (!v.attivita.prontoVisto && SEGNI_DI_PROMPT.test(msg.data)) v.attivita.prontoVisto = true
      return
    }
    if (msg.kind === 'exit' || msg.kind === 'error' || msg.kind === 'assente') {
      v.attivita.morto = true
      const perche = msg.kind === 'exit' ? `la chat è uscita (codice ${msg.code})` : msg.kind === 'error' ? `errore del terminale: ${msg.message}` : 'il terminale non c’è più'
      cambiaFase(v, 'chiusa', `${perche}: tolta dal sottofondo. Il testo ancora in coda resta salvato e riparte al prossimo avvio`)
      togli(v.voce.sessione, false)
      finite.set(v.voce.sessione, statoDi(v))
    }
  }

  const statoDi = (v: Viva): StatoSottofondo => ({
    sessione: v.voce.sessione,
    chat: idChatSottofondo(v.voce.sessione),
    fase: v.fase,
    messaggio: v.messaggio,
    inCoda: v.voce.coda.length,
    consegnati: [...v.voce.consegnati],
    perChi: v.voce.perChi,
    titolo: v.voce.titolo,
    cwd: v.voce.cwd,
    dal: v.voce.dal,
    ...(v.voce.workspace !== undefined ? { workspace: v.voce.workspace } : {}),
    ...(v.attivita.ultimoDato > 0 ? { ultimoDatoIl: new Date(v.attivita.ultimoDato).toISOString() } : {}),
    ...(v.voce.autopilota !== undefined ? { autopilota: v.voce.autopilota.id } : {})
  })

  const avviaViva = (voce: VoceSottofondo, gia?: string): Viva => {
    const term = d.creaTerminale(COLONNE_SOTTOFONDO, RIGHE_SOTTOFONDO)
    const ptyId = gia ?? d.avviaPty({ sessionUuid: voce.sessione, cwd: voce.cwd, title: voce.titolo, cols: COLONNE_SOTTOFONDO, rows: RIGHE_SOTTOFONDO, ...(voce.autopilota !== undefined ? { autopilota: voce.autopilota } : {}) })
    const v: Viva = { voce, ptyId, term, attivita: { ultimoDato: adesso(), prontoVisto: false }, fase: 'avvio', messaggio: '', avviataIl: adesso(), scritture: new Map(), fermi: new Set() }
    d.ascolta(ptyId, (msg) => evento(v, msg))
    vive.set(voce.sessione, v)
    finite.delete(voce.sessione)
    if (gia !== undefined) {
      // Già accesa: niente secondo `claude --resume`, si prende il suo terminale.
      d.aggancia?.(gia)
      cambiaFase(v, 'avvio', `presa in sottofondo per ${voce.perChi.nome}: era accesa in un workspace che nessuna finestra mostra, continua senza riavviarsi e senza cambiare lo schermo`)
      return v
    }
    cambiaFase(v, 'avvio', `avviata in sottofondo per ${voce.perChi.nome} nella cartella ${voce.cwd}: nessun riquadro, nessuna finestra`)
    return v
  }

  const togli = (sessione: string, uccidi: boolean): Viva | undefined => {
    const v = vive.get(sessione)
    if (v === undefined) return undefined
    vive.delete(sessione)
    d.smetti(v.ptyId)
    if (uccidi) d.ferma(v.ptyId)
    try { v.term.dispose() } catch { /* già smontato */ }
    // Il testo in coda non si perde: l'elenco lo tiene finché non è consegnato.
    if (v.voce.coda.length > 0 && !uccidi) codaOrfana.set(sessione, v.voce)
    salva()
    return v
  }
  /** Le voci con testo in coda di chat uscite: ripartono al prossimo avvio. */
  const codaOrfana = new Map<string, VoceSottofondo>()

  /** Un giro: per ogni chat, la fase dallo schermo e, se pronta, il prossimo testo. */
  const giro = (): void => {
    const ora = adesso()
    for (const v of [...vive.values()]) {
      const righe = righeFondo(v)
      if (!v.attivita.prontoVisto && righe.some((r) => SEGNI_DI_PROMPT.test(r))) v.attivita.prontoVisto = true
      // Pronta per scrivere: il campo vero, vuoto, con il suo piede, e la quiete.
      const pronta = v.attivita.morto !== true && campoPronto(righe) && !lavoraSulloSchermo(righe) && !sceltaSulloSchermo(righe) && ora - v.attivita.ultimoDato >= QUIETE_PRIMA_DI_SCRIVERE_MS
      if (v.inScrittura !== undefined) {
        const s = v.inScrittura
        if (s.invii === 0) {
          // L'Invio dopo l'eco (0.75.4): testo e Invio non arrivano mai insieme.
          const eco = testoNelCampo(righe, s.testo) && ora - v.attivita.ultimoDato >= PAUSA_INVIO_MS
          if (!eco && ora - s.il < ECO_MAX_MS) continue
          s.invii = 1
          s.il = ora
          d.scrivi(v.ptyId, '\r')
          continue
        }
        if (ora - s.il < CONTROLLO_DOPO_MS) continue
        const partita = consegnaPartita(righe, s.testo, s.prima)
        if (partita === true) {
          v.voce = segnaConsegnato(v.voce, s.id)
          v.inScrittura = undefined
          v.scritture.delete(s.id)
          salva()
          cambiaFase(v, 'lavora', `testo consegnato (${s.id}): la chat lavora`)
          d.consegnato?.(v.voce, s.id)
          continue
        }
        if (testoPerso(righe, s.testo, s.prima) && lavoraSulloSchermo(righe)) {
          // Scritto durante il turno (0.72.0): non è perso, è fra i messaggi in
          // coda di Claude Code. Riscriverlo ne aggiungeva un altro, in alto.
          v.voce = segnaConsegnato(v.voce, s.id)
          v.inScrittura = undefined
          v.scritture.delete(s.id)
          salva()
          cambiaFase(v, 'lavora', `testo consegnato (${s.id}) durante il turno: Claude Code lo tiene in coda e lo legge appena può`)
          d.consegnato?.(v.voce, s.id)
          continue
        }
        if (testoPerso(righe, s.testo, s.prima)) {
          // Claude Code non l'ha preso (stava ancora caricando): torna in coda
          // e si riscrive quando il campo è di nuovo pronto. Mai «consegnato».
          v.inScrittura = undefined
          const n = (v.scritture.get(s.id) ?? 0) + 1
          v.scritture.set(s.id, n)
          v.attivita.ultimoDato = ora
          if (n >= SCRITTURE_MAX) {
            v.fermi.add(s.id)
            cambiaFase(v, 'aspetta', `il testo ${s.id} non entra: scritto ${n} volte, Claude Code non lo prende. Resta in coda, fermo: Riprova da chi l’ha mandato lo rimette in giro`)
          } else cambiaFase(v, 'avvio', `il testo ${s.id} si è perso (Claude Code non era ancora pronto): lo riscrivo appena il campo è pronto (tentativo ${n + 1} di ${SCRITTURE_MAX})`)
          continue
        }
        if (s.invii < INVII_MAX) {
          // Il testo è rimasto nel campo: si ripreme Invio, come una persona.
          s.invii += 1
          s.il = ora
          d.scrivi(v.ptyId, '\r')
          d.log(`[sottofondo] ${nome(v)}: il testo è ancora nel campo, ripremo Invio (${s.invii}/${INVII_MAX})`)
          continue
        }
        // Nel campo e Invio non lo fa partire: resta in coda, fermo, e lo si
        // dice. Riscriverlo lo raddoppierebbe nel campo.
        v.inScrittura = undefined
        v.fermi.add(s.id)
        cambiaFase(v, 'aspetta', `il testo ${s.id} è nel campo ma Invio non lo fa partire: si vede da chi la guarda. Resta in coda, fermo, finché non si preme Riprova`)
        continue
      }
      if (sceltaSulloSchermo(righe)) {
        cambiaFase(v, 'scelta', 'la chat aspetta una scelta: si risponde dal riquadro di chi la usa (le opzioni sono sullo schermo)')
        continue
      }
      // Un testo che si scrive anche durante il turno (0.69.0): basta il campo
      // sullo schermo. Claude Code lo legge appena può, senza interrompere.
      if (pronta) v.scrittoAlLavoro = false
      const urgente = !pronta && v.scrittoAlLavoro !== true && v.attivita.morto !== true && campoPronto(righe) ? v.voce.coda.find((x) => !v.fermi.has(x.id) && x.ancheAlLavoro === true) : undefined
      if (urgente !== undefined) {
        scriviTesto(v, urgente, righe, ora)
        v.scrittoAlLavoro = true
        d.log(`[consegna] ${nome(v)}: la chat lavora, scrivo lo stesso il testo ${urgente.id} (in coda da ${Math.round((ora - Date.parse(urgente.quando)) / 1000)} s)`)
        continue
      }
      if (!pronta) {
        if (v.fase === 'avvio' && ora - v.avviataIl > ATTESA_PRONTA_MAX_MS) cambiaFase(v, 'lenta', `dopo ${Math.round(ATTESA_PRONTA_MAX_MS / 1000)} secondi Claude Code non ha ancora mostrato il campo: lo schermo si legge dal riquadro di chi la usa`)
        else if (lavoraSulloSchermo(righe)) cambiaFase(v, 'lavora', 'la chat lavora')
        continue
      }
      const prossimo = v.voce.coda.find((x) => !v.fermi.has(x.id))
      if (prossimo === undefined) {
        if (v.fermi.size === 0) cambiaFase(v, 'pronta', v.fase === 'avvio' || v.fase === 'lenta' ? 'chat pronta: aspetta un messaggio' : 'la chat ha finito e aspetta')
        continue
      }
      scriviTesto(v, prossimo, righe, ora)
      cambiaFase(v, 'consegna', `chat pronta: scrivo il testo ${prossimo.id} (${prossimo.testo.length} caratteri)`)
    }
  }

  /** Scrive un testo in coda nel campo, poi Invio; il giro dopo controlla che sia partito. */
  const scriviTesto = (v: Viva, prossimo: TestoInCoda, righe: string[], ora: number): void => {
    const prima = contaMandati(righe, prossimo.testo)
    const multiriga = prossimo.testo.includes('\n')
    const testo = multiriga && v.term.modes?.bracketedPasteMode !== false ? `\x1b[200~${prossimo.testo}\x1b[201~` : prossimo.testo
    // L'Invio non parte più a tempo (0.75.4): lo preme il giro quando il testo
    // si vede nel campo e il terminale tace (vedi `testoNelCampo`).
    v.inScrittura = { id: prossimo.id, testo: prossimo.testo, prima, invii: 0, il: ora }
    d.scrivi(v.ptyId, testo)
  }

  return {
    /**
     * Avvia (o ritrova) la chat in sottofondo e mette in coda il testo, se c'è.
     * I cancelli (casa, cartella, PIN, chiave di casa) li ha già passati chi chiama.
     */
    avvia(r: { sessione: string; cwd: string; titolo: string; perChi: ChiUsa; testo?: string; idMessaggio?: string; workspace?: string; autopilota?: { id: string; chat: string }; ptyGia?: string; ancheAlLavoro?: boolean }): StatoSottofondo {
      let v = vive.get(r.sessione)
      if (v === undefined) {
        const orfana = codaOrfana.get(r.sessione)
        codaOrfana.delete(r.sessione)
        const base: VoceSottofondo = orfana !== undefined
          ? { ...orfana, perChi: r.perChi }
          : { sessione: r.sessione, cwd: r.cwd, titolo: r.titolo, perChi: r.perChi, dal: new Date(adesso()).toISOString(), coda: [], consegnati: [] }
        const voce: VoceSottofondo = r.autopilota !== undefined ? { ...base, autopilota: r.autopilota } : base
        v = avviaViva(voce, r.ptyGia)
      } else if (v.voce.perChi.id !== r.perChi.id) {
        v.voce = { ...v.voce, perChi: r.perChi }
      }
      if (r.workspace !== undefined && r.workspace !== '' && v.voce.workspace !== r.workspace) v.voce = { ...v.voce, workspace: r.workspace }
      if (r.testo !== undefined && r.testo.trim() !== '' && r.idMessaggio !== undefined) {
        if (v.fermi.has(r.idMessaggio)) {
          // Riprova di chi l'ha mandato: il testo fermo torna in giro, con i tentativi da capo.
          v.fermi.delete(r.idMessaggio)
          v.scritture.delete(r.idMessaggio)
          d.log(`[sottofondo] ${nome(v)}: Riprova per il testo ${r.idMessaggio}: torna in giro`)
        } else if (giaConsegnato(v.voce, r.idMessaggio)) d.log(`[sottofondo] ${nome(v)}: il testo ${r.idMessaggio} era già arrivato o è già in coda, non lo scrivo due volte`)
        else {
          v.voce = accodaTesto(v.voce, { id: r.idMessaggio, testo: r.testo, quando: new Date(adesso()).toISOString(), ...(r.ancheAlLavoro === true ? { ancheAlLavoro: true } : {}) })
          d.log(`[sottofondo] ${nome(v)}: testo ${r.idMessaggio} in coda (${r.testo.length} caratteri), parte appena la chat è pronta`)
        }
      }
      salva()
      giro()
      return statoDi(v)
    },
    /** Lo stato per chi la usa da lontano. */
    stato(sessione: string): StatoSottofondo | undefined {
      const v = vive.get(sessione)
      return v !== undefined ? statoDi(v) : finite.get(sessione)
    },
    elenco(): StatoSottofondo[] { return [...vive.values()].map(statoDi) },
    /** Lo schermo di adesso di una chat in sottofondo (0.69.0, «Guarda»): niente si apre, niente cambia. */
    schermo(sessione: string, quante = RIGHE_SOTTOFONDO): string[] | undefined {
      const v = vive.get(sessione)
      return v === undefined ? undefined : righeFondo(v, quante)
    },
    ha(sessione: string): boolean { return vive.has(sessione) },
    perId(idChat: string): string | undefined {
      for (const v of vive.values()) if (idChatSottofondo(v.voce.sessione) === idChat) return v.voce.sessione
      return undefined
    },
    /** Le chat per `/api/stato` e per il battito: come quelle dei riquadri. */
    chat(): { id: string; titolo: string; cwd: string; sessione: string; aspetta: boolean; viva: boolean; ultimaRiga: string; coda: string[]; codaGrezza: string[]; sottofondo: ChiUsa; autopilota?: { id: string; chat: string } }[] {
      const ora = adesso()
      return [...vive.values()].map((v) => {
        const r = (() => { try { return righeDaSchermo(v.term.buffer.active, v.term.rows, 60) } catch { return { pulite: [] as string[], grezze: [] as string[] } } })()
        return {
          id: idChatSottofondo(v.voce.sessione),
          titolo: v.voce.titolo,
          cwd: v.voce.cwd,
          sessione: v.voce.sessione,
          aspetta: chatAspetta(v.attivita, r.pulite, ora) && v.inScrittura === undefined && v.voce.coda.length === 0,
          viva: v.attivita.morto !== true,
          ultimaRiga: ultimaRigaDalloSchermo(r.pulite),
          coda: r.pulite,
          codaGrezza: r.grezze,
          sottofondo: v.voce.perChi,
          ...(v.voce.autopilota !== undefined ? { autopilota: v.voce.autopilota } : {})
        }
      })
    },
    /** Un pezzo di cronologia, come `finestraDiPty` di un riquadro. */
    righe(sessione: string, da: number, quante: number): { totale: number; da: number; pulite: string[]; grezze: string[]; continua: boolean[]; colonne: number } | undefined {
      const v = vive.get(sessione)
      if (v === undefined) return undefined
      const schermo = v.term.buffer.active
      if (da < 0 && quante <= v.term.rows) {
        const r = righeDaSchermo(schermo, v.term.rows, quante, v.term.cols)
        return { totale: schermo.length, da: Math.max(0, schermo.length - r.pulite.length), pulite: r.pulite, grezze: r.grezze, continua: r.continua, colonne: v.term.cols }
      }
      const totale = schermo.length
      const passo = Math.max(1, Math.min(quante, 500))
      const inizio = da < 0 ? Math.max(0, totale - passo) : Math.max(0, Math.min(da, totale))
      const fine = Math.min(totale, inizio + passo)
      const pulite: string[] = []; const grezze: string[] = []; const continua: boolean[] = []
      for (let y = inizio; y < fine; y += 1) {
        const riga = schermo.getLine(y)
        if (riga === undefined) continue
        pulite.push(testoDiRiga(riga)); grezze.push(rigaVestita(riga)); continua.push(y > inizio && riga.isWrapped === true)
      }
      return { totale, da: inizio, pulite, grezze, continua, colonne: v.term.cols }
    },
    /** Testo da chi guarda (`/api/scrivi`): in coda, parte quando la chat è pronta. */
    scrivi(sessione: string, testo: string, idMessaggio: string, perChi: ChiUsa): void {
      const v = vive.get(sessione)
      if (v === undefined) return
      this.avvia({ sessione, cwd: v.voce.cwd, titolo: v.voce.titolo, perChi, testo, idMessaggio })
    },
    /** I tasti di una scelta (`/api/scegli`): subito, a pezzi. */
    tasti(sessione: string, pezzi: string[]): void {
      const v = vive.get(sessione)
      if (v === undefined) return
      pezzi.forEach((p, i) => { if (p !== '') timer(() => { if (vive.get(sessione) === v) d.scrivi(v.ptyId, p) }, i * PAUSA_INVIO_MS) })
    },
    /**
     * «Mostra qui» (e l'adozione da parte di una finestra): il pty esce dal
     * sottofondo **senza fermarsi**, e il riquadro lo riaggancia.
     */
    cedi(sessione: string): { ptyId: string; cwd: string; titolo: string; sessione: string; coda: { id: string; testo: string }[]; autopilota?: { id: string; chat: string }; workspace?: string } | undefined {
      const v = vive.get(sessione)
      if (v === undefined) return undefined
      togli(sessione, false)
      // Il testo ancora in coda: lo scrive chi guarda adesso, a schermo.
      codaOrfana.delete(sessione)
      d.log(`[sottofondo] ${nome(v)}: passa in un riquadro di questo PC, senza riavviarsi${v.voce.coda.length > 0 ? ` (${v.voce.coda.length} testi ancora in coda: vanno al riquadro)` : ''}`)
      // Il testo che stava scrivendo adesso conta come ancora da scrivere: partito o no, lo ricontrolla il riquadro.
      return {
        ptyId: v.ptyId, cwd: v.voce.cwd, titolo: v.voce.titolo, sessione,
        coda: v.voce.coda.map((x) => ({ id: x.id, testo: x.testo })),
        ...(v.voce.autopilota !== undefined ? { autopilota: v.voce.autopilota } : {}),
        ...(v.voce.workspace !== undefined ? { workspace: v.voce.workspace } : {})
      }
    },
    /** La chat in sottofondo che usa quel pty (0.60.8), per chi lo riaggancia a una finestra. */
    sessioneDelPty(ptyId: string): string | undefined {
      for (const v of vive.values()) if (v.ptyId === ptyId) return v.voce.sessione
      return undefined
    },
    /** «Chiudi»: la conversazione resta su disco, il processo si ferma. */
    chiudi(sessione: string): boolean {
      const v = togli(sessione, true)
      if (v === undefined) return false
      finite.set(sessione, { ...statoDi(v), fase: 'chiusa', messaggio: 'chiusa da questo PC' })
      d.log(`[sottofondo] ${nome(v)}: chiusa da questo PC (la conversazione resta su disco)`)
      return true
    },
    /** All'avvio: le chat dell'elenco ripartono, con il loro testo in coda. */
    riprendi(ammessa: (v: VoceSottofondo) => string | undefined): number {
      let lette: VoceSottofondo[] = []
      try { if (existsSync(file)) lette = leggiElencoSottofondo(JSON.parse(readFileSync(file, 'utf8'))) } catch (e) { d.log(`[sottofondo] elenco illeggibile, lo ignoro: ${String(e)}`) }
      let n = 0
      for (const voce of lette) {
        const no = ammessa(voce)
        if (no !== undefined) { d.log(`[sottofondo] «${voce.titolo}» (${voce.sessione.slice(0, 8)}) non riparte: ${no}`); continue }
        try { avviaViva(voce); n += 1 } catch (e) { d.log(`[sottofondo] «${voce.titolo}» non riparte: ${String(e)}`) }
      }
      salva()
      return n
    },
    giro,
    /** Per i test: lo schermo di una chat. */
    _righe: (sessione: string): string[] => { const v = vive.get(sessione); return v === undefined ? [] : righeFondo(v) }
  }
}

export type RichiestaSottofondo = { cartella: string; sessione: string; titolo: string; testo?: string; idMessaggio?: string; visore: string; workspace?: string }
export type EsitoSottofondo = { ok: true; stato: StatoSottofondo } | { ok: false; codice: number; messaggio: string }

/**
 * I cancelli di questo PC prima di avviare una chat in sottofondo (0.58.4),
 * dopo quelli delle rotte (cartella conosciuta, PIN, chiave di casa):
 * - la **casa** della chat è questo PC (mai un `claude.exe` per una chat che vive altrove);
 * - la cartella c'è davvero, qui;
 * - se la chat è già aperta in un riquadro di qui, il testo va lì e non parte niente.
 * Chi la chiede: l'altro PC (dal suo battito), il telefono, o questo PC.
 */
export function cancelliSottofondo(d: {
  sottofondo: () => Sottofondo | undefined
  io: () => { id: string; nome: string }
  nomePc: (id: string) => string | undefined
  casaAltrove: (sessione: string) => { nome: string } | undefined
  esiste: (cwd: string) => boolean
  inRiquadro: (sessione: string) => { id: string; titolo: string; cwd: string } | undefined
  scriviInRiquadro: (idChat: string, testo: string) => void
  log: (m: string) => void
}): (q: RichiestaSottofondo) => Promise<EsitoSottofondo> {
  return async (q) => {
    const sf = d.sottofondo()
    if (sf === undefined) return { ok: false, codice: 409, messaggio: 'i terminali di questo PC non sono ancora pronti: riprova fra qualche secondo' }
    const io = d.io()
    const perChi: ChiUsa = q.visore.startsWith('pc:')
      ? { id: q.visore.slice(3), nome: d.nomePc(q.visore.slice(3)) ?? 'un altro PC' }
      : q.visore.startsWith('tel:') ? { id: q.visore, nome: 'il telefono' } : { id: io.id, nome: io.nome }
    const passo = (m: string): void => { d.log(`[sottofondo] «${q.titolo}» (${q.sessione.slice(0, 8)}): ${m}`) }
    passo(`${perChi.nome} chiede di usarla${q.testo !== undefined ? ` e le manda un testo (${q.idMessaggio ?? ''})` : ''}`)
    const casa = d.casaAltrove(q.sessione)
    if (casa !== undefined) { passo(`rifiutata: la sua casa è ${casa.nome}`); return { ok: false, codice: 409, messaggio: `la casa di questa chat è ${casa.nome}, non questo PC: avviala là` } }
    if (!d.esiste(q.cartella)) { passo(`rifiutata: la cartella ${q.cartella} qui non c’è`); return { ok: false, codice: 409, messaggio: `la cartella ${q.cartella} su questo PC non c’è` } }
    const aperta = d.inRiquadro(q.sessione)
    if (aperta !== undefined) {
      if (q.testo !== undefined) d.scriviInRiquadro(aperta.id, q.testo)
      passo('è già aperta in un riquadro di questo PC: niente sottofondo, il testo va lì')
      return { ok: true, stato: { sessione: q.sessione, chat: aperta.id, fase: 'lavora', messaggio: 'già aperta in un riquadro di questo PC: il testo è arrivato lì', inCoda: 0, consegnati: q.idMessaggio !== undefined ? [q.idMessaggio] : [], perChi, titolo: aperta.titolo, cwd: aperta.cwd, dal: new Date().toISOString() } }
    }
    try {
      return { ok: true, stato: sf.avvia({ sessione: q.sessione, cwd: q.cartella, titolo: q.titolo, perChi, ...(q.workspace !== undefined ? { workspace: q.workspace } : {}), ...(q.testo !== undefined && q.idMessaggio !== undefined ? { testo: q.testo, idMessaggio: q.idMessaggio } : {}) }) }
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      passo(`non avviata: ${m}`)
      return { ok: false, codice: 409, messaggio: `non sono riuscito ad avviarla: ${m}` }
    }
  }
}
