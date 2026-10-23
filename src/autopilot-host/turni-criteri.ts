import { ePesante } from './criteri-veloci'
import type { GuardiaPc } from './guardia-pc'
import type { Esecutore } from './verifiche'

/**
 * **I comandi lunghi uno alla volta per PC, mai durante un'unione** (0.82.1).
 *
 * Il 21/10 il registro del servizio contava 452 criteri lanciati in mezza
 * giornata, e decine di `vitest run` e `gradle` **insieme**: ogni chat che si
 * fermava faceva partire la sua suite. Il PC andava al 100%, le suite scadevano
 * («rosso per tempo scaduto») e scadeva anche il supervisore, che è un altro
 * `claude` sullo stesso PC. Le chat si fermavano per questo.
 *
 * Qui due regole, per tutto il servizio (che è uno per PC):
 * - un comando pesante (vedi `ePesante`) parte solo quando nessun altro
 *   pesante sta girando, nell'ordine in cui sono arrivati;
 * - un pesante non parte in una cartella dove si sta unendo un ramo, e
 *   un'unione aspetta che finisca il pesante che gira nella sua cartella: una
 *   suite che misura file cambiati a metà strada dà un esito che non vale per
 *   nessun commit.
 */
export type TurniCriteri = {
  /** Esegue `fai` quando tocca a lui: nessun altro pesante, nessuna unione in `cwd`. */
  pesante: <T>(cwd: string, fai: () => Promise<T>) => Promise<T>
  /** Esegue l'unione quando nella cartella non gira nessun pesante né un'altra unione; intanto non ne parte nessuno lì. */
  unione: <T>(cwd: string, fai: () => T | Promise<T>) => Promise<T>
  /** Per il registro e le prove: chi gira adesso e quanti aspettano. */
  stato: () => { inCorso: string | undefined; inFila: number; unioni: number }
}

const normale = (cwd: string): string => cwd.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

export function creaTurni(): TurniCriteri {
  let inCorso: string | undefined
  const fila: { n: number; dove: string }[] = []
  let numero = 0
  const unioni = new Map<string, number>()
  /** Le cartelle dove un'unione sta girando adesso (0.84.0): una alla volta per cartella. */
  const unendo = new Set<string>()
  const attese = new Set<() => void>()
  const sveglia = (): void => { for (const f of [...attese]) f() }
  const aspetta = async (pronto: () => boolean): Promise<void> => {
    while (!pronto()) {
      await new Promise<void>((risolvi) => {
        const f = (): void => { attese.delete(f); risolvi() }
        attese.add(f)
      })
    }
  }

  return {
    async pesante(cwd, fai) {
      const dove = normale(cwd)
      const mio = ++numero
      fila.push({ n: mio, dove })
      // Tocca al primo della fila che può partire: chi aspetta un'unione nella
      // sua cartella non ferma quelli dietro di lui, che lavorano altrove.
      const tocca = (): boolean => inCorso === undefined && fila.find((f) => (unioni.get(f.dove) ?? 0) === 0)?.n === mio
      await aspetta(tocca)
      fila.splice(fila.findIndex((f) => f.n === mio), 1)
      inCorso = dove
      try {
        return await fai()
      } finally {
        inCorso = undefined
        sveglia()
      }
    },
    async unione(cwd, fai) {
      const dove = normale(cwd)
      unioni.set(dove, (unioni.get(dove) ?? 0) + 1)
      try {
        // **Una sola unione per cartella** (Revisione 0.84.0). Con git
        // sincrono un'unione era atomica; da asincrona cede il passo a ogni
        // comando, e due `git merge` nella stessa cartella si pestavano
        // (index.lock, e il `merge --abort` del secondo annullava il primo).
        // Il posto si prende dentro il controllo: fra un `await` e l'altro
        // un'altra unione vedrebbe la cartella ancora libera.
        await aspetta(() => {
          if (inCorso === dove || unendo.has(dove)) return false
          unendo.add(dove)
          return true
        })
        try {
          return await fai()
        } finally {
          unendo.delete(dove)
        }
      } finally {
        const resto = (unioni.get(dove) ?? 1) - 1
        if (resto > 0) unioni.set(dove, resto)
        else unioni.delete(dove)
        sveglia()
      }
    },
    stato: () => ({ inCorso, inFila: fila.length, unioni: [...unioni.values()].reduce((s, n) => s + n, 0) })
  }
}

/** I turni di questo PC: il servizio è uno per PC, e così i suoi turni. */
export const TURNI_PC: TurniCriteri = creaTurni()

/**
 * L'esecutore che rispetta i turni: i pesanti passano da `turni.pesante`, gli
 * altri (typecheck, grep, test -s) partono subito come prima.
 *
 * 0.85.1: con la guardia del PC, un pesante a cui tocca aspetta anche che il
 * PC non sia al limite (tenendo il suo turno: dietro non parte nessuno).
 */
export function conTurni(esegui: Esecutore, turni: TurniCriteri = TURNI_PC, guardia?: GuardiaPc): Esecutore {
  return (comando, cwd, timeoutMs) => {
    const lancia = (): ReturnType<Esecutore> => (timeoutMs !== undefined ? esegui(comando, cwd, timeoutMs) : esegui(comando, cwd))
    if (!ePesante(comando)) return lancia()
    const s = turni.stato()
    const davanti = s.inFila + (s.inCorso !== undefined ? 1 : 0)
    if (davanti > 0) console.info(`[criterio] aspetta il suo turno dietro ${davanti} comandi lunghi: ${comando.slice(0, 120)}`)
    if (guardia === undefined) return turni.pesante(cwd, lancia)
    return turni.pesante(cwd, async () => { await guardia.attendi(`«${comando.slice(0, 80)}»`); return lancia() })
  }
}
