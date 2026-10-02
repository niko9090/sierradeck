import { randomBytes } from 'node:crypto'
import type { Scatola } from '../progetti/presenza'
import {
  APERTURA_CANALE_MS, ATTESA_RISPOSTA_RTC_MS, CANALE_INATTIVO_MS, RICHIESTA_RTC_MS, RILEGGI_RISPOSTA_RTC_MS, SERVER_STUN,
  leggiMessaggioCanale, nomeOffertaRtc, nomeRispostaRtc, rottaPermessaSulCanale, segnaleValido,
  type SegnaleRtc, type StatoRtc
} from '@shared/strada-pc'
import { cifraSegnale, creaSigillo, decifraSegnale, type Sigillo } from './cifra-canale'

/**
 * Il collegamento **WebRTC** fra due PC (0.40.0): la terza strada, quando né
 * la rete di casa né Tailscale rispondono (due PC su reti diverse, senza
 * Tailscale).
 *
 * Il WebRTC vero lo fa Chromium, dentro Electron: un `RTCPeerConnection` in
 * una finestra nascosta (`ponte-rtc.ts`). Niente moduli nativi nuovi, niente
 * da compilare: Smart App Control blocca i binari non firmati. Qui la regia,
 * senza Electron, così si prova con un ponte finto:
 *
 * 1. **chi chiama** prepara l'offerta (con tutti i suoi candidati: rete di
 *    casa e indirizzo visto da Internet, dai server STUN), la cifra con la
 *    chiave di casa e la scrive sul Drive (`rtc-offerta-<lui>-<io>`);
 * 2. **chi risponde** guarda ogni dieci secondi se c'è un'offerta per lui,
 *    la decifra (se non si decifra non è di casa: si butta), prepara la
 *    risposta e la scrive sul Drive (`rtc-risposta-<lui>-<io>`);
 * 3. chi chiama la legge, e i due PC si collegano direttamente;
 * 4. sul canale si salutano con un «ciao» sigillato con la chiave di casa:
 *    solo chi ha la stessa cassaforte sa scriverlo. Poi passano le richieste
 *    del riquadro remoto (schermo, scrivi, stato), cifrate ognuna.
 *
 * Niente TURN: se i due NAT non si lasciano attraversare il canale non si
 * apre, e il riquadro passa alla cassetta sul Drive.
 */

export type EventoPonte = {
  id: string
  tipo: 'aperto' | 'chiuso' | 'messaggio'
  testo?: string
  /** All'apertura: il tipo di candidato usato (host = stessa rete, srflx/prflx = attraverso Internet). */
  via?: string
}

/** Cio' che serve del WebRTC di Chromium. Vedi `ponte-rtc.ts` per quello vero. */
export type PonteRtc = {
  /** Prepara un'offerta con il canale dati e tutti i candidati: la descrizione SDP. */
  offri: (id: string, stun: readonly string[]) => Promise<string>
  /** Riceve un'offerta e prepara la risposta, con tutti i candidati. */
  rispondi: (id: string, offerta: string, stun: readonly string[]) => Promise<string>
  /** Chi ha offerto riceve la risposta: da qui si collegano. */
  completa: (id: string, risposta: string) => Promise<void>
  manda: (id: string, testo: string) => void
  chiudi: (id: string) => void
  ascolta: (cb: (e: EventoPonte) => void) => void
}

export type EsitoCanale = { stato: number; corpo: unknown }

export type DipendenzeRtc = {
  /** Il ponte, creato al primo uso (una finestra nascosta). `undefined` se non si può. */
  ponte: () => Promise<PonteRtc | undefined>
  scatola: () => Scatola | undefined
  io: () => string
  mioNome: () => string
  /** La chiave di casa di chi risponde: `chiaveDiCasa('client-pc:<id>')`. `undefined` a cassaforte chiusa. */
  chiaveDiCasa: (pcIdChiRisponde: string) => string | undefined
  /** Gli altri PC da cui aspettarsi un'offerta. */
  altriPc: () => string[]
  /** Una richiesta arrivata sul canale, eseguita qui come se arrivasse dal Client. */
  rotta: (percorso: string, corpo: unknown, visore: string) => Promise<EsitoCanale>
  adesso?: () => number
  log?: (m: string) => void
  attendi?: (ms: number) => Promise<void>
  /** Per le prove: tempi più corti. */
  tempi?: Partial<{ attesaRisposta: number; rileggiRisposta: number; apertura: number; richiesta: number; inattivo: number }>
}

export type Rtc = {
  stato: (pcId: string) => StatoRtc
  fallitoIl: (pcId: string) => number | undefined
  /** Apre il collegamento verso quel PC, in sottofondo. Non fa niente se è già aperto o si sta aprendo. */
  avvia: (pcId: string) => void
  /** Una richiesta sul canale aperto: lancia se il canale non c'è o non risponde. */
  chiama: (pcId: string, percorso: string, corpo?: unknown, visore?: string) => Promise<EsitoCanale>
  /** Un giro di chi risponde: le offerte per me sul Drive, e i canali inattivi da chiudere. */
  cercaOfferte: () => Promise<void>
  chiudiTutto: () => void
}

type Capo = {
  pcId: string
  ruolo: 'chiama' | 'risponde'
  giro: string
  idPonte: string
  sigillo: Sigillo
  stato: StatoRtc
  ultimoUso: number
  attese: Map<string, { ok: (e: EsitoCanale) => void; ko: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>
  /** Si risolve al «ciao» dell'altro capo. */
  salutato?: () => void
  /** Il ponte ha aperto il canale prima che fossimo pronti ad ascoltarlo. */
  apertoPresto?: boolean
}

export function creaRtc(deps: DipendenzeRtc): Rtc {
  const adesso = deps.adesso ?? ((): number => Date.now())
  const log = deps.log ?? ((): void => {})
  const attendi = deps.attendi ?? ((ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms)))
  const t = {
    attesaRisposta: deps.tempi?.attesaRisposta ?? ATTESA_RISPOSTA_RTC_MS,
    rileggiRisposta: deps.tempi?.rileggiRisposta ?? RILEGGI_RISPOSTA_RTC_MS,
    apertura: deps.tempi?.apertura ?? APERTURA_CANALE_MS,
    richiesta: deps.tempi?.richiesta ?? RICHIESTA_RTC_MS,
    inattivo: deps.tempi?.inattivo ?? CANALE_INATTIVO_MS
  }
  /** I canali che ho aperto io, per PC. */
  const uscite = new Map<string, Capo>()
  /** I canali che gli altri hanno aperto verso di me, per id del ponte. */
  const entrate = new Map<string, Capo>()
  const fallitoIl = new Map<string, number>()
  /** Le offerte già servite: il Drive può restituirle ancora per qualche secondo. */
  const giriServiti = new Set<string>()
  let ascoltato: PonteRtc | undefined
  let numero = 0
  const nuovoId = (): string => `${Date.now().toString(36)}-${(numero += 1).toString(36)}`
  const capoDi = (idPonte: string): Capo | undefined => entrate.get(idPonte) ?? [...uscite.values()].find((c) => c.idPonte === idPonte)

  const chiudiCapo = (c: Capo, perche: string): void => {
    for (const [, a] of c.attese) { clearTimeout(a.timer); a.ko(new Error(perche)) }
    c.attese.clear()
    if (c.ruolo === 'chiama') { if (uscite.get(c.pcId) === c) uscite.delete(c.pcId) } else entrate.delete(c.idPonte)
    try { ascoltato?.chiudi(c.idPonte) } catch { /* gia' chiuso */ }
  }

  const manda = (c: Capo, m: Record<string, unknown>): void => {
    ascoltato?.manda(c.idPonte, c.sigillo.chiudi(m))
  }

  const suMessaggio = async (c: Capo, testo: string): Promise<void> => {
    const m = leggiMessaggioCanale(c.sigillo.apri(testo))
    if (m === undefined) {
      // Non sigillato con la chiave di casa, o ripetuto: si butta, senza rispondere.
      log(`[webrtc] messaggio non autentico da ${c.pcId}: scartato`)
      return
    }
    c.ultimoUso = adesso()
    if (m.tipo === 'ciao') {
      if (c.ruolo === 'risponde') {
        manda(c, { tipo: 'ciao', pc: deps.io(), nome: deps.mioNome() })
        if (c.stato !== 'aperto') log(`[webrtc] ${m.nome || m.pc} collegato direttamente a questo PC`)
      }
      c.stato = 'aperto'
      c.salutato?.()
      return
    }
    if (m.tipo === 'chiedi') {
      if (c.ruolo !== 'risponde' || c.stato !== 'aperto') return
      let esito: EsitoCanale
      if (!rottaPermessaSulCanale(m.percorso)) esito = { stato: 403, corpo: { errore: 'rotta non permessa sul collegamento diretto' } }
      else {
        // Chi guarda (0.49.1): quello detto nel messaggio sigillato, o il PC dall'altra parte del canale.
        try { esito = await deps.rotta(m.percorso, m.corpo, m.visore ?? c.pcId) } catch (err) { esito = { stato: 500, corpo: { errore: String(err) } } }
      }
      manda(c, { tipo: 'risposta', id: m.id, stato: esito.stato, corpo: esito.corpo })
      return
    }
    const a = c.attese.get(m.id)
    if (a === undefined) return
    c.attese.delete(m.id)
    clearTimeout(a.timer)
    a.ok({ stato: m.stato, corpo: m.corpo })
  }

  const ascolta = (p: PonteRtc): void => {
    if (ascoltato === p) return
    ascoltato = p
    p.ascolta((e) => {
      const c = capoDi(e.id)
      if (c === undefined) return
      if (e.tipo === 'aperto') {
        if (e.via !== undefined) log(`[webrtc] canale con ${c.pcId} aperto (candidato ${e.via})`)
        if (c.ruolo === 'chiama') {
          if (c.salutato === undefined) c.apertoPresto = true
          else manda(c, { tipo: 'ciao', pc: deps.io(), nome: deps.mioNome() })
        }
        return
      }
      if (e.tipo === 'chiuso') {
        if (c.stato === 'aperto') log(`[webrtc] canale con ${c.pcId} chiuso`)
        chiudiCapo(c, 'il collegamento diretto si è chiuso')
        return
      }
      if (e.testo !== undefined) void suMessaggio(c, e.testo)
    })
  }

  const fallisci = (pcId: string, c: Capo | undefined, perche: string): void => {
    fallitoIl.set(pcId, adesso())
    log(`[webrtc] collegamento diretto con ${pcId} non riuscito: ${perche}`)
    if (c !== undefined) chiudiCapo(c, perche)
  }

  const apri = async (pcId: string): Promise<void> => {
    const s = deps.scatola()
    const chiave = deps.chiaveDiCasa(pcId)
    if (s === undefined || chiave === undefined) { fallisci(pcId, undefined, s === undefined ? 'il Drive non è collegato (serve per lo scambio iniziale)' : 'la cassaforte è chiusa'); return }
    const io = deps.io()
    const giro = randomBytes(9).toString('base64url')
    // Segnato subito, prima di ogni attesa: due chiamate ravvicinate non aprono due collegamenti.
    const c: Capo = {
      pcId, ruolo: 'chiama', giro, idPonte: `chiama-${pcId}-${giro}`, sigillo: creaSigillo(chiave, giro, 'chiama'),
      stato: 'collegando', ultimoUso: adesso(), attese: new Map()
    }
    uscite.set(pcId, c)
    const p = await deps.ponte().catch(() => undefined)
    if (p === undefined) { fallisci(pcId, c, 'il WebRTC di Electron non è disponibile'); return }
    ascolta(p)
    const nomeOfferta = nomeOffertaRtc(pcId, io)
    try {
      const offerta = await p.offri(c.idPonte, SERVER_STUN)
      const segnale: SegnaleRtc = { giro, da: io, daNome: deps.mioNome(), verso: pcId, creatoIl: new Date(adesso()).toISOString(), sdp: cifraSegnale(chiave, giro, io, pcId, offerta) }
      await s.scrivi(nomeOfferta, segnale)
      log(`[webrtc] offerta per ${pcId} scritta sul Drive: aspetto la risposta`)
      const nomeRisposta = nomeRispostaRtc(io, pcId)
      const fine = adesso() + t.attesaRisposta
      let risposta: string | undefined
      while (risposta === undefined && adesso() < fine && uscite.get(pcId) === c) {
        await attendi(t.rileggiRisposta)
        const x = await s.leggi<unknown>(nomeRisposta).catch(() => undefined)
        const v = segnaleValido(x, { io, da: pcId, giro, adesso: adesso(), scadeMs: t.attesaRisposta + 60_000 })
        if (v === undefined) continue
        risposta = decifraSegnale(chiave, giro, pcId, io, v.sdp)
        await s.cancella(nomeRisposta).catch(() => undefined)
        if (risposta === undefined) throw new Error('la risposta sul Drive non è sigillata con la chiave di casa')
      }
      if (uscite.get(pcId) !== c) return
      if (risposta === undefined) throw new Error(`nessuna risposta in ${Math.round(t.attesaRisposta / 1000)} secondi (quel PC è spento, non ha la 0.40.0, o il suo Drive non è collegato)`)
      const salutato = new Promise<void>((ok) => { c.salutato = ok })
      await p.completa(c.idPonte, risposta)
      if (c.apertoPresto === true) manda(c, { tipo: 'ciao', pc: io, nome: deps.mioNome() })
      let scaduto = false
      await Promise.race([salutato, attendi(t.apertura).then(() => { scaduto = true })])
      if (scaduto && c.stato !== 'aperto') throw new Error(`il canale non si è aperto in ${Math.round(t.apertura / 1000)} secondi: probabilmente le due reti non si lasciano attraversare (servirebbe un server TURN, che non usiamo)`)
      fallitoIl.delete(pcId)
      log(`[webrtc] collegato direttamente a ${pcId} (WebRTC)`)
    } catch (err) {
      fallisci(pcId, c, err instanceof Error ? err.message : String(err))
    } finally {
      await s.cancella(nomeOfferta).catch(() => undefined)
    }
  }

  const servi = async (s: Scatola, p: PonteRtc, da: string, x: unknown): Promise<void> => {
    const io = deps.io()
    const nome = nomeOffertaRtc(io, da)
    const v = segnaleValido(x, { io, da, adesso: adesso() })
    if (v === undefined || giriServiti.has(v.giro)) return
    giriServiti.add(v.giro)
    const chiave = deps.chiaveDiCasa(io)
    if (chiave === undefined) { log(`[webrtc] offerta da ${v.daNome || da}, ma la cassaforte è chiusa: non posso rispondere`); return }
    const offerta = decifraSegnale(chiave, v.giro, da, io, v.sdp)
    await s.cancella(nome).catch(() => undefined)
    if (offerta === undefined) { log(`[webrtc] offerta sul Drive non sigillata con la chiave di casa (da ${da}): scartata`); return }
    // Un PC alla volta per verso: un'offerta nuova sostituisce la vecchia.
    for (const c of [...entrate.values()]) if (c.pcId === da) chiudiCapo(c, 'sostituito da un collegamento nuovo')
    const c: Capo = {
      pcId: da, ruolo: 'risponde', giro: v.giro, idPonte: `risponde-${da}-${v.giro}`, sigillo: creaSigillo(chiave, v.giro, 'risponde'),
      stato: 'collegando', ultimoUso: adesso(), attese: new Map()
    }
    entrate.set(c.idPonte, c)
    try {
      const risposta = await p.rispondi(c.idPonte, offerta, SERVER_STUN)
      const segnale: SegnaleRtc = { giro: v.giro, da: io, daNome: deps.mioNome(), verso: da, creatoIl: new Date(adesso()).toISOString(), sdp: cifraSegnale(chiave, v.giro, io, da, risposta) }
      await s.scrivi(nomeRispostaRtc(da, io), segnale)
      log(`[webrtc] ${v.daNome || da} chiede un collegamento diretto: risposta scritta sul Drive`)
    } catch (err) {
      log(`[webrtc] risposta a ${v.daNome || da} non riuscita: ${String(err)}`)
      chiudiCapo(c, 'risposta non riuscita')
    }
  }

  return {
    stato(pcId) {
      const c = uscite.get(pcId)
      if (c !== undefined) return c.stato
      return fallitoIl.has(pcId) ? 'fallito' : 'spento'
    },
    fallitoIl: (pcId) => fallitoIl.get(pcId),
    avvia(pcId) {
      if (uscite.has(pcId)) return
      void apri(pcId).catch((err: unknown) => fallisci(pcId, uscite.get(pcId), String(err)))
    },
    chiama(pcId, percorso, corpo, visore) {
      const c = uscite.get(pcId)
      if (c === undefined || c.stato !== 'aperto') return Promise.reject(new Error('il collegamento diretto non è aperto'))
      c.ultimoUso = adesso()
      const id = nuovoId()
      return new Promise<EsitoCanale>((ok, ko) => {
        const timer = setTimeout(() => {
          c.attese.delete(id)
          // Una richiesta senza risposta: il canale non è più buono. Si chiude,
          // e la prossima chiamata ne apre uno nuovo (o passa a un'altra strada).
          chiudiCapo(c, 'il collegamento diretto non risponde')
          ko(new Error(`nessuna risposta sul collegamento diretto in ${Math.round(t.richiesta / 1000)} secondi`))
        }, t.richiesta)
        c.attese.set(id, { ok, ko, timer })
        manda(c, { tipo: 'chiedi', id, percorso, ...(corpo !== undefined ? { corpo } : {}), ...(visore !== undefined ? { visore } : {}) })
      })
    },
    async cercaOfferte() {
      const ora = adesso()
      for (const c of [...uscite.values(), ...entrate.values()]) {
        if (c.stato === 'aperto' && ora - c.ultimoUso > t.inattivo) chiudiCapo(c, 'inattivo')
      }
      const s = deps.scatola()
      if (s === undefined || deps.chiaveDiCasa(deps.io()) === undefined) return
      const altri = deps.altriPc().filter((x) => x !== deps.io())
      if (altri.length === 0) return
      // Il ponte si crea solo quando c'è davvero un'offerta da servire.
      for (const da of altri) {
        const x = await s.leggi<unknown>(nomeOffertaRtc(deps.io(), da)).catch(() => undefined)
        if (segnaleValido(x, { io: deps.io(), da, adesso: ora }) === undefined) continue
        const p = await deps.ponte().catch(() => undefined)
        if (p === undefined) { log('[webrtc] offerta arrivata, ma il WebRTC di Electron non è disponibile'); return }
        ascolta(p)
        await servi(s, p, da, x)
      }
    },
    chiudiTutto() {
      for (const c of [...uscite.values(), ...entrate.values()]) chiudiCapo(c, 'programma in chiusura')
    }
  }
}
