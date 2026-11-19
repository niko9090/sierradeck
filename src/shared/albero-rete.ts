import { eAiutante, bloccoDiAiutante, type BattitoPc } from './posta'
import { statoPc, vistoConAiutante } from './stato-pc'
import { nomeDaMostrare } from './nome-pc'
import { quantoFa, versionePcInBreve, prima } from './salute'
import { inCorso, type AvanzamentoInstallaLa } from './installa-la'
import type { MappaPc } from './collegamento'

/**
 * **La rete dei PC, ad albero** (16/11). Nicholas: «voglio che aggiungiamo una
 * pagina che mi fa vedere un albero dei pc attivi e degli aiutanti con un
 * minimo di info come aggiornamento remoto e altro».
 *
 * In cima questo PC; sotto due rami: i PC con SierraDeck completo e gli
 * Aiutanti. Prima gli accesi, poi gli spenti, per nome. Ogni nodo dice poco e
 * bene: acceso o spento, versione (e se è indietro), come lo si raggiunge,
 * l'ultimo segno, chat o blocchi, CPU e memoria, e l'aggiornamento a distanza
 * se ce n'è uno in corso o appena finito. Tutto da dati che il programma ha
 * già (battiti sul Drive, versioni vive, mappa dei collegamenti, «Installa là»).
 */

export type Tono = 'ok' | 'quieto' | 'attenzione' | 'errore' | 'lavoro'

export type RigaNodo = { etichetta: string; valore: string; tono?: Tono }

export type NodoRete = {
  id: string
  nome: string
  tipo: 'io' | 'pc' | 'aiutante'
  acceso: boolean
  /** «PC di sviluppo», la frase di `statoPc` se è spento…: le targhette accanto al nome. */
  targhette: string[]
  righe: RigaNodo[]
  /** L'aggiornamento a distanza o di questo PC, se c'è qualcosa da dire. */
  aggiornamento?: { testo: string; tono: Tono; percento?: number }
  /** Si può chiedere «Aggiorna da remoto»: PC completo, acceso, più vecchio, nessuna installazione in corso. */
  aggiornabile: boolean
}

export type RamoRete = { id: 'pc' | 'aiutanti'; titolo: string; accesi: number; nodi: NodoRete[] }

export type AlberoRete = { radice: NodoRete; rami: RamoRete[] }

export type StatoAggiornamentoIo = { fase?: string; versione?: string; percento?: number }

export type DatiAlbero = {
  io: { id?: string; nome: string; versione: string; aggiornamento?: StatoAggiornamentoIo }
  pc: readonly BattitoPc[]
  /** pcId → versione detta dal PC adesso (non dal battito vecchio). */
  vive?: Readonly<Record<string, string>>
  installazioni?: readonly AvanzamentoInstallaLa[]
  mappa?: MappaPc
  adesso: number
}

const FASI_IO: Record<string, string> = {
  cerco: 'cerca aggiornamenti',
  disponibile: 'c’è una versione nuova',
  scarico: 'scarica la versione nuova',
  pronto: 'versione nuova pronta da installare',
  attendo: 'aspetta la quiete per installare',
  installo: 'installa'
}

function aggiornamentoIo(a: StatoAggiornamentoIo | undefined): NodoRete['aggiornamento'] {
  if (a?.fase === undefined || FASI_IO[a.fase] === undefined) return undefined
  const v = a.versione !== undefined && a.versione !== '' ? ` ${a.versione}` : ''
  const tono: Tono = a.fase === 'pronto' || a.fase === 'disponibile' ? 'attenzione' : 'lavoro'
  return { testo: `${FASI_IO[a.fase]}${v}`, tono, ...(a.fase === 'scarico' && a.percento !== undefined ? { percento: Math.round(a.percento) } : {}) }
}

const TONO_INSTALLA: Record<AvanzamentoInstallaLa['fase'], Tono> = {
  cerco: 'lavoro', scarico: 'lavoro', attendo: 'lavoro', installo: 'lavoro', riparte: 'lavoro',
  fatto: 'ok', fallito: 'errore', errore: 'errore'
}

/** L'aggiornamento a distanza: in corso sempre, finito solo se è di poco fa (un'ora). */
function aggiornamentoRemoto(a: AvanzamentoInstallaLa | undefined, adesso: number): NodoRete['aggiornamento'] {
  if (a === undefined) return undefined
  const t = Date.parse(a.aggiornato)
  if (!inCorso(a) && (Number.isNaN(t) || adesso - t > 3_600_000)) return undefined
  const verso = a.a !== undefined ? `${a.da} → ${a.a}` : a.da
  return { testo: `${a.messaggio} (${verso})`, tono: TONO_INSTALLA[a.fase] }
}

function strada(mappa: MappaPc | undefined, pcId: string): RigaNodo | undefined {
  const l = mappa?.linee.find((x) => x.a === pcId)
  if (l === undefined) return undefined
  if (l.stato === 'ok') return { etichetta: 'Collegamento', valore: `diretto${l.strada !== undefined ? ` (${l.strada})` : ''}`, tono: 'ok' }
  if (l.stato === 'lento') return { etichetta: 'Collegamento', valore: 'solo via Drive, lento', tono: 'attenzione' }
  return { etichetta: 'Collegamento', valore: 'non risponde', tono: 'errore' }
}

function risorse(b: BattitoPc, programma: string): RigaNodo | undefined {
  const r = b.risorse
  if (r === undefined) return undefined
  const gb = r.ramMb >= 1024 ? `${(r.ramMb / 1024).toFixed(1).replace('.', ',')} GB` : `${Math.round(r.ramMb)} MB`
  return { etichetta: 'Carico', valore: `CPU ${Math.round(r.cpu)}% · memoria ${programma} ${gb}`, tono: r.cpu >= 85 ? 'attenzione' : 'quieto' }
}

function ordina(a: NodoRete, b: NodoRete): number {
  if (a.acceso !== b.acceso) return a.acceso ? -1 : 1
  return a.nome.localeCompare(b.nome, 'it')
}

export function alberoRete(d: DatiAlbero): AlberoRete {
  const installazioni = new Map((d.installazioni ?? []).map((a) => [a.pcId, a]))
  const aggIo = aggiornamentoIo(d.io.aggiornamento)
  const radice: NodoRete = {
    id: d.io.id ?? 'io',
    nome: d.io.nome,
    tipo: 'io',
    acceso: true,
    targhette: ['questo PC'],
    righe: [{ etichetta: 'Versione', valore: `v${d.io.versione}` }],
    ...(aggIo !== undefined ? { aggiornamento: aggIo } : {}),
    aggiornabile: false
  }

  const pc: NodoRete[] = []
  const aiutanti: NodoRete[] = []
  // 19/11: un PC che lavora solo con l'Aiutante non è spento: vale il battito più recente dei due.
  const visti = vistoConAiutante(d.pc, (b) => b.battito)
  for (const b of d.pc) {
    if (b.pcId === d.io.id) continue
    const st = statoPc(visti.get(b.pcId), d.adesso)
    if (st.stato === 'da-rimuovere') continue
    const acceso = st.stato === 'acceso'
    const nome = nomeDaMostrare(b)
    const segno = quantoFa(b.battito, d.adesso).replace(/^1 minuti fa$/u, '1 minuto fa')
    const righe: RigaNodo[] = []
    const targhette: string[] = []
    if (!acceso) targhette.push(st.frase)
    if (eAiutante(b)) {
      targhette.unshift('Aiutante')
      righe.push({ etichetta: 'Versione', valore: `Aiutante ${b.versione}` })
      const blocco = bloccoDiAiutante(b)
      righe.push(acceso && blocco !== undefined
        ? { etichetta: 'Lavori', valore: `fermo: ${blocco}`, tono: 'errore' }
        : { etichetta: 'Lavori', valore: acceso ? 'pronto a prendere lavori' : 'non prende lavori (spento)', tono: acceso ? 'ok' : 'quieto' })
    } else {
      if (b.sviluppo === true) targhette.unshift('PC di sviluppo')
      const viva = d.vive?.[b.pcId]
      const ver = versionePcInBreve({ versione: b.versione, battito: b.battito, ...(viva !== undefined ? { viva } : {}) }, d.io.versione, d.adesso)
      righe.push({ etichetta: 'Versione', valore: ver.testo.replace(' · più vecchia, aggiorna', ''), ...(ver.indietro ? { tono: 'attenzione' as const } : {}) })
      const chat = Array.isArray(b.chat) ? b.chat : []
      const aspettano = chat.filter((c) => c.aspetta).length
      righe.push({ etichetta: 'Chat', valore: `${chat.length} aperte${aspettano > 0 ? `, ${aspettano} aspettano te` : ''}`, ...(aspettano > 0 ? { tono: 'attenzione' as const } : {}) })
    }
    const s = acceso ? strada(d.mappa, b.pcId) : undefined
    if (s !== undefined) righe.push(s)
    righe.push({ etichetta: 'Ultimo segno', valore: segno, tono: acceso ? 'quieto' : 'attenzione' })
    const carico = acceso ? risorse(b, eAiutante(b) ? 'dell’Aiutante' : 'di SierraDeck') : undefined
    if (carico !== undefined) righe.push(carico)

    const inst = installazioni.get(b.pcId)
    const agg = aggiornamentoRemoto(inst, d.adesso)
    const versioneVera = d.vive?.[b.pcId] ?? b.versione
    const nodo: NodoRete = {
      id: b.pcId,
      nome,
      tipo: eAiutante(b) ? 'aiutante' : 'pc',
      acceso,
      targhette,
      righe,
      ...(agg !== undefined ? { aggiornamento: agg } : {}),
      aggiornabile: !eAiutante(b) && acceso && prima(versioneVera, d.io.versione) && !inCorso(inst)
    }
    ;(eAiutante(b) ? aiutanti : pc).push(nodo)
  }
  pc.sort(ordina)
  aiutanti.sort(ordina)
  return {
    radice,
    rami: [
      { id: 'pc', titolo: 'PC con SierraDeck', accesi: pc.filter((n) => n.acceso).length, nodi: pc },
      { id: 'aiutanti', titolo: 'Aiutanti', accesi: aiutanti.filter((n) => n.acceso).length, nodi: aiutanti }
    ]
  }
}
