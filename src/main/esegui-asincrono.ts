import { execFile } from 'node:child_process'

/**
 * `execFile` come promessa, con le stesse regole della versione sincrona: tetto di
 * tempo (`timeout`, il processo viene terminato), e un errore se esce con un
 * codice diverso da zero o non parte. Non blocca il processo principale: le
 * chiamate sincrone tenevano fermo tutto, `/api/aggiornamento` compreso, per
 * tutta la durata del comando.
 *
 * Sull'errore restano `stdout` e `stderr` (servono a `motivoCompilazione`).
 */
export function eseguiAsincrono(
  file: string,
  args: readonly string[],
  opzioni: { timeout: number; windowsHide?: boolean }
): Promise<string> {
  return new Promise((risolvi, rifiuta) => {
    try {
      execFile(file, [...args], { encoding: 'utf8', windowsHide: opzioni.windowsHide ?? true, timeout: opzioni.timeout }, (err, stdout, stderr) => {
        if (err !== null) {
          Object.assign(err, { stdout, stderr })
          rifiuta(err)
          return
        }
        risolvi(String(stdout))
      })
    } catch (err) {
      rifiuta(err)
    }
  })
}
