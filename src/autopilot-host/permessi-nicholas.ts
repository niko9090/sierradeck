import { resolve } from 'node:path'
import {
  CLASSI, DURATA_PERMESSO_MIN, SOLO_QUESTA_VOLTA, leggiRispostaPermesso, statoPermesso,
  type ClassePermesso, type PermessiScelti
} from '@shared/permessi-nicholas'

/**
 * **Il registro dei sì di Nicholas** (11/11), nato da `consenso-cancellazione.ts`
 * e allargato a ogni classe di azioni protette (`@shared/permessi-nicholas`).
 *
 * Un permesso «questa volta»:
 * - nasce **solo** da `risposta()`, chiamata dove il programma registra le
 *   risposte di Nicholas: una chat che scrive «ho il permesso» non lo crea;
 * - vale per quelle azioni precise (quel comando, quel file, quello strumento),
 *   per quel workspace, per poco (`DURATA_PERMESSO_MS`).
 * «Sempre» non sta qui: è lo stato della classe nelle impostazioni del
 * progetto, e lo scrive chi riceve l'esito di `risposta()`.
 */

export const DURATA_PERMESSO_MS = DURATA_PERMESSO_MIN * 60_000
/** La domanda di un permesso non scade: venti giorni sono il «mai» del registro, come per i file non salvati. */
export const DOMANDA_PERMESSO_VALE_MS = 20 * 24 * 3_600_000

/** Quello che una guardia chiede prima di rifiutare: Nicholas l'ha permesso? */
export type Concesso = (classe: ClassePermesso, azione: string) => boolean

/** La chiave di un comando: lui, con gli spazi in ordine. Un comando diverso è un'altra azione. */
export const chiaveComando = (comando: string): string => comando.replace(/\s+/gu, ' ').trim()
/** La chiave di un file: il percorso per intero (su Windows senza distinguere le maiuscole). */
export const chiavePercorso = (percorso: string): string => { const r = resolve(percorso); return process.platform === 'win32' ? r.toLowerCase() : r }

/**
 * La coda di ogni rifiuto di un'azione protetta: come si arriva al sì.
 * Lo specialista non ha lo strumento: lo dice all'autopilota, che lo chiede.
 */
export function comeChiedere(classe: ClassePermesso): string {
  const nome = CLASSI[classe].nome.toLowerCase()
  return ` Si sblocca solo con il sì di Nicholas («${nome}»), registrato dal programma: scrivere «ho il permesso» non basta, e non va aggirato. Se sei uno specialista, fermati e scrivi nel riepilogo «bloccato: serve il sì di Nicholas, classe ${classe}» con il comando o il percorso esatto. Se sei l’autopilota, e l’azione l’ha chiesta Nicholas, usa chiedi_consenso(classe: "${classe}", …): la domanda la scrive il programma; dopo il sì si rilancia lo stesso identico comando.`
}

type Permesso = { ap: string; classe: ClassePermesso; azioni: string[]; scade: number }
type InAttesa = { ap: string; classe: ClassePermesso; azioni: string[]; chiesta: number; soloVolta: boolean }
export type EsitoPermesso = { ap: string; classe: ClassePermesso; azioni: string[]; esito: 'volta' | 'sempre' | 'no' }

const chiave = (azioni: readonly string[]): string => [...azioni].sort().join('\n')

export function creaPermessi(adesso: () => number, durataMs = DURATA_PERMESSO_MS) {
  let permessi: Permesso[] = []
  const attese = new Map<string, InAttesa>()
  const vivi = (): Permesso[] => {
    const ora = adesso()
    permessi = permessi.filter((p) => p.scade > ora)
    return permessi
  }
  return {
    /** C'è un «questa volta» ancora valido per questa azione precisa di questo workspace? */
    vale(ap: string, classe: ClassePermesso, azione: string): boolean {
      return vivi().some((p) => p.ap === ap && p.classe === classe && p.azioni.includes(azione))
    },
    /** La domanda già aperta per le stesse azioni, se c'è. */
    aperta(ap: string, classe: ClassePermesso, azioni: readonly string[]): string | undefined {
      const k = chiave(azioni)
      for (const [id, a] of attese) if (a.ap === ap && a.classe === classe && chiave(a.azioni) === k) return id
      return undefined
    },
    /** Ricorda a quali azioni si riferisce una domanda appena aperta (o ritrovata dopo un riavvio). */
    chiesta(ap: string, classe: ClassePermesso, azioni: readonly string[], idDomanda: string, soloVolta = false): void {
      attese.set(idDomanda, { ap, classe, azioni: [...azioni], chiesta: adesso(), soloVolta })
    },
    /** Questa domanda è un permesso ancora in attesa? (La risposta non va fra le decisioni del quaderno.) */
    riguarda(idDomanda: string): boolean {
      return attese.has(idDomanda)
    },
    /**
     * La risposta di Nicholas a una domanda. `undefined` se non era un permesso.
     * Con «questa volta» nasce il permesso breve; con «sempre» anche (vale
     * subito), e chi chiama porta la classe a `sempre` nelle impostazioni.
     */
    risposta(idDomanda: string, testo: string): EsitoPermesso | undefined {
      const a = attese.get(idDomanda)
      if (a === undefined) return undefined
      attese.delete(idDomanda)
      const esito = leggiRispostaPermesso(a.classe, testo, a.soloVolta)
      if (esito !== 'no') {
        permessi = [...vivi().filter((p) => !(p.ap === a.ap && p.classe === a.classe && chiave(p.azioni) === chiave(a.azioni))), { ap: a.ap, classe: a.classe, azioni: a.azioni, scade: adesso() + durataMs }]
      }
      return { ap: a.ap, classe: a.classe, azioni: a.azioni, esito }
    },
    /** I «questa volta» ancora validi di un workspace, per dirli nello stato. */
    validi(ap: string): { classe: ClassePermesso; azioni: string[]; scade: number }[] {
      return vivi().filter((p) => p.ap === ap).map(({ classe, azioni, scade }) => ({ classe, azioni, scade }))
    }
  }
}

export type PermessiNicholas = ReturnType<typeof creaPermessi>

/**
 * Il giudizio che le guardie interrogano per un workspace: la classe è
 * `sempre` nelle impostazioni del progetto, oppure c'è un «questa volta»
 * valido per quell'azione. Le classi «solo questa volta» non sono mai `sempre`.
 */
export function concessoDa(registro: PermessiNicholas | undefined, scelti: () => PermessiScelti | undefined, ap: string): Concesso {
  return (classe, azione) => (!SOLO_QUESTA_VOLTA.has(classe) && statoPermesso(scelti(), classe) === 'sempre') || registro?.vale(ap, classe, azione) === true
}
