import { alberoRete, type DatiAlbero, type NodoRete, type RigaNodo } from './albero-rete'
import { eAiutante, type BattitoPc } from './posta'
import { statoPc, vistoDelPc } from './stato-pc'
import { vocePc, type ChiaveStatoPc, type ColoreStatoPc, type VoceStatoPc } from './vocabolario-stati-pc'
import { inCorso } from './installa-la'
import type { VoceSalute } from './salute'

/**
 * **La pagina «Computer»** (k-u5): un solo posto per i PC. Prima c'erano tre
 * liste con parole diverse: «Rete dei PC» (albero), «Gli altri computer» in
 * Salute e quella di Impostazioni → Account. Adesso c'è una scheda sola per
 * PC (`SchedaPc`), disegnata in tre viste: albero, elenco, mappa.
 *
 * Lo stato di ogni PC viene sempre da `statoPc` (soglie in `stato-pc.ts`) e
 * le parole e i colori dal vocabolario unico. Puro: nessuna rete, nessun orologio.
 */

export type VistaComputer = 'albero' | 'elenco' | 'mappa'

export const VISTE_COMPUTER: readonly { id: VistaComputer; testo: string }[] = [
  { id: 'albero', testo: 'Albero' },
  { id: 'elenco', testo: 'Elenco' },
  { id: 'mappa', testo: 'Mappa' }
]

export type ChatDiScheda = NonNullable<BattitoPc['chat']>[number]

export type SchedaPc = {
  id: string
  nome: string
  tipo: NodoRete['tipo']
  /** Lo stato (stesse chiavi del vocabolario): da `statoPc`, con Aiutante e aggiornamento. */
  stato: ChiaveStatoPc
  parola: string
  colore: ColoreStatoPc
  led: VoceStatoPc['led']
  classe: string
  /** Acceso e raggiungibile per lavorare. */
  acceso: boolean
  targhette: string[]
  /** Come lo si raggiunge («diretto (Tailscale)», «solo via Drive, lento»…). */
  strada?: string
  /** «v0.108.0», con l'avviso se è più vecchia della nostra. */
  versione: string
  versioneIndietro: boolean
  chat: ChatDiScheda[]
  aspettano: number
  /** k-179b: il numero di chat, il motivo breve e la spiegazione (dietro «?»); assente per un PC che non li manda. */
  posti?: NodoRete['posti']
  /** Le altre righe di dettaglio (ultimo segno, carico, lavori). */
  righe: RigaNodo[]
  aggiornamento?: NodoRete['aggiornamento']
  /** Cosa si può fare su questo PC. */
  azioni: { guardaDalVivo: boolean; cassetta: boolean; installaLa: boolean; dismetti: boolean }
}

export type DatiComputer = DatiAlbero & {
  /** pcId dei PC che «Salute» dice dismettibili (muti da più di una settimana). */
  dismettibili?: ReadonlySet<string>
}

export type Computer = { io: SchedaPc; altri: SchedaPc[]; accesi: number; totale: number }

const riga = (n: NodoRete, etichetta: string): RigaNodo | undefined => n.righe.find((r) => r.etichetta === etichetta)

/** Le schede di tutti i PC: questo PC, poi i PC con SierraDeck, poi gli Aiutanti (accesi prima, come l'albero). */
export function computerDa(d: DatiComputer): Computer {
  const albero = alberoRete(d)
  const battiti = new Map(d.pc.map((b) => [b.pcId, b]))
  const installazioni = new Map((d.installazioni ?? []).map((a) => [a.pcId, a]))

  const scheda = (n: NodoRete): SchedaPc => {
    const b = battiti.get(n.id)
    let stato: ChiaveStatoPc = 'acceso'
    if (n.tipo !== 'io') {
      const inst = installazioni.get(n.id)
      const visto = vistoDelPc(d.pc, n.id, d.adesso)
      const agg = inst !== undefined && inCorso(inst) && inst.a !== undefined ? { versione: inst.a } : null
      const s = statoPc(visto.visto, d.adesso, agg)
      stato = s.stato === 'acceso' && visto.soloAiutante && b !== undefined && !eAiutante(b) ? 'solo-aiutante' : s.stato
    }
    const v = vocePc(stato)
    const ver = riga(n, 'Versione')
    const chat = n.tipo === 'pc' && b !== undefined && Array.isArray(b.chat) ? b.chat : []
    const strada = riga(n, 'Collegamento')?.valore
    const vivo = v.vivo
    return {
      id: n.id,
      nome: n.nome,
      tipo: n.tipo,
      stato,
      parola: v.etichetta,
      colore: v.colore,
      led: v.led,
      classe: v.classe,
      acceso: vivo,
      targhette: n.targhette,
      ...(strada !== undefined ? { strada } : {}),
      versione: ver?.valore ?? '',
      versioneIndietro: ver?.tono === 'attenzione',
      chat,
      aspettano: chat.filter((c) => c.aspetta).length,
      ...(n.posti !== undefined ? { posti: n.posti } : {}),
      righe: n.righe.filter((r) => r.etichetta !== 'Versione' && r.etichetta !== 'Collegamento' && r.etichetta !== 'Chat'),
      ...(n.aggiornamento !== undefined ? { aggiornamento: n.aggiornamento } : {}),
      azioni: {
        guardaDalVivo: n.tipo === 'pc' && vivo && chat.length > 0,
        cassetta: n.tipo === 'pc',
        installaLa: n.aggiornabile,
        dismetti: n.tipo !== 'io' && d.dismettibili?.has(n.id) === true && !vivo && stato !== 'in-aggiornamento'
      }
    }
  }

  const io = scheda(albero.radice)
  const altri = albero.rami.flatMap((r) => r.nodi.map(scheda))
  return { io, altri, accesi: 1 + altri.filter((s) => s.acceso).length, totale: 1 + altri.length }
}

/** Il PC dal pannello Salute: un solo punto dove dire «apri Computer». */
export const CHIAVE_SALUTE_COMPUTER = 'computer'

/**
 * Salute senza l'elenco dei PC: le voci `pc:…` e «Nessun altro PC» escono
 * (stanno in Computer); se qualcuna chiedeva attenzione, resta una voce sola
 * che dice quanti computer guardare e rimanda a Computer. Firewall, scheda
 * video e carico restano: sono salute di questo PC, non un elenco.
 */
export function saluteSenzaPc(voci: readonly VoceSalute[]): { voci: VoceSalute[]; daGuardare: number } {
  const pcVoci = voci.filter((v) => v.chiave === 'pc' || v.chiave.startsWith('pc:'))
  const daGuardare = pcVoci.filter((v) => v.chiave.startsWith('pc:') && v.tono !== 'ok').length
  const resto = voci.filter((v) => !pcVoci.includes(v))
  if (daGuardare === 0) return { voci: resto, daGuardare }
  const peggio = pcVoci.some((v) => v.tono === 'guasto') ? 'guasto' : 'attenzione'
  const rimando: VoceSalute = {
    chiave: CHIAVE_SALUTE_COMPUTER, gruppo: 'pc', tono: peggio,
    titolo: daGuardare === 1 ? '1 computer da guardare' : `${daGuardare} computer da guardare`,
    spiegazione: 'Lo stato di ogni computer (acceso o spento, strada, versione, chat aperte) sta nella pagina Computer.',
    cosaFare: 'Apri Computer: lì vedi quale, e da lì puoi aggiornarlo o lasciargli un comando.',
    azioni: []
  }
  return { voci: [...resto, rimando], daGuardare }
}
