import { pcVivo, type BattitoPc } from '@shared/posta'
import { descriviIndirizzo, PORTA_CLIENT_PREDEFINITA } from '@shared/pc-remoto'
import { indirizziDaProvare, messaggioErroreRemoto, motivoDaStatoHttp, statoPc, type PingPc, type StatoPc } from '@shared/scoperta-pc'
import { indirizzoPreferito, prossimaMossa, RIBUSSA_OGNI_MS, stradaDiIndirizzo, type InfoStrada, type Strada, type StatoRtc } from '@shared/strada-pc'
import { ATTESA_DRIVE, NON_VIA_DRIVE } from './rtc/cassetta-drive'
import type { EsitoCanale } from './rtc/collegamento-rtc'

/**
 * Bussare a un altro PC: il Client di **quel** computer, chiamato da qui.
 *
 * E' la stessa porta e sono le stesse rotte del telefono (`/api/stato`,
 * `/api/storia`, `/api/scrivi`, `/api/scegli`, `/api/sessioni/riprendi`):
 * un PC che guarda una chat dal vivo su un altro e' un telefono in piu', con
 * una chiave che non si accoppia perche' la ricavano tutti e due dalla
 * cassaforte condivisa (`chiaveDiCasa('client-pc:<id di quel PC>')`).
 *
 * Dove bussare lo dice il battito di quel PC sul Drive: gli indirizzi (rete
 * di casa davanti, Tailscale dopo) e la porta. Si provano in fila, con
 * un'attesa corta, e ci si ricorda quello che ha risposto: la volta dopo si
 * parte da li'. Ogni fallimento ha un motivo detto per esteso, perche' da un
 * riquadro «non risponde» non dice cosa fare.
 */

export type MotivoRemoto =
  | 'sconosciuto'   // nessun battito di quel PC
  | 'cassaforte'    // la cassaforte di qui e' chiusa: niente chiave
  | 'spento'        // non si usa piu' (0.39.3): con dati vecchi e' «non-so»
  | 'non-so'        // battito vecchio e nessun indirizzo risponde: non so se e' acceso
  | 'senza-indirizzi' // versione di quel PC senza indirizzi nel battito
  | 'irraggiungibile' // nessun indirizzo risponde
  | 'chiave'        // 401: quel PC non riconosce la chiave
  | 'rifiutato'     // 403: quel PC rifiuta l'indirizzo da cui arriviamo
  | 'chat'          // 404: la chat non e' (piu') aperta la'
  | 'http'          // un altro errore di quel PC
  | 'collegando'    // 0.40.0: il WebRTC si sta aprendo, o lo schermo via Drive non e' ancora arrivato
  | 'lento'         // 0.40.0: via Drive questa cosa non si puo' fare

export class ErroreRemoto extends Error {
  constructor(public readonly motivo: MotivoRemoto, messaggio: string, public readonly stato?: number) {
    super(messaggio)
    this.name = 'ErroreRemoto'
  }
}

export type ClientPcRemoto = {
  /** Una rotta di quel PC: il JSON della risposta, o un `ErroreRemoto`. */
  chiama: (pcId: string, percorso: string, corpo?: unknown) => Promise<unknown>
  /** L'indirizzo che ha risposto l'ultima volta, se c'e'. */
  indirizzoBuono: (pcId: string) => string | undefined
  /**
   * Il bussare breve (0.39.3): tutti gli indirizzi insieme, un secondo e mezzo,
   * con la chiave di casa. Non guarda il battito: e' il modo di sapere se quel
   * PC e' acceso quando il Drive non lo dice.
   */
  bussa: (pcId: string, nome?: string) => Promise<PingPc>
  /** Com'e' quel PC dopo l'ultimo bussare (per il riquadro e il riquadro d'attesa). */
  statoDi: (pcId: string, nome?: string) => Promise<StatoPc>
  /** La strada usata l'ultima volta che quel PC ha risposto (0.40.0): rete di casa, Tailscale, WebRTC, Drive. */
  stradaDi: (pcId: string) => InfoStrada | undefined
  /** Prova a bussare: torna com'e' andata, senza lanciare. */
  prova: (pcId: string) => Promise<{ ok: true; indirizzo: string; ms: number; versione?: string } | { ok: false; motivo: MotivoRemoto; messaggio: string }>
}

export type DipendenzeRemoto = {
  /** I battiti degli altri PC, come li ricorda il postino. */
  battiti: () => BattitoPc[]
  /** La chiave con cui bussare a quel PC: `undefined` a cassaforte chiusa. */
  chiavePer: (pcId: string) => string | undefined
  /** Come mi presento nel registro di quel PC. */
  mioNome: () => string
  fetch?: typeof fetch
  adesso?: () => number
  /** Quanto si aspetta ogni indirizzo prima di passare al prossimo. */
  attesaMs?: number
  log?: (m: string) => void
  /**
   * Altri indirizzi oltre al battito (0.39.3): quelli che hanno risposto in
   * passato (ricordati su disco) e quelli che Tailscale da' adesso per quel
   * nome. Con il Drive scollegato il battito e' vecchio, e gli indirizzi
   * Tailscale cambiano.
   */
  altriIndirizzi?: (pcId: string, nome: string) => Promise<{ ricordati?: string[]; tailscale?: string[] }>
  /** Un indirizzo ha risposto: da ricordare su disco. */
  ricorda?: (pcId: string, indirizzo: string) => void
  /** Il Drive di questo PC e' collegato (senza, i battiti non arrivano). */
  driveCollegato?: () => boolean
  /** Quanto si aspetta il bussare breve. */
  bussaMs?: number
  /**
   * La terza strada (0.40.0): il collegamento WebRTC diretto via Internet,
   * quando ne' la rete di casa ne' Tailscale rispondono.
   */
  rtc?: {
    possibile: () => boolean
    stato: (pcId: string) => StatoRtc
    fallitoIl: (pcId: string) => number | undefined
    avvia: (pcId: string) => void
    chiama: (pcId: string, percorso: string, corpo?: unknown) => Promise<EsitoCanale>
  }
  /** La quarta strada (0.40.0): la cassetta sul Drive, lenta, solo schermo e messaggi. */
  cassetta?: {
    possibile: () => boolean
    chiama: (pcId: string, percorso: string, corpo?: unknown) => Promise<EsitoCanale>
  }
}

const ATTESA_PREDEFINITA_MS = 4000
/** Il bussare breve: un secondo e mezzo per tutti gli indirizzi insieme. */
const BUSSA_PREDEFINITA_MS = 1500

export function creaClientPcRemoto(deps: DipendenzeRemoto): ClientPcRemoto {
  const adesso = deps.adesso ?? ((): number => Date.now())
  const chiamaHttp = deps.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
  const attesaMs = deps.attesaMs ?? ATTESA_PREDEFINITA_MS
  const bussaMs = deps.bussaMs ?? BUSSA_PREDEFINITA_MS
  const log = deps.log ?? ((): void => {})
  const buoni = new Map<string, string>()
  /** La strada che ha funzionato l'ultima volta, per PC (0.40.0). */
  const strade = new Map<string, InfoStrada>()
  const ultimoBussaIl = new Map<string, number>()
  const segnaStrada = (pcId: string, nome: string, strada: Strada, indirizzo?: string): void => {
    const prima = strade.get(pcId)
    if (prima?.strada === strada && prima.indirizzo === indirizzo) return
    strade.set(pcId, { strada, ...(indirizzo !== undefined ? { indirizzo } : {}), dal: new Date(adesso()).toISOString() })
    log(`[remoto] ${nome || pcId}: strada ${strada === 'lan' ? 'rete di casa' : strada === 'tailscale' ? 'Tailscale' : strada === 'webrtc' ? 'WebRTC (diretto via Internet)' : 'Drive (lenta)'}${indirizzo !== undefined ? ` · ${indirizzo}` : ''}`)
  }
  /** L'ultimo bussare per PC: lo stato da mostrare, senza ribussare a ogni giro. */
  const ultimiPing = new Map<string, PingPc>()
  /** Un motivo per PC, raccontato una volta: il riquadro bussa ogni due secondi. */
  const raccontati = new Map<string, string>()
  const racconta = (pcId: string, m: string): void => {
    if (raccontati.get(pcId) === m) return
    raccontati.set(pcId, m)
    log(`[remoto] ${m}`)
  }
  const battitoDi = (pcId: string): BattitoPc | undefined => deps.battiti().find((x) => x.pcId === pcId)
  const segnaBuono = (pcId: string, nome: string, ind: string, porta: number): void => {
    if (buoni.get(pcId) !== ind) {
      buoni.set(pcId, ind)
      log(`[remoto] ${nome} risponde su ${descriviIndirizzo(ind)}, porta ${porta}`)
    }
    deps.ricorda?.(pcId, ind)
  }

  const bussa = async (pcId: string, nomeNoto?: string): Promise<PingPc> => {
    const b = battitoDi(pcId)
    const nome = b?.nome ?? nomeNoto ?? ''
    const chiave = deps.chiavePer(pcId)
    const altri = deps.altriIndirizzi !== undefined && nome !== ''
      ? await deps.altriIndirizzi(pcId, nome).catch(() => ({}) as { ricordati?: string[]; tailscale?: string[] })
      : {}
    const indirizzi = indirizziDaProvare({
      ...(buoni.get(pcId) !== undefined ? { buono: buoni.get(pcId) } : {}),
      ...(altri.ricordati !== undefined ? { ricordati: altri.ricordati } : {}),
      ...(altri.tailscale !== undefined ? { tailscale: altri.tailscale } : {}),
      battito: b?.indirizzi ?? []
    })
    if (indirizzi.length === 0) {
      const p: PingPc = { esito: 'senza-indirizzi' }
      ultimiPing.set(pcId, p)
      return p
    }
    const porta = b?.porta ?? PORTA_CLIENT_PREDEFINITA
    // Tutti insieme: con dieci indirizzi vecchi, uno alla volta sarebbero
    // quaranta secondi. Una GET con la chiave di quel PC: un 2xx (o un 404 di
    // una versione che `/api/pc` non la conosce, ma la chiave l'ha accettata)
    // vuol dire che e' proprio lui.
    const risposte = await Promise.all(indirizzi.map(async (ind) => {
      const controllo = new AbortController()
      const timer = setTimeout(() => controllo.abort(), bussaMs)
      try {
        const r = await chiamaHttp(`http://${ind}:${porta}/api/pc`, {
          method: 'GET',
          headers: { ...(chiave !== undefined ? { 'x-sierradeck-chiave': chiave } : {}), 'x-sierradeck-pc': encodeURIComponent(deps.mioNome()) },
          signal: controllo.signal
        })
        return { ind, stato: r.status }
      } catch {
        return { ind, stato: 0 }
      } finally {
        clearTimeout(timer)
      }
    }))
    ultimoBussaIl.set(pcId, adesso())
    // Prima la rete di casa, poi Tailscale (0.40.0): rispondono insieme, e
    // Tailscale a volte arriva prima.
    const buona = indirizzoPreferito(risposte.filter((x) => (x.stato >= 200 && x.stato < 300) || x.stato === 404).map((x) => x.ind))
    let p: PingPc
    if (buona !== undefined) {
      segnaBuono(pcId, nome, buona, porta)
      p = { esito: 'risponde', indirizzo: buona }
    } else {
      const chiaveNo = risposte.find((x) => x.stato === 401)
      const rifiuto = risposte.find((x) => x.stato === 403)
      p = chiaveNo !== undefined ? { esito: 'chiave', indirizzo: chiaveNo.ind }
        : rifiuto !== undefined ? { esito: 'rifiutato', indirizzo: rifiuto.ind }
        : { esito: 'muto', provati: indirizzi.map(descriviIndirizzo) }
    }
    ultimiPing.set(pcId, p)
    return p
  }

  const statoDa = (pcId: string, p: PingPc | undefined, nomeNoto?: string): StatoPc => {
    const b = battitoDi(pcId)
    // Il canale WebRTC aperto vale come una risposta: quel PC c'e'.
    const viaRtc = p?.esito !== 'risponde' && deps.rtc?.stato(pcId) === 'aperto'
    return statoPc({
      nome: b?.nome ?? nomeNoto ?? 'quel PC',
      ping: viaRtc ? { esito: 'risponde', indirizzo: 'WebRTC' } : p,
      battitoVivo: b !== undefined && pcVivo(b, adesso()),
      ...(b?.battito !== undefined ? { ultimoSegno: b.battito } : {}),
      driveCollegato: deps.driveCollegato?.() ?? true,
      porta: b?.porta ?? PORTA_CLIENT_PREDEFINITA
    })
  }

  /** L'errore giusto per un bussare andato male, con il motivo vero. */
  const errorePer = (pcId: string, p: PingPc): ErroreRemoto => {
    const s = statoDa(pcId, p)
    const motivo: MotivoRemoto = s.stato === 'chiave' ? 'chiave'
      : s.stato === 'rifiutato' ? 'rifiutato'
      : s.stato === 'senza-indirizzi' ? 'senza-indirizzi'
      : s.stato === 'irraggiungibile' ? 'irraggiungibile'
      : 'non-so'
    const m = `${s.titolo}. ${s.cosaFare}`
    racconta(pcId, m)
    return new ErroreRemoto(motivo, m, p.esito === 'chiave' ? 401 : p.esito === 'rifiutato' ? 403 : undefined)
  }

  /** Da una risposta (HTTP, canale o cassetta) ai dati, o all'errore con il motivo vero. */
  const datiDa = (e: EsitoCanale, nome: string): unknown => {
    const errore = (e.corpo as { errore?: unknown } | undefined)?.errore
    const dettaglio = typeof errore === 'string' ? errore : `errore ${e.stato}`
    if (e.stato === ATTESA_DRIVE) throw new ErroreRemoto('collegando', dettaglio, e.stato)
    if (e.stato === NON_VIA_DRIVE) throw new ErroreRemoto('lento', dettaglio, e.stato)
    const motivo = motivoDaStatoHttp(e.stato)
    if (motivo === undefined) return e.corpo
    throw new ErroreRemoto(motivo, messaggioErroreRemoto(motivo, nome, dettaglio), e.stato)
  }

  /**
   * La chiamata sulla strada diretta (rete di casa o Tailscale). `undefined`
   * quando quella strada non c'e' piu' (l'indirizzo buono ha smesso di
   * rispondere e il bussare non ne trova un altro): si passa alle strade dopo.
   */
  const viaHttp = async (pcId: string, b: BattitoPc, chiave: string, percorso: string, corpo?: unknown): Promise<{ dati: unknown } | undefined> => {
    const porta = b.porta ?? PORTA_CLIENT_PREDEFINITA
    for (let tentativo = 0; tentativo < 2; tentativo += 1) {
      const ind = buoni.get(pcId)
      if (ind === undefined) return undefined
      const controllo = new AbortController()
      const timer = setTimeout(() => controllo.abort(), attesaMs)
      let risposta: Response
      try {
        risposta = await chiamaHttp(`http://${ind}:${porta}${percorso}`, {
          method: corpo === undefined ? 'GET' : 'POST',
          headers: {
            'x-sierradeck-chiave': chiave,
            'x-sierradeck-pc': encodeURIComponent(deps.mioNome()),
            ...(corpo === undefined ? {} : { 'content-type': 'application/json' })
          },
          ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
          signal: controllo.signal
        })
      } catch {
        clearTimeout(timer)
        // L'indirizzo buono ha smesso di rispondere: si ribussa a tutti. Una
        // scrittura non si ripete (potrebbe essere arrivata): si dice e basta.
        buoni.delete(pcId)
        const p = await bussa(pcId)
        if (p.esito !== 'risponde') return undefined
        if (corpo !== undefined) {
          throw new ErroreRemoto('irraggiungibile', `${b.nome} ha cambiato indirizzo mentre mandavo: non so se il testo è arrivato. Guarda lo schermo qui sopra (si aggiorna da solo) prima di rimandarlo.`)
        }
        continue
      }
      clearTimeout(timer)
      raccontati.delete(pcId)
      let dati: unknown = undefined
      try { dati = await risposta.json() } catch { dati = undefined }
      segnaStrada(pcId, b.nome, stradaDiIndirizzo(ind), ind)
      return { dati: datiDa({ stato: risposta.status, corpo: dati }, b.nome) }
    }
    return undefined
  }

  const collegando = (nome: string): ErroreRemoto => new ErroreRemoto('collegando',
    `Né la rete di casa né Tailscale arrivano a ${nome}: apro un collegamento diretto via Internet (WebRTC). Lo scambio iniziale passa dal Drive, e può volerci fino a un minuto e mezzo.`)

  const chiama = async (pcId: string, percorso: string, corpo?: unknown): Promise<unknown> => {
    const b = battitoDi(pcId)
    if (b === undefined) throw new ErroreRemoto('sconosciuto', 'Questo PC non ha mai lasciato un battito sul Drive: non so né come si chiama né dove bussare. Compare dopo il suo primo salvataggio automatico, con il Drive collegato su tutti e due.')
    const chiave = deps.chiavePer(pcId)
    if (chiave === undefined) throw new ErroreRemoto('cassaforte', messaggioErroreRemoto('cassaforte', b.nome))
    // 1-2. La strada diretta: rete di casa, poi Tailscale. Niente piu' «e'
    // spento» guardando solo il battito (0.39.3): senza un indirizzo buono si
    // bussa a tutti. Usando WebRTC o il Drive si ribussa ogni mezzo minuto,
    // non a ogni giro del riquadro: se quel PC torna raggiungibile, si torna
    // alla strada veloce.
    let ping = ultimiPing.get(pcId)
    if (buoni.get(pcId) === undefined) {
      const lenta = strade.get(pcId)?.strada === 'webrtc' || strade.get(pcId)?.strada === 'drive'
      if (!lenta || adesso() - (ultimoBussaIl.get(pcId) ?? 0) >= RIBUSSA_OGNI_MS) ping = await bussa(pcId)
    }
    if (buoni.get(pcId) !== undefined) {
      const r = await viaHttp(pcId, b, chiave, percorso, corpo)
      if (r !== undefined) return r.dati
      ping = ultimiPing.get(pcId)
    }
    // 3-4. WebRTC, poi la cassetta sul Drive.
    const m = prossimaMossa({
      diretta: false,
      chiaveRifiutata: ping?.esito === 'chiave',
      rtcPossibile: deps.rtc?.possibile() ?? false,
      rtc: deps.rtc?.stato(pcId) ?? 'spento',
      ...(deps.rtc?.fallitoIl(pcId) !== undefined ? { rtcFallitoIl: deps.rtc.fallitoIl(pcId) } : {}),
      drivePossibile: deps.cassetta?.possibile() ?? false,
      adesso: adesso()
    })
    if (m.avviaRtc) deps.rtc?.avvia(pcId)
    if (m.mossa === 'rtc' && deps.rtc !== undefined) {
      let e: EsitoCanale
      try {
        e = await deps.rtc.chiama(pcId, percorso, corpo)
      } catch (err) {
        if (corpo !== undefined) {
          throw new ErroreRemoto('irraggiungibile', `Il collegamento diretto con ${b.nome} si è interrotto mentre mandavo (${err instanceof Error ? err.message : String(err)}): non so se il testo è arrivato. Guarda lo schermo prima di rimandarlo; intanto lo riapro.`)
        }
        throw new ErroreRemoto('collegando', `Il collegamento diretto con ${b.nome} si è interrotto: lo riapro da solo.`)
      }
      raccontati.delete(pcId)
      segnaStrada(pcId, b.nome, 'webrtc')
      return datiDa(e, b.nome)
    }
    if (m.mossa === 'aspetta-rtc') throw collegando(b.nome)
    if (m.mossa === 'drive' && deps.cassetta !== undefined) {
      const e = await deps.cassetta.chiama(pcId, percorso, corpo)
      segnaStrada(pcId, b.nome, 'drive')
      return datiDa(e, b.nome)
    }
    throw errorePer(pcId, ping ?? { esito: 'senza-indirizzi' })
  }

  return {
    chiama,
    indirizzoBuono: (pcId) => buoni.get(pcId),
    stradaDi: (pcId) => strade.get(pcId),
    bussa,
    async statoDi(pcId, nome) {
      return statoDa(pcId, await bussa(pcId, nome), nome)
    },
    async prova(pcId) {
      const da = adesso()
      try {
        await chiama(pcId, '/api/pc')
        const ind = buoni.get(pcId) ?? ''
        const b = deps.battiti().find((x) => x.pcId === pcId)
        return { ok: true, indirizzo: ind, ms: adesso() - da, ...(b !== undefined ? { versione: b.versione } : {}) }
      } catch (err) {
        if (err instanceof ErroreRemoto) return { ok: false, motivo: err.motivo, messaggio: err.message }
        return { ok: false, motivo: 'http', messaggio: String(err) }
      }
    }
  }
}
