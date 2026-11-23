import { AsyncLocalStorage } from 'node:async_hooks'
import { segnoWorkspace } from '@shared/rapporto-lavori'

/**
 * k-193e: il workspace di chi sta misurando. Le righe di registro delle unioni
 * di prova e dei criteri lo portano (`[ws: NOME]`), così il rapporto dei lavori
 * le raggruppa per workspace. Il contesto segue le chiamate asincrone, senza
 * cambiare la firma dell'esecutore dei criteri.
 */
const contesto = new AsyncLocalStorage<string>()

/** Esegue `fn` con il workspace dato: le righe di registro scritte dentro lo portano. */
export function conWorkspaceDiLog<T>(workspace: string, fn: () => T): T {
  return contesto.run(workspace, fn)
}

export function workspaceDiLog(): string | undefined {
  return contesto.getStore()
}

/** Il segno da mettere nella riga di registro (vuoto se il workspace non si sa). */
export function segnoDiLog(workspace: string | undefined = workspaceDiLog()): string {
  return workspace === undefined ? '' : segnoWorkspace(workspace)
}
