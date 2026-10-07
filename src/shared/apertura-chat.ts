import { pcVivo, type BattitoPc } from './posta'
import type { StatoPc } from './scoperta-pc'

/**
 * Da dove aprire una chat del workspace: qui, dal vivo su un altro PC, o in
 * attesa di quel PC (0.36.1).
 *
 * Nicholas (01/10): «se apro un workspace con chat che vivono su un altro PC,
 * devo collegarmi in remoto e lavorare a distanza, non vedere l'errore. Gli
 * errori solo se il PC destinatario non è raggiungibile». Prima il riquadro
 * provava sempre ad aprire la chat qui: se la cartella era di un altro PC si
 * fermava e chiedeva di scegliere («guarda dal vivo», «apri qui lo stesso»);
 * se la chat era aperta su un altro PC la apriva qui lo stesso, facendone una
 * seconda copia; se la trascrizione qui non c'era finiva nella diagnosi «la
 * trascrizione non c'è».
 *
 * Un'unica decisione, pura e provata, presa dal riquadro **prima** di aprire
 * qualunque chat: ogni strada che mette una chat in un riquadro — il
 * ripristino del workspace all'avvio, «Torna a com'era», «Riprendi», il cambio
 * di workspace — passa da qui.
 *
 * Le prove che una chat e' di un altro PC, in ordine:
 * 1. il **battito** di quel PC la elenca fra le sue chat aperte (e' aperta la',
 *    anche se qui ci sono cartella e trascrizione: aprirla qui ne farebbe due);
 * 2. la sua **cartella qui non c'e'** e il registro dei progetti (o le cartelle
 *    del battito) dicono che e' di quel PC.
 * Senza una prova si apre qui, con le diagnosi di sempre: una chat nuova non ha
 * ancora una trascrizione, e non deve finire su un altro PC che ha solo la
 * stessa cartella.
 *
 * **Prima di tutto, la casa (0.52.0).** La casa memorizzata (`case-chat`,
 * «Ospitata da») vince su tutto: se è un altro PC la chat si apre là, anche se
 * qui ci sono cartella e trascrizione; se è questo PC si apre qui, anche se un
 * altro PC la tiene aperta per errore. Prima della 0.52 la casa non entrava in
 * questa decisione: con la cartella presente su tutti e due i PC (i progetti
 * sul Drive) e il battito che elenca solo le chat del workspace davanti, la
 * stessa chat partiva su tutti e due.
 */
export type Apertura =
  | { tipo: 'locale' }
  | { tipo: 'remoto'; pc: { id: string; nome: string }; cwd: string; sessione?: string; perche: string; perCasa?: true }
  | {
      tipo: 'attesa'
      pc: { id: string; nome: string }
      cwd: string
      sessione?: string
      /** L'ultimo battito di quel PC (ISO), se ce n'e' uno. */
      ultimoSegno?: string
      perche: string
      /** La chat ha casa su quel PC (0.52.0): qui non parte, si offre «Porta qui la chat». */
      perCasa?: true
      /**
       * Com'e' quel PC dopo il bussare diretto (0.39.3): il titolo e cosa fare,
       * mai «spento» quando i dati sono vecchi (`statoPc` in scoperta-pc.ts).
       */
      statoPc?: StatoPc
    }

export type DatiApertura = {
  /** La conversazione: assente per una chat nuova. */
  sessione?: string
  cwd: string
  /** L'id di questo PC: il suo battito non conta. */
  io: string
  /** La trascrizione di questa conversazione c'e' su questo PC. */
  trascrizioneQui: boolean
  /** La cartella della chat esiste su questo PC. */
  cartellaQui: boolean
  /** Di chi e' la cartella, quando qui non c'e' (dal registro dei progetti). */
  cartellaDi?: { id: string; nome: string }
  /** I battiti degli altri PC sul Drive. */
  battiti: BattitoPc[]
  adesso: number
  /**
   * I PC che hanno risposto al bussare diretto (0.39.3): accesi anche se il
   * loro battito sul Drive e' vecchio — con il Drive scollegato lo e' sempre.
   */
  rispondono?: string[]
  /** Com'e' ogni PC dopo il bussare, per il riquadro d'attesa. */
  statiPc?: Record<string, StatoPc>
  /** La casa memorizzata di questa chat, se è un altro PC (0.52.0). */
  casa?: { id: string; nome: string; motivo: string }
  /** La casa memorizzata è questo PC. */
  casaQui?: boolean
}

/** «non risponde da 12 minuti», «non ha mai lasciato un battito». */
export function daQuandoTace(ultimoSegno: string | undefined, adesso: number): string {
  if (ultimoSegno === undefined) return 'non ha ancora lasciato un segno sul Drive'
  const t = Date.parse(ultimoSegno)
  if (Number.isNaN(t)) return 'non risponde'
  const minuti = Math.max(1, Math.round((adesso - t) / 60_000))
  if (minuti < 90) return `non risponde da ${minuti} minut${minuti === 1 ? 'o' : 'i'}`
  const ore = Math.round(minuti / 60)
  if (ore < 48) return `non risponde da ${ore} ore`
  return `non risponde da ${Math.round(ore / 24)} giorni`
}

export function decidiApertura(d: DatiApertura): Apertura {
  const altri = d.battiti.filter((b) => b.pcId !== d.io)
  const verso = (b: BattitoPc | undefined, pc: { id: string; nome: string }, perche: string, perCasa = false): Apertura => {
    const nome = b?.nome !== undefined && b.nome !== '' ? b.nome : pc.nome
    const id = b?.pcId ?? pc.id
    const casa = perCasa ? { perCasa: true as const } : {}
    if ((b !== undefined && pcVivo(b, d.adesso)) || (d.rispondono ?? []).includes(id)) {
      return { tipo: 'remoto', pc: { id, nome }, cwd: d.cwd, ...(d.sessione !== undefined ? { sessione: d.sessione } : {}), perche, ...casa }
    }
    return {
      tipo: 'attesa',
      pc: { id, nome },
      cwd: d.cwd,
      ...(d.sessione !== undefined ? { sessione: d.sessione } : {}),
      ...(b?.battito !== undefined && b.battito !== '' ? { ultimoSegno: b.battito } : {}),
      perche,
      ...casa,
      ...(d.statiPc?.[id] !== undefined ? { statoPc: d.statiPc[id] } : {})
    }
  }

  // 0. La casa memorizzata (0.52.0): vince su tutto il resto.
  if (d.sessione !== undefined && d.casa !== undefined && d.casa.id !== '' && d.casa.id !== d.io) {
    const b = altri.find((x) => x.pcId === d.casa?.id)
    return verso(b, { id: d.casa.id, nome: d.casa.nome }, `la sua casa è ${d.casa.nome}${d.casa.motivo !== '' ? ` (${d.casa.motivo})` : ''}`, true)
  }
  if (d.sessione !== undefined && d.casaQui === true) return { tipo: 'locale' }

  // 1. Aperta su un altro PC: il suo battito la elenca. Il piu' recente vince.
  if (d.sessione !== undefined) {
    const chi = altri
      .filter((b) => b.chat.some((c) => c.sessione === d.sessione))
      .sort((a, b) => b.battito.localeCompare(a.battito))[0]
    if (chi !== undefined) return verso(chi, { id: chi.pcId, nome: chi.nome }, `la chat è aperta su ${chi.nome}`)
  }

  // 2. La cartella qui non c'e' ed e' di un altro PC.
  if (!d.cartellaQui) {
    const daiBattiti = altri
      .filter((b) => b.cartelle.some((c) => sotto(d.cwd, c)) || b.chat.some((c) => sotto(d.cwd, c.cwd)))
      .sort((a, b) => b.battito.localeCompare(a.battito))[0]
    if (daiBattiti !== undefined) {
      return verso(daiBattiti, { id: daiBattiti.pcId, nome: daiBattiti.nome }, `la sua cartella è su ${daiBattiti.nome}, qui non c'è`)
    }
    if (d.cartellaDi !== undefined) {
      const b = altri.find((x) => x.pcId === d.cartellaDi?.id)
      return verso(b, d.cartellaDi, `la sua cartella è su ${d.cartellaDi.nome}, qui non c'è`)
    }
  }

  // 3. Di questo PC: si apre qui (le diagnosi di sempre se non parte).
  return { tipo: 'locale' }
}

/** `C:\\a\\b` sta sotto `c:/a/`? Maiuscole e barre non contano. */
function sotto(cwd: string, radice: string): boolean {
  const n = (x: string): string => x.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  const a = n(cwd)
  const r = n(radice)
  return r !== '' && (a === r || a.startsWith(r + '/'))
}
