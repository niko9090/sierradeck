import { join } from 'node:path'
import { sostituisciPrefisso } from './rimappa-di-massa'
import { adottaOrigine, collegaProgetto, normalizzaPercorso, percorsoLocale, progettoDiCwd, rimappaCwd, type RegistroProgetti } from './registro'

/**
 * La cartella in cui aprire una chat che qui non ce l'ha.
 *
 * Nicholas (2026-09-13, dal portatile): «quando entro in una chat che ha
 * scaricato dal cloud mi dà errore perché la directory non viene trovata:
 * puntano alla directory dell'altro PC». Una chat arrivata dal Drive porta
 * dentro la `cwd` del PC in cui e' nata; su un altro PC quella cartella non
 * c'e', e Claude Code non parte. Fin qui la rimappatura avveniva solo
 * all'avvio e solo per i progetti gia' nel registro: una chat qualunque,
 * aperta dall'elenco, restava con la cartella dell'altro.
 *
 * Qui si decide, al momento di aprire, dove lavora:
 * - la cartella esiste → resta com'e';
 * - non esiste ma sta dentro un progetto conosciuto (percorso di un altro PC
 *   o origine gia' adottata) → la stessa sottocartella nel progetto di qui;
 * - non la conosciamo → nasce un progetto nuovo in «Progetti SierraDeck» con
 *   il nome dell'ultima cartella, e l'origine si ricorda nel registro: le
 *   chat sorelle, e il riavvio, la troveranno gia' mappata.
 *
 * E' puro: chi chiama crea la cartella, scrive il registro e copia la
 * trascrizione sotto il nuovo slug (Claude Code la cerca da li').
 */
export type CartellaDiChat = {
  cwd: string
  /**
   * `altrove`: la cartella non c'e' qui ma **ce l'ha un altro PC** (lo dice
   * il suo battito sul Drive, o il registro dei progetti): la chat non si
   * adotta, resta sua. Chi apre decide: scriverle la' (la posta) o aprirla
   * qui lo stesso, in una cartella vuota.
   */
  motivo: 'esiste' | 'progetto' | 'adottata' | 'altrove' | 'spostata'
  /** Con `altrove`: chi ce l'ha. */
  pc?: { id: string; nome: string }
  /** Il registro aggiornato, quando l'origine e' stata adottata adesso. */
  registro?: RegistroProgetti
  /** Il nome del progetto, per dirlo alla persona. */
  nome?: string
}

/** L'ultima cartella di un percorso, di qualunque PC: `E:\Users\x\Documents\Wdeck` → `Wdeck`. */
export function nomeCartella(cwd: string): string {
  const pezzi = cwd.split(/[\\/]+/).filter((p) => p !== '')
  const ultimo = pezzi[pezzi.length - 1] ?? ''
  const pulito = ultimo.replace(/[<>:"|?*]/g, '-').replace(/^-+|-+$/g, '').trim()
  return pulito === '' ? 'progetto' : pulito
}

export function risolviCartellaDiChat(a: {
  cwd: string
  registro: RegistroProgetti
  pcId: string
  cartellaProgetti: string
  esiste: (percorso: string) => boolean
  adesso: string
  /** Chi ha quella cartella, se un altro PC. Senza, si adotta come prima. */
  altrove?: (cwd: string) => { id: string; nome: string } | undefined
  /** «Aprila qui lo stesso»: si adotta anche se e' di un altro PC. */
  forza?: boolean
  /**
   * Le radici che si sono spostate su questo PC: «Documenti» portata da
   * `C:\Users\x\Documents` a `E:\Users\x\Documents` (Proprieta' della
   * cartella → Percorso → Sposta). Le chat tengono dentro il percorso vecchio;
   * se la stessa sottocartella esiste sotto la radice nuova, e' quella la
   * casa, non una cartella vuota adottata in «Progetti SierraDeck». Nicholas
   * (16/09/2026) ha spostato Documenti con 580 chat sotto Portfolio.
   */
  radiciSpostate?: { da: string; a: string }[]
}): CartellaDiChat {
  if (a.esiste(a.cwd)) return { cwd: a.cwd, motivo: 'esiste' }
  // La radice spostata viene prima di tutto, anche di «altrove»: l'altro PC
  // puo' avere ancora lo stesso percorso vecchio (stesso utente, stessa
  // C:\Users\x\Documents), ma se la cartella sta qui sotto la radice nuova
  // e' nostra.
  for (const r of a.radiciSpostate ?? []) {
    const la = sostituisciPrefisso(a.cwd, r.da, r.a)
    if (la !== undefined && a.esiste(la)) return { cwd: la, motivo: 'spostata' }
  }
  // Di un altro PC: si lascia dov'e'. Prima di guardare il registro, perche'
  // il registro puo' conoscere un progetto con quel percorso (adottato da un
  // terzo PC) e rimapparla in una cartella vuota di qui lo stesso.
  if (a.forza !== true && a.altrove !== undefined) {
    const pc = a.altrove(a.cwd)
    if (pc !== undefined) return { cwd: a.cwd, motivo: 'altrove', pc }
  }
  const nota = rimappaCwd(a.cwd, a.registro, a.pcId, a.cartellaProgetti, a.esiste)
  if (nota.cwd !== a.cwd) {
    // Un progetto conosciuto ma mai collegato qui: si collega adesso, o alla
    // prossima apertura la stessa cartella verrebbe «adottata» come progetto
    // nuovo accanto a quello vero (un «src» in piu' nel registro condiviso).
    const registro = nota.progetto !== undefined && nota.nuovo === true
      ? collegaProgetto(a.registro, nota.progetto.id, a.pcId, percorsoLocale(nota.progetto, a.pcId, a.cartellaProgetti).percorso)
      : undefined
    return {
      cwd: nota.cwd,
      motivo: 'progetto',
      ...(nota.progetto !== undefined ? { nome: nota.progetto.nome } : {}),
      ...(registro !== undefined ? { registro } : {})
    }
  }
  // Una sottocartella sparita di un progetto **gia' mio**: si ricrea li',
  // non si adotta come progetto nuovo. Prima `D:\dev\Wdeck\src` cancellata
  // diventava un progetto «src» in «Progetti SierraDeck», nel registro di
  // tutti i PC.
  const mio = progettoDiCwd(a.registro, a.cwd, a.pcId)
  if (mio !== undefined) return { cwd: a.cwd, motivo: 'progetto', nome: mio.nome }
  const nome = nomeCartella(a.cwd)
  // Due progetti con lo stesso nome non possono stare nella stessa cartella:
  // i file si mescolerebbero e ogni salvataggio li caricherebbe sotto due
  // prefissi. Al secondo si aggiunge un pezzo di id.
  const occupata = (p: string): boolean =>
    a.registro.progetti.some((x) => {
      const suo = x.percorsi[a.pcId]
      return suo !== undefined && normalizzaPercorso(suo) === normalizzaPercorso(p)
    })
  const base = join(a.cartellaProgetti, nome)
  const gia = a.registro.progetti.find((x) => (x.origini ?? []).some((o) => normalizzaPercorso(o) === normalizzaPercorso(a.cwd)))
  const percorsoQui = gia !== undefined || !occupata(base) ? base : join(a.cartellaProgetti, `${nome}-${a.adesso.replace(/\D/g, '').slice(-6)}`)
  const { registro, progetto } = adottaOrigine(a.registro, {
    cwdOrigine: a.cwd, nome, pcId: a.pcId, percorsoQui, adesso: a.adesso
  })
  const dopo = rimappaCwd(a.cwd, registro, a.pcId, a.cartellaProgetti, a.esiste)
  return { cwd: dopo.cwd !== a.cwd ? dopo.cwd : percorsoQui, motivo: 'adottata', registro, nome: progetto.nome }
}
