import { vi } from 'vitest'

/**
 * **Aspettare una condizione, e dirlo se non arriva** (0.85.1, suite veloce).
 *
 * Prima i test aspettavano con un ciclo muto («N volte, un sonnellino, poi
 * avanti»): finito il giro senza la condizione, il test proseguiva come se
 * niente fosse e falliva più in là con un messaggio che non diceva perché.
 * Qui si controlla spesso (ogni 5 ms di serie) e, scaduto il tempo, il test
 * fallisce subito dicendo che cosa aspettava.
 *
 * Il tempo di serie (10 s) conta solo quando la condizione non arriva: chi
 * arriva prima non aspetta un millisecondo di più.
 */
export async function attendi(
  condizione: () => boolean | Promise<boolean>,
  opzioni: { timeout?: number; ogni?: number; cosa?: string } = {}
): Promise<void> {
  await vi.waitFor(async () => {
    if (!(await condizione())) throw new Error(`condizione mai avverata${opzioni.cosa !== undefined ? `: ${opzioni.cosa}` : ''}`)
  }, { timeout: opzioni.timeout ?? 10_000, interval: opzioni.ogni ?? 5 })
}
