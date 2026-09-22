import { pcVivo, type BattitoPc } from '@shared/posta'
import { ordinaIndirizzi, descriviIndirizzo, PORTA_CLIENT_PREDEFINITA } from '@shared/pc-remoto'

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
  | 'spento'        // il battito e' vecchio
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
}

const ATTESA_PREDEFINITA_MS = 4000

function quando(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? 'mai' : d.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })
}

export function creaClientPcRemoto(deps: DipendenzeRemoto): ClientPcRemoto {
  const adesso = deps.adesso ?? ((): number => Date.now())
  const chiamaHttp = deps.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
  const attesaMs = deps.attesaMs ?? ATTESA_PREDEFINITA_MS
  const log = deps.log ?? ((): void => {})
  const buoni = new Map<string, string>()
  /** Un motivo per PC, raccontato una volta: il riquadro bussa ogni due secondi. */
  const raccontati = new Map<string, string>()
  const racconta = (pcId: string, m: string): void => {
    if (raccontati.get(pcId) === m) return
    raccontati.set(pcId, m)
    log(`[remoto] ${m}`)
  }

  const battitoDi = (pcId: string): BattitoPc => {
    const b = deps.battiti().find((x) => x.pcId === pcId)
    if (b === undefined) throw new ErroreRemoto('sconosciuto', 'Questo PC non ha lasciato nessun battito sul Drive: non so né come si chiama né dove bussare. Compare dopo il suo primo salvataggio automatico.')
    return b
  }

  const chiama = async (pcId: string, percorso: string, corpo?: unknown): Promise<unknown> => {
    const b = battitoDi(pcId)
    const chiave = deps.chiavePer(pcId)
    if (chiave === undefined) {
      throw new ErroreRemoto('cassaforte', 'La cassaforte di questo PC è chiusa: la chiave per bussare a un altro PC si ricava da lì. Sbloccala (Account → Cassaforte) e riprova.')
    }
    if (!pcVivo(b, adesso())) {
      throw new ErroreRemoto('spento', `${b.nome} è spento, o senza rete: l'ultimo segno di vita sul Drive è del ${quando(b.battito)}. La sua chat dal vivo non si può guardare; resta la copia sul Drive (sola lettura) e la cassetta «Scrivile là», che lui consegna quando torna acceso.`)
    }
    const indirizzi = ordinaIndirizzi(b.indirizzi ?? [], buoni.get(pcId))
    if (indirizzi.length === 0) {
      throw new ErroreRemoto('senza-indirizzi', `${b.nome} ha la versione ${b.versione}, che nel battito non dice il suo indirizzo: per guardare le sue chat dal vivo serve la 0.33.0 o più recente anche là. Aggiornalo (parte da solo alla prossima quiete), poi da qui riprova.`)
    }
    const porta = b.porta ?? PORTA_CLIENT_PREDEFINITA
    const falliti: string[] = []
    for (const ind of indirizzi) {
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
      } catch (err) {
        clearTimeout(timer)
        const perche = controllo.signal.aborted ? `nessuna risposta in ${Math.round(attesaMs / 1000)} s` : String((err as Error)?.message ?? err)
        falliti.push(`${descriviIndirizzo(ind)}: ${perche}`)
        continue
      }
      clearTimeout(timer)
      // Ha risposto: da qui in poi e' quel PC che parla, e questo indirizzo e' buono.
      if (buoni.get(pcId) !== ind) {
        buoni.set(pcId, ind)
        log(`[remoto] ${b.nome} risponde su ${descriviIndirizzo(ind)}, porta ${porta}`)
      }
      raccontati.delete(pcId)
      let dati: unknown = undefined
      try { dati = await risposta.json() } catch { dati = undefined }
      if (risposta.status === 401) {
        throw new ErroreRemoto('chiave', `${b.nome} risponde ma non riconosce la chiave. Succede se là la cassaforte è chiusa (sbloccala su quel PC) o se i due PC hanno due cassaforti diverse: la chiave si ricava dalla stessa passphrase, e deve essere la stessa da tutte e due le parti.`, 401)
      }
      if (risposta.status === 403) {
        throw new ErroreRemoto('rifiutato', `${b.nome} rifiuta le richieste da questo indirizzo: per lui arrivano da fuori la sua rete locale. Su quel PC, in Impostazioni → Client, accendi «accetta anche da fuori la rete locale», oppure collegati alla stessa rete (o a Tailscale su tutti e due).`, 403)
      }
      if (risposta.status === 404) {
        const errore = (dati as { errore?: unknown } | undefined)?.errore
        throw new ErroreRemoto('chat', typeof errore === 'string' && errore !== '' ? errore : 'non trovato', 404)
      }
      if (!risposta.ok) {
        const errore = (dati as { errore?: unknown } | undefined)?.errore
        throw new ErroreRemoto('http', `${b.nome} risponde «${typeof errore === 'string' && errore !== '' ? errore : `errore ${risposta.status}`}».`, risposta.status)
      }
      return dati
    }
    const m = `${b.nome} è acceso (ultimo segno ${quando(b.battito)}) ma non risponde su nessuno dei suoi indirizzi — ${falliti.join('; ')}. O è su un'altra rete (a casa uno e in ufficio l'altro: allora serve Tailscale acceso su tutti e due), o il firewall di Windows su quel PC blocca la porta ${porta}.`
    racconta(pcId, m)
    throw new ErroreRemoto('irraggiungibile', m)
  }

  return {
    chiama,
    indirizzoBuono: (pcId) => buoni.get(pcId),
    async prova(pcId) {
      const da = adesso()
      try {
        const r = await chiama(pcId, '/api/stato') as { computer?: { nome?: string } } | undefined
        void r
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
