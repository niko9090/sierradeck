import { pcVivo, type BattitoPc } from '@shared/posta'
import { descriviIndirizzo, PORTA_CLIENT_PREDEFINITA } from '@shared/pc-remoto'
import { indirizziDaProvare, messaggioErroreRemoto, motivoDaStatoHttp, statoPc, type PingPc, type StatoPc } from '@shared/scoperta-pc'

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
    const buona = risposte.find((x) => (x.stato >= 200 && x.stato < 300) || x.stato === 404)
    let p: PingPc
    if (buona !== undefined) {
      segnaBuono(pcId, nome, buona.ind, porta)
      p = { esito: 'risponde', indirizzo: buona.ind }
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
    return statoPc({
      nome: b?.nome ?? nomeNoto ?? 'quel PC',
      ping: p,
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

  const chiama = async (pcId: string, percorso: string, corpo?: unknown): Promise<unknown> => {
    const b = battitoDi(pcId)
    if (b === undefined) throw new ErroreRemoto('sconosciuto', 'Questo PC non ha mai lasciato un battito sul Drive: non so né come si chiama né dove bussare. Compare dopo il suo primo salvataggio automatico, con il Drive collegato su tutti e due.')
    const chiave = deps.chiavePer(pcId)
    if (chiave === undefined) throw new ErroreRemoto('cassaforte', messaggioErroreRemoto('cassaforte', b.nome))
    // Niente piu' «e' spento» guardando solo il battito (0.39.3): con il Drive
    // scollegato il battito e' sempre vecchio. Senza un indirizzo buono, prima
    // si bussa a tutti.
    if (buoni.get(pcId) === undefined) {
      const p = await bussa(pcId)
      if (p.esito !== 'risponde') throw errorePer(pcId, p)
    }
    const porta = b.porta ?? PORTA_CLIENT_PREDEFINITA
    for (let tentativo = 0; tentativo < 2; tentativo += 1) {
      const ind = buoni.get(pcId)
      if (ind === undefined) break
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
        if (p.esito !== 'risponde') throw errorePer(pcId, p)
        if (corpo !== undefined) {
          throw new ErroreRemoto('irraggiungibile', `${b.nome} ha cambiato indirizzo mentre mandavo: non so se il testo è arrivato. Guarda lo schermo qui sopra (si aggiorna da solo) prima di rimandarlo.`)
        }
        continue
      }
      clearTimeout(timer)
      raccontati.delete(pcId)
      let dati: unknown = undefined
      try { dati = await risposta.json() } catch { dati = undefined }
      const motivo = motivoDaStatoHttp(risposta.status)
      if (motivo === undefined) return dati
      const errore = (dati as { errore?: unknown } | undefined)?.errore
      const dettaglio = typeof errore === 'string' ? errore : `errore ${risposta.status}`
      throw new ErroreRemoto(motivo, messaggioErroreRemoto(motivo, b.nome, dettaglio), risposta.status)
    }
    throw errorePer(pcId, ultimiPing.get(pcId) ?? { esito: 'senza-indirizzi' })
  }

  return {
    chiama,
    indirizzoBuono: (pcId) => buoni.get(pcId),
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
