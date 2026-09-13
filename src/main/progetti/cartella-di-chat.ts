import { join } from 'node:path'
import { adottaOrigine, rimappaCwd, type RegistroProgetti } from './registro'

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
  motivo: 'esiste' | 'progetto' | 'adottata'
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
}): CartellaDiChat {
  if (a.esiste(a.cwd)) return { cwd: a.cwd, motivo: 'esiste' }
  const nota = rimappaCwd(a.cwd, a.registro, a.pcId, a.cartellaProgetti, a.esiste)
  if (nota.cwd !== a.cwd) return { cwd: nota.cwd, motivo: 'progetto', ...(nota.progetto !== undefined ? { nome: nota.progetto.nome } : {}) }
  const nome = nomeCartella(a.cwd)
  const percorsoQui = join(a.cartellaProgetti, nome)
  const { registro, progetto } = adottaOrigine(a.registro, {
    cwdOrigine: a.cwd, nome, pcId: a.pcId, percorsoQui, adesso: a.adesso
  })
  const dopo = rimappaCwd(a.cwd, registro, a.pcId, a.cartellaProgetti, a.esiste)
  return { cwd: dopo.cwd !== a.cwd ? dopo.cwd : percorsoQui, motivo: 'adottata', registro, nome: progetto.nome }
}
