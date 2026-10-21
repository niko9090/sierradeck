import { ePesante } from './criteri-veloci'
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
  /** Esegue l'unione quando nella cartella non gira nessun pesante; intanto non ne parte nessuno lì. */
  unione: <T>(cwd: string, fai: () => T | Promise<T>) => Promise<T>
  /** Per il registro e le prove: chi gira adesso e quanti aspettano. */
  stato: () => { inCorso: string | undefined; inFila: number; unioni: number }
}

const normale = (cwd: string): string => cwd.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

export function creaTurni(): TurniCriteri {
  let inCorso: string | undefined
  const fila: number[] = []
  let numero = 0
  const unioni = new Map<string, number>()
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
      fila.push(mio)
      await aspetta(() => inCorso === undefined && fila[0] === mio && (unioni.get(dove) ?? 0) === 0)
      fila.shift()
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
        await aspetta(() => inCorso !== dove)
        return await fai()
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
 */
export function conTurni(esegui: Esecutore, turni: TurniCriteri = TURNI_PC): Esecutore {
  return (comando, cwd, timeoutMs) => {
    const lancia = (): ReturnType<Esecutore> => (timeoutMs !== undefined ? esegui(comando, cwd, timeoutMs) : esegui(comando, cwd))
    if (!ePesante(comando)) return lancia()
    const s = turni.stato()
    const davanti = s.inFila + (s.inCorso !== undefined ? 1 : 0)
    if (davanti > 0) console.info(`[criterio] aspetta il suo turno dietro ${davanti} comandi lunghi: ${comando.slice(0, 120)}`)
    return turni.pesante(cwd, lancia)
  }
}
